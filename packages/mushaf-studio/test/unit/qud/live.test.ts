// Answers recorded from the live aligner (aligner.qud.dev, 2026-10-08), replayed through the
// client: Al-Ikhlas (112) by Abdul Hamid Ghraio from the catalogue, the same clip uploaded and
// aligned (it ran on the CPU: the warning and `_meta` came with it), its word timestamps, and the
// error bodies the API and its gateway sent. Trimmed only where noted in the fixture names.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseRecitationTimings} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {
  alignAudio,
  getChapterSegments,
  type QudChapterSegments,
  type QudProgress,
  type QudTimestampsResponse,
  realignSession,
  sessionTimestamps,
  splitSession,
  timingsFromCatalogue,
  timingsFromQud,
} from '../../../src/qud';
import type {StudioTimings} from '../../../src/types';

const read = (name: string): string => readFileSync(path.resolve(__dirname, '../../fixtures/qud', name), 'utf8');

const SLUG = 'abdul_hamid_ghraio_2025_yt';
const AUDIO_ID = '3076545b9d4849f6be0f340c232b804d';
const chapterBody = read('live-112-chapter-segments.json');
const alignStream = read('live-112-align-stream.txt');
const timestampsBody = read('live-112-timestamps.json');
const errors = JSON.parse(read('live-errors.json')) as Record<string, unknown>;
/** Cloudflare's 524 page, cut after its `<head>`. */
const gatewayPage = read('live-524.html');

/** A fetch that answers with the given responses in order and counts what it is sent. */
const replay = (...responses: Response[]) => {
  const sent: string[] = [];
  const fetch = (async (input: RequestInfo | URL) => {
    sent.push(String(input));
    const response = responses.shift();
    if (response === undefined) throw new Error(`unexpected request to ${String(input)}`);
    return response;
  }) as typeof globalThis.fetch;
  return {fetch, sent};
};

const answer = (body: string, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(body, {status, headers: {'content-type': 'application/json', ...headers}});

/** The recorded stream, delivered in chunks of `size` bytes (an odd size cuts inside Arabic letters). */
const stream = (size: number): Response => {
  const bytes = new TextEncoder().encode(alignStream);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
        controller.close();
      },
    }),
    {headers: {'content-type': 'text/event-stream'}},
  );
};

/** Every word of the timings, in ayah order (the conversion always writes them). */
const wordsOf = (timings: StudioTimings) => timings.ayat.flatMap((a) => a.words ?? []);

const wordIds = (timings: StudioTimings) => wordsOf(timings).map((w) => w.id);

describe('the live answers', () => {
  it('a catalogue chapter: 4 complete ayahs, word times made clip-relative from their segment', async () => {
    const {fetch} = replay(answer(chapterBody));
    const chapter = await getChapterSegments({slug: SLUG, chapter: 112}, {fetch});
    const timings = timingsFromCatalogue(chapter);
    expect(() => parseRecitationTimings(timings)).not.toThrow();
    expect(timings).toMatchObject({surah: 112, durationSeconds: 11.19, source: 'aligner.qud.dev'});
    expect(timings.audio).toBe(chapter.audio_url);
    expect(timings.ayat.map((a) => [a.ayah, a.complete, a.words?.length])).toEqual([
      [1, true, 5],
      [2, true, 3],
      [3, true, 5],
      [4, true, 6],
    ]);
    // Segment 2 starts at 2.655 and its first word 0.1 s into it.
    expect(timings.ayat[1]!.words?.[0]).toEqual({id: '112:2:1', start: 2.755, end: 3.635});
    expect(timings.alignment?.recitation).toMatchObject({slug: SLUG, chapter: 112, verseFrom: 1, verseTo: 4});
    expect(timings.alignment?.words[0]).toMatchObject({id: '112:1:1', text: 'قُلْ'});
  });

  it('the same clip aligned and timed: the stages as sent, then the catalogue’s ayahs and words', async () => {
    for (const size of [Number.POSITIVE_INFINITY, 7]) {
      const {fetch, sent} = replay(stream(size), answer(timestampsBody));
      const seen: QudProgress[] = [];
      const align = await alignAudio(new Blob(['mp3']), '112.mp3', {onProgress: (p) => seen.push(p)}, {fetch});
      expect(seen.map((p) => p.stage)).toEqual([
        'queued_gpu',
        'queued_cpu',
        'segmenting',
        'transcribing',
        'matching',
        'building',
      ]);
      expect(seen.at(-1)).toEqual({stage: 'building', step: 6, steps: 6});
      expect(align).toMatchObject({audio_id: AUDIO_ID, device: 'CPU', warning: expect.stringContaining('GPU quota')});
      expect(align.segments.map((s) => [s.ref_from, s.ref_to])).toEqual([
        ['112:1:1', '112:1:4'],
        ['112:2:1', '112:2:2'],
        ['112:3:1', '112:3:4'],
        ['112:4:1', '112:4:5'],
      ]);

      const timestamps = await sessionTimestamps(align.audio_id, {}, {fetch});
      expect(sent[1]).toMatch(new RegExp(`/sessions/${AUDIO_ID}/timestamps$`));
      const timings = timingsFromQud({align, timestamps});
      expect(() => parseRecitationTimings(timings)).not.toThrow();
      const catalogue = timingsFromCatalogue(JSON.parse(chapterBody) as QudChapterSegments);
      expect(timings.ayat).toHaveLength(catalogue.ayat.length);
      expect(wordIds(timings)).toEqual(wordIds(catalogue));
      // Two alignments of one clip agree to within a few tenths of a second, word by word.
      const reference = wordsOf(catalogue);
      for (const [i, word] of wordsOf(timings).entries())
        expect(Math.abs(word.start - reference[i]!.start)).toBeLessThan(0.3);
      expect(timings.alignment).toMatchObject({source: 'qud', audioId: AUDIO_ID, device: 'CPU'});
      // The session's answer carries no word text: it comes from each segment's matched_text, as
      // sent (its edition spells some words otherwise than the catalogue's: kept, not normalised).
      const texts = align.segments.flatMap((s) => s.matched_text!.split(' '));
      expect(timings.alignment?.words.map((w) => w.text)).toEqual(texts);
      expect(texts[3]).toBe('أَحَدٌ');
      expect(catalogue.alignment?.words[3]?.text).toBe('أَحَدٌ');
    }
  });

  it('keeps the timestamps answer verbatim: [location, start, end] triples and its audio_id', async () => {
    const {fetch} = replay(answer(timestampsBody));
    const timestamps: QudTimestampsResponse = await sessionTimestamps(AUDIO_ID, {}, {fetch});
    expect(timestamps).toEqual(JSON.parse(timestampsBody));
    expect(timestamps.segments[0]!.words![0]).toEqual(['112:1:1', 0.1, 0.46]);
  });
});

describe('the live errors', () => {
  it('a 404 for an expired session says to align again; one for the catalogue names the slug and chapter', async () => {
    const {fetch} = replay(
      answer(JSON.stringify(errors.session_not_found_404), 404),
      answer(JSON.stringify(errors.unknown_recitation_404), 404),
      answer(JSON.stringify(errors.unknown_chapter_404), 404),
    );
    const expired = await sessionTimestamps('0000000000000000000000000000dead', {}, {fetch}).catch((e: unknown) => e);
    expect(expired).toMatchObject({code: 'QUD_HTTP', details: {status: 404, code: 'session_not_found'}});
    expect((expired as Error).message).toMatch(/session_not_found: "Session not found or expired"\)\. A session/);
    expect((expired as Error).message).not.toContain('slug');
    for (const query of [
      {slug: 'no_such_reciter', chapter: 1},
      {slug: SLUG, chapter: 0},
    ]) {
      const error = await getChapterSegments(query, {fetch}).catch((e: unknown) => e);
      expect(error).toMatchObject({code: 'QUD_HTTP', details: {status: 404, code: 'not_found'}});
      expect((error as Error).message).toContain('Check the recitation slug and the chapter');
      expect((error as Error).message).not.toContain('session');
    }
  });

  it("a gateway timeout (Cloudflare's 524, JSON or HTML) is named, with when to retry", async () => {
    const {fetch} = replay(
      answer(JSON.stringify(errors.cloudflare_524_json), 524, {'retry-after': '120'}),
      new Response(gatewayPage, {status: 524, headers: {'content-type': 'text/html', 'retry-after': '120'}}),
    );
    const split = await splitSession(AUDIO_ID, {max_verses: 1}, {fetch}).catch((e: unknown) => e);
    expect(split).toMatchObject({code: 'QUD_HTTP', details: {status: 524, code: null}});
    expect((split as Error).message).toBe(
      `QUD POST /sessions/${AUDIO_ID}/split failed with HTTP 524 (a gateway error: "Error 524: A timeout occurred"). The aligner did not answer within the gateway's 120 s limit: it is busy, or stuck on this request. Try again in 120 s.`,
    );
    const url = await alignAudio(new Blob(['mp3']), '112.mp3', {}, {fetch}).catch((e: unknown) => e);
    expect((url as Error).message).toMatch(/HTTP 524 \(a gateway error: "qud\.dev \| 524: A timeout occurred"\)/);
  });
});

describe('requests the aligner does not refuse by itself', () => {
  it('splitSession sends no limit below 1 and no duration of 0 (max_verses: 0 held the service)', async () => {
    const {fetch, sent} = replay();
    for (const [request, field] of [
      [{max_verses: 0}, 'max_verses is 0'],
      [{max_verses: 1.5}, 'max_verses is 1.5'],
      [{max_words: -2}, 'max_words is -2'],
      [{max_duration: 0}, 'max_duration is 0'],
      [{max_duration: Number.NaN}, 'max_duration is NaN'],
    ] as const) {
      const error = await splitSession(AUDIO_ID, request, {fetch}).catch((e: unknown) => e);
      expect(error).toMatchObject({code: 'QUD_HTTP', details: {status: null, code: null}});
      expect((error as Error).message).toContain(`QUD POST /sessions/${AUDIO_ID}/split was not sent: ${field}`);
    }
    expect(sent).toEqual([]);
  });

  it('splitSession sends the limits as given, null and 30 included', async () => {
    const {fetch, sent} = replay(answer(JSON.stringify({audio_id: AUDIO_ID, segments: []})));
    const request = {max_verses: 1, max_words: null, max_duration: 30, require_stop_sign: false};
    await expect(splitSession(AUDIO_ID, request, {fetch})).resolves.toEqual({audio_id: AUDIO_ID, segments: []});
    expect(sent).toHaveLength(1);
  });

  it('realignSession sends no empty list and no boundary that does not end after it starts', async () => {
    const {fetch, sent} = replay();
    for (const [timestamps, field] of [
      [[], 'timestamps is'],
      [[{start: -0.1, end: 1}], 'timestamps[0].start is -0.1'],
      [
        [
          {start: 0.3, end: 2.7},
          {start: 2.7, end: 2.7},
        ],
        'timestamps[1].end is 2.7, and it must be a number of seconds after its start (2.7)',
      ],
    ] as const) {
      const error = await realignSession(AUDIO_ID, {timestamps}, {}, {fetch}).catch((e: unknown) => e);
      expect(error).toMatchObject({code: 'QUD_HTTP', details: {status: null}});
      expect((error as Error).message).toContain(
        `QUD POST /sessions/${AUDIO_ID}/realign/stream was not sent: ${field}`,
      );
    }
    expect(sent).toEqual([]);
  });
});

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseRecitationTimings} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {
  MARKER_HOLD_SECONDS,
  type QudAlignResponse,
  type QudChapterSegments,
  type QudSegment,
  type QudTimestampsResponse,
  timingsFromCatalogue,
  timingsFromQud,
} from '../../../src/qud';
import type {StudioTimings} from '../../../src/types';

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

// Frozen: the conversion must not touch its inputs.
const fixture = <T>(name: string): T =>
  deepFreeze(JSON.parse(readFileSync(path.resolve(__dirname, '../../fixtures/qud', name), 'utf8')) as T);

// Al-Fatihah aligned by the live API (CPU, Base). The recording has no basmalah segment, so the
// timings run from ayah 2 to ayah 7: six of the surah's seven ayahs.
const align = fixture<QudAlignResponse>('align-response.json');
const timestamps = fixture<QudTimestampsResponse>('timestamps-response.json');
const chapter = fixture<QudChapterSegments>('chapter-1-segments.json');

/** The `word`-th token of segment `segment`'s matched_text in the align fixture. */
const textOf = (segment: number, word: number): string => align.segments[segment]!.matched_text!.split(' ')[word]!;

/** The keys the format allows next to its own, which the converters write and `StudioTimings` does not name. */
const extra = (timings: StudioTimings) =>
  timings as StudioTimings & {readonly audio?: string; readonly durationSeconds?: number; readonly source?: string};

const ids = (words: readonly {readonly id: string}[] | undefined): string[] => (words ?? []).map((w) => w.id);

const segment = (
  overrides: Partial<QudSegment> & Pick<QudSegment, 'segment' | 'time_from' | 'time_to'>,
): QudSegment => ({
  ref_from: '',
  ref_to: '',
  confidence: 1,
  ...overrides,
});

describe('timingsFromQud', () => {
  const timings = timingsFromQud(
    {align, timestamps},
    {audio: 'mushaf-studio/fatiha/audio.mp3', model: 'Base', device: 'GPU', riwayah: 'hafs'},
  );

  it('makes valid recitation timings of one surah, the recorded ayahs in order', () => {
    expect(parseRecitationTimings(timings)).toBe(timings);
    expect(timings.version).toBe(1);
    expect(timings.surah).toBe(1);
    expect(timings.ayat.map((a) => a.ayah)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(timings.ayat.every((a) => a.complete === true)).toBe(true);
    expect(timings).toMatchObject({
      audio: 'mushaf-studio/fatiha/audio.mp3',
      durationSeconds: 27.808,
      source: 'aligner.qud.dev',
    });
  });

  it('makes word times recording-relative, rounded to the millisecond', () => {
    const ayah2 = timings.ayat[0]!;
    expect(ayah2.words!.slice(0, 4)).toEqual([
      {id: '1:2:1', start: 0.32, end: 0.89},
      {id: '1:2:2', start: 0.89, end: 1.51},
      {id: '1:2:3', start: 1.51, end: 1.94},
      {id: '1:2:4', start: 1.94, end: 3.17},
    ]);
    expect(ayah2.start).toBe(0.32);
    // 13.103 + 0.68 is 13.783000000000001 in floating point.
    expect(timings.ayat[4]!.words![0]).toEqual({id: '1:6:1', start: 13.103, end: 13.783});
  });

  it('holds each ayah-end marker MARKER_HOLD_SECONDS, or until the next ayah starts', () => {
    expect(timings.ayat.map((a) => a.words!.at(-1)!.id)).toEqual([
      '1:2:5',
      '1:3:3',
      '1:4:4',
      '1:5:5',
      '1:6:4',
      '1:7:10',
    ]);
    // Ayah 3 starts 0.32 s after ayah 2's last word: the marker yields to it.
    expect(timings.ayat[0]!.words!.at(-1)).toEqual({id: '1:2:5', start: 3.17, end: 3.49});
    expect(timings.ayat[0]!.end).toBe(3.49);
    // Nothing follows ayah 7: the full hold.
    const marker = timings.ayat[5]!.words!.at(-1)!;
    expect(marker).toEqual({id: '1:7:10', start: 27.69, end: 28.49});
    expect(marker.end - marker.start).toBeCloseTo(MARKER_HOLD_SECONDS, 9);
    expect(timings.ayat[5]!.end).toBe(28.49);
  });

  it('records the session in the alignment sidecar', () => {
    const sidecar = timings.alignment!;
    expect(sidecar).toMatchObject({version: 1, source: 'qud', audioId: align.audio_id, model: 'Base', riwayah: 'hafs'});
    // Where it actually ran: the answer's device wins over the one asked for.
    expect(sidecar.device).toBe('CPU');
    expect(sidecar.edits).toEqual([]);
    expect(sidecar.recitation).toBeUndefined();
    expect(sidecar.segments).toHaveLength(6);
    expect(sidecar.segments[0]).toEqual({
      segment: 1,
      timeFrom: 0.22,
      timeTo: 3.46,
      refFrom: '1:2:1',
      refTo: '1:2:4',
      confidence: 1,
      hasMissingWords: false,
      hasRepeatedWords: false,
      error: null,
      matchedText: align.segments[0]!.matched_text,
      kind: 'quran',
    });
    expect(sidecar.segments[5]!.confidence).toBe(0.997);
  });

  it('names every heard word by its text from matched_text, in audio order', () => {
    const words = timings.alignment!.words;
    expect(words).toHaveLength(25);
    expect(words[0]).toEqual({id: '1:2:1', text: textOf(0, 0), segment: 1, start: 0.32, end: 0.89});
    expect(words.at(-1)).toEqual({id: '1:7:9', text: textOf(5, 8), segment: 6, start: 22.63, end: 27.69});
    expect(words.map((w) => w.start)).toEqual([...words.map((w) => w.start)].sort((x, y) => x - y));
    // The markers are not heard words.
    expect(words.some((w) => w.id === '1:2:5')).toBe(false);
  });

  it('round-trips through JSON: no undefined keys', () => {
    expect(JSON.parse(JSON.stringify(timings))).toEqual(timings);
    const bare = timingsFromQud({align, timestamps});
    expect(Object.keys(bare)).toEqual(['version', 'surah', 'durationSeconds', 'source', 'ayat', 'alignment']);
    expect(Object.keys(bare.alignment!)).toEqual([
      'version',
      'source',
      'audioId',
      'device',
      'segments',
      'words',
      'edits',
    ]);
  });

  it('is deterministic', () => {
    expect(timingsFromQud({align, timestamps}, {model: 'Base'})).toEqual(
      timingsFromQud({align, timestamps}, {model: 'Base'}),
    );
  });

  it('keeps a basmala and an unmatched segment in the sidecar, repeats in audio order, and a partial ayah', () => {
    const synthetic: QudAlignResponse = {
      audio_id: 'abc',
      segments: [
        segment({segment: 1, time_from: 0, time_to: 4, kind: 'special', special_type: 'Basmala', confidence: 0.95}),
        segment({
          segment: 2,
          time_from: 4.5,
          time_to: 8,
          ref_from: '1:3:1',
          ref_to: '1:3:2',
          matched_text: 'ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
          has_repeated_words: true,
          confidence: 0.7,
        }),
        segment({segment: 3, time_from: 8.5, time_to: 9, error: 'No match found', confidence: 0}),
        segment({segment: 4, time_from: 9.2, time_to: 12, ref_from: '1:4:1', ref_to: '1:4:3', has_missing_words: true}),
      ],
    };
    const words: QudTimestampsResponse = {
      audio_id: 'abc',
      segments: [
        {segment: 1, words: []},
        // Objects with their text, as the newer answers write them; 1:3:1 is said twice.
        {
          segment: 2,
          words: [
            {word: 'ٱلرَّحْمَـٰنِ', location: '1:3:1', start: 0, end: 1},
            {word: 'ٱلرَّحْمَـٰنِ', location: '1:3:1', start: 1.2, end: 2},
            {word: 'ٱلرَّحِيمِ', location: '1:3:2', start: 2, end: 3},
          ],
        },
        {segment: 3},
        // Word 2 was not heard.
        {
          segment: 4,
          words: [
            ['1:4:1', 0, 0.5],
            ['1:4:3', 1, 2],
          ],
        },
      ],
    };
    const result = timingsFromQud({align: synthetic, timestamps: words});
    expect(result.ayat).toEqual([
      {
        ayah: 3,
        start: 4.5,
        end: 8.3,
        complete: true,
        words: [
          {id: '1:3:1', start: 4.5, end: 5.5},
          {id: '1:3:1', start: 5.7, end: 6.5},
          {id: '1:3:2', start: 6.5, end: 7.5},
          {id: '1:3:3', start: 7.5, end: 8.3},
        ],
      },
      {
        ayah: 4,
        start: 9.2,
        end: 11.2,
        complete: false,
        words: [
          {id: '1:4:1', start: 9.2, end: 9.7},
          {id: '1:4:3', start: 10.2, end: 11.2},
        ],
      },
    ]);
    expect(extra(result).durationSeconds).toBe(12);
    const [basmala, ayah3, unmatched, ayah4] = result.alignment!.segments;
    expect(basmala).toEqual({
      segment: 1,
      timeFrom: 0,
      timeTo: 4,
      refFrom: null,
      refTo: null,
      confidence: 0.95,
      hasMissingWords: false,
      hasRepeatedWords: false,
      error: null,
      matchedText: null,
      kind: 'special',
    });
    expect(ayah3).toMatchObject({hasRepeatedWords: true, confidence: 0.7});
    expect(unmatched).toMatchObject({refFrom: null, error: 'No match found', confidence: 0});
    expect(ayah4).toMatchObject({hasMissingWords: true, matchedText: null});
    expect(result.alignment!.words.map((w) => [w.id, w.text, w.segment])).toEqual([
      ['1:3:1', 'ٱلرَّحْمَـٰنِ', 2],
      ['1:3:1', 'ٱلرَّحْمَـٰنِ', 2],
      ['1:3:2', 'ٱلرَّحِيمِ', 2],
      // Triples carry no text and the segment has no matched_text: the location stands in.
      ['1:4:1', '1:4:1', 4],
      ['1:4:3', '1:4:3', 4],
    ]);
  });

  it('names words by location when matched_text does not split into as many words', () => {
    const one: QudAlignResponse = {
      audio_id: 'abc',
      segments: [
        segment({segment: 1, time_from: 0, time_to: 3, ref_from: '1:3:1', ref_to: '1:3:2', matched_text: 'ٱلرَّحْمَـٰنِ'}),
      ],
    };
    const result = timingsFromQud({
      align: one,
      timestamps: {
        segments: [
          {
            segment: 1,
            words: [
              ['1:3:1', 0, 1],
              ['1:3:2', 1, 2],
            ],
          },
        ],
      },
    });
    expect(result.alignment!.words.map((w) => w.text)).toEqual(['1:3:1', '1:3:2']);
  });

  describe('fromAyah and toAyah', () => {
    it('keep the ayahs in the range; the last marker still yields to the next recited ayah', () => {
      const trimmed = timingsFromQud({align, timestamps}, {fromAyah: 3, toAyah: 5});
      expect(trimmed.ayat.map((a) => a.ayah)).toEqual([3, 4, 5]);
      // Ayah 5 ends at 12.68; ayah 6, not kept, starts at 13.103.
      expect(trimmed.ayat.at(-1)!.words!.at(-1)).toEqual({id: '1:5:5', start: 12.68, end: 13.103});
      expect(extra(trimmed).durationSeconds).toBe(13.103);
      // The sidecar keeps the whole session, so that it can be split or realigned again.
      expect(trimmed.alignment!.segments).toHaveLength(6);
      expect(trimmed.alignment!.words).toHaveLength(25);
    });

    it('fromAyah alone keeps the recording duration; one ayah is the boundary', () => {
      const from = timingsFromQud({align, timestamps}, {fromAyah: 7});
      expect(from.ayat.map((a) => a.ayah)).toEqual([7]);
      expect(extra(from).durationSeconds).toBe(27.808);
      expect(timingsFromQud({align, timestamps}, {toAyah: 2}).ayat.map((a) => a.ayah)).toEqual([2]);
    });

    it('a range with no recited ayah is QUD_NO_MATCH', () => {
      expect(() => timingsFromQud({align, timestamps}, {fromAyah: 8})).toThrow(
        expect.objectContaining({
          code: 'QUD_NO_MATCH',
          details: expect.objectContaining({recited: [2, 3, 4, 5, 6, 7]}),
        }),
      );
      expect(() => timingsFromQud({align, timestamps}, {toAyah: 1})).toThrow(/no words of ayahs 1-1 of surah 1/);
      expect(() => timingsFromQud({align, timestamps}, {fromAyah: 5, toAyah: 4})).toThrow(
        expect.objectContaining({code: 'QUD_NO_MATCH'}),
      );
    });
  });

  describe('errors', () => {
    it('no word matched at all is QUD_NO_MATCH', () => {
      const empty: QudTimestampsResponse = {
        segments: timestamps.segments.map((s) => ({segment: s.segment, words: []})),
      };
      expect(() => timingsFromQud({align, timestamps: empty})).toThrow(expect.objectContaining({code: 'QUD_NO_MATCH'}));
      expect(() => timingsFromQud({align, timestamps: {segments: []}})).toThrow(/matched no words/);
    });

    it('words of two surahs are QUD_NO_MATCH', () => {
      const two: QudTimestampsResponse = {
        segments: [
          {segment: 1, words: [['1:7:9', 0, 1]]},
          {segment: 2, words: [['2:1:1', 0, 1]]},
        ],
      };
      expect(() => timingsFromQud({align, timestamps: two})).toThrow(
        expect.objectContaining({code: 'QUD_NO_MATCH', details: {surahs: [1, 2]}}),
      );
    });

    it('an answer that does not hold together is QUD_BAD_RESPONSE', () => {
      const bad = (value: QudTimestampsResponse, message: RegExp) => {
        expect(() => timingsFromQud({align, timestamps: value})).toThrow(message);
        expect(() => timingsFromQud({align, timestamps: value})).toThrow(
          expect.objectContaining({code: 'QUD_BAD_RESPONSE'}),
        );
      };
      bad({segments: [{segment: 99, words: [['1:2:1', 0, 1]]}]}, /segment the alignment does not have/);
      bad({segments: [{segment: 1, words: [['1:2', 0, 1]]}]}, /not "surah:ayah:word"/);
      bad({segments: [{segment: 1, words: [['1:2:0', 0, 1]]}]}, /not "surah:ayah:word"/);
      bad({audio_id: 'another', segments: timestamps.segments}, /belong to session another/);
      // The package's own validation, wrapped: an end before its start.
      bad({segments: [{segment: 1, words: [['1:2:1', 2, 1]]}]}, /BAD_RECITATION_TIMINGS|is before start/);
    });
  });
});

describe('timingsFromCatalogue', () => {
  const timings = timingsFromCatalogue(chapter);

  it('makes the timings of the clip, times already clip-relative', () => {
    expect(parseRecitationTimings(timings)).toBe(timings);
    expect(timings.surah).toBe(1);
    expect(timings.ayat.map((a) => a.ayah)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(timings.ayat.every((a) => a.complete === true)).toBe(true);
    expect(extra(timings).audio).toBe(chapter.audio_url);
    expect(extra(timings).durationSeconds).toBe(27.586);
    // 0.201 + 0.13: words are relative to their segment.
    expect(timings.ayat[0]!.words![0]).toEqual({id: '1:2:1', start: 0.331, end: 0.901});
    expect(ids(timings.ayat[5]!.words)).toEqual([
      '1:7:1',
      '1:7:2',
      '1:7:3',
      '1:7:4',
      '1:7:5',
      '1:7:6',
      '1:7:7',
      '1:7:8',
      '1:7:9',
      '1:7:10',
    ]);
  });

  it('records where the clip came from, and each word with its own text', () => {
    const sidecar = timings.alignment!;
    expect(sidecar.source).toBe('qud-catalogue');
    expect(sidecar.recitation).toEqual({
      slug: 'abdul_hamid_ghraio_2025_yt',
      chapter: 1,
      verseFrom: 1,
      verseTo: 7,
      clipStart: 2.909,
      audioUrl: chapter.audio_url,
    });
    expect('audioId' in sidecar).toBe(false);
    expect(sidecar.segments).toHaveLength(6);
    expect(sidecar.words).toHaveLength(25);
    expect(sidecar.words[3]).toEqual({
      id: '1:2:4',
      text: chapter.segments[0]!.words![3]!.word,
      segment: 1,
      start: 1.941,
      end: 3.391,
    });
  });

  it('records another audio path when given', () => {
    expect(extra(timingsFromCatalogue(chapter, {audio: 'mushaf-studio/fatiha/audio.mp3'})).audio).toBe(
      'mushaf-studio/fatiha/audio.mp3',
    );
  });

  it('a chapter without words is QUD_NO_MATCH', () => {
    const bare = {...chapter, segments: chapter.segments.map(({words: _, ...rest}) => rest)};
    expect(() => timingsFromCatalogue(bare)).toThrow(expect.objectContaining({code: 'QUD_NO_MATCH'}));
  });
});

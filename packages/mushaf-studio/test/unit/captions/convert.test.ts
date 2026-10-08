import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {type Caption, fromCaptions, toCaptions} from '../../../src/captions';
import {isMushafStudioError} from '../../../src/errors';
import {
  type QudAlignResponse,
  type QudChapterSegments,
  type QudTimestampsResponse,
  timingsFromCatalogue,
  timingsFromQud,
} from '../../../src/qud';
import type {StudioTimings, StudioTimingsV1} from '../../../src/types';

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(path.resolve(__dirname, '../../fixtures/qud', name), 'utf8')) as T;

const align = fixture<QudAlignResponse>('align-response.json');
const timestamps = fixture<QudTimestampsResponse>('timestamps-response.json');
const chapter = fixture<QudChapterSegments>('chapter-1-segments.json');

// Frozen: neither direction may touch its input. Al-Fatihah, ayahs 2-7: 25 heard words and an
// ayah-end marker after each of the six ayahs.
/** The aligner's timings are of one surah: version 1, narrowed. */
const v1 = (timings: StudioTimings): StudioTimingsV1 => {
  if (timings.version !== 1) throw new Error(`expected version 1 timings, got version ${timings.version}`);
  return timings;
};
const qud = deepFreeze(v1(timingsFromQud({align, timestamps}, {audio: 'mushaf-studio/fatiha/audio.mp3'})));
const catalogue = deepFreeze(v1(timingsFromCatalogue(chapter)));

/** The `word`-th token of segment `segment`'s matched_text in the align fixture. */
const textOf = (segment: number, word: number): string => align.segments[segment]!.matched_text!.split(' ')[word]!;

const withoutSidecar = (timings: StudioTimingsV1): StudioTimingsV1 => {
  const {alignment: _, ...rest} = timings;
  return deepFreeze(rest);
};

/** `timings` with the words of `ayah` taken out, as a file timed by ayah would have it. */
const withoutWords = (timings: StudioTimingsV1, ayah: number): StudioTimingsV1 =>
  deepFreeze({
    ...timings,
    ayat: timings.ayat.map((a) => {
      if (a.ayah !== ayah) return a;
      const {words: _, ...rest} = a;
      return rest;
    }),
  });

/** The texts `toCaptions()` makes of these words: every one after the first starts with a space. */
const spaced = (words: readonly string[]): string[] => words.map((word, i) => (i === 0 ? word : ` ${word}`));

/** A caption's word, without the space that starts every caption but the first. */
const word = (caption: Caption): string => caption.text.trimStart();

/** The manual sidecar the panel's first edit starts on a file that had none: no segments, no words. */
const withManualSidecar = (timings: StudioTimingsV1): StudioTimingsV1 =>
  deepFreeze({
    ...withoutSidecar(timings),
    alignment: {
      version: 1,
      source: 'manual',
      segments: [],
      words: [],
      edits: [{kind: 'nudge', at: '2026-10-03T12:00:00.000Z', note: '1:2:1 start 0.32 -> 0.3'}],
    },
  });

const replace = (captions: readonly Caption[], index: number, change: Partial<Caption>): Caption[] =>
  captions.map((c, i) => (i === index ? {...c, ...change} : c));

const thrown = (run: () => unknown): {code: string; message: string; details: Record<string, unknown>} => {
  try {
    run();
  } catch (error) {
    if (isMushafStudioError(error)) return error as never;
    throw error;
  }
  throw new Error('expected a MushafStudioError');
};

describe('toCaptions', () => {
  const captions = toCaptions(qud);

  it('makes one caption per heard word, in audio order, in whole milliseconds', () => {
    expect(captions).toHaveLength(25);
    expect(captions[0]).toEqual({text: textOf(0, 0), startMs: 320, endMs: 890, timestampMs: 320, confidence: 1});
    // 13.103 + 0.68 is 13.783000000000001 in floating point.
    expect(captions[16 - 3]).toEqual({
      text: ` ${textOf(4, 0)}`,
      startMs: 13_103,
      endMs: 13_783,
      timestampMs: 13_103,
      confidence: 1,
    });
    const starts = captions.map((c) => c.startMs);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
    expect(captions.every((c) => Number.isInteger(c.startMs) && Number.isInteger(c.endMs))).toBe(true);
    expect(captions.every((c) => c.timestampMs === c.startMs)).toBe(true);
  });

  it("names each word by the sidecar's Uthmani text", () => {
    expect(captions.map((c) => c.text)).toEqual(spaced(qud.alignment!.words.map((w) => w.text)));
    expect(captions.at(-1)!.text).toBe(` ${textOf(5, 8)}`);
    const fromCatalogue = toCaptions(catalogue);
    expect(fromCatalogue).toHaveLength(25);
    expect(fromCatalogue[3]).toEqual({
      text: ` ${chapter.segments[0]!.words![3]!.word}`,
      startMs: 1941,
      endMs: 3391,
      timestampMs: 1941,
      confidence: 1,
    });
  });

  it("gives each word its segment's confidence", () => {
    // Segments 1-5 (ayahs 2-6, 16 words) at 1, segment 6 (ayah 7, 9 words) at 0.997.
    expect(captions.map((c) => c.confidence)).toEqual([...Array(16).fill(1), ...Array(9).fill(0.997)]);
  });

  it('leaves the ayah-end markers out unless asked, then writes them as ۝ and the ayah number', () => {
    expect(captions.some((c) => word(c).startsWith('۝'))).toBe(false);
    const all = toCaptions(qud, {markers: true});
    expect(all).toHaveLength(31);
    expect(all.filter((c) => word(c).startsWith('۝')).map(word)).toEqual(['۝٢', '۝٣', '۝٤', '۝٥', '۝٦', '۝٧']);
    // Right after its ayah's last word, held until the next ayah starts or MARKER_HOLD_SECONDS.
    expect(all[4]).toEqual({text: ' ۝٢', startMs: 3170, endMs: 3490, timestampMs: 3170, confidence: null});
    expect(all.at(-1)).toEqual({text: ' ۝٧', startMs: 27_690, endMs: 28_490, timestampMs: 27_690, confidence: null});
    expect(all.filter((c) => !word(c).startsWith('۝'))).toEqual(captions);
    expect(toCaptions(qud, {markers: false})).toEqual(captions);
  });

  it('without a sidecar: no word is a marker, and a word is named by textOf, else by its id', () => {
    const bare = withoutSidecar(qud);
    const plain = toCaptions(bare);
    expect(plain).toHaveLength(31);
    expect(plain.every((c) => c.confidence === null)).toBe(true);
    expect(plain.slice(0, 5).map((c) => c.text)).toEqual(spaced(['1:2:1', '1:2:2', '1:2:3', '1:2:4', '1:2:5']));
    const named = toCaptions(bare, {textOf: (id) => (id === '1:2:2' ? 'لِلَّهِ' : null)});
    expect(named.slice(0, 3).map((c) => c.text)).toEqual(spaced(['1:2:1', 'لِلَّهِ', '1:2:3']));
    // The sidecar's text wins over textOf.
    expect(toCaptions(qud, {textOf: () => 'x'})[0]!.text).toBe(textOf(0, 0));
  });

  it('a sidecar without words (the manual one a first edit starts) names no marker: no caption is lost', () => {
    const manual = withManualSidecar(qud);
    const bare = toCaptions(withoutSidecar(qud));
    expect(toCaptions(manual)).toHaveLength(31);
    expect(toCaptions(manual)).toEqual(bare);
    expect(toCaptions(manual, {markers: true})).toEqual(bare);
    for (const markers of [false, true]) {
      expect(fromCaptions(toCaptions(manual, {markers}), manual)).toEqual(manual);
    }
    const nudged = fromCaptions(replace(toCaptions(manual), 0, {startMs: 300}), manual);
    expect(nudged.ayat[0]!.words![0]).toEqual({id: '1:2:1', start: 0.3, end: 0.89});
    expect(nudged.alignment).toBe(manual.alignment);
    expect(thrown(() => fromCaptions([], manual))).toMatchObject({
      code: 'BAD_TIMING_EDIT',
      details: {captions: 0, expected: 31, expectedWithMarkers: 31},
    });
  });

  it('a marker is only the last word of a complete ayah: another word the sidecar lacks is still a word', () => {
    // The sidecar lost 1:2:2 (the second word of ayah 2); it is no marker, and keeps its caption.
    const lost = deepFreeze({
      ...qud,
      alignment: {...qud.alignment!, words: qud.alignment!.words.filter((w) => w.id !== '1:2:2')},
    });
    const captions = toCaptions(lost);
    expect(captions).toHaveLength(25);
    expect(captions[1]).toEqual({text: ' 1:2:2', startMs: 890, endMs: 1510, timestampMs: 890, confidence: null});
    expect(toCaptions(lost, {markers: true}).filter((c) => word(c).startsWith('۝'))).toHaveLength(6);
    // The last word of an ayah that is not complete is no marker either.
    const incomplete = deepFreeze({
      ...lost,
      ayat: lost.ayat.map((a) => (a.ayah === 2 ? {...a, complete: false} : a)),
    });
    expect(toCaptions(incomplete)).toHaveLength(26);
    expect(toCaptions(incomplete)[4]!.text).toBe(' 1:2:5');
  });

  it("starts every caption after the first with a space, so Remotion's TikTok-style pages split at words", () => {
    for (const markers of [false, true]) {
      const captions = toCaptions(qud, {markers});
      expect(captions[0]!.text).toBe(textOf(0, 0));
      expect(captions.slice(1).every((c) => /^ \S/.test(c.text))).toBe(true);
      // createTikTokStyleCaptions() joins the texts as they are.
      expect(captions.map((c) => c.text).join('')).toBe(captions.map(word).join(' '));
    }
  });

  it('makes an ayah without words one caption over its span, inventing no word', () => {
    const ayah3 = qud.ayat[1]!;
    const timed = withoutWords(qud, 3);
    const result = toCaptions(timed);
    expect(result).toHaveLength(25 - 2 + 1);
    expect(result[4]).toEqual({
      text: ' 1:3',
      startMs: 3490,
      endMs: toMs(ayah3.end),
      timestampMs: 3490,
      confidence: null,
    });
    expect(result[5]!.text).toBe(` ${textOf(2, 0)}`);
    // Markers or not, still one caption.
    expect(toCaptions(timed, {markers: true}).filter((c) => c.text === ' 1:3')).toHaveLength(1);
    expect(toCaptions(timed, {markers: true})).toHaveLength(31 - 3 + 1);
    // An empty `words` is no words too.
    const empty = deepFreeze({...qud, ayat: qud.ayat.map((a) => (a.ayah === 3 ? {...a, words: []} : a))});
    expect(toCaptions(empty)[4]!.text).toBe(' 1:3');
  });

  it('matches a repeated word to its sidecar occurrence, in the order it was said', () => {
    const repeated = deepFreeze(
      timingsFromQud({
        align: {
          audio_id: 'abc',
          segments: [
            {segment: 1, time_from: 0, time_to: 2, ref_from: '1:3:1', ref_to: '1:3:1', confidence: 0.6},
            {segment: 2, time_from: 2, time_to: 5, ref_from: '1:3:1', ref_to: '1:3:2', confidence: 0.9},
          ],
        },
        timestamps: {
          segments: [
            {segment: 1, words: [{word: 'first', location: '1:3:1', start: 0, end: 1}]},
            {
              segment: 2,
              words: [
                {word: 'second', location: '1:3:1', start: 0, end: 1},
                {word: 'ٱلرَّحِيمِ', location: '1:3:2', start: 1, end: 2},
              ],
            },
          ],
        },
      }),
    );
    expect(toCaptions(repeated).map((c) => [c.text, c.startMs, c.confidence])).toEqual([
      ['first', 0, 0.6],
      [' second', 2000, 0.9],
      [' ٱلرَّحِيمِ', 3000, 0.9],
    ]);
    expect(fromCaptions(toCaptions(repeated), repeated)).toEqual(repeated);
    // An occurrence the sidecar does not have takes the word's text, and no confidence.
    const once = deepFreeze({
      ...repeated,
      alignment: {...repeated.alignment!, words: repeated.alignment!.words.slice(1)},
    });
    expect(toCaptions(once).map((c) => [c.text, c.confidence])).toEqual([
      ['second', 0.9],
      [' second', null],
      [' ٱلرَّحِيمِ', 0.9],
    ]);
  });

  it('is empty-safe on one ayah of one word', () => {
    const one: StudioTimings = deepFreeze({
      version: 1,
      surah: 112,
      ayat: [{ayah: 1, start: 0.5, end: 1.25, words: [{id: '112:1:1', start: 0.5, end: 1.25}]}],
    });
    expect(toCaptions(one)).toEqual([{text: '112:1:1', startMs: 500, endMs: 1250, timestampMs: 500, confidence: null}]);
    expect(fromCaptions(toCaptions(one), one)).toEqual(one);
  });
});

const toMs = (seconds: number): number => Math.round(seconds * 1000);

describe('fromCaptions', () => {
  it('round-trips: the captions toCaptions made give the timings back, key for key', () => {
    const cases: StudioTimings[] = [
      qud,
      catalogue,
      withoutSidecar(qud),
      withoutWords(qud, 3),
      // The sidecar keeps the whole session; the timings only ayahs 3-5.
      deepFreeze(timingsFromQud({align, timestamps}, {fromAyah: 3, toAyah: 5})),
    ];
    for (const timings of cases) {
      for (const markers of [false, true]) {
        const back = fromCaptions(toCaptions(timings, {markers}), timings);
        expect(back).toEqual(timings);
        expect(JSON.stringify(back)).toBe(JSON.stringify(timings));
      }
    }
  });

  it('keeps times below the millisecond when their caption is untouched', () => {
    const fine = deepFreeze({
      ...withoutSidecar(qud),
      ayat: [{ayah: 2, start: 0.3204, end: 0.8896, words: [{id: '1:2:1', start: 0.3204, end: 0.8896}]}],
    });
    expect(fromCaptions(toCaptions(fine), fine)).toEqual(fine);
  });

  it('ignores the text: the ids come from the timings', () => {
    const edited = toCaptions(qud).map((c) => ({...c, text: 'edited'}));
    expect(fromCaptions(edited, qud)).toEqual(qud);
  });

  it('a nudge moves that word here and in the sidecar, and the ayah spans its words again', () => {
    const captions = toCaptions(qud);
    // Caption 4 is 1:3:1, the first word of ayah 3 (3.49-4.56).
    expect(captions[4]!.startMs).toBe(3490);
    const result = fromCaptions(replace(captions, 4, {startMs: 3400}), qud);
    const ayah3 = result.ayat[1]!;
    expect(ayah3.words![0]).toEqual({id: '1:3:1', start: 3.4, end: 4.56});
    expect(ayah3.words!.slice(1)).toEqual(qud.ayat[1]!.words!.slice(1));
    expect(ayah3.start).toBe(3.4);
    expect(ayah3.end).toBe(qud.ayat[1]!.end);
    expect(result.alignment!.words[4]).toEqual({...qud.alignment!.words[4]!, start: 3.4, end: 4.56});
    // Nothing else moved, and nothing is logged: the panel decides.
    expect(result.ayat.filter((_, i) => i !== 1)).toEqual(qud.ayat.filter((_, i) => i !== 1));
    expect(result.alignment!.words.filter((_, i) => i !== 4)).toEqual(qud.alignment!.words.filter((_, i) => i !== 4));
    expect(result.alignment!.edits).toEqual([]);
    expect(result.alignment!.segments).toBe(qud.alignment!.segments);
    expect(result).toMatchObject({audio: 'mushaf-studio/fatiha/audio.mp3', source: 'aligner.qud.dev'});
    expect(Object.keys(result)).toEqual(Object.keys(qud));
  });

  it('a marker left out follows the word before it', () => {
    const captions = toCaptions(qud);
    // The last word of ayah 7 (22.63-27.69); its marker holds to 28.49.
    const later = fromCaptions(replace(captions, 24, {endMs: 28_800}), qud).ayat[5]!;
    expect(later.words!.slice(-2)).toEqual([
      {id: '1:7:9', start: 22.63, end: 28.8},
      {id: '1:7:10', start: 28.8, end: 28.8},
    ]);
    expect(later.end).toBe(28.8);
    const sooner = fromCaptions(replace(captions, 24, {endMs: 27_000}), qud).ayat[5]!;
    expect(sooner.words!.at(-1)).toEqual({id: '1:7:10', start: 27, end: 28.49});
    expect(sooner.end).toBe(28.49);
  });

  it('a marker caption moves the marker alone', () => {
    const captions = toCaptions(qud, {markers: true});
    expect(captions.at(-1)!.text).toBe(' ۝٧');
    const result = fromCaptions(replace(captions, captions.length - 1, {endMs: 29_000}), qud);
    expect(result.ayat[5]!.words!.at(-1)).toEqual({id: '1:7:10', start: 27.69, end: 29});
    expect(result.ayat[5]!.end).toBe(29);
    expect(result.alignment).toBe(qud.alignment);
  });

  it("the caption of an ayah without words is the ayah's span", () => {
    const timed = withoutWords(qud, 3);
    const result = fromCaptions(replace(toCaptions(timed), 4, {startMs: 3500, endMs: 6000}), timed);
    expect(result.ayat[1]).toEqual({ayah: 3, start: 3.5, end: 6, complete: true});
  });

  it('a count that toCaptions() does not make is BAD_TIMING_EDIT, with both counts', () => {
    const error = thrown(() => fromCaptions(toCaptions(qud).slice(1), qud));
    expect(error.code).toBe('BAD_TIMING_EDIT');
    expect(error.details).toEqual({captions: 24, expected: 25, expectedWithMarkers: 31});
    expect(error.message).toMatch(/got 24 captions, but the timings make 25 \(31 with the ayah-end markers\)/);
    expect(() => fromCaptions([], qud)).toThrow(expect.objectContaining({code: 'BAD_TIMING_EDIT'}));
  });

  it('a caption out of audio order is BAD_TIMING_EDIT naming it', () => {
    const captions = toCaptions(qud);
    const error = thrown(() => fromCaptions(replace(captions, 5, {startMs: 3000}), qud));
    expect(error.code).toBe('BAD_TIMING_EDIT');
    expect(error.details).toEqual({index: 5});
    expect(error.message).toMatch(/^Caption 5 .* starts at 3000 ms, before caption 4 \(3490 ms\)/);
    // The same start as the one before is in order.
    expect(() => fromCaptions(replace(captions, 5, {startMs: 3490}), qud)).not.toThrow();
  });

  it('a caption that ends before it starts, or starts before 0, is BAD_TIMING_EDIT', () => {
    const captions = toCaptions(qud);
    expect(thrown(() => fromCaptions(replace(captions, 3, {endMs: 1000}), qud))).toMatchObject({
      code: 'BAD_TIMING_EDIT',
      details: {index: 3},
      message: expect.stringMatching(/ends at 1000, before its start \(1940\)/),
    });
    expect(thrown(() => fromCaptions(replace(captions, 0, {startMs: -1}), qud))).toMatchObject({
      code: 'BAD_TIMING_EDIT',
      details: {index: 0},
      message: expect.stringMatching(/starts at -1: expected milliseconds, 0 or more/),
    });
  });

  it('a time that is not a finite number is BAD_TIMING_EDIT saying so, not "before its start"', () => {
    const captions = toCaptions(qud);
    for (const [change, said] of [
      [{startMs: Number.NaN}, /starts at NaN: expected a finite number of milliseconds/],
      [{startMs: Number.POSITIVE_INFINITY}, /starts at Infinity: expected a finite number/],
      [{endMs: Number.NaN}, /ends at NaN: expected a finite number of milliseconds/],
      [{endMs: Number.POSITIVE_INFINITY}, /ends at Infinity: expected a finite number/],
    ] as const) {
      const error = thrown(() => fromCaptions(replace(captions, 2, change), qud));
      expect(error).toMatchObject({code: 'BAD_TIMING_EDIT', details: {index: 2}});
      expect(error.message).toMatch(said);
      expect(error.message).not.toMatch(/before its start/);
    }
  });
});

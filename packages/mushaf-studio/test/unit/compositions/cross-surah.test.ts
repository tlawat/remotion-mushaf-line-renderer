// Timings across surahs (RecitationTimings version 2): the end of Al-Falaq and the start of An-Nas
// through the three compositions' resolvers, with the package's line resolvers mocked on lines
// shaped like page 604; and the texts that name such a passage (the title's, the chapters', the
// description's), its captions, its clip timeline and its header slots.

import {readFileSync} from 'node:fs';
import type {MushafLineData} from '@tlawat/remotion-mushaf-line';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {FALAQ_NAS_LINES, FALAQ_NAS_RANGES, falaqNas, falaqNasLinesFor, PAGE_604} from './helpers/falaq-nas';

const mocks = vi.hoisted(() => ({getMushafLines: vi.fn(), getMushafLinesForRanges: vi.fn()}));

vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  getMushafLines: (options: unknown) => mocks.getMushafLines(options),
  getMushafLinesForRanges: (ranges: unknown, options: unknown) => mocks.getMushafLinesForRanges(ranges, options),
}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  staticFile: (path: string) => `https://studio.test/static/${path}`,
}));

const {
  ayahKeysOf,
  crossesSurahs,
  defaultMushafRecitationProps,
  passageSpan,
  readTimings,
  resolveRecitation,
  timingsInRange,
  trimTimings,
} = await import('../../../src/compositions/recitation');
const {ayahAt, headerCount, withInnerHeaderSlots} = await import('../../../src/compositions/shared');
const {recitedPassageOf} = await import('../../../src/compositions/extras');
const {defaultMushafPageProps, inRanges, rangesOf, resolvePage} = await import('../../../src/page');
const {defaultMushafAyahTextProps, resolveAyahText} = await import('../../../src/unicode');
const {clipAyahKey, clipTimeline, scheduleForClips} = await import('../../../src/memorize');
const {ayahSpanText, surahSpanName} = await import('../../../src/overlay');
const {chaptersFromTimings, youtubeDescription} = await import('../../../src/export');
const {fromCaptions, toCaptionCues, toCaptions} = await import('../../../src/captions');
const {fakeFetch} = await import('../translations/helpers');
type StudioTimings = import('../../../src/types').StudioTimings;
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;

const timings = falaqNas as unknown as StudioTimings;
const staticFile = (path: string) => `https://studio.test/static/${path}`;
const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8'));
const TRANSLATION = {
  version: 1,
  kind: 'ayah',
  meta: {id: 'test', name: 'Test', language: 'en', source: 'file'},
  text: {
    '113:4': 'blowers in knots',
    '113:5': 'an envier',
    '114:1': 'Lord of mankind',
    '114:2': 'Sovereign',
    '2:1': 'x',
  },
};
/** `public/` as the Studio serves it: the timings, the text and a translation of both surahs; 404 for the rest. */
const studio = (files: Record<string, unknown> = {}) =>
  fakeFetch((url) => {
    const all: Record<string, unknown> = {
      'falaq-nas/timings.json': falaqNas,
      'falaq-nas/text.json': read('unicode/falaq-nas-text.json'),
      'falaq-nas/translation.json': TRANSLATION,
      ...files,
    };
    const body = all[url.pathname.replace(/^\/static\//, '')];
    return body === undefined ? {status: 404, body: {}} : {body};
  });
const io = (files: Record<string, unknown> = {}) => ({fetch: studio(files).fetch, staticFile});
const recitation = (changes: Partial<MushafRecitationProps> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  timingsFile: 'falaq-nas/timings.json',
  ...changes,
});
const types = (lines: readonly MushafLineData[]) => lines.map((line) => line.type);
const nonDecreasing = (values: readonly number[]) => values.every((v, i) => i === 0 || v >= values[i - 1]!);
const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as Error & {code: string};
  }
  throw new Error('expected a rejection');
};

beforeEach(() => {
  mocks.getMushafLines.mockReset();
  mocks.getMushafLines.mockImplementation(async (options: {page?: number}) => (options.page === 604 ? PAGE_604 : []));
  mocks.getMushafLinesForRanges.mockReset();
  mocks.getMushafLinesForRanges.mockImplementation(async (ranges: Parameters<typeof falaqNasLinesFor>[0]) =>
    falaqNasLinesFor(ranges),
  );
});

describe('timings across surahs', () => {
  it('are read whole, version 2 kept: fromAyah/toAyah cut one surah’s timings only', async () => {
    const file = await readTimings('falaq-nas/timings.json', {fetch: studio().fetch, staticFile});
    expect(file.version).toBe(2);
    expect(timingsInRange(file, 2, 3)).toBe(file);
    expect(ayahKeysOf(trimTimings(file, 5, 0))).toEqual(['113:4', '113:5', '114:1', '114:2']);
    expect(passageSpan(file)).toEqual({from: {surah: 113, ayah: 4}, to: {surah: 114, ayah: 2}});
    expect(crossesSurahs(file)).toBe(true);
    // An ayah the recording does not carry whole is left out, the surahs named as they were.
    const partial = {...timings, ayat: timings.ayat.map((a, i) => (i === 0 ? {...a, complete: false} : a))};
    expect(ayahKeysOf(trimTimings(partial as StudioTimings, 0, 0))).toEqual(['113:5', '114:1', '114:2']);
  });

  it('name each ayah by its own surah: the ayah heard, the end card’s content', () => {
    expect(ayahAt(timings, 0)).toBeNull();
    expect(ayahAt(timings, 5)).toBe('113:5');
    expect(ayahAt(timings, 12)).toBe('113:5');
    expect(ayahAt(timings, 13.2)).toBe('114:1');
    expect(recitedPassageOf(timings)).toEqual({surah: 114, lastAyah: 2, surahs: [113, 114]});
    expect(recitedPassageOf({version: 1, surah: 1, ayat: [{ayah: 7, start: 0, end: 1}]})).toEqual({
      surah: 1,
      lastAyah: 7,
    });
  });
});

describe('resolveRecitation across surahs', () => {
  it('finds the lines of both ranges, with An-Nas’s header lines between them, each given a slot', async () => {
    const resolved = await resolveRecitation(recitation({fromAyah: 2, toAyah: 3}), io());
    expect(mocks.getMushafLinesForRanges).toHaveBeenCalledTimes(1);
    expect(mocks.getMushafLinesForRanges.mock.calls[0]![0]).toEqual(FALAQ_NAS_RANGES);
    expect(mocks.getMushafLinesForRanges.mock.calls[0]![1]).toMatchObject({theme: 'plain', slice: true});
    // A recitation from 113:4 has no leading header: no page is asked for it.
    expect(mocks.getMushafLines).not.toHaveBeenCalled();
    expect(types(resolved.lines)).toEqual(['ayah', 'ayah', 'surah_name', 'basmallah', 'ayah', 'ayah']);
    expect(resolved.lines[2]!.surahNumber).toBe(114);
    expect(ayahKeysOf(resolved.timings)).toEqual(['113:4', '113:5', '114:1', '114:2']);
    expect(resolved.audioOffsetSeconds).toBe(0);
    // The header lines come in as 113:5 ends (8.2 s) and before 114:1 (13.2 s), 1.5 s apart.
    expect(resolved.schedule.map((slot) => slot.index)).toEqual([0, 1, 2, 3, 4, 5]);
    const at = Object.fromEntries(resolved.schedule.map((slot) => [slot.index, [slot.start, slot.end]]));
    expect(at[0]).toEqual([0.42, 4.6]);
    expect(at[1]![0]).toBe(4.6);
    expect(at[1]![1]).toBeCloseTo(10.2, 6);
    expect(at[2]![0]).toBeCloseTo(10.2, 6);
    expect(at[2]![1]).toBeCloseTo(11.7, 6);
    expect(at[3]![0]).toBeCloseTo(11.7, 6);
    expect(at[3]![1]).toBe(13.2);
    expect(at[4]).toEqual([13.2, 16.9]);
    expect(at[5]).toEqual([16.9, 18.7]);
    expect(nonDecreasing(resolved.schedule.map((slot) => slot.start))).toBe(true);
    expect(resolved.doubtful).toEqual({});
    expect(resolved.clips.map(clipAyahKey)).toEqual(['113:4', '113:5', '114:1', '114:2']);
  });

  it('shows An-Nas’s header lines between the surahs whatever header says; a leading one only as it asks', async () => {
    for (const header of ['none', 'name', 'name-basmalah'] as const) {
      const resolved = await resolveRecitation(recitation({header}), io());
      expect(types(resolved.lines)).toEqual(['ayah', 'ayah', 'surah_name', 'basmallah', 'ayah', 'ayah']);
    }
    // Timings of An-Nas from ayah 1, in version 2: its own header first, as header asks, from 0.
    const nas = {version: 2, ayat: falaqNas.ayat.slice(2)};
    const none = await resolveRecitation(recitation({header: 'none'}), io({'falaq-nas/timings.json': nas}));
    expect(types(none.lines)).toEqual(['ayah', 'ayah']);
    const named = await resolveRecitation(recitation({header: 'name'}), io({'falaq-nas/timings.json': nas}));
    expect(types(named.lines)).toEqual(['surah_name', 'ayah', 'ayah']);
    const both = await resolveRecitation(recitation({header: 'name-basmalah'}), io({'falaq-nas/timings.json': nas}));
    expect(types(both.lines)).toEqual(['surah_name', 'basmallah', 'ayah', 'ayah']);
    expect(mocks.getMushafLines).toHaveBeenCalledWith(expect.objectContaining({page: 604}));
    const starts = both.schedule.map((slot) => [slot.index, slot.start]);
    expect(starts[0]![0]).toBe(0);
    expect(starts[0]![1]).toBeCloseTo(10.2, 6);
    expect(starts[1]![1]).toBeCloseTo(11.7, 6);
    expect(starts.slice(2)).toEqual([
      [2, 13.2],
      [3, 16.9],
    ]);
  });

  it('cuts the translations to both surahs’ ayahs, by surah:ayah', async () => {
    const resolved = await resolveRecitation(
      recitation({text: {...defaultMushafRecitationProps.text, translationFile: 'falaq-nas/translation.json'}}),
      io(),
    );
    expect(Object.keys(resolved.translation!.text).sort()).toEqual(['113:4', '113:5', '114:1', '114:2']);
  });

  it('lays An-Nas’s header lines once before its first play when ayahs repeat', async () => {
    const memorize = {...defaultMushafRecitationProps.memorize, mode: 'repeat' as const, repeat: 2, pauseSeconds: 0.5};
    const resolved = await resolveRecitation(recitation({memorize}), io());
    expect(resolved.clips.map((clip) => `${clipAyahKey(clip)}/${clip.repetition}`)).toEqual([
      '113:4/1',
      '113:4/2',
      '113:5/1',
      '113:5/2',
      '114:1/1',
      '114:1/2',
      '114:2/1',
      '114:2/2',
    ]);
    const laid = scheduleForClips(resolved.schedule, resolved.lines, resolved.clips, headerCount(resolved.lines));
    // A line goes on through both plays of its ayah; the header lines come once.
    expect(laid.map((slot) => slot.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(nonDecreasing(laid.map((slot) => slot.start))).toBe(true);
    // The headers keep their place in the gap: after 113:5's second play, before 114:1's first.
    const nas = resolved.clips.find((clip) => clipAyahKey(clip) === '114:1')!;
    const falaq = resolved.clips.filter((clip) => clipAyahKey(clip) === '113:5').at(-1)!;
    const header = laid.find((slot) => slot.index === 2)!;
    expect(header.start).toBeGreaterThanOrEqual(falaq.compositionFrom + (falaq.audioTo - falaq.audioFrom));
    expect(laid.find((slot) => slot.index === 3)!.end).toBeLessThanOrEqual(nas.compositionFrom);
  });

  it('refuses timings no line of the ranges carries, naming both ends', async () => {
    mocks.getMushafLinesForRanges.mockImplementation(async () => [FALAQ_NAS_LINES[2]!]);
    const error = await rejection(resolveRecitation(recitation(), io()));
    expect(error.code).toBe('BAD_STUDIO_PROP');
    expect(error.message).toContain('No line of ayahs 113:4-114:2 carries a timed word');
  });
});

describe('resolvePage across surahs', () => {
  it('follows both ranges on the page, unsliced, An-Nas’s header among the passage', async () => {
    const resolved = await resolvePage(
      {...defaultMushafPageProps, timingsFile: 'falaq-nas/timings.json', fromAyah: 3},
      io(),
    );
    expect(mocks.getMushafLinesForRanges.mock.calls[0]![0]).toEqual(FALAQ_NAS_RANGES);
    expect(mocks.getMushafLinesForRanges.mock.calls[0]![1]).toMatchObject({slice: false});
    expect(resolved.pages.map((page) => page.page)).toEqual([604]);
    expect(types(resolved.pages[0]!.lines)).toEqual([
      'ayah',
      'ayah',
      'ayah',
      'surah_name',
      'basmallah',
      'ayah',
      'ayah',
    ]);
    expect(resolved.lines.map((slot) => slot.line)).toEqual([9, 10, 13, 14]);
    expect(resolved.range).toEqual(FALAQ_NAS_RANGES[0]);
    expect(rangesOf(resolved)).toEqual(FALAQ_NAS_RANGES);
    expect(inRanges({surah: 114, ayah: 1}, rangesOf(resolved))).toBe(true);
    expect(inRanges({surah: 113, ayah: 3}, rangesOf(resolved))).toBe(false);
    expect(ayahKeysOf(resolved.timings)).toEqual(['113:4', '113:5', '114:1', '114:2']);
  });
});

describe('resolveAyahText across surahs', () => {
  it('pairs every ayah with its own surah’s words', async () => {
    const resolved = await resolveAyahText(
      {...defaultMushafAyahTextProps, timingsFile: 'falaq-nas/timings.json', textFile: 'falaq-nas/text.json'},
      io(),
    );
    expect(resolved.ayahs.map((a) => `${a.surah}:${a.ayah}`)).toEqual(['113:4', '113:5', '114:1', '114:2']);
    expect(resolved.ayahs[2]!.words.map((w) => w.id)).toEqual(['114:1:1', '114:1:2', '114:1:3', '114:1:4', '114:1:5']);
    expect(resolved.clips.map(clipAyahKey)).toEqual(['113:4', '113:5', '114:1', '114:2']);
  });

  it('names the ayah and the surah a text file lacks', async () => {
    const text = read('unicode/falaq-nas-text.json') as {words: Record<string, string>};
    const falaqOnly = {
      ...text,
      words: Object.fromEntries(Object.entries(text.words).filter(([id]) => id.startsWith('113:'))),
    };
    const error = await rejection(
      resolveAyahText(
        {...defaultMushafAyahTextProps, timingsFile: 'falaq-nas/timings.json', textFile: 'falaq-nas/text.json'},
        io({'falaq-nas/text.json': falaqOnly}),
      ),
    );
    expect(error.code).toBe('BAD_STUDIO_PROP');
    expect(error.message).toContain('no words for ayah 114:1');
    expect(error.message).toContain('name surahs 113, 114, so textFile must hold the words of every one');
    expect(error.message).toContain('merge the text of surah 114 into it');
    // Neither the Text tab (one surah) nor the range (ignored for version 2) can fix it.
    expect(error.message).not.toContain('Text tab');
    expect(error.message).not.toContain('fromAyah');
  });
});

describe('withInnerHeaderSlots', () => {
  it('squeezes the header lines between the end of the last ayah and the next when the reciter goes on at once', () => {
    const quick = {
      version: 2 as const,
      ayat: [
        {surah: 113, ayah: 5, start: 0, end: 8.2},
        {surah: 114, ayah: 1, start: 8.4, end: 10},
      ],
    };
    const lines = [FALAQ_NAS_LINES[1]!, FALAQ_NAS_LINES[2]!, FALAQ_NAS_LINES[3]!, FALAQ_NAS_LINES[4]!];
    const schedule = withInnerHeaderSlots(
      [
        {index: 0, start: 0, end: 8.4},
        {index: 3, start: 8.4, end: 10},
      ],
      lines,
      quick,
      1.5,
    );
    expect(schedule).toEqual([
      {index: 0, start: 0, end: 8.2},
      {index: 1, start: 8.2, end: 8.2},
      {index: 2, start: 8.2, end: 8.4},
      {index: 3, start: 8.4, end: 10},
    ]);
  });
});

describe('the texts that name a passage across surahs', () => {
  it('write both ends: the range, in both digits, and the surah names', () => {
    const {from, to} = passageSpan(timings);
    expect(ayahSpanText(from, to)).toBe('113:4–114:2');
    expect(ayahSpanText(from, to, 'arabic')).toBe('١١٣:٤–١١٤:٢');
    expect(surahSpanName(from.surah, to.surah)).toBe('Al-Falaq – An-Nas');
    // One surah is written as before.
    expect(ayahSpanText({surah: 1, ayah: 2}, {surah: 1, ayah: 7})).toBe('1:2–7');
    expect(surahSpanName(1)).toBe('Al-Fatihah');
  });

  it('give each chapter its own surah, both for one that spans the boundary', () => {
    const spaced = {
      version: 2 as const,
      ayat: [
        {surah: 113, ayah: 4, start: 0, end: 11},
        {surah: 113, ayah: 5, start: 12, end: 14.5},
        {surah: 114, ayah: 1, start: 15, end: 29},
        {surah: 114, ayah: 2, start: 30, end: 45},
      ],
    };
    expect(chaptersFromTimings(spaced)).toEqual([
      '0:00 Al-Falaq 113:4',
      '0:12 Al-Falaq – An-Nas 113:5–114:1',
      '0:30 An-Nas 114:2',
    ]);
  });

  it('title the description with both ends', () => {
    const text = youtubeDescription({timings, surahName: surahSpanName(113, 114), reciter: 'Reciter', chapters: []});
    expect(text.split('\n')[0]).toBe('Al-Falaq – An-Nas 113:4–114:2, recited by Reciter');
  });

  it('caption each word with its own surah, and take the captions back to the same version 2 timings', () => {
    const cues = toCaptionCues(timings);
    expect(cues[0]).toMatchObject({id: '113:4:1', surah: 113, ayah: 4});
    expect(cues.find((cue) => cue.id === '114:1:1')).toMatchObject({surah: 114, ayah: 1});
    expect(fromCaptions(toCaptions(timings), timings)).toEqual(timings);
    const moved = toCaptions(timings).map((c, i) => (i === 10 ? {...c, startMs: 13250, timestampMs: 13250} : c));
    const edited = fromCaptions(moved, timings);
    expect(edited.version).toBe(2);
    expect(ayahKeysOf(edited)).toEqual(['113:4', '113:5', '114:1', '114:2']);
    expect(edited.ayat[2]!.start).toBe(13.25);
  });

  it('time the clips of each surah apart, keyed by surah', () => {
    const clips = clipTimeline(timings, {mode: 'off', repeat: 1, pauseSeconds: 0});
    expect(clips[2]).toEqual({
      surah: 114,
      ayah: 1,
      repetition: 1,
      audioFrom: 13.2,
      audioTo: 16.4,
      compositionFrom: 13.2,
    });
    // One surah's clips are as they were, without a surah.
    expect(
      clipTimeline(
        {version: 1, surah: 1, ayat: [{ayah: 2, start: 0, end: 1}]},
        {mode: 'off', repeat: 1, pauseSeconds: 0},
      ),
    ).toEqual([{ayah: 2, repetition: 1, audioFrom: 0, audioTo: 1, compositionFrom: 0}]);
  });
});

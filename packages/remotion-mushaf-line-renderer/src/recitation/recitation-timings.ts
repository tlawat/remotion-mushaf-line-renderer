import {ayahKey} from '../data/format';
import {describeValue, MushafError} from '../errors';
import type {
  AyahTiming,
  RecitationTimings,
  RecitationTimingsV2,
  RecitedRange,
  SurahAyahTiming,
  WordOccurrence,
  WordTiming,
} from '../types';

const FORMAT_V1 =
  'The format is {version: 1, surah, ayat: [{ayah, start, end, complete?, words?: [{id, start, end}]}]}, times in seconds.';
const FORMAT_V2 =
  'The format is {version: 2, ayat: [{surah, ayah, start, end, complete?, words?: [{id, start, end}]}]}, in recitation order, times in seconds.';

const failWith =
  (format: string) =>
  (field: string, problem: string, value?: unknown): never => {
    throw new MushafError(
      'BAD_RECITATION_TIMINGS',
      `RecitationTimings.${field} is invalid: ${problem}${value === undefined ? '' : ` (got ${describeValue(value)})`}. ${format}`,
      {field},
    );
  };

type Fail = ReturnType<typeof failWith>;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const isSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const assertSpan = (fail: Fail, field: string, entry: Record<string, unknown>): void => {
  if (!isSeconds(entry.start)) fail(`${field}.start`, 'expected seconds, a finite number of 0 or more', entry.start);
  if (!isSeconds(entry.end)) fail(`${field}.end`, 'expected seconds, a finite number of 0 or more', entry.end);
  if ((entry.end as number) < (entry.start as number))
    fail(`${field}.end`, `${entry.end} is before start (${entry.start})`);
};

const assertWords = (fail: Fail, field: string, surah: number, ayah: number, value: unknown): void => {
  if (!Array.isArray(value)) fail(field, 'expected an array of {id, start, end} when present', value);
  let previousStart = -1;
  (value as unknown[]).forEach((w, j) => {
    const at = `${field}[${j}]`;
    if (typeof w !== 'object' || w === null || Array.isArray(w)) fail(at, 'expected an object {id, start, end}', w);
    const word = w as Record<string, unknown>;
    if (typeof word.id !== 'string' || !/^\d+:\d+:\d+$/.test(word.id))
      fail(`${at}.id`, 'expected "surah:ayah:position", the id of a MushafWord', word.id);
    const [s, a] = (word.id as string).split(':').map(Number);
    if (s !== surah || a !== ayah) fail(`${at}.id`, `expected a word of ${surah}:${ayah}`, word.id);
    assertSpan(fail, at, word);
    if ((word.start as number) < previousStart)
      fail(`${at}.start`, 'words must be in audio order (a start never before the previous one)', word.start);
    previousStart = word.start as number;
  });
};

/** The fields one ayah entry shares across versions: its span, `complete` and `words`. */
const assertAyahBody = (fail: Fail, at: string, surah: number, ayah: Record<string, unknown>): void => {
  assertSpan(fail, at, ayah);
  if (ayah.complete !== undefined && typeof ayah.complete !== 'boolean')
    fail(`${at}.complete`, 'expected a boolean when present', ayah.complete);
  if (ayah.words !== undefined) assertWords(fail, `${at}.words`, surah, ayah.ayah as number, ayah.words);
};

const parseV1 = (data: Record<string, unknown>): void => {
  const fail = failWith(FORMAT_V1);
  if (!isPositiveInteger(data.surah) || data.surah > 114)
    fail('surah', 'expected an integer from 1 to 114', data.surah);
  const surah = data.surah as number;
  if (!Array.isArray(data.ayat) || data.ayat.length === 0) fail('ayat', 'expected a non-empty array', data.ayat);
  let previousAyah = 0;
  (data.ayat as unknown[]).forEach((a, i) => {
    const at = `ayat[${i}]`;
    if (typeof a !== 'object' || a === null || Array.isArray(a)) fail(at, 'expected an object {ayah, start, end}', a);
    const ayah = a as Record<string, unknown>;
    if (!isPositiveInteger(ayah.ayah)) fail(`${at}.ayah`, 'expected a positive integer', ayah.ayah);
    const number = ayah.ayah as number;
    if (number <= previousAyah) fail(`${at}.ayah`, `ayat must be in ascending order (${number} after ${previousAyah})`);
    previousAyah = number;
    assertAyahBody(fail, at, surah, ayah);
  });
};

const parseV2 = (data: Record<string, unknown>): void => {
  if (data.surah !== undefined) {
    throw new MushafError(
      'BAD_RECITATION_TIMINGS',
      `RecitationTimings.version is 2 but the file has a top-level surah (${describeValue(data.surah)}): version 2 names the surah on each ayah. Write {version: 1, surah, ayat} for one surah, or move the surah into every entry of ayat.`,
      {field: 'surah'},
    );
  }
  const fail = failWith(FORMAT_V2);
  if (!Array.isArray(data.ayat) || data.ayat.length === 0) fail('ayat', 'expected a non-empty array', data.ayat);
  let previous: {surah: number; ayah: number} | null = null;
  (data.ayat as unknown[]).forEach((a, i) => {
    const at = `ayat[${i}]`;
    if (typeof a !== 'object' || a === null || Array.isArray(a))
      fail(at, 'expected an object {surah, ayah, start, end}', a);
    const ayah = a as Record<string, unknown>;
    if (!isPositiveInteger(ayah.surah) || ayah.surah > 114)
      fail(`${at}.surah`, 'expected an integer from 1 to 114', ayah.surah);
    if (!isPositiveInteger(ayah.ayah)) fail(`${at}.ayah`, 'expected a positive integer', ayah.ayah);
    const surah = ayah.surah as number;
    const number = ayah.ayah as number;
    if (previous !== null && ayahKey(surah, number) <= ayahKey(previous.surah, previous.ayah))
      fail(
        at,
        `ayat must be in recitation order, surah ascending then ayah (${surah}:${number} after ${previous.surah}:${previous.ayah})`,
      );
    previous = {surah, ayah: number};
    assertAyahBody(fail, at, surah, ayah);
  });
};

/**
 * Validates recitation timings read from JSON (a tool's output, `inputProps`, a database) and returns
 * them typed: version 1 (one surah) or version 2 (ayat that name their surah, for a recording that
 * crosses surahs). Every field is checked and a version mismatch is explicit; keys the format does not
 * define (`audio`, `durationSeconds`, `source`, ...) pass through untouched.
 */
export const parseRecitationTimings = (value: unknown): RecitationTimings => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MushafError(
      'BAD_RECITATION_TIMINGS',
      `RecitationTimings must be an object {version: 1, surah, ayat} or {version: 2, ayat}, got ${describeValue(value)}.`,
    );
  }
  const data = value as Record<string, unknown>;
  if (data.version === 1) parseV1(data);
  else if (data.version === 2) parseV2(data);
  else {
    throw new MushafError(
      'BAD_RECITATION_TIMINGS',
      `RecitationTimings.version is ${describeValue(data.version)} but this version of @tlawat/remotion-mushaf-line understands version 1 (one surah) and version 2 (several surahs). Produce the timings again with a tool that writes one of them, or upgrade the package.`,
      {field: 'version'},
    );
  }
  return value as RecitationTimings;
};

const normalized = new WeakMap<RecitationTimings, RecitationTimingsV2>();

/**
 * Timings of either version as version 2: every ayah with its surah. Version 2 is returned as it is;
 * version 1 becomes `{...rest, version: 2, ayat: [{surah, ...ayah}, ...]}` (memoised per object, so
 * calling it every frame costs nothing). Keys the format does not define pass through.
 */
export const normalizeTimings = (timings: RecitationTimings): RecitationTimingsV2 => {
  if (timings.version === 2) return timings;
  const cached = normalized.get(timings);
  if (cached) return cached;
  const {version: _version, surah, ayat, ...rest} = timings;
  const view: RecitationTimingsV2 = {...rest, version: 2, ayat: ayat.map((ayah) => ({surah, ...ayah}))};
  normalized.set(timings, view);
  return view;
};

const indexed = new WeakMap<RecitationTimings, ReadonlyMap<number, SurahAyahTiming>>();

/** `ayahKey(surah, ayah)` → the ayah's timing, memoised per timings object. */
export const timingsByAyah = (timings: RecitationTimings): ReadonlyMap<number, SurahAyahTiming> => {
  const cached = indexed.get(timings);
  if (cached) return cached;
  const index = new Map<number, SurahAyahTiming>();
  // First wins, like a search from the start; a parsed file has each ayah once anyway.
  for (const ayah of normalizeTimings(timings).ayat) {
    const key = ayahKey(ayah.surah, ayah.ayah);
    if (!index.has(key)) index.set(key, ayah);
  }
  indexed.set(timings, index);
  return index;
};

/**
 * The ayah ranges a recording carries, one per surah in recitation order: what
 * `getMushafLinesForRanges()` takes. One range for a version 1 file.
 */
export const recitedRanges = (timings: RecitationTimings): RecitedRange[] => {
  const ranges: RecitedRange[] = [];
  for (const {surah, ayah} of normalizeTimings(timings).ayat) {
    const last = ranges[ranges.length - 1];
    if (last?.surah === surah) ranges[ranges.length - 1] = {surah, fromAyah: last.fromAyah, toAyah: ayah};
    else ranges.push({surah, fromAyah: ayah, toAyah: ayah});
  }
  return ranges;
};

/**
 * The ayah range a recording carries: the arguments `getMushafLines()` takes to find its lines. A
 * recording of one surah only; one that crosses surahs throws BAD_RECITATION_TIMINGS, since its
 * ranges are `recitedRanges()`.
 */
export const recitedRange = (timings: RecitationTimings): RecitedRange => {
  if (timings.version === 1) {
    return {
      surah: timings.surah,
      fromAyah: timings.ayat[0]!.ayah,
      toAyah: timings.ayat[timings.ayat.length - 1]!.ayah,
    };
  }
  const ranges = recitedRanges(timings);
  if (ranges.length !== 1) {
    throw new MushafError(
      'BAD_RECITATION_TIMINGS',
      `recitedRange(): these timings cross surahs (${ranges.map((r) => `${r.surah}:${r.fromAyah}-${r.toAyah}`).join(', ')}), so they have no single range. Use recitedRanges(timings) with getMushafLinesForRanges().`,
      {surahs: ranges.map((r) => r.surah)},
    );
  }
  return ranges[0]!;
};

const ayahOf = (timings: RecitationTimings, id: string): AyahTiming | undefined => {
  const [surah, ayah] = id.split(':').map(Number);
  return timingsByAyah(timings).get(ayahKey(surah!, ayah!));
};

/**
 * When a word is heard, from the file's per-word times: `null` when the file has none for it. A word
 * the reciter repeated is timed once per occurrence; `occurrence` picks the first (default) or the
 * last. `id` is `MushafWord.id` ("surah:ayah:position"), so a marker sharing its word's location
 * resolves to that word's time.
 */
export const wordTiming = (
  timings: RecitationTimings,
  id: string,
  occurrence: WordOccurrence = 'first',
): WordTiming | null => {
  const words = ayahOf(timings, id)?.words;
  if (!words) return null;
  let found: WordTiming | null = null;
  for (const word of words) {
    if (word.id !== id) continue;
    found = word;
    if (occurrence === 'first') break;
  }
  return found;
};

/**
 * The word being recited at a moment of the audio, for `activeWordId`: the id of the last word whose
 * `start` is at or before `seconds`. `null` before the first word, and always for a file without
 * per-word times. A pause keeps the previous word current until the next one starts, and a word
 * timed but on no line of the composition names nothing there.
 */
export const wordAt = (timings: RecitationTimings, seconds: number): string | null => {
  let best: WordTiming | null = null;
  for (const ayah of timings.ayat) {
    for (const word of ayah.words ?? []) {
      if (word.start <= seconds && (best === null || word.start >= best.start)) best = word;
    }
  }
  return best === null ? null : best.id;
};

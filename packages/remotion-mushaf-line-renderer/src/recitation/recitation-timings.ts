import {describeValue, MushafError} from '../errors';
import type {AyahTiming, RecitationTimings, RecitedRange, WordOccurrence, WordTiming} from '../types';

const fail = (field: string, problem: string, value?: unknown): never => {
  throw new MushafError(
    'BAD_RECITATION_TIMINGS',
    `RecitationTimings.${field} is invalid: ${problem}${value === undefined ? '' : ` (got ${describeValue(value)})`}. The format is {version: 1, surah, ayat: [{ayah, start, end, complete?, words?: [{id, start, end}]}]}, times in seconds.`,
    {field},
  );
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const isSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const assertSpan = (field: string, entry: Record<string, unknown>): void => {
  if (!isSeconds(entry.start)) fail(`${field}.start`, 'expected seconds, a finite number of 0 or more', entry.start);
  if (!isSeconds(entry.end)) fail(`${field}.end`, 'expected seconds, a finite number of 0 or more', entry.end);
  if ((entry.end as number) < (entry.start as number))
    fail(`${field}.end`, `${entry.end} is before start (${entry.start})`);
};

const assertWords = (field: string, surah: number, ayah: number, value: unknown): void => {
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
    assertSpan(at, word);
    if ((word.start as number) < previousStart)
      fail(`${at}.start`, 'words must be in audio order (a start never before the previous one)', word.start);
    previousStart = word.start as number;
  });
};

/**
 * Validates recitation timings read from JSON (a tool's output, `inputProps`, a database) and returns
 * them typed. Every field is checked and a version mismatch is explicit; keys the format does not
 * define (`audio`, `durationSeconds`, `source`, ...) pass through untouched.
 */
export const parseRecitationTimings = (value: unknown): RecitationTimings => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MushafError(
      'BAD_RECITATION_TIMINGS',
      `RecitationTimings must be an object {version: 1, surah, ayat}, got ${describeValue(value)}.`,
    );
  }
  const data = value as Record<string, unknown>;
  if (data.version !== 1) {
    throw new MushafError(
      'BAD_RECITATION_TIMINGS',
      `RecitationTimings.version is ${describeValue(data.version)} but this version of @tlawat/remotion-mushaf-line understands version 1. Produce the timings again with a tool that writes version 1, or upgrade the package.`,
      {field: 'version'},
    );
  }
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
    assertSpan(at, ayah);
    if (ayah.complete !== undefined && typeof ayah.complete !== 'boolean')
      fail(`${at}.complete`, 'expected a boolean when present', ayah.complete);
    if (ayah.words !== undefined) assertWords(`${at}.words`, surah, number, ayah.words);
  });
  return value as RecitationTimings;
};

/** The ayah range a recording carries: the arguments `getMushafLines()` takes to find its lines. */
export const recitedRange = (timings: RecitationTimings): RecitedRange => ({
  surah: timings.surah,
  fromAyah: timings.ayat[0]!.ayah,
  toAyah: timings.ayat[timings.ayat.length - 1]!.ayah,
});

const ayahOf = (timings: RecitationTimings, id: string): AyahTiming | undefined => {
  const [surah, ayah] = id.split(':').map(Number);
  if (surah !== timings.surah) return undefined;
  return timings.ayat.find((a) => a.ayah === ayah);
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

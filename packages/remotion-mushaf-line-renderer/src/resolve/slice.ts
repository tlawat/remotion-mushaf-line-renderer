import {describeValue, MushafError} from '../errors';
import type {MushafLineData, MushafSlice, MushafWord} from '../types';

/** The words a slice keeps, as an inclusive `wordId` band. */
export type SliceBand = {readonly first: number; readonly last: number};

/**
 * A slice resolved against one line: the band it keeps, `'empty'` when it keeps nothing on this
 * line, or `null` when there is no slice in effect — either none was asked for, or it keeps every
 * word, which is the same thing (the interior lines of a sliced passage render as printed).
 */
export type ResolvedSlice = SliceBand | 'empty' | null;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** Validates a `MushafSlice` (the `slice` prop, `getMushafLines({slice})` output, hand-written data). */
export const assertSlice = (source: string, value: unknown): MushafSlice => {
  const fail = (problem: string): never => {
    throw new MushafError(
      'BAD_SLICE',
      `${source}${problem.startsWith('.') ? '' : ' '}${problem}. Pass {ayah} for one ayah, {fromAyah, toAyah?} for a range of ayahs, or {fromWordId, toWordId?} for a band of words.`,
      {source, slice: value},
    );
  };
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail(`must be an object, got ${describeValue(value)}`);
  const {ayah, fromAyah, toAyah, fromWordId, toWordId, ...rest} = value as Record<string, unknown>;
  const unknown = Object.keys(rest);
  if (unknown.length > 0)
    return fail(`has the unknown key${unknown.length > 1 ? 's' : ''} ${unknown.map((k) => `"${k}"`).join(', ')}`);
  if (fromWordId !== undefined || toWordId !== undefined) {
    if (ayah !== undefined || fromAyah !== undefined || toAyah !== undefined)
      return fail('takes either ayahs (ayah, fromAyah/toAyah) or words (fromWordId/toWordId), not both');
    if (fromWordId === undefined) return fail('has toWordId but no fromWordId');
    if (!isPositiveInteger(fromWordId))
      return fail(`.fromWordId must be a positive integer, got ${describeValue(fromWordId)}`);
    if (toWordId !== undefined) {
      if (!isPositiveInteger(toWordId))
        return fail(`.toWordId must be a positive integer when given, got ${describeValue(toWordId)}`);
      if (toWordId < fromWordId) return fail(`.toWordId (${toWordId}) is before fromWordId (${fromWordId})`);
    }
    return value as MushafSlice;
  }
  if (ayah !== undefined) {
    if (fromAyah !== undefined || toAyah !== undefined) return fail('takes either ayah or fromAyah/toAyah, not both');
    if (!isPositiveInteger(ayah)) return fail(`.ayah must be a positive integer, got ${describeValue(ayah)}`);
    return value as MushafSlice;
  }
  if (fromAyah === undefined) return fail('needs ayah, fromAyah or fromWordId');
  if (!isPositiveInteger(fromAyah)) return fail(`.fromAyah must be a positive integer, got ${describeValue(fromAyah)}`);
  if (toAyah !== undefined) {
    if (!isPositiveInteger(toAyah))
      return fail(`.toAyah must be a positive integer when given, got ${describeValue(toAyah)}`);
    if (toAyah < fromAyah) return fail(`.toAyah (${toAyah}) is before fromAyah (${fromAyah})`);
  }
  return value as MushafSlice;
};

const selects = (slice: MushafSlice, word: MushafWord): boolean => {
  const {ayah: only, fromAyah, toAyah, fromWordId, toWordId} = slice;
  if (fromWordId !== undefined) return word.wordId >= fromWordId && (toWordId === undefined || word.wordId <= toWordId);
  if (only !== undefined) return word.ayah === only;
  return fromAyah !== undefined && word.ayah >= fromAyah && (toAyah === undefined || word.ayah <= toAyah);
};

/**
 * Resolves a selector against a line to the band of words it keeps. One pass in reading order
 * (`words` is ordered by `wordId`, which `assertLineData()` enforces). The ayah forms select by
 * `ayah`, so the ayah-end rosette goes with the ayah it closes; a word band selects by `wordId`,
 * clipped to the line. Either way the boundaries are the `wordId`s of the first and last word kept,
 * because a marker can share its `id` with the word it precedes.
 */
export const resolveSlice = (line: MushafLineData, selector: MushafSlice | null | undefined): ResolvedSlice => {
  if (selector == null || line.words.length === 0) return null;
  let first = -1;
  let last = -1;
  for (const word of line.words) {
    if (!selects(selector, word)) continue;
    if (first < 0) first = word.wordId;
    last = word.wordId;
  }
  if (first < 0) return 'empty';
  if (first === line.words[0]!.wordId && last === line.words[line.words.length - 1]!.wordId) return null;
  return {first, last};
};

export const isInSlice = (slice: ResolvedSlice, wordId: number): boolean =>
  slice === null || (slice !== 'empty' && wordId >= slice.first && wordId <= slice.last);

/**
 * The words of a line that a slice keeps — the line's own `slice` by default, `null` for the whole
 * line. Handy for skipping lines a range does not reach, or for joining word timings to what is on
 * screen.
 */
export const sliceWords = (
  line: MushafLineData,
  slice: MushafSlice | null | undefined = line.slice,
): readonly MushafWord[] => {
  const resolved = resolveSlice(line, slice == null ? null : assertSlice('sliceWords(): slice', slice));
  return resolved === null ? line.words : line.words.filter((word) => isInSlice(resolved, word.wordId));
};

// Contract of the lines module (workstream 4 implements it alongside the compositions, after
// workstream 1 lands the package's word-range slice). Pure functions over line data and timings.
import type {MushafLineData} from '@tlawat/remotion-mushaf-line';
import type {DoubtReason, LineSplit, StudioTimings} from '../types';

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet (workstream 4).`);
};

/**
 * Splits a line at `atWordId` into two: the words before it and the words from it on, each with a
 * word-range slice (`{fromWordId, toWordId}`) intersected with the slice the line already carries.
 * Throws `BAD_LINE_SPLIT` when the word is not on the line, is its first word, or falls outside
 * the line's existing slice (a split must leave words on both sides).
 */
export const splitLineAt = (
  _line: MushafLineData,
  _atWordId: number,
): readonly [first: MushafLineData, second: MushafLineData] => notImplemented('splitLineAt');

/**
 * Applies every split to a passage: the lines named by `splits` are replaced by their two halves
 * (several splits on one line apply in word order), the others are untouched. Order is preserved.
 * Throws `BAD_LINE_SPLIT` when a split names a line that is not in `lines`.
 */
export const applySplits = (
  _lines: readonly MushafLineData[],
  _splits: readonly LineSplit[],
): readonly MushafLineData[] => notImplemented('applySplits');

/**
 * The words the Review tab marks, with their reasons: words whose aligner segment is under the
 * confidence threshold, reports missing words, or carries an error; words of an ayah the file marks
 * `complete: false`; and words the reciter repeated. Keyed by `MushafWord.id`. Empty without a
 * sidecar (except for `incomplete-ayah`, which the timings alone say).
 */
export const doubtfulWords = (
  _timings: StudioTimings,
  _options: {readonly threshold?: number | undefined} = {},
): Readonly<Record<string, readonly DoubtReason[]>> => notImplemented('doubtfulWords');

/** The word (by `wordId`) a split must name to cut a line before `position` of `ayah`, for the panel. */
export const wordIdAt = (_line: MushafLineData, _surah: number, _ayah: number, _position: number): number | null =>
  notImplemented('wordIdAt');

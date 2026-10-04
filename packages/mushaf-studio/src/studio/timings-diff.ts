// Two timings files side by side, word by word: how far apart the starts are, for the Review tab's
// "Compare with...". Pure.
import type {RecitationTimings} from '@tlawat/remotion-mushaf-line';

/** One word timed in both files: `id` and its occurrence (`0` for the first time it is recited). */
export type WordDiff = {
  readonly id: string;
  readonly occurrence: number;
  /** Seconds, in each file's own time. */
  readonly startA: number;
  readonly startB: number;
  /** `startB - startA`. */
  readonly diff: number;
};

/** A word one file times and the other does not. */
export type LoneWord = {readonly id: string; readonly occurrence: number; readonly start: number};

/** Over the absolute differences of the matched words; all 0 when none matched. */
export type DiffSummary = {
  readonly matched: number;
  readonly median: number;
  /** Nearest rank: the smallest difference at least 90% of the words are within. */
  readonly p90: number;
  readonly max: number;
};

export type TimingsDiff = {
  /** Sorted by `|diff|`, largest first; equal ones in recitation order. */
  readonly words: readonly WordDiff[];
  readonly onlyInA: readonly LoneWord[];
  readonly onlyInB: readonly LoneWord[];
  readonly summary: DiffSummary;
};

/** The timed words of a file in recitation order, each with its occurrence among the words of its id. */
const occurrences = (timings: RecitationTimings): readonly LoneWord[] => {
  const seen = new Map<string, number>();
  const out: LoneWord[] = [];
  for (const ayah of timings.ayat)
    for (const word of ayah.words ?? []) {
      const occurrence = seen.get(word.id) ?? 0;
      seen.set(word.id, occurrence + 1);
      out.push({id: word.id, occurrence, start: word.start});
    }
  return out;
};

const keyOf = (word: {readonly id: string; readonly occurrence: number}): string => `${word.id}#${word.occurrence}`;

/** Rounded to the millisecond, so `1.3 - 1.2` reads `0.1`. */
const ms = (seconds: number): number => Math.round(seconds * 1000) / 1000;

/** The median and the nearest-rank 90th percentile and the max of `values` (not sorted in place). */
export const summarise = (values: readonly number[]): DiffSummary => {
  if (values.length === 0) return {matched: 0, median: 0, p90: 0, max: 0};
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const middle = Math.floor(n / 2);
  const median = n % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const p90 = sorted[Math.max(0, Math.ceil(0.9 * n) - 1)]!;
  return {matched: n, median: ms(median), p90: ms(p90), max: ms(sorted[n - 1]!)};
};

/**
 * Word by word, how much later `b` starts each word than `a`. A word recited twice is matched by
 * occurrence: the first `1:3:1` of `a` with the first of `b`, the second with the second; an
 * occurrence one file has and the other does not lands in `onlyInA` or `onlyInB`.
 */
export const diffTimings = (a: RecitationTimings, b: RecitationTimings): TimingsDiff => {
  const left = occurrences(a);
  const right = new Map(occurrences(b).map((word) => [keyOf(word), word]));
  const words: (WordDiff & {readonly order: number})[] = [];
  const onlyInA: LoneWord[] = [];
  left.forEach((word, order) => {
    const other = right.get(keyOf(word));
    if (!other) {
      onlyInA.push(word);
      return;
    }
    right.delete(keyOf(word));
    words.push({
      id: word.id,
      occurrence: word.occurrence,
      startA: word.start,
      startB: other.start,
      diff: ms(other.start - word.start),
      order,
    });
  });
  words.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff) || x.order - y.order);
  return {
    words: words.map(({order: _order, ...word}) => word),
    onlyInA,
    onlyInB: [...right.values()],
    summary: summarise(words.map((word) => Math.abs(word.diff))),
  };
};

import type {DoubtReason, StudioTimings} from '../types';

/** The order reasons are listed in, whatever order they were found in. */
const REASONS: readonly DoubtReason[] = [
  'low-confidence',
  'missing-words',
  'segment-error',
  'incomplete-ayah',
  'repeated',
];

/** Mushaf order of two word ids ("surah:ayah:position"), numerically. */
const byLocation = (a: string, b: string): number => {
  const left = a.split(':').map(Number);
  const right = b.split(':').map(Number);
  for (let i = 0; i < 3; i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
};

/**
 * The words the Review tab marks, with their reasons: words whose aligner segment is under the
 * confidence threshold (`confidence < threshold`), reports missing words, or carries an error;
 * words of an ayah the file marks `complete: false`; and words the reciter repeated (an id timed
 * more than once in its ayah). Keyed by `MushafWord.id`, in mushaf order, the reasons in a fixed
 * order, so the result is the same whatever the file's own order. Empty without a sidecar, except
 * for `incomplete-ayah` and `repeated`, which the timings alone say; an incomplete ayah without
 * per-word times names no word, so it marks nothing.
 */
export const doubtfulWords = (
  timings: StudioTimings,
  options: {readonly threshold?: number | undefined} = {},
): Readonly<Record<string, readonly DoubtReason[]>> => {
  const threshold = options.threshold ?? 0.8;
  const found = new Map<string, Set<DoubtReason>>();
  const mark = (id: string, reason: DoubtReason): void => {
    const reasons = found.get(id) ?? new Set<DoubtReason>();
    reasons.add(reason);
    found.set(id, reasons);
  };

  for (const ayah of timings.ayat) {
    const occurrences = new Map<string, number>();
    for (const word of ayah.words ?? []) occurrences.set(word.id, (occurrences.get(word.id) ?? 0) + 1);
    for (const [id, count] of occurrences) {
      if (ayah.complete === false) mark(id, 'incomplete-ayah');
      if (count > 1) mark(id, 'repeated');
    }
  }

  const sidecar = timings.alignment;
  if (sidecar) {
    const flags = new Map<number, readonly DoubtReason[]>();
    for (const segment of sidecar.segments) {
      const reasons: DoubtReason[] = [];
      if (segment.confidence < threshold) reasons.push('low-confidence');
      if (segment.hasMissingWords) reasons.push('missing-words');
      if (segment.error !== null) reasons.push('segment-error');
      if (reasons.length > 0) flags.set(segment.segment, reasons);
    }
    for (const word of sidecar.words) for (const reason of flags.get(word.segment) ?? []) mark(word.id, reason);
  }

  const out: Record<string, readonly DoubtReason[]> = {};
  for (const id of [...found.keys()].sort(byLocation)) {
    const reasons = found.get(id)!;
    out[id] = REASONS.filter((reason) => reasons.has(reason));
  }
  return out;
};

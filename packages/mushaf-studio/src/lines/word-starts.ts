import type {RecitationTimings} from '@tlawat/remotion-mushaf-line';

/**
 * When each timed word is first heard, by `MushafWord.id`: the index `wordStyleFrom()` dims the
 * upcoming words with. A repeated word keeps its first time (what was heard once is no longer
 * upcoming); a file without per-word times gives an empty index.
 */
export const wordStarts = (timings: RecitationTimings): Readonly<Record<string, number>> => {
  const starts: Record<string, number> = {};
  for (const ayah of timings.ayat) {
    for (const word of ayah.words ?? []) if (starts[word.id] === undefined) starts[word.id] = word.start;
  }
  return starts;
};

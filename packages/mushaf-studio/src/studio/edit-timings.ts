// Pure edits to a timings file, for the Review tab. Nothing here reads the clock: the panel passes
// the edit's timestamp in, taken when the user clicks, so a test can pin it.
import type {AyahTiming, WordTiming} from '@tlawat/remotion-mushaf-line';
import {MushafStudioError} from '../errors';
import type {AlignmentEdit, AlignmentSidecar, AlignmentWord, StudioTimings} from '../types';

/** One word's new times. `occurrenceIndex` counts the occurrences of `id` in its ayah's words, from 0. */
export type WordNudge = {
  /** `MushafWord.id`, "surah:ayah:position". */
  readonly id: string;
  readonly occurrenceIndex: number;
  /** Seconds from the start of the recording. */
  readonly start: number;
  readonly end: number;
  /** ISO 8601, for the edit log. Default: now (never call without it during a render). */
  readonly at?: string | undefined;
};

/** Milliseconds are the finest the aligner gives; rounding keeps `1.45 - 0.05` from becoming `1.4000000000000001`. */
export const roundMs = (seconds: number): number => Math.round(seconds * 1000) / 1000;

const emptySidecar = (): AlignmentSidecar => ({version: 1, source: 'manual', segments: [], words: [], edits: []});

/** The timings with one more entry in the sidecar's edit log (a manual sidecar is started when there is none). */
export const withEdit = (timings: StudioTimings, edit: AlignmentEdit): StudioTimings => {
  const sidecar = timings.alignment ?? emptySidecar();
  return {...timings, alignment: {...sidecar, edits: [...sidecar.edits, edit]}};
};

const sortedByStart = <T extends {readonly start: number}>(words: readonly T[]): readonly T[] =>
  words
    .map((word, index) => ({word, index}))
    .sort((a, b) => a.word.start - b.word.start || a.index - b.index)
    .map((e) => e.word);

const hull = (ayah: AyahTiming, words: readonly WordTiming[]): AyahTiming => {
  if (words.length === 0) return {...ayah, words};
  let start = Number.POSITIVE_INFINITY;
  let end = 0;
  for (const word of words) {
    if (word.start < start) start = word.start;
    if (word.end > end) end = word.end;
  }
  return {...ayah, start: roundMs(start), end: roundMs(Math.max(start, end)), words};
};

/** The index in `words` of the n-th occurrence of `id`, or -1; `count` receives how many there are. */
const occurrenceAt = <T extends {readonly id: string}>(
  words: readonly T[],
  id: string,
  n: number,
): {index: number; count: number} => {
  let count = 0;
  let index = -1;
  words.forEach((word, i) => {
    if (word.id !== id) return;
    if (count === n) index = i;
    count++;
  });
  return {index, count};
};

/**
 * Moves one recited word: its new `start` and `end` replace the old ones in its ayah (the n-th
 * occurrence of `id` when the reciter repeated it) and in the sidecar's words, the words are kept in
 * audio order (sorted by `start`, stable, so a word nudged across its neighbour keeps the file
 * valid for `parseRecitationTimings()`), the ayah's `start` and `end` become the hull of its
 * words, and a `nudge` entry is appended to the edit log. Pure: returns a new object, keeps every
 * other key. Throws `BAD_TIMING_EDIT` for a start after the end, a negative time, an ayah that is
 * not in the file or has no per-word times, or an occurrence it does not have.
 */
export const nudgeWord = (timings: StudioTimings, nudge: WordNudge): StudioTimings => {
  const {id, occurrenceIndex} = nudge;
  const start = roundMs(nudge.start);
  const end = roundMs(nudge.end);
  const fail = (problem: string): never => {
    throw new MushafStudioError('BAD_TIMING_EDIT', `nudgeWord(): ${problem}`, {id, occurrenceIndex, start, end});
  };
  if (!Number.isFinite(start) || start < 0) fail(`the start of ${id} must be seconds, 0 or more, got ${nudge.start}.`);
  if (!Number.isFinite(end) || end < start)
    fail(`the start of ${id} (${start}s) is after its end (${end}s); a word ends at or after it starts.`);
  const [surah, ayahNumber] = id.split(':').map(Number);
  if (surah !== timings.surah) fail(`${id} is not in surah ${timings.surah}, the surah of this file.`);
  const ayahIndex = timings.ayat.findIndex((ayah) => ayah.ayah === ayahNumber);
  if (ayahIndex < 0)
    fail(`ayah ${ayahNumber} is not in this file (it has ${timings.ayat.map((a) => a.ayah).join(', ')}).`);
  const ayah = timings.ayat[ayahIndex]!;
  if (!ayah.words) fail(`ayah ${ayahNumber} has no per-word times to edit; align the recording first.`);
  const words = ayah.words!;
  const {index, count} = occurrenceAt(words, id, occurrenceIndex);
  if (index < 0)
    fail(
      count === 0
        ? `${id} is not timed in ayah ${ayahNumber}.`
        : `${id} is recited ${count} time${count > 1 ? 's' : ''} in ayah ${ayahNumber}; occurrence ${occurrenceIndex} does not exist.`,
    );
  const before = words[index]!;
  const nextWords = sortedByStart(words.map((word, i) => (i === index ? {id, start, end} : word)));
  const ayat = timings.ayat.map((entry, i) => (i === ayahIndex ? hull(entry, nextWords) : entry));
  const edit: AlignmentEdit = {
    kind: 'nudge',
    at: nudge.at ?? new Date().toISOString(),
    note: `${id}#${occurrenceIndex}: ${before.start}-${before.end}s to ${start}-${end}s`,
  };
  const sidecar = timings.alignment;
  if (!sidecar) return withEdit({...timings, ayat}, edit);
  const inSidecar = occurrenceAt(sidecar.words, id, occurrenceIndex).index;
  const sidecarWords: readonly AlignmentWord[] =
    inSidecar < 0
      ? sidecar.words
      : sortedByStart(sidecar.words.map((word, i) => (i === inSidecar ? {...word, start, end} : word)));
  return withEdit({...timings, ayat, alignment: {...sidecar, words: sidecarWords}}, edit);
};

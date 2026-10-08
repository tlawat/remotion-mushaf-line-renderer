// Pure edits to a timings file, for the Review tab. Nothing here reads the clock: the panel passes
// the edit's timestamp in, taken when the user clicks, so a test can pin it.
import type {AyahTiming, WordTiming} from '@tlawat/remotion-mushaf-line';
import {MushafStudioError} from '../errors';
import {MARKER_HOLD_SECONDS} from '../qud/convert';
import type {AlignmentEdit, AlignmentSidecar, AlignmentWord, StudioTimings, StudioTimingsV1} from '../types';

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

const positionOf = (id: string): number => Number(id.split(':')[2]);

/**
 * The index in `words` of the ayah-end marker `timingsFromQud()` emits for a complete ayah: the
 * mushaf word after the last recited one, held from that word's end. With the sidecar it is the
 * word whose position is above every recited (sidecar) word of the ayah. Without one, it is the
 * last word by position when it has the shape the converter gives it: alone at its position, one
 * past the others, starting where they end and held at most `MARKER_HOLD_SECONDS`, so a file that
 * simply ends on its last word (the committed fixtures) keeps that word a word. -1 when there is none.
 */
const markerIndex = (words: readonly WordTiming[], recited: readonly AlignmentWord[]): number => {
  if (recited.length > 0) {
    const top = Math.max(...recited.map((word) => positionOf(word.id)));
    const above = words.map((word, index) => (positionOf(word.id) > top ? index : -1)).filter((index) => index >= 0);
    return above.length === 1 ? above[0]! : -1;
  }
  const positions = words.map((word) => positionOf(word.id));
  const top = Math.max(...positions);
  const index = positions.indexOf(top);
  if (index < 0 || positions.lastIndexOf(top) !== index) return -1;
  const others = words.filter((_, i) => i !== index);
  if (others.length === 0 || Math.max(...others.map((word) => positionOf(word.id))) !== top - 1) return -1;
  const candidate = words[index]!;
  const lastEnd = Math.max(...others.map((word) => word.end));
  return candidate.start === lastEnd && candidate.end - candidate.start <= MARKER_HOLD_SECONDS ? index : -1;
};

/** The marker of a complete ayah moved to the end of its recited words (its hold kept when it still fits). */
const followMarker = (words: readonly WordTiming[], index: number): readonly WordTiming[] => {
  const marker = words[index]!;
  const start = roundMs(Math.max(...words.filter((_, i) => i !== index).map((word) => word.end)));
  return words.map((word, i) => (i === index ? {...marker, start, end: roundMs(Math.max(marker.end, start))} : word));
};

type Resolved = {
  readonly nudge: WordNudge;
  readonly ayahIndex: number;
  readonly wordIndex: number;
  /** The index in the sidecar's words, -1 when the sidecar has no such occurrence. */
  readonly sidecarIndex: number;
  readonly before: WordTiming;
  readonly start: number;
  readonly end: number;
};

const resolve = (timings: StudioTimingsV1, nudge: WordNudge): Resolved => {
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
  const sidecarIndex = timings.alignment ? occurrenceAt(timings.alignment.words, id, occurrenceIndex).index : -1;
  return {nudge, ayahIndex, wordIndex: index, sidecarIndex, before: words[index]!, start, end};
};

/**
 * Moves several recited words at once: every occurrence is resolved against the file as it is, so
 * nudging `1:3:1#0` past `1:3:1#1` in the same batch still moves the words the user pointed at (one
 * after the other, each sort would renumber the occurrences). Each ayah's words are then sorted by
 * `start` once (stable, so the file stays valid for `parseRecitationTimings()`), a complete ayah's
 * end marker follows its last recited word unless it was nudged itself, the ayah's `start` and
 * `end` become the hull of its words, and one `nudge` entry (dated by the first nudge's `at`) is
 * appended to the edit log. Pure; an empty list returns the input. Throws `BAD_TIMING_EDIT` as
 * `nudgeWord()` does, before anything is changed, and for a file that crosses surahs (version 2);
 * the last of two nudges of the same word wins.
 */
export const nudgeWords = (timings: StudioTimings, nudges: readonly WordNudge[]): StudioTimings => {
  if (nudges.length === 0) return timings;
  if (timings.version !== 1)
    throw new MushafStudioError(
      'BAD_TIMING_EDIT',
      `nudgeWord(): these timings have version ${timings.version} (they cross surahs); the panel edits a file of one surah (version 1). Edit the times in the file itself, or align each surah to a file of its own.`,
      {version: timings.version},
    );
  const resolved = nudges.map((nudge) => resolve(timings, nudge));
  const byAyah = new Map<number, Map<number, Resolved>>();
  for (const entry of resolved) {
    const words = byAyah.get(entry.ayahIndex) ?? new Map<number, Resolved>();
    words.set(entry.wordIndex, entry);
    byAyah.set(entry.ayahIndex, words);
  }
  const ayat = timings.ayat.map((ayah, ayahIndex) => {
    const moved = byAyah.get(ayahIndex);
    if (!moved) return ayah;
    const words = ayah.words!;
    const replaced: readonly WordTiming[] = words.map((word, i) => {
      const entry = moved.get(i);
      return entry ? {id: word.id, start: entry.start, end: entry.end} : word;
    });
    const recited =
      timings.alignment?.words.filter((word) => word.id.startsWith(`${timings.surah}:${ayah.ayah}:`)) ?? [];
    const marker = ayah.complete === true ? markerIndex(words, recited) : -1;
    const next = marker >= 0 && !moved.has(marker) ? followMarker(replaced, marker) : replaced;
    return hull(ayah, sortedByStart(next));
  });
  const edit: AlignmentEdit = {
    kind: 'nudge',
    at: resolved.find((entry) => entry.nudge.at !== undefined)?.nudge.at ?? new Date().toISOString(),
    note: resolved
      .map(
        ({nudge, before, start, end}) =>
          `${nudge.id}#${nudge.occurrenceIndex}: ${before.start}-${before.end}s to ${start}-${end}s`,
      )
      .join('; '),
  };
  const sidecar = timings.alignment;
  if (!sidecar) return withEdit({...timings, ayat}, edit);
  const inSidecar = new Map(
    resolved.filter((entry) => entry.sidecarIndex >= 0).map((entry) => [entry.sidecarIndex, entry]),
  );
  const sidecarWords: readonly AlignmentWord[] =
    inSidecar.size === 0
      ? sidecar.words
      : sortedByStart(
          sidecar.words.map((word, i) => {
            const entry = inSidecar.get(i);
            return entry ? {...word, start: entry.start, end: entry.end} : word;
          }),
        );
  return withEdit({...timings, ayat, alignment: {...sidecar, words: sidecarWords}}, edit);
};

/**
 * Moves one recited word: its new `start` and `end` replace the old ones in its ayah (the n-th
 * occurrence of `id` when the reciter repeated it) and in the sidecar's words, the words are kept in
 * audio order (sorted by `start`, stable, so a word nudged across its neighbour keeps the file
 * valid for `parseRecitationTimings()`), a complete ayah's end marker follows its last word, the
 * ayah's `start` and `end` become the hull of its words, and a `nudge` entry is appended to the
 * edit log. Pure: returns a new object, keeps every other key. Throws `BAD_TIMING_EDIT` for a start
 * after the end, a negative time, an ayah that is not in the file or has no per-word times, or an
 * occurrence it does not have. `nudgeWords()` moves several at once.
 */
export const nudgeWord = (timings: StudioTimings, nudge: WordNudge): StudioTimings => nudgeWords(timings, [nudge]);

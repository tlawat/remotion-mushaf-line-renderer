// The Review tab's words and its keyboard: which words are doubtful, which one `j` and `k` move to,
// and what each key does. Pure, so the tab only wires them to its state.
import type {StudioTimings} from '../types';
import {isDoubtfulSegment} from './doubts';

/**
 * A timed word as the Review tab shows it. `key` is `id#occurrence` (the occurrence among the words
 * of the same id, from 0), the handle `nudgeWords()` takes; `group` is the list row it sits in:
 * `s<segment>` for a word the aligner's sidecar names, else `a<ayah>`.
 */
export type ReviewWord = {
  readonly key: string;
  readonly id: string;
  readonly occurrence: number;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly group: string;
};

export const wordKey = (id: string, occurrence: number): string => `${id}#${occurrence}`;

export const parseWordKey = (key: string): {id: string; occurrence: number} => {
  const hash = key.lastIndexOf('#');
  return {id: key.slice(0, hash), occurrence: Number(key.slice(hash + 1))};
};

/**
 * Every timed word in recitation order: the sidecar's words (with their Uthmani text and segment)
 * when the file has a sidecar with words, else the ayahs' words (named by id).
 */
export const reviewWords = (timings: StudioTimings): readonly ReviewWord[] => {
  const seen = new Map<string, number>();
  const next = (id: string): number => {
    const occurrence = seen.get(id) ?? 0;
    seen.set(id, occurrence + 1);
    return occurrence;
  };
  const sidecar = timings.alignment?.words ?? [];
  if (sidecar.length > 0)
    return sidecar.map((word) => {
      const occurrence = next(word.id);
      const {id, text, start, end} = word;
      return {key: wordKey(id, occurrence), id, occurrence, text, start, end, group: `s${word.segment}`};
    });
  return timings.ayat.flatMap((ayah) =>
    (ayah.words ?? []).map((word) => {
      const occurrence = next(word.id);
      const {id, start, end} = word;
      return {key: wordKey(id, occurrence), id, occurrence, text: id, start, end, group: `a${ayah.ayah}`};
    }),
  );
};

/**
 * The words `j` and `k` visit, by start: those of a doubtful segment (under the threshold, missing
 * words, an error) and those of an ayah the file marks incomplete.
 */
export const doubtfulReviewWords = (
  words: readonly ReviewWord[],
  timings: StudioTimings,
  threshold: number,
): readonly ReviewWord[] => {
  const segments = new Set(
    (timings.alignment?.segments ?? [])
      .filter((segment) => isDoubtfulSegment(segment, threshold))
      .map((segment) => `s${segment.segment}`),
  );
  const incomplete = new Set(timings.ayat.filter((ayah) => ayah.complete === false).map((ayah) => ayah.ayah));
  const ayahOf = (id: string): number => Number(id.split(':')[1]);
  return words
    .filter((word) => segments.has(word.group) || incomplete.has(ayahOf(word.id)))
    .map((word, index) => ({word, index}))
    .sort((a, b) => a.word.start - b.word.start || a.index - b.index)
    .map((entry) => entry.word);
};

/**
 * The doubtful word after (`+1`) or before (`-1`) the selected one. With nothing selected, the first
 * (or the last); with a selected word that is not doubtful, the nearest doubtful one in that
 * direction by start. At either end it stays where it is; `null` when there is no doubtful word.
 */
export const stepDoubt = (
  doubtful: readonly ReviewWord[],
  selected: ReviewWord | null,
  direction: 1 | -1,
): ReviewWord | null => {
  if (doubtful.length === 0) return null;
  if (selected === null) return (direction === 1 ? doubtful[0] : doubtful[doubtful.length - 1]) ?? null;
  const at = doubtful.findIndex((word) => word.key === selected.key);
  if (at >= 0) return doubtful[Math.max(0, Math.min(doubtful.length - 1, at + direction))] ?? null;
  const found =
    direction === 1
      ? doubtful.find((word) => word.start > selected.start)
      : [...doubtful].reverse().find((word) => word.start < selected.start);
  return found ?? selected;
};

/** What a key does in the Review tab; see `REVIEW_SHORTCUTS`. */
export type ReviewAction =
  | {readonly kind: 'step'; readonly direction: 1 | -1}
  | {readonly kind: 'nudge'; readonly edge: 'start' | 'end'; readonly seconds: number}
  | {readonly kind: 'apply'}
  | {readonly kind: 'toggle-playback'}
  | {readonly kind: 'help'};

/** How far `[`, `]`, `{` and `}` move a word's edge. */
export const NUDGE_STEP_SECONDS = 0.02;

/** The keys, in the order the shortcut list shows them, with the dictionary key of their description. */
export const REVIEW_SHORTCUTS = [
  {keys: 'j / k', description: 'review.keys.step'},
  {keys: '[ / ]', description: 'review.keys.start'},
  {keys: '{ / }', description: 'review.keys.end'},
  {keys: 'Enter', description: 'review.keys.apply'},
  {keys: 'Space', description: 'review.keys.play'},
  {keys: '?', description: 'review.keys.help'},
] as const;

/** The action of a `KeyboardEvent.key` (modifiers other than Shift are the Studio's or the browser's), or `null`. */
export const reviewKeyAction = (event: {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}): ReviewAction | null => {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key) {
    case 'j':
      return {kind: 'step', direction: 1};
    case 'k':
      return {kind: 'step', direction: -1};
    case '[':
      return {kind: 'nudge', edge: 'start', seconds: -NUDGE_STEP_SECONDS};
    case ']':
      return {kind: 'nudge', edge: 'start', seconds: NUDGE_STEP_SECONDS};
    case '{':
      return {kind: 'nudge', edge: 'end', seconds: -NUDGE_STEP_SECONDS};
    case '}':
      return {kind: 'nudge', edge: 'end', seconds: NUDGE_STEP_SECONDS};
    case 'Enter':
      return {kind: 'apply'};
    case ' ':
    case 'Spacebar':
      return {kind: 'toggle-playback'};
    case '?':
      return {kind: 'help'};
    default:
      return null;
  }
};

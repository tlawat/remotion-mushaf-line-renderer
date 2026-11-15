import {type MushafLineData, type MushafWord, sliceWords} from '@tlawat/remotion-mushaf-line';
import {MushafStudioError} from '../errors';
import type {LineSplit} from '../types';

const where = (line: Pick<MushafLineData, 'page' | 'line'>): string => `page ${line.page} line ${line.line}`;

const bandOf = (words: readonly MushafWord[]): string =>
  words.length === 0 ? 'no words' : `words ${words[0]!.wordId}-${words[words.length - 1]!.wordId}`;

/**
 * Splits a line at `atWordId` into two: the words before it and the words from it on, each with a
 * word-range slice (`{fromWordId, toWordId}`) intersected with the slice the line already carries.
 * Throws `BAD_LINE_SPLIT` when the word is not on the line, is its first word, or falls outside
 * the line's existing slice (a split must leave words on both sides).
 */
export const splitLineAt = (
  line: MushafLineData,
  atWordId: number,
): readonly [first: MushafLineData, second: MushafLineData] => {
  const details = {page: line.page, line: line.line, atWordId};
  const kept = sliceWords(line);
  const at = kept.findIndex((word) => word.wordId === atWordId);
  if (at < 0) {
    const onLine = line.words.some((word) => word.wordId === atWordId);
    throw new MushafStudioError(
      'BAD_LINE_SPLIT',
      onLine
        ? `Cannot split ${where(line)} at word ${atWordId}: the line's slice ${JSON.stringify(line.slice)} hides it. Split at one of the words it shows (${bandOf(kept)}).`
        : `Cannot split ${where(line)} at word ${atWordId}: the line carries ${bandOf(line.words)}${line.type === 'ayah' ? '' : ` (a ${line.type} line)`}. Name a word of the line by its wordId.`,
      details,
    );
  }
  if (at === 0) {
    throw new MushafStudioError(
      'BAD_LINE_SPLIT',
      `Cannot split ${where(line)} at word ${atWordId}: it is the first word the line shows, and a split must leave words on both sides${kept.length > 1 ? ` (split at ${kept[1]!.wordId} or later)` : ''}.`,
      details,
    );
  }
  // Both bands are closed on the words the line keeps, so a slice that already hid the line's
  // first or last words stays in force on the half that inherits them.
  const first: MushafLineData = {...line, slice: {fromWordId: kept[0]!.wordId, toWordId: kept[at - 1]!.wordId}};
  const second: MushafLineData = {...line, slice: {fromWordId: atWordId, toWordId: kept[kept.length - 1]!.wordId}};
  return [first, second];
};

const keyOf = (line: Pick<LineSplit, 'page' | 'line'>): string => `${line.page}:${line.line}`;

/**
 * Applies every split to a passage: the lines named by `splits` are replaced by their two halves
 * (several splits on one line apply in word order), the others are untouched. Order is preserved.
 * Throws `BAD_LINE_SPLIT` when a split names a line that is not in `lines`.
 */
export const applySplits = (
  lines: readonly MushafLineData[],
  splits: readonly LineSplit[],
): readonly MushafLineData[] => {
  if (splits.length === 0) return lines;
  const byLine = new Map<string, number[]>();
  for (const split of splits) {
    const key = keyOf(split);
    byLine.set(key, [...(byLine.get(key) ?? []), split.atWordId]);
  }
  const present = new Set(lines.map(keyOf));
  const missing = [...byLine.keys()].filter((key) => !present.has(key));
  if (missing.length > 0) {
    const name = (key: string) => {
      const [page, line] = key.split(':');
      return `page ${page} line ${line}`;
    };
    throw new MushafStudioError(
      'BAD_LINE_SPLIT',
      `splits name ${missing.map(name).join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not in the passage (its lines: ${lines.length === 0 ? 'none' : [...present].map(name).join(', ')}). Remove the split or widen the ayah range.`,
      {missing: missing.map((key) => ({page: Number(key.split(':')[0]), line: Number(key.split(':')[1])}))},
    );
  }
  const out: MushafLineData[] = [];
  for (const line of lines) {
    const ats = byLine.get(keyOf(line));
    if (!ats) {
      out.push(line);
      continue;
    }
    let rest = line;
    for (const at of [...new Set(ats)].sort((a, b) => a - b)) {
      const [head, tail] = splitLineAt(rest, at);
      out.push(head);
      rest = tail;
    }
    out.push(rest);
  }
  return out;
};

/** What `fitSplits()` gives: the passage with the splits that fit applied, and those that do not. */
export type FittedSplits = {
  readonly lines: readonly MushafLineData[];
  /** The splits left out, in the order `splits` gives them: their line is not in the passage, or their word cannot be split at. */
  readonly dropped: readonly LineSplit[];
};

/**
 * `applySplits()` that leaves out what does not fit instead of throwing: a split naming a line the
 * passage does not have, or a word its line cannot be split at (hidden by the slice, the first word
 * shown, or not on the line). What the Studio resolves with, so a range or `slice` changed under
 * the splits still shows the composition, and the Mushaf panel that removes them; a render applies
 * them with `applySplits()`, which refuses them.
 *
 * `fitSplits(fatihaLines(2, 5), [{page: 1, line: 8, atWordId: 30}])` keeps the lines and drops the split.
 */
export const fitSplits = (lines: readonly MushafLineData[], splits: readonly LineSplit[]): FittedSplits => {
  if (splits.length === 0) return {lines, dropped: []};
  const byLine = new Map<string, number[]>();
  for (const split of splits) {
    const key = keyOf(split);
    byLine.set(key, [...(byLine.get(key) ?? []), split.atWordId]);
  }
  const misfits = new Set<string>();
  const present = new Set(lines.map(keyOf));
  for (const [key, ats] of byLine) if (!present.has(key)) for (const at of ats) misfits.add(`${key}:${at}`);
  const out: MushafLineData[] = [];
  for (const line of lines) {
    const ats = byLine.get(keyOf(line));
    if (!ats) {
      out.push(line);
      continue;
    }
    let rest = line;
    for (const at of [...new Set(ats)].sort((a, b) => a - b)) {
      try {
        const [head, tail] = splitLineAt(rest, at);
        out.push(head);
        rest = tail;
      } catch {
        misfits.add(`${keyOf(line)}:${at}`);
      }
    }
    out.push(rest);
  }
  return {lines: out, dropped: splits.filter((split) => misfits.has(`${keyOf(split)}:${split.atWordId}`))};
};

const namedSplits = (splits: readonly LineSplit[]): string =>
  splits.map((split) => `page ${split.page} line ${split.line} at word ${split.atWordId}`).join(', ');

/**
 * What the Studio's preview says about splits `fitSplits()` left out, `null` for none: which, why,
 * and where to remove them. In English, like the composition's other preview warnings (the fonts,
 * the audio analysis): `<StudioWarnings>` does not follow the panel's language.
 */
export const droppedSplitsWarning = (dropped: readonly LineSplit[]): string | null => {
  if (dropped.length === 0) return null;
  const named = namedSplits(dropped);
  const one = dropped.length === 1;
  return `${one ? 'A line split does' : `${dropped.length} line splits do`} not fit the passage and ${one ? 'is' : 'are'} not applied (${named}): the ayah range or slice changed since. Remove ${one ? 'it' : 'them'} in the Mushaf panel's Lines tab; a render refuses ${one ? 'it' : 'them'}.`;
};

/**
 * The `BAD_LINE_SPLIT` a render throws for splits `fitSplits()` left out, `null` for none: what the
 * composition refuses with when a `resolved` made for the Studio's preview reaches a render, which
 * `calculateMetadata()` cannot tell apart from the preview (the Studio's in-browser render reports
 * itself only through `useRemotionEnvironment()`). Names each split and the two ways out.
 *
 * `droppedSplitsError([{page: 1, line: 8, atWordId: 26}])?.details` is `{splits: [{page: 1, line: 8, atWordId: 26}]}`.
 */
export const droppedSplitsError = (dropped: readonly LineSplit[]): MushafStudioError | null => {
  if (dropped.length === 0) return null;
  const one = dropped.length === 1;
  return new MushafStudioError(
    'BAD_LINE_SPLIT',
    `${one ? 'A line split does' : `${dropped.length} line splits do`} not fit the passage (${namedSplits(dropped)}), and a render does not leave ${one ? 'it' : 'them'} out. Remove ${one ? 'it' : 'them'} in the Mushaf panel's Lines tab (or from \`splits\`), or widen the ayah range or the slice back to ${one ? 'its line' : 'their lines'}.`,
    {splits: dropped},
  );
};

/**
 * The word (by `wordId`) a split must name to cut a line before `position` of `ayah`, for the
 * panel: the first word of the line at that location in reading order, so a marker that shares the
 * location of the word it precedes (a rub-el-hizb) goes with its word. `null` when the line does
 * not carry it.
 */
export const wordIdAt = (line: MushafLineData, surah: number, ayah: number, position: number): number | null =>
  line.words.find((word) => word.surah === surah && word.ayah === ayah && word.position === position)?.wordId ?? null;

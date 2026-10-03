// The studio's word timings as Remotion captions and back, so that a caption editor (the Studio's,
// or any tool that reads `Caption[]`) can be used on them. Pure: no clock, no network.
import {type AyahTiming, parseRecitationTimings, type WordTiming} from '@tlawat/remotion-mushaf-line';
import {describeValue, MushafStudioError} from '../errors';
import type {AlignmentWord, StudioTimings} from '../types';

/**
 * One caption, the shape of Remotion's `Caption` (`@remotion/captions`, restated here so that the
 * studio does not depend on it; its optional `pageBreakAfter` is left out): times in whole
 * milliseconds from the start of the recording, `timestampMs` when the word starts, `confidence`
 * 0-1 or `null` when nothing says.
 */
export type Caption = {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly timestampMs: number | null;
  readonly confidence: number | null;
};

export type ToCaptionsOptions = {
  /**
   * A word's text when the sidecar does not have it (timings without `alignment`): the passage's
   * `MushafWord.text` by id, for instance. `null`, or no function, names the word by its id.
   */
  readonly textOf?: ((wordId: string) => string | null) | undefined;
  /** Also caption the ayah-end markers, as `۝` and the ayah number in Arabic-Indic digits (`'۝٧'`). Default `false`. */
  readonly markers?: boolean | undefined;
};

/** One caption's worth of the timings: a timed word occurrence, or an ayah timed without words. */
type Slot = {
  /** Index into `ayat`. */
  readonly ayahIndex: number;
  /** Index into the ayah's `words`; `null` for an ayah without words, which is one caption. */
  readonly wordIndex: number | null;
  readonly start: number;
  readonly end: number;
  /** The ayah-end marker: a word the timings time and the aligner never heard. */
  readonly marker: boolean;
  /** Index into `alignment.words` of this very occurrence (same id, same rank), else `null`. */
  readonly heard: number | null;
  /** The word's text as the sidecar has it: this occurrence's, else the first one's. */
  readonly heardText: string | null;
};

const AYAH_END = '۝';

const toMs = (seconds: number): number => Math.round(seconds * 1000);

const arabicIndic = (n: number): string => String(n).replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));

/**
 * Every caption the timings make, markers included, in audio order. The k-th occurrence of an id in
 * the timings is the k-th in the sidecar: both list a repeated word in the order it was said.
 */
const slotsOf = (timings: StudioTimings): Slot[] => {
  const sidecar = timings.alignment;
  const heardById = new Map<string, number[]>();
  for (const [i, word] of (sidecar?.words ?? []).entries()) {
    const list = heardById.get(word.id);
    if (list === undefined) heardById.set(word.id, [i]);
    else list.push(i);
  }
  const rank = new Map<string, number>();
  const slots: Slot[] = [];
  for (const [ayahIndex, ayah] of timings.ayat.entries()) {
    // The package interpolates an empty `words` like a missing one: no word is timed.
    if (ayah.words === undefined || ayah.words.length === 0) {
      const {start, end} = ayah;
      slots.push({ayahIndex, wordIndex: null, start, end, marker: false, heard: null, heardText: null});
      continue;
    }
    for (const [wordIndex, {id, start, end}] of ayah.words.entries()) {
      const occurrence = rank.get(id) ?? 0;
      rank.set(id, occurrence + 1);
      const heard = heardById.get(id);
      const own = heard?.[occurrence];
      slots.push({
        ayahIndex,
        wordIndex,
        start,
        end,
        marker: sidecar !== undefined && heard === undefined,
        heard: own ?? null,
        heardText: heard === undefined ? null : sidecar!.words[own ?? heard[0]!]!.text,
      });
    }
  }
  // Stable: words said at the same moment keep the file's order (by ayah, then by word).
  return slots.sort((x, y) => x.start - y.start);
};

/**
 * The timings as Remotion captions: one per timed word occurrence, in audio order, times in whole
 * milliseconds. A word's text is the sidecar's Uthmani text, else `textOf(id)`, else its id; its
 * confidence is that of the aligner segment it was heard in, else `null`. An ayah timed without
 * words is one caption, `"<surah>:<ayah>"`, over the ayah's span: its words are not invented. The
 * ayah-end markers (words the sidecar never heard; without a sidecar there are none) are left out
 * unless `markers` is `true`. `fromCaptions()` takes the captions back.
 *
 * ```ts
 * toCaptions(timings)[0]; // {text: 'ٱلْحَمْدُ', startMs: 320, endMs: 890, timestampMs: 320, confidence: 1}
 * ```
 */
export const toCaptions = (timings: StudioTimings, options: ToCaptionsOptions = {}): readonly Caption[] => {
  const heard: readonly AlignmentWord[] = timings.alignment?.words ?? [];
  const confidence = new Map((timings.alignment?.segments ?? []).map((s) => [s.segment, s.confidence]));
  const captions: Caption[] = [];
  for (const slot of slotsOf(timings)) {
    if (slot.marker && options.markers !== true) continue;
    const ayah = timings.ayat[slot.ayahIndex]!;
    const caption = (text: string, score: number | null): Caption => {
      const startMs = toMs(slot.start);
      return {text, startMs, endMs: toMs(slot.end), timestampMs: startMs, confidence: score};
    };
    if (slot.wordIndex === null) captions.push(caption(`${timings.surah}:${ayah.ayah}`, null));
    else if (slot.marker) captions.push(caption(`${AYAH_END}${arabicIndic(ayah.ayah)}`, null));
    else {
      const {id} = ayah.words![slot.wordIndex]!;
      const segment = slot.heard === null ? undefined : heard[slot.heard]!.segment;
      captions.push(
        caption(
          slot.heardText ?? options.textOf?.(id) ?? id,
          segment === undefined ? null : (confidence.get(segment) ?? null),
        ),
      );
    }
  }
  return captions;
};

const badCaption = (index: number, caption: Caption, problem: string): never => {
  throw new MushafStudioError(
    'BAD_STUDIO_PROP',
    `Caption ${index} (${describeValue(caption.text)}) ${problem}. Fix it in the caption editor, or start again from toCaptions().`,
    {index},
  );
};

const isMs = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const checkCaptions = (captions: readonly Caption[]): void => {
  for (const [i, caption] of captions.entries()) {
    if (!isMs(caption.startMs))
      badCaption(i, caption, `starts at ${describeValue(caption.startMs)}: expected milliseconds, 0 or more`);
    if (!isMs(caption.endMs) || caption.endMs < caption.startMs)
      badCaption(i, caption, `ends at ${describeValue(caption.endMs)}, before its start (${caption.startMs})`);
    const previous = captions[i - 1];
    if (previous !== undefined && caption.startMs < previous.startMs)
      badCaption(
        i,
        caption,
        `starts at ${caption.startMs} ms, before caption ${i - 1} (${previous.startMs} ms): the words must stay in audio order`,
      );
  }
};

/**
 * Takes captions made by `toCaptions()` from `base`, and edited, back into timings. A caption is
 * the occurrence it was made from, by position: the ids come from `base`, never from the text, so
 * editing a caption's text changes nothing. Each changed word takes the caption's times (seconds,
 * to the millisecond) here and in `alignment.words`; an ayah with a changed word spans its words
 * again (its marker included), and the caption of an ayah without words is that ayah's span. When
 * the captions leave the markers out, a marker starts where the word before it now ends, and ends
 * where it did unless that word now ends later. Everything else of `base` (`audio`, `source`, the
 * sidecar's segments and edits) is kept: an unchanged round trip returns `base` deep-equal. The
 * edit is not logged in `alignment.edits`; the caller decides.
 *
 * Throws `BAD_STUDIO_PROP` when the count is not the one `toCaptions()` makes (with or without the
 * markers), when a caption starts before the one before it or ends before it starts, and when the
 * result is not valid recitation timings.
 */
export const fromCaptions = (captions: readonly Caption[], base: StudioTimings): StudioTimings => {
  const all = slotsOf(base);
  const words = all.filter((slot) => !slot.marker);
  const withMarkers = captions.length === all.length;
  if (!withMarkers && captions.length !== words.length)
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `fromCaptions() got ${captions.length} captions, but the timings make ${words.length} (${all.length} with the ayah-end markers). Edit the captions toCaptions() made from these same timings, without adding or removing any.`,
      {captions: captions.length, expected: words.length, expectedWithMarkers: all.length},
    );
  checkCaptions(captions);
  const slots = withMarkers ? all : words;
  const editedWords = new Map<number, WordTiming[]>();
  const spans = new Map<number, {readonly start: number; readonly end: number}>();
  const heard = new Map<number, {readonly start: number; readonly end: number}>();
  for (const [i, caption] of captions.entries()) {
    const slot = slots[i]!;
    const startMs = Math.round(caption.startMs);
    const endMs = Math.round(caption.endMs);
    // An untouched caption leaves its word exactly as it was, below the millisecond too.
    if (startMs === toMs(slot.start) && endMs === toMs(slot.end)) continue;
    const span = {start: startMs / 1000, end: endMs / 1000};
    if (slot.wordIndex === null) {
      spans.set(slot.ayahIndex, span);
      continue;
    }
    const list = editedWords.get(slot.ayahIndex) ?? [...base.ayat[slot.ayahIndex]!.words!];
    editedWords.set(slot.ayahIndex, list);
    list[slot.wordIndex] = {id: list[slot.wordIndex]!.id, ...span};
    if (slot.heard !== null) heard.set(slot.heard, span);
  }
  if (!withMarkers) {
    for (const slot of all) {
      const list = editedWords.get(slot.ayahIndex);
      if (!slot.marker || list === undefined || slot.wordIndex === null || slot.wordIndex === 0) continue;
      const before = list[slot.wordIndex - 1]!;
      if (before.end === base.ayat[slot.ayahIndex]!.words![slot.wordIndex - 1]!.end) continue;
      const marker = list[slot.wordIndex]!;
      list[slot.wordIndex] = {id: marker.id, start: before.end, end: Math.max(before.end, marker.end)};
    }
  }
  const ayat = base.ayat.map((ayah, a): AyahTiming => {
    const span = spans.get(a);
    if (span !== undefined) return {...ayah, ...span};
    const list = editedWords.get(a);
    if (list === undefined) return ayah;
    return {
      ...ayah,
      start: Math.min(...list.map((w) => w.start)),
      end: Math.max(...list.map((w) => w.end)),
      words: list,
    };
  });
  const sidecar = base.alignment;
  const alignment =
    sidecar === undefined || heard.size === 0
      ? sidecar
      : {...sidecar, words: sidecar.words.map((w, i) => ({...w, ...heard.get(i)}))};
  const result: StudioTimings = {...base, ayat, ...(alignment === undefined ? {} : {alignment})};
  try {
    parseRecitationTimings(result);
  } catch (error) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `The edited captions do not make valid recitation timings: ${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
  return result;
};

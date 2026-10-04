import {
  getMushafLines,
  type LineSchedule,
  type MushafLineData,
  type MushafWord,
  type RecitedRange,
  recitedRange,
  scheduleLines,
} from '@tlawat/remotion-mushaf-line';
import {staticFile as remotionStaticFile} from 'remotion';
import {recitationDuration} from '../compositions/recitation/calculate-metadata';
import {
  audioOffsetFor,
  playableTimings,
  readTimings,
  shiftTimings,
  timingsInRange,
} from '../compositions/recitation/resolve';
import {STUDIO_FPS} from '../compositions/shared';
import {MushafStudioError} from '../errors';
import {doubtfulWords} from '../lines';
import {dataSourceFrom, defaultAnimation, themeSelectionFrom} from '../schema';
import type {DoubtReason, StudioTimings} from '../types';
import type {MushafPageProps} from './schema';

/** When one line of the passage is the one being recited, in seconds of the composition. */
export type PageLineSlot = {
  readonly page: number;
  readonly line: number;
  readonly start: number;
  readonly end: number;
};

/** One printed page of the passage and when it is on screen, in seconds; it turns away at `end`. */
export type PageSlot = {
  readonly page: number;
  /** Every line of the page, `surah_name` and `basmallah` lines included, in printed order. */
  readonly lines: readonly MushafLineData[];
  /** When the page starts to turn in: its first recited word less the turn time (0 for the first page). */
  readonly start: number;
  /** The next page's `start`; for the last page, the end of the composition. */
  readonly end: number;
};

/** What `resolvePage()` gives `<MushafPage>`: the timings, the pages and when each line is current. */
export type ResolvedPage = {
  /** Trimmed to the range and to the ayahs carried whole, moved `audioOffsetSeconds` earlier. */
  readonly timings: StudioTimings;
  /** Seconds of the recording skipped at the start; the `<Audio trimBefore>`. */
  readonly audioOffsetSeconds: number;
  /** The ayahs followed: the words outside it are dimmed on the page. */
  readonly range: RecitedRange;
  /** The pages, in reading order, their starts never decreasing. */
  readonly pages: readonly PageSlot[];
  /** The recited lines, in reading order, by page and line number. */
  readonly lines: readonly PageLineSlot[];
  /** What `doubtfulWords()` found in the range, for the Studio's review marks. */
  readonly doubtful: Readonly<Record<string, readonly DoubtReason[]>>;
};

export type ResolvePageOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly staticFile?: ((path: string) => string) | undefined;
  /** `calculateMetadata()`'s `abortSignal`: the Studio aborts a resolution it no longer needs. */
  readonly signal?: AbortSignal | undefined;
};

/** Whether a word is one of the ayahs followed: the others are dimmed, not hidden. */
export const inRange = (word: Pick<MushafWord, 'surah' | 'ayah'>, range: RecitedRange): boolean =>
  word.surah === range.surah && word.ayah >= range.fromAyah && word.ayah <= range.toAyah;

/**
 * The schedule of the passage's lines (`scheduleLines()` over `passage`) by page and line number,
 * which is how the page finds its current line: a line of the passage is one printed line.
 */
export const pageLineSlots = (
  passage: readonly MushafLineData[],
  schedule: readonly LineSchedule[],
): readonly PageLineSlot[] =>
  schedule.map(({index, start, end}) => {
    const line = passage[index]!;
    return {page: line.page, line: line.line, start, end};
  });

/**
 * The pages a passage is on, by `line.page` in reading order, with when each is on screen: from its
 * first current line's start less `turnSeconds` (the first page from 0) to the next page's start,
 * the last page to `endSeconds`. Starts never decrease, and a page none of whose lines is scheduled
 * is left out. `lines` of each slot are the passage's own here; `resolvePage()` swaps in the whole
 * page.
 */
export const schedulePages = (
  slots: readonly PageLineSlot[],
  turnSeconds: number,
  endSeconds: number,
): readonly {readonly page: number; readonly start: number; readonly end: number}[] => {
  const firsts: {page: number; start: number}[] = [];
  for (const slot of slots) {
    const last = firsts[firsts.length - 1];
    if (last?.page === slot.page) continue;
    const start = firsts.length === 0 ? 0 : Math.max(last!.start, Math.max(0, slot.start - turnSeconds));
    firsts.push({page: slot.page, start});
  }
  return firsts.map((page, i) => ({...page, end: Math.max(page.start, firsts[i + 1]?.start ?? endSeconds)}));
};

/** The line being recited at `seconds`: the last slot started by then, `null` before the first. */
export const pageLineAt = (slots: readonly PageLineSlot[], seconds: number): PageLineSlot | null => {
  let current: PageLineSlot | null = null;
  for (const slot of slots) {
    if (slot.start <= seconds) current = slot;
    else break;
  }
  return current;
};

/** Seconds a line is in place before its first word when a later ayah opens: the recitation's default. */
const LEAD_IN_SECONDS = defaultAnimation.leadInSeconds;

/**
 * Resolves the content props once: fetches and validates the timings, trims them to the ayah range
 * and to the ayahs the recording carries whole, moves them `audioOffsetSeconds` earlier (see
 * `audioOffsetFor()`), finds the passage's lines (`getMushafLines(recitedRange(...))`) and
 * schedules them, then loads every page they are on whole (`getMushafLines({page})`) and schedules
 * the pages (`schedulePages()`, with `pageView.turnSeconds`). Pure given `fetch`.
 */
export const resolvePage = async (props: MushafPageProps, options: ResolvePageOptions = {}): Promise<ResolvedPage> => {
  // Wrapped, not referenced: the native fetch called as a method of another object throws in browsers.
  const io = {
    fetch: options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)),
    staticFile: options.staticFile ?? remotionStaticFile,
    ...(options.signal ? {signal: options.signal} : {}),
  };
  const file = await readTimings(props.timingsFile, io);
  const ranged = timingsInRange(file, props.fromAyah, props.toAyah);
  const played = playableTimings(ranged);
  const audioOffsetSeconds = audioOffsetFor(file, played, LEAD_IN_SECONDS);
  const timings = shiftTimings(played, audioOffsetSeconds);
  const theme = themeSelectionFrom(props.theme, props.customTheme);
  const data = dataSourceFrom(props.data, io.staticFile);
  const range = recitedRange(timings);
  const passage = await getMushafLines({...range, theme, data});
  const lines = pageLineSlots(passage, scheduleLines(passage, timings, {occurrence: props.highlight.occurrence}));
  if (lines.length === 0) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `No line of surah ${range.surah} ayahs ${range.fromAyah}-${range.toAyah} carries a timed word; the timings and the mushaf data do not agree. Realign the recording.`,
      {prop: 'timingsFile', file: props.timingsFile},
    );
  }
  const endSeconds = recitationDuration(timings, STUDIO_FPS) / STUDIO_FPS;
  const scheduled = schedulePages(lines, props.pageView.turnSeconds, endSeconds);
  const wholePages = await Promise.all(scheduled.map(({page}) => getMushafLines({page, theme, data})));
  return {
    timings,
    audioOffsetSeconds,
    range,
    pages: scheduled.map((slot, i) => ({...slot, lines: wholePages[i]!})),
    lines,
    doubtful: doubtfulWords(ranged, {threshold: props.review.confidenceThreshold}),
  };
};

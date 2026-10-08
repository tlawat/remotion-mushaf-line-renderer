import {
  enterTiming,
  getMushafLines,
  getMushafLinesForRanges,
  type LineSchedule,
  type MushafDataSource,
  type MushafLineData,
  type MushafThemeSelection,
  parseRecitationTimings,
  recitedRange,
  recitedRanges,
  scheduleLines,
} from '@tlawat/remotion-mushaf-line';
import {staticFile as remotionStaticFile} from 'remotion';
import {describeValue, MushafStudioError} from '../../errors';
import {applySplits, doubtfulWords} from '../../lines';
import {clipTimeline, type MemorizeClip} from '../../memorize/timeline';
import {dataSourceFrom, type Memorize, themeSelectionFrom} from '../../schema';
import type {ResolvedRecitation, StudioTimings, StudioTimingsV1, StudioTimingsV2} from '../../types';
import {loadTranslationLayers, recitedPassageOf, resolveEndCardContent, translationLayerSpecs} from '../extras';
import {
  fileUrl,
  headerSeconds,
  loadTextFile,
  STUDIO_FPS,
  surahHeaderLines,
  withHeaderSlots,
  withInnerHeaderSlots,
} from '../shared';
import {ayahKeysOf, filterAyat, mapAyat, passageSpan} from '../timings';
import type {MushafRecitationProps} from './schema';

export type ResolveRecitationOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly staticFile?: ((path: string) => string) | undefined;
  /** `calculateMetadata()`'s `abortSignal`: the Studio aborts a resolution it no longer needs. */
  readonly signal?: AbortSignal | undefined;
};

const bad = (message: string, details: Readonly<Record<string, unknown>> = {}): MushafStudioError =>
  new MushafStudioError('BAD_STUDIO_PROP', message, details);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The timings file's optional `alignment` key, as the studio writes it: enough of a check that
 * the Review tab can trust its arrays. The main package validates the rest and lets the key
 * through untouched.
 */
const assertSidecar = (file: string, value: unknown): void => {
  if (value === undefined) return;
  const problem = (why: string) =>
    bad(
      `timingsFile ${describeValue(file)} has an "alignment" sidecar that ${why}. The studio writes {version: 1, source, segments: [], words: [], edits: []}; remove the key to use the timings alone.`,
      {prop: 'timingsFile', file},
    );
  if (!isRecord(value)) throw problem(`is ${describeValue(value)}, not an object`);
  if (value.version !== 1) throw problem(`has version ${describeValue(value.version)}, not 1`);
  for (const key of ['segments', 'words', 'edits'] as const) {
    if (!Array.isArray(value[key])) throw problem(`has no "${key}" array`);
  }
};

/**
 * Fetches and validates the timings file: the package's format of either version (one surah, or a
 * recording that crosses surahs), with the studio's sidecar when present.
 */
export const readTimings = async (
  file: string,
  options: {
    readonly fetch: typeof fetch;
    readonly staticFile: (path: string) => string;
    readonly signal?: AbortSignal | undefined;
  },
): Promise<StudioTimings> => {
  if (file === '') {
    throw bad(
      'timingsFile is empty. Pick a recitation in the Mushaf panel, or set it to a RecitationTimings JSON in public/ (e.g. "mushaf-studio/fatiha/timings.json").',
      {prop: 'timingsFile'},
    );
  }
  const url = fileUrl(file, options.staticFile);
  let response: Response;
  try {
    // The panel rewrites the same file in place (a nudge, a split): never serve a cached copy.
    const request = options.fetch;
    response = await request(url, {cache: 'no-store', ...(options.signal ? {signal: options.signal} : {})});
  } catch (cause) {
    throw bad(
      `timingsFile ${describeValue(file)} could not be fetched from ${url}: ${cause instanceof Error ? cause.message : String(cause)}. Check the path (under public/) or the URL.`,
      {prop: 'timingsFile', file, url},
    );
  }
  if (!response.ok) {
    throw bad(
      `timingsFile ${describeValue(file)} could not be fetched from ${url}: HTTP ${response.status}. Check the path (under public/) or the URL.`,
      {prop: 'timingsFile', file, url, status: response.status},
    );
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw bad(`timingsFile ${describeValue(file)} is not JSON. It must be a RecitationTimings file.`, {
      prop: 'timingsFile',
      file,
      url,
    });
  }
  // BAD_RECITATION_TIMINGS from the package passes through: it names the field and the format.
  const timings = parseRecitationTimings(json);
  assertSidecar(file, (json as {alignment?: unknown}).alignment);
  return timings as StudioTimings;
};

const bounds = (timings: StudioTimings): {readonly first: number; readonly last: number} => ({
  first: timings.ayat[0]!.ayah,
  last: timings.ayat[timings.ayat.length - 1]!.ayah,
});

/** The first and last ayah of timings that cross surahs, for a message: `"113:4-114:2"`. */
const spanText = (timings: StudioTimings): string => {
  const {from, to} = passageSpan(timings);
  return `${from.surah}:${from.ayah}-${to.surah}:${to.ayah}`;
};

/**
 * The file's ayahs in `fromAyah`..`toAyah` (0 keeps the file's bound), the ones the recording does
 * not carry whole included: what the Review tab marks. Throws `BAD_STUDIO_PROP` for a reversed range
 * or one that reaches none of the file's ayahs, naming what the file carries.
 *
 * The range is a range of one surah: a file that crosses surahs (version 2) is used whole, whatever
 * `fromAyah` and `toAyah` say (cut the recording and its timings to play part of it).
 */
export const timingsInRange = (timings: StudioTimings, fromAyah: number, toAyah: number): StudioTimings => {
  if (timings.version === 2) return timings;
  if (fromAyah > 0 && toAyah > 0 && toAyah < fromAyah) {
    throw bad(`toAyah (${toAyah}) is before fromAyah (${fromAyah}). Set toAyah to ${fromAyah} or later, or to 0.`, {
      prop: 'toAyah',
      fromAyah,
      toAyah,
    });
  }
  const ayat = timings.ayat.filter((a) => (fromAyah === 0 || a.ayah >= fromAyah) && (toAyah === 0 || a.ayah <= toAyah));
  if (ayat.length === 0) {
    const {first, last} = bounds(timings);
    const range = `${fromAyah === 0 ? first : fromAyah}-${toAyah === 0 ? last : toAyah}`;
    throw bad(
      `fromAyah/toAyah (${range}) reach none of the timings' ayahs: the file carries ayahs ${first}-${last} of surah ${timings.surah}. Widen the range or set both to 0.`,
      {prop: 'fromAyah', fromAyah, toAyah, surah: timings.surah, first, last},
    );
  }
  return {...timings, ayat};
};

/**
 * The ayahs the composition plays: without the ones the recording does not carry whole
 * (`complete: false`). Throws `BAD_STUDIO_PROP` when nothing is left, naming the ayahs given.
 */
export const playableTimings = (timings: StudioTimings): StudioTimings => {
  const played = filterAyat(timings, (a) => a.complete !== false);
  if (played.ayat.length > 0) return played;
  if (timings.version === 2) {
    const {from, to} = passageSpan(timings);
    throw bad(
      `The timings' ayahs ${spanText(timings)} are all ayahs the recording does not carry whole (complete: false). Realign the recording, or cut it to the ayahs it carries whole.`,
      {prop: 'timingsFile', from, to},
    );
  }
  const {first, last} = bounds(timings);
  throw bad(
    `Ayahs ${first}-${last} of surah ${timings.surah} are all ayahs the recording does not carry whole (complete: false). Widen fromAyah/toAyah past them, or realign the recording.`,
    {prop: 'fromAyah', surah: timings.surah, first, last},
  );
};

/** `playableTimings(timingsInRange(...))`: the ayat the composition plays, cut to the range and whole. */
export const trimTimings = (timings: StudioTimings, fromAyah: number, toAyah: number): StudioTimings =>
  playableTimings(timingsInRange(timings, fromAyah, toAyah));

/** Float noise from a subtraction (3.533 − 2.633 is 0.8999999999999999) rounded off at the microsecond, finer than any aligner. */
const roundTime = (seconds: number): number => Math.round(seconds * 1e6) / 1e6;

/**
 * How far into the recording the composition starts, in seconds: 0 when the first ayah played is
 * the file's first (the file's own lead-in is kept), else just enough before the first played
 * ayah's start for its line to enter (the package's default entrance) and sit `leadInSeconds`, so
 * a `fromAyah` or a leading `complete: false` ayah does not open on a blank screen with the audio
 * playing. Never negative: a first ayah too close to the start of the file keeps its own lead-in.
 */
export const audioOffsetFor = (file: StudioTimings, played: StudioTimings, leadInSeconds: number): number => {
  const first = played.ayat[0]!;
  const opens = passageSpan(played).from;
  const fileOpens = passageSpan(file).from;
  if (opens.surah === fileOpens.surah && opens.ayah === fileOpens.ayah) return 0;
  const enterSeconds = enterTiming().getDurationInFrames({fps: STUDIO_FPS}) / STUDIO_FPS;
  return Math.max(0, roundTime(first.start - leadInSeconds - enterSeconds));
};

/**
 * The timings `offset` seconds earlier: every ayah and word, and the sidecar's words and segments,
 * which share the recording's base. The same object for an offset of 0, so a file played from its
 * start keeps its identity (and its byte-for-byte round trip).
 */
export const shiftTimings = (timings: StudioTimings, offset: number): StudioTimings => {
  if (offset === 0) return timings;
  const shift = (seconds: number): number => roundTime(seconds - offset);
  const shifted = mapAyat(timings, (ayah) => ({
    ...ayah,
    start: shift(ayah.start),
    end: shift(ayah.end),
    ...(ayah.words
      ? {words: ayah.words.map((word) => ({...word, start: shift(word.start), end: shift(word.end)}))}
      : {}),
  }));
  const sidecar = timings.alignment;
  if (!sidecar) return shifted;
  return {
    ...shifted,
    alignment: {
      ...sidecar,
      segments: sidecar.segments.map((s) => ({...s, timeFrom: shift(s.timeFrom), timeTo: shift(s.timeTo)})),
      words: sidecar.words.map((w) => ({...w, start: shift(w.start), end: shift(w.end)})),
    },
  };
};

/**
 * What `resolveRecitation()` gives: `ResolvedRecitation` and the clip timeline of `memorize`
 * (`clipTimeline()`), one clip per ayah at its own time when ayahs play once.
 */
export type ResolvedRecitationWithClips = ResolvedRecitation & {readonly clips: readonly MemorizeClip[]};

type PassageLines = {
  /** The lines found for the timings, splits applied, without the leading header lines. */
  readonly split: readonly MushafLineData[];
  /** `split` with the leading header lines first. */
  readonly lines: readonly MushafLineData[];
  readonly schedule: readonly LineSchedule[];
};

type LineSources = {
  readonly theme: MushafThemeSelection;
  readonly data: MushafDataSource | undefined;
  readonly spacingSeconds: number;
};

/**
 * The lines of one surah's timings (version 1): `getMushafLines(recitedRange(...))`, sliced, the
 * splits applied, scheduled, after the surah's header lines when `header` asks for them and the
 * recitation starts at ayah 1 (`surahHeaderLines()`, `withHeaderSlots()`).
 */
const oneSurahLines = async (
  timings: StudioTimingsV1,
  props: MushafRecitationProps,
  {theme, data, spacingSeconds}: LineSources,
): Promise<PassageLines> => {
  const found = await getMushafLines({...recitedRange(timings), theme, slice: props.slice, data});
  const split = applySplits(found, props.splits);
  const timed = scheduleLines(split, timings, {occurrence: props.highlight.occurrence});
  if (timed.length === 0) {
    const {first, last} = bounds(timings);
    throw bad(
      `No line of surah ${timings.surah} ayahs ${first}-${last} carries a timed word; the timings and the mushaf data do not agree. Realign the recording.`,
      {prop: 'timingsFile', file: props.timingsFile},
    );
  }
  // The surah's header goes before its first ayah only: a recitation from a later ayah has none.
  const headers =
    timings.ayat[0]!.ayah === 1 && split[0]
      ? await surahHeaderLines(timings.surah, split[0], props.header, {theme, data})
      : [];
  const schedule = withHeaderSlots(timed, headers.length, spacingSeconds);
  return {split, lines: headers.length === 0 ? split : [...headers, ...split], schedule};
};

/**
 * The lines of timings that cross surahs (version 2): `getMushafLinesForRanges(recitedRanges(...))`,
 * sliced, with each later surah's header lines between two surahs as printed (its name, and its
 * basmalah when it has one: they mark where the surah begins, whatever `header` says), the splits
 * applied, after the first surah's header lines when `header` asks for them and it starts at ayah 1,
 * and every header line given a slot before the ayah it opens (`withInnerHeaderSlots()`).
 */
const acrossSurahsLines = async (
  timings: StudioTimingsV2,
  props: MushafRecitationProps,
  {theme, data, spacingSeconds}: LineSources,
): Promise<PassageLines> => {
  const found = await getMushafLinesForRanges(recitedRanges(timings), {theme, slice: props.slice, data});
  const split = applySplits(found, props.splits);
  if (scheduleLines(split, timings, {occurrence: props.highlight.occurrence}).length === 0) {
    throw bad(
      `No line of ayahs ${spanText(timings)} carries a timed word; the timings and the mushaf data do not agree. Realign the recording.`,
      {prop: 'timingsFile', file: props.timingsFile},
    );
  }
  const {from} = passageSpan(timings);
  const first = split.find((line) => line.type === 'ayah');
  const headers =
    from.ayah === 1 && first ? await surahHeaderLines(from.surah, first, props.header, {theme, data}) : [];
  const lines = headers.length === 0 ? split : [...headers, ...split];
  const timed = scheduleLines(lines, timings, {occurrence: props.highlight.occurrence});
  return {split, lines, schedule: withInnerHeaderSlots(timed, lines, timings, spacingSeconds)};
};

/**
 * Resolves the content props once: fetches and validates the timings, trims them to the ayah
 * range (one surah's timings only: timings that cross surahs are used whole) and to the ayahs the
 * recording carries whole, moves them `audioOffsetSeconds` earlier (see `audioOffsetFor()`), finds
 * the lines (`getMushafLines(recitedRange(...))`, or `getMushafLinesForRanges(recitedRanges(...))`
 * across surahs, sliced), applies the splits, schedules the lines (after the surah's header lines
 * when `header` asks for them and the recitation starts at ayah 1, see `surahHeaderLines()` and
 * `withHeaderSlots()`; across surahs each later surah's header lines come before its ayah 1, see
 * `withInnerHeaderSlots()`), loads the translation and gloss files, and marks the doubtful
 * words of the whole range (an incomplete ayah's words included), and lays out the clip timeline
 * of `memorize` (each ayah played `repeat` times). Pure given `fetch`;
 * `calculateMetadata()` is this plus the size and duration.
 */
export const resolveRecitation = async (
  props: MushafRecitationProps,
  options: ResolveRecitationOptions = {},
): Promise<ResolvedRecitationWithClips> => {
  // `globalThis.fetch` is wrapped, not referenced: calling the native fetch as a method of another
  // object ("io.fetch(url)") throws "Illegal invocation" in browsers.
  const io = {
    fetch: options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)),
    staticFile: options.staticFile ?? remotionStaticFile,
    ...(options.signal ? {signal: options.signal} : {}),
  };
  const file = await readTimings(props.timingsFile, io);
  const inRange = timingsInRange(file, props.fromAyah, props.toAyah);
  const played = playableTimings(inRange);
  const audioOffsetSeconds = audioOffsetFor(file, played, props.animation.leadInSeconds);
  const timings = shiftTimings(played, audioOffsetSeconds);
  const sources = {
    theme: themeSelectionFrom(props.theme, props.customTheme),
    data: dataSourceFrom(props.data, io.staticFile),
    spacingSeconds: headerSeconds(props.overlay),
  };
  const {split, lines, schedule} =
    timings.version === 1
      ? await oneSurahLines(timings, props, sources)
      : await acrossSurahsLines(timings, props, sources);
  // The translations are cut to what can be shown: the ayahs played and those the lines start with.
  const keys = new Set([
    ...ayahKeysOf(timings),
    ...split.flatMap((line) => line.words.map((word) => `${word.surah}:${word.ayah}`)),
  ]);
  const [translations, gloss, transliteration, endCard] = await Promise.all([
    loadTranslationLayers(translationLayerSpecs(props.text), keys, io),
    loadTextFile('word', 'glossFile', props.text.glossFile, io),
    loadTextFile('word', 'transliterationFile', props.text.transliterationFile, io),
    resolveEndCardContent(props.endCard, recitedPassageOf(timings), io),
  ]);
  return {
    timings,
    audioOffsetSeconds,
    lines,
    schedule,
    translation: translations[0] ?? null,
    translations,
    gloss,
    transliteration,
    doubtful: doubtfulWords(inRange, {threshold: props.review.confidenceThreshold}),
    clips: clipTimeline(timings, props.memorize),
    endCard,
  };
};

/**
 * A resolved recitation that starts `seconds` later in the recording (`audio.trimSilence` skipping
 * the leading silence): `audioOffsetSeconds` grows by it, and the timings, the schedule (never
 * before 0) and the clip timeline move that much earlier. The same object for 0.
 */
export const skipRecitationStart = (
  resolved: ResolvedRecitationWithClips,
  seconds: number,
  memorize: Pick<Memorize, 'mode' | 'repeat' | 'pauseSeconds'>,
): ResolvedRecitationWithClips => {
  if (seconds === 0) return resolved;
  const timings = shiftTimings(resolved.timings, seconds);
  const earlier = (t: number): number => Math.max(0, roundTime(t - seconds));
  return {
    ...resolved,
    timings,
    audioOffsetSeconds: roundTime(resolved.audioOffsetSeconds + seconds),
    schedule: resolved.schedule.map((slot) => ({...slot, start: earlier(slot.start), end: earlier(slot.end)})),
    clips: clipTimeline(timings, memorize),
  };
};

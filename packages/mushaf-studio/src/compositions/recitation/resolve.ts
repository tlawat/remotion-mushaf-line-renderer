import {
  type AyahTiming,
  enterTiming,
  getMushafLines,
  parseRecitationTimings,
  recitedRange,
  scheduleLines,
} from '@tlawat/remotion-mushaf-line';
import {staticFile as remotionStaticFile} from 'remotion';
import {describeValue, MushafStudioError} from '../../errors';
import {applySplits, doubtfulWords} from '../../lines';
import {dataSourceFrom, themeSelectionFrom} from '../../schema';
import type {ResolvedRecitation, StudioTimings} from '../../types';
import {fileUrl, loadTextFile, STUDIO_FPS} from '../shared';
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

/** Fetches and validates the timings file: the package's format, with the studio's sidecar when present. */
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

/**
 * The file's ayahs in `fromAyah`..`toAyah` (0 keeps the file's bound), the ones the recording does
 * not carry whole included: what the Review tab marks. Throws `BAD_STUDIO_PROP` for a reversed range
 * or one that reaches none of the file's ayahs, naming what the file carries.
 */
export const timingsInRange = (timings: StudioTimings, fromAyah: number, toAyah: number): StudioTimings => {
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
  const ayat = timings.ayat.filter((a) => a.complete !== false);
  if (ayat.length === 0) {
    const {first, last} = bounds(timings);
    throw bad(
      `Ayahs ${first}-${last} of surah ${timings.surah} are all ayahs the recording does not carry whole (complete: false). Widen fromAyah/toAyah past them, or realign the recording.`,
      {prop: 'fromAyah', surah: timings.surah, first, last},
    );
  }
  return {...timings, ayat};
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
  if (first.ayah === file.ayat[0]!.ayah) return 0;
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
  const ayat = timings.ayat.map(
    (ayah): AyahTiming => ({
      ...ayah,
      start: shift(ayah.start),
      end: shift(ayah.end),
      ...(ayah.words
        ? {words: ayah.words.map((word) => ({...word, start: shift(word.start), end: shift(word.end)}))}
        : {}),
    }),
  );
  const sidecar = timings.alignment;
  if (!sidecar) return {...timings, ayat};
  return {
    ...timings,
    ayat,
    alignment: {
      ...sidecar,
      segments: sidecar.segments.map((s) => ({...s, timeFrom: shift(s.timeFrom), timeTo: shift(s.timeTo)})),
      words: sidecar.words.map((w) => ({...w, start: shift(w.start), end: shift(w.end)})),
    },
  };
};

/**
 * Resolves the content props once: fetches and validates the timings, trims them to the ayah
 * range and to the ayahs the recording carries whole, moves them `audioOffsetSeconds` earlier
 * (see `audioOffsetFor()`), finds the lines (`getMushafLines(recitedRange(...))`, sliced), applies
 * the splits, schedules the lines, loads the translation and gloss files, and marks the doubtful
 * words of the whole range (an incomplete ayah's words included). Pure given `fetch`;
 * `calculateMetadata()` is this plus the size and duration.
 */
export const resolveRecitation = async (
  props: MushafRecitationProps,
  options: ResolveRecitationOptions = {},
): Promise<ResolvedRecitation> => {
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
  const lines = await getMushafLines({
    ...recitedRange(timings),
    theme: themeSelectionFrom(props.theme, props.customTheme),
    slice: props.slice,
    data: dataSourceFrom(props.data, io.staticFile),
  });
  const split = applySplits(lines, props.splits);
  const schedule = scheduleLines(split, timings, {occurrence: props.highlight.occurrence});
  if (schedule.length === 0) {
    const {first, last} = bounds(timings);
    throw bad(
      `No line of surah ${timings.surah} ayahs ${first}-${last} carries a timed word; the timings and the mushaf data do not agree. Realign the recording.`,
      {prop: 'timingsFile', file: props.timingsFile},
    );
  }
  const [translation, gloss, transliteration] = await Promise.all([
    loadTextFile('ayah', 'translationFile', props.text.translationFile, io),
    loadTextFile('word', 'glossFile', props.text.glossFile, io),
    loadTextFile('word', 'transliterationFile', props.text.transliterationFile, io),
  ]);
  return {
    timings,
    audioOffsetSeconds,
    lines: split,
    schedule,
    translation,
    gloss,
    transliteration,
    doubtful: doubtfulWords(inRange, {threshold: props.review.confidenceThreshold}),
  };
};

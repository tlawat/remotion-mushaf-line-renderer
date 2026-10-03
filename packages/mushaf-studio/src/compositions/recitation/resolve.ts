import {getMushafLines, parseRecitationTimings, recitedRange, scheduleLines} from '@tlawat/remotion-mushaf-line';
import {staticFile as remotionStaticFile} from 'remotion';
import {describeValue, MushafStudioError} from '../../errors';
import {applySplits, doubtfulWords} from '../../lines';
import {dataSourceFrom, themeSelectionFrom} from '../../schema';
import type {ResolvedRecitation, StudioTimings, WordGloss} from '../../types';
import {fileUrl, loadTextFile} from '../shared';
import type {MushafRecitationProps} from './schema';

export type ResolveRecitationOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly staticFile?: ((path: string) => string) | undefined;
};

/**
 * `ResolvedRecitation` plus the word-by-word transliteration, which the shared type does not carry
 * yet: `gloss` is the translation file, `transliteration` the transliteration file.
 */
export type StudioResolvedRecitation = ResolvedRecitation;

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
  options: {readonly fetch: typeof fetch; readonly staticFile: (path: string) => string},
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
    response = await options.fetch(url, {cache: 'no-store'});
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

/**
 * The ayat the composition plays: the file's, cut to `fromAyah`..`toAyah` (0 keeps the file's
 * bound) and without the ayahs the recording does not carry whole. Throws `BAD_STUDIO_PROP` when
 * nothing is left, naming what the file carries.
 */
export const trimTimings = (timings: StudioTimings, fromAyah: number, toAyah: number): StudioTimings => {
  if (fromAyah > 0 && toAyah > 0 && toAyah < fromAyah) {
    throw bad(`toAyah (${toAyah}) is before fromAyah (${fromAyah}). Set toAyah to ${fromAyah} or later, or to 0.`, {
      prop: 'toAyah',
      fromAyah,
      toAyah,
    });
  }
  const inRange = timings.ayat.filter(
    (a) => (fromAyah === 0 || a.ayah >= fromAyah) && (toAyah === 0 || a.ayah <= toAyah),
  );
  const ayat = inRange.filter((a) => a.complete !== false);
  if (ayat.length === 0) {
    const first = timings.ayat[0]!.ayah;
    const last = timings.ayat[timings.ayat.length - 1]!.ayah;
    const range = `${fromAyah === 0 ? first : fromAyah}-${toAyah === 0 ? last : toAyah}`;
    throw bad(
      inRange.length === 0
        ? `fromAyah/toAyah (${range}) reach none of the timings' ayahs: the file carries ayahs ${first}-${last} of surah ${timings.surah}. Widen the range or set both to 0.`
        : `fromAyah/toAyah (${range}) leave only ayahs the recording does not carry whole (complete: false): the file carries ayahs ${first}-${last} of surah ${timings.surah}. Widen the range or realign the recording.`,
      {prop: 'fromAyah', fromAyah, toAyah, surah: timings.surah, first, last},
    );
  }
  return {...timings, ayat};
};

/**
 * Resolves the content props once: fetches and validates the timings, trims them to the ayah
 * range, finds the lines (`getMushafLines(recitedRange(...))`, sliced), applies the splits,
 * schedules the lines, loads the translation and gloss files, and marks the doubtful words.
 * Pure given `fetch`; `calculateMetadata()` is this plus the size and duration.
 */
export const resolveRecitation = async (
  props: MushafRecitationProps,
  options: ResolveRecitationOptions = {},
): Promise<StudioResolvedRecitation> => {
  const io = {fetch: options.fetch ?? globalThis.fetch, staticFile: options.staticFile ?? remotionStaticFile};
  const timings = trimTimings(await readTimings(props.timingsFile, io), props.fromAyah, props.toAyah);
  const lines = await getMushafLines({
    ...recitedRange(timings),
    theme: themeSelectionFrom(props.theme, props.customTheme),
    slice: props.slice,
    data: dataSourceFrom(props.data, io.staticFile),
  });
  const split = applySplits(lines, props.splits);
  const schedule = scheduleLines(split, timings, {occurrence: props.highlight.occurrence});
  if (schedule.length === 0) {
    throw bad(
      `No line of surah ${timings.surah} ayahs ${timings.ayat[0]!.ayah}-${timings.ayat[timings.ayat.length - 1]!.ayah} carries a timed word; the timings and the mushaf data do not agree. Realign the recording.`,
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
    lines: split,
    schedule,
    translation,
    gloss,
    transliteration,
    doubtful: doubtfulWords(timings, {threshold: props.review.confidenceThreshold}),
  };
};

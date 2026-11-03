// The one path every change takes: a file into `public/` (`writeStaticFile`), then the content props
// through `saveDefaultProps` (merged, so nothing the user set is dropped), then
// `reevaluateComposition()`. Everything here is called from a `runStudioTask()`, so a failure
// becomes a status line, never a React error.
import {
  getStaticFiles,
  goToComposition,
  play,
  reevaluateComposition,
  type StaticFile,
  saveDefaultProps,
  seek,
  toggle,
  writeStaticFile,
} from '@remotion/studio';
import {parseRecitationTimings} from '@tlawat/remotion-mushaf-line';
import {staticFile} from 'remotion';
import {MushafStudioError} from '../errors';
import type {MushafLookPatch} from '../presets';
import type {Review, Text} from '../schema';
import type {LineSplit, StudioTimings} from '../types';
import {getStudioState, setStudioState, t} from './store';
import type {EndCardView, TranslationLayer} from './tab-props';

/**
 * What the panel changes on the composition: the content props, the file fields of `text` (its
 * translation layers included) and `review`, the end card's files, and the style groups a look sets
 * (see `MushafLookPatch`). `slice` and `splits` are `<MushafRecitation>`'s, `textFile`
 * `<MushafAyahText>`'s; a `<MushafPage>` has no `text`.
 */
export type PropsPatch = Omit<MushafLookPatch, 'text'> & {
  readonly audioFile?: string | undefined;
  readonly timingsFile?: string | undefined;
  readonly fromAyah?: number | undefined;
  readonly toAyah?: number | undefined;
  readonly slice?: boolean | undefined;
  readonly splits?: readonly LineSplit[] | undefined;
  readonly textFile?: string | undefined;
  readonly text?:
    | (Omit<Partial<Text>, 'translations'> & {readonly translations?: TranslationLayer[] | undefined})
    | undefined;
  readonly review?: Partial<Review> | undefined;
  readonly endCard?: EndCardView | undefined;
};

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `base` with `patch` applied: nested objects are merged key by key (so `{text: {glossFile}}`
 * keeps the other `text` fields), arrays and scalars are replaced, an `undefined` in the patch
 * leaves the base value alone. Neither argument is changed.
 */
export const deepMerge = (
  base: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = {...base};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return merged;
};

/** ASCII, lower case, `-` for everything else: a file name the dev server and git are happy with on every OS. */
export const slugify = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^ -~]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

/** `name.ext` slugged part by part: `My Recording.M4A` becomes `my-recording.m4a`. */
export const fileNameFor = (name: string, fallback = 'audio'): string => {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? slugify(name.slice(dot + 1)) : '';
  const base = slugify(stem) || fallback;
  return extension ? `${base}.${extension}` : base;
};

/** The file name without its directory. */
export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** The file name without its directory or extension. */
export const stemOf = (path: string): string => {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

export const isUrl = (value: string): boolean => /^https?:\/\//i.test(value);

/** Where a project's files go, relative to `public/`: `mushaf-studio/<project>`. */
export const projectDir = (project: string | undefined): string =>
  `mushaf-studio/${slugify(project ?? 'default') || 'default'}`;

export const projectPath = (project: string | undefined, name: string): string => `${projectDir(project)}/${name}`;

/** Writes a file into `public/` and returns its path (what the props record). */
export const writeFile = async (path: string, contents: string | ArrayBuffer): Promise<string> => {
  await writeStaticFile({filePath: path, contents});
  return path;
};

/** JSON with one entry per line, the way the committed samples are written, so diffs stay readable. */
export const writeJsonFile = (path: string, value: unknown): Promise<string> =>
  writeFile(path, JSON.stringify(value, null, 1));

/** `props` with a pending patch applied: what the tabs see until the composition reloads with it. */
export const applyPatch = <T extends Readonly<Record<string, unknown>>>(props: T, patch: PropsPatch | null): T =>
  patch === null ? props : (deepMerge(props, patch as Readonly<Record<string, unknown>>) as T);

/** Whether `props` already carry every value of `patch`: nested objects key by key, arrays and scalars by value. */
export const patchApplied = (
  props: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): boolean =>
  Object.entries(patch).every(([key, value]) => {
    if (value === undefined) return true;
    const current = props[key];
    if (isPlainObject(current) && isPlainObject(value)) return patchApplied(current, value);
    return JSON.stringify(current) === JSON.stringify(value);
  });

/**
 * The part of `patch` that `base` does not carry yet (compared as `patchApplied()` does), or `null`
 * when `base` carries all of it.
 */
export const unappliedPart = (
  base: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null => {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = base[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      const nested = unappliedPart(current, value);
      if (nested !== null) rest[key] = nested;
    } else if (JSON.stringify(current) !== JSON.stringify(value)) {
      rest[key] = value;
    }
  }
  return Object.keys(rest).length === 0 ? null : rest;
};

/**
 * Merges `patch` into the composition's saved default props (the Root file) and re-runs
 * `calculateMetadata()`. `savedDefaultProps` lags behind: the Studio updates it some time after the
 * Root has been written, so a save in that window starts from the props before the earlier one.
 * Two records keep earlier changes from being lost:
 *
 * - the store's `pendingPatch`, what the tabs see until the rendered props carry it (the panel
 *   clears it then);
 * - the store's `unsavedPatches[compositionId]`, merged into every save until `savedDefaultProps`
 *   itself carries it. The rendered props can arrive before `savedDefaultProps` does, so clearing
 *   on those alone let a later save write the old values back (a split saved over a new recording's
 *   `audioFile`/`timingsFile`).
 *
 * A save that fails leaves both as they were.
 */
export const patchProps = async (compositionId: string, patch: PropsPatch): Promise<void> => {
  const state = getStudioState();
  const previous = state.pendingPatch;
  const previousUnsaved = state.unsavedPatches[compositionId] ?? null;
  const ownPatch = patch as Readonly<Record<string, unknown>>;
  const pending = deepMerge(previous ?? {}, ownPatch) as PropsPatch;
  setStudioState({pendingPatch: pending});
  let written: Record<string, unknown> = {...ownPatch};
  try {
    await saveDefaultProps({
      compositionId,
      defaultProps: ({savedDefaultProps}) => {
        const carried =
          previousUnsaved === null
            ? null
            : unappliedPart(savedDefaultProps, previousUnsaved as Readonly<Record<string, unknown>>);
        written = deepMerge(carried ?? {}, ownPatch);
        return deepMerge(savedDefaultProps, written);
      },
    });
  } catch (error) {
    setStudioState({pendingPatch: previous});
    throw error;
  }
  setStudioState({
    unsavedPatches: {...getStudioState().unsavedPatches, [compositionId]: written as PropsPatch},
  });
  reevaluateComposition();
};

/** Whether a Studio error says the Root has no composition of that id (`saveDefaultProps()` throws it). */
const isMissingComposition = (error: unknown): boolean =>
  error instanceof Error && /No composition with the ID/.test(error.message);

/**
 * Merges `patch` into the saved default props of another composition of the Root (the thumbnail
 * still, say), then selects it in the Studio. Not `patchProps()`: the panel's `pendingPatch` is the
 * panel's own composition's. Resolves with `false`, having saved nothing, when the Root has no
 * composition `compositionId`; any other failure is thrown.
 */
export const patchOtherComposition = async (
  compositionId: string,
  patch: Readonly<Record<string, unknown>>,
): Promise<boolean> => {
  try {
    await saveDefaultProps({
      compositionId,
      defaultProps: ({savedDefaultProps}) => deepMerge(savedDefaultProps, patch),
    });
  } catch (error) {
    if (isMissingComposition(error)) return false;
    throw error;
  }
  goToComposition(compositionId);
  return true;
};

/** Re-runs `calculateMetadata()` after a file the composition reads was rewritten. */
export const reevaluate = (): void => reevaluateComposition();

/** Moves the playhead to a time and plays from there. */
export const seekTo = (seconds: number, fps: number): void => {
  seek(Math.max(0, Math.round(seconds * fps)));
  play();
};

/** Moves the playhead to a time (seconds of the composition) without starting playback. */
export const seekToTime = (seconds: number, fps: number): void => seek(Math.max(0, Math.round(seconds * fps)));

/** Plays or pauses the Studio's preview, as its own Space key does. */
export const togglePlayback = (): void => toggle();

export const AUDIO_EXTENSIONS: readonly string[] = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'webm'];
export const JSON_EXTENSIONS: readonly string[] = ['json'];

const extensionOf = (name: string): string => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

/** The files of `public/` with one of these extensions, by name. `[]` when the Studio cannot list them. */
export const publicFiles = (extensions: readonly string[]): readonly StaticFile[] => {
  try {
    return getStaticFiles()
      .filter((file) => extensions.includes(extensionOf(file.name)))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
};

/** Every file of `public/`, as the Studio lists them; `[]` when it cannot. */
export const staticFileList = (): readonly StaticFile[] => {
  try {
    return getStaticFiles();
  } catch {
    return [];
  }
};

/** Reads a file of `public/` through the dev server, as `<Audio>` would. */
export const readPublicFile = async (path: string): Promise<Blob> => {
  const response = await fetch(staticFile(path));
  if (!response.ok)
    throw new MushafStudioError('BAD_STUDIO_PROP', t('error.publicFile', {path, status: response.status}), {
      path,
      status: response.status,
    });
  return response.blob();
};

/**
 * Reads the timings file a `timingsFile` prop names, as the composition does (a `public/` path
 * through `staticFile()`, a URL as it is), validated. The file, not `resolved.timings`: those are
 * cut to the ayah range and moved `audioOffsetSeconds` earlier, so an edit written from them would
 * drop ayahs and shift every time.
 */
export const readTimingsFile = async (path: string): Promise<StudioTimings> => {
  const response = await fetch(isUrl(path) ? path : staticFile(path));
  if (!response.ok)
    throw new MushafStudioError('BAD_STUDIO_PROP', t('error.timingsFile', {path, status: response.status}), {
      path,
      status: response.status,
    });
  return parseRecitationTimings(await response.json()) as StudioTimings;
};

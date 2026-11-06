// The one path every change takes: a file into `public/` (`writeStaticFile`), then the content props
// through `saveDefaultProps` (merged into the live Root values, so nothing the user set anywhere is
// dropped), then `reevaluateComposition()`. Everything here is called from a `runStudioTask()`, so a failure
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
import type {LiveEditorProps} from './remotion-internals';
import {getStudioState, type StudioTarget, setStudioState, t, targetKeyOf, toTarget, withEntry} from './store';
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
export const applyPatch = <T extends Readonly<Record<string, unknown>>>(
  props: T,
  patch: PropsPatch | null | undefined,
): T => (patch == null ? props : (deepMerge(props, patch as Readonly<Record<string, unknown>>) as T));

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
 * `patch` without the fields `part` names (nested objects key by key), or `null` when nothing is
 * left: `withoutPart({a: 1, b: {c: 2, d: 3}}, {b: {c: 0}})` is `{a: 1, b: {d: 3}}`.
 */
export const withoutPart = (
  patch: Readonly<Record<string, unknown>>,
  part: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null => {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in part)) rest[key] = value;
    else {
      const removed = part[key];
      if (isPlainObject(value) && isPlainObject(removed)) {
        const nested = withoutPart(value, removed);
        if (nested !== null) rest[key] = nested;
      }
    }
  }
  return Object.keys(rest).length === 0 ? null : rest;
};

/** The dotted paths of a patch's values, in order: `{audioFile, text: {glossFile}}` gives `audioFile, text.glossFile`. */
export const patchPaths = (patch: Readonly<Record<string, unknown>>, prefix = ''): readonly string[] =>
  Object.entries(patch).flatMap(([key, value]) =>
    value === undefined ? [] : isPlainObject(value) ? patchPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );

/**
 * The target's own props within its composition's `whole` props: `whole` itself, or the object
 * under `propsKey` (`null` when the template holds `null` or nothing there).
 */
export const targetPropsOf = (
  whole: Readonly<Record<string, unknown>>,
  target: StudioTarget,
): Readonly<Record<string, unknown>> | null => {
  if (!target.propsKey) return whole;
  const own = whole[target.propsKey];
  return isPlainObject(own) ? own : null;
};

/**
 * The composition's `whole` props with `patch` merged into the target's: at the top level, or under
 * `propsKey`, where a `null` (a slot with no recitation yet) is replaced by `target.emptyProps` with
 * the patch merged in, so the first save writes complete props.
 */
export const patchTarget = (
  whole: Readonly<Record<string, unknown>>,
  target: StudioTarget,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  if (!target.propsKey) return deepMerge(whole, patch);
  const own = targetPropsOf(whole, target) ?? target.emptyProps ?? {};
  return {...whole, [target.propsKey]: deepMerge(own, patch)};
};

// The Studio's live Root values (`useLiveEditorProps()`), as the dock last rendered them: what every
// save starts from. `savedDefaultProps` is only the fallback for a composition the Studio has not
// read yet: in Remotion 4.0.539 it is the Root as the page loaded it, and it stays that way, because
// the Studio writes the Root without rebuilding the bundle.
let liveProps: LiveEditorProps = {};

/** Keeps the live Root values for the saves: the dock calls it on every render. */
export const rememberLiveProps = (props: LiveEditorProps): void => {
  liveProps = props;
};

/** The live Root values of a composition, as the dock last saw them; `null` before the Studio has read them. */
export const liveCompositionProps = (compositionId: string): Readonly<Record<string, unknown>> | null =>
  liveProps[compositionId] ?? null;

// The props each panel was last rendered with, written on every render past the panel's memo: the
// memoized dock can hold an older snapshot (it re-renders only when the props differ).
const panelProps = new Map<string, Readonly<Record<string, unknown>>>();

/** Keeps the props a panel was rendered with, by target: the panel calls it on every render. */
export const rememberPanelProps = (target: StudioTarget | string, props: Readonly<Record<string, unknown>>): void => {
  panelProps.set(targetKeyOf(target), props);
};

/**
 * The props the panel of `target` was last rendered with (`fallback` before its first render), its
 * pending patch applied: what a click-time action (Export project, Copy description, Set
 * thumbnail) reads, never the dock's memoized snapshot.
 */
export const latestPanelProps = <T extends Readonly<Record<string, unknown>>>(
  target: StudioTarget | string,
  fallback: T,
): T => {
  const key = targetKeyOf(target);
  return applyPatch((panelProps.get(key) as T | undefined) ?? fallback, getStudioState().pendingPatches[key]);
};

/** How long after a save resolves a live update that lacks what it wrote counts as a race with another writer. */
export const RACE_WINDOW_MS = 5000;

/** A save the dock watches the live props for: did they take it, and do they keep it? */
type SaveWatch = {
  readonly target: StudioTarget;
  /** Everything the save wrote at the target: the in-flight part it carried and its own patch. */
  readonly written: Readonly<Record<string, unknown>>;
  readonly resolvedAt: number;
  /** The composition's live props object last looked at, so each update is judged once. */
  seen: unknown;
};

const watches = new Map<string, SaveWatch>();
/** `savedDefaultProps` by composition id: the page-load props, what the Props sidebar's JSON Reset goes back to. */
const pageLoadProps = new Map<string, Readonly<Record<string, unknown>>>();

const isPageLoad = (compositionId: string, whole: Readonly<Record<string, unknown>>): boolean => {
  const loaded = pageLoadProps.get(compositionId);
  return loaded !== undefined && (loaded === whole || JSON.stringify(loaded) === JSON.stringify(whole));
};

// One save at a time: each starts from the live props the one before it has been written over, so
// two quick saves never start from the same snapshot.
let saves: Promise<unknown> = Promise.resolve();
const serially = <T>(task: () => Promise<T>): Promise<T> => {
  const run = saves.then(task);
  saves = run.catch(() => undefined);
  return run;
};

const asPatch = (value: Readonly<Record<string, unknown>> | null): PropsPatch | undefined =>
  value === null ? undefined : (value as PropsPatch);

/**
 * Merges `patch` into the target's props in the Root file and re-runs `calculateMetadata()`. The
 * target is a composition id, or `{compositionId, propsKey}` for props a template keeps under a key
 * of its `defaultProps`. The save starts from the live Root values (`useLiveEditorProps()`, kept by
 * the dock), so what the Props sidebar, the Studio's undo or a hand edit changed stays; only the
 * in-flight part of earlier panel saves (sent, not yet back in the live props) is added, never a
 * value the live props have already shown. Saves run one at a time, in call order.
 *
 * The store's `pendingPatches` shows the change in the tabs until the rendered props carry it; a
 * save that fails leaves it as it was (unless a later save is already pending) and rejects.
 */
export const patchProps = (target: StudioTarget | string, patch: PropsPatch): Promise<void> => {
  const to = toTarget(target);
  const key = targetKeyOf(to);
  const {compositionId} = to;
  const ownPatch = patch as Readonly<Record<string, unknown>>;
  const before = getStudioState().pendingPatches;
  const pending = deepMerge(before[key] ?? {}, ownPatch) as PropsPatch;
  setStudioState({pendingPatches: withEntry(before, key, pending)});
  return serially(async () => {
    // This save carries what is still in flight of the one before: it is the one watched now, and
    // its own echo must not read as the earlier save's values going missing.
    watches.delete(key);
    // Only what the live props do not show yet is carried: a value they have shown and someone
    // changed since is theirs.
    const start = liveProps[compositionId];
    const own = start === undefined ? null : targetPropsOf(start, to);
    const inFlight = getStudioState().inFlightPatches[key] as Readonly<Record<string, unknown>> | undefined;
    const carried = inFlight === undefined ? null : own === null ? inFlight : unappliedPart(own, inFlight);
    const written = deepMerge(carried ?? {}, ownPatch);
    try {
      await saveDefaultProps({
        compositionId,
        defaultProps: ({savedDefaultProps}) => {
          pageLoadProps.set(compositionId, savedDefaultProps);
          return patchTarget(liveProps[compositionId] ?? savedDefaultProps, to, written);
        },
      });
    } catch (error) {
      const now = getStudioState().pendingPatches;
      if (now[key] === pending) setStudioState({pendingPatches: withEntry(now, key, before[key])});
      throw error;
    }
    const whole = liveProps[compositionId];
    const after = whole === undefined ? null : targetPropsOf(whole, to);
    // The live props may already carry the save (the Studio sends the new Root before it answers).
    const sent = after === null ? written : unappliedPart(after, written);
    setStudioState({inFlightPatches: withEntry(getStudioState().inFlightPatches, key, asPatch(sent))});
    watches.set(key, {target: to, written, resolvedAt: Date.now(), seen: whole});
    reevaluateComposition();
  });
};

/**
 * Judges the live props the dock just rendered against the panel's recent saves (and keeps them, as
 * `rememberLiveProps()` does), once per new live props object of a composition:
 *
 * - what they carry is no longer in flight;
 * - what a save wrote and they lack, while the save is recent (`RACE_WINDOW_MS`, a sidebar save
 *   that raced it) or when they are the page-load props again (the sidebar's JSON Reset), is moved
 *   from `inFlightPatches` and `pendingPatches` to `rolledBack`: the dock offers to restore it, and
 *   no later save writes it back on its own;
 * - a later change of a saved field, after that window, is the user's: the save is no longer watched.
 *
 * Writes the store only when something changed.
 */
export const observeLiveProps = (live: LiveEditorProps, now: number = Date.now()): void => {
  liveProps = live;
  const state = getStudioState();
  let {inFlightPatches, pendingPatches, rolledBack} = state;
  for (const [key, watch] of [...watches]) {
    const whole = liveProps[watch.target.compositionId];
    if (whole === undefined || whole === watch.seen) continue;
    watch.seen = whole;
    const own = targetPropsOf(whole, watch.target) ?? {};
    const inFlight = inFlightPatches[key] as Readonly<Record<string, unknown>> | undefined;
    if (inFlight !== undefined)
      inFlightPatches = withEntry(inFlightPatches, key, asPatch(unappliedPart(own, inFlight)));
    const lost = unappliedPart(own, watch.written);
    if (lost === null) {
      // Back (the Studio's undo of a reset, say): nothing to offer any more.
      rolledBack = withEntry(rolledBack, key, undefined);
      continue;
    }
    if (now - watch.resolvedAt > RACE_WINDOW_MS && !isPageLoad(watch.target.compositionId, whole)) {
      watches.delete(key);
      continue;
    }
    const left = inFlightPatches[key] as Readonly<Record<string, unknown>> | undefined;
    if (left !== undefined) inFlightPatches = withEntry(inFlightPatches, key, asPatch(withoutPart(left, lost)));
    const shown = pendingPatches[key] as Readonly<Record<string, unknown>> | undefined;
    if (shown !== undefined) pendingPatches = withEntry(pendingPatches, key, asPatch(withoutPart(shown, lost)));
    rolledBack = withEntry(rolledBack, key, deepMerge(rolledBack[key] ?? {}, lost) as PropsPatch);
  }
  if (
    inFlightPatches !== state.inFlightPatches ||
    pendingPatches !== state.pendingPatches ||
    rolledBack !== state.rolledBack
  )
    setStudioState({inFlightPatches, pendingPatches, rolledBack});
};

/** Saves again what the live props lost after a panel save (`rolledBack`), at the user's request. */
export const restoreRolledBack = async (target: StudioTarget | string): Promise<void> => {
  const key = targetKeyOf(target);
  const lost = getStudioState().rolledBack[key];
  if (lost === undefined) return;
  setStudioState({rolledBack: withEntry(getStudioState().rolledBack, key, undefined)});
  await patchProps(target, lost);
};

/** Forgets what the live props lost after a panel save: the user keeps the props as they are. */
export const dismissRolledBack = (target: StudioTarget | string): void =>
  setStudioState({rolledBack: withEntry(getStudioState().rolledBack, targetKeyOf(target), undefined)});

/** Forgets the saves being watched, the page-load, live and panel props. For tests. */
export const resetSaveTracking = (): void => {
  watches.clear();
  panelProps.clear();
  pageLoadProps.clear();
  liveProps = {};
  saves = Promise.resolve();
};

/** Whether a Studio error says the Root has no composition of that id (`saveDefaultProps()` throws it). */
const isMissingComposition = (error: unknown): boolean =>
  error instanceof Error && /No composition with the ID/.test(error.message);

/**
 * Merges `patch` into the props of another composition of the Root (the thumbnail still, say),
 * from its live Root values like `patchProps()` (the page-load props when the Studio has not read
 * them this session), after the panel's own saves, then selects it in the Studio. Resolves with
 * `false`, having saved nothing, when the Root has no composition `compositionId`; any other
 * failure is thrown.
 */
export const patchOtherComposition = (
  compositionId: string,
  patch: Readonly<Record<string, unknown>>,
): Promise<boolean> =>
  serially(async () => {
    try {
      await saveDefaultProps({
        compositionId,
        defaultProps: ({savedDefaultProps}) => deepMerge(liveProps[compositionId] ?? savedDefaultProps, patch),
      });
    } catch (error) {
      if (isMissingComposition(error)) return false;
      throw error;
    }
    goToComposition(compositionId);
    return true;
  });

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

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
import {forgetAudioAnalysis} from '../audio/analyze';
import type {HostAudio} from '../audio/host';
import {MushafStudioError} from '../errors';
import type {MushafLookPatch} from '../presets';
import type {Review, Text} from '../schema';
import type {LineSplit, StudioTimings} from '../types';
import type {LiveEditorProps} from './remotion-internals';
import {getStudioState, type StudioTarget, setStudioState, t, targetKeyOf, toTarget, withEntry} from './store';
import type {EndCardView, TranslationLayer} from './tab-props';
import {forgetWaveform} from './waveform-peaks';

/**
 * What the panel changes on the composition: the content props, the file fields of `text` (its
 * translation layers included) and `review`, the end card's files, and the style groups a look sets
 * (see `MushafLookPatch`), and `hostAudio`. `slice` and `splits` are `<MushafRecitation>`'s, `textFile`
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
  /** Always the whole group: a template's Root without it gets complete props. */
  readonly hostAudio?: HostAudio | undefined;
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

// Every path writeFile() wrote this session: the Studio's list of public/ (staticFileList()) shows
// a new file only once its public-folder watcher has told the page, so a name taken moments ago
// would look free until then.
const writtenPaths = new Set<string>();

const publicPathOf = (name: string): string => name.replace(/^\/+/, '');

/**
 * The paths of `public/` a new file must not take: those `staticFileList()` names and those
 * `writeFile()` wrote this session, which the list may not show yet.
 */
export const takenPublicPaths = (): ReadonlySet<string> =>
  new Set([...staticFileList().map((file) => publicPathOf(file.name)), ...writtenPaths]);

/**
 * Writes a file into `public/` and returns its path (what the props record). What the panel kept
 * of an earlier file at that path (its waveform, its audio analysis) is forgotten, so nothing reads
 * the old bytes under the same URL, and the path counts as taken (`takenPublicPaths()`) at once.
 */
export const writeFile = async (path: string, contents: string | ArrayBuffer): Promise<string> => {
  await writeStaticFile({filePath: path, contents});
  writtenPaths.add(publicPathOf(path));
  const url = staticFile(path);
  forgetWaveform(url);
  forgetAudioAnalysis(url);
  return path;
};

/**
 * `name` numbered `n` (2 and up) before its extension, the timings' double one included:
 * `take.m4a` gives `take-2.m4a`, `take.timings.json` gives `take-2.timings.json`; 1 gives `name`.
 */
export const numberedName = (name: string, n: number): string => {
  if (n <= 1) return name;
  const slash = name.lastIndexOf('/') + 1;
  const file = name.slice(slash);
  const timings = file.endsWith('.timings.json') ? file.length - '.timings.json'.length : -1;
  const dot = timings > 0 ? timings : file.lastIndexOf('.');
  const at = dot > 0 ? slash + dot : name.length;
  return `${name.slice(0, at)}-${n}${name.slice(at)}`;
};

/**
 * The first of `path`, `numberedName(path, 2)`, `numberedName(path, 3)`, ... that `taken` does not
 * have (paths of `public/`, as `staticFileList()` names them; by default `takenPublicPaths()`, the
 * files written this session included): where a new file goes without replacing one.
 */
export const freePublicPath = (path: string, taken: ReadonlySet<string> = takenPublicPaths()): string => {
  let n = 1;
  while (taken.has(numberedName(path, n))) n += 1;
  return numberedName(path, n);
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

/**
 * How long a live update that lacks what a save wrote counts as a race with another writer: from
 * when live props first showed it, or, for a save no live props have shown, from when it resolved.
 */
export const RACE_WINDOW_MS = 5000;

/**
 * One panel save at a target, judged against every new live props object. The Studio sends one
 * echo per write of the Root, in write order, and a Props-sidebar edit shows first as a local
 * object built from what the sidebar showed, then as its echo. So a live object that lacks what the
 * save wrote is older than the save's echo until some live object has shown it, and after that it
 * is a newer write: a sidebar save that had not seen it, the Studio's undo, or the user's change.
 */
type SaveEntry = {
  /** What the save wrote at the target: the in-flight part it carried and its own patch. */
  written: Readonly<Record<string, unknown>>;
  /** The target's props it was built from: what a writer that had not seen the save writes back. */
  base: Readonly<Record<string, unknown>>;
  /** The composition's whole props it wrote. */
  wrote: Readonly<Record<string, unknown>>;
  /** What no live props have shown yet: later saves carry it, and a live object without it is older. */
  unseen: Readonly<Record<string, unknown>> | null;
  /** What live props have shown, within `RACE_WINDOW_MS` of `shownAt`: a live object without it is newer. */
  shown: Readonly<Record<string, unknown>> | null;
  shownAt: number;
  /** When the save resolved; `null` while it is on its way. */
  resolvedAt: number | null;
  /** Its place among the session's saves: it carries only what the saves before it have in flight. */
  readonly order: number;
};

/** What the dock knows of the panel's saves at one target. */
type SaveRecord = {
  target: StudioTarget;
  /**
   * What the panel's saves wrote at the target this session and the live props have shown, less
   * what they have since lost or changed: what a return to the page-load props is compared with.
   */
  written: Readonly<Record<string, unknown>> | null;
  /** The saves still watched, oldest first; the last one is kept while nothing else is. */
  saves: SaveEntry[];
  /** The composition's live props object last judged, so each one is judged once. */
  judged: unknown;
};

const records = new Map<string, SaveRecord>();
let savesStarted = 0;
/** `savedDefaultProps` by composition id: the page-load props, what the Props sidebar's JSON Reset goes back to. */
const pageLoadProps = new Map<string, Readonly<Record<string, unknown>>>();

/** JSON with every object's keys sorted: the same props compare equal whatever order a writer used. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    isPlainObject(inner)
      ? Object.fromEntries(
          Object.keys(inner)
            .sort()
            .map((key) => [key, inner[key]]),
        )
      : inner,
  ) ?? 'undefined';

const isPageLoad = (compositionId: string, whole: Readonly<Record<string, unknown>>): boolean => {
  const loaded = pageLoadProps.get(compositionId);
  return loaded !== undefined && (loaded === whole || canonical(loaded) === canonical(whole));
};

/** The key paths of a patch's values: `{a: 1, b: {c: 2}}` gives `[a]`, `[b, c]`. */
const leafPaths = (patch: Readonly<Record<string, unknown>>): string[][] =>
  Object.entries(patch).flatMap(([key, value]) =>
    value === undefined ? [] : isPlainObject(value) ? leafPaths(value).map((path) => [key, ...path]) : [[key]],
  );

const valueAt = (props: Readonly<Record<string, unknown>>, path: readonly string[]): unknown =>
  path.reduce<unknown>((value, key) => (isPlainObject(value) ? value[key] : undefined), props);

/**
 * Whether a live object that lacks `lacking` of what `save` wrote (and live props had shown) undid
 * it by racing it: some of it is back at the value the save was built from, and the object differs
 * from what the save wrote elsewhere too, so a writer that had not seen the save wrote over it. A
 * field that holds a value of its own is the user's change; an object that differs only in the
 * save's fields, back at their old values, is the Studio's undo of the save.
 */
const racedBy = (
  save: SaveEntry,
  target: StudioTarget,
  whole: Readonly<Record<string, unknown>>,
  own: Readonly<Record<string, unknown>>,
  lacking: Readonly<Record<string, unknown>>,
): boolean =>
  leafPaths(lacking).some((path) => canonical(valueAt(own, path)) === canonical(valueAt(save.base, path))) &&
  canonical(patchTarget(whole, target, save.written)) !== canonical(save.wrote);

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

/** `a` and `b` merged, `null` when both are. */
const mergeParts = (
  a: Readonly<Record<string, unknown>> | null,
  b: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> | null => (a === null ? b : b === null ? a : deepMerge(a, b));

/** What the saves watched at a target have sent that no live props have shown, merged. */
const unseenOf = (record: SaveRecord): Readonly<Record<string, unknown>> | null =>
  record.saves.reduce<Readonly<Record<string, unknown>> | null>((all, save) => mergeParts(all, save.unseen), null);

/** The store's `inFlightPatches`, from the saves watched. */
const inFlightOf = (): Readonly<Record<string, PropsPatch>> => {
  const inFlight: Record<string, PropsPatch> = {};
  for (const [key, record] of records) {
    const unseen = unseenOf(record);
    if (unseen !== null) inFlight[key] = unseen as PropsPatch;
  }
  return inFlight;
};

/**
 * The save of `patch` at `to`, built from the composition's live props `from`: every target of the
 * composition gets what the saves watched there before save number `order` have sent and no live
 * props have shown yet, as every save writes the whole composition, then `to` gets `patch`.
 */
const buildSave = (
  to: StudioTarget,
  from: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
  order: number,
): Pick<SaveEntry, 'written' | 'base' | 'wrote'> => {
  const key = targetKeyOf(to);
  let whole = from;
  let carried: Readonly<Record<string, unknown>> | null = null;
  for (const [other, record] of records) {
    if (record.target.compositionId !== to.compositionId) continue;
    const unseen = record.saves.reduce<Readonly<Record<string, unknown>> | null>(
      (all, save) => (save.order < order ? mergeParts(all, save.unseen) : all),
      null,
    );
    const part = unseen === null ? null : unappliedPart(targetPropsOf(whole, record.target) ?? {}, unseen);
    if (part === null) continue;
    if (other === key) carried = part;
    else whole = patchTarget(whole, record.target, part);
  }
  const written = deepMerge(carried ?? {}, patch);
  return {written, base: targetPropsOf(from, to) ?? {}, wrote: patchTarget(whole, to, written)};
};

/** Starts watching `save` at `to`. */
const watchSave = (to: StudioTarget, save: SaveEntry, from: unknown): void => {
  const record = records.get(targetKeyOf(to));
  if (record === undefined) records.set(targetKeyOf(to), {target: to, written: null, saves: [save], judged: from});
  else {
    record.target = to;
    record.saves.push(save);
  }
  setStudioState({inFlightPatches: inFlightOf()});
};

// The next look at the live props once a save's race window is over: a save no live props have
// shown by then is judged even if nothing new comes.
let expiry: ReturnType<typeof setTimeout> | null = null;
const judgeLater = (): void => {
  if (expiry !== null) clearTimeout(expiry);
  expiry = setTimeout(() => {
    expiry = null;
    observeLiveProps(liveProps);
  }, RACE_WINDOW_MS + 100);
  (expiry as {unref?: () => void}).unref?.();
};

/**
 * Merges `patch` into the target's props in the Root file and re-runs `calculateMetadata()`. The
 * target is a composition id, or `{compositionId, propsKey}` for props a template keeps under a key
 * of its `defaultProps`. The save starts from the live Root values (`useLiveEditorProps()`, kept by
 * the dock), so what the Props sidebar, the Studio's undo or a hand edit changed stays; only what
 * the panel's earlier saves of the composition sent and no live props have shown yet is added,
 * never a value the live props have already shown. Saves run one at a time, in call order.
 *
 * The store's `pendingPatches` shows the change in the tabs until the rendered props carry it; a
 * save that fails leaves it as it was (unless a later save is already pending), leaves what the
 * saves before have in flight watched as it was, and rejects.
 */
export const patchProps = (target: StudioTarget | string, patch: PropsPatch): Promise<void> => {
  const to = toTarget(target);
  const key = targetKeyOf(to);
  const {compositionId} = to;
  const before = getStudioState().pendingPatches;
  const pending = deepMerge(before[key] ?? {}, patch as Readonly<Record<string, unknown>>) as PropsPatch;
  setStudioState({pendingPatches: withEntry(before, key, pending)});
  return serially(async () => {
    // What the live props show now is judged first, so the save carries only what is still unseen.
    observeLiveProps(liveProps);
    const from = liveProps[compositionId] ?? pageLoadProps.get(compositionId) ?? {};
    savesStarted += 1;
    const order = savesStarted;
    const save: SaveEntry = {
      ...buildSave(to, from, patch, order),
      unseen: null,
      shown: null,
      shownAt: 0,
      resolvedAt: null,
      order,
    };
    save.unseen = save.written;
    watchSave(to, save, from);
    try {
      await saveDefaultProps({
        compositionId,
        defaultProps: ({savedDefaultProps}) => {
          pageLoadProps.set(compositionId, savedDefaultProps);
          // Built again from the live props as they are when the Studio asks.
          Object.assign(save, buildSave(to, liveProps[compositionId] ?? savedDefaultProps, patch, order));
          if (save.resolvedAt === null) save.unseen = save.written;
          return save.wrote as Record<string, unknown>;
        },
      });
    } catch (error) {
      const record = records.get(key);
      if (record !== undefined) record.saves = record.saves.filter((watched) => watched !== save);
      setStudioState({inFlightPatches: inFlightOf()});
      const now = getStudioState().pendingPatches;
      if (now[key] === pending) setStudioState({pendingPatches: withEntry(now, key, before[key])});
      throw error;
    }
    save.resolvedAt = Date.now();
    judgeLater();
    observeLiveProps(liveProps);
    reevaluateComposition();
  });
};

/**
 * Judges the live props the dock just rendered against the panel's saves (and keeps them, as
 * `rememberLiveProps()` does), once per new live props object of a composition:
 *
 * - what a save sent and they show is no longer in flight; what they lack, until some live props
 *   have shown it, is not judged (they are older than the save's echo: a sidebar edit's local
 *   object, the echo of an earlier write) and later saves keep carrying it;
 * - what live props had shown and these lack, within `RACE_WINDOW_MS`, is moved from
 *   `pendingPatches` to `rolledBack` (the dock offers to restore it) when a writer that had not
 *   seen the save wrote over it; the Studio's undo of the save, or a value of the user's own in the
 *   field, is the user's;
 * - what a save sent and no live props have shown `RACE_WINDOW_MS` after it resolved is offered
 *   the same way (no one can have chosen to drop a value never shown), also when nothing new comes;
 * - what any save of the session wrote and they lack, when they are the page-load props again, is
 *   offered the same way. That is the sidebar's JSON Reset, but also the Studio's undo all the way
 *   back or a checkout of the Root: the offer says what is gone, not why, and writes nothing;
 * - any other change of a saved field is the user's: it is no longer the panel's to offer;
 * - an offered value the live props carry again is no longer offered, and is watched again.
 *
 * Each value is offered once: after Restore or ×, the same page-load props do not offer it again.
 * Writes the store only when something changed.
 */
export const observeLiveProps = (live: LiveEditorProps, now: number = Date.now()): void => {
  liveProps = live;
  const state = getStudioState();
  let {pendingPatches, rolledBack} = state;
  for (const [key, record] of records) {
    const {compositionId} = record.target;
    const whole = live[compositionId];
    if (whole === undefined) continue;
    const own = targetPropsOf(whole, record.target) ?? {};
    let gone: Readonly<Record<string, unknown>> | null = null;
    let lost: Readonly<Record<string, unknown>> | null = null;
    if (whole !== record.judged) {
      const previous = record.judged;
      record.judged = whole;
      const offered = rolledBack[key] as Readonly<Record<string, unknown>> | undefined;
      if (offered !== undefined) {
        const still = unappliedPart(own, offered);
        const back = still === null ? offered : withoutPart(offered, still);
        if (back !== null) {
          // Back (the Studio's undo of a reset, a late echo): the panel's values again, watched again
          // as if these props had saved them, so a writer that had not seen them is offered again.
          record.written = mergeParts(record.written, back);
          savesStarted += 1;
          record.saves.push({
            written: back,
            base: (isPlainObject(previous) ? targetPropsOf(previous, record.target) : null) ?? {},
            wrote: whole,
            unseen: null,
            shown: back,
            shownAt: now,
            resolvedAt: now,
            order: savesStarted,
          });
          rolledBack = withEntry(rolledBack, key, asPatch(still));
        }
      }
      // Latest first: a value a later save wrote and these show is no longer an earlier save's to carry.
      let later: Readonly<Record<string, unknown>> | null = null;
      for (const save of [...record.saves].reverse()) {
        if (save.shown !== null && now - save.shownAt > RACE_WINDOW_MS) save.shown = null;
        const lacking = save.shown === null ? null : unappliedPart(own, save.shown);
        if (save.shown !== null && lacking !== null) {
          save.shown = withoutPart(save.shown, lacking);
          gone = mergeParts(gone, lacking);
          if (racedBy(save, record.target, whole, own, lacking)) lost = mergeParts(lost, lacking);
        }
        if (save.unseen !== null && later !== null) save.unseen = withoutPart(save.unseen, later);
        if (save.unseen !== null) {
          const still = unappliedPart(own, save.unseen);
          const seen = still === null ? save.unseen : withoutPart(save.unseen, still);
          if (seen !== null) {
            save.unseen = still;
            save.shown = mergeParts(save.shown, seen);
            save.shownAt = now;
            record.written = mergeParts(record.written, seen);
            later = mergeParts(later, seen);
          }
        }
      }
      const missing = record.written === null ? null : unappliedPart(own, record.written);
      if (missing !== null && record.written !== null) {
        record.written = withoutPart(record.written, missing);
        gone = mergeParts(gone, missing);
        if (isPageLoad(compositionId, whole)) lost = mergeParts(lost, missing);
      }
    }
    for (const save of record.saves) {
      if (save.unseen === null || save.resolvedAt === null || now - save.resolvedAt <= RACE_WINDOW_MS) continue;
      const never = unappliedPart(own, save.unseen);
      save.unseen = null;
      gone = mergeParts(gone, never);
      lost = mergeParts(lost, never);
    }
    const last = record.saves[record.saves.length - 1];
    record.saves = record.saves.filter(
      (save) => save === last || save.unseen !== null || save.resolvedAt === null || save.shown !== null,
    );
    if (gone !== null) {
      const shown = pendingPatches[key] as Readonly<Record<string, unknown>> | undefined;
      if (shown !== undefined) pendingPatches = withEntry(pendingPatches, key, asPatch(withoutPart(shown, gone)));
    }
    if (lost !== null) rolledBack = withEntry(rolledBack, key, deepMerge(rolledBack[key] ?? {}, lost) as PropsPatch);
  }
  const next = inFlightOf();
  const inFlightPatches = canonical(next) === canonical(state.inFlightPatches) ? state.inFlightPatches : next;
  if (
    inFlightPatches !== state.inFlightPatches ||
    pendingPatches !== state.pendingPatches ||
    rolledBack !== state.rolledBack
  )
    setStudioState({inFlightPatches, pendingPatches, rolledBack});
};

/**
 * Saves again what the live props lost after a panel save (`rolledBack`), at the user's request.
 * The offer goes once the save is written; a save that fails keeps it, so Restore can be pressed
 * again.
 */
export const restoreRolledBack = async (target: StudioTarget | string): Promise<void> => {
  const key = targetKeyOf(target);
  const lost = getStudioState().rolledBack[key];
  if (lost === undefined) return;
  await patchProps(target, lost);
  const {rolledBack} = getStudioState();
  const left = rolledBack[key] as Readonly<Record<string, unknown>> | undefined;
  if (left !== undefined)
    setStudioState({
      rolledBack: withEntry(rolledBack, key, asPatch(withoutPart(left, lost as Readonly<Record<string, unknown>>))),
    });
};

/**
 * Forgets what the live props lost after a panel save: the user keeps the props as they are, and
 * the same props coming back (the composition selected again, the Studio reconnecting) do not
 * offer it again.
 */
export const dismissRolledBack = (target: StudioTarget | string): void =>
  setStudioState({rolledBack: withEntry(getStudioState().rolledBack, targetKeyOf(target), undefined)});

// The file of public/ each `blob:` or `data:` track's bytes were written into this session, by the
// track's URL: the same track maps back to that file instead of being copied again.
const trackCopies = new Map<string, string>();

/** Records that the bytes of the track at `src` (a `blob:` or `data:` URL) were written to `path` of `public/`. */
export const rememberTrackCopy = (src: string, path: string): void => {
  trackCopies.set(src, publicPathOf(path));
};

/** The file of `public/` the track at `src` was written into this session (`rememberTrackCopy()`), else `null`. */
export const trackCopyOf = (src: string): string | null => trackCopies.get(src) ?? null;

/** Forgets the saves being watched, the page-load, live and panel props, and the paths written. For tests. */
export const resetSaveTracking = (): void => {
  records.clear();
  if (expiry !== null) clearTimeout(expiry);
  expiry = null;
  writtenPaths.clear();
  trackCopies.clear();
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
 * them this session), after the panel's own saves, then selects it in the Studio, unless `select`
 * is `false` (a slot: the user stays on the template). Resolves with `false`, having saved nothing,
 * when the Root has no composition `compositionId`; any other failure is thrown.
 */
export const patchOtherComposition = (
  compositionId: string,
  patch: Readonly<Record<string, unknown>>,
  options: {readonly select?: boolean | undefined} = {},
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
    if (options.select !== false) goToComposition(compositionId);
    return true;
  });

/** Re-runs `calculateMetadata()` after a file the composition reads was rewritten. */
export const reevaluate = (): void => reevaluateComposition();

/**
 * The Studio frame of `seconds` of the recitation: `frameOffset` (the frame the recitation's frame 0
 * is at in the composition the Studio shows: a slot's start in its template, 0 for a composition of
 * its own) plus the seconds at `fps`, never before the recitation's start or frame 0.
 */
export const studioFrameOf = (seconds: number, fps: number, frameOffset = 0): number =>
  Math.max(0, frameOffset + Math.max(0, Math.round(seconds * fps)));

/** Moves the playhead to a time (seconds of the recitation, `frameOffset` frames into the composition) and plays from there. */
export const seekTo = (seconds: number, fps: number, frameOffset = 0): void => {
  seek(studioFrameOf(seconds, fps, frameOffset));
  play();
};

/** Moves the playhead to a time (seconds of the recitation, `frameOffset` frames into the composition) without starting playback. */
export const seekToTime = (seconds: number, fps: number, frameOffset = 0): void =>
  seek(studioFrameOf(seconds, fps, frameOffset));

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

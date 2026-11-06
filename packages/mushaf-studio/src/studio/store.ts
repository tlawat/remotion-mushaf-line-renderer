// The panel's state: a plain module store read through `useSyncExternalStore`, so the composition
// re-rendering with every frame never re-renders the panel. What survives a reload is split by
// sensitivity: the panel's own layout (its language and the timeline markers included) in
// localStorage, the aligner session in sessionStorage, and a Hugging Face token in sessionStorage,
// or in localStorage when the user asks the panel to remember it (never a file, never the props).
import {useSyncExternalStore} from 'react';
import {isMushafStudioError} from '../errors';
import type {QudAlignResponse, QudDevice, QudModel, QudProgress, QudRecitation, QudRiwayah} from '../qud/types';
import type {QuranComResource} from '../translations';
import {isStudioLanguage, type MessageKey, type MessageParams, type StudioLanguage, translate} from './i18n';
import type {PropsPatch} from './studio-api';
import type {WaveformEntry} from './waveform-peaks';

export type StudioTab = 'source' | 'look' | 'align' | 'review' | 'lines' | 'text';

/** Which edge of the Studio the dock sits on. */
export type StudioSide = 'left' | 'right';

/** The lists `loadOnce()` fetches once and keeps. */
export type CachedList = 'catalogue' | 'quranComResources' | 'quranComTafsirs';

/** What the status line says while a cached list loads: keys of the panel's dictionary. */
export const LOADING_LABELS: Readonly<Record<CachedList, MessageKey>> = {
  catalogue: 'status.loadingCatalogue',
  quranComResources: 'status.loadingTranslations',
  quranComTafsirs: 'status.loadingTafsirs',
};

/** The tabs in order, each with its label's key in the panel's dictionary. */
export const STUDIO_TABS: readonly {readonly id: StudioTab; readonly label: MessageKey}[] = [
  {id: 'source', label: 'tab.source'},
  {id: 'look', label: 'tab.look'},
  {id: 'align', label: 'tab.align'},
  {id: 'review', label: 'tab.review'},
  {id: 'lines', label: 'tab.lines'},
  {id: 'text', label: 'tab.text'},
];

/** An alignment made in this browser session: what split and re-align need (the aligner keeps a session for a few hours). */
export type StudioSession = {
  readonly audioId: string;
  readonly align: QudAlignResponse;
  /** The `public/` path of the audio the session aligned. */
  readonly audio: string;
  readonly model: QudModel;
  readonly device: QudDevice;
  readonly riwayah: QudRiwayah;
};

export type StudioState = {
  /** `null` until the user picks one: the panel then shows its `initialTab`. */
  readonly tab: StudioTab | null;
  readonly collapsed: boolean;
  readonly side: StudioSide;
  /** The panel's language; Arabic lays the dock out right to left. */
  readonly language: StudioLanguage;
  /** Whether the doubtful segments are marked on the Studio's timeline (default on). */
  readonly showDoubts: boolean;
  /** What the panel is doing, shown in the status line; `null` when idle. One task at a time: see `runStudioTask()`. */
  readonly busy: string | null;
  /** The cached lists being fetched. Apart from `busy`, so a list arriving never frees the panel for a second task. */
  readonly loading: readonly CachedList[];
  readonly progress: QudProgress | null;
  readonly error: string | null;
  /** Something worth knowing that is not an error (a device fallback, a file now in `public/`). */
  readonly notice: string | null;
  /** `listRecitations()`, fetched once. */
  readonly catalogue: readonly QudRecitation[] | null;
  /** `listQuranComTranslations()` for every language, fetched once. */
  readonly quranComResources: readonly QuranComResource[] | null;
  /** `listQuranComTafsirs()` for every language, fetched once (by the Text tab, for the end card). */
  readonly quranComTafsirs: readonly QuranComResource[] | null;
  readonly session: StudioSession | null;
  /** By target key (`targetKeyOf()`): the last recording the user put into `public/` through the Source tab. */
  readonly uploadedAudio: Readonly<Record<string, string>>;
  /**
   * By target key: what `patchProps()` saved that the rendered props have not come back with yet
   * (`calculateMetadata()` runs again after the Root is written). The tabs see the props with it
   * applied, so a change shows at once; the panel drops it when the props arrive carrying it, or
   * when the live props lost it (see `rolledBack`).
   */
  readonly pendingPatches: Readonly<Record<string, PropsPatch>>;
  /**
   * By target key: what `patchProps()` sent to the Root that the live props
   * (`useLiveEditorProps()`) do not show yet. The next save adds it to its base, so two saves in
   * quick succession both land; the first live props after the save clear it, whatever they hold
   * (what they lack is offered in `rolledBack` or is the user's), so an older panel value is never
   * written over a later change made elsewhere.
   */
  readonly inFlightPatches: Readonly<Record<string, PropsPatch>>;
  /**
   * By target key: what the panel's saves wrote that the live props lost (a sidebar save that
   * raced the last panel save; a return to the page-load props, as the Props sidebar's JSON Reset
   * or the Studio's undo all the way back does). The dock offers to restore it; nothing is written
   * until the user says so.
   */
  readonly rolledBack: Readonly<Record<string, PropsPatch>>;
  /**
   * By target key: the looks the Look tab applied, the last one at the end, each with the fields it
   * changed as they were before. Undo saves the last one's `patch`. In memory only.
   */
  readonly lookUndo: Readonly<Record<string, readonly LookUndo[]>>;
  /**
   * By target key, then by a name the tab chooses: what a tab was in the middle of (pickers, pending
   * nudges, options), so a tab switch does not lose it. In memory only.
   */
  readonly drafts: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /**
   * The decoded recordings' envelopes by audio URL, for the Review tab's waveform. In memory only:
   * decoding again after a reload costs a second, storing them would cost megabytes.
   */
  readonly waveforms: Readonly<Record<string, WaveformEntry>>;
  /**
   * By composition id: the panels mounted in it, in mount order (one per slot of a template; one
   * for a composition of its own). One dock is shown per composition, the chosen panel's.
   */
  readonly panels: Readonly<Record<string, readonly MountedPanel[]>>;
  /** By composition id: the target key of the panel the dock shows, as the slot picker chose it. */
  readonly activePanels: Readonly<Record<string, string>>;
};

/** A panel mounted in a composition: its target key and the name the slot picker shows. */
export type MountedPanel = {readonly key: string; readonly label: string};

/**
 * What the panel edits: a composition of the Root, or, with `propsKey`, the props a template keeps
 * under that key of its composition's `defaultProps` (a drop-in slot).
 */
export type StudioTarget = {
  readonly compositionId: string;
  /** The key of the composition's `defaultProps` the panel's props live under; the top level when absent. */
  readonly propsKey?: string | undefined;
  /**
   * What a first save under `propsKey` starts from while the template holds `null` there (or
   * nothing): complete props of the slot's kind, so the save writes props the slot can render.
   * `{}` when absent.
   */
  readonly emptyProps?: Readonly<Record<string, unknown>> | undefined;
};

/** The key the store files a target's state under: `compositionId`, or `compositionId/propsKey`. */
export const targetKeyOf = (target: StudioTarget | string): string =>
  typeof target === 'string'
    ? target
    : target.propsKey
      ? `${target.compositionId}/${target.propsKey}`
      : target.compositionId;

/** A target given as a bare composition id: the composition's top level. */
export const toTarget = (target: StudioTarget | string): StudioTarget =>
  typeof target === 'string' ? {compositionId: target} : target;

/** How many looks Undo goes back through, per target. */
export const LOOK_UNDO_DEPTH = 20;

/** One look the Look tab applied: what it set, and those fields as they were before. */
export type LookUndo = {
  /** The look's name, for the Undo button. */
  readonly name: string;
  /** The fields the look changed, with their values from before it: what Undo saves. */
  readonly patch: PropsPatch;
  /** What the look set, so Undo can tell the fields that still hold it from those changed since. */
  readonly applied: PropsPatch;
};

const PANEL_KEY = 'mushaf-studio.panel';
const SESSION_KEY = 'mushaf-studio.session';
const TOKEN_KEY = 'mushaf-studio.hf-token';
/** The localStorage prefix of the alignment cache's small entries (`align-cache.ts`). */
export const ALIGN_CACHE_PREFIX = 'mushaf-studio.align.';

/** The keys of the panel layout that persist, in localStorage. */
const LAYOUT_FIELDS = ['tab', 'collapsed', 'side', 'language', 'showDoubts'] as const;

const storage = (kind: 'local' | 'session'): Storage | null => {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const readJson = (kind: 'local' | 'session', key: string): unknown => {
  try {
    const raw = storage(kind)?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeJson = (kind: 'local' | 'session', key: string, value: unknown): void => {
  try {
    storage(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode, quota, or no storage: the panel just does not remember.
  }
};

const isTab = (value: unknown): value is StudioTab => STUDIO_TABS.some((tab) => tab.id === value);

const isSession = (value: unknown): value is StudioSession => {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.audioId === 'string' &&
    typeof s.audio === 'string' &&
    typeof s.align === 'object' &&
    s.align !== null &&
    Array.isArray((s.align as {segments?: unknown}).segments)
  );
};

/** The string entries of a stored record (the uploads by target); `{}` for anything else, an older single path included. */
const stringRecord = (value: unknown): Readonly<Record<string, string>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      )
    : {};

const initialState = (): StudioState => {
  const panel = readJson('local', PANEL_KEY) as {
    tab?: unknown;
    collapsed?: unknown;
    side?: unknown;
    language?: unknown;
    showDoubts?: unknown;
  } | null;
  const saved = readJson('session', SESSION_KEY) as {session?: unknown; uploadedAudio?: unknown} | null;
  return {
    tab: isTab(panel?.tab) ? panel.tab : null,
    collapsed: panel?.collapsed === true,
    side: panel?.side === 'left' ? 'left' : 'right',
    language: isStudioLanguage(panel?.language) ? panel.language : 'en',
    showDoubts: panel?.showDoubts !== false,
    busy: null,
    loading: [],
    progress: null,
    error: null,
    notice: null,
    catalogue: null,
    quranComResources: null,
    quranComTafsirs: null,
    session: isSession(saved?.session) ? saved.session : null,
    uploadedAudio: stringRecord(saved?.uploadedAudio),
    pendingPatches: {},
    inFlightPatches: {},
    rolledBack: {},
    lookUndo: {},
    drafts: {},
    waveforms: {},
    panels: {},
    activePanels: {},
  };
};

let state: StudioState | null = null;
const listeners = new Set<() => void>();

/** The current state; the same object until `setStudioState()` replaces it. */
export const getStudioState = (): StudioState => {
  if (state === null) state = initialState();
  return state;
};

export const subscribeStudioStore = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Replaces the given fields and notifies; persists the panel layout and the session when they changed. */
export const setStudioState = (patch: Partial<StudioState>): void => {
  const next = {...getStudioState(), ...patch};
  state = next;
  if (LAYOUT_FIELDS.some((field) => field in patch))
    writeJson('local', PANEL_KEY, Object.fromEntries(LAYOUT_FIELDS.map((field) => [field, next[field]])));
  if ('session' in patch || 'uploadedAudio' in patch)
    writeJson('session', SESSION_KEY, {session: next.session, uploadedAudio: next.uploadedAudio});
  for (const listener of listeners) listener();
};

/** Forgets everything, storage included. For tests. */
export const resetStudioStore = (): void => {
  try {
    storage('local')?.removeItem(PANEL_KEY);
    storage('session')?.removeItem(SESSION_KEY);
    storage('session')?.removeItem(TOKEN_KEY);
    storage('local')?.removeItem(TOKEN_KEY);
    // The alignment cache's small entries (align-cache.ts); its IndexedDB store is left alone.
    const local = storage('local');
    for (const key of Object.keys(local ?? {})) if (key.startsWith(ALIGN_CACHE_PREFIX)) local?.removeItem(key);
  } catch {
    // Nothing to forget.
  }
  state = null;
  for (const listener of listeners) listener();
};

export const studioStore = {
  subscribe: subscribeStudioStore,
  getSnapshot: getStudioState,
  set: setStudioState,
  reset: resetStudioStore,
};

/** The whole state, re-rendering the caller when any of it changes. */
export const useStudioState = (): StudioState =>
  useSyncExternalStore(subscribeStudioStore, getStudioState, getStudioState);

/**
 * `record` with `key` set to `value`, or without `key` when `value` is `undefined`: how the keyed
 * fields (`uploadedAudio`, `pendingPatches`, ...) are written.
 */
export const withEntry = <T>(
  record: Readonly<Record<string, T>>,
  key: string,
  value: T | undefined,
): Readonly<Record<string, T>> => {
  if (value === undefined) {
    if (!(key in record)) return record;
    const {[key]: _dropped, ...rest} = record;
    return rest;
  }
  return {...record, [key]: value};
};

/** A tab's draft `name` for a target key; `undefined` when it has none. */
export const draftOf = (key: string, name: string): unknown => getStudioState().drafts[key]?.[name];

/** Keeps a tab's draft for a target key; `undefined` forgets it. */
export const setDraft = (key: string, name: string, value: unknown): void => {
  const {drafts} = getStudioState();
  const own = withEntry(drafts[key] ?? {}, name, value);
  setStudioState({drafts: withEntry(drafts, key, Object.keys(own).length === 0 ? undefined : own)});
};

/**
 * `useState()` kept in the store under the target key and `name`: it survives the tab being
 * unmounted (a tab switch), and each target (composition or slot) has its own. `initial` is what
 * it reads while nothing is kept.
 */
export const useStudioDraft = <T>(
  key: string,
  name: string,
  initial: T,
): readonly [T, (next: T | ((current: T) => T)) => void] => {
  const read = () => getStudioState().drafts[key]?.[name];
  const kept = useSyncExternalStore(subscribeStudioStore, read, read);
  const value = kept === undefined ? initial : (kept as T);
  const set = (next: T | ((current: T) => T)) => {
    const stored = draftOf(key, name);
    const current = stored === undefined ? initial : (stored as T);
    setDraft(key, name, typeof next === 'function' ? (next as (current: T) => T)(current) : next);
  };
  return [value, set];
};

/**
 * Counts a panel as mounted in `compositionId` (the dock's slot picker lists it) until the returned
 * cleanup runs. A key mounted twice (two slots with one `propsKey`) is listed once and stays until
 * both are gone; the cleanup takes out its own `panel` (by identity), so `dockOwnerOf()` can tell
 * the two apart.
 */
export const registerPanel = (compositionId: string, panel: MountedPanel): (() => void) => {
  const {panels} = getStudioState();
  setStudioState({panels: withEntry(panels, compositionId, [...(panels[compositionId] ?? []), panel])});
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const now = getStudioState().panels[compositionId] ?? [];
    const at = now.indexOf(panel);
    if (at < 0) return;
    const rest = [...now.slice(0, at), ...now.slice(at + 1)];
    setStudioState({panels: withEntry(getStudioState().panels, compositionId, rest.length > 0 ? rest : undefined)});
  };
};

/** The panels mounted in a composition, each key once, in mount order. */
export const mountedPanelsOf = (state: StudioState, compositionId: string): readonly MountedPanel[] => {
  const seen = new Set<string>();
  return (state.panels[compositionId] ?? []).filter((entry) => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
};

/**
 * The target key of the panel whose dock a composition shows: the one the slot picker chose while
 * it is mounted, else the first mounted; `null` before any has mounted.
 */
export const activePanelOf = (state: StudioState, compositionId: string): string | null => {
  const mounted = state.panels[compositionId] ?? [];
  const chosen = state.activePanels[compositionId];
  if (chosen !== undefined && mounted.some((entry) => entry.key === chosen)) return chosen;
  return mounted[0]?.key ?? null;
};

/**
 * The one registered panel that draws the dock of a composition: the first mounted with the
 * `activePanelOf()` key. Two panels with one key edit the same props, and both are active; only
 * this one docks, so the template shows one dock and reserves its space once.
 */
export const dockOwnerOf = (state: StudioState, compositionId: string): MountedPanel | null => {
  const key = activePanelOf(state, compositionId);
  return (state.panels[compositionId] ?? []).find((entry) => entry.key === key) ?? null;
};

/** Whether `panel` (as given to `registerPanel()`) is `dockOwnerOf()` its composition, re-rendering the caller when that changes. */
export const useDockOwner = (compositionId: string, panel: MountedPanel): boolean => {
  const read = () => dockOwnerOf(getStudioState(), compositionId) === panel;
  return useSyncExternalStore(subscribeStudioStore, read, read);
};

/** The panel's language, re-rendering the caller only when it changes. */
export const useStudioLanguage = (): StudioLanguage =>
  useSyncExternalStore(
    subscribeStudioStore,
    () => getStudioState().language,
    () => getStudioState().language,
  );

/** A panel string in the current language, for code outside a component (tasks, notices). */
export const t = (key: MessageKey, params?: MessageParams): string => translate(getStudioState().language, key, params);

/** `t()` bound to the panel's language: what a component calls, re-rendered when the language changes. */
export const useT = (): ((key: MessageKey, params?: MessageParams) => string) => {
  const language = useStudioLanguage();
  return (key, params) => translate(language, key, params);
};

const readToken = (kind: 'local' | 'session'): string => {
  try {
    return storage(kind)?.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * The Hugging Face token the user typed: this tab's sessionStorage, else the one the user asked
 * this browser to remember (localStorage); `''` for none.
 */
export const getHfToken = (): string => readToken('session') || readToken('local');

/** Whether the token is remembered for this browser (localStorage) rather than this tab only. */
export const isHfTokenRemembered = (): boolean => readToken('local') !== '';

/**
 * Keeps the token for this browser session only (an empty string forgets it), or, once the user
 * has ticked "Remember for this browser", in localStorage, where the remembered one is replaced.
 */
export const setHfToken = (token: string): void => {
  const kind = isHfTokenRemembered() ? 'local' : 'session';
  try {
    const target = storage(kind);
    if (!target) return;
    if (token) target.setItem(TOKEN_KEY, token);
    else target.removeItem(TOKEN_KEY);
  } catch {
    // No storage: the token is kept in the input only.
  }
};

/**
 * Moves the token between this tab (sessionStorage) and this browser (localStorage), on the user's
 * request only. It never leaves the computer except in the aligner's Authorization header.
 */
export const rememberHfToken = (remember: boolean): void => {
  const token = getHfToken();
  try {
    const local = storage('local');
    const session = storage('session');
    if (remember) {
      if (token) local?.setItem(TOKEN_KEY, token);
      session?.removeItem(TOKEN_KEY);
    } else {
      local?.removeItem(TOKEN_KEY);
      if (token) session?.setItem(TOKEN_KEY, token);
    }
  } catch {
    // No storage: nothing to move.
  }
};

/** Forgets the token everywhere the panel kept it. */
export const forgetHfToken = (): void => {
  try {
    storage('local')?.removeItem(TOKEN_KEY);
    storage('session')?.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to forget.
  }
};

/** A failure as the status line shows it: the message, plus the retry delay of a rate limit. */
export const describeError = (error: unknown): string => {
  if (isMushafStudioError(error)) {
    const retry = error.details.retryAfterSeconds;
    return error.code === 'QUD_RATE_LIMITED' && typeof retry === 'number'
      ? `${error.message} ${t('status.retryIn', {seconds: Math.ceil(retry)})}`
      : error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
};

/**
 * Runs one panel task: `busy` says what is happening until it settles, and a failure lands in
 * `error` (never in React). One task at a time: while another is running (an upload, an alignment,
 * a save) this one does not start, the status line says so, and the call resolves with `false`.
 * Resolves with whether the task completed.
 */
export const runStudioTask = async (label: string, task: () => Promise<void>): Promise<boolean> => {
  const {busy} = getStudioState();
  if (busy !== null) {
    setStudioState({
      notice: t('status.busyRefused', {busy, task: label.replace(/\.+$/, '').toLowerCase()}),
    });
    return false;
  }
  setStudioState({busy: label, error: null, progress: null});
  try {
    await task();
    return true;
  } catch (error) {
    setStudioState({error: describeError(error)});
    return false;
  } finally {
    setStudioState({busy: null, progress: null});
  }
};

const pending: {[K in CachedList]?: Promise<void>} = {};

/**
 * Fetches a cached list once, whoever asks first (React's double-invoked effects included): the
 * catalogue of recitations or quran.com's translation resources. Tracked in `loading`, not in
 * `busy`: a list arriving while the user aligns must not free the Align button for a second run. A
 * failure lands in `error`; the next call tries again.
 */
export const loadOnce = <K extends CachedList>(
  key: K,
  load: () => Promise<NonNullable<StudioState[K]>>,
): Promise<void> => {
  if (getStudioState()[key] !== null) return Promise.resolve();
  const inFlight = pending[key];
  if (inFlight) return inFlight;
  setStudioState({loading: [...getStudioState().loading, key]});
  const request = load()
    .then((value) => setStudioState({[key]: value}))
    .catch((error) => setStudioState({error: describeError(error)}))
    .finally(() => {
      delete pending[key];
      setStudioState({loading: getStudioState().loading.filter((entry) => entry !== key)});
    });
  pending[key] = request;
  return request;
};

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
  /** The last recording the user put into `public/` through the Source tab. */
  readonly uploadedAudio: string | null;
  /**
   * What `patchProps()` saved that the composition has not come back with yet (the Root reloads after
   * the file is written): merged into every later save and into what the tabs see, so two changes in
   * quick succession both land. Cleared by the panel when the props arrive equal to it.
   */
  readonly pendingPatch: PropsPatch | null;
  /**
   * What the last look the Look tab applied changed, as it was before: Undo saves `patch` on
   * `compositionId`. In memory only; one level.
   */
  readonly lookUndo: LookUndo | null;
  /**
   * The decoded recordings' envelopes by audio URL, for the Review tab's waveform. In memory only:
   * decoding again after a reload costs a second, storing them would cost megabytes.
   */
  readonly waveforms: Readonly<Record<string, WaveformEntry>>;
};

/** The fields a look changed, with their values from before it, and where. */
export type LookUndo = {
  readonly compositionId: string;
  /** The look's name, for the Undo button. */
  readonly name: string;
  readonly patch: PropsPatch;
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
    uploadedAudio: typeof saved?.uploadedAudio === 'string' ? saved.uploadedAudio : null,
    pendingPatch: null,
    lookUndo: null,
    waveforms: {},
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

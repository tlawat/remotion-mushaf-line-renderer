// The panel's state: a plain module store read through `useSyncExternalStore`, so the composition
// re-rendering with every frame never re-renders the panel. What survives a reload is split by
// sensitivity: the panel's own layout in localStorage, the aligner session in sessionStorage, and
// a Hugging Face token in sessionStorage only (never a file, never the props).
import {useSyncExternalStore} from 'react';
import {isMushafStudioError} from '../errors';
import type {QudAlignResponse, QudDevice, QudModel, QudProgress, QudRecitation, QudRiwayah} from '../qud/types';
import type {QuranComResource} from '../translations';
import type {PropsPatch} from './studio-api';

export type StudioTab = 'source' | 'align' | 'review' | 'lines' | 'text';

/** Which edge of the Studio the dock sits on. */
export type StudioSide = 'left' | 'right';

/** The lists `loadOnce()` fetches once and keeps. */
export type CachedList = 'catalogue' | 'quranComResources';

export const LOADING_LABELS: Readonly<Record<CachedList, string>> = {
  catalogue: 'Loading the catalogue...',
  quranComResources: 'Loading the translation list...',
};

export const STUDIO_TABS: readonly {readonly id: StudioTab; readonly label: string}[] = [
  {id: 'source', label: 'Source'},
  {id: 'align', label: 'Align'},
  {id: 'review', label: 'Review'},
  {id: 'lines', label: 'Lines'},
  {id: 'text', label: 'Text'},
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
  readonly session: StudioSession | null;
  /** The last recording the user put into `public/` through the Source tab. */
  readonly uploadedAudio: string | null;
  /**
   * What `patchProps()` saved that the composition has not come back with yet (the Root reloads after
   * the file is written): merged into every later save and into what the tabs see, so two changes in
   * quick succession both land. Cleared by the panel when the props arrive equal to it.
   */
  readonly pendingPatch: PropsPatch | null;
};

const PANEL_KEY = 'mushaf-studio.panel';
const SESSION_KEY = 'mushaf-studio.session';
const TOKEN_KEY = 'mushaf-studio.hf-token';

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
  const panel = readJson('local', PANEL_KEY) as {tab?: unknown; collapsed?: unknown; side?: unknown} | null;
  const saved = readJson('session', SESSION_KEY) as {session?: unknown; uploadedAudio?: unknown} | null;
  return {
    tab: isTab(panel?.tab) ? panel.tab : null,
    collapsed: panel?.collapsed === true,
    side: panel?.side === 'left' ? 'left' : 'right',
    busy: null,
    loading: [],
    progress: null,
    error: null,
    notice: null,
    catalogue: null,
    quranComResources: null,
    session: isSession(saved?.session) ? saved.session : null,
    uploadedAudio: typeof saved?.uploadedAudio === 'string' ? saved.uploadedAudio : null,
    pendingPatch: null,
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
  if ('tab' in patch || 'collapsed' in patch || 'side' in patch)
    writeJson('local', PANEL_KEY, {tab: next.tab, collapsed: next.collapsed, side: next.side});
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

/** The Hugging Face token the user typed, from sessionStorage; `''` for none. */
export const getHfToken = (): string => {
  try {
    return storage('session')?.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Keeps the token for this browser session only (an empty string forgets it). */
export const setHfToken = (token: string): void => {
  try {
    const session = storage('session');
    if (!session) return;
    if (token) session.setItem(TOKEN_KEY, token);
    else session.removeItem(TOKEN_KEY);
  } catch {
    // No storage: the token is kept in the input only.
  }
};

/** A failure as the status line shows it: the message, plus the retry delay of a rate limit. */
export const describeError = (error: unknown): string => {
  if (isMushafStudioError(error)) {
    const retry = error.details.retryAfterSeconds;
    return error.code === 'QUD_RATE_LIMITED' && typeof retry === 'number'
      ? `${error.message} Retry in ${Math.ceil(retry)} s.`
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
      notice: `The panel is busy (${busy}); wait for it to finish before ${label.replace(/\.+$/, '').toLowerCase()}.`,
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

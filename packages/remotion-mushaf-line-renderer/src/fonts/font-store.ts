import type {MushafError} from '../errors';
import type {MushafFontOrigin} from '../types';
import type {FontSourcePlan} from './font-source';

export type FontStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type FontEntry = {
  readonly key: string;
  readonly fontFamily: string;
  /** The steps the load runs, in order (the source, then any fallback). */
  plan: FontSourcePlan;
  /** Which step the loaded face came from; `null` until loaded. */
  origin: MushafFontOrigin | null;
  status: FontStatus;
  /** Bumped on every (re)start; in-flight loads check it before applying their result. */
  generation: number;
  face: FontFace | null;
  error: MushafError | null;
  /** Settles when the current load finishes. Rejections are marked handled internally. */
  done: Promise<void>;
  settle: {resolve: () => void; reject: (e: MushafError) => void};
  /** Remotion delayRender handle held while loading. */
  handle: number | null;
  abort: AbortController | null;
};

type Store = {
  readonly entries: Map<string, FontEntry>;
  readonly listeners: Set<() => void>;
};

// Keyed on globalThis so Studio fast-refresh and duplicate package copies share one registry:
// one font family must map to exactly one FontFace in document.fonts. One entry per page and source
// (`plan.key`); `@2` because the entry shape changed.
const STORE_KEY = Symbol.for('remotion-mushaf-line-renderer/font-store@2');

const getStore = (): Store => {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  let store = g[STORE_KEY];
  if (!store) {
    store = {entries: new Map(), listeners: new Set()};
    g[STORE_KEY] = store;
  }
  return store;
};

export const getFontEntry = (key: string): FontEntry | null => getStore().entries.get(key) ?? null;

export const setFontEntry = (entry: FontEntry): void => {
  getStore().entries.set(entry.key, entry);
};

export const getFontStatus = (key: string): FontStatus => getFontEntry(key)?.status ?? 'idle';

export const subscribeFontStore = (listener: () => void): (() => void) => {
  const {listeners} = getStore();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const notifyFontStore = (): void => {
  for (const listener of getStore().listeners) listener();
};

/** Test hook: drop every entry and listener. */
export const resetFontStore = (): void => {
  const store = getStore();
  for (const entry of store.entries.values()) entry.abort?.abort();
  store.entries.clear();
  store.listeners.clear();
};

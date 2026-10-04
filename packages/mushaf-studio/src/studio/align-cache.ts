// Re-aligning a recording the aligner still holds: the alignment of each recording is cached by the
// SHA-256 of its bytes for as long as QUD keeps a session (a few hours), so the same file aligned
// again reuses its `audio_id` instead of uploading it a second time. A session the aligner has
// dropped (404 or 410) falls back to a fresh upload. Studio only: IndexedDB, or localStorage for a
// small entry; nothing of it is written to a file or to the props.
import {isMushafStudioError} from '../errors';
import {alignAudio, sessionTimestamps} from '../qud';
import type {
  QudAlignOptions,
  QudAlignResponse,
  QudClientOptions,
  QudModel,
  QudRiwayah,
  QudTimestampsResponse,
} from '../qud/types';
import {ALIGN_CACHE_PREFIX} from './store';

/** How long the aligner keeps a session warm, as far as the cache trusts it. */
export const ALIGN_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

/** Entries up to this size go to localStorage; larger ones to IndexedDB. */
export const SMALL_ENTRY_BYTES = 200_000;

const DB_NAME = 'mushaf-studio';
const DB_STORE = 'alignments';

/** One cached alignment: the aligner's answer and when it was made. */
export type CachedAlignment = {
  readonly key: string;
  readonly audioId: string;
  readonly align: QudAlignResponse;
  /** `Date.now()` when the alignment came back. */
  readonly at: number;
};

/** The hex SHA-256 of the bytes (`crypto.subtle`); `null` where the browser has no Web Crypto. */
export const sha256Hex = async (data: Blob | ArrayBuffer): Promise<string | null> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  // An ArrayBuffer of another realm (a test's, a worker's) fails `instanceof`: ask the Blob instead.
  const bytes = typeof (data as Blob).arrayBuffer === 'function' ? await (data as Blob).arrayBuffer() : data;
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes as ArrayBuffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** The cache key of a recording aligned with a model and a riwayah: the same bytes with other options are aligned again. */
export const alignCacheKey = (hash: string, model: QudModel | undefined, riwayah: QudRiwayah | undefined): string =>
  `${hash}:${model ?? 'Base'}:${riwayah ?? 'hafs'}`;

const local = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const database = (): Promise<IDBDatabase> | null => {
  const factory = typeof indexedDB === 'undefined' ? null : indexedDB;
  if (factory === null) return null;
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/** One request on the alignments store, settled as a promise; `undefined` where IndexedDB is missing or fails. */
const onStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> => {
  try {
    const opening = database();
    if (opening === null) return undefined;
    const db = await opening;
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(DB_STORE, mode).objectStore(DB_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
};

const isEntry = (value: unknown): value is CachedAlignment => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.key === 'string' &&
    typeof entry.audioId === 'string' &&
    typeof entry.at === 'number' &&
    typeof entry.align === 'object' &&
    entry.align !== null
  );
};

/** Forgets one cached alignment, wherever it was kept. */
export const forgetCachedAlignment = async (key: string): Promise<void> => {
  try {
    local()?.removeItem(ALIGN_CACHE_PREFIX + key);
  } catch {
    // Nothing to forget.
  }
  await onStore('readwrite', (store) => store.delete(key));
};

/** The alignment cached under `key` if it is younger than the session lifetime at `now`; an older one is forgotten. */
export const readCachedAlignment = async (key: string, now: number): Promise<CachedAlignment | null> => {
  let found: unknown = null;
  try {
    const raw = local()?.getItem(ALIGN_CACHE_PREFIX + key);
    if (raw) found = JSON.parse(raw);
  } catch {
    found = null;
  }
  if (!isEntry(found)) found = (await onStore('readonly', (store) => store.get(key))) ?? null;
  if (!isEntry(found) || found.key !== key) return null;
  if (now - found.at >= ALIGN_CACHE_TTL_MS || now < found.at) {
    await forgetCachedAlignment(key);
    return null;
  }
  return found;
};

/** Keeps an alignment: localStorage when it is small, IndexedDB otherwise. A full or missing storage keeps nothing. */
export const writeCachedAlignment = async (entry: CachedAlignment): Promise<void> => {
  const json = JSON.stringify(entry);
  if (json.length <= SMALL_ENTRY_BYTES) {
    try {
      const storage = local();
      if (storage) {
        storage.setItem(ALIGN_CACHE_PREFIX + entry.key, json);
        return;
      }
    } catch {
      // Quota: try IndexedDB.
    }
  }
  await onStore('readwrite', (store) => store.put(entry, entry.key));
};

/** Whether a failure says the aligner no longer has the session: HTTP 404 or 410. */
export const isSessionGone = (error: unknown): boolean =>
  isMushafStudioError(error) &&
  error.code === 'QUD_HTTP' &&
  (error.details.status === 404 || error.details.status === 410);

export type AlignWithCacheResult = {
  readonly align: QudAlignResponse;
  readonly timestamps: QudTimestampsResponse;
  /** Whether a cached session was reused, so nothing was uploaded. */
  readonly reused: boolean;
  /** When the reused alignment was made (`Date.now()`), `null` for a fresh one. */
  readonly alignedAt: number | null;
};

/**
 * Aligns a recording, reusing the cached session of the same bytes (same model and riwayah) while
 * the aligner still has it: the word times are asked of that session, and only a 404 or a 410
 * sends the audio again. A fresh alignment is cached. `now` is passed in so a test can pin it.
 */
export const alignWithCache = async (options: {
  readonly audio: Blob;
  readonly fileName: string;
  readonly align: QudAlignOptions;
  readonly client: QudClientOptions;
  readonly now: () => number;
  /** Told before the upload starts, so the status line can say the audio is being sent. */
  readonly onUpload?: (() => void) | undefined;
  /** Told once the alignment is in, before the word times are fetched. */
  readonly onAligned?: (() => void) | undefined;
}): Promise<AlignWithCacheResult> => {
  const {audio, fileName, align, client, now} = options;
  const hash = await sha256Hex(audio).catch(() => null);
  const key = hash === null ? null : alignCacheKey(hash, align.model, align.riwayah);
  const cached = key === null ? null : await readCachedAlignment(key, now());
  if (cached !== null) {
    try {
      options.onAligned?.();
      const timestamps = await sessionTimestamps(cached.audioId, {}, client);
      return {align: cached.align, timestamps, reused: true, alignedAt: cached.at};
    } catch (error) {
      if (!isSessionGone(error)) throw error;
      await forgetCachedAlignment(cached.key);
    }
  }
  options.onUpload?.();
  const response = await alignAudio(audio, fileName, align, client);
  if (key !== null) await writeCachedAlignment({key, audioId: response.audio_id, align: response, at: now()});
  options.onAligned?.();
  const timestamps = await sessionTimestamps(response.audio_id, {}, client);
  return {align: response, timestamps, reused: false, alignedAt: null};
};

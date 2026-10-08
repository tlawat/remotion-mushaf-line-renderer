// @vitest-environment jsdom
// Re-aligning the same recording: the SHA-256 cache (localStorage for a small entry, IndexedDB for a
// large one, gone after the session lifetime), the reuse of a live session without an upload, the
// fresh upload when the aligner answers 404 or 410; and the Hugging Face token remembered only on
// request, forgotten on request.
import {Blob as NodeBlob} from 'node:buffer';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const env = vi.hoisted(() => ({
  isStudio: true,
  isRendering: false,
  isPlayer: false,
  isClientSideRendering: false,
  isReadOnlyStudio: false,
}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  getRemotionEnvironment: () => env,
  useRemotionEnvironment: () => env,
  useVideoConfig: () => ({width: 1920, height: 1080, fps: 30, durationInFrames: 900, id: 'MushafRecitation'}),
  useCurrentFrame: () => 0,
  Sequence: () => null,
  staticFile: (path: string) => `/static/${path}`,
}));

const studio = vi.hoisted(() => ({
  writeStaticFile: vi.fn(async () => undefined),
  saveDefaultProps: vi.fn(async () => undefined),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => []),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);

const qud = vi.hoisted(() => ({
  alignAudio: vi.fn(),
  sessionTimestamps: vi.fn(),
  timingsFromQud: vi.fn(),
}));
vi.mock('../../../src/qud', () => ({...qud, DEFAULT_CONFIDENCE_THRESHOLD: 0.8}));

const cache = await import('../../../src/studio/align-cache');
const store = await import('../../../src/studio/store');
const {MushafStudioError} = await import('../../../src/errors');
const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
type QudAlignResponse = import('../../../src/qud/types').QudAlignResponse;

const HOUR = 60 * 60 * 1000;
const response = (audioId: string, extra: Record<string, unknown> = {}): QudAlignResponse =>
  ({audio_id: audioId, segments: [], ...extra}) as unknown as QudAlignResponse;
const timestamps = (audioId: string) => ({audio_id: audioId, segments: []});
const gone = (status: number) =>
  new MushafStudioError('QUD_HTTP', `QUD POST /sessions/x/timestamps failed with HTTP ${status}.`, {status});

/** A Blob with `arrayBuffer()` (jsdom's has none), as the browser hands the panel. */
const recording = (text: string) => new NodeBlob([text]) as unknown as Blob;

/** The smallest IndexedDB the cache needs: one store, get/put/delete, answers on a microtask. */
const fakeIndexedDB = () => {
  const data = new Map<string, string>();
  const request = (run: () => unknown) => {
    const r: {result?: unknown; error?: unknown; onsuccess?: () => void; onerror?: () => void} = {};
    queueMicrotask(() => {
      try {
        r.result = run();
        r.onsuccess?.();
      } catch (error) {
        r.error = error;
        r.onerror?.();
      }
    });
    return r;
  };
  const objectStore = {
    get: (key: string) => request(() => (data.has(key) ? JSON.parse(data.get(key)!) : undefined)),
    put: (value: unknown, key: string) => request(() => data.set(key, JSON.stringify(value)) && key),
    delete: (key: string) => request(() => void data.delete(key)),
  };
  const db = {
    objectStoreNames: {contains: () => true},
    createObjectStore: vi.fn(),
    transaction: () => ({objectStore: () => objectStore}),
    close: vi.fn(),
  };
  const factory = {
    open: () => {
      const r: {result?: unknown; onsuccess?: () => void; onupgradeneeded?: () => void} = {};
      queueMicrotask(() => {
        r.result = db;
        r.onsuccess?.();
      });
      return r;
    },
  };
  return {factory, data};
};

beforeEach(() => {
  store.resetStudioStore();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  store.resetStudioStore();
});

describe('the alignment cache', () => {
  it('hashes the bytes with SHA-256', async () => {
    expect(await cache.sha256Hex(recording('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await cache.sha256Hex(new TextEncoder().encode('abc').buffer as ArrayBuffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(cache.alignCacheKey('ab', undefined, undefined)).toBe('ab:Base:hafs');
    expect(cache.alignCacheKey('ab', 'Large', 'warsh')).toBe('ab:Large:warsh');
  });

  it('keeps a small entry in localStorage for the session lifetime, then forgets it', async () => {
    const entry = {key: 'h:Base:hafs', audioId: 'sess-1', align: response('sess-1'), at: 1_000};
    await cache.writeCachedAlignment(entry);
    expect(JSON.parse(localStorage.getItem('mushaf-studio.align.h:Base:hafs')!)).toEqual(entry);
    expect(await cache.readCachedAlignment('h:Base:hafs', 1_000 + 2 * HOUR)).toEqual(entry);
    expect(await cache.readCachedAlignment('other', 1_000)).toBeNull();
    expect(await cache.readCachedAlignment('h:Base:hafs', 1_000 + cache.ALIGN_CACHE_TTL_MS)).toBeNull();
    expect(localStorage.getItem('mushaf-studio.align.h:Base:hafs')).toBeNull();
  });

  it('ignores junk and a clock that went backwards', async () => {
    localStorage.setItem('mushaf-studio.align.j', '{"key": "j", "audioId": 3}');
    expect(await cache.readCachedAlignment('j', 0)).toBeNull();
    localStorage.setItem('mushaf-studio.align.k', 'not json');
    expect(await cache.readCachedAlignment('k', 0)).toBeNull();
    await cache.writeCachedAlignment({key: 'f', audioId: 'a', align: response('a'), at: 5_000});
    expect(await cache.readCachedAlignment('f', 1_000)).toBeNull();
  });

  it('keeps a large entry in IndexedDB', async () => {
    const {factory, data} = fakeIndexedDB();
    vi.stubGlobal('indexedDB', factory);
    const big = response('sess-big', {warning: 'x'.repeat(cache.SMALL_ENTRY_BYTES)});
    const entry = {key: 'big:Base:hafs', audioId: 'sess-big', align: big, at: 0};
    await cache.writeCachedAlignment(entry);
    expect(localStorage.getItem('mushaf-studio.align.big:Base:hafs')).toBeNull();
    expect(data.has('big:Base:hafs')).toBe(true);
    expect(await cache.readCachedAlignment('big:Base:hafs', HOUR)).toEqual(entry);
    await cache.forgetCachedAlignment('big:Base:hafs');
    expect(data.has('big:Base:hafs')).toBe(false);
  });

  it('is forgotten with the rest of the store', async () => {
    await cache.writeCachedAlignment({key: 'z', audioId: 'a', align: response('a'), at: 0});
    store.resetStudioStore();
    expect(localStorage.getItem('mushaf-studio.align.z')).toBeNull();
  });
});

describe('alignWithCache', () => {
  const run = (text: string, now: number, align: {model?: 'Base' | 'Large'} = {}) =>
    cache.alignWithCache({audio: recording(text), fileName: 'a.m4a', align, client: {token: null}, now: () => now});

  it('uploads once, then reuses the live session of the same bytes without uploading', async () => {
    qud.alignAudio.mockResolvedValue(response('sess-1'));
    qud.sessionTimestamps.mockResolvedValue(timestamps('sess-1'));
    const first = await run('audio', 1_000);
    expect(first).toEqual({
      align: response('sess-1'),
      timestamps: timestamps('sess-1'),
      reused: false,
      alignedAt: null,
    });
    expect(qud.alignAudio).toHaveBeenCalledTimes(1);
    const second = await run('audio', 1_000 + HOUR);
    expect(second).toMatchObject({reused: true, alignedAt: 1_000, align: response('sess-1')});
    expect(qud.alignAudio).toHaveBeenCalledTimes(1);
    expect(qud.sessionTimestamps).toHaveBeenLastCalledWith('sess-1', {}, {token: null});
    // Other bytes, or other options, are aligned again.
    qud.alignAudio.mockResolvedValue(response('sess-2'));
    await run('other audio', 1_000 + HOUR);
    await run('audio', 1_000 + HOUR, {model: 'Large'});
    expect(qud.alignAudio).toHaveBeenCalledTimes(3);
  });

  it.each([404, 410])('uploads again when the aligner answers %i for the cached session', async (status) => {
    qud.alignAudio.mockResolvedValueOnce(response('old')).mockResolvedValueOnce(response('new'));
    qud.sessionTimestamps
      .mockResolvedValueOnce(timestamps('old'))
      .mockRejectedValueOnce(gone(status))
      .mockResolvedValueOnce(timestamps('new'));
    await run('audio', 0);
    const again = await run('audio', HOUR);
    expect(again).toMatchObject({reused: false, align: response('new'), timestamps: timestamps('new')});
    expect(qud.sessionTimestamps.mock.calls.map((call) => call[0])).toEqual(['old', 'old', 'new']);
    expect(qud.alignAudio).toHaveBeenCalledTimes(2);
    // The new session replaced the dead one in the cache.
    const key = cache.alignCacheKey((await cache.sha256Hex(recording('audio')))!, undefined, undefined);
    expect((await cache.readCachedAlignment(key, HOUR))?.audioId).toBe('new');
  });

  it('passes on any other failure of the cached session and keeps the entry', async () => {
    qud.alignAudio.mockResolvedValue(response('sess-1'));
    qud.sessionTimestamps.mockResolvedValueOnce(timestamps('sess-1')).mockRejectedValueOnce(gone(500));
    await run('audio', 0);
    await expect(run('audio', HOUR)).rejects.toThrow(/HTTP 500/);
    expect(qud.alignAudio).toHaveBeenCalledTimes(1);
    const key = cache.alignCacheKey((await cache.sha256Hex(recording('audio')))!, undefined, undefined);
    expect(await cache.readCachedAlignment(key, HOUR)).not.toBeNull();
  });

  it('uploads after the session lifetime', async () => {
    qud.alignAudio.mockResolvedValue(response('sess-1'));
    qud.sessionTimestamps.mockResolvedValue(timestamps('sess-1'));
    await run('audio', 0);
    await run('audio', cache.ALIGN_CACHE_TTL_MS + 1);
    expect(qud.alignAudio).toHaveBeenCalledTimes(2);
  });

  it('aligns without a cache where the bytes cannot be hashed', async () => {
    vi.stubGlobal('crypto', {});
    qud.alignAudio.mockResolvedValue(response('sess-1'));
    qud.sessionTimestamps.mockResolvedValue(timestamps('sess-1'));
    await run('audio', 0);
    await run('audio', 0);
    expect(qud.alignAudio).toHaveBeenCalledTimes(2);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('mushaf-studio.align.'))).toEqual([]);
  });
});

describe('the Hugging Face token', () => {
  it('stays in sessionStorage unless the user asks this browser to remember it', () => {
    store.setHfToken('hf_a');
    expect(store.isHfTokenRemembered()).toBe(false);
    store.rememberHfToken(true);
    expect(localStorage.getItem('mushaf-studio.hf-token')).toBe('hf_a');
    expect(sessionStorage.getItem('mushaf-studio.hf-token')).toBeNull();
    expect(store.isHfTokenRemembered()).toBe(true);
    expect(store.getHfToken()).toBe('hf_a');
    // A new token typed while remembered replaces the remembered one.
    store.setHfToken('hf_b');
    expect(localStorage.getItem('mushaf-studio.hf-token')).toBe('hf_b');
    store.rememberHfToken(false);
    expect(localStorage.getItem('mushaf-studio.hf-token')).toBeNull();
    expect(sessionStorage.getItem('mushaf-studio.hf-token')).toBe('hf_b');
    store.rememberHfToken(true);
    store.forgetHfToken();
    expect(store.getHfToken()).toBe('');
    expect(localStorage.getItem('mushaf-studio.hf-token')).toBeNull();
    expect(sessionStorage.getItem('mushaf-studio.hf-token')).toBeNull();
  });

  it('is remembered and forgotten from the Align tab, which says where it goes', () => {
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="align" />,
    );
    const input = screen.getByLabelText('Hugging Face token (optional, for your own GPU quota)');
    fireEvent.change(input, {target: {value: 'hf_secret'}});
    const remember = screen.getByRole('checkbox', {name: 'Remember for this browser'});
    expect(remember).toHaveProperty('checked', false);
    fireEvent.click(remember);
    expect(localStorage.getItem('mushaf-studio.hf-token')).toBe('hf_secret');
    expect(screen.getByText(/stays on this computer, .* is sent only to aligner\.qud\.dev/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Forget'}));
    expect(input).toHaveProperty('value', '');
    expect(remember).toHaveProperty('checked', false);
    expect(localStorage.getItem('mushaf-studio.hf-token')).toBeNull();
    expect(sessionStorage.getItem('mushaf-studio.hf-token')).toBeNull();
  });

  it('comes back remembered after a reload', async () => {
    store.setHfToken('hf_kept');
    store.rememberHfToken(true);
    sessionStorage.clear();
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="align" />,
    );
    expect(screen.getByLabelText('Hugging Face token (optional, for your own GPU quota)')).toHaveProperty(
      'value',
      'hf_kept',
    );
    expect(screen.getByRole('checkbox', {name: 'Remember for this browser'})).toHaveProperty('checked', true);
  });
});

describe('Align with the cache', () => {
  it('says when a session was reused and nothing was uploaded', async () => {
    const timings = {version: 1, surah: 1, ayat: [{ayah: 2, start: 0, end: 1}]};
    qud.alignAudio.mockResolvedValue(response('sess-1'));
    qud.sessionTimestamps.mockResolvedValue(timestamps('sess-1'));
    qud.timingsFromQud.mockReturnValue(timings);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ok: true, status: 200, blob: async () => recording('audio')})),
    );
    store.setStudioState({uploadedAudio: 'mushaf-studio/p/take.m4a'});
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="align" />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Align'}));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(store.getStudioState().busy).toBeNull());
    expect(store.getStudioState().notice).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Align'}));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(store.getStudioState().busy).toBeNull());
    expect(qud.alignAudio).toHaveBeenCalledTimes(1);
    expect(store.getStudioState().notice).toMatch(
      /^This file was aligned at \d\d:\d\d and the aligner still has that session/,
    );
    expect(store.getStudioState().session).toMatchObject({audioId: 'sess-1', audio: 'mushaf-studio/p/take.m4a'});
  });
});

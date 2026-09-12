// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

type Env = {
  isRendering: boolean;
  isStudio: boolean;
  isPlayer: boolean;
  isClientSideRendering: boolean;
  isReadOnlyStudio: boolean;
};
const env: Env = {
  isRendering: false,
  isStudio: true,
  isPlayer: false,
  isClientSideRendering: false,
  isReadOnlyStudio: false,
};
let nextHandle = 1;
const remotionMock = {
  delayRender: vi.fn((_label?: string, _options?: unknown) => nextHandle++),
  continueRender: vi.fn(),
  cancelRender: vi.fn((e: unknown) => {
    throw e;
  }),
  getRemotionEnvironment: vi.fn(() => env),
};
vi.mock('remotion', () => remotionMock);

const {loadPageFont, getFontLoadBudget, assertFontMagic} = await import('../../src/fonts/load-page-font');
const {getFontEntry, getFontStatus, resetFontStore, subscribeFontStore} = await import('../../src/fonts/font-store');
const {MushafError} = await import('../../src/errors');

const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4, 5, 6, 7, 8]).buffer;
const TTF = new Uint8Array([0, 1, 0, 0, 0, 12, 0, 128]).buffer;
const HTML = new TextEncoder().encode('<!DOCTYPE html><html>error</html>').buffer;

type FakeFace = {
  family: string;
  source: unknown;
  descriptors: Record<string, string>;
  status: string;
  load: () => Promise<FakeFace>;
};
let faces: FakeFace[] = [];
let loadBehaviour: (face: FakeFace) => Promise<void> = async () => undefined;
class FontFaceMock {
  family: string;
  source: unknown;
  descriptors: Record<string, string>;
  status = 'unloaded';
  constructor(family: string, source: unknown, descriptors: Record<string, string>) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
    faces.push(this as unknown as FakeFace);
  }
  async load() {
    this.status = 'loading';
    try {
      await loadBehaviour(this as unknown as FakeFace);
      this.status = 'loaded';
    } catch (e) {
      this.status = 'error';
      throw e;
    }
    return this;
  }
}
const fontSet = new Set<unknown>();
const fetchMock = vi.fn();

const response = (status: number, body: ArrayBuffer) => ({
  ok: status >= 200 && status < 300,
  status,
  arrayBuffer: async () => body,
});
const okResponse = () => response(200, WOFF2);

const flush = async (n = 5) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

beforeEach(() => {
  resetFontStore();
  faces = [];
  loadBehaviour = async () => undefined;
  fontSet.clear();
  nextHandle = 1;
  env.isRendering = false;
  remotionMock.delayRender.mockClear();
  remotionMock.continueRender.mockClear();
  remotionMock.cancelRender.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(okResponse());
  vi.stubGlobal('FontFace', FontFaceMock);
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add: (f: unknown) => fontSet.add(f),
      delete: (f: unknown) => fontSet.delete(f),
      has: (f: unknown) => fontSet.has(f),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('loadPageFont', () => {
  it('loads once per page and reuses the promise for every later call', async () => {
    const a = loadPageFont({mushaf: 'qpc-v4', page: 10});
    const b = loadPageFont({mushaf: 'qpc-v4', page: 10});
    expect(a.fontFamily).toBe('mushaf-qpc-v4-p10');
    expect(b.fontFamily).toBe(a.fontFamily);
    await a.waitUntilDone();
    await b.waitUntilDone();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({mode: 'cors', credentials: 'omit'});
    expect(faces).toHaveLength(1);
    expect(remotionMock.delayRender).toHaveBeenCalledTimes(1);
    expect(remotionMock.delayRender.mock.calls[0]?.[0]).toBe(
      'Loading mushaf font mushaf-qpc-v4-p10 from https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2',
    );
    expect(remotionMock.delayRender.mock.calls[0]?.[1]).toEqual({retries: 1});
    expect(remotionMock.continueRender).toHaveBeenCalledTimes(1);
    expect(remotionMock.continueRender).toHaveBeenCalledWith(1);
    expect(getFontStatus('qpc-v4/10')).toBe('loaded');
    expect(fontSet.size).toBe(1);
    // A later call after completion creates no new work either.
    const c = loadPageFont({mushaf: 'qpc-v4', page: 10});
    await c.waitUntilDone();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('registers the font with pinned metrics, weight 400 and font-display block', async () => {
    await loadPageFont({look: 'tajweed', page: 3}).waitUntilDone();
    expect(faces[0]?.family).toBe('mushaf-qpc-v4-tajweed-p3');
    expect(faces[0]?.source).toBe(WOFF2);
    expect(faces[0]?.descriptors).toEqual({
      display: 'block',
      style: 'normal',
      weight: '400',
      ascentOverride: '157.6%',
      descentOverride: '100.8%',
      lineGapOverride: '0%',
    });
  });

  it('adopts a registered override when url is omitted and when the same url is passed', async () => {
    const first = loadPageFont({mushaf: 'qpc-v4', page: 10, url: '/fonts/qpc-v4/p10.woff2?v=3.1'});
    await first.waitUntilDone();
    const implicit = loadPageFont({mushaf: 'qpc-v4', page: 10});
    const same = loadPageFont({mushaf: 'qpc-v4', page: 10, url: '/fonts/qpc-v4/p10.woff2?v=3.1'});
    await Promise.all([implicit.waitUntilDone(), same.waitUntilDone()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/fonts/qpc-v4/p10.woff2?v=3.1');
    expect(getFontEntry('qpc-v4/10')).toMatchObject({
      explicit: true,
      url: '/fonts/qpc-v4/p10.woff2?v=3.1',
      status: 'loaded',
    });
  });

  it('accepts extension-less and query-string urls (no format inference)', async () => {
    fetchMock.mockResolvedValueOnce(response(200, TTF));
    await loadPageFont({mushaf: 'qpc-v4', page: 1, url: 'https://cdn.example.com/signed/abc123?sig=x'}).waitUntilDone();
    expect(faces[0]?.source).toBe(TTF);
  });

  it('lets an explicit url replace the implicit CDN source, aborting the pending fetch', async () => {
    let resolveFirst!: (r: unknown) => void;
    fetchMock.mockImplementationOnce(
      (_url: string, init: {signal: AbortSignal}) =>
        new Promise((resolve, reject) => {
          resolveFirst = resolve;
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const events: string[] = [];
    subscribeFontStore(() => events.push(getFontStatus('qpc-v4/10')));
    const implicit = loadPageFont({mushaf: 'qpc-v4', page: 10});
    expect(getFontStatus('qpc-v4/10')).toBe('loading');
    const explicit = loadPageFont({mushaf: 'qpc-v4', page: 10, url: '/local/p10.woff2'});
    await explicit.waitUntilDone();
    await implicit.waitUntilDone(); // the original promise settles with the replacement's result
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/local/p10.woff2');
    expect(getFontEntry('qpc-v4/10')).toMatchObject({explicit: true, url: '/local/p10.woff2', status: 'loaded'});
    expect(remotionMock.delayRender).toHaveBeenCalledTimes(1); // one handle per loading period
    expect(remotionMock.continueRender).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['loading', 'loading', 'loaded']);
    resolveFirst(okResponse()); // late result of the aborted fetch must be ignored
    await flush();
    expect(faces).toHaveLength(1);
  });

  it('lets an explicit url replace an already loaded implicit face and hides it meanwhile', async () => {
    await loadPageFont({mushaf: 'qpc-v4', page: 10}).waitUntilDone();
    expect(fontSet.size).toBe(1);
    const replaced = loadPageFont({mushaf: 'qpc-v4', page: 10, url: '/local/p10.woff2'});
    expect(getFontStatus('qpc-v4/10')).toBe('loading');
    expect(fontSet.size).toBe(0);
    await replaced.waitUntilDone();
    expect(fontSet.size).toBe(1);
    expect(remotionMock.delayRender).toHaveBeenCalledTimes(2);
    expect(remotionMock.continueRender).toHaveBeenCalledTimes(2);
  });

  it('throws FONT_URL_CONFLICT for two different explicit urls', async () => {
    await loadPageFont({mushaf: 'qpc-v4', page: 10, url: '/a/p10.woff2'}).waitUntilDone();
    expect(() => loadPageFont({mushaf: 'qpc-v4', page: 10, url: '/b/p10.woff2'})).toThrow(MushafError);
    try {
      loadPageFont({mushaf: 'qpc-v4', page: 10, url: '/b/p10.woff2'});
    } catch (e) {
      expect(e).toMatchObject({code: 'FONT_URL_CONFLICT'});
      expect((e as Error).message).toContain(
        'already loaded from /a/p10.woff2; refusing to load it again from /b/p10.woff2',
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails immediately on 404 with cancelRender and a rejecting waitUntilDone', async () => {
    fetchMock.mockResolvedValue(response(404, new ArrayBuffer(0)));
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10});
    await expect(font.waitUntilDone()).rejects.toMatchObject({
      code: 'FONT_HTTP',
      message: expect.stringContaining('HTTP 404 for mushaf font qpc-v4 page 10'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(remotionMock.cancelRender).toHaveBeenCalledTimes(1);
    expect(remotionMock.continueRender).not.toHaveBeenCalled();
    expect(getFontStatus('qpc-v4/10')).toBe('error');
    expect(getFontEntry('qpc-v4/10')?.error?.code).toBe('FONT_HTTP');
    // A later call retries from scratch.
    fetchMock.mockResolvedValue(okResponse());
    await loadPageFont({mushaf: 'qpc-v4', page: 10}).waitUntilDone();
    expect(getFontStatus('qpc-v4/10')).toBe('loaded');
  });

  it('retries 5xx with backoff, then fails; retries network errors too', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(response(503, new ArrayBuffer(0)));
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10});
    const settled = font.waitUntilDone().then(
      () => 'ok',
      (e: InstanceType<typeof MushafError>) => e,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await settled;
    expect(result).toMatchObject({code: 'FONT_HTTP', message: expect.stringContaining('attempt 3/3')});
    expect(fetchMock).toHaveBeenCalledTimes(3);

    resetFontStore();
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(okResponse());
    const recovered = loadPageFont({mushaf: 'qpc-v4', page: 11});
    const p = recovered.waitUntilDone();
    await vi.advanceTimersByTimeAsync(5_000);
    await p;
    expect(getFontStatus('qpc-v4/11')).toBe('loaded');
  });

  it('classifies per-attempt timeouts, non-font bodies and parse failures', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const slow = loadPageFont({mushaf: 'qpc-v4', page: 10})
      .waitUntilDone()
      .then(
        () => 'ok',
        (e: InstanceType<typeof MushafError>) => e,
      );
    await vi.advanceTimersByTimeAsync(3 * 15_000 + 3 * 500 + 100);
    expect(await slow).toMatchObject({code: 'FONT_TIMEOUT'});
    vi.useRealTimers();

    resetFontStore();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(response(200, HTML));
    await expect(loadPageFont({mushaf: 'qpc-v4', page: 12}).waitUntilDone()).rejects.toMatchObject({
      code: 'FONT_INVALID',
      message: expect.stringContaining('starts with "<!DOCTYPE html><"'),
    });

    resetFontStore();
    fetchMock.mockResolvedValue(okResponse());
    loadBehaviour = async () => {
      throw new DOMException('A network error occurred', 'NetworkError');
    };
    await expect(loadPageFont({mushaf: 'qpc-v4', page: 13}).waitUntilDone()).rejects.toMatchObject({
      code: 'FONT_PARSE',
    });
  });

  it('does not produce an unhandled rejection when nobody awaits a failing load', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    fetchMock.mockResolvedValue(response(404, new ArrayBuffer(0)));
    loadPageFont({mushaf: 'qpc-v4', page: 10});
    await flush(20);
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(getFontStatus('qpc-v4/10')).toBe('error');
  });

  it('is a no-op without FontFace (server) and never touches delayRender there', async () => {
    vi.stubGlobal('FontFace', undefined);
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10});
    expect(font.fontFamily).toBe('mushaf-qpc-v4-p10');
    await expect(font.waitUntilDone()).resolves.toBeUndefined();
    expect(remotionMock.delayRender).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getFontStatus('qpc-v4/10')).toBe('idle');
  });

  it('validates its arguments before doing anything', () => {
    expect(() => loadPageFont({mushaf: 'nope' as never, page: 1})).toThrow(/Unknown mushaf "nope"/);
    expect(() => loadPageFont({mushaf: 'qpc-v4', page: 0})).toThrow(/page must be an integer/);
    expect(() => loadPageFont({mushaf: 'qpc-v4', page: 1, url: ''})).toThrow(/url must be a non-empty string/);
    expect(remotionMock.delayRender).not.toHaveBeenCalled();
  });

  it('shares the store across module instances through globalThis', async () => {
    await loadPageFont({mushaf: 'qpc-v4', page: 10}).waitUntilDone();
    vi.resetModules();
    const fresh = await import('../../src/fonts/font-store');
    expect(fresh.getFontStatus('qpc-v4/10')).toBe('loaded');
  });
});

describe('getFontLoadBudget', () => {
  it('fits two attempts inside the delayRender timeout while rendering', () => {
    expect(getFontLoadBudget(true, 30_000)).toEqual({attempts: 2, perAttemptMs: 12_750, backoffMs: 500});
    expect(getFontLoadBudget(true, 60_000)).toEqual({attempts: 2, perAttemptMs: 27_750, backoffMs: 500});
    expect(getFontLoadBudget(true, undefined)).toEqual({attempts: 2, perAttemptMs: 12_750, backoffMs: 500});
    expect(getFontLoadBudget(true, 8_000)).toEqual({attempts: 2, perAttemptMs: 4_000, backoffMs: 500});
    for (const timeout of [30_000, 60_000, 120_000]) {
      const b = getFontLoadBudget(true, timeout);
      expect(b.attempts * b.perAttemptMs + (b.attempts - 1) * b.backoffMs).toBeLessThan(timeout - 2_000);
    }
    expect(getFontLoadBudget(false, undefined)).toEqual({attempts: 3, perAttemptMs: 15_000, backoffMs: 500});
  });

  it('uses the rendering budget when Remotion reports a render', async () => {
    env.isRendering = true;
    (window as unknown as {remotion_puppeteerTimeout?: number}).remotion_puppeteerTimeout = 40_000;
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(response(503, new ArrayBuffer(0)));
    const failed = loadPageFont({mushaf: 'qpc-v4', page: 10})
      .waitUntilDone()
      .then(
        () => 'ok',
        (e: InstanceType<typeof MushafError>) => e,
      );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await failed).toMatchObject({code: 'FONT_HTTP', message: expect.stringContaining('attempt 2/2')});
    delete (window as unknown as {remotion_puppeteerTimeout?: number}).remotion_puppeteerTimeout;
  });
});

describe('assertFontMagic', () => {
  it('accepts woff2/woff/ttf/otf and rejects anything else with a preview', () => {
    for (const tag of ['wOF2', 'wOFF', 'OTTO', 'true'])
      expect(() => assertFontMagic(new TextEncoder().encode(`${tag}xxxx`).buffer, 'u', 'm', 1)).not.toThrow();
    expect(() => assertFontMagic(TTF, 'u', 'm', 1)).not.toThrow();
    expect(() => assertFontMagic(HTML, 'https://x/p1.woff2', 'qpc-v4', 1)).toThrow(
      /not a font file \(33 bytes, starts with "<!DOCTYPE html><"\)/,
    );
    expect(() => assertFontMagic(new ArrayBuffer(2), 'u', 'm', 1)).toThrow(/2 bytes/);
  });
});

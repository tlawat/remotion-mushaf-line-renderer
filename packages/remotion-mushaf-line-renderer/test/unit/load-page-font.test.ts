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

const {loadPageFont, loadSharedFont, resetFallbackWarnings} = await import('../../src/fonts/load-page-font');
const {getMushafFontFile} = await import('../../src/fonts/font-file');
const {assertFontMagic} = await import('../../src/fonts/font-magic');
const {getFontStepBudget} = await import('../../src/fetch-budget');
const {resetFontSourceWarnings} = await import('../../src/fonts/font-source');
const {getFontEntry, getFontStatus, resetFontStore} = await import('../../src/fonts/font-store');
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
  resetFallbackWarnings();
  resetFontSourceWarnings();
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
  vi.restoreAllMocks();
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
      "Loading mushaf font mushaf-qpc-v4-p10 from QUL's CDN (https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2)",
    );
    expect(remotionMock.delayRender.mock.calls[0]?.[1]).toEqual({retries: 1});
    expect(remotionMock.continueRender).toHaveBeenCalledTimes(1);
    expect(remotionMock.continueRender).toHaveBeenCalledWith(1);
    expect(getFontStatus('qpc-v4/10#cdn')).toBe('loaded');
    expect(fontSet.size).toBe(1);
    // A later call after completion creates no new work either.
    const c = loadPageFont({mushaf: 'qpc-v4', page: 10});
    await c.waitUntilDone();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('registers the font with pinned metrics, weight 400 and font-display block', async () => {
    await loadPageFont({theme: 'light', page: 3}).waitUntilDone();
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

  it('loads your own URLs through a resolver, in order, under a family of their own', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/a/p10.woff2' ? response(404, new ArrayBuffer(0)) : response(200, TTF),
    );
    const seen: unknown[] = [];
    const font = loadPageFont({
      mushaf: 'qpc-v4',
      page: 10,
      fontSrc: (file) => {
        seen.push(file);
        return ['/a/p10.woff2', `https://cdn.example.com/signed/${file.id}?sig=x`];
      },
    });
    expect(font.fontFamily).toMatch(/^mushaf-qpc-v4-p10-[0-9a-z]+$/);
    await font.waitUntilDone();
    expect(seen[0]).toEqual({
      kind: 'page',
      mushaf: 'qpc-v4',
      fontSet: 'qpc-v4',
      page: 10,
      format: 'woff2',
      id: 'p10',
      fileName: 'p10.woff2',
      cdnUrl: 'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2',
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/a/p10.woff2', 'https://cdn.example.com/signed/p10?sig=x']);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({credentials: 'same-origin'});
    expect(faces[0]?.source).toBe(TTF);
    expect(font.origin()).toBe('custom');
  });

  it('keeps one face per source: the CDN line and a custom line of the same page never share one', async () => {
    const cdn = loadPageFont({mushaf: 'qpc-v4', page: 10});
    const custom = loadPageFont({mushaf: 'qpc-v4', page: 10, fontSrc: () => '/local/p10.woff2'});
    await Promise.all([cdn.waitUntilDone(), custom.waitUntilDone()]);
    expect(cdn.fontFamily).not.toBe(custom.fontFamily);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fontSet.size).toBe(2);
    // The same resolver answer is the same source, whatever the function's identity.
    await loadPageFont({mushaf: 'qpc-v4', page: 10, fontSrc: () => '/local/p10.woff2'}).waitUntilDone();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects the removed url option and bad sources before doing anything', () => {
    expect(() => loadPageFont({mushaf: 'qpc-v4', page: 1, url: '/x.woff2'} as never)).toThrow(
      expect.objectContaining({code: 'BAD_FONT_SRC', message: expect.stringContaining('`url` was removed in 0.4')}),
    );
    expect(() => loadPageFont({mushaf: 'qpc-v4', page: 1, fontSrc: '/x.woff2' as never})).toThrow(
      expect.objectContaining({code: 'BAD_FONT_SRC', message: expect.stringContaining('pass () => url')}),
    );
    expect(() => loadPageFont({mushaf: 'qpc-v4', page: 1, fontSrc: () => ''})).toThrow(
      expect.objectContaining({code: 'BAD_FONT_SRC'}),
    );
    expect(() => loadPageFont({mushaf: 'qpc-v4', page: 1, fallback: {} as never})).toThrow(
      expect.objectContaining({code: 'BAD_FONT_FALLBACK'}),
    );
    expect(remotionMock.delayRender).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(getFontStatus('qpc-v4/10#cdn')).toBe('error');
    expect(getFontEntry('qpc-v4/10#cdn')?.error?.code).toBe('FONT_HTTP');
    // A later call retries from scratch.
    fetchMock.mockResolvedValue(okResponse());
    await loadPageFont({mushaf: 'qpc-v4', page: 10}).waitUntilDone();
    expect(getFontStatus('qpc-v4/10#cdn')).toBe('loaded');
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
    expect(getFontStatus('qpc-v4/11#cdn')).toBe('loaded');
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
    expect(getFontStatus('qpc-v4/10#cdn')).toBe('error');
  });

  it('is a no-op without FontFace (server) and never touches delayRender there', async () => {
    vi.stubGlobal('FontFace', undefined);
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10});
    expect(font.fontFamily).toBe('mushaf-qpc-v4-p10');
    await expect(font.waitUntilDone()).resolves.toBeUndefined();
    expect(remotionMock.delayRender).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getFontStatus('qpc-v4/10#cdn')).toBe('idle');
  });

  it('validates its arguments before doing anything', () => {
    expect(() => loadPageFont({mushaf: 'nope' as never, page: 1})).toThrow(/Unknown mushaf "nope"/);
    expect(() => loadPageFont({mushaf: 'qpc-v4', page: 0})).toThrow(/page must be an integer/);
    expect(remotionMock.delayRender).not.toHaveBeenCalled();
  });

  it('shares the store across module instances through globalThis', async () => {
    await loadPageFont({mushaf: 'qpc-v4', page: 10}).waitUntilDone();
    vi.resetModules();
    const fresh = await import('../../src/fonts/font-store');
    expect(fresh.getFontStatus('qpc-v4/10#cdn')).toBe('loaded');
  });
});

describe('getFontStepBudget', () => {
  it('fits two attempts inside the delayRender timeout while rendering, keeping time for a fallback', () => {
    expect(getFontStepBudget('primary', true, 30_000, 0)).toEqual({attempts: 2, perAttemptMs: 12_750, backoffMs: 500});
    expect(getFontStepBudget('primary', true, 60_000, 0)).toEqual({attempts: 2, perAttemptMs: 27_750, backoffMs: 500});
    expect(getFontStepBudget('primary', true, undefined, 0)).toEqual({
      attempts: 2,
      perAttemptMs: 12_750,
      backoffMs: 500,
    });
    expect(getFontStepBudget('primary', true, 8_000, 0)).toEqual({attempts: 2, perAttemptMs: 4_000, backoffMs: 500});
    expect(getFontStepBudget('primary', true, 30_000, 6_000)).toEqual({
      attempts: 2,
      perAttemptMs: 9_750,
      backoffMs: 500,
    });
    for (const timeout of [20_000, 30_000, 60_000, 120_000]) {
      const primary = getFontStepBudget('primary', true, timeout, 6_000);
      const pkg = getFontStepBudget('package', true, timeout, 0);
      const total =
        primary.attempts * primary.perAttemptMs +
        (primary.attempts - 1) * primary.backoffMs +
        pkg.attempts * pkg.perAttemptMs +
        (pkg.attempts - 1) * pkg.backoffMs;
      expect(total, `timeout ${timeout}`).toBeLessThan(timeout - 2_000);
    }
    expect(getFontStepBudget('primary', false, undefined, 6_000)).toEqual({
      attempts: 3,
      perAttemptMs: 15_000,
      backoffMs: 500,
    });
    expect(getFontStepBudget('package', false, undefined, 0)).toEqual({
      attempts: 2,
      perAttemptMs: 10_000,
      backoffMs: 250,
    });
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
      expect(() => assertFontMagic(new TextEncoder().encode(`${tag}xxxx`).buffer, 'u', 'm')).not.toThrow();
    expect(() => assertFontMagic(TTF, 'u', 'm')).not.toThrow();
    expect(() => assertFontMagic(HTML, 'https://x/p1.woff2', 'qpc-v4 page 1')).toThrow(
      /not a font file \(33 bytes, starts with "<!DOCTYPE html><"\)\. It looks like an HTML page/,
    );
    expect(() => assertFontMagic(new ArrayBuffer(2), 'u', 'm')).toThrow(/2 bytes/);
  });
});

describe('fonts packages: fontSrc and fallback', () => {
  const hex = (buffer: ArrayBuffer) =>
    Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
  const sha256 = async (buffer: ArrayBuffer) => hex(await crypto.subtle.digest('SHA-256', buffer));

  const makePackage = async (fontSet: 'qpc-v4' | 'qpc-v4-tajweed', bytes: ArrayBuffer = WOFF2) => {
    const hash = await sha256(bytes);
    const files: Record<number, {url: string; bytes: number; sha256: string}> = {};
    for (const page of [1, 10, 328]) {
      const format = fontSet === 'qpc-v4-tajweed' && page === 328 ? 'woff' : 'woff2';
      files[page] = {url: `/pkg/${fontSet}/p${page}.${format}`, bytes: bytes.byteLength, sha256: hash};
    }
    return {
      kind: 'remotion-mushaf-fonts' as const,
      schema: 1 as const,
      name: `@tlawat/mushaf-fonts-${fontSet}`,
      version: '1.20260912.0',
      mushaf: 'qpc-v4' as const,
      fontSet,
      snapshot: '2026-09-12',
      files,
    };
  };

  const cdnDown = (status = 503) =>
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/pkg/') ? response(200, WOFF2) : response(status, new ArrayBuffer(0)),
    );

  it('never touches the package while the CDN works', async () => {
    const pkg = await makePackage('qpc-v4');
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10, fallback: pkg});
    await font.waitUntilDone();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/^https:\/\/static-cdn\.tarteel\.ai\//);
    expect(font.origin()).toBe('cdn');
    // A source with a fallback is its own source: its own family, next to the CDN-only one.
    expect(font.fontFamily).toMatch(/^mushaf-qpc-v4-p10-[0-9a-z]+$/);
    expect(remotionMock.delayRender.mock.calls[0]?.[0]).toContain(
      "from QUL's CDN (https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2), then @tlawat/mushaf-fonts-qpc-v4@1.20260912.0",
    );
  });

  it('loads from the package when the CDN answers 404, and warns once per set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pkg = await makePackage('qpc-v4');
    cdnDown(404);
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10, fallback: pkg});
    await font.waitUntilDone();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2',
      '/pkg/qpc-v4/p10.woff2',
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({credentials: 'same-origin'});
    expect(font.origin()).toBe('package');
    expect(remotionMock.cancelRender).not.toHaveBeenCalled();
    expect(remotionMock.continueRender).toHaveBeenCalledTimes(1);
    await loadPageFont({mushaf: 'qpc-v4', page: 1, fallback: pkg}).waitUntilDone();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(
      /page 10 loaded from @tlawat\/mushaf-fonts-qpc-v4@1\.20260912\.0 because QUL's CDN failed \(FONT_HTTP: HTTP 404/,
    );
    warn.mockRestore();
  });

  it('falls back after the CDN keeps failing (5xx, network, HTML)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.useFakeTimers();
    const pkg = await makePackage('qpc-v4');
    cdnDown(503);
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10, fallback: pkg});
    const done = font.waitUntilDone();
    await vi.advanceTimersByTimeAsync(5_000);
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(4); // three CDN attempts outside rendering, then the package
    expect(font.origin()).toBe('package');
    vi.useRealTimers();

    resetFontStore();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/pkg/')) return response(200, WOFF2);
      return response(200, HTML);
    });
    const html = loadPageFont({mushaf: 'qpc-v4', page: 1, fallback: [pkg]});
    await html.waitUntilDone();
    expect(html.origin()).toBe('package');
  });

  it('picks the package that matches the line from an array, and says which one is missing', async () => {
    const plain = await makePackage('qpc-v4');
    const tajweed = await makePackage('qpc-v4-tajweed');
    cdnDown(404);
    const font = loadPageFont({theme: 'light', page: 328, fallback: [plain, tajweed]});
    await font.waitUntilDone();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/pkg/qpc-v4-tajweed/p328.woff');
    expect(() => loadPageFont({theme: 'light', page: 10, fallback: plain})).toThrow(
      expect.objectContaining({
        code: 'BAD_FONT_FALLBACK',
        message: expect.stringContaining('Install and pass @tlawat/mushaf-fonts-qpc-v4-tajweed'),
      }),
    );
  });

  it('fails with FONT_UNAVAILABLE naming every source when the package is missing too', async () => {
    const pkg = await makePackage('qpc-v4');
    fetchMock.mockResolvedValue(response(404, new ArrayBuffer(0)));
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10, fallback: pkg});
    await expect(font.waitUntilDone()).rejects.toMatchObject({
      code: 'FONT_UNAVAILABLE',
      message: expect.stringMatching(
        /QUL's CDN: HTTP 404[\s\S]*@tlawat\/mushaf-fonts-qpc-v4@1\.20260912\.0: HTTP 404[\s\S]*Is @tlawat\/mushaf-fonts-qpc-v4@1\.20260912\.0 bundled\?/,
      ),
    });
    expect(remotionMock.cancelRender).toHaveBeenCalledTimes(1);
  });

  it('refuses package bytes that differ from what the package declares', async () => {
    const pkg = await makePackage('qpc-v4');
    const other = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 9, 9, 9, 9, 9, 9, 9, 9]).buffer; // same size, other bytes
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/pkg/') ? response(200, other) : response(404, new ArrayBuffer(0)),
    );
    await expect(loadPageFont({mushaf: 'qpc-v4', page: 10, fallback: pkg}).waitUntilDone()).rejects.toMatchObject({
      code: 'FONT_FALLBACK_INVALID',
      message: expect.stringContaining('sha256'),
    });
    resetFontStore();
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/pkg/') ? response(200, TTF) : response(404, new ArrayBuffer(0)),
    );
    await expect(loadPageFont({mushaf: 'qpc-v4', page: 10, fallback: pkg}).waitUntilDone()).rejects.toMatchObject({
      code: 'FONT_FALLBACK_INVALID',
      message: expect.stringContaining('8 bytes, expected 12'),
    });
  });

  it('uses a package as the only source when it is fontSrc, and ignores a fallback next to it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pkg = await makePackage('qpc-v4');
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10, fontSrc: pkg, fallback: pkg});
    await font.waitUntilDone();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/pkg/qpc-v4/p10.woff2']);
    expect(font.origin()).toBe('package');
    expect(warn.mock.calls[0]?.[0]).toContain('fontFallback is ignored');
    expect(() => loadPageFont({theme: 'light', page: 10, fontSrc: pkg})).toThrow(
      expect.objectContaining({code: 'BAD_FONT_SRC', message: expect.stringContaining('holds the qpc-v4 fonts')}),
    );
    warn.mockRestore();
  });

  it('keeps the fallback within the render deadline when the CDN hangs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    env.isRendering = true;
    (window as unknown as {remotion_puppeteerTimeout?: number}).remotion_puppeteerTimeout = 30_000;
    vi.useFakeTimers();
    const pkg = await makePackage('qpc-v4');
    const t0 = Date.now();
    let packageAt = -1;
    fetchMock.mockImplementation((url: string, init: {signal: AbortSignal}) => {
      if (url.startsWith('/pkg/')) {
        packageAt = Date.now() - t0;
        return Promise.resolve(response(200, WOFF2));
      }
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const font = loadPageFont({mushaf: 'qpc-v4', page: 10, fallback: pkg});
    const done = font.waitUntilDone();
    await vi.advanceTimersByTimeAsync(28_000);
    await done;
    expect(font.origin()).toBe('package');
    // Two CDN attempts of 9.75 s and a backoff, then the package: well inside the 28 s handle timeout.
    expect(packageAt).toBe(20_000);
    delete (window as unknown as {remotion_puppeteerTimeout?: number}).remotion_puppeteerTimeout;
  });
});

describe('loadSharedFont', () => {
  const SURAH_NAMES = 'https://static-cdn.tarteel.ai/qul/fonts/surah_names_v4/surah_names.woff2';
  const COMMON = 'https://static-cdn.tarteel.ai/qul/fonts/common/quran-common.woff2';

  it("loads each shared font once from QUL's CDN, with its own metrics pinned", async () => {
    const names = loadSharedFont({font: 'surah-names-v4'});
    const again = loadSharedFont({mushaf: 'qpc-v4', font: 'surah-names-v4'});
    const common = loadSharedFont({font: 'quran-common'});
    expect(names.fontFamily).toBe('mushaf-surah-names-v4');
    expect(again.fontFamily).toBe(names.fontFamily);
    expect(common.fontFamily).toBe('mushaf-quran-common');
    await Promise.all([names.waitUntilDone(), again.waitUntilDone(), common.waitUntilDone()]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([SURAH_NAMES, COMMON]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({mode: 'cors', credentials: 'omit'});
    expect(faces.map((f) => f.family)).toEqual(['mushaf-surah-names-v4', 'mushaf-quran-common']);
    // The surah-name font carries the page fonts' metrics; quran-common its own (1024 units per em).
    expect(faces[0]?.descriptors).toMatchObject({ascentOverride: '157.6%', descentOverride: '100.8%'});
    expect(faces[1]?.descriptors).toMatchObject({ascentOverride: '79.98046875%', descentOverride: '20.01953125%'});
    expect(getFontStatus('surah-names-v4#cdn')).toBe('loaded');
    expect(getFontStatus('quran-common#cdn')).toBe('loaded');
    expect(names.origin()).toBe('cdn');
    expect(remotionMock.delayRender.mock.calls[0]?.[0]).toBe(
      `Loading mushaf font mushaf-surah-names-v4 from QUL's CDN (${SURAH_NAMES})`,
    );
  });

  it('names the font in every failure', async () => {
    fetchMock.mockResolvedValue(response(404, new ArrayBuffer(0)));
    await expect(loadSharedFont({font: 'quran-common'}).waitUntilDone()).rejects.toMatchObject({
      code: 'FONT_HTTP',
      message: `HTTP 404 for mushaf font quran-common at ${COMMON}.`,
      details: {font: 'quran-common', status: 404},
    });
    resetFontStore();
    fetchMock.mockResolvedValue(response(200, HTML));
    await expect(loadSharedFont({font: 'surah-names-v4'}).waitUntilDone()).rejects.toMatchObject({
      code: 'FONT_INVALID',
      message: expect.stringContaining('The response for mushaf font surah-names-v4 at'),
    });
  });

  it('takes a resolver, refuses a fonts package as the source, and ignores one as the fallback', async () => {
    const pkg = {
      kind: 'remotion-mushaf-fonts' as const,
      schema: 1 as const,
      name: '@tlawat/mushaf-fonts-qpc-v4',
      version: '1.20260912.0',
      mushaf: 'qpc-v4' as const,
      fontSet: 'qpc-v4' as const,
      snapshot: '2026-09-12',
      files: {},
    };
    const seen: unknown[] = [];
    const font = loadSharedFont({
      font: 'quran-common',
      fontSrc: (file) => {
        seen.push(file);
        return `/fonts/${file.id}/${file.fileName}`;
      },
      fallback: pkg,
    });
    expect(font.fontFamily).toMatch(/^mushaf-quran-common-[0-9a-z]+$/);
    await font.waitUntilDone();
    expect(seen).toEqual([
      {
        kind: 'shared',
        mushaf: 'qpc-v4',
        font: 'quran-common',
        format: 'woff2',
        id: 'quran-common',
        fileName: 'quran-common.woff2',
        cdnUrl: COMMON,
      },
    ]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/fonts/quran-common/quran-common.woff2']);
    expect(font.origin()).toBe('custom');
    expect(() => loadSharedFont({font: 'surah-names-v4', fontSrc: pkg})).toThrow(
      expect.objectContaining({
        code: 'BAD_FONT_SRC',
        message: expect.stringMatching(
          /fontSrc: @tlawat\/mushaf-fonts-qpc-v4 holds page fonts only, and mushaf font surah-names-v4 \(surah_names\.woff2\) is not a page font\. Use 'cdn', or a resolver/,
        ),
      }),
    );
    expect(() => loadSharedFont({font: 'surah-names-v4', fontSrc: () => pkg})).toThrow(
      expect.objectContaining({code: 'BAD_FONT_SRC', message: expect.stringContaining('fontSrc (the resolver)')}),
    );
    expect(() => loadSharedFont({font: 'nope' as never})).toThrow(
      expect.objectContaining({
        code: 'UNKNOWN_FONT',
        message: 'font must be one of \'surah-names-v4\', \'quran-common\' for "qpc-v4", got "nope".',
      }),
    );
    // A fallback that is not a package is still refused, even though no package applies.
    expect(() => loadSharedFont({font: 'quran-common', fallback: 'x' as never})).toThrow(
      expect.objectContaining({code: 'BAD_FONT_FALLBACK'}),
    );
  });

  it('lets a resolver return a fonts package for a page font, and serve the shared fonts itself', async () => {
    const bytes = WOFF2;
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const pkg = {
      kind: 'remotion-mushaf-fonts' as const,
      schema: 1 as const,
      name: '@tlawat/mushaf-fonts-qpc-v4',
      version: '1.20260912.0',
      mushaf: 'qpc-v4' as const,
      fontSet: 'qpc-v4' as const,
      snapshot: '2026-09-12',
      files: {10: {url: '/pkg/p10.woff2', bytes: bytes.byteLength, sha256: digest}},
    };
    const fontSrc = (file: import('../../src/types').MushafFontFile) =>
      file.kind === 'page' ? pkg : `/fonts/${file.font}/${file.fileName}`;
    const page = loadPageFont({page: 10, fontSrc});
    const shared = loadSharedFont({font: 'surah-names-v4', fontSrc});
    await Promise.all([page.waitUntilDone(), shared.waitUntilDone()]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/pkg/p10.woff2',
      '/fonts/surah-names-v4/surah_names.woff2',
    ]);
    expect(page.origin()).toBe('package');
    expect(shared.origin()).toBe('custom');
    // The same key as the package passed directly: one face for both spellings.
    expect(page.fontFamily).toBe(loadPageFont({page: 10, fontSrc: pkg}).fontFamily);
    expect(getFontStatus('qpc-v4/10#pkg:@tlawat/mushaf-fonts-qpc-v4@1.20260912.0')).toBe('loaded');
    // The wrong set through a resolver is caught the same way.
    expect(() => loadPageFont({theme: 'light', page: 10, fontSrc: () => pkg})).toThrow(
      expect.objectContaining({code: 'BAD_FONT_SRC', message: expect.stringContaining('holds the qpc-v4 fonts')}),
    );
  });
});

describe('getMushafFontFile', () => {
  it('describes page fonts and shared fonts', () => {
    expect(getMushafFontFile({theme: 'light', page: 328})).toEqual({
      kind: 'page',
      mushaf: 'qpc-v4',
      fontSet: 'qpc-v4-tajweed',
      page: 328,
      format: 'woff',
      id: 'p328',
      fileName: 'p328.woff',
      cdnUrl: 'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/woff/p328.woff?v=3.1',
    });
    expect(getMushafFontFile({font: 'surah-names-v4'})).toEqual({
      kind: 'shared',
      mushaf: 'qpc-v4',
      font: 'surah-names-v4',
      format: 'woff2',
      id: 'surah-names-v4',
      fileName: 'surah_names.woff2',
      cdnUrl: 'https://static-cdn.tarteel.ai/qul/fonts/surah_names_v4/surah_names.woff2',
    });
    expect(getMushafFontFile({mushaf: 'qpc-v4', font: 'quran-common'}).cdnUrl).toBe(
      'https://static-cdn.tarteel.ai/qul/fonts/common/quran-common.woff2',
    );
    expect(() => getMushafFontFile({font: 'other' as never})).toThrow(expect.objectContaining({code: 'UNKNOWN_FONT'}));
    expect(() => getMushafFontFile({font: 'quran-common', page: 1} as never)).toThrow(/not both/);
  });
});

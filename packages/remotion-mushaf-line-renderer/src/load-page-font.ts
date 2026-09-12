import {cancelRender, continueRender, delayRender, getRemotionEnvironment} from 'remotion';
import {MushafError, describeValue} from './errors';
import {getLoadBudget, isFinalStatus, sleep, type LoadBudget} from './fetch-budget';
import {fontKey, getFontEntry, notifyFontStore, setFontEntry, type FontEntry} from './font-store';
import {assertPage, getMushafDefinition, resolveMushafId, type MushafDefinition} from './mushafs';
import type {LoadPageFontOptions, LoadedPageFont} from './types';

/**
 * Loads the per-page glyph font of a mushaf page, google-fonts style: idempotent, returns
 * `{fontFamily, waitUntilDone}`, and wraps `delayRender()` / `cancelRender()` internally.
 *
 * Source rules (deterministic regardless of mount order, so Lambda chunks behave identically):
 * - no `url`: adopt whatever source is registered for this page, else the registry CDN URL;
 * - an explicit `url` equal to the registered source: adopt;
 * - an explicit `url` after an implicit (CDN) registration: replace it (pending fetch aborted or
 *   loaded face removed; subscribers hide the line and re-arm their handles);
 * - two different explicit urls: `FONT_URL_CONFLICT`.
 *
 * The font bytes are fetched with `fetch()` (precise HTTP errors, magic-byte check, real retries)
 * and registered through `new FontFace(family, bytes, descriptors)` with the mushaf's metrics
 * pinned, so the line box is identical on every platform.
 */
export const loadPageFont = ({mushaf, tajweed, mandala, page, url}: LoadPageFontOptions): LoadedPageFont => {
  const id = resolveMushafId(mushaf, tajweed, mandala);
  const def = getMushafDefinition(id);
  assertPage(def, page);
  if (url !== undefined && (typeof url !== 'string' || url === '')) {
    throw new MushafError('BAD_FONT_URL', `loadPageFont(): url must be a non-empty string when given, got ${describeValue(url)}.`, {mushaf: id, page});
  }
  const fontFamily = def.fontFamily(page);
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    // Server / Node: nothing to load (same behaviour as @remotion/google-fonts).
    return {fontFamily, waitUntilDone: () => Promise.resolve()};
  }
  const key = fontKey(id, page);
  const existing = getFontEntry(key);
  if (existing) {
    const sameUrl = url === undefined || url === existing.url;
    if (sameUrl && existing.status !== 'error') {
      return {fontFamily, waitUntilDone: () => existing.done};
    }
    if (!sameUrl && existing.explicit && existing.status !== 'error') {
      throw new MushafError(
        'FONT_URL_CONFLICT',
        `Font "${fontFamily}" (${id} page ${page}) is already loaded from ${existing.url}; refusing to load it again from ${url}. Use one source per page: either loadPageFont({url}) once or MushafLineData.fontUrl, not both with different values.`,
        {mushaf: id, page, registered: existing.url, requested: url},
      );
    }
    // Explicit url replacing the implicit CDN source, or a retry after a failure.
    existing.abort?.abort();
    if (existing.face) {
      try {
        document.fonts.delete(existing.face);
      } catch {
        // ignore: the face may already be gone
      }
    }
    if (url !== undefined) {
      existing.url = url;
      existing.explicit = true;
    }
    return start(existing, def, page);
  }
  const entry: FontEntry = {
    key,
    fontFamily,
    url: url ?? def.fontUrl(page),
    explicit: url !== undefined,
    status: 'idle',
    generation: 0,
    face: null,
    error: null,
    done: Promise.resolve(),
    settle: {resolve: () => undefined, reject: () => undefined},
    handle: null,
    abort: null,
  };
  setFontEntry(entry);
  return start(entry, def, page);
};

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: MushafError) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

const start = (entry: FontEntry, def: MushafDefinition, page: number): LoadedPageFont => {
  const generation = ++entry.generation;
  if (entry.status !== 'loading') {
    const d = deferred();
    entry.done = d.promise;
    entry.settle = {resolve: d.resolve, reject: d.reject};
    // Callers that fire-and-forget (prefetch) must not produce an unhandled rejection; waitUntilDone()
    // still returns the rejecting promise for callers that await it.
    entry.done.catch(() => undefined);
  }
  entry.status = 'loading';
  entry.error = null;
  entry.face = null;
  if (entry.handle === null) {
    // No timeoutInMilliseconds: the renderer's outer wait is `--timeout + 3 s`, so a longer per-handle
    // budget would be unreachable; `retries: 1` grants one fresh-tab retry if a fetch ever hangs.
    entry.handle = delayRender(`Loading mushaf font ${entry.fontFamily} from ${entry.url}`, {retries: 1});
  }
  entry.abort = new AbortController();
  notifyFontStore();

  run(entry, generation, def, page)
    .then(
      (face) => {
        if (entry.generation !== generation) return;
        entry.face = face;
        entry.status = 'loaded';
        const handle = entry.handle;
        entry.handle = null;
        entry.abort = null;
        notifyFontStore();
        entry.settle.resolve();
        if (handle !== null) continueRender(handle);
      },
      (err: unknown) => {
        if (entry.generation !== generation) return;
        const error = toMushafError(err, entry, page);
        entry.status = 'error';
        entry.error = error;
        entry.abort = null;
        notifyFontStore();
        entry.settle.reject(error);
        // The handle is deliberately left blocking: the renderer checks renderReady before
        // cancelledError, so keeping the render blocked lets the cancellation win with our message.
        cancelRender(error);
      },
    )
    .catch(() => undefined); // cancelRender() throws by design; the flag is set, nothing else to do here

  return {fontFamily: entry.fontFamily, waitUntilDone: () => entry.done};
};

const toMushafError = (err: unknown, entry: FontEntry, page: number): MushafError => {
  if (err instanceof MushafError) return err;
  return new MushafError('FONT_NETWORK', `Could not load mushaf font ${entry.fontFamily} (page ${page}) from ${entry.url}: ${err instanceof Error ? err.message : String(err)}`, {url: entry.url, page, cause: err});
};

export type FontLoadBudget = LoadBudget;

/** The shared budget (see `fetch-budget.ts`), under the name the font loader has always exported. */
export const getFontLoadBudget = getLoadBudget;

const run = async (entry: FontEntry, generation: number, def: MushafDefinition, page: number): Promise<FontFace> => {
  const env = getRemotionEnvironment();
  const puppeteerTimeout = typeof window !== 'undefined' ? (window as unknown as {remotion_puppeteerTimeout?: number}).remotion_puppeteerTimeout : undefined;
  const budget = getFontLoadBudget(env.isRendering, puppeteerTimeout);
  const signal = entry.abort?.signal;
  if (!signal) throw new MushafError('FONT_SUPERSEDED', 'internal: no abort controller');
  const bytes = await fetchFontBytes(entry.url, {...budget, signal, mushaf: def.id, page, fontFamily: entry.fontFamily});
  assertFontMagic(bytes, entry.url, def.id, page);
  const m = def.metrics;
  const face = new FontFace(entry.fontFamily, bytes, {
    display: 'block',
    style: 'normal',
    weight: '400',
    ascentOverride: `${(m.ascent / m.unitsPerEm) * 100}%`,
    descentOverride: `${(-m.descent / m.unitsPerEm) * 100}%`,
    lineGapOverride: '0%',
  });
  try {
    await face.load();
  } catch (e) {
    throw new MushafError('FONT_PARSE', `Chrome rejected the font bytes for ${def.id} page ${page} (${entry.url}): ${e instanceof Error ? e.message : String(e)}`, {url: entry.url, page});
  }
  if (entry.generation !== generation) throw new MushafError('FONT_SUPERSEDED', 'internal: superseded');
  document.fonts.add(face);
  if (face.status !== 'loaded' || !document.fonts.has(face)) {
    // document.fonts.check() is vacuously true for an unregistered family, so it is not used here.
    throw new MushafError('FONT_NOT_AVAILABLE', `Font ${entry.fontFamily} was not registered in document.fonts (status ${face.status}).`, {url: entry.url, page});
  }
  return face;
};

const MAGIC: ReadonlyArray<readonly [string, string]> = [
  ['wOF2', 'woff2'],
  ['wOFF', 'woff'],
  ['OTTO', 'otf'],
  ['true', 'ttf'],
];

export const assertFontMagic = (bytes: ArrayBuffer, url: string, mushaf: string, page: number): void => {
  const b = new Uint8Array(bytes);
  const head = b.length >= 4 ? String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) : '';
  const isTrueType = b.length >= 4 && b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0;
  if (isTrueType || MAGIC.some(([tag]) => tag === head)) return;
  const preview = new TextDecoder('utf-8', {fatal: false}).decode(b.slice(0, 16)).replace(/[^\x20-\x7e]/g, '.');
  throw new MushafError('FONT_INVALID', `The response for mushaf font ${mushaf} page ${page} at ${url} is not a font file (${b.length} bytes, starts with "${preview}"). Check the url override or the CDN.`, {url, page, bytes: b.length});
};

type FetchOptions = FontLoadBudget & {
  readonly signal: AbortSignal;
  readonly mushaf: string;
  readonly page: number;
  readonly fontFamily: string;
};

export const fetchFontBytes = async (url: string, o: FetchOptions): Promise<ArrayBuffer> => {
  let last: MushafError | null = null;
  for (let attempt = 1; attempt <= o.attempts; attempt++) {
    if (attempt > 1) await sleep(o.backoffMs);
    if (o.signal.aborted) throw new MushafError('FONT_SUPERSEDED', 'internal: superseded');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.perAttemptMs);
    const onOuterAbort = () => ctrl.abort();
    o.signal.addEventListener('abort', onOuterAbort, {once: true});
    try {
      const res = await fetch(url, {mode: 'cors', credentials: 'omit', signal: ctrl.signal});
      if (!res.ok) {
        last = new MushafError(
          'FONT_HTTP',
          `HTTP ${res.status} for mushaf font ${o.mushaf} page ${o.page} at ${url}${isFinalStatus(res.status) ? '. Pages are 1..604; check the url override or the CDN path.' : ` (attempt ${attempt}/${o.attempts}).`}`,
          {url, page: o.page, status: res.status, final: isFinalStatus(res.status)},
        );
        if (isFinalStatus(res.status)) throw last;
        continue;
      }
      return await res.arrayBuffer();
    } catch (e) {
      if (o.signal.aborted) throw new MushafError('FONT_SUPERSEDED', 'internal: superseded');
      if (e instanceof MushafError) {
        if (e.code === 'FONT_HTTP' && e.details?.final) throw e;
        last = e;
      } else if (ctrl.signal.aborted) {
        last = new MushafError('FONT_TIMEOUT', `Fetching mushaf font ${o.mushaf} page ${o.page} from ${url} timed out after ${o.perAttemptMs} ms (attempt ${attempt}/${o.attempts}). Cold CDN pages can be slow: mirror the fonts into public/ and pass them via staticFile(), or raise --timeout.`, {url, page: o.page, attempt});
      } else {
        last = new MushafError(
          'FONT_NETWORK',
          `Could not fetch mushaf font ${o.mushaf} page ${o.page} from ${url} (${e instanceof Error ? e.message : String(e)}; attempt ${attempt}/${o.attempts}). Network error or missing Access-Control-Allow-Origin: self-hosted fonts must send CORS headers, or live in public/ and be referenced with staticFile().`,
          {url, page: o.page, attempt, cause: e},
        );
      }
    } finally {
      clearTimeout(timer);
      o.signal.removeEventListener('abort', onOuterAbort);
    }
  }
  throw last ?? new MushafError('FONT_NETWORK', `Could not fetch ${url}.`, {url, page: o.page});
};

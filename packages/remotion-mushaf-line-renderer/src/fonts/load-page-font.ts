import {cancelRender, continueRender, delayRender, getRemotionEnvironment} from 'remotion';
import {describeValue, MushafError} from '../errors';
import {
  FALLBACK_RESERVE_MS,
  getFontDeadline,
  getFontStepBudget,
  isFinalStatus,
  type LoadBudget,
  readPuppeteerTimeout,
  sleep,
} from '../fetch-budget';
import {assertPage, type FontSetDefinition, type MushafDefinition, resolveSelection} from '../mushaf/registry';
import type {LoadedPageFont, LoadPageFontOptions} from '../types';
import {assertFontMagic} from './font-magic';
import {type FontSourcePlan, type FontStep, planFontSource} from './font-source';
import {type FontEntry, getFontEntry, notifyFontStore, setFontEntry} from './font-store';

/** A load that was restarted or dropped; never escapes (the generation check discards it). */
class FontSuperseded extends Error {
  constructor() {
    super('superseded');
    this.name = 'FontSuperseded';
  }
}

/**
 * Loads the per-page glyph font of a mushaf page, google-fonts style: idempotent, returns
 * `{fontFamily, waitUntilDone, origin}`, and wraps `delayRender()` / `cancelRender()` internally.
 *
 * Where the bytes come from is `fontSrc` (default: QUL's CDN), then `fallback` (a fonts package)
 * when that fails. Each source has its own store entry and its own family, so two lines with
 * different sources never affect each other, and the result never depends on which line loaded
 * first. A failed load is restarted by the next call.
 *
 * The bytes are fetched with `fetch()` (precise HTTP errors, magic-byte check, real retries) and
 * registered through `new FontFace(family, bytes, descriptors)` with the mushaf's metrics pinned,
 * so the line box is identical on every platform.
 */
export const loadPageFont = (options: LoadPageFontOptions): LoadedPageFont => {
  if ((options as {readonly url?: unknown}).url !== undefined) {
    throw new MushafError(
      'BAD_FONT_SRC',
      'loadPageFont(): `url` was removed in 0.4. Pass `fontSrc: () => url` for your own URL, or `fallback` (a fonts package), with the same values as the <MushafLine> you are warming up.',
      {url: (options as {readonly url?: unknown}).url},
    );
  }
  const {mushaf, theme, page, fontSrc, fallback} = options;
  const {def, fontSet} = resolveSelection({mushaf, theme});
  assertPage(def, page);
  const plan = planFontSource(def, fontSet, page, fontSrc, fallback);
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    // Server / Node: nothing to load (same behaviour as @remotion/google-fonts).
    return {fontFamily: plan.fontFamily, waitUntilDone: () => Promise.resolve(), origin: () => null};
  }
  const existing = getFontEntry(plan.key);
  if (existing && existing.status !== 'error') return handleOf(existing);
  if (existing) {
    // A retry after a failure: same key, so the same steps, from the start.
    existing.plan = plan;
    return start(existing, def, fontSet, page);
  }
  const entry: FontEntry = {
    key: plan.key,
    fontFamily: plan.fontFamily,
    plan,
    origin: null,
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
  return start(entry, def, fontSet, page);
};

const handleOf = (entry: FontEntry): LoadedPageFont => ({
  fontFamily: entry.fontFamily,
  waitUntilDone: () => entry.done,
  origin: () => entry.origin,
});

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: MushafError) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

const start = (entry: FontEntry, def: MushafDefinition, fontSet: FontSetDefinition, page: number): LoadedPageFont => {
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
  entry.origin = null;
  if (entry.handle === null) {
    // No timeoutInMilliseconds: the renderer's outer wait is `--timeout + 3 s`, and the load's own
    // deadline (getFontDeadline) settles it before the handle would time out.
    entry.handle = delayRender(`Loading mushaf font ${entry.fontFamily} from ${entry.plan.describe}`, {retries: 1});
  }
  entry.abort = new AbortController();
  notifyFontStore();

  run(entry, generation, def, fontSet, page)
    .then(
      ({face, step}) => {
        if (entry.generation !== generation) return;
        entry.face = face;
        entry.origin = step.origin;
        entry.status = 'loaded';
        const handle = entry.handle;
        entry.handle = null;
        entry.abort = null;
        notifyFontStore();
        entry.settle.resolve();
        if (handle !== null) continueRender(handle);
      },
      (err: unknown) => {
        if (entry.generation !== generation || err instanceof FontSuperseded) return;
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

  return handleOf(entry);
};

const toMushafError = (err: unknown, entry: FontEntry, page: number): MushafError => {
  if (err instanceof MushafError) return err;
  return new MushafError(
    'FONT_NETWORK',
    `Could not load mushaf font ${entry.fontFamily} (page ${page}) from ${entry.plan.describe}: ${err instanceof Error ? err.message : String(err)}`,
    {page, cause: err},
  );
};

/** What each step tried, for FONT_UNAVAILABLE. */
type FontAttempt = {readonly source: string; readonly url: string; readonly code: string; readonly message: string};

const warnedFallbacks = new Set<string>();

const warnFallback = (plan: FontSourcePlan, used: FontStep, tried: readonly FontAttempt[], page: number) => {
  const key = `${plan.key.slice(0, plan.key.indexOf('/'))}|${used.source}`;
  if (warnedFallbacks.has(key)) return;
  warnedFallbacks.add(key);
  console.warn(
    `remotion-mushaf-line-renderer: page ${page} loaded from ${used.source} because ${tried
      .map((t) => `${t.source} failed (${t.code}: ${t.message})`)
      .join('; ')}. Later pages that fall back are not reported again.`,
  );
};

const run = async (
  entry: FontEntry,
  generation: number,
  def: MushafDefinition,
  fontSet: FontSetDefinition,
  page: number,
): Promise<{face: FontFace; step: FontStep}> => {
  const rendering = getRemotionEnvironment().isRendering;
  const puppeteerTimeout = readPuppeteerTimeout();
  const deadline = getFontDeadline(rendering, puppeteerTimeout, Date.now());
  const signal = entry.abort?.signal;
  if (!signal) throw new FontSuperseded();
  const {steps} = entry.plan;
  const tried: FontAttempt[] = [];
  let last: MushafError | null = null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const later = steps.slice(i + 1);
    const packageLater = later.some((s) => s.origin === 'package');
    const reserveMs = packageLater ? FALLBACK_RESERVE_MS : 0;
    const budget = getFontStepBudget(
      step.origin === 'package' ? 'package' : 'primary',
      rendering,
      puppeteerTimeout,
      reserveMs,
    );
    // An earlier URL of a resolver list gets one attempt; the list's last URL gets the full budget.
    const moreOfTheSameKind = later.some((s) => s.origin === step.origin && s.origin !== 'package');
    const stepBudget = moreOfTheSameKind ? {...budget, attempts: 1} : budget;
    try {
      const face = await loadStep(entry, generation, def, fontSet, page, step, {
        ...stepBudget,
        signal,
        deadline: deadline === null ? null : deadline - reserveMs,
      });
      if (i > 0) warnFallback(entry.plan, step, tried, page);
      return {face, step};
    } catch (e) {
      if (e instanceof FontSuperseded) throw e;
      const error = toMushafError(e, entry, page);
      // The browser refusing a parsed font, or a fonts package serving other bytes than it
      // declares, is never masked by another source.
      if (error.code === 'FONT_NOT_AVAILABLE' || error.code === 'FONT_FALLBACK_INVALID') throw error;
      tried.push({source: step.source, url: step.url, code: error.code, message: error.message});
      last = error;
    }
  }
  if (steps.length === 1 && last) throw last;
  const pkg = steps.find((s) => s.origin === 'package');
  throw new MushafError(
    'FONT_UNAVAILABLE',
    `Could not load mushaf font ${fontSet.id} page ${page} from any source:\n${tried
      .map((t) => `- ${t.source}: ${t.message}`)
      .join('\n')}\n${
      pkg
        ? `Is ${pkg.source} bundled? Import it where the composition is defined so the bundler emits its files (README → When the CDN fails).`
        : 'Check the URLs your fontSrc returns, or pass a fonts package as fontFallback (README → When the CDN fails).'
    }`,
    {fontSet: fontSet.id, page, tried},
  );
};

type StepOptions = LoadBudget & {readonly signal: AbortSignal; readonly deadline: number | null};

const loadStep = async (
  entry: FontEntry,
  generation: number,
  def: MushafDefinition,
  fontSet: FontSetDefinition,
  page: number,
  step: FontStep,
  o: StepOptions,
): Promise<FontFace> => {
  const bytes = await fetchFontBytes(step, {...o, fontSet: fontSet.id, page});
  assertFontMagic(bytes, step.url, fontSet.id, page);
  if (step.expect) await assertPackageBytes(bytes, step, fontSet.id, page);
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
    throw new MushafError(
      'FONT_PARSE',
      `The browser rejected the font bytes for ${fontSet.id} page ${page} (${step.url}): ${e instanceof Error ? e.message : String(e)}`,
      {url: step.url, page},
    );
  }
  if (entry.generation !== generation) throw new FontSuperseded();
  document.fonts.add(face);
  if (face.status !== 'loaded' || !document.fonts.has(face)) {
    // document.fonts.check() is vacuously true for an unregistered family, so it is not used here.
    throw new MushafError(
      'FONT_NOT_AVAILABLE',
      `Font ${entry.fontFamily} was not registered in document.fonts (status ${face.status}).`,
      {url: step.url, page},
    );
  }
  return face;
};

const hex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * A fonts package declares each file's size and SHA-256: the bytes the bundle serves must be those.
 * The hash needs `crypto.subtle` (secure contexts: https, localhost); the size is always checked.
 */
const assertPackageBytes = async (bytes: ArrayBuffer, step: FontStep, fontSet: string, page: number) => {
  const expect = step.expect!;
  const mismatch = (what: string) =>
    new MushafError(
      'FONT_FALLBACK_INVALID',
      `${step.source} serves other bytes for ${fontSet} page ${page} than it declares (${what}) at ${step.url}. Reinstall the package, and make sure nothing rewrites font files in your bundle.`,
      {url: step.url, page, package: step.source},
    );
  if (bytes.byteLength !== expect.bytes) throw mismatch(`${bytes.byteLength} bytes, expected ${expect.bytes}`);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return;
  const actual = hex(await subtle.digest('SHA-256', bytes));
  if (actual !== expect.sha256)
    throw mismatch(`sha256 ${actual.slice(0, 12)}…, expected ${expect.sha256.slice(0, 12)}…`);
};

type FetchOptions = StepOptions & {readonly fontSet: string; readonly page: number};

/** Leaves at least this much of the deadline for an attempt; below it, the step gives up as a timeout. */
const MIN_ATTEMPT_MS = 1_000;

export const fetchFontBytes = async (step: FontStep, o: FetchOptions): Promise<ArrayBuffer> => {
  const {url} = step;
  let last: MushafError | null = null;
  for (let attempt = 1; attempt <= o.attempts; attempt++) {
    if (attempt > 1) await sleep(o.backoffMs);
    if (o.signal.aborted) throw new FontSuperseded();
    const left = o.deadline === null ? Number.POSITIVE_INFINITY : o.deadline - Date.now();
    if (left < MIN_ATTEMPT_MS) {
      last ??= new MushafError(
        'FONT_TIMEOUT',
        `No time left to fetch mushaf font ${o.fontSet} page ${o.page} from ${url} before the render times out. Raise --timeout.`,
        {url, page: o.page},
      );
      break;
    }
    const perAttemptMs = Math.min(o.perAttemptMs, left);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), perAttemptMs);
    const onOuterAbort = () => ctrl.abort();
    o.signal.addEventListener('abort', onOuterAbort, {once: true});
    try {
      // QUL's CDN answers any origin (CORS *); a fonts package and your own URLs are usually the
      // page's own origin, where cookies may matter.
      const res = await fetch(
        url,
        step.origin === 'cdn'
          ? {mode: 'cors', credentials: 'omit', signal: ctrl.signal}
          : {credentials: 'same-origin', signal: ctrl.signal},
      );
      if (!res.ok) {
        const final = isFinalStatus(res.status);
        last = new MushafError(
          'FONT_HTTP',
          `HTTP ${res.status} for mushaf font ${o.fontSet} page ${o.page} at ${url}${final ? '.' : ` (attempt ${attempt}/${o.attempts}).`}`,
          {url, page: o.page, status: res.status, final},
        );
        if (final) throw last;
        continue;
      }
      return await res.arrayBuffer();
    } catch (e) {
      if (o.signal.aborted) throw new FontSuperseded();
      if (e instanceof MushafError) {
        if (e.code === 'FONT_HTTP' && e.details?.final) throw e;
        last = e;
      } else if (ctrl.signal.aborted) {
        last = new MushafError(
          'FONT_TIMEOUT',
          `Fetching mushaf font ${o.fontSet} page ${o.page} from ${url} timed out after ${perAttemptMs} ms (attempt ${attempt}/${o.attempts}). Cold CDN pages can be slow: raise --timeout, or pass a fonts package as fontFallback.`,
          {url, page: o.page, attempt},
        );
      } else {
        last = new MushafError(
          'FONT_NETWORK',
          `Could not fetch mushaf font ${o.fontSet} page ${o.page} from ${url} (${e instanceof Error ? e.message : String(e)}; attempt ${attempt}/${o.attempts}). A network error, or a server without Access-Control-Allow-Origin.`,
          {url, page: o.page, attempt, cause: e},
        );
      }
    } finally {
      clearTimeout(timer);
      o.signal.removeEventListener('abort', onOuterAbort);
    }
  }
  throw last ?? new MushafError('FONT_NETWORK', `Could not fetch ${describeValue(url)}.`, {url, page: o.page});
};

/** Test hook. */
export const resetFallbackWarnings = (): void => warnedFallbacks.clear();

// Shared helpers of the `qul` CLI: paths, logging, page lists, polite HTTP and a worker pool.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PACKAGE_DIR = path.join(ROOT, 'packages/remotion-mushaf-line-renderer');
export const ETAGS_FILE = path.join(ROOT, 'scripts/cdn-etags.json');
export const DEFAULT_CACHE_DIR = path.join(ROOT, '.cache/qul');
export const EXAMPLE_FONTS_DIR = path.join(ROOT, 'example/public/fonts');
export const FIXTURE_FONTS_DIR = path.join(PACKAGE_DIR, 'test/fixtures/fonts');

/** Pages whose fonts the package's own test fixtures carry (the suites use page 10; 1, 187 and 604 are spot checks). */
export const FIXTURE_PAGES = [1, 10, 187, 604];

export const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 remotion-mushaf-line-renderer/qul';

export const log = (...a) => console.log('[qul]', ...a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `"1,10,604"`, `"1-20,187"` or `"all"` → sorted page numbers within 1..max. */
export const parsePageList = (spec, max) => {
  if (!spec || spec === 'all') return Array.from({length: max}, (_, i) => i + 1);
  const out = new Set();
  for (const part of String(spec).split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`bad page list "${spec}" (expected "1,10,604", "1-20" or "all")`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let p = a; p <= b; p++) if (p >= 1 && p <= max) out.add(p);
  }
  return [...out].sort((x, y) => x - y);
};

export const fetchWithRetry = async (url, {attempts = 4, timeoutMs = 30_000, accept = 'text/html', origin} = {}) => {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {'user-agent': USER_AGENT, accept, ...(origin ? {origin} : {})},
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (res.status === 403 || res.status === 401) {
        throw new Error(
          `HTTP ${res.status} for ${url} — QUL refused the request (bot protection or login). Try again later, or use --layout-sqlite/--words with an export.`,
        );
      }
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`HTTP ${res.status} for ${url}`);
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      } else {
        return res;
      }
    } catch (e) {
      if (String(e.message).includes('refused the request')) throw e;
      last = e;
    } finally {
      clearTimeout(t);
    }
    await sleep(1000 * i * i);
  }
  throw last;
};

export const runPool = async (items, concurrency, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({length: Math.max(1, concurrency)}, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
};

/** Reads scripts/cdn-etags.json (the CDN survey: font ETags, the data exports, known gaps); `null` when missing. */
export const readSurvey = () => (fs.existsSync(ETAGS_FILE) ? JSON.parse(fs.readFileSync(ETAGS_FILE, 'utf8')) : null);

/**
 * Merges `patch` into scripts/cdn-etags.json, keeping the parts this run did not touch. The file is
 * left alone when only its generation time would change, so a re-run that changes nothing commits nothing.
 */
export const writeSurvey = (patch, reason) => {
  const existing = readSurvey();
  const next = {...(existing ?? {generatedAt: null, base: null, entries: {}, problems: []}), ...patch};
  const {generatedAt: _a, ...before} = existing ?? {};
  const {generatedAt: _b, ...after} = next;
  const relative = path.relative(ROOT, ETAGS_FILE);
  if (existing && JSON.stringify(before) === JSON.stringify(after)) {
    log(`${relative} is unchanged (${reason}); kept the committed generation time`);
    return;
  }
  fs.writeFileSync(ETAGS_FILE, `${JSON.stringify({...next, generatedAt: new Date().toISOString()}, null, 1)}\n`);
  log(`wrote ${relative} (${reason})`);
};

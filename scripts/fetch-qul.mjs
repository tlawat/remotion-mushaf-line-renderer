#!/usr/bin/env node
// The QUL data tools for the KFGQPC V4 mushaf: mirrors and validates QUL's two raw exports (the
// ones the package fetches at runtime), compares them with QUL's preview pages, downloads font
// fixtures and records CDN ETags. Zero dependencies; Node >= 22.13 (node:sqlite) for the export
// routes, Node >= 18 for fonts and ETags alone.
//
//   node scripts/fetch-qul.mjs --data [--etags]              # download the pinned exports into
//                                                              example/public/data/qpc-v4/, record
//                                                              them in scripts/cdn-etags.json, validate
//   node scripts/fetch-qul.mjs                               # validate the mirror already there
//   node scripts/fetch-qul.mjs --layout-sqlite pages.db --words qpc-v4.json   # validate other export files
//   node scripts/fetch-qul.mjs --from-pages                  # compile QUL's preview pages and compare
//                                                              them with the mirror, page by page
//   node scripts/fetch-qul.mjs --fonts 1,10,604 [--etags] [--allow-zero-advance]
//
// Options:
//   --data                download QUL's words and layout exports (the URLs pinned in
//                         scripts/lib/datasets.mjs and src/mushafs.ts) into example/public/data/<dataset>/
//   --cache <dir>         HTML cache directory (default .cache/qul)
//   --concurrency <n>     parallel page requests (default 3, be polite to QUL)
//   --pages a-b,c         subset of pages to fetch/parse (validation then runs with relaxed counts)
//   --fonts <list|all>    download page fonts for these pages (both sets, woff2 + ttf) into
//                         example/public/fonts/<set>/ (and, for the fixture pages 1, 10, 187 and
//                         604, packages/…/test/fixtures/fonts/<set>/); where the CDN has no woff2
//                         (page 328 of the tajweed set) the woff it serves instead is mirrored
//   --etags               HEAD every CDN woff2 URL and write scripts/cdn-etags.json
//   --allow-zero-advance  do not fail when a standalone word has zero advance in the fixture fonts
//   --no-validate         skip validation (for debugging only)
//
// The package itself never reads any of this: at render time it fetches the same two exports from
// Tarteel's CDN (or the `data` source it is given) and builds the layout in memory. The mirror is
// for the suites, the Studio and offline renders (`data` + staticFile()), and for checking the CDN.

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {QPC_V4} from './lib/datasets.mjs';
import {parsePageHtml, QulParseError} from './lib/qul-html.mjs';
import {compileLayout, validateLayout, expandPage, LayoutValidationError} from './lib/compile.mjs';
import {readWords, readLayoutSqlite} from './lib/qul-export.mjs';
import {parseSfnt, compareFonts, detectFontMagic} from './lib/sfnt.mjs';
import {unzip, unzipExport} from './lib/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 remotion-mushaf-line-renderer/fetch-qul';

const {values: args} = parseArgs({
  options: {
    data: {type: 'boolean', default: false},
    'from-pages': {type: 'boolean', default: false},
    'layout-sqlite': {type: 'string'},
    words: {type: 'string'},
    cache: {type: 'string', default: path.join(ROOT, '.cache/qul')},
    concurrency: {type: 'string', default: '3'},
    pages: {type: 'string'},
    fonts: {type: 'string'},
    etags: {type: 'boolean', default: false},
    'allow-zero-advance': {type: 'boolean', default: false},
    'no-validate': {type: 'boolean', default: false},
    help: {type: 'boolean', default: false},
  },
  strict: true,
});

if (args.help) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}

const def = QPC_V4;
const log = (...a) => console.log('[fetch-qul]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (file) => path.relative(ROOT, file);

/** Where the exports are mirrored: served by the example at /data/<dataset>/…, read by the suites. */
const MIRROR_DIR = path.join(ROOT, 'example/public/data', def.dataset);
const MIRROR_FILES = {words: 'words.json.zip', layout: 'layout.db.zip'};
const EXPORT_EXTENSIONS = {words: ['.json'], layout: ['.db', '.sqlite', '.sqlite3']};
const mirrorFile = (part) => path.join(MIRROR_DIR, MIRROR_FILES[part]);
const haveMirror = () => Object.keys(MIRROR_FILES).every((part) => fs.existsSync(mirrorFile(part)));

const parsePageList = (spec, max) => {
  if (!spec || spec === 'all') return Array.from({length: max}, (_, i) => i + 1);
  const out = new Set();
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`bad page list "${spec}"`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let p = a; p <= b; p++) if (p >= 1 && p <= max) out.add(p);
  }
  return [...out].sort((x, y) => x - y);
};

const fetchWithRetry = async (url, {attempts = 4, timeoutMs = 30_000, accept = 'text/html', origin} = {}) => {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {headers: {'user-agent': USER_AGENT, accept, ...(origin ? {origin} : {})}, signal: ctrl.signal, redirect: 'follow'});
      if (res.status === 403 || res.status === 401) {
        throw new Error(`HTTP ${res.status} for ${url} — QUL refused the request (bot protection or login). Try again later, or use --layout-sqlite/--words with an export.`);
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

const runPool = async (items, concurrency, fn) => {
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

const fetchPages = async (pages) => {
  const cacheDir = path.join(args.cache, String(def.layoutId));
  fs.mkdirSync(cacheDir, {recursive: true});
  const failures = [];
  let fetched = 0;
  let cached = 0;
  const parsed = await runPool(pages, Number(args.concurrency), async (page) => {
    const file = path.join(cacheDir, `p${page}.html`);
    let html;
    if (fs.existsSync(file)) {
      html = fs.readFileSync(file, 'utf8');
      cached++;
    } else {
      try {
        const res = await fetchWithRetry(def.previewUrl(page));
        html = await res.text();
        fs.writeFileSync(file, html);
        fetched++;
        if ((fetched + cached) % 25 === 0) log(`${fetched + cached}/${pages.length} pages`);
      } catch (e) {
        failures.push(`page ${page}: ${e.message}`);
        return null;
      }
    }
    try {
      return parsePageHtml(html, page);
    } catch (e) {
      if (e instanceof QulParseError) {
        // Do not cache a response that is not a QUL page (login wall, error page); keep real pages
        // that merely failed a structural check so re-runs and diagnostics are cheap.
        if (/does not look like a QUL page|empty response|no lines found/.test(e.message)) fs.rmSync(file, {force: true});
        failures.push(e.message);
        return null;
      }
      throw e;
    }
  });
  log(`pages: ${fetched} fetched, ${cached} from cache`);
  if (failures.length) {
    throw new Error(`Could not obtain ${failures.length} page(s):\n - ${failures.slice(0, 20).join('\n - ')}${failures.length > 20 ? `\n - … ${failures.length - 20} more` : ''}`);
  }
  return parsed;
};

/** Pages whose fonts the package's own test fixtures carry (the suites use page 10; 1, 187 and 604 are spot checks). */
const FIXTURE_PAGES = [1, 10, 187, 604];

const fontDirs = (set, page) => [
  path.join(ROOT, 'example/public/fonts', set),
  ...(FIXTURE_PAGES.includes(page) ? [path.join(ROOT, 'packages/remotion-mushaf-line-renderer/test/fixtures/fonts', set)] : []),
];

const downloadFonts = async (pages, layout) => {
  const etags = {};
  let failed = false;
  let done = 0;
  const perPage = await runPool(pages, Math.max(2, Number(args.concurrency)), async (page) => {
    const report = [];
    const parsedBySet = {};
    for (const set of Object.keys(def.fontSets)) {
      for (const wanted of ['woff2', 'ttf']) {
        // The CDN has gaps (page 328 of the tajweed set has no woff2): mirror the format it serves
        // instead, the same one the package's registry routes that page to.
        const formats = wanted === 'woff2' ? ['woff2', 'woff'] : ['ttf'];
        let saved = null;
        let lastError = null;
        for (const format of formats) {
          const url = def.fontUrl(set, page, format);
          let res;
          try {
            res = await fetchWithRetry(url, {accept: '*/*', origin: 'https://example.com'}); // like a browser, so the CORS header is recorded
          } catch (e) {
            lastError = e;
            if (/^HTTP 404 /.test(String(e.message))) continue;
            break;
          }
          const bytes = new Uint8Array(await res.arrayBuffer());
          const magic = detectFontMagic(bytes);
          if (magic !== format && !(format === 'ttf' && magic === 'otf')) {
            lastError = new Error(`not a ${format} file (magic ${magic ?? 'unknown'}, ${bytes.length} bytes)`);
            break;
          }
          etags[url] = {etag: res.headers.get('etag'), contentType: res.headers.get('content-type'), contentLength: bytes.length, cors: res.headers.get('access-control-allow-origin')};
          for (const dir of fontDirs(set, page)) {
            fs.mkdirSync(dir, {recursive: true});
            fs.writeFileSync(path.join(dir, `p${page}.${format}`), bytes);
          }
          if (format === 'ttf') parsedBySet[set] = parseSfnt(bytes);
          saved = format;
          break;
        }
        if (saved === null) {
          report.push(`${set} p${page}.${wanted}: ${lastError?.message ?? 'not downloaded'}`);
          failed = true;
        } else if (saved !== wanted) {
          report.push(`${set} p${page}: the CDN has no ${wanted} for this page; mirrored its ${saved} instead`);
        }
      }
    }
    const plain = parsedBySet['qpc-v4'];
    const tajweed = parsedBySet['qpc-v4-tajweed'];
    if (plain && tajweed) {
      const problems = compareFonts(plain, tajweed);
      if (problems.length) {
        // The two sets are hinted/spaced independently (page 187 differs in two advances); each mushaf
        // id uses one set consistently, so this is informational, not a failure.
        report.push(`p${page}: plain and tajweed fonts differ in ${problems.length} place(s): ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ' …' : ''}`);
      } else {
        report.push(`p${page}: plain and tajweed fonts agree (${tajweed.advances.size} code points, upem ${tajweed.unitsPerEm}, ${tajweed.family} / ${plain.family})`);
      }
    }
    const font = tajweed ?? plain;
    if (font && layout) {
      const expanded = expandPage(layout, page);
      const zero = [];
      let unmapped = [];
      for (const line of expanded.lines) {
        for (const w of line.words) {
          const adv = font.advanceOfText(w.text);
          if (adv === null) unmapped.push(w.location);
          else if (adv === 0) zero.push(w.location);
        }
      }
      if (unmapped.length) {
        report.push(`p${page}: ${unmapped.length} word(s) use code points missing from the page font: ${unmapped.slice(0, 8).join(', ')}`);
        failed = true;
      }
      if (zero.length) {
        report.push(`p${page}: ${zero.length} standalone zero-advance word(s): ${zero.join(', ')}${args['allow-zero-advance'] ? ' (allowed)' : ''}`);
        if (!args['allow-zero-advance']) failed = true;
      }
      if (!unmapped.length && !zero.length) report.push(`p${page}: every word maps to a glyph with a positive advance`);
    }
    done++;
    if (pages.length > 20 && done % 50 === 0) log(`fonts: ${done}/${pages.length} pages`);
    return report;
  });
  return {etags, report: perPage.flat(), failed};
};

const headStatus = async (url) => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(url, {method: 'HEAD', headers: {'user-agent': USER_AGENT, origin: 'https://example.com'}, signal: ctrl.signal});
    clearTimeout(t);
    return res;
  } catch (e) {
    return {ok: false, status: 0, statusText: e.message, headers: new Headers()};
  }
};

/** Other CDN locations of the same page font (other format, without the cache-busting query, other set). */
const fontUrlVariants = (set, page, url) => {
  const out = [];
  for (const s of Object.keys(def.fontSets)) {
    for (const format of ['woff2', 'woff', 'ttf']) {
      const withQuery = def.fontUrl(s, page, format);
      for (const candidate of [withQuery, withQuery.replace(/\?.*$/, '')]) {
        if (candidate !== url && !out.includes(candidate)) out.push(candidate);
      }
    }
  }
  return out;
};

/**
 * Downloads the two pinned exports into the mirror, the way a browser would fetch them (with an
 * Origin header, so the CORS answer is recorded), and returns what to record about them.
 */
const downloadData = async () => {
  fs.mkdirSync(MIRROR_DIR, {recursive: true});
  const record = {};
  for (const part of Object.keys(MIRROR_FILES)) {
    const url = def.exports[part];
    log(`downloading the ${part} export: ${url}`);
    const res = await fetchWithRetry(url, {accept: '*/*', origin: 'https://example.com', timeoutMs: 180_000});
    const bytes = Buffer.from(await res.arrayBuffer());
    const cors = res.headers.get('access-control-allow-origin');
    if (!(bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50)) {
      throw new Error(`${url}: not a zip (${bytes.length} bytes, starts with ${JSON.stringify(bytes.subarray(0, 16).toString('latin1'))}); QUL may have moved the export — find the current link on qul.tarteel.ai and update scripts/lib/datasets.mjs and src/mushafs.ts`);
    }
    const entries = unzip(bytes);
    log(` - ${bytes.length} bytes, ${entries.map((e) => `${e.name} (${e.method === 8 ? 'deflated' : 'stored'}, ${e.data.length} bytes)`).join(', ')}; cors ${JSON.stringify(cors)}, cache-control ${JSON.stringify(res.headers.get('cache-control'))}, etag ${JSON.stringify(res.headers.get('etag'))}`);
    if (cors !== '*') log(` - WARNING: access-control-allow-origin is ${JSON.stringify(cors)}: a browser (every Remotion render path) cannot fetch this URL; renders must pass a mirror as \`data\``);
    fs.writeFileSync(mirrorFile(part), bytes);
    record[part] = {
      url,
      file: rel(mirrorFile(part)),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      entries: entries.map((e) => e.name),
      etag: res.headers.get('etag'),
      contentType: res.headers.get('content-type'),
      cacheControl: res.headers.get('cache-control'),
      cors,
      downloadedAt: new Date().toISOString(),
    };
  }
  log(`mirrored into ${rel(MIRROR_DIR)}/`);
  return record;
};

/** Parsed pages from two export files (zipped or not), read the dev-tools way: node:zlib + node:sqlite. */
const pagesFromExports = async (files, {expectPageCount = true} = {}) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-qul-'));
  try {
    const unpacked = {};
    for (const part of ['words', 'layout']) {
      const bytes = fs.readFileSync(files[part]);
      const isZip = bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50;
      const entry = isZip ? unzipExport(bytes, EXPORT_EXTENSIONS[part]) : {name: path.basename(files[part]), data: bytes};
      unpacked[part] = path.join(tmp, `${part}${path.extname(entry.name) || (part === 'words' ? '.json' : '.db')}`);
      fs.writeFileSync(unpacked[part], entry.data);
    }
    const words = await readWords(unpacked.words);
    const parsedPages = await readLayoutSqlite(unpacked.layout, words, def, {expectPageCount});
    return {parsedPages, words: words.size, source: `qul-export:${path.basename(files.layout)}`};
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
};

/** Page-by-page differences between two compiled layouts (source and generation time ignored). */
const compareLayouts = (a, b) => {
  const differences = [];
  if (a.pages.length !== b.pages.length) differences.push(`${a.pages.length} vs ${b.pages.length} pages`);
  const pages = Math.min(a.pages.length, b.pages.length);
  for (let p = 1; p <= pages; p++) {
    if (JSON.stringify(a.pages[p - 1]) === JSON.stringify(b.pages[p - 1])) continue;
    const x = expandPage(a, p);
    const y = expandPage(b, p);
    if (x.lines.length !== y.lines.length) {
      differences.push(`page ${p}: ${x.lines.length} vs ${y.lines.length} lines`);
      continue;
    }
    for (let i = 0; i < x.lines.length; i++) {
      const l = x.lines[i];
      const m = y.lines[i];
      const describe = (line) => `${line.type}${line.centered ? ' centred' : ''}${line.words.length ? ` ${line.words[0].location}..${line.words.at(-1).location} (${line.words.length} words)` : line.surah ? ` surah ${line.surah}` : ''}`;
      if (JSON.stringify(l) !== JSON.stringify(m)) differences.push(`page ${p} line ${l.line}: ${describe(l)} vs ${describe(m)}`);
    }
  }
  return differences;
};

/** Reads or writes scripts/cdn-etags.json, keeping the parts a run did not touch. */
const SURVEY_FILE = path.join(ROOT, 'scripts/cdn-etags.json');
const readSurvey = () => (fs.existsSync(SURVEY_FILE) ? JSON.parse(fs.readFileSync(SURVEY_FILE, 'utf8')) : null);
const writeSurvey = (patch, reason) => {
  const existing = readSurvey();
  const next = {...(existing ?? {generatedAt: null, base: null, entries: {}, problems: []}), ...patch};
  const {generatedAt: _a, ...before} = existing ?? {};
  const {generatedAt: _b, ...after} = next;
  if (existing && JSON.stringify(before) === JSON.stringify(after)) {
    log(`${rel(SURVEY_FILE)} is unchanged (${reason}); kept the committed generation time`);
    return;
  }
  fs.writeFileSync(SURVEY_FILE, JSON.stringify({...next, generatedAt: new Date().toISOString()}, null, 1) + '\n');
  log(`wrote ${rel(SURVEY_FILE)} (${reason})`);
};

const recordEtags = async (extra = {}) => {
  const entries = {...extra};
  const urls = [];
  for (const set of Object.keys(def.fontSets)) {
    for (let page = 1; page <= def.pages; page++) urls.push({set, page, url: def.fontUrl(set, page, 'woff2')});
  }
  let done = 0;
  const problems = [];
  await runPool(urls, 6, async ({set, page, url}) => {
    if (entries[url]) return;
    try {
      const res = await headStatus(url);
      if (!res.ok) {
        // A gap on the CDN: find out what does exist for that page so the registry can route around it.
        const available = [];
        for (const alt of fontUrlVariants(set, page, url)) {
          const r = await headStatus(alt);
          if (r.ok) available.push(`${alt} (${r.headers.get('content-type')}, ${r.headers.get('content-length')} bytes)`);
        }
        problems.push(`${url}: HTTP ${res.status}${res.status === 0 ? ` ${res.statusText}` : ''}${available.length ? `; available instead: ${available.join(', ')}` : '; no other format or set has this page either'}`);
        return;
      }
      entries[url] = {etag: res.headers.get('etag'), contentType: res.headers.get('content-type'), contentLength: Number(res.headers.get('content-length')) || null, cors: res.headers.get('access-control-allow-origin')};
    } finally {
      done++;
      if (done % 200 === 0) log(`etags: ${done}/${urls.length}`);
    }
  });
  // Sorted by URL so re-runs produce a stable, reviewable diff (requests finish in any order), and
  // the committed file is left alone when only its generation time would change.
  const sorted = Object.fromEntries(Object.keys(entries).sort().map((url) => [url, entries[url]]));
  const base = def.fontUrl('qpc-v4-tajweed', 1, 'woff2').replace(/\/p1\.woff2.*$/, '');
  writeSurvey({base, entries: sorted, problems}, `${Object.keys(entries).length} font entries`);
  // Gaps are recorded, not fatal: the layout and the fixture fonts are still valid, and the
  // registry handles known gaps explicitly.
  if (problems.length) log(`etags: ${problems.length} CDN gap(s), recorded in cdn-etags.json:\n - ${problems.slice(0, 20).join('\n - ')}`);
  return problems;
};

/** Compiles parsed pages (all or a subset), reports, validates unless told not to. */
const compileAndValidate = (parsedPages, source, subset, label) => {
  const partial = subset !== null && subset.length !== def.pages;
  const compileDef = partial ? {...def, pages: Math.max(...subset)} : def;
  if (partial) {
    // Fill unrequested pages with empty placeholders so ids stay meaningful only within requested pages.
    const have = new Set(parsedPages.map((p) => p.page));
    for (let p = 1; p <= compileDef.pages; p++) if (!have.has(p)) parsedPages.push({page: p, lines: []});
  }
  const compileReport = {};
  const layout = compileLayout(parsedPages, compileDef, {source, generatedAt: new Date().toISOString()}, compileReport);
  log(`${label}: compiled ${compileReport.regularWords} regular words, ${compileReport.markerWords} marker glyphs, code points per glyph ${JSON.stringify(compileReport.codePointLengths)}`);
  if (compileReport.idOrderViolations.length) {
    log(`${label}: QUL word ids out of reading order (database row ids of re-created words; harmless): ${compileReport.idOrderViolations.length}: ${compileReport.idOrderViolations.slice(0, 8).map((v) => `p${v.page} l${v.line} ${v.location} id ${v.qulId} after ${v.previousQulId}`).join('; ')}`);
  }
  if (compileReport.markers.length) {
    const byKind = {};
    for (const m of compileReport.markers) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
    log(`${label}: marker glyphs by kind: ${JSON.stringify(byKind)}; first ones: ${compileReport.markers.slice(0, 12).map((m) => `p${m.page} l${m.line} ${m.kind} ${m.location} (QUL id ${m.qulId})`).join('; ')}`);
  }
  if (!args['no-validate'] && !partial) {
    const {centeredAyahLineList, ...report} = validateLayout(layout, def);
    log(`${label}: validation passed: ${JSON.stringify(report)}`);
    log(`${label}: centred ayah lines: ${centeredAyahLineList.map((c) => `p${c.page} l${c.line} (${c.first}, ${c.words} words)`).join('; ')}`);
  } else if (partial) {
    log(`${label}: partial run (${subset.length} page(s)): validation skipped`);
  }
  return layout;
};

const main = async () => {
  const subset = args.pages ? parsePageList(args.pages, def.pages) : null;
  const filterSubset = (pages) => (subset ? pages.filter((p) => subset.includes(p.page)) : pages);
  let dataRecord = null;
  if (args.data) dataRecord = await downloadData();

  // The export route — what the package builds at runtime — from the mirror or the files given.
  const explicitExport = Boolean(args['layout-sqlite'] || args.words);
  const wantExport = args.data || explicitExport || (!args['from-pages'] && !args.fonts && !args.etags);
  let layout = null;
  if (wantExport) {
    let files;
    if (explicitExport) {
      if (!args['layout-sqlite'] || !args.words) throw new Error('--layout-sqlite and --words go together');
      files = {words: path.resolve(args.words), layout: path.resolve(args['layout-sqlite'])};
    } else {
      if (!haveMirror()) throw new Error(`no mirror under ${rel(MIRROR_DIR)}/: run with --data (needs network), or pass --layout-sqlite and --words`);
      files = {words: mirrorFile('words'), layout: mirrorFile('layout')};
    }
    log(`reading the exports ${rel(files.words)} + ${rel(files.layout)}`);
    const {parsedPages, words, source} = await pagesFromExports(files, {expectPageCount: subset === null});
    log(`exports: ${words} words, ${parsedPages.length} pages`);
    layout = compileAndValidate(filterSubset(parsedPages), source, subset, 'exports');
    if (!subset) {
      fs.mkdirSync(args.cache, {recursive: true});
      fs.writeFileSync(path.join(args.cache, 'report.json'), JSON.stringify({generatedAt: layout.generatedAt, source, wordCount: layout.wordCount, files: {words: rel(files.words), layout: rel(files.layout)}}, null, 1));
    }
  }

  // The preview route: QUL's own pages, compiled the same way, compared with the exports.
  if (args['from-pages']) {
    const pages = subset ?? parsePageList('all', def.pages);
    log(`fetching ${pages.length} preview page(s) from ${def.previewUrl(1).replace(/\?.*$/, '')}`);
    const preview = compileAndValidate(await fetchPages(pages), `qul-preview:layout-${def.layoutId}`, subset, 'preview');
    if (layout) {
      const differences = compareLayouts(layout, preview);
      if (differences.length === 0) {
        log(`preview and exports agree on every page (${layout.wordCount} words)`);
      } else {
        process.exitCode = 1;
        log(`preview and exports DIFFER in ${differences.length} place(s):\n - ${differences.slice(0, 40).join('\n - ')}${differences.length > 40 ? `\n - … ${differences.length - 40} more` : ''}`);
      }
    } else if (haveMirror()) {
      const {parsedPages, source} = await pagesFromExports({words: mirrorFile('words'), layout: mirrorFile('layout')}, {expectPageCount: subset === null});
      const fromMirror = compileAndValidate(filterSubset(parsedPages), source, subset, 'exports');
      const differences = compareLayouts(fromMirror, preview);
      if (differences.length === 0) log(`preview and the mirrored exports agree on every page (${preview.wordCount} words)`);
      else {
        process.exitCode = 1;
        log(`preview and the mirrored exports DIFFER in ${differences.length} place(s):\n - ${differences.slice(0, 40).join('\n - ')}${differences.length > 40 ? `\n - … ${differences.length - 40} more` : ''}`);
      }
      layout = fromMirror;
    } else {
      log('no mirror to compare with (run --data first); the preview compiled and validated on its own');
      layout = preview;
    }
  }

  if (!layout && args.fonts && haveMirror()) {
    // The zero-advance check needs the words; the mirror has them.
    const {parsedPages, source} = await pagesFromExports({words: mirrorFile('words'), layout: mirrorFile('layout')});
    layout = compileLayout(parsedPages, def, {source, generatedAt: new Date().toISOString()});
  }

  let fontEtags = {};
  if (args.fonts) {
    const pages = parsePageList(args.fonts, def.pages);
    log(`downloading fonts for ${pages.length} page(s): ${pages.join(', ')}`);
    const {etags, report, failed} = await downloadFonts(pages, layout);
    fontEtags = etags;
    for (const line of report) log(' -', line);
    if (failed) {
      process.exitCode = 1;
      log('font checks FAILED (see above)');
    }
  }
  if (dataRecord) {
    // An export that is byte-for-byte what the survey already records keeps its recorded download
    // time, so a re-run that changes nothing commits nothing.
    const recorded = readSurvey()?.data ?? {};
    const stable = Object.fromEntries(
      Object.entries(dataRecord).map(([part, record]) => {
        const {downloadedAt: _now, ...fresh} = record;
        const {downloadedAt: _then, ...known} = recorded[part] ?? {};
        return [part, JSON.stringify(fresh) === JSON.stringify(known) ? recorded[part] : record];
      }),
    );
    writeSurvey({data: stable}, 'the data exports');
  }
  if (args.etags) await recordEtags(fontEtags);
  if (process.exitCode) log('finished with errors');
  else log('done');
};

main().catch((e) => {
  const verbose = process.env.DEBUG && !(e instanceof LayoutValidationError);
  console.error('[fetch-qul] ' + (verbose ? e.stack : e.message ?? e));
  if (!verbose && !(e instanceof LayoutValidationError)) console.error('[fetch-qul] (set DEBUG=1 for a stack trace)');
  process.exit(1);
});

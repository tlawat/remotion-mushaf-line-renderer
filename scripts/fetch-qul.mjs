#!/usr/bin/env node
// Compiles the KFGQPC V4 mushaf layout from QUL into the package's generated data module, and
// optionally downloads font fixtures and records CDN ETags. Zero dependencies; Node >= 18
// (the --layout-sqlite input mode needs Node >= 22.13 for node:sqlite).
//
//   node scripts/fetch-qul.mjs [--from-pages]                 # default: QUL's public preview pages
//   node scripts/fetch-qul.mjs --layout-sqlite pages.db --words qpc-v4.json
//   node scripts/fetch-qul.mjs --fonts 1,10,604 [--etags] [--allow-zero-advance]
//
// Options:
//   --out <file>          generated module path (default packages/…/src/data/qpc-v4.generated.ts)
//   --cache <dir>         HTML cache directory (default .cache/qul)
//   --concurrency <n>     parallel page requests (default 3, be polite to QUL)
//   --pages a-b,c         subset of pages to fetch/parse (validation then runs with relaxed counts)
//   --fonts <list|all>    download page fonts for these pages (both sets, woff2 + ttf) into
//                         example/public/fonts/<set>/ and packages/…/test/fixtures/fonts/<set>/
//   --etags               HEAD every CDN woff2 URL and write scripts/cdn-etags.json
//   --allow-zero-advance  do not fail when a standalone word has zero advance in the fixture fonts
//   --no-validate         skip validation (for debugging only; never commit such output)

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {QPC_V4} from './lib/datasets.mjs';
import {parsePageHtml, QulParseError} from './lib/qul-html.mjs';
import {compileLayout, validateLayout, emitModule, expandPage, LayoutValidationError} from './lib/compile.mjs';
import {readWords, readLayoutSqlite} from './lib/qul-export.mjs';
import {parseSfnt, compareFonts, detectFontMagic} from './lib/sfnt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 remotion-mushaf-line-renderer/fetch-qul';

const {values: args} = parseArgs({
  options: {
    'from-pages': {type: 'boolean', default: false},
    'layout-sqlite': {type: 'string'},
    words: {type: 'string'},
    out: {type: 'string', default: path.join(ROOT, 'packages/remotion-mushaf-line-renderer/src/data/qpc-v4.generated.ts')},
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

const fetchWithRetry = async (url, {attempts = 4, timeoutMs = 30_000, accept = 'text/html'} = {}) => {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {headers: {'user-agent': USER_AGENT, accept}, signal: ctrl.signal, redirect: 'follow'});
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

const fontFixtureDirs = (set) => [
  path.join(ROOT, 'example/public/fonts', set),
  path.join(ROOT, 'packages/remotion-mushaf-line-renderer/test/fixtures/fonts', set),
];

const downloadFonts = async (pages, layout) => {
  const etags = {};
  const report = [];
  let failed = false;
  for (const page of pages) {
    const parsedBySet = {};
    for (const set of Object.keys(def.fontSets)) {
      for (const format of ['woff2', 'ttf']) {
        const url = def.fontUrl(set, page, format);
        let res;
        try {
          res = await fetchWithRetry(url, {accept: '*/*'});
        } catch (e) {
          report.push(`${set} p${page}.${format}: ${e.message}`);
          failed = true;
          continue;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        const magic = detectFontMagic(bytes);
        if (magic !== format && !(format === 'ttf' && magic === 'otf')) {
          report.push(`${set} p${page}.${format}: not a ${format} file (magic ${magic ?? 'unknown'}, ${bytes.length} bytes)`);
          failed = true;
          continue;
        }
        etags[url] = {etag: res.headers.get('etag'), contentType: res.headers.get('content-type'), contentLength: bytes.length, cors: res.headers.get('access-control-allow-origin')};
        for (const dir of fontFixtureDirs(set)) {
          fs.mkdirSync(dir, {recursive: true});
          fs.writeFileSync(path.join(dir, `p${page}.${format}`), bytes);
        }
        if (format === 'ttf') parsedBySet[set] = parseSfnt(bytes);
      }
    }
    const plain = parsedBySet['qpc-v4'];
    const tajweed = parsedBySet['qpc-v4-tajweed'];
    if (plain && tajweed) {
      const problems = compareFonts(plain, tajweed);
      if (problems.length) {
        report.push(`p${page}: plain/tajweed fonts differ: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ' …' : ''}`);
        failed = true;
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
  }
  return {etags, report, failed};
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
  const file = path.join(ROOT, 'scripts/cdn-etags.json');
  fs.writeFileSync(file, JSON.stringify({generatedAt: new Date().toISOString(), base: def.fontUrl('qpc-v4-tajweed', 1, 'woff2').replace(/\/p1\.woff2.*$/, ''), entries, problems}, null, 1) + '\n');
  log(`wrote ${path.relative(ROOT, file)} (${Object.keys(entries).length} entries)`);
  // Gaps are recorded, not fatal: the layout and the fixture fonts are still valid, and the
  // registry handles known gaps explicitly.
  if (problems.length) log(`etags: ${problems.length} CDN gap(s), recorded in cdn-etags.json:\n - ${problems.slice(0, 20).join('\n - ')}`);
  return problems;
};

const main = async () => {
  const subset = args.pages ? parsePageList(args.pages, def.pages) : null;
  const wantLayout = args['from-pages'] || args['layout-sqlite'] || !args.fonts && !args.etags;
  let layout = null;

  if (wantLayout) {
    let parsedPages;
    let source;
    if (args['layout-sqlite']) {
      if (!args.words) throw new Error('--layout-sqlite requires --words <file>');
      log(`reading QUL export ${args['layout-sqlite']} + ${args.words}`);
      const words = await readWords(args.words);
      parsedPages = await readLayoutSqlite(args['layout-sqlite'], words, subset ? null : def);
      if (subset) parsedPages = parsedPages.filter((p) => subset.includes(p.page));
      source = `qul-export:${path.basename(args['layout-sqlite'])}`;
    } else {
      const pages = subset ?? parsePageList('all', def.pages);
      log(`fetching ${pages.length} preview page(s) from ${def.previewUrl(1).replace(/\?.*$/, '')}`);
      parsedPages = await fetchPages(pages);
      source = `qul-preview:layout-${def.layoutId}`;
    }
    const partial = subset !== null && subset.length !== def.pages;
    const compileDef = partial ? {...def, pages: Math.max(...subset)} : def;
    if (partial) {
      // Fill unrequested pages with empty placeholders so ids stay meaningful only within requested pages.
      const have = new Set(parsedPages.map((p) => p.page));
      for (let p = 1; p <= compileDef.pages; p++) if (!have.has(p)) parsedPages.push({page: p, lines: []});
    }
    const compileReport = {};
    layout = compileLayout(parsedPages, compileDef, {source, generatedAt: new Date().toISOString()}, compileReport);
    log(`compiled: ${compileReport.regularWords} regular words, ${compileReport.markerWords} marker glyphs, code points per glyph ${JSON.stringify(compileReport.codePointLengths)}`);
    if (compileReport.idOrderViolations.length) {
      log(`QUL word ids out of reading order (database row ids of re-created words; harmless): ${compileReport.idOrderViolations.length}: ${compileReport.idOrderViolations.slice(0, 8).map((v) => `p${v.page} l${v.line} ${v.location} id ${v.qulId} after ${v.previousQulId}`).join('; ')}`);
    }
    if (compileReport.markers.length) {
      const byKind = {};
      for (const m of compileReport.markers) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
      log(`marker glyphs by kind: ${JSON.stringify(byKind)}; first ones: ${compileReport.markers.slice(0, 12).map((m) => `p${m.page} l${m.line} ${m.kind} ${m.location} (QUL id ${m.qulId})`).join('; ')}`);
    }
    if (!args['no-validate'] && !partial) {
      const {centeredAyahLineList, ...report} = validateLayout(layout, def);
      log('validation passed:', JSON.stringify(report));
      log(`centred ayah lines: ${centeredAyahLineList.map((c) => `p${c.page} l${c.line} (${c.first}, ${c.words} words)`).join('; ')}`);
    } else if (partial) {
      log(`partial run (${subset.length} page(s)): validation skipped, output NOT written`);
    }
    if (!partial) {
      const module = emitModule(layout);
      fs.mkdirSync(path.dirname(args.out), {recursive: true});
      fs.writeFileSync(args.out, module);
      log(`wrote ${path.relative(ROOT, args.out)} (${(module.length / 1024).toFixed(0)} KB, ${layout.wordCount} words)`);
      fs.mkdirSync(args.cache, {recursive: true});
      fs.writeFileSync(path.join(args.cache, 'report.json'), JSON.stringify({generatedAt: layout.generatedAt, source, wordCount: layout.wordCount}, null, 1));
    }
  } else if (fs.existsSync(args.out)) {
    // Load the committed module for the zero-advance check without a TypeScript toolchain.
    const src = fs.readFileSync(args.out, 'utf8');
    const m = src.match(/JSON\.parse\('([\s\S]*)'\) as CompiledLayout/);
    if (m) layout = JSON.parse(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
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
  if (args.etags) {
    await recordEtags(fontEtags);
  }
  if (process.exitCode) log('finished with errors');
  else log('done');
};

main().catch((e) => {
  const verbose = process.env.DEBUG && !(e instanceof LayoutValidationError);
  console.error('[fetch-qul] ' + (verbose ? e.stack : e.message ?? e));
  if (!verbose && !(e instanceof LayoutValidationError)) console.error('[fetch-qul] (set DEBUG=1 for a stack trace)');
  process.exit(1);
});

// The mirror of QUL's two raw exports (the words JSON and the layout SQLite the package fetches at
// runtime): downloading them, reading them the dev-tools way (node:zlib + node:sqlite, deliberately
// not the package's own readers, so the real files get checked by two implementations), compiling
// and validating them, and comparing compiled layouts page by page.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fetchWithRetry, log, ROOT} from './cli.mjs';
import {compileLayout, expandPage, validateLayout} from './compile.mjs';
import {readLayoutSqlite, readWords} from './qul-export.mjs';
import {unzip, unzipExport} from './zip.mjs';

/** Where the exports are mirrored: served by the example at /data/<dataset>/…, read by the suites. */
export const MIRROR_DIR = path.join(ROOT, 'example/public/data');
export const MIRROR_FILES = {words: 'words.json.zip', layout: 'layout.db.zip'};
const EXPORT_EXTENSIONS = {words: ['.json'], layout: ['.db', '.sqlite', '.sqlite3']};

export const mirrorFile = (def, part) => path.join(MIRROR_DIR, def.dataset, MIRROR_FILES[part]);
export const mirrorFiles = (def) => ({words: mirrorFile(def, 'words'), layout: mirrorFile(def, 'layout')});
export const haveMirror = (def) => Object.keys(MIRROR_FILES).every((part) => fs.existsSync(mirrorFile(def, part)));

const rel = (file) => path.relative(ROOT, file);
const isZip = (bytes) => bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50;

/**
 * Downloads the two pinned exports into the mirror, the way a browser would fetch them (with an
 * Origin header, so the CORS answer is recorded), and returns what to record about them.
 */
export const downloadData = async (def) => {
  fs.mkdirSync(path.join(MIRROR_DIR, def.dataset), {recursive: true});
  const record = {};
  for (const part of Object.keys(MIRROR_FILES)) {
    const url = def.exports[part];
    log(`downloading the ${part} export: ${url}`);
    const res = await fetchWithRetry(url, {accept: '*/*', origin: 'https://example.com', timeoutMs: 180_000});
    const bytes = Buffer.from(await res.arrayBuffer());
    const cors = res.headers.get('access-control-allow-origin');
    if (!isZip(bytes)) {
      throw new Error(
        `${url}: not a zip (${bytes.length} bytes, starts with ${JSON.stringify(bytes.subarray(0, 16).toString('latin1'))}); QUL may have moved the export — find the current link on qul.tarteel.ai and update scripts/lib/datasets.mjs and the package's registry`,
      );
    }
    const entries = unzip(bytes);
    log(
      ` - ${bytes.length} bytes, ${entries.map((e) => `${e.name} (${e.method === 8 ? 'deflated' : 'stored'}, ${e.data.length} bytes)`).join(', ')}; cors ${JSON.stringify(cors)}, cache-control ${JSON.stringify(res.headers.get('cache-control'))}, etag ${JSON.stringify(res.headers.get('etag'))}`,
    );
    if (cors !== '*')
      log(
        ` - WARNING: access-control-allow-origin is ${JSON.stringify(cors)}: a browser (every Remotion render path) cannot fetch this URL; renders must pass a mirror as \`data\``,
      );
    fs.writeFileSync(mirrorFile(def, part), bytes);
    record[part] = {
      url,
      file: rel(mirrorFile(def, part)),
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
  log(`mirrored into ${rel(path.join(MIRROR_DIR, def.dataset))}/`);
  return record;
};

/**
 * An export that is byte-for-byte what the survey already records keeps its recorded download
 * time, so a re-run that changes nothing commits nothing.
 */
export const stableDataRecord = (fresh, recorded = {}) =>
  Object.fromEntries(
    Object.entries(fresh).map(([part, record]) => {
      const {downloadedAt: _now, ...now} = record;
      const {downloadedAt: _then, ...known} = recorded[part] ?? {};
      return [part, JSON.stringify(now) === JSON.stringify(known) ? recorded[part] : record];
    }),
  );

/** Parsed pages from two export files (zipped or not), read the dev-tools way: node:zlib + node:sqlite. */
export const pagesFromExports = async (def, files, {expectPageCount = true} = {}) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qul-data-'));
  try {
    const unpacked = {};
    for (const part of ['words', 'layout']) {
      const bytes = fs.readFileSync(files[part]);
      const entry = isZip(bytes)
        ? unzipExport(bytes, EXPORT_EXTENSIONS[part])
        : {name: path.basename(files[part]), data: bytes};
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

/**
 * Compiles parsed pages (all, or the `subset` requested), logs the compiler's report and validates
 * every invariant of the printed page (a full run only; a subset cannot be validated).
 */
export const compilePages = (def, parsedPages, source, {subset = null, validate = true, label = 'layout'} = {}) => {
  const partial = subset !== null && subset.length !== def.pages;
  const compileDef = partial ? {...def, pages: Math.max(...subset)} : def;
  const pages = partial ? parsedPages.filter((p) => subset.includes(p.page)) : parsedPages;
  if (partial) {
    // Fill unrequested pages with empty placeholders so ids stay meaningful only within requested pages.
    const have = new Set(pages.map((p) => p.page));
    for (let p = 1; p <= compileDef.pages; p++) if (!have.has(p)) pages.push({page: p, lines: []});
  }
  const report = {};
  const layout = compileLayout(pages, compileDef, {source, generatedAt: new Date().toISOString()}, report);
  log(
    `${label}: compiled ${report.regularWords} regular words, ${report.markerWords} marker glyphs, code points per glyph ${JSON.stringify(report.codePointLengths)}`,
  );
  if (report.idOrderViolations.length) {
    log(
      `${label}: QUL word ids out of reading order (database row ids of re-created words; harmless): ${report.idOrderViolations.length}: ${report.idOrderViolations
        .slice(0, 8)
        .map((v) => `p${v.page} l${v.line} ${v.location} id ${v.qulId} after ${v.previousQulId}`)
        .join('; ')}`,
    );
  }
  if (report.markers.length) {
    const byKind = {};
    for (const m of report.markers) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
    log(
      `${label}: marker glyphs by kind: ${JSON.stringify(byKind)}; first ones: ${report.markers
        .slice(0, 12)
        .map((m) => `p${m.page} l${m.line} ${m.kind} ${m.location} (QUL id ${m.qulId})`)
        .join('; ')}`,
    );
  }
  if (partial) {
    log(`${label}: partial run (${subset.length} page(s)): validation skipped`);
  } else if (validate) {
    const {centeredAyahLineList, ...summary} = validateLayout(layout, def);
    log(`${label}: validation passed: ${JSON.stringify(summary)}`);
    log(
      `${label}: centred ayah lines: ${centeredAyahLineList.map((c) => `p${c.page} l${c.line} (${c.first}, ${c.words} words)`).join('; ')}`,
    );
  }
  return layout;
};

/** The layout compiled from the mirror (or from the export files given), validated unless a subset is asked for. */
export const layoutFromExports = async (
  def,
  files = mirrorFiles(def),
  {subset = null, validate = true, label = 'exports'} = {},
) => {
  log(`reading the exports ${rel(files.words)} + ${rel(files.layout)}`);
  const {parsedPages, words, source} = await pagesFromExports(def, files, {expectPageCount: subset === null});
  log(`${label}: ${words} words, ${parsedPages.length} pages`);
  return compilePages(def, parsedPages, source, {subset, validate, label});
};

/** Page-by-page differences between two compiled layouts (source and generation time ignored). */
export const compareLayouts = (a, b) => {
  const differences = [];
  if (a.pages.length !== b.pages.length) differences.push(`${a.pages.length} vs ${b.pages.length} pages`);
  const pages = Math.min(a.pages.length, b.pages.length);
  const describe = (line) =>
    `${line.type}${line.centered ? ' centred' : ''}${line.words.length ? ` ${line.words[0].location}..${line.words.at(-1).location} (${line.words.length} words)` : line.surah ? ` surah ${line.surah}` : ''}`;
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
      if (JSON.stringify(l) !== JSON.stringify(m))
        differences.push(`page ${p} line ${l.line}: ${describe(l)} vs ${describe(m)}`);
    }
  }
  return differences;
};

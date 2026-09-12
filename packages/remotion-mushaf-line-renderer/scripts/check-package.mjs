#!/usr/bin/env node
// Packaging checks, run after `bun run build`:
//   1. every file named in package.json#exports exists;
//   2. dist/*/index.* stay small (the package ships code only: the mushaf data is fetched at runtime);
//   3. the ESM and CJS builds load in Node, export the public API, and resolve a line through the
//      runtime loader (from the example's mirror of QUL's exports when it is present) — and fail
//      with a DATA_* error, not a hang, when the source is unreachable;
//   4. `bun pm pack` + @arethetypeswrong/cli agree the types resolve under every module setting, and
//      the tarball carries no data, fonts, tests or sources.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const mirrorDir = path.resolve(pkgDir, '../../example/public/data');
const failures = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => console.log(`  ok  ${msg}`);

// 1. exports map files exist ---------------------------------------------------------------------
const exportFiles = [];
const walk = (v) => {
  if (typeof v === 'string') exportFiles.push(v);
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
};
walk(pkg.exports);
for (const f of [pkg.main, pkg.module, pkg.types, ...exportFiles]) {
  if (!existsSync(path.join(pkgDir, f))) fail(`missing file referenced from package.json: ${f}`);
}
if (failures.length === 0) ok(`all ${exportFiles.length + 3} files referenced from package.json exist`);

// 2. sizes and charset ----------------------------------------------------------------------------
const MAX_INDEX_BYTES = 128 * 1024;
for (const f of ['dist/esm/index.mjs', 'dist/cjs/index.js', 'dist/esm/presentations/reveal-rtl.mjs', 'dist/cjs/presentations/reveal-rtl.js', 'dist/esm/presentations/slide-fade.mjs', 'dist/cjs/presentations/slide-fade.js']) {
  const size = statSync(path.join(pkgDir, f)).size;
  if (size > MAX_INDEX_BYTES) fail(`${f} is ${size} bytes; the package ships code only (limit ${MAX_INDEX_BYTES})`);
  else ok(`${f}: ${(size / 1024).toFixed(1)} KB`);
  const text = readFileSync(path.join(pkgDir, f), 'utf8');
  if (/[^\x00-\x7f]/.test(text)) fail(`${f} is not ASCII`);
  if (/qpc-v4\.generated|"pages":\[\{"w":1,/.test(text)) fail(`${f} embeds mushaf data; the layout must come from QUL's exports at runtime`);
}
const esmIndex = readFileSync(path.join(pkgDir, 'dist/esm/index.mjs'), 'utf8');
const cjsIndex = readFileSync(path.join(pkgDir, 'dist/cjs/index.js'), 'utf8');
if (/\bimport\(/.test(cjsIndex)) fail('dist/cjs/index.js contains a dynamic import(); the CJS build must not need ESM support from its host');
if (/\brequire\(/.test(esmIndex)) fail('dist/esm/index.mjs contains a require()');
if (!/wasabisys\.com\/static-cdn\.tarteel\.ai\/qul-exports/.test(esmIndex) || !/qpc-v4\.json\.zip/.test(esmIndex) || !/15-lines\.db\.zip/.test(esmIndex)) fail('dist/esm/index.mjs does not pin the QUL export URLs');
for (const f of ['dist/esm/index.d.mts', 'dist/cjs/index.d.ts', 'dist/esm/presentations/reveal-rtl.d.mts', 'dist/cjs/presentations/reveal-rtl.d.ts', 'dist/esm/presentations/slide-fade.d.mts', 'dist/cjs/presentations/slide-fade.d.ts']) {
  const text = readFileSync(path.join(pkgDir, f), 'utf8');
  if (/from ['"]\.\.?\//.test(text)) fail(`${f} has relative imports; declarations must be bundled`);
}

// 3. both builds load in Node and resolve a line through the runtime loader ----------------------
const expectedApi = ['MushafLine', 'getMushafLine', 'getMushafLines', 'getMushafLocation', 'loadMushafData', 'loadPageFont', 'MushafError'];
const hasMirror = existsSync(path.join(mirrorDir, 'qpc-v4/words.json.zip')) && existsSync(path.join(mirrorDir, 'qpc-v4/layout.db.zip'));
const CONTENT_TYPES = {'.zip': 'application/zip', '.json': 'application/json', '.db': 'application/vnd.sqlite3'};
const serveMirror = () =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const file = path.join(mirrorDir, decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname));
      if (!file.startsWith(mirrorDir) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*'});
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({server, origin: `http://127.0.0.1:${server.address().port}`}));
  });
const mirror = hasMirror ? await serveMirror() : null;
const checkApi = async (label, mod) => {
  for (const name of expectedApi) if (typeof mod[name] !== 'function') fail(`${label}: export ${name} is missing`);
  // Unreachable source: a DATA_* MushafError, promptly (connection refused is final at once).
  const started = Date.now();
  try {
    await mod.getMushafLine({mushaf: 'qpc-v4', page: 1, line: 2, data: {words: 'http://127.0.0.1:9/words.json.zip', layout: 'http://127.0.0.1:9/layout.db.zip'}});
    fail(`${label}: an unreachable data source resolved a line`);
  } catch (e) {
    if (e?.name === 'MushafError' && /^DATA_/.test(e.code ?? '')) ok(`${label}: an unreachable data source fails with ${e.code} after ${Date.now() - started} ms`);
    else fail(`${label}: an unreachable data source failed with ${e?.code ?? e?.name ?? e}: ${e?.message ?? ''}`);
  }
  if (!mirror) {
    ok(`${label}: no mirror under example/public/data/qpc-v4 (bun run qul data); the loader was not exercised against real files`);
    return;
  }
  try {
    const data = {words: `${mirror.origin}/qpc-v4/words.json.zip`, layout: `${mirror.origin}/qpc-v4/layout.db.zip`};
    const line = await mod.getMushafLine({mushaf: 'qpc-v4', page: 1, line: 2, data});
    if (line.words[0]?.id !== '1:1:1') fail(`${label}: page 1 line 2 should start at 1:1:1, got ${line.words[0]?.id}`);
    else ok(`${label}: getMushafLine resolved page 1 line 2 through the runtime loader from the mirror (${line.words.length} words)`);
  } catch (e) {
    fail(`${label}: getMushafLine failed against the mirror: ${e?.stack ?? e}`);
  }
};
const esm = await import(pathToFileURL(path.join(pkgDir, 'dist/esm/index.mjs')).href);
await checkApi('esm', esm);
const require = createRequire(import.meta.url);
const cjs = require(path.join(pkgDir, 'dist/cjs/index.js'));
await checkApi('cjs', cjs);
mirror?.server.close();
for (const [name, factory] of [
  ['reveal-rtl', 'revealRtl'],
  ['slide-fade', 'slideFade'],
]) {
  const esmModule = await import(pathToFileURL(path.join(pkgDir, `dist/esm/presentations/${name}.mjs`)).href);
  const cjsModule = require(path.join(pkgDir, `dist/cjs/presentations/${name}.js`));
  for (const [label, m] of [
    ['esm', esmModule],
    ['cjs', cjsModule],
  ]) {
    const p = m[factory]?.();
    if (typeof p?.component !== 'function' || typeof p?.props !== 'object') fail(`${label}: ${factory}() does not return a presentation`);
    else ok(`${label}: presentations/${name} loads`);
  }
}

// 4. pack + attw ----------------------------------------------------------------------------------
const tmp = mkdtempSync(path.join(tmpdir(), 'mushaf-pack-'));
try {
  execFileSync('bun', ['pm', 'pack', '--destination', tmp], {cwd: pkgDir, stdio: 'pipe'});
  const tgz = readdirSync(tmp).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error('bun pm pack produced no tarball');
  const listing = execFileSync('tar', ['-tzf', path.join(tmp, tgz)], {encoding: 'utf8'}).split('\n').filter(Boolean);
  const mustShip = ['package/dist/esm/index.mjs', 'package/dist/cjs/index.js', 'package/dist/esm/index.d.mts', 'package/dist/cjs/index.d.ts', 'package/README.md', 'package/LICENSE'];
  for (const f of mustShip) if (!listing.includes(f)) fail(`tarball is missing ${f}`);
  const leaks = listing.filter((f) => /\.(ttf|woff2?|zip|db|sqlite3?|json|test\.[cm]?[jt]sx?)$/.test(f) && f !== 'package/package.json' || f.startsWith('package/test/') || f.startsWith('package/src/'));
  if (leaks.length) fail(`tarball ships files it should not: ${leaks.join(', ')}`);
  ok(`tarball ${tgz}: ${listing.length} files, ${(statSync(path.join(tmp, tgz)).size / 1024).toFixed(0)} KB`);
  const attwBin = path.join(path.dirname(require.resolve('@arethetypeswrong/cli/package.json')), 'dist/index.js');
  const attw = execFileSync(process.execPath, [attwBin, path.join(tmp, tgz), '--profile', 'node16', '--format', 'ascii'], {cwd: pkgDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  console.log(attw.trim().split('\n').map((l) => `      ${l}`).join('\n'));
  ok('@arethetypeswrong/cli found no problems');
} catch (e) {
  fail(`pack/attw: ${e.stdout?.toString() || ''}${e.stderr?.toString() || ''}${e.message}`);
} finally {
  rmSync(tmp, {recursive: true, force: true});
}

if (failures.length) {
  console.error(`\n${failures.length} packaging check(s) failed:\n` + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('\nall packaging checks passed');

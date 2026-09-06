#!/usr/bin/env node
// Packaging checks, run after `pnpm build`:
//   1. every file named in package.json#exports exists;
//   2. dist/*/index.* stay small (the data lives in its own lazy chunk) and the data chunk is ASCII;
//   3. the ESM and CJS builds load in Node, export the public API, and resolve the data chunk;
//   4. `pnpm pack` + @arethetypeswrong/cli agree the types resolve under every module setting.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
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
const MAX_INDEX_BYTES = 100 * 1024;
for (const f of ['dist/esm/index.mjs', 'dist/cjs/index.js', 'dist/esm/presentations/reveal-rtl.mjs', 'dist/cjs/presentations/reveal-rtl.js', 'dist/esm/presentations/slide-fade.mjs', 'dist/cjs/presentations/slide-fade.js']) {
  const size = statSync(path.join(pkgDir, f)).size;
  if (size > MAX_INDEX_BYTES) fail(`${f} is ${size} bytes; the data must stay out of the main chunk (limit ${MAX_INDEX_BYTES})`);
  else ok(`${f}: ${(size / 1024).toFixed(1)} KB`);
  const text = readFileSync(path.join(pkgDir, f), 'utf8');
  if (/qpc-v4\.generated/.test(text) && !/["']\.\/data\/qpc-v4\.(mjs|js)["']/.test(text)) fail(`${f} inlines or mis-resolves the data module`);
}
for (const f of ['dist/esm/data/qpc-v4.mjs', 'dist/cjs/data/qpc-v4.js']) {
  const text = readFileSync(path.join(pkgDir, f), 'utf8');
  const bad = text.match(/[^\x00-\x7f]/);
  if (bad) fail(`${f} is not ASCII (first offending character U+${bad[0].codePointAt(0).toString(16)})`);
  else ok(`${f}: ASCII, ${(statSync(path.join(pkgDir, f)).size / 1024).toFixed(0)} KB`);
}
const esmIndex = readFileSync(path.join(pkgDir, 'dist/esm/index.mjs'), 'utf8');
const cjsIndex = readFileSync(path.join(pkgDir, 'dist/cjs/index.js'), 'utf8');
if (!/import\(["']\.\/data\/qpc-v4\.mjs["']\)/.test(esmIndex)) fail('dist/esm/index.mjs does not lazy-import ./data/qpc-v4.mjs');
if (!/require\(["']\.\/data\/qpc-v4\.js["']\)/.test(cjsIndex)) fail('dist/cjs/index.js does not lazy-require ./data/qpc-v4.js');
if (/\bimport\(/.test(cjsIndex)) fail('dist/cjs/index.js contains a dynamic import(); the CJS build must not need ESM support from its host');
if (/\brequire\(/.test(esmIndex)) fail('dist/esm/index.mjs contains a require()');
for (const f of ['dist/esm/index.d.mts', 'dist/cjs/index.d.ts', 'dist/esm/presentations/reveal-rtl.d.mts', 'dist/cjs/presentations/reveal-rtl.d.ts', 'dist/esm/presentations/slide-fade.d.mts', 'dist/cjs/presentations/slide-fade.d.ts']) {
  const text = readFileSync(path.join(pkgDir, f), 'utf8');
  if (/from ['"]\.\.?\//.test(text)) fail(`${f} has relative imports; declarations must be bundled`);
}

// 3. both builds load in Node and resolve the data chunk ------------------------------------------
const expectedApi = ['MushafLine', 'getMushafLine', 'loadPageFont', 'MushafError'];
const checkApi = async (label, mod) => {
  for (const name of expectedApi) if (typeof mod[name] !== 'function') fail(`${label}: export ${name} is missing`);
  try {
    const line = await mod.getMushafLine({mushaf: 'qpc-v4', page: 1, line: 2});
    if (line.words[0]?.id !== '1:1:1') fail(`${label}: page 1 line 2 should start at 1:1:1, got ${line.words[0]?.id}`);
    else ok(`${label}: getMushafLine resolved page 1 line 2 through the data chunk (${line.words.length} words)`);
  } catch (e) {
    if (e?.code === 'DATA_NOT_COMPILED') ok(`${label}: data chunk resolved (placeholder data: ${e.code})`);
    else fail(`${label}: getMushafLine failed: ${e?.stack ?? e}`);
  }
};
const esm = await import(pathToFileURL(path.join(pkgDir, 'dist/esm/index.mjs')).href);
await checkApi('esm', esm);
const require = createRequire(import.meta.url);
const cjs = require(path.join(pkgDir, 'dist/cjs/index.js'));
await checkApi('cjs', cjs);
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
  execFileSync('pnpm', ['pack', '--pack-destination', tmp], {cwd: pkgDir, stdio: 'pipe'});
  const tgz = readdirSync(tmp).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error('pnpm pack produced no tarball');
  const listing = execFileSync('tar', ['-tzf', path.join(tmp, tgz)], {encoding: 'utf8'}).split('\n').filter(Boolean);
  const mustShip = ['package/dist/esm/index.mjs', 'package/dist/cjs/index.js', 'package/dist/esm/index.d.mts', 'package/dist/cjs/index.d.ts', 'package/dist/esm/data/qpc-v4.mjs', 'package/dist/cjs/data/qpc-v4.js', 'package/README.md', 'package/LICENSE'];
  for (const f of mustShip) if (!listing.includes(f)) fail(`tarball is missing ${f}`);
  const leaks = listing.filter((f) => /\.(ttf|woff2?|test\.[cm]?[jt]sx?)$/.test(f) || f.startsWith('package/test/') || f.startsWith('package/src/'));
  if (leaks.length) fail(`tarball ships files it should not: ${leaks.join(', ')}`);
  ok(`tarball ${tgz}: ${listing.length} files, ${(statSync(path.join(tmp, tgz)).size / 1024).toFixed(0)} KB`);
  const attw = execFileSync('pnpm', ['exec', 'attw', path.join(tmp, tgz), '--profile', 'node16', '--format', 'ascii'], {cwd: pkgDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
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

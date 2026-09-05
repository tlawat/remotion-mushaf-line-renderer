#!/usr/bin/env node
// Probes QUL's font CDN the way a Remotion render will use it: cross-origin fetch of a few page
// fonts, checking status, CORS header, content type, magic bytes and (when scripts/cdn-etags.json
// exists) that the ETags still match the ones recorded when the data was compiled.
//
//   node scripts/verify-cdn.mjs [--pages 1,10,604] [--all]
//
// Exit code 1 when anything fails. This is the milestone-2 gate from the plan; run it on a machine
// that can reach static-cdn.tarteel.ai.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {QPC_V4} from './lib/datasets.mjs';
import {detectFontMagic} from './lib/sfnt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {values: args} = parseArgs({options: {pages: {type: 'string', default: '1,10,604'}, all: {type: 'boolean', default: false}}});

const pages = args.all ? Array.from({length: QPC_V4.pages}, (_, i) => i + 1) : args.pages.split(',').map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= QPC_V4.pages);
const recorded = fs.existsSync(path.join(ROOT, 'scripts/cdn-etags.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/cdn-etags.json'), 'utf8')).entries : null;

const problems = [];
const ok = [];
const check = async (set, page, format) => {
  const url = QPC_V4.fontUrl(set, page, format);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    const res = await fetch(url, {headers: {origin: 'https://example.com', 'user-agent': 'remotion-mushaf-line-renderer/verify-cdn'}, signal: ctrl.signal});
    clearTimeout(t);
    if (!res.ok) {
      problems.push(`${set} p${page}.${format}: HTTP ${res.status}`);
      return;
    }
    const cors = res.headers.get('access-control-allow-origin');
    if (cors !== '*' && cors !== 'https://example.com') problems.push(`${set} p${page}.${format}: access-control-allow-origin is ${JSON.stringify(cors)}, expected "*"`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const magic = detectFontMagic(bytes);
    if (magic !== format && !(format === 'ttf' && magic === 'otf')) problems.push(`${set} p${page}.${format}: body is not a ${format} (magic ${magic ?? 'unknown'}, ${bytes.length} bytes)`);
    const etag = res.headers.get('etag');
    if (recorded && recorded[url] && recorded[url].etag && etag !== recorded[url].etag) problems.push(`${set} p${page}.${format}: ETag changed since scripts/cdn-etags.json (${recorded[url].etag} → ${etag}); the font may have been republished — re-run fetch-qul --fonts and re-check the rendering`);
    ok.push(`${set} p${page}.${format}: ${bytes.length} bytes, CORS ${cors}, cache-control ${res.headers.get('cache-control')}, etag ${etag}`);
  } catch (e) {
    problems.push(`${set} p${page}.${format}: ${e.message}`);
  }
};

for (const page of pages) {
  for (const set of Object.keys(QPC_V4.fontSets)) {
    for (const format of ['woff2', 'ttf']) await check(set, page, format);
  }
}
for (const line of ok) console.log('ok  ', line);
for (const line of problems) console.log('FAIL', line);
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall CDN checks passed');
if (problems.some((p) => p.startsWith('qpc-v4 ') && /HTTP 404/.test(p))) {
  console.log('\nThe plain "v4" font set is not served by the CDN. Per the plan, drop the "qpc-v4" registry row and use "qpc-v4-tajweed" with base-palette 3 for the plain look.');
}
process.exit(problems.length ? 1 : 0);

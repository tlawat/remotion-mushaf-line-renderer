// The two fonts packages (packages/fonts-<set>/) against the manifest they are generated from, the
// CDN survey and the renderer's registry. Runs without the font files (fonts/ is filled on demand).
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {getMushafDefinition} from '../../packages/remotion-mushaf-line-renderer/src/mushaf/registry';
import {cdnUrlOf, packageDir, readManifest, renderIndexDts, renderIndexJs, SETS} from '../fonts-package.mjs';
import {ETAGS_FILE} from '../lib/cli.mjs';

const survey = JSON.parse(fs.readFileSync(ETAGS_FILE, 'utf8'));
const def = getMushafDefinition('qpc-v4');
const fontSetOf = (set) => (set === 'qpc-v4' ? def.fontSets.plain : def.fontSets.color);

describe.each(SETS)('remotion-mushaf-fonts-%s', (set) => {
  const manifest = readManifest(set);
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir(set), 'package.json'), 'utf8'));

  it('lists every page once, in the format the renderer expects, with well-formed hashes', () => {
    expect(Object.keys(manifest.files)).toHaveLength(604);
    for (let page = 1; page <= 604; page++) {
      const entry = manifest.files[page];
      expect(entry, `page ${page}`).toBeDefined();
      expect(entry.file).toBe(`p${page}.${fontSetOf(set).format(page)}`);
      expect(entry.md5).toMatch(/^[0-9a-f]{32}$/);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.bytes).toBeGreaterThan(10_000);
    }
    expect(manifest.totalBytes).toBe(Object.values(manifest.files).reduce((s, f) => s + f.bytes, 0));
  });

  it('holds the files the CDN served when the survey was taken (strong ETag = MD5)', () => {
    let compared = 0;
    for (const entry of Object.values(manifest.files)) {
      const recorded = survey.entries[cdnUrlOf(set, entry.file)];
      if (!recorded?.etag || recorded.etag.startsWith('W/')) continue;
      expect(recorded.etag.replaceAll('"', ''), entry.file).toBe(entry.md5);
      expect(recorded.contentLength, entry.file).toBe(entry.bytes);
      compared++;
    }
    expect(compared).toBeGreaterThanOrEqual(603);
  });

  it('points at the same CDN files as the renderer', () => {
    for (let page = 1; page <= 604; page++)
      expect(cdnUrlOf(set, manifest.files[page].file)).toBe(fontSetOf(set).cdnUrl(page));
  });

  it('is versioned after its snapshot and generated from its manifest', () => {
    expect(pkg.name).toBe(`remotion-mushaf-fonts-${set}`);
    expect(manifest.name).toBe(pkg.name);
    expect(pkg.version).toMatch(/^1\.\d{8}\.\d+$/);
    expect(pkg.version.split('.')[1]).toBe(manifest.snapshot.replaceAll('-', ''));
    expect(fs.readFileSync(path.join(packageDir(set), 'index.js'), 'utf8')).toBe(renderIndexJs(manifest, pkg.version));
    expect(fs.readFileSync(path.join(packageDir(set), 'index.d.ts'), 'utf8')).toBe(renderIndexDts(manifest));
  });

  it('exports what the renderer reads: a schema-1 package whose URLs sit next to the entry', async () => {
    const {default: fonts} = await import(pathToFileURL(path.join(packageDir(set), 'index.js')).href);
    expect(fonts).toMatchObject({
      kind: 'remotion-mushaf-fonts',
      schema: 1,
      name: pkg.name,
      version: pkg.version,
      mushaf: 'qpc-v4',
      fontSet: set,
      snapshot: manifest.snapshot,
    });
    expect(Object.keys(fonts.files)).toHaveLength(604);
    const p10 = fonts.files[10];
    expect(p10.url).toBe(pathToFileURL(path.join(packageDir(set), 'fonts', manifest.files[10].file)).href);
    expect(p10).toMatchObject({bytes: manifest.files[10].bytes, sha256: manifest.files[10].sha256});
  });
});

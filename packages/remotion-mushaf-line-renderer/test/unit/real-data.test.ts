// The mirrored QUL exports (example/public/data/qpc-v4, written by `node bun run qul
// --data`) through the package's runtime loader: the layout must satisfy every invariant of the
// printed page and agree with the dev tools' independent route (node:zlib + node:sqlite + the
// scripts compiler). Skipped when the mirror is absent.
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
// @ts-expect-error — plain JS modules from scripts/
import {compileLayout as compileLayoutJs, validateLayout} from '../../../../scripts/lib/compile.mjs';
// @ts-expect-error — plain JS modules from scripts/
import {QPC_V4} from '../../../../scripts/lib/datasets.mjs';
// @ts-expect-error — plain JS modules from scripts/
import {readLayoutSqlite, readWords} from '../../../../scripts/lib/qul-export.mjs';
// @ts-expect-error — plain JS modules from scripts/
import {unzipExport} from '../../../../scripts/lib/zip.mjs';
import {loadLayout, resetLayoutCache} from '../../src/data/load-layout';
import {lineFromLayout} from '../../src/get-mushaf-line';
import {getMushafLines, lineAyahs} from '../../src/get-mushaf-lines';

const mirror = path.resolve(__dirname, '../../../../example/public/data/qpc-v4');
const files = {words: path.join(mirror, 'words.json.zip'), layout: path.join(mirror, 'layout.db.zip')};
const hasMirror = existsSync(files.words) && existsSync(files.layout);
const hasNodeSqlite = await import('node:sqlite').then(() => true, () => false);
const source = {words: 'https://mirror.test/data/qpc-v4/words.json.zip', layout: 'https://mirror.test/data/qpc-v4/layout.db.zip'};

const bytesOf = (file: string): Uint8Array<ArrayBuffer> => new Uint8Array(readFileSync(file));

describe.skipIf(!hasMirror)('the mirrored QUL exports', () => {
  const fetchMock = vi.fn(async (url: string) => {
    const file = url.endsWith('words.json.zip') ? files.words : url.endsWith('layout.db.zip') ? files.layout : null;
    return file ? new Response(bytesOf(file)) : new Response('not found', {status: 404});
  });
  beforeEach(() => {
    resetLayoutCache();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('load through the runtime reader into a layout that satisfies every invariant of the print', async () => {
    const layout = await loadLayout('qpc-v4', source);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(layout.source).toBe('qul-export:layout.db.zip');
    const {centeredAyahLineList: _list, ...report} = validateLayout(layout, QPC_V4);
    expect(report).toMatchObject({
      pages: QPC_V4.pages,
      lines: QPC_V4.invariants.lines,
      ayahLines: QPC_V4.invariants.ayahLines,
      surahNameLines: QPC_V4.invariants.surahNameLines,
      basmallahLines: QPC_V4.invariants.basmallahLines,
      centeredAyahLines: QPC_V4.invariants.centeredAyahLines,
      words: QPC_V4.invariants.words,
      ayahs: QPC_V4.invariants.ayahs,
      markerWords: 0,
    });
    expect(report.twoCodePointWords).toBeGreaterThan(4000);
    // Known lines of the print.
    const fatihah = lineFromLayout(layout, 'qpc-v4', 1, 2);
    expect(fatihah.words.map((w) => w.id)).toEqual(['1:1:1', '1:1:2', '1:1:3', '1:1:4', '1:1:5']);
    expect(fatihah.words.at(-1)?.kind).toBe('end');
    expect(fatihah.centered).toBe(true);
    const p10l3 = lineFromLayout(layout, 'qpc-v4-tajweed', 10, 3);
    expect(p10l3.words[0]?.id).toBe('2:62:18');
    expect(p10l3.words.at(-1)?.id).toBe('2:63:2');
    expect(p10l3.words.length).toBeGreaterThan(5);
    // The resolvers read the same source (cached: no third fetch).
    const tawbah = await getMushafLines({surah: 9, fromAyah: 1, toAyah: 2, data: source});
    expect(tawbah[0]).toMatchObject({page: 187, line: 2});
    expect(lineAyahs(tawbah[0]!)).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 60_000);

  describe.skipIf(!hasNodeSqlite)('against the dev tools route', () => {
    let dir: string;
    beforeAll(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'mushaf-real-data-'));
    });
    afterAll(() => {
      rmSync(dir, {recursive: true, force: true});
    });

    it('is the same layout, to the byte, as node:zlib + node:sqlite + the scripts compiler produce', async () => {
      const wordsFile = path.join(dir, 'qpc-v4.json');
      const layoutFile = path.join(dir, 'layout.db');
      writeFileSync(wordsFile, unzipExport(readFileSync(files.words), ['.json']).data);
      writeFileSync(layoutFile, unzipExport(readFileSync(files.layout), ['.db', '.sqlite']).data);
      const words = await readWords(wordsFile);
      const pages = await readLayoutSqlite(layoutFile, words, QPC_V4);
      const js = compileLayoutJs(pages, QPC_V4, {source: 'x', generatedAt: 'x'});
      const ts = await loadLayout('qpc-v4', source);
      expect({...ts, source: 'x', generatedAt: 'x'}).toEqual(js);
    }, 120_000);
  });
});

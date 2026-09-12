import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {parsePageList, readSurvey} from '../lib/cli.mjs';
import {compareLayouts, haveMirror, layoutFromExports, mirrorFiles, stableDataRecord} from '../lib/data.mjs';
import {QPC_V4} from '../lib/datasets.mjs';

describe('parsePageList', () => {
  it('accepts lists, ranges and "all", sorted and clamped to the mushaf', () => {
    expect(parsePageList('1,10,604', 604)).toEqual([1, 10, 604]);
    expect(parsePageList('187-190,1', 604)).toEqual([1, 187, 188, 189, 190]);
    expect(parsePageList('600-700', 604)).toEqual([600, 601, 602, 603, 604]);
    expect(parsePageList('all', 3)).toEqual([1, 2, 3]);
    expect(parsePageList(undefined, 2)).toEqual([1, 2]);
    expect(() => parsePageList('ten', 604)).toThrow(/bad page list "ten"/);
  });
});

describe('stableDataRecord', () => {
  it('keeps the recorded download time when an export is byte-for-byte the same', () => {
    const then = {url: 'u', sha256: 'abc', bytes: 3, downloadedAt: '2026-01-01T00:00:00.000Z'};
    const now = {...then, downloadedAt: '2026-02-01T00:00:00.000Z'};
    const changed = {...now, sha256: 'def'};
    expect(stableDataRecord({words: now, layout: changed}, {words: then, layout: then})).toEqual({
      words: then,
      layout: changed,
    });
    expect(stableDataRecord({words: now}, {})).toEqual({words: now});
  });
});

describe('the mirror of the exports', () => {
  it.skipIf(!haveMirror(QPC_V4))('compiles, validates and matches what cdn-etags.json records', async () => {
    const layout = await layoutFromExports(QPC_V4);
    expect(layout.pages).toHaveLength(604);
    expect(compareLayouts(layout, layout)).toEqual([]);
    const recorded = readSurvey()?.data;
    if (recorded) {
      for (const part of ['words', 'layout']) {
        expect(recorded[part].url).toBe(QPC_V4.exports[part]);
        expect(fs.statSync(mirrorFiles(QPC_V4)[part]).size).toBe(recorded[part].bytes);
      }
    }
  });
});

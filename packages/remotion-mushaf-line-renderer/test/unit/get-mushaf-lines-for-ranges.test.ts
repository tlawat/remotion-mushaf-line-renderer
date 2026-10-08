import {beforeEach, describe, expect, it, vi} from 'vitest';
// @ts-expect-error — plain JS modules from scripts/ have no type declarations
import {compileLayout} from '../../../../scripts/lib/compile.mjs';
import type {CompiledLayout} from '../../src/data/format';
import type {MushafLineData, RecitationTimings} from '../../src/types';
import {syntheticLayout} from '../fixtures/synthetic-layout';

const loadMock = vi.fn();
vi.mock('../../src/data/load-layout', async () => {
  const actual = await vi.importActual<typeof import('../../src/data/load-layout')>('../../src/data/load-layout');
  return {...actual, loadLayout: (id: string, data?: unknown) => loadMock(id, data)};
});

const {getMushafLines, getMushafLinesForRanges} = await import('../../src/resolve/get-mushaf-lines');
const {recitedRanges} = await import('../../src/recitation/recitation-timings');
const {scheduleLines} = await import('../../src/recitation/schedule');

beforeEach(() => {
  loadMock.mockReset();
  loadMock.mockResolvedValue(syntheticLayout);
});

// The synthetic mushaf: 3 pages of 4 lines (word ids in brackets).
//   p1: surah_name(1) | 1:1 [1-3] | 1:2 [4-5]
//   p2: surah_name(2) | basmallah | 2:1 [6-9] | 2:2 (first three words) [10-12]
//   p3: 2:2 (rest) + 2:3 [13-16] | 2:3 + 2:4 [17-20] | surah_name(3) | 3:1 [21-24]
// Surah 2 ends mid-page 3 and surah 3 begins on the same page.
const where = (lines: readonly MushafLineData[]) => lines.map((l) => `p${l.page}l${l.line}`);

// A one-page mushaf the print never has: a line that carries the end of surah 1 and the start of
// surah 2, with no header between them.
//   p1: surah_name(1) | 1:1 [1-2] + 1:2 [3-4] + 2:1 [5-6] | 2:2 [7-8]
const W = (wordId: number, surah: number, ayah: number, position: number, kind: 'word' | 'end') => ({
  wordId,
  surah,
  ayah,
  position,
  kind,
  text: String.fromCodePoint(0xfc41 + wordId),
});
const sharedLineLayout: CompiledLayout = compileLayout(
  [
    {
      page: 1,
      lines: [
        {line: 1, type: 'surah_name', centered: true, surah: 1, words: []},
        {
          line: 2,
          type: 'ayah',
          centered: false,
          words: [
            W(1, 1, 1, 1, 'word'),
            W(2, 1, 1, 2, 'end'),
            W(3, 1, 2, 1, 'word'),
            W(4, 1, 2, 2, 'end'),
            W(5, 2, 1, 1, 'word'),
            W(6, 2, 1, 2, 'end'),
          ],
        },
        {line: 3, type: 'ayah', centered: true, words: [W(7, 2, 2, 1, 'word'), W(8, 2, 2, 2, 'end')]},
      ],
    },
  ],
  {dataset: 'shared-line', layoutId: 0, pages: 1, linesOnPage: () => 3},
  {source: 'synthetic', generatedAt: '2026-01-01T00:00:00.000Z'},
);

describe('getMushafLinesForRanges', () => {
  it('concatenates the ranges, with each later surah header between them', async () => {
    const lines = await getMushafLinesForRanges([
      {surah: 1, fromAyah: 1, toAyah: 2},
      {surah: 2, fromAyah: 1, toAyah: 4},
      {surah: 3, fromAyah: 1, toAyah: 1},
    ]);
    expect(where(lines)).toEqual(['p1l2', 'p1l3', 'p2l1', 'p2l2', 'p2l3', 'p2l4', 'p3l1', 'p3l2', 'p3l3', 'p3l4']);
    expect(lines.map((l) => l.type)).toEqual([
      'ayah',
      'ayah',
      'surah_name',
      'basmallah',
      'ayah',
      'ayah',
      'ayah',
      'ayah',
      'surah_name',
      'ayah',
    ]);
    expect(lines.filter((l) => l.type !== 'ayah').map((l) => l.surahNumber)).toEqual([2, 2, 3]);
    // Whole surahs cut nothing.
    expect(lines.every((l) => l.slice === undefined)).toBe(true);
  });

  it('takes the header from the page where the surah begins, as printed (no basmalah when there is none)', async () => {
    // Surah 2 ends on page 3 line 2; surah 3 starts on the same page, its header on line 3.
    const lines = await getMushafLinesForRanges([
      {surah: 2, fromAyah: 3, toAyah: 4},
      {surah: 3, fromAyah: 1, toAyah: 1},
    ]);
    expect(where(lines)).toEqual(['p3l1', 'p3l2', 'p3l3', 'p3l4']);
    expect(lines[2]).toMatchObject({type: 'surah_name', surahNumber: 3});
    // The first and last line of each range are sliced like getMushafLines({slice: true}).
    expect(lines.map((l) => l.slice)).toEqual([{fromAyah: 3, toAyah: 4}, undefined, undefined, undefined]);
    expect(lines[0]).toEqual((await getMushafLines({surah: 2, fromAyah: 3, toAyah: 4, slice: true}))[0]);
  });

  it('slices the ends of every range, and adds no header to a surah joined after its start', async () => {
    const lines = await getMushafLinesForRanges([
      {surah: 1, fromAyah: 1, toAyah: 1},
      {surah: 2, fromAyah: 2, toAyah: 3},
    ]);
    expect(where(lines)).toEqual(['p1l2', 'p2l4', 'p3l1', 'p3l2']);
    expect(lines.map((l) => l.slice)).toEqual([undefined, undefined, undefined, {fromAyah: 2, toAyah: 3}]);
    // The same lines, one range at a time.
    const one = await getMushafLines({surah: 1, fromAyah: 1, toAyah: 1, slice: true});
    const two = await getMushafLines({surah: 2, fromAyah: 2, toAyah: 3, slice: true});
    expect(lines).toEqual([...one, ...two]);
    expect(JSON.parse(JSON.stringify(lines))).toEqual(lines);
  });

  it('keeps a line two ranges of one surah share once, with the words of both', async () => {
    // p3l1 carries 2:2 (end of the first range) and 2:3 (start of the second).
    const lines = await getMushafLinesForRanges([
      {surah: 2, fromAyah: 2, toAyah: 2},
      {surah: 2, fromAyah: 3, toAyah: 3},
    ]);
    expect(where(lines)).toEqual(['p2l4', 'p3l1', 'p3l2']);
    // Between them the two ranges keep every word of p3l1: no slice. p3l2 is cut by the second alone.
    expect(lines.map((l) => l.slice)).toEqual([undefined, undefined, {fromAyah: 3, toAyah: 3}]);
    // Same surah: no header between the ranges.
    expect(lines.every((l) => l.type === 'ayah')).toBe(true);
  });

  it('merges the slices of a line that ends one surah and starts the next into one word band', async () => {
    loadMock.mockResolvedValue(sharedLineLayout);
    const lines = await getMushafLinesForRanges([
      {surah: 1, fromAyah: 2, toAyah: 2},
      {surah: 2, fromAyah: 1, toAyah: 2},
    ]);
    // No header line is printed before surah 2, so none is inserted; the shared line comes once.
    expect(where(lines)).toEqual(['p1l2', 'p1l3']);
    expect(lines.map((l) => l.slice)).toEqual([{fromWordId: 3, toWordId: 6}, undefined]);
    // Both ranges' ends on the line: still one band from the first kept word to the last.
    const end = await getMushafLinesForRanges([
      {surah: 1, fromAyah: 2, toAyah: 2},
      {surah: 2, fromAyah: 1, toAyah: 1},
    ]);
    expect(end).toHaveLength(1);
    expect(end[0]!.slice).toEqual({fromWordId: 3, toWordId: 6});
    // One range on a line that also carries another surah: a word band, since an ayah slice would
    // keep that surah's ayah of the same number too.
    const second = await getMushafLinesForRanges([{surah: 2, fromAyah: 1, toAyah: 1}]);
    expect(second[0]!.slice).toEqual({fromWordId: 5, toWordId: 6});
    // Ranges that keep every word of the shared line leave it whole.
    const whole = await getMushafLinesForRanges([
      {surah: 1, fromAyah: 1, toAyah: 2},
      {surah: 2, fromAyah: 1, toAyah: 1},
    ]);
    expect(whole[0]!.slice).toBeUndefined();
  });

  it('keeps every line whole with slice: false, and carries the theme on every line', async () => {
    const lines = await getMushafLinesForRanges(
      [
        {surah: 2, fromAyah: 3, toAyah: 4},
        {surah: 3, fromAyah: 1, toAyah: 1},
      ],
      {slice: false, theme: 'light'},
    );
    expect(where(lines)).toEqual(['p3l1', 'p3l2', 'p3l3', 'p3l4']);
    expect(lines.every((l) => l.slice === undefined && l.theme === 'light')).toBe(true);
    expect(lines[0]!.fontSet).toBe('qpc-v4-tajweed');
  });

  it('loads the data once, from the source given', async () => {
    const data = {layout: '/data/qpc-v4/layout.db.zip'};
    await getMushafLinesForRanges(
      [
        {surah: 1, fromAyah: 1, toAyah: 2},
        {surah: 2, fromAyah: 1, toAyah: 1},
      ],
      {data},
    );
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenLastCalledWith('qpc-v4', data);
  });

  it('gives no lines for no ranges, and is loud about bad ones', async () => {
    expect(await getMushafLinesForRanges([])).toEqual([]);
    expect(loadMock).not.toHaveBeenCalled();
    const rejects = (ranges: unknown, message: RegExp, code = 'AYAH_NOT_FOUND') =>
      expect(getMushafLinesForRanges(ranges as never)).rejects.toThrow(
        expect.objectContaining({code, message: expect.stringMatching(message)}),
      );
    await rejects({surah: 2}, /ranges must be an array/);
    await rejects([null], /ranges\[0\] must be \{surah, fromAyah, toAyah\}/);
    await rejects([{surah: 9, fromAyah: 1, toAyah: 1}], /no surah 9/);
    await rejects([{surah: 2, fromAyah: 3, toAyah: 2}], /toAyah \(2\) is before fromAyah \(3\)/);
    await rejects([{surah: 2, fromAyah: 9, toAyah: 9}], /ends at ayah 4/);
    // Reading order, no overlaps.
    await rejects(
      [
        {surah: 2, fromAyah: 1, toAyah: 1},
        {surah: 1, fromAyah: 1, toAyah: 2},
      ],
      /ranges\[1\] \(1:1-2\) does not start after ranges\[0\] \(2:1-1\)/,
    );
    await rejects(
      [
        {surah: 2, fromAyah: 1, toAyah: 2},
        {surah: 2, fromAyah: 2, toAyah: 3},
      ],
      /does not start after/,
    );
    await expect(
      getMushafLinesForRanges([{surah: 1, fromAyah: 1, toAyah: 1}], {slice: 'yes' as never}),
    ).rejects.toMatchObject({code: 'BAD_SLICE'});
  });
});

describe('scheduleLines across surahs', () => {
  it('schedules the lines of a version 2 recording through the surah header', async () => {
    // 1:2 and 2:2 share an ayah number: the lookup must go by surah and ayah.
    const timings: RecitationTimings = {
      version: 2,
      ayat: [
        {
          surah: 1,
          ayah: 2,
          start: 0,
          end: 2,
          words: [
            {id: '1:2:1', start: 0, end: 1},
            {id: '1:2:2', start: 1, end: 2},
          ],
        },
        {surah: 2, ayah: 1, start: 5, end: 9},
        {
          surah: 2,
          ayah: 2,
          start: 10,
          end: 15,
          words: [1, 2, 3, 4, 5].map((p) => ({id: `2:2:${p}`, start: 9 + p, end: 10 + p})),
        },
      ],
    };
    const lines = await getMushafLinesForRanges(recitedRanges(timings));
    expect(where(lines)).toEqual(['p1l3', 'p2l1', 'p2l2', 'p2l3', 'p2l4', 'p3l1']);
    expect(lines[5]!.slice).toEqual({fromAyah: 1, toAyah: 2});
    expect(scheduleLines(lines, timings)).toEqual([
      {index: 0, start: 0, end: 5}, // 1:2:1; the headers (1, 2) carry no timed word
      {index: 3, start: 5, end: 10}, // 2:1:1, interpolated: the ayah has no per-word times
      {index: 4, start: 10, end: 13}, // 2:2:1
      {index: 5, start: 13, end: 15}, // 2:2:4; the slice hides 2:3
    ]);
    // A version 1 file of surah 2 alone leaves surah 1's line out, as before.
    const {surah: _surah, ...ayah2} = timings.ayat[2]!;
    const v1: RecitationTimings = {version: 1, surah: 2, ayat: [ayah2]};
    expect(scheduleLines(lines, v1).map((s) => s.index)).toEqual([4, 5]);
  });

  it('schedules a line shared by two surahs from the first word it keeps', async () => {
    loadMock.mockResolvedValue(sharedLineLayout);
    const timings: RecitationTimings = {
      version: 2,
      ayat: [
        {surah: 1, ayah: 2, start: 0, end: 2, words: [{id: '1:2:1', start: 0.5, end: 2}]},
        {surah: 2, ayah: 1, start: 3, end: 5},
        {surah: 2, ayah: 2, start: 6, end: 8},
      ],
    };
    const lines = await getMushafLinesForRanges(recitedRanges(timings));
    expect(scheduleLines(lines, timings)).toEqual([
      {index: 0, start: 0.5, end: 6},
      {index: 1, start: 6, end: 8},
    ]);
  });
});

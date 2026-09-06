import {beforeEach, describe, expect, it, vi} from 'vitest';
import {syntheticLayout} from '../fixtures/synthetic-layout';

const loadMock = vi.fn();
vi.mock('../../src/data/load-layout', async () => {
  const actual = await vi.importActual<typeof import('../../src/data/load-layout')>('../../src/data/load-layout');
  return {...actual, loadLayout: (id: string) => loadMock(id)};
});

const {getMushafLines, getMushafLocation, lineAyahs} = await import('../../src/get-mushaf-lines');
const {MushafError} = await import('../../src/errors');

beforeEach(() => {
  loadMock.mockReset();
  loadMock.mockResolvedValue(syntheticLayout);
});

// The synthetic mushaf: 3 pages of 4 lines.
//   p1: surah_name(1) | 1:1 | 1:2
//   p2: surah_name(2) | basmallah | 2:1 | 2:2 (first three words)
//   p3: 2:2 (rest) + 2:3 | 2:3 + 2:4 | surah_name(3) | 3:1
const at = (page: number, line: number) => ({page, line});

describe('getMushafLines({page})', () => {
  it('returns every line of the page, header and basmallah lines included', async () => {
    const lines = await getMushafLines({page: 2});
    expect(lines.map((l) => l.type)).toEqual(['surah_name', 'basmallah', 'ayah', 'ayah']);
    expect(lines.map((l) => l.line)).toEqual([1, 2, 3, 4]);
    expect(lines.every((l) => l.mushaf === 'qpc-v4')).toBe(true);
    expect(lines[2]!.words.map((w) => w.id)).toEqual(['2:1:1', '2:1:2', '2:1:3', '2:1:4']);
    // Non-ayah lines carry no words; consumers filter on line.type.
    expect(lines[0]!.words).toEqual([]);
  });

  it('follows the tajweed flag and pins the font url of every line', async () => {
    const lines = await getMushafLines({page: 1, tajweed: true, fontUrl: (page, mushaf) => `/fonts/${mushaf}/p${page}.woff2`});
    expect(lines.every((l) => l.mushaf === 'qpc-v4-tajweed')).toBe(true);
    expect(lines[0]!.fontFamily).toBe('mushaf-qpc-v4-tajweed-p1');
    expect(lines[0]!.fontUrl).toBe('/fonts/qpc-v4-tajweed/p1.woff2');
  });

  it('rejects a page outside the mushaf, and one the data does not reach', async () => {
    await expect(getMushafLines({page: 605})).rejects.toMatchObject({code: 'PAGE_OUT_OF_RANGE'});
    await expect(getMushafLines({page: 4})).rejects.toMatchObject({code: 'DATA_LOAD_FAILED'});
  });
});

describe('getMushafLines({surah, fromAyah, toAyah})', () => {
  it('finds the lines carrying an ayah range without being told the page', async () => {
    const lines = await getMushafLines({surah: 2, fromAyah: 2, toAyah: 3});
    expect(lines.map((l) => at(l.page, l.line))).toEqual([at(2, 4), at(3, 1), at(3, 2)]);
    // The first and last lines carry neighbouring ayahs too, exactly as the mushaf prints them.
    expect(lines.map(lineAyahs)).toEqual([[2], [2, 3], [3, 4]]);
  });

  it('defaults to the whole surah and stops at its end', async () => {
    const lines = await getMushafLines({surah: 2});
    expect(lines.map((l) => at(l.page, l.line))).toEqual([at(2, 3), at(2, 4), at(3, 1), at(3, 2)]);
    const last = await getMushafLines({surah: 3});
    expect(last.map((l) => at(l.page, l.line))).toEqual([at(3, 4)]);
  });

  it('skips surah_name and basmallah lines inside the range', async () => {
    const lines = await getMushafLines({surah: 1});
    expect(lines.map((l) => l.type)).toEqual(['ayah', 'ayah']);
    expect(lines.map((l) => at(l.page, l.line))).toEqual([at(1, 2), at(1, 3)]);
  });

  it('is loud about ayahs and surahs that do not exist', async () => {
    await expect(getMushafLines({surah: 2, fromAyah: 9})).rejects.toMatchObject({code: 'AYAH_NOT_FOUND'});
    await expect(getMushafLines({surah: 2, fromAyah: 9})).rejects.toThrow(/ends at ayah 4/);
    await expect(getMushafLines({surah: 9})).rejects.toThrow(/no surah 9/);
    await expect(getMushafLines({surah: 2, fromAyah: 3, toAyah: 2})).rejects.toThrow(/toAyah \(2\) is before fromAyah \(3\)/);
    await expect(getMushafLines({surah: 0})).rejects.toThrow(/surah must be an integer from 1 to 114/);
  });
});

describe('getMushafLocation', () => {
  it('locates the start of a surah and of a single ayah', async () => {
    expect(await getMushafLocation({surah: 1})).toEqual(at(1, 2));
    expect(await getMushafLocation({surah: 2})).toEqual(at(2, 3));
    expect(await getMushafLocation({surah: 2, ayah: 3})).toEqual(at(3, 1));
    expect(await getMushafLocation({surah: 3})).toEqual(at(3, 4));
  });

  it('throws AYAH_NOT_FOUND for an ayah past the end of the surah', async () => {
    await expect(getMushafLocation({surah: 1, ayah: 3})).rejects.toBeInstanceOf(MushafError);
  });
});

describe('lineAyahs', () => {
  it('lists the ayahs a line carries, ascending, with no duplicates', async () => {
    const [first] = await getMushafLines({page: 3});
    expect(lineAyahs(first!)).toEqual([2, 3]);
    const header = (await getMushafLines({page: 1}))[0]!;
    expect(lineAyahs(header)).toEqual([]);
  });
});

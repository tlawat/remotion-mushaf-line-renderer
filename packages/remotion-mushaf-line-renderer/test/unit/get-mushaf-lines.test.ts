import {beforeEach, describe, expect, it, vi} from 'vitest';
import {syntheticLayout} from '../fixtures/synthetic-layout';

const loadMock = vi.fn();
vi.mock('../../src/data/load-layout', async () => {
  const actual = await vi.importActual<typeof import('../../src/data/load-layout')>('../../src/data/load-layout');
  return {...actual, loadLayout: (id: string, data?: unknown) => loadMock(id, data)};
});

const {getMushafLines, getMushafLocation, lineAyahs} = await import('../../src/resolve/get-mushaf-lines');
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

  it('follows the look and pins the font url of every line', async () => {
    const lines = await getMushafLines({
      page: 1,
      look: 'tajweed',
      fontUrl: (page, fontSet) => `/fonts/${fontSet}/p${page}.woff2`,
    });
    expect(lines.every((l) => l.mushaf === 'qpc-v4' && l.look === 'tajweed' && l.fontSet === 'qpc-v4-tajweed')).toBe(
      true,
    );
    expect(lines[0]!.fontFamily).toBe('mushaf-qpc-v4-tajweed-p1');
    expect(lines[0]!.fontUrl).toBe('/fonts/qpc-v4-tajweed/p1.woff2');
  });

  it('carries the mandala look and colours on every line, alongside the pinned font url', async () => {
    const lines = await getMushafLines({
      page: 1,
      look: 'mandala',
      colors: {accent: '#c8a45c'},
      fontUrl: (page, fontSet) => `/fonts/${fontSet}/p${page}.woff2`,
    });
    expect(lines.every((l) => l.look === 'mandala' && l.fontSet === 'qpc-v4-tajweed')).toBe(true);
    expect(lines.every((l) => l.colors?.accent === '#c8a45c' && l.colors.ink === 'currentColor')).toBe(true);
    expect(lines[0]!.fontUrl).toBe('/fonts/qpc-v4-tajweed/p1.woff2');
    // The ayah-range form resolves the same way.
    const range = await getMushafLines({surah: 2, fromAyah: 2, toAyah: 3, look: 'mandala'});
    expect(range.every((l) => l.look === 'mandala')).toBe(true);
    expect((await getMushafLines({page: 1})).every((l) => l.look === 'plain' && l.colors === undefined)).toBe(true);
  });

  it('records the range with slice: true on the lines it cuts only, and leaves the words whole', async () => {
    const plain = await getMushafLines({surah: 2, fromAyah: 2, toAyah: 3});
    const sliced = await getMushafLines({surah: 2, fromAyah: 2, toAyah: 3, slice: true});
    // p2l4 carries [2] and p3l1 [2, 3]: the range keeps every word, so they carry no slice and
    // render as printed. p3l2 carries [3, 4]: cut, so it carries the range.
    expect(sliced.map(lineAyahs)).toEqual([[2], [2, 3], [3, 4]]);
    expect(sliced.map((l) => l.slice)).toEqual([undefined, undefined, {fromAyah: 2, toAyah: 3}]);
    expect(sliced.map((l) => l.words)).toEqual(plain.map((l) => l.words));
    expect(JSON.parse(JSON.stringify(sliced))).toEqual(sliced);
    expect(Object.keys(sliced[0]!)).not.toContain('slice');
    // The whole surah cuts nothing anywhere...
    expect((await getMushafLines({surah: 2, slice: true})).every((l) => l.slice === undefined)).toBe(true);
    // ... and a default is recorded as the concrete number it resolved to.
    const tail = await getMushafLines({surah: 2, fromAyah: 3, slice: true});
    expect(tail.map((l) => l.slice)).toEqual([{fromAyah: 3, toAyah: 4}, undefined]);
    expect(plain.every((l) => l.slice === undefined)).toBe(true);
    await expect(getMushafLines({surah: 2, slice: 'yes' as never})).rejects.toMatchObject({code: 'BAD_SLICE'});
  });

  it('hands one data source to every load, the ayah form included', async () => {
    const data = {layout: '/data/qpc-v4/layout.db.zip'};
    await getMushafLines({page: 2, data});
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenLastCalledWith('qpc-v4', data);
    loadMock.mockClear();
    // The ayah form locates the first ayah on the layout it loaded: one load, from the same source.
    await getMushafLines({surah: 2, fromAyah: 2, toAyah: 3, data});
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenLastCalledWith('qpc-v4', data);
    loadMock.mockClear();
    await getMushafLocation({surah: 2, data});
    expect(loadMock).toHaveBeenLastCalledWith('qpc-v4', data);
    loadMock.mockClear();
    await getMushafLines({surah: 3});
    for (const call of loadMock.mock.calls) expect(call).toEqual(['qpc-v4', undefined]);
  });

  it('rejects a page outside the mushaf, and one the data does not reach', async () => {
    await expect(getMushafLines({page: 605})).rejects.toMatchObject({code: 'PAGE_OUT_OF_RANGE'});
    await expect(getMushafLines({page: 4})).rejects.toMatchObject({code: 'DATA_LOAD_FAILED'});
    // A page has no ayah range to slice to.
    await expect(getMushafLines({page: 1, slice: true} as never)).rejects.toMatchObject({code: 'BAD_SLICE'});
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
    await expect(getMushafLines({surah: 2, fromAyah: 3, toAyah: 2})).rejects.toThrow(
      /toAyah \(2\) is before fromAyah \(3\)/,
    );
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

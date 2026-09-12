import {beforeEach, describe, expect, it, vi} from 'vitest';
import {syntheticLayout} from '../fixtures/synthetic-layout';

const loadMock = vi.fn();
vi.mock('../../src/data/load-layout', async () => {
  const actual = await vi.importActual<typeof import('../../src/data/load-layout')>('../../src/data/load-layout');
  return {...actual, loadLayout: (id: string, data?: unknown) => loadMock(id, data)};
});

const {getMushafLine} = await import('../../src/resolve/get-mushaf-line');
const {MushafError} = await import('../../src/errors');
const {assertLineData} = await import('../../src/resolve/validate-line-data');

const cp = (n: number) => String.fromCodePoint(0xfc41 + n);

beforeEach(() => {
  loadMock.mockReset();
  loadMock.mockResolvedValue(syntheticLayout);
});

describe('getMushafLine', () => {
  it('returns page 1 line 2 as 1:1:1..1:1:3 ending with the ayah marker, centered', async () => {
    const line = await getMushafLine({mushaf: 'qpc-v4', page: 1, line: 2});
    expect(line).toEqual({
      version: 3,
      mushaf: 'qpc-v4',
      theme: 'plain',
      fontSet: 'qpc-v4',
      page: 1,
      line: 2,
      type: 'ayah',
      centered: true,
      fontFamily: 'mushaf-qpc-v4-p1',
      words: [
        {id: '1:1:1', wordId: 1, surah: 1, ayah: 1, position: 1, kind: 'word', text: cp(0)},
        {id: '1:1:2', wordId: 2, surah: 1, ayah: 1, position: 2, kind: 'word', text: cp(1)},
        {id: '1:1:3', wordId: 3, surah: 1, ayah: 1, position: 3, kind: 'end', text: cp(2)},
      ],
    });
    expect(Object.keys(line)).not.toContain('surahNumber');
  });

  it('reconstructs positions across a page break, two-code-point words and marker kinds', async () => {
    const line = await getMushafLine({theme: 'light', page: 3, line: 1});
    expect(line.fontFamily).toBe('mushaf-qpc-v4-tajweed-p3');
    expect(line.centered).toBe(false);
    // The rub-el-hizb marker shares the location of the word it precedes (so `id` is not unique; `wordId` is).
    expect(line.words.map((w) => w.id)).toEqual(['2:2:4', '2:2:5', '2:3:1', '2:3:1']);
    expect(line.words.map((w) => w.wordId)).toEqual([13, 14, 15, 16]);
    expect(line.words.map((w) => w.kind)).toEqual(['word', 'end', 'rub-el-hizb', 'word']);
    expect(line.words[3]?.text).toBe(cp(3) + cp(4));
    expect(Array.from(line.words[3]?.text ?? '')).toHaveLength(2);
  });

  it('records the theme in the data: a preset by name, and the font set it needs', async () => {
    const plain = await getMushafLine({page: 1, line: 2});
    expect(plain).toMatchObject({mushaf: 'qpc-v4', theme: 'plain', fontSet: 'qpc-v4'});

    const light = await getMushafLine({page: 1, line: 2, theme: 'light'});
    expect(light).toMatchObject({
      mushaf: 'qpc-v4',
      theme: 'light',
      fontSet: 'qpc-v4-tajweed',
      fontFamily: 'mushaf-qpc-v4-tajweed-p1',
    });

    // A preset stays a name: the data stays small and the preset's colours are the package's.
    const normal = await getMushafLine({page: 1, line: 2, theme: 'normal'});
    expect(normal).toMatchObject({theme: 'normal', fontSet: 'qpc-v4-tajweed', fontFamily: 'mushaf-qpc-v4-tajweed-p1'});
    expect(assertLineData(normal)).toBe(normal);
    expect(await getMushafLine({page: 1, line: 2, theme: 'p4'})).toMatchObject({
      theme: 'p4',
      fontSet: 'qpc-v4-tajweed',
    });
  });

  it('records a custom theme resolved down to entries, and stays plain JSON', async () => {
    const gold = await getMushafLine({
      page: 1,
      line: 2,
      theme: {base: 'normal', colors: {accent: '#c8a45c', detail: '#1b6f3f', background: 'transparent'}},
    });
    expect(gold.theme).toMatchObject({
      base: 3,
      colors: {0: 'currentColor', 13: 'currentColor', 10: '#1b6f3f', 11: '#c8a45c', 12: 'transparent'},
    });
    expect(JSON.parse(JSON.stringify(gold))).toEqual(gold);
    expect(assertLineData(gold)).toBe(gold);
    // An explicit ink colour replaces the preset's, rather than being layered on it.
    const green = await getMushafLine({page: 1, line: 2, theme: {base: 'normal', colors: {ink: 'rgb(27 111 63)'}}});
    expect((green.theme as {colors: Record<string, string>}).colors).toMatchObject({
      0: 'rgb(27 111 63)',
      14: 'rgb(27 111 63)',
      1: 'currentColor',
    });
    // A bare base records only the base; a preset's marker rides along.
    expect((await getMushafLine({page: 1, line: 2, theme: {base: 4}})).theme).toEqual({base: 4});
    expect((await getMushafLine({page: 1, line: 2, theme: 'black'})).theme).toBe('black');
    expect((await getMushafLine({page: 1, line: 2, theme: {base: 'black'}})).theme).toMatchObject({
      base: 5,
      marker: {13: '#000000'},
    });
    await expect(
      getMushafLine({page: 1, line: 2, theme: {base: 3, colors: {ink: 'not a colour'}}}),
    ).rejects.toMatchObject({code: 'BAD_COLOR'});
    await expect(getMushafLine({page: 1, line: 2, theme: 'neon' as never})).rejects.toMatchObject({code: 'BAD_THEME'});
    await expect(getMushafLine({page: 1, line: 2, theme: {base: 6}})).rejects.toMatchObject({code: 'BAD_THEME'});
  });

  it('types header and basmallah lines with no words and the surah number', async () => {
    const header = await getMushafLine({mushaf: 'qpc-v4', page: 2, line: 1});
    expect(header).toMatchObject({type: 'surah_name', centered: true, surahNumber: 2, words: []});
    const basmallah = await getMushafLine({mushaf: 'qpc-v4', page: 2, line: 2});
    expect(basmallah).toMatchObject({type: 'basmallah', centered: true, surahNumber: 2, words: []});
  });

  it('produces plain JSON with no undefined values', async () => {
    const line = await getMushafLine({mushaf: 'qpc-v4', page: 3, line: 2});
    expect(JSON.parse(JSON.stringify(line))).toEqual(line);
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object')
        Object.values(v as Record<string, unknown>).forEach((x) => {
          expect(x).not.toBeUndefined();
          walk(x);
        });
    };
    walk(line);
    expect(assertLineData(line)).toBe(line);
  });

  it('rejects unknown mushafs, pages and lines with named values', async () => {
    await expect(getMushafLine({mushaf: 'qpc-v9' as never, page: 1, line: 1})).rejects.toMatchObject({
      code: 'UNKNOWN_MUSHAF',
      message: 'Unknown mushaf "qpc-v9". Known mushafs: qpc-v4.',
    });
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 0, line: 1})).rejects.toMatchObject({
      code: 'PAGE_OUT_OF_RANGE',
      message: 'page must be an integer from 1 to 604 for "qpc-v4", got 0.',
    });
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 605, line: 1})).rejects.toMatchObject({
      code: 'PAGE_OUT_OF_RANGE',
    });
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 1.5, line: 1})).rejects.toMatchObject({
      code: 'PAGE_OUT_OF_RANGE',
    });
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 1, line: 9})).rejects.toMatchObject({
      code: 'LINE_OUT_OF_RANGE',
      message: 'line must be an integer from 1 to 8 on page 1 of "qpc-v4" (this page has 8 lines), got 9.',
    });
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 3, line: 16})).rejects.toMatchObject({
      code: 'LINE_OUT_OF_RANGE',
    });
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('surfaces data loading failures as DATA_LOAD_FAILED', async () => {
    loadMock.mockRejectedValue(new MushafError('DATA_LOAD_FAILED', 'Could not load layout data for "qpc-v4": boom'));
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 1, line: 1})).rejects.toMatchObject({code: 'DATA_LOAD_FAILED'});
  });

  it('hands the data source to the loader, and nothing when none is given', async () => {
    await getMushafLine({page: 1, line: 2});
    expect(loadMock).toHaveBeenLastCalledWith('qpc-v4', undefined);
    const data = {words: '/data/qpc-v4/words.json.zip', layout: 'https://mirror.example/layout.db.zip'};
    // The colour font shares the dataset, so the same source serves every theme.
    const line = await getMushafLine({page: 1, line: 2, theme: 'light', data});
    expect(loadMock).toHaveBeenLastCalledWith('qpc-v4', data);
    // The source is where the data came from, not part of the line: the JSON stays the same.
    expect(Object.keys(line)).not.toContain('data');
  });
});

describe('assertLineData', () => {
  it('rejects tampered or foreign data field by field', async () => {
    const good = await getMushafLine({mushaf: 'qpc-v4', page: 1, line: 2});
    const bad = (patch: Record<string, unknown>) => () => assertLineData({...good, ...patch});
    expect(bad({version: 2})).toThrow(
      /version is 2 but this version of remotion-mushaf-line-renderer understands version 3/,
    );
    expect(bad({mushaf: 'other'})).toThrow(MushafError);
    expect(bad({mushaf: 'qpc-v4-tajweed'})).toThrow(/Unknown mushaf "qpc-v4-tajweed"/);
    expect(bad({theme: 'neon'})).toThrow(/theme must be 'plain', a preset/);
    expect(bad({theme: undefined})).toThrow(/theme is invalid: expected 'plain', a preset name or a theme object/);
    expect(bad({fontSet: 'qpc-v4-tajweed'})).toThrow(/fontSet is invalid: expected "qpc-v4" for this theme/);
    expect(bad({page: 700})).toThrow(/page must be an integer/);
    expect(bad({fontFamily: 'Arial'})).toThrow(/fontFamily is invalid: expected "mushaf-qpc-v4-p1"/);
    expect(bad({type: 'header'})).toThrow(/type is invalid/);
    expect(bad({words: [{...good.words[0], text: 'abcde'}]})).toThrow(
      /words\[0\].text is invalid: expected 1–4 code points/,
    );
    expect(bad({words: [good.words[1], good.words[0]]})).toThrow(/ordered by wordId/);
    expect(bad({fontUrl: ''})).toThrow(/fontUrl/);
    // A theme is checked like a selection: base palettes the font has, entries it has, real colours.
    const colour = await getMushafLine({page: 1, line: 2, theme: 'normal'});
    expect(() => assertLineData({...colour, theme: {base: 9}})).toThrow(
      /theme.base must be a CPAL palette of the font \(0, 1, 2, 3, 4, 5\)/,
    );
    expect(() => assertLineData({...colour, theme: {base: '3'}})).toThrow(/theme.base must be/);
    expect(() => assertLineData({...colour, theme: {base: 3, colors: {16: 'red'}}})).toThrow(
      /theme.colors.16 is neither a part/,
    );
    expect(assertLineData({...colour, theme: {base: 0}})).toBeTruthy();
    expect(assertLineData({...colour, theme: {base: 'light', colors: {rules: 'currentColor'}}})).toBeTruthy();
    // The colours are written into a stylesheet, so they are checked here too.
    expect(() => assertLineData({...colour, theme: {base: 3, colors: {ink: 'red; } body {display:none}'}}})).toThrow(
      /theme.colors.ink must be a CSS colour/,
    );
    expect(() => assertLineData({...colour, theme: {base: 3, colors: {glow: 'red'}}})).toThrow(/is neither a part/);
    // The font set must be the theme's.
    expect(() => assertLineData({...colour, theme: 'plain'})).toThrow(
      /fontSet is invalid: expected "qpc-v4" for this theme/,
    );
    // A recorded slice is checked like the prop.
    expect(bad({slice: {ayah: 0}})).toThrow(/MushafLineData.slice.ayah must be a positive integer/);
    expect(bad({slice: {fromAyah: 3, toAyah: 1}})).toThrow(/toAyah \(1\) is before fromAyah \(3\)/);
    expect(assertLineData({...good, slice: {ayah: 1}})).toBeTruthy();
    expect(() => assertLineData('nope')).toThrow(/must be the object returned by getMushafLine/);
    expect(assertLineData({...good, fontUrl: 'https://cdn.example/p1.woff2'})).toBeTruthy();
  });
});

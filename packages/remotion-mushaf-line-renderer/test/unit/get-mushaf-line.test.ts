import {beforeEach, describe, expect, it, vi} from 'vitest';
import {syntheticLayout} from '../fixtures/synthetic-layout';

const loadMock = vi.fn();
vi.mock('../../src/data/load-layout', async () => {
  const actual = await vi.importActual<typeof import('../../src/data/load-layout')>('../../src/data/load-layout');
  return {...actual, loadLayout: (id: string) => loadMock(id)};
});

const {getMushafLine} = await import('../../src/get-mushaf-line');
const {MushafError} = await import('../../src/errors');
const {assertLineData} = await import('../../src/validate-line-data');

const cp = (n: number) => String.fromCodePoint(0xfc41 + n);

beforeEach(() => {
  loadMock.mockReset();
  loadMock.mockResolvedValue(syntheticLayout);
});

describe('getMushafLine', () => {
  it('returns page 1 line 2 as 1:1:1..1:1:3 ending with the ayah marker, centered', async () => {
    const line = await getMushafLine({mushaf: 'qpc-v4', page: 1, line: 2});
    expect(line).toEqual({
      version: 1,
      mushaf: 'qpc-v4',
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
    const line = await getMushafLine({mushaf: 'qpc-v4-tajweed', page: 3, line: 1});
    expect(line.fontFamily).toBe('mushaf-qpc-v4-tajweed-p3');
    expect(line.centered).toBe(false);
    // The rub-el-hizb marker shares the location of the word it precedes (so `id` is not unique; `wordId` is).
    expect(line.words.map((w) => w.id)).toEqual(['2:2:4', '2:2:5', '2:3:1', '2:3:1']);
    expect(line.words.map((w) => w.wordId)).toEqual([13, 14, 15, 16]);
    expect(line.words.map((w) => w.kind)).toEqual(['word', 'end', 'rub-el-hizb', 'word']);
    expect(line.words[3]?.text).toBe(cp(3) + cp(4));
    expect(Array.from(line.words[3]?.text ?? '')).toHaveLength(2);
  });

  it('records the colour choice in the data: the font set, and the palette for mandala', async () => {
    const plain = await getMushafLine({page: 1, line: 2});
    expect(plain.mushaf).toBe('qpc-v4');
    expect(Object.keys(plain)).not.toContain('palette');

    const tajweed = await getMushafLine({page: 1, line: 2, tajweed: true});
    expect(tajweed.mushaf).toBe('qpc-v4-tajweed');
    // No palette: the colour font paints its own default (palette 0, the tajweed colours).
    expect(Object.keys(tajweed)).not.toContain('palette');

    // Mandala is the same colour font at palette 3, with the letters following CSS `color`.
    const mandala = await getMushafLine({page: 1, line: 2, mandala: true});
    expect(mandala.mushaf).toBe('qpc-v4-tajweed');
    expect(mandala.palette).toBe(3);
    expect(mandala.paletteColors).toEqual({text: 'currentColor'});
    expect(mandala.fontFamily).toBe('mushaf-qpc-v4-tajweed-p1');
    expect(assertLineData(mandala)).toBe(mandala);
    // Tajweed wins when both are given.
    expect(await getMushafLine({page: 1, line: 2, tajweed: true, mandala: true})).toEqual(tajweed);
  });

  it('records the mandala colours asked for, and stays plain JSON', async () => {
    const gold = await getMushafLine({page: 1, line: 2, mandala: {accent: '#c8a45c', background: 'transparent'}});
    expect(gold.paletteColors).toEqual({text: 'currentColor', accent: '#c8a45c', background: 'transparent'});
    expect(JSON.parse(JSON.stringify(gold))).toEqual(gold);
    // An explicit text colour replaces the default, rather than being layered on it.
    const green = await getMushafLine({page: 1, line: 2, mandala: {text: 'rgb(27 111 63)'}});
    expect(green.paletteColors).toEqual({text: 'rgb(27 111 63)'});
    await expect(getMushafLine({page: 1, line: 2, mandala: {text: 'not a colour'}})).rejects.toMatchObject({code: 'BAD_COLOR'});
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
      else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach((x) => {
        expect(x).not.toBeUndefined();
        walk(x);
      });
    };
    walk(line);
    expect(assertLineData(line)).toBe(line);
  });

  it('rejects unknown mushafs, pages and lines with named values', async () => {
    await expect(getMushafLine({mushaf: 'qpc-v9' as never, page: 1, line: 1})).rejects.toMatchObject({code: 'UNKNOWN_MUSHAF', message: 'Unknown mushaf "qpc-v9". Known mushafs: qpc-v4, qpc-v4-tajweed.'});
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 0, line: 1})).rejects.toMatchObject({code: 'PAGE_OUT_OF_RANGE', message: 'page must be an integer from 1 to 604 for "qpc-v4", got 0.'});
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 605, line: 1})).rejects.toMatchObject({code: 'PAGE_OUT_OF_RANGE'});
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 1.5, line: 1})).rejects.toMatchObject({code: 'PAGE_OUT_OF_RANGE'});
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 1, line: 9})).rejects.toMatchObject({code: 'LINE_OUT_OF_RANGE', message: 'line must be an integer from 1 to 8 on page 1 of "qpc-v4" (this page has 8 lines), got 9.'});
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 3, line: 16})).rejects.toMatchObject({code: 'LINE_OUT_OF_RANGE'});
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('surfaces data loading failures as DATA_LOAD_FAILED', async () => {
    loadMock.mockRejectedValue(new MushafError('DATA_LOAD_FAILED', 'Could not load layout data for "qpc-v4": boom'));
    await expect(getMushafLine({mushaf: 'qpc-v4', page: 1, line: 1})).rejects.toMatchObject({code: 'DATA_LOAD_FAILED'});
  });
});

describe('assertLineData', () => {
  it('rejects tampered or foreign data field by field', async () => {
    const good = await getMushafLine({mushaf: 'qpc-v4', page: 1, line: 2});
    const bad = (patch: Record<string, unknown>) => () => assertLineData({...good, ...patch});
    expect(bad({version: 2})).toThrow(/version is 2/);
    expect(bad({mushaf: 'other'})).toThrow(MushafError);
    expect(bad({page: 700})).toThrow(/page must be an integer/);
    expect(bad({fontFamily: 'Arial'})).toThrow(/fontFamily is invalid: expected "mushaf-qpc-v4-p1"/);
    expect(bad({type: 'header'})).toThrow(/type is invalid/);
    expect(bad({words: [{...good.words[0], text: 'abcde'}]})).toThrow(/words\[0\].text is invalid: expected 1–4 code points/);
    expect(bad({words: [good.words[1], good.words[0]]})).toThrow(/ordered by wordId/);
    expect(bad({fontUrl: ''})).toThrow(/fontUrl/);
    // A palette only means something for the colour font, and only the ones it actually carries.
    expect(bad({palette: 3})).toThrow(/"qpc-v4" is a monochrome font set and has no palettes/);
    expect(bad({paletteColors: {text: 'red'}})).toThrow(/"qpc-v4" is a monochrome font set and has no palettes/);
    const colour = await getMushafLine({page: 1, line: 2, mandala: true});
    expect(() => assertLineData({...colour, palette: 9})).toThrow(/palette is invalid: expected one of 0, 1, 2, 3, 4, 5/);
    expect(() => assertLineData({...colour, palette: '3'})).toThrow(/palette is invalid/);
    expect(assertLineData({...colour, palette: 0})).toBeTruthy();
    // The colours are written into a stylesheet, so they are checked here too.
    expect(() => assertLineData({...colour, paletteColors: {text: 'red; } body {display:none}'}})).toThrow(/paletteColors.text must be a CSS colour/);
    expect(() => assertLineData({...colour, paletteColors: {glow: 'red'}})).toThrow(/is not a colourable part/);
    expect(assertLineData({...colour, paletteColors: {accent: '#c8a45c'}})).toBeTruthy();
    expect(() => assertLineData('nope')).toThrow(/must be the object returned by getMushafLine/);
    expect(assertLineData({...good, fontUrl: 'https://cdn.example/p1.woff2'})).toBeTruthy();
  });
});

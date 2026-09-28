import {existsSync, readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
// @ts-expect-error — plain JS module from scripts/
import {QPC_V4} from '../../../../scripts/lib/datasets.mjs';
// @ts-expect-error — plain JS module from scripts/
import {checkSharedFont} from '../../../../scripts/lib/fonts.mjs';
// @ts-expect-error — plain JS module from scripts/
import {parseSfnt} from '../../../../scripts/lib/sfnt.mjs';
import {
  assertJuzNumber,
  assertLine,
  assertPage,
  assertSurahNumber,
  DATASETS,
  fontSetById,
  getDataset,
  getMushafDefinition,
  getSharedFont,
  isMushafId,
  MUSHAF_IDS,
  MUSHAFS,
  resolveSelection,
} from '../../src/mushaf/registry';

const v4 = MUSHAFS['qpc-v4'];

describe('mushaf registry', () => {
  it('agrees with the compiler dataset descriptor', () => {
    expect(MUSHAF_IDS).toEqual(['qpc-v4']);
    expect(v4.pages).toBe(QPC_V4.pages);
    expect(v4.layoutId).toBe(QPC_V4.layoutId);
    expect(v4.dataset).toBe(QPC_V4.dataset);
    for (const p of [1, 2, 3, 187, 604]) expect(v4.linesOnPage(p)).toBe(QPC_V4.linesOnPage(p));
    // The lines are built from one dataset, whose export URLs the scripts pin too.
    const dataset = getDataset(v4.dataset);
    expect(dataset).toBe(DATASETS['qpc-v4']);
    expect(dataset).toMatchObject({id: QPC_V4.dataset, layoutId: QPC_V4.layoutId, pages: QPC_V4.pages});
    expect(dataset.urls).toEqual(QPC_V4.exports);
    expect(dataset.centeredPages).toEqual(QPC_V4.centeredPages);
    expect(dataset.centeredPages).toEqual([1, 2]);
    for (const url of Object.values(dataset.urls))
      expect(url).toMatch(
        /^https:\/\/s3\.us-east-1\.wasabisys\.com\/static-cdn\.tarteel\.ai\/qul-exports\/[a-z-]+\/\d+-[a-z0-9]+-[a-z0-9-]+\.(json|db)\.zip$/,
      );
    expect(v4.invariants).toEqual({
      lines: QPC_V4.invariants.lines,
      ayahLines: QPC_V4.invariants.ayahLines,
      surahNameLines: QPC_V4.invariants.surahNameLines,
      basmallahLines: QPC_V4.invariants.basmallahLines,
      centeredAyahLines: QPC_V4.invariants.centeredAyahLines,
      words: QPC_V4.invariants.words,
    });
    for (const set of [v4.fontSets.plain, v4.fontSets.color])
      expect(set.cdnUrl(10)).toBe(QPC_V4.fontUrl(set.id, 10, 'woff2'));
  });

  it('names fonts per page and set', () => {
    expect(v4.fontSets.plain.id).toBe('qpc-v4');
    expect(v4.fontSets.color.id).toBe('qpc-v4-tajweed');
    expect(v4.fontSets.plain.fontFamily(10)).toBe('mushaf-qpc-v4-p10');
    expect(v4.fontSets.color.fontFamily(604)).toBe('mushaf-qpc-v4-tajweed-p604');
    expect(v4.fontSets.plain.cdnUrl(10)).toBe('https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2');
    expect(v4.fontSets.color.cdnUrl(10)).toBe(
      'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/woff2/p10.woff2?v=3.1',
    );
    expect(v4.fontSets.plain.colr).toBe(false);
    expect(v4.fontSets.color.colr).toBe(true);
    expect(v4.fontSets.plain.palettes).toEqual([]);
    expect(v4.fontSets.color.palettes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fontSetById(v4, 'qpc-v4-tajweed')).toBe(v4.fontSets.color);
    expect(fontSetById(v4, 'other')).toBeUndefined();
  });

  it('resolves the theme into a font set and a palette', () => {
    // Nothing said: the V4 mushaf, plain glyphs, no palette to write.
    expect(resolveSelection({})).toEqual({def: v4, fontSet: v4.fontSets.plain, theme: null});
    expect(resolveSelection({mushaf: 'qpc-v4', theme: 'plain'})).toEqual({
      def: v4,
      fontSet: v4.fontSets.plain,
      theme: null,
    });
    // Any theme: the colour font, with the theme resolved.
    const light = resolveSelection({theme: 'light'});
    expect(light.fontSet).toBe(v4.fontSets.color);
    expect(light.theme).toMatchObject({name: 'light', base: 0});
    const custom = resolveSelection({theme: {base: 'normal', colors: {accent: '#c8a45c'}}});
    expect(custom.fontSet).toBe(v4.fontSets.color);
    expect(custom.theme?.base).toBe(3);
    expect(custom.theme?.name).toBeUndefined();
    expect(() => resolveSelection({theme: 'tajweed' as never})).toThrow(/theme must be 'plain', a preset/);
  });

  it('knows which CPAL entries paint which part of the colour font', () => {
    // Read from the font's CPAL table, the COLR layer counts and QUL's own palette rules.
    expect(v4.fontSets.color.colorParts).toEqual({
      ink: [0, 14],
      silent: [1, 2, 15],
      rules: [3, 4, 5, 6, 7, 8, 9],
      frame: [13],
      accent: [11],
      detail: [10],
      background: [12],
    });
    const all = Object.values(v4.fontSets.color.colorParts).flat();
    expect(new Set(all).size).toBe(16);
    expect(v4.fontSets.color.entries).toBe(16);
    expect(Object.values(v4.fontSets.plain.colorParts).flat()).toEqual([]);
  });

  it('describes the two shared fonts as the dev tools pin them', () => {
    const {surahNames, common} = v4.sharedFonts;
    expect(surahNames).toMatchObject({
      id: 'surah-names-v4',
      qulResource: 'https://qul.tarteel.ai/resources/font/237',
      fontFamily: 'mushaf-surah-names-v4',
      fileName: 'surah_names.woff2',
      cdnUrl: 'https://static-cdn.tarteel.ai/qul/fonts/surah_names_v4/surah_names.woff2',
      metrics: {unitsPerEm: 2500, ascent: 3940, descent: -2520},
    });
    expect(common).toMatchObject({
      id: 'quran-common',
      qulResource: 'https://qul.tarteel.ai/resources/font/459',
      fontFamily: 'mushaf-quran-common',
      fileName: 'quran-common.woff2',
      cdnUrl: 'https://static-cdn.tarteel.ai/qul/fonts/common/quran-common.woff2',
      metrics: {unitsPerEm: 1024, ascent: 819, descent: -205},
    });
    for (const font of [surahNames, common]) {
      expect(font.cdnUrl).toBe(QPC_V4.sharedFontUrl(font.id, 'woff2'));
      expect(QPC_V4.sharedFonts[font.id].fileName).toBe(font.fileName);
    }
    expect(getSharedFont(v4, 'quran-common')).toBe(common);
    expect(() => getSharedFont(v4, 'p10')).toThrow(/font must be one of 'surah-names-v4', 'quran-common'/);
  });

  it('maps every surah, the basmalah, every juz and the header frame to their glyphs', () => {
    const {glyphs} = v4;
    // The surah-name font's cmap: 1–21 in U+FC45–U+FC64, 22–114 in U+FB51–U+FBEB, gaps included.
    const names = Array.from({length: 114}, (_, i) => glyphs.surahName(i + 1));
    const cps = names.map((g) => g.text.codePointAt(0)!);
    const ascending = (list: number[]) => list.every((cp, i) => i === 0 || cp > list[i - 1]!);
    expect(ascending(cps.slice(0, 21))).toBe(true);
    expect(cps.slice(0, 21).every((cp) => cp >= 0xfc45 && cp <= 0xfc64)).toBe(true);
    expect(ascending(cps.slice(21))).toBe(true);
    expect(cps.slice(21).every((cp) => cp >= 0xfb51 && cp <= 0xfbeb)).toBe(true);
    expect(new Set(names.map((g) => g.text)).size).toBe(114);
    expect(names[0]).toEqual({font: 'surahNames', kind: 'surah-name', text: '\uFC45', bandCenter: 449});
    expect(names[20]!.text).toBe('\uFC64');
    expect(names[21]!.text).toBe('\uFB51');
    expect(names[113]!.text).toBe('\uFBEB');
    for (const g of names) expect(Array.from(g.text)).toHaveLength(1);
    expect(glyphs.basmalah).toEqual({
      font: 'surahNames',
      kind: 'basmalah',
      text: '\uFCAA\uFCAB\uFCAE\uFCB4',
      bandCenter: 1418,
    });
    expect(glyphs.juzName(1)).toEqual({font: 'common', kind: 'juz-name', text: '\uE001', bandCenter: 192});
    expect(glyphs.juzName(30).text).toBe('\uE01E');
    expect(glyphs.headerFrame).toEqual({font: 'common', kind: 'frame', text: '\uE000', bandCenter: 320, advance: 8240});
    expect(assertSurahNumber(114)).toBe(114);
    expect(() => assertSurahNumber(115)).toThrow(/surah must be an integer from 1 to 114, got 115/);
    expect(() => glyphs.surahName('9' as never)).toThrow(expect.objectContaining({code: 'SURAH_OUT_OF_RANGE'}));
    expect(assertJuzNumber(30)).toBe(30);
    expect(() => glyphs.juzName(0)).toThrow(expect.objectContaining({code: 'JUZ_OUT_OF_RANGE'}));
  });

  // The mirrored shared fonts (`bun run qul fonts`), when present: the tables above against the files.
  const mirrored = (id: string, file: string) =>
    new URL(`../../../../example/public/fonts/${id}/${file}.ttf`, import.meta.url);
  it.skipIf(!existsSync(mirrored('surah-names-v4', 'surah_names')))(
    'lists the surah-name glyphs the mirrored font maps, in its order',
    () => {
      const font = parseSfnt(readFileSync(mirrored('surah-names-v4', 'surah_names')));
      expect(checkSharedFont('surah-names-v4', font)).toEqual([]);
      expect(font.unitsPerEm).toBe(v4.sharedFonts.surahNames.metrics.unitsPerEm);
      expect(font.ascender).toBe(v4.sharedFonts.surahNames.metrics.ascent);
      expect(font.descender).toBe(v4.sharedFonts.surahNames.metrics.descent);
      const mapped = [...font.advances.keys()]
        .filter((cp: number) => (cp >= 0xfb51 && cp <= 0xfbeb) || (cp >= 0xfc45 && cp <= 0xfc64))
        .sort((a: number, b: number) => a - b);
      const table = Array.from({length: 114}, (_, i) => v4.glyphs.surahName(i + 1).text.codePointAt(0));
      // The font's order is the surah order, range by range.
      expect([...table.slice(21), ...table.slice(0, 21)]).toEqual(mapped);
      for (const ch of v4.glyphs.basmalah.text) expect(font.advances.get(ch.codePointAt(0))).toBeGreaterThan(0);
    },
  );
  it.skipIf(!existsSync(mirrored('quran-common', 'quran-common')))(
    'finds every juz name and the frame in the mirrored quran-common',
    () => {
      const font = parseSfnt(readFileSync(mirrored('quran-common', 'quran-common')));
      expect(checkSharedFont('quran-common', font)).toEqual([]);
      expect(font.unitsPerEm).toBe(v4.sharedFonts.common.metrics.unitsPerEm);
      expect(font.ascender).toBe(v4.sharedFonts.common.metrics.ascent);
      expect(font.descender).toBe(v4.sharedFonts.common.metrics.descent);
      expect(font.advances.get(v4.glyphs.headerFrame.text.codePointAt(0))).toBe(v4.glyphs.headerFrame.advance);
      for (let juz = 1; juz <= 30; juz++)
        expect(font.advances.get(v4.glyphs.juzName(juz).text.codePointAt(0))).toBeGreaterThan(0);
    },
  );

  it('validates ids, pages and lines', () => {
    expect(isMushafId('qpc-v4')).toBe(true);
    expect(isMushafId('qpc-v4-tajweed')).toBe(false); // a font set, not a mushaf
    expect(isMushafId('toString')).toBe(false);
    expect(() => getMushafDefinition(undefined)).toThrow(/Unknown mushaf undefined/);
    const def = getMushafDefinition('qpc-v4');
    expect(assertPage(def, 604)).toBe(604);
    expect(() => assertPage(def, '10')).toThrow(/got "10"/);
    expect(assertLine(def, 1, 8)).toBe(8);
    expect(() => assertLine(def, 2, 9)).toThrow(/from 1 to 8 on page 2/);
    expect(assertLine(def, 3, 15)).toBe(15);
  });
});

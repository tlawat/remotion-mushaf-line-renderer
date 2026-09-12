import {describe, expect, it} from 'vitest';
// @ts-expect-error — plain JS module from scripts/
import {QPC_V4} from '../../../../scripts/lib/datasets.mjs';
import {
  assertLine,
  assertPage,
  DATASETS,
  fontSetForLook,
  getDataset,
  getMushafDefinition,
  isMushafId,
  MANDALA_PALETTE,
  MUSHAF_IDS,
  MUSHAF_LOOKS,
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
      expect(set.fontUrl(10)).toBe(QPC_V4.fontUrl(set.id, 10, 'woff2'));
  });

  it('names fonts per page and set', () => {
    expect(v4.fontSets.plain.id).toBe('qpc-v4');
    expect(v4.fontSets.color.id).toBe('qpc-v4-tajweed');
    expect(v4.fontSets.plain.fontFamily(10)).toBe('mushaf-qpc-v4-p10');
    expect(v4.fontSets.color.fontFamily(604)).toBe('mushaf-qpc-v4-tajweed-p604');
    expect(v4.fontSets.plain.fontUrl(10)).toBe(
      'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2',
    );
    expect(v4.fontSets.color.fontUrl(10)).toBe(
      'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/woff2/p10.woff2?v=3.1',
    );
    expect(v4.fontSets.plain.colr).toBe(false);
    expect(v4.fontSets.color.colr).toBe(true);
    expect(v4.fontSets.plain.palettes).toEqual([]);
    expect(v4.fontSets.color.palettes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(v4.fontSets.color.palettes).toContain(MANDALA_PALETTE);
  });

  it('resolves the look into a font set and, for mandala, its colours', () => {
    expect(MUSHAF_LOOKS).toEqual(['plain', 'tajweed', 'mandala']);
    // Nothing said: the V4 mushaf, plain glyphs, no colours to write into a palette.
    expect(resolveSelection({})).toEqual({def: v4, look: 'plain', fontSet: v4.fontSets.plain});
    expect(resolveSelection({mushaf: 'qpc-v4', look: 'plain'})).toEqual({
      def: v4,
      look: 'plain',
      fontSet: v4.fontSets.plain,
    });
    // Tajweed: the colour font at its own colours.
    expect(resolveSelection({look: 'tajweed'})).toEqual({def: v4, look: 'tajweed', fontSet: v4.fontSets.color});
    // Mandala: the colour font, ink following the inherited CSS colour, the rosette's ornaments the font's own.
    expect(resolveSelection({look: 'mandala'})).toEqual({
      def: v4,
      look: 'mandala',
      fontSet: v4.fontSets.color,
      colors: {ink: 'currentColor'},
    });
    expect(resolveSelection({look: 'mandala', colors: {accent: '#c8a45c'}}).colors).toEqual({
      ink: 'currentColor',
      accent: '#c8a45c',
    });
    // An explicit ink replaces the default rather than being layered on it.
    expect(resolveSelection({look: 'mandala', colors: {ink: '#1b6f3f'}}).colors).toEqual({ink: '#1b6f3f'});
    expect(fontSetForLook(v4, 'plain')).toBe(v4.fontSets.plain);
    expect(fontSetForLook(v4, 'mandala')).toBe(v4.fontSets.color);
  });

  it('refuses a wrong look, colours outside mandala, and colours that are not colours', () => {
    expect(() => resolveSelection({look: 'colour' as never})).toThrow(
      /look must be one of 'plain', 'tajweed', 'mandala' when given, got "colour"/,
    );
    expect(() => resolveSelection({look: true as never})).toThrow(/got true/);
    expect(() => resolveSelection({colors: {ink: 'red'}})).toThrow(
      /colors can only be given with look: 'mandala' \(got look: 'plain'\)/,
    );
    expect(() => resolveSelection({look: 'tajweed', colors: {}})).toThrow(/got look: 'tajweed'/);
    expect(() => resolveSelection({look: 'mandala', colors: {glow: 'red'} as never})).toThrow(
      /colors.glow is not a colourable part/,
    );
    expect(() => resolveSelection({look: 'mandala', colors: {ink: 'red; } body {display:none'}})).toThrow(
      /colors.ink must be a CSS colour/,
    );
    expect(() => resolveSelection({look: 'mandala', colors: ['red'] as never})).toThrow(
      /must be an object of CSS colours/,
    );
  });

  it('knows which CPAL entries paint which part of the colour font', () => {
    // Read from the font's CPAL table. 13 (the rosette's frame and the ayah number) is written in
    // the letter colour by the font itself, so it belongs to the ink.
    expect(v4.fontSets.color.paletteRoles).toEqual({
      ink: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15],
      accent: [11],
      detail: [10],
      background: [12],
    });
    const all = Object.values(v4.fontSets.color.paletteRoles).flat();
    expect(new Set(all).size).toBe(16);
    expect(Object.values(v4.fontSets.plain.paletteRoles).flat()).toEqual([]);
  });

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

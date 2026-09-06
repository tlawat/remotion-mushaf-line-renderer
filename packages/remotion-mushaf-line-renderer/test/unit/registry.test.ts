import {describe, expect, it} from 'vitest';
// @ts-expect-error — plain JS module from scripts/
import {QPC_V4} from '../../../../scripts/lib/datasets.mjs';
import {MANDALA_PALETTE, MUSHAFS, MUSHAF_IDS, assertLine, assertPage, getMushafDefinition, isMushafId, paletteFor, resolveMushafId} from '../../src/mushafs';

describe('mushaf registry', () => {
  it('agrees with the compiler dataset descriptor', () => {
    for (const id of MUSHAF_IDS) {
      const def = MUSHAFS[id];
      expect(def.pages).toBe(QPC_V4.pages);
      expect(def.layoutId).toBe(QPC_V4.layoutId);
      expect(def.dataset).toBe(QPC_V4.dataset);
      for (const p of [1, 2, 3, 187, 604]) expect(def.linesOnPage(p)).toBe(QPC_V4.linesOnPage(p));
      expect(def.invariants).toEqual({
        lines: QPC_V4.invariants.lines,
        ayahLines: QPC_V4.invariants.ayahLines,
        surahNameLines: QPC_V4.invariants.surahNameLines,
        basmallahLines: QPC_V4.invariants.basmallahLines,
        centeredAyahLines: QPC_V4.invariants.centeredAyahLines,
        words: QPC_V4.invariants.words,
      });
      expect(def.fontUrl(10)).toBe(QPC_V4.fontUrl(id, 10, 'woff2'));
    }
  });

  it('names fonts per page and set', () => {
    expect(MUSHAFS['qpc-v4'].fontFamily(10)).toBe('mushaf-qpc-v4-p10');
    expect(MUSHAFS['qpc-v4-tajweed'].fontFamily(604)).toBe('mushaf-qpc-v4-tajweed-p604');
    expect(MUSHAFS['qpc-v4'].fontUrl(10)).toBe('https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2');
    expect(MUSHAFS['qpc-v4-tajweed'].fontUrl(10)).toBe('https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/woff2/p10.woff2?v=3.1');
    expect(MUSHAFS['qpc-v4'].colr).toBe(false);
    expect(MUSHAFS['qpc-v4-tajweed'].colr).toBe(true);
    expect(MUSHAFS['qpc-v4'].palettes).toEqual([]);
    expect(MUSHAFS['qpc-v4-tajweed'].palettes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(MUSHAFS['qpc-v4-tajweed'].palettes).toContain(MANDALA_PALETTE);
  });

  it('resolves the font set and the palette from tajweed and mandala', () => {
    // Nothing said: the plain set, at the font's own colours (none).
    expect(resolveMushafId(undefined, undefined)).toBe('qpc-v4');
    expect(paletteFor({})).toBeUndefined();
    // A flag decides over an id that says otherwise; an id alone still stands.
    expect(resolveMushafId('qpc-v4', true)).toBe('qpc-v4-tajweed');
    expect(resolveMushafId('qpc-v4-tajweed', false)).toBe('qpc-v4');
    expect(resolveMushafId('qpc-v4-tajweed', undefined)).toBe('qpc-v4-tajweed');
    // Mandala lives in the colour font, so it resolves to it — even next to `tajweed: false`.
    expect(resolveMushafId(undefined, undefined, true)).toBe('qpc-v4-tajweed');
    expect(resolveMushafId('qpc-v4', false, true)).toBe('qpc-v4-tajweed');
    expect(resolveMushafId(undefined, undefined, {text: 'crimson'})).toBe('qpc-v4-tajweed');
    // Its letters follow the inherited CSS colour; the rosette keeps the font's own.
    expect(paletteFor({mandala: true})).toEqual({palette: MANDALA_PALETTE, paletteColors: {text: 'currentColor'}});
    expect(paletteFor({tajweed: false, mandala: true})).toEqual({palette: MANDALA_PALETTE, paletteColors: {text: 'currentColor'}});
    expect(paletteFor({mandala: {accent: '#c8a45c'}})).toEqual({palette: MANDALA_PALETTE, paletteColors: {text: 'currentColor', accent: '#c8a45c'}});
    expect(paletteFor({mandala: {text: '#1b6f3f'}})).toEqual({palette: MANDALA_PALETTE, paletteColors: {text: '#1b6f3f'}});
    // Tajweed is the more specific ask, so it wins and keeps the font's default palette.
    expect(resolveMushafId(undefined, true, true)).toBe('qpc-v4-tajweed');
    expect(paletteFor({tajweed: true, mandala: true})).toBeUndefined();
    expect(paletteFor({mandala: false})).toBeUndefined();
    // Every flag names itself when it is wrong, and a colour must be a colour.
    expect(() => resolveMushafId(undefined, 'yes')).toThrow(/tajweed must be true or false when given, got "yes"/);
    expect(() => resolveMushafId(undefined, undefined, 1)).toThrow(/mandala must be true, false or an object of CSS colours when given, got 1/);
    expect(() => paletteFor({mandala: null})).toThrow(/mandala must be true, false or an object/);
    expect(() => resolveMushafId(undefined, 0)).toThrow(/tajweed must be true or false/);
    expect(() => paletteFor({mandala: {glow: 'red'}})).toThrow(/mandala.glow is not a colourable part/);
    expect(() => paletteFor({mandala: {text: 'red; } body {display:none'}})).toThrow(/mandala.text must be a CSS colour/);
  });

  it('knows which CPAL entries paint which part of the colour font', () => {
    const colour = MUSHAFS['qpc-v4-tajweed'];
    // Read from the font's CPAL table; the letters take every entry the rosette does not.
    expect(colour.paletteRoles).toEqual({text: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15], accent: [10, 11, 13], background: [12]});
    const all = Object.values(colour.paletteRoles).flat();
    expect(new Set(all).size).toBe(16);
    expect(Object.values(MUSHAFS['qpc-v4'].paletteRoles).flat()).toEqual([]);
  });

  it('validates ids, pages and lines', () => {
    expect(isMushafId('qpc-v4')).toBe(true);
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

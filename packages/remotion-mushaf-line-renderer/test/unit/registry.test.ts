import {describe, expect, it} from 'vitest';
// @ts-expect-error — plain JS module from scripts/
import {QPC_V4} from '../../../../scripts/lib/datasets.mjs';
import {MUSHAFS, MUSHAF_IDS, assertLine, assertPage, getMushafDefinition, isMushafId} from '../../src/mushafs';

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

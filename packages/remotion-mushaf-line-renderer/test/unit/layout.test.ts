import {describe, expect, it} from 'vitest';
import {assertSize, buildRootStyle, buildRowStyle, fontSizeForWidth, lineHeightForFontSize} from '../../src/layout';

describe('layout helpers', () => {
  it('derives the font size from the widest line (W/17 rule)', () => {
    expect(fontSizeForWidth(1920)).toBe(112);
    expect(fontSizeForWidth(1080)).toBe(63);
    expect(fontSizeForWidth(3840)).toBe(225);
    // Both font sets share the metrics, and the default is the plain one.
    expect(fontSizeForWidth(1920, 'qpc-v4-tajweed')).toBe(112);
    // The widest line (42,501 units) fits the box at that size.
    for (const w of [1080, 1920, 3840]) expect((fontSizeForWidth(w) * 42501) / 2500).toBeLessThanOrEqual(w);
  });

  it('defaults the line height to 2.2 em', () => {
    expect(lineHeightForFontSize(112)).toBe(246);
    expect(lineHeightForFontSize(63)).toBe(139);
  });

  it('validates sizes', () => {
    expect(assertSize('fontSize', 12)).toBe(12);
    expect(() => assertSize('fontSize', 0)).toThrow(/fontSize must be a positive finite number of pixels, got 0/);
    expect(() => assertSize('lineHeight', Number.NaN)).toThrow(/got NaN/);
    expect(() => assertSize('lineHeight', '12' as never)).toThrow(/got "12"/);
  });

  it('builds the root and row styles', () => {
    expect(buildRootStyle(246, {top: 10, color: 'red'})).toMatchObject({position: 'relative', height: 246, width: '100%', top: 10, color: 'red', overflow: 'visible'});
    const justified = buildRowStyle({fontFamily: 'mushaf-qpc-v4-p10', fontSize: 112, lineHeight: 246, centered: false, visible: false});
    expect(justified).toMatchObject({justifyContent: 'space-between', direction: 'rtl', fontFamily: '"mushaf-qpc-v4-p10"', fontSize: '112px', lineHeight: '246px', visibility: 'hidden', letterSpacing: 0, fontSynthesis: 'none', whiteSpace: 'nowrap', unicodeBidi: 'isolate'});
    const centered = buildRowStyle({fontFamily: 'f', fontSize: 10, lineHeight: 22, centered: true, visible: true});
    expect(centered).toMatchObject({justifyContent: 'center', visibility: 'visible'});
  });
});

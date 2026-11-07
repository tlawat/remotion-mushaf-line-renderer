// The canvas side of the measure (render-design.md 5.5, 5.8): a face in small caps is measured with
// the context's `fontVariantCaps`, letter-spacing is added after every character, and the legend's
// band measures its English names in the face it draws them in. A fake `OffscreenCanvas` stands in
// for Chromium's: the advance depends on the family and on the caps, so each can be told apart.
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

type Fake = {font: string; fontVariantCaps: string; measureText: (text: string) => {width: number}};

/** em a character: 0.5 in EB Garamond, 0.4 in its small caps, 0.3 in "Narrow" (whatever the caps). */
const advance = (font: string, caps: string): number =>
  font.includes('Narrow') ? 0.3 : caps === 'all-small-caps' ? 0.4 : 0.5;

beforeAll(() => {
  vi.resetModules();
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext(): Fake {
        const ctx: Fake = {
          font: '',
          fontVariantCaps: 'normal',
          measureText(text: string) {
            const size = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 0);
            return {width: text.length * size * advance(ctx.font, ctx.fontVariantCaps)};
          },
        };
        return ctx;
      }
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('textAdvance on a canvas', () => {
  it('sets small caps on the context, puts them back for the next face, and adds the letter-spacing', async () => {
    const {textAdvance} = await import('../../../src/translations/fit');
    const face = {fontFamily: '"EB Garamond", serif', fontWeight: 500};
    expect(textAdvance('abcd', face, 20)).toBe(40);
    expect(textAdvance('abcd', {...face, smallCaps: true}, 20)).toBe(32);
    // The shared context is back to normal caps after a small-caps measure.
    expect(textAdvance('abcd', face, 20)).toBe(40);
    // 0.08 em after each of the 4 characters: 4 × 1.6 px more.
    expect(textAdvance('abcd', {...face, smallCaps: true, letterSpacing: 0.08}, 20)).toBeCloseTo(32 + 6.4, 9);
  });
});

describe('legendBand on a canvas', () => {
  it('measures the English names in the face they are drawn in, in small caps and letter-spaced', async () => {
    const {legendBand} = await import('../../../src/compositions/parts');
    const legend = {show: true, position: 'bottom-left' as const, names: 'en' as const};
    const frame = {width: 1080, height: 1920, lineHeight: 114};
    const auto = legendBand(legend, 'light', frame)!;
    const narrow = legendBand(legend, 'light', {...frame, fontFamily: 'Narrow, serif'})!;
    // The first entry, "Necessary prolongation: 6 counts" (32 characters) at 30 px: a 0.5 em swatch,
    // 0.4 em, then the name at 0.4 em a small cap plus 0.08 em of spacing (or 0.3 + 0.08 in "Narrow").
    const name = 'Necessary prolongation: 6 counts';
    const entry = (em: number) => 30 * (0.5 + 0.4 + name.length * (em + 0.08));
    expect(auto.fontSize).toBe(30);
    expect(auto.rowWidths[0]).toBeGreaterThanOrEqual(entry(0.4) - 1e-6);
    expect(narrow.rowWidths.reduce((a, b) => a + b, 0)).toBeLessThan(auto.rowWidths.reduce((a, b) => a + b, 0));
    expect(narrow.rows).toBeLessThanOrEqual(auto.rows);
    for (const row of [...auto.rowWidths, ...narrow.rowWidths]) expect(row).toBeLessThanOrEqual(1080 - 2 * 54);
    expect(entry(0.3)).toBeLessThan(entry(0.4));
  });
});

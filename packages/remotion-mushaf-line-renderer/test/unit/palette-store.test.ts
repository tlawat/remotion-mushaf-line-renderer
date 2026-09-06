// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {paletteIdent, registerPalette, resetPaletteStore} from '../../src/palette-store';

const sheets = () => Array.from(document.querySelectorAll('style[data-mushaf-palettes]'));
const css = () => sheets().map((s) => s.textContent ?? '').join('');

// jsdom has no CSS object, which is exactly how the injection is kept out of environments whose
// parser would only complain about the at-rule; these tests stand in for a browser that has it.
const withFontPaletteSupport = (supported: boolean) => {
  (globalThis as {CSS?: unknown}).CSS = {supports: (property: string) => property === 'font-palette' && supported};
};

// Forcing the injection here makes jsdom log "Could not parse CSS stylesheet" (its parser does not
// know the at-rule) — the very noise the support check keeps out of every other jsdom suite.
beforeEach(() => withFontPaletteSupport(true));

afterEach(() => {
  resetPaletteStore();
  delete (globalThis as {CSS?: unknown}).CSS;
});

describe('palette store', () => {
  it('names an ident per family, palette and set of colours', () => {
    expect(paletteIdent('mushaf-qpc-v4-tajweed-p187', 3)).toBe('--mushaf-qpc-v4-tajweed-p187-palette-3');
    expect(paletteIdent('mushaf-qpc-v4-tajweed-p1', 0)).toBe('--mushaf-qpc-v4-tajweed-p1-palette-0');
    // Overridden colours are part of the identity, so two looks never share one rule...
    const green = paletteIdent('mushaf-qpc-v4-tajweed-p187', 3, [[0, 'green']]);
    const red = paletteIdent('mushaf-qpc-v4-tajweed-p187', 3, [[0, 'red']]);
    expect(green).toMatch(/^--mushaf-qpc-v4-tajweed-p187-palette-3-[0-9a-f]{8}$/);
    expect(green).not.toBe(red);
    expect(green).not.toBe(paletteIdent('mushaf-qpc-v4-tajweed-p187', 3));
    // ... and the same look always reuses one.
    expect(paletteIdent('mushaf-qpc-v4-tajweed-p187', 3, [[0, 'green']])).toBe(green);
  });

  it('injects one @font-palette-values rule per ident, once, in one style element', () => {
    const plain = registerPalette('mushaf-qpc-v4-tajweed-p187', 3);
    registerPalette('mushaf-qpc-v4-tajweed-p187', 3);
    const coloured = registerPalette('mushaf-qpc-v4-tajweed-p187', 3, [
      [0, 'rgb(27, 111, 63)'],
      [13, '#c8a45c'],
    ]);
    expect(sheets()).toHaveLength(1);
    expect(css()).toBe(
      `@font-palette-values ${plain}{font-family:"mushaf-qpc-v4-tajweed-p187";base-palette:3;}\n` +
        `@font-palette-values ${coloured}{font-family:"mushaf-qpc-v4-tajweed-p187";base-palette:3;override-colors:0 rgb(27, 111, 63),13 #c8a45c;}\n`,
    );
  });

  it('still names the ident where font-palette is unsupported, and injects nothing', () => {
    withFontPaletteSupport(false);
    expect(registerPalette('mushaf-qpc-v4-tajweed-p187', 3)).toBe('--mushaf-qpc-v4-tajweed-p187-palette-3');
    expect(sheets()).toHaveLength(0);
  });
});

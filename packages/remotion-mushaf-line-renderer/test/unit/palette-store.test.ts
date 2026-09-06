// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {paletteIdent, registerPalettes, resetPaletteStore} from '../../src/palette-store';

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
  it('names an ident per family and palette', () => {
    expect(paletteIdent('mushaf-qpc-v4-tajweed-p187', 3)).toBe('--mushaf-qpc-v4-tajweed-p187-palette-3');
    expect(paletteIdent('mushaf-qpc-v4-tajweed-p1', 0)).toBe('--mushaf-qpc-v4-tajweed-p1-palette-0');
  });

  it('injects one @font-palette-values rule per palette, once, in one style element', () => {
    registerPalettes('mushaf-qpc-v4-tajweed-p187', [0, 3]);
    registerPalettes('mushaf-qpc-v4-tajweed-p187', [0, 3]);
    registerPalettes('mushaf-qpc-v4-tajweed-p188', [3]);
    expect(sheets()).toHaveLength(1);
    expect(css()).toBe(
      '@font-palette-values --mushaf-qpc-v4-tajweed-p187-palette-0{font-family:"mushaf-qpc-v4-tajweed-p187";base-palette:0}\n' +
        '@font-palette-values --mushaf-qpc-v4-tajweed-p187-palette-3{font-family:"mushaf-qpc-v4-tajweed-p187";base-palette:3}\n' +
        '@font-palette-values --mushaf-qpc-v4-tajweed-p188-palette-3{font-family:"mushaf-qpc-v4-tajweed-p188";base-palette:3}\n',
    );
  });

  it('does nothing for a monochrome family or where font-palette is unsupported', () => {
    registerPalettes('mushaf-qpc-v4-p187', []);
    expect(sheets()).toHaveLength(0);
    withFontPaletteSupport(false);
    registerPalettes('mushaf-qpc-v4-tajweed-p187', [3]);
    expect(sheets()).toHaveLength(0);
  });
});

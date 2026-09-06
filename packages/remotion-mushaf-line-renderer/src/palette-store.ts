/**
 * CSS side of colour-font palettes. A COLR/CPAL font paints itself from one of its palettes, and CSS
 * selects one with `font-palette: <ident>`, where the ident is defined by an `@font-palette-values`
 * rule that names the family and the base palette. There is no way to say "palette 3" inline, so the
 * rules have to exist in the document — this module owns them.
 *
 * They are injected next to the `FontFace` registration (see load-page-font.ts), so a palette rule
 * can never be missing while its family is usable, and the row is hidden until then anyway.
 */

/** The `font-palette` ident for a family and a base palette. Both parts are already CSS-safe idents. */
export const paletteIdent = (fontFamily: string, palette: number): string => `--${fontFamily}-palette-${palette}`;

type Store = {
  readonly style: HTMLStyleElement;
  readonly rules: Set<string>;
};

// Keyed on globalThis for the same reason as the font store: Studio fast-refresh and duplicate
// package copies share one document, so they must share one <style> element.
const STORE_KEY = Symbol.for('remotion-mushaf-line-renderer/palette-store@1');

const getStore = (): Store => {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  let store = g[STORE_KEY];
  if (!store) {
    const style = document.createElement('style');
    style.setAttribute('data-mushaf-palettes', '');
    document.head.appendChild(style);
    store = {style, rules: new Set()};
    g[STORE_KEY] = store;
  }
  return store;
};

/**
 * `font-palette` needs both the property and `@font-palette-values`; they shipped together, so one
 * check covers the rule. It also keeps the at-rule out of environments whose CSS parser would only
 * complain about it (jsdom has no `CSS` object at all), where a colour font renders its default
 * palette anyway.
 */
const supportsFontPalette = (): boolean => typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('font-palette', '--mushaf-probe');

/**
 * Declares `font-palette` idents for a family, one per palette. Idempotent, and a no-op outside a
 * document (server rendering), for a monochrome family (no palettes), or where `font-palette` is
 * not supported.
 */
export const registerPalettes = (fontFamily: string, palettes: readonly number[]): void => {
  if (palettes.length === 0 || typeof document === 'undefined' || !supportsFontPalette()) return;
  const store = getStore();
  let css = '';
  for (const palette of palettes) {
    const ident = paletteIdent(fontFamily, palette);
    if (store.rules.has(ident)) continue;
    store.rules.add(ident);
    css += `@font-palette-values ${ident}{font-family:"${fontFamily}";base-palette:${palette}}\n`;
  }
  if (css === '') return;
  // Appending text rather than insertRule(): one reparse of a tiny sheet, and it survives a browser
  // that rejects the at-rule (the sheet stays valid, the ident simply never resolves).
  store.style.appendChild(document.createTextNode(css));
};

/** Test hook: drop the injected rules and the style element. */
export const resetPaletteStore = (): void => {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  const store = g[STORE_KEY];
  if (!store) return;
  store.style.remove();
  g[STORE_KEY] = undefined;
};

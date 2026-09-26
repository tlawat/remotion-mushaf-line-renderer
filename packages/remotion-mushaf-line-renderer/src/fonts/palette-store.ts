/**
 * CSS side of colour-font palettes. A COLR/CPAL font paints itself from one of its palettes, and CSS
 * selects one with `font-palette: <ident>`, where the ident is defined by an `@font-palette-values`
 * rule naming the family, the base palette and any per-entry colour. There is no inline way to say
 * "palette 3, letters green", so the rules have to exist in the document — this module owns them.
 *
 * `<MushafLine>` registers the rule it needs in a layout effect, before the browser paints, and
 * keeps the row hidden until then, so a frame is never captured with the wrong palette.
 */

import {fnv1a32} from '../hash';

/** An entry of `override-colors`: which CPAL entry, and the CSS colour to paint it with. */
export type PaletteEntry = readonly [entry: number, color: string];

/** Hex FNV-1a, so the same colours always give the same ident and different ones practically never do. */
const hash = (text: string): string => fnv1a32(text).toString(16).padStart(8, '0');

const overrideText = (entries: readonly PaletteEntry[]): string =>
  entries.map(([entry, color]) => `${entry} ${color}`).join(',');

/**
 * The `font-palette` ident for a family, a base palette and its overrides. Pure: the renderer can
 * name the ident while rendering and register the rule for it afterwards.
 */
export const paletteIdent = (fontFamily: string, base: number, entries: readonly PaletteEntry[] = []): string =>
  entries.length === 0
    ? `--${fontFamily}-palette-${base}`
    : `--${fontFamily}-palette-${base}-${hash(overrideText(entries))}`;

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
const supportsFontPalette = (): boolean =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('font-palette', '--mushaf-probe');

/**
 * Declares one `font-palette` ident and returns it. Idempotent; the rule is injected only where
 * there is a document that understands it, but the ident is always returned so the row can name it
 * (an ident with no rule simply leaves the font on its own palette).
 */
export const registerPalette = (fontFamily: string, base: number, entries: readonly PaletteEntry[] = []): string => {
  const ident = paletteIdent(fontFamily, base, entries);
  if (typeof document === 'undefined' || !supportsFontPalette()) return ident;
  const store = getStore();
  if (store.rules.has(ident)) return ident;
  store.rules.add(ident);
  const overrides = entries.length === 0 ? '' : `override-colors:${overrideText(entries)};`;
  // Appending text rather than insertRule(): one reparse of a tiny sheet, and it survives a browser
  // that rejects the at-rule (the sheet stays valid, the ident simply never resolves).
  store.style.appendChild(
    document.createTextNode(
      `@font-palette-values ${ident}{font-family:"${fontFamily}";base-palette:${base};${overrides}}\n`,
    ),
  );
  return ident;
};

/** Test hook: drop the injected rules and the style element. */
export const resetPaletteStore = (): void => {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  const store = g[STORE_KEY];
  if (!store) return;
  store.style.remove();
  g[STORE_KEY] = undefined;
};

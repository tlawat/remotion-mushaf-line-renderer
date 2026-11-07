import {type RefObject, useState} from 'react';
import {registerPalette} from '../../fonts/palette-store';
import {CURRENT_COLOR} from '../../mushaf/colors';
import type {PaletteEntry, ResolvedTheme} from '../../mushaf/themes';
import {useIsomorphicLayoutEffect} from './use-isomorphic-layout-effect';

/** The four tint palettes of `inkTint`, from a quarter of the way to all of it. */
export type TintPalettes = readonly [quarter: string, half: string, threeQuarters: string, full: string];

/** The `font-palette` idents a colour-font line needs: one for the row, one for the ayah-number marker glyph. */
export type PaletteIdents = {
  readonly row: string;
  /** Set only when the theme colours the marker differently (QUL's black theme). */
  readonly marker?: string;
  /** Set only for an `inkTint` on a theme whose ink is a fixed palette colour. */
  readonly tints?: TintPalettes;
};

export type PaletteRuleOptions = {
  /** `MushafLineCommonProps.inkTint`. */
  readonly inkTint?: string | undefined;
  /** The CPAL entries that paint the letters (`colorParts.ink`). */
  readonly inkEntries?: readonly number[] | undefined;
};

/**
 * The letters' colour in each of the V4 colour font's six CPAL palettes, for a tint on a palette
 * whose ink no theme overrides (`p3`-`p5`), or whose inherited colour cannot be read: CSS cannot
 * read a palette's colours back, so they are written down here (docs/kfgqpc-v4-rendering-notes.md,
 * "the 6 palettes").
 */
const PALETTE_INK: readonly string[] = ['#000000', '#ffffff', '#000000', '#000000', '#ffffff', '#000000'];

/** The four amounts the tint palettes mix to. */
const TINT_STEPS = [0.25, 0.5, 0.75, 1] as const;

/** `#rgb`, `#rrggbb` or the `rgb()` / `rgba()` a computed style gives, as channels; `null` for anything else. */
const channelsOf = (color: string): readonly [number, number, number] | null => {
  const text = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1];
  if (hex !== undefined) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as unknown as readonly [
      number,
      number,
      number,
    ];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
};

/**
 * `from` mixed `amount` of the way to `to`, in sRGB: a hex colour when both are hex or `rgb()`
 * (what the palette rule needs: an absolute colour), else `color-mix()` for the browser to work out.
 * `mixColors('#000000', 'rgb(255, 255, 255)', 0.5)` is `#808080`.
 */
export const mixColors = (from: string, to: string, amount: number): string => {
  const a = channelsOf(from);
  const b = channelsOf(to);
  if (a === null || b === null) {
    return `color-mix(in srgb, ${to} ${Math.round(amount * 100)}%, ${from})`;
  }
  return `#${a
    .map((channel, i) =>
      Math.round(channel + (b[i]! - channel) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/**
 * `WordContext.inkPalette` for a line's tint palettes: the nearest of the four steps to `amount`,
 * `undefined` under 0.125 (the row's own palette).
 */
export const inkPaletteFor =
  (tints: TintPalettes) =>
  (amount: number): string | undefined => {
    const step = Math.round(Math.min(1, Math.max(0, amount)) * 4);
    return step === 0 ? undefined : tints[step - 1];
  };

/**
 * The `font-palette` idents for a colour-font line: `undefined` when the line needs none (the plain
 * theme), `null` while the rules are not in the document yet, the idents once they are.
 *
 * The rules that name them have to be in the document before the row is painted, and
 * `'currentColor'` has to be resolved from the row's computed colour first (COLR glyphs ignore CSS
 * `color`, and Chromium drops `currentColor` inside `override-colors`), so both happen in a layout
 * effect: before the browser paints, with the row still hidden. With an `inkTint`, four more rules
 * mix the ink entries toward the tint in the same effect, from the colour the row's own rule gives
 * them: an ink that follows `currentColor` is already the row's computed colour there, which is why
 * a word's CSS `color` cannot tint it.
 */
export const usePaletteRule = (
  fontFamily: string,
  theme: ResolvedTheme | null,
  rowRef: RefObject<HTMLDivElement | null>,
  options: PaletteRuleOptions = {},
): PaletteIdents | null | undefined => {
  const inkTint = options.inkTint;
  const inkEntries = options.inkEntries ?? [];
  const key =
    theme === null
      ? null
      : `${fontFamily}/${theme.base}/${JSON.stringify(theme.entries)}/${JSON.stringify(theme.marker)}/${inkTint ?? ''}`;
  const [registered, setRegistered] = useState<{key: string; idents: PaletteIdents} | null>(null);
  const idents = key === null ? undefined : registered?.key === key ? registered.idents : null;
  useIsomorphicLayoutEffect(() => {
    if (key === null || theme === null || registered?.key === key) return;
    const row = rowRef.current;
    const inherited = row && typeof getComputedStyle === 'function' ? getComputedStyle(row).color : '';
    // Where the inherited colour cannot be read, the entry is left out and the palette's own colour
    // stands, rather than guessing one.
    const resolve = (entries: readonly PaletteEntry[]): PaletteEntry[] =>
      entries
        .map(([entry, color]) => [entry, color === CURRENT_COLOR ? inherited : color] as const)
        .filter((pair): pair is readonly [number, string] => pair[1] !== '');
    const rowEntries = resolve(theme.entries);
    const rowIdent = registerPalette(fontFamily, theme.base, rowEntries);
    const tints = tintPalettes(fontFamily, theme, rowEntries, inkEntries, inkTint);
    const withTints = tints === undefined ? {} : {tints};
    if (theme.marker.length === 0) {
      setRegistered({key, idents: {row: rowIdent, ...withTints}});
      return;
    }
    // The marker rule is the row's rule with the marker colours on top (later entries win in CSS).
    const markerIdent = registerPalette(fontFamily, theme.base, [...rowEntries, ...resolve(theme.marker)]);
    setRegistered({key, idents: {row: rowIdent, marker: markerIdent, ...withTints}});
  }, [key, registered, theme, fontFamily, rowRef]);
  return idents;
};

/** Registers the four tint palettes, or returns `undefined` when there is no tint or no ink entry. */
const tintPalettes = (
  fontFamily: string,
  theme: ResolvedTheme,
  rowEntries: readonly PaletteEntry[],
  inkEntries: readonly number[],
  inkTint: string | undefined,
): TintPalettes | undefined => {
  if (inkTint === undefined || inkEntries.length === 0) return undefined;
  // The row's entries, `currentColor` already resolved: the tint starts from what the row paints.
  const resolved = new Map(rowEntries);
  const fallbackInk = PALETTE_INK[theme.base] ?? '#000000';
  return TINT_STEPS.map((amount) => {
    const entries = new Map(resolved);
    for (const entry of inkEntries) entries.set(entry, mixColors(resolved.get(entry) ?? fallbackInk, inkTint, amount));
    return registerPalette(
      fontFamily,
      theme.base,
      [...entries.entries()].sort((a, b) => a[0] - b[0]),
    );
  }) as unknown as TintPalettes;
};

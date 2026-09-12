import {type RefObject, useState} from 'react';
import {registerPalette} from '../../fonts/palette-store';
import {CURRENT_COLOR} from '../../mushaf/colors';
import type {PaletteEntry, ResolvedTheme} from '../../mushaf/themes';
import {useIsomorphicLayoutEffect} from './use-isomorphic-layout-effect';

/** The `font-palette` idents a colour-font line needs: one for the row, one for the ayah-number marker glyph. */
export type PaletteIdents = {
  readonly row: string;
  /** Set only when the theme colours the marker differently (QUL's black theme). */
  readonly marker?: string;
};

/**
 * The `font-palette` idents for a colour-font line: `undefined` when the line needs none (the plain
 * theme), `null` while the rules are not in the document yet, the idents once they are.
 *
 * The rules that name them have to be in the document before the row is painted, and
 * `'currentColor'` has to be resolved from the row's computed colour first (COLR glyphs ignore CSS
 * `color`, and Chromium drops `currentColor` inside `override-colors`), so both happen in a layout
 * effect: before the browser paints, with the row still hidden.
 */
export const usePaletteRule = (
  fontFamily: string,
  theme: ResolvedTheme | null,
  rowRef: RefObject<HTMLDivElement | null>,
): PaletteIdents | null | undefined => {
  const key =
    theme === null
      ? null
      : `${fontFamily}/${theme.base}/${JSON.stringify(theme.entries)}/${JSON.stringify(theme.marker)}`;
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
    if (theme.marker.length === 0) {
      setRegistered({key, idents: {row: rowIdent}});
      return;
    }
    // The marker rule is the row's rule with the marker colours on top (later entries win in CSS).
    const markerIdent = registerPalette(fontFamily, theme.base, [...rowEntries, ...resolve(theme.marker)]);
    setRegistered({key, idents: {row: rowIdent, marker: markerIdent}});
  }, [key, registered, theme, fontFamily, rowRef]);
  return idents;
};

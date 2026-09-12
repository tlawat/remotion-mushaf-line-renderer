import {type RefObject, useState} from 'react';
import {registerPalette} from '../../fonts/palette-store';
import {CURRENT_COLOR, entryColors} from '../../mushaf/colors';
import {type FontSetDefinition, MANDALA_PALETTE} from '../../mushaf/registry';
import type {MushafLineData} from '../../types';
import {useIsomorphicLayoutEffect} from './use-isomorphic-layout-effect';

/** The CPAL base palette a line paints with, or `undefined` for the font's own default. */
export const basePaletteOf = (line: MushafLineData): number | undefined =>
  line.palette ?? (line.look === 'mandala' ? MANDALA_PALETTE : undefined);

/**
 * The `font-palette` ident for a colour-font line: `undefined` when the line needs none (the font's
 * default palette, or the plain look), `null` while the rule is not in the document yet, the ident
 * once it is.
 *
 * The rule that names it has to be in the document before the row is painted, and `currentColor`
 * has to be resolved from the row's computed colour first (COLR glyphs ignore CSS `color`, and
 * Chromium drops `currentColor` inside `override-colors`), so both happen in a layout effect —
 * before the browser paints, with the row still hidden.
 */
export const usePaletteRule = (
  line: MushafLineData,
  fontSet: FontSetDefinition,
  rowRef: RefObject<HTMLDivElement | null>,
): string | null | undefined => {
  const base = basePaletteOf(line);
  const key =
    base === undefined && line.colors === undefined
      ? null
      : `${line.fontFamily}/${base ?? 0}/${JSON.stringify(line.colors ?? {})}`;
  const [registered, setRegistered] = useState<{key: string; ident: string} | null>(null);
  const ident = key === null ? undefined : registered?.key === key ? registered.ident : null;
  useIsomorphicLayoutEffect(() => {
    if (key === null || registered?.key === key) return;
    const row = rowRef.current;
    const inherited = row && typeof getComputedStyle === 'function' ? getComputedStyle(row).color : '';
    const entries = entryColors(fontSet, line.colors ?? {})
      // Where the inherited colour cannot be read, the entry is left out and the palette's own
      // colour stands, rather than guessing one.
      .map(([entry, color]) => [entry, color === CURRENT_COLOR ? inherited : color] as const)
      .filter((pair): pair is readonly [number, string] => pair[1] !== '');
    setRegistered({key, ident: registerPalette(line.fontFamily, base ?? 0, entries)});
  }, [key, registered, fontSet, line.fontFamily, line.colors, base, rowRef]);
  return ident;
};

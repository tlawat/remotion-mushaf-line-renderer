import {MushafError, describeValue} from './errors';
import type {MushafDefinition} from './mushafs';
import type {MushafColors} from './types';

/**
 * The CSS keyword meaning "the inherited `color`". COLR glyphs ignore `color`, and Chromium drops
 * `currentColor` inside `override-colors`, so `<MushafLine>` resolves it from the row's computed
 * colour and writes the resolved value into the palette rule.
 */
export const CURRENT_COLOR = 'currentColor';

/** The parts a palette can be recoloured by, in the order they are applied (shorthand first). */
export const COLOR_PARTS = ['text', 'rosette', 'outline', 'petals', 'jewel', 'fill'] as const;

export type ColorPart = (typeof COLOR_PARTS)[number];

/**
 * Colours end up inside a stylesheet, so the syntax is checked rather than trusted, in the three
 * shapes a colour comes in: `#rgb[a]` / `#rrggbb[aa]`, a keyword (`crimson`, `transparent`,
 * `currentColor`), or one function call (`rgb(...)`, `hsl(...)`, `color-mix(...)`). Nothing else can
 * get through, so a value can never close the rule it sits in. Where the browser can answer
 * (`CSS.supports`), it decides as well, so a typo fails loudly instead of dropping the palette.
 */
const CSS_COLOR = [/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, /^[a-z][a-z-]{0,31}$/i, /^[a-z][a-z-]{0,20}\([0-9a-z.,%\s/+-]{0,96}\)$/i];

export const assertCssColor = (field: string, value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  const supported = typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports('color', text);
  if (text === '' || !CSS_COLOR.some((shape) => shape.test(text)) || !supported) {
    throw new MushafError('BAD_COLOR', `${field} must be a CSS colour ("#1b6f3f", "rgb(27 111 63)", "crimson", "currentColor"), got ${describeValue(value)}.`, {[field]: value});
  }
  return text;
};

/** Validates a `MushafColors` object (the `mandala` option, and `MushafLineData.paletteColors`). */
export const assertMushafColors = (field: string, value: unknown): MushafColors => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MushafError('BAD_COLOR', `${field} must be an object of CSS colours (${COLOR_PARTS.join(', ')}), got ${describeValue(value)}.`, {[field]: value});
  }
  const out: Record<string, string> = {};
  for (const [key, colour] of Object.entries(value as Record<string, unknown>)) {
    if (!(COLOR_PARTS as readonly string[]).includes(key)) {
      throw new MushafError('BAD_COLOR', `${field}.${key} is not a colourable part. Known parts: ${COLOR_PARTS.join(', ')}.`, {[field]: value, part: key});
    }
    out[key] = assertCssColor(`${field}.${key}`, colour);
  }
  return out as MushafColors;
};

/**
 * Expands the parts into the font's CPAL entries: `text` covers every letter entry, `rosette` is the
 * shorthand for the three ornament parts, and a named part wins over the shorthand. Ascending by
 * entry so the same colours always produce the same rule (and the same ident).
 */
export const entryColors = (def: MushafDefinition, colors: MushafColors): ReadonlyArray<readonly [number, string]> => {
  const roles = def.paletteRoles;
  const byEntry = new Map<number, string>();
  const apply = (entries: readonly number[], colour: string | undefined) => {
    if (colour === undefined) return;
    for (const entry of entries) byEntry.set(entry, colour);
  };
  apply(roles.text, colors.text);
  apply([...roles.outline, ...roles.petals, ...roles.jewel], colors.rosette);
  apply(roles.outline, colors.outline);
  apply(roles.petals, colors.petals);
  apply(roles.jewel, colors.jewel);
  apply(roles.fill, colors.fill);
  return [...byEntry.entries()].sort((a, b) => a[0] - b[0]);
};

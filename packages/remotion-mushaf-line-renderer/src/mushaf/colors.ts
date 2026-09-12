import {describeValue, MushafError} from '../errors';

/**
 * The CSS keyword meaning "the inherited `color`". COLR glyphs ignore `color`, and Chromium drops
 * `currentColor` inside `override-colors`, so `<MushafLine>` resolves it from the row's computed
 * colour and writes the resolved value into the palette rule.
 */
export const CURRENT_COLOR = 'currentColor';

/**
 * Colours end up inside a stylesheet, so the syntax is checked rather than trusted, in the three
 * shapes a colour comes in: `#rgb[a]` / `#rrggbb[aa]`, a keyword (`crimson`, `transparent`,
 * `currentColor`), or one function call (`rgb(...)`, `hsl(...)`, `color-mix(...)`). Nothing else can
 * get through, so a value can never close the rule it sits in. Where the browser can answer
 * (`CSS.supports`), it decides as well, so a typo fails loudly instead of dropping the palette.
 */
const CSS_COLOR = [
  /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  /^[a-z][a-z-]{0,31}$/i,
  /^[a-z][a-z-]{0,20}\([0-9a-z.,%\s/+-]{0,96}\)$/i,
];

export const assertCssColor = (field: string, value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  const supported = typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports('color', text);
  if (text === '' || !CSS_COLOR.some((shape) => shape.test(text)) || !supported) {
    throw new MushafError(
      'BAD_COLOR',
      `${field} must be a CSS colour ("#1b6f3f", "rgb(27 111 63)", "crimson", "currentColor"), got ${describeValue(value)}.`,
      {[field]: value},
    );
  }
  return text;
};

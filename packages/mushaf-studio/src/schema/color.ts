// The colour arithmetic behind the marks: WCAG luminance and contrast, OKLCH, and the guards that
// keep a chosen colour readable on its ground. Pure functions of their arguments, so a frame always
// paints the same; nothing here is written back into the props (the saved colour stays the user's).
import {interpolateColors} from 'remotion';

/** A colour as sRGB channels 0-255 and an alpha 0-1. */
export type Rgba = {readonly r: number; readonly g: number; readonly b: number; readonly a: number};

/** A colour in OKLCH: lightness 0-1, chroma (0 to about 0.37 in sRGB), hue in degrees. */
export type Oklch = {readonly l: number; readonly c: number; readonly h: number};

/** The chroma a tint or a wash is capped at: a neon yellow becomes antique gold, a teal stays a quiet teal. */
export const ACCENT_CHROMA = 0.09;

/** The contrast a tinted word keeps on its ground (5:1, above WCAG's 4.5:1 for text). */
export const ACCENT_CONTRAST = 5;

/** The contrast under which a translation, gloss or label colour gives way to `readableInk()`. */
export const TEXT_CONTRAST = 4.5;

/** A wash is never painted stronger than this, whatever multiplies into it. */
export const WASH_ALPHA_CAP = 0.16;

/** The grounds `groundOf()` stands in when the page colour is not what the text sits on. */
const IVORY = '#f8f3e6';
const CHARCOAL = '#121416';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;

/**
 * `color` as channels: `#rgb[a]`, `#rrggbb[aa]`, `rgb()` / `rgba()` (comma or space syntax), or any
 * name Remotion's `interpolateColors()` knows (`transparent`, `crimson`). `null` for anything else
 * (a `color-mix()`, a typo): the callers then leave the colour as it is.
 */
export const parseColor = (color: string): Rgba | null => {
  const text = color.trim();
  const hex = HEX.exec(text)?.[1];
  if (hex !== undefined) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const channel = (i: number) => Number.parseInt(full.slice(i, i + 2), 16);
    return {r: channel(0), g: channel(2), b: channel(4), a: full.length === 8 ? channel(6) / 255 : 1};
  }
  const rgb = RGB.exec(text);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : Number(rgb[4]);
    return {r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: clamp(alpha, 0, 1)};
  }
  try {
    const normalised = interpolateColors(0, [0, 1], [text, text]);
    const named = RGB.exec(normalised);
    return named ? {r: Number(named[1]), g: Number(named[2]), b: Number(named[3]), a: Number(named[4] ?? 1)} : null;
  } catch {
    return null;
  }
};

const toHexByte = (value: number): string =>
  Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, '0');

/** `#rrggbb` of the channels (the alpha is dropped). */
export const toHex = ({r, g, b}: Pick<Rgba, 'r' | 'g' | 'b'>): string =>
  `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (value: number): number => {
  const c = clamp(value, 0, 1);
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};

/** WCAG relative luminance, 0 (black) to 1 (white): ivory `#f8f3e6` is 0.90, charcoal `#121416` 0.007. */
export const relativeLuminance = (color: string): number => {
  const rgb = parseColor(color);
  if (rgb === null) return 0;
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
};

/** WCAG contrast ratio of two colours, 1 to 21: `contrast('#1c1a16', '#f8f3e6')` is 15.7. */
export const contrast = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Whether a ground is light (luminance over 0.35): ivory and paper are, charcoal and Madinah green are not. */
export const isLightGround = (ground: string): boolean => relativeLuminance(ground) > 0.35;

/** `color` in OKLCH, or `null` when it cannot be read. */
export const toOklch = (color: string): Oklch | null => {
  const rgb = parseColor(color);
  if (rgb === null) return null;
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI};
};

/** The sRGB channels of an OKLCH colour, each clipped into the gamut. */
export const fromOklch = ({l, c, h}: Oklch): Rgba => {
  const hue = (h * Math.PI) / 180;
  const A = c * Math.cos(hue);
  const B = c * Math.sin(hue);
  const lc = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const mc = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const sc = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: fromLinear(4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc),
    g: fromLinear(-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc),
    b: fromLinear(-0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc),
    a: 1,
  };
};

/** `color` with its OKLCH chroma capped at `max` (lightness and hue kept), as `#rrggbb`; unreadable colours unchanged. */
export const capChroma = (color: string, max: number = ACCENT_CHROMA): string => {
  const oklch = toOklch(color);
  if (oklch === null) return color;
  return toHex(fromOklch({...oklch, c: Math.min(oklch.c, max)}));
};

/**
 * The tint colour of `color` on `ground`: its chroma capped at 0.09, then its OKLCH lightness moved
 * 0.01 at a time toward the ink side (darker on a light ground, lighter on a dark one) until it
 * reads at 5:1, hue kept. `legibleAccent('#b8913a', '#f8f3e6')` is `#806321` (5.1:1);
 * `legibleAccent('#b8913a', '#121416')` is `#b19353` (6.3:1). An unreadable colour comes back as it is.
 */
export const legibleAccent = (color: string, ground: string): string => {
  const oklch = toOklch(color);
  if (oklch === null || parseColor(ground) === null) return color;
  const step = isLightGround(ground) ? -0.01 : 0.01;
  const c = Math.min(oklch.c, ACCENT_CHROMA);
  let l = oklch.l;
  let hex = toHex(fromOklch({l, c, h: oklch.h}));
  // At most 100 steps: L runs out at 0 or 1, where the loop stops whatever the contrast.
  while (contrast(hex, ground) < ACCENT_CONTRAST && l > 0 && l < 1) {
    l = clamp(l + step, 0, 1);
    hex = toHex(fromOklch({l, c, h: oklch.h}));
  }
  return hex;
};

/** The wash's strength on a ground: 0.10 on a light one, 0.13 on a dark one. Never set by the user. */
export const washAlpha = (ground: string): number => (isLightGround(ground) ? 0.1 : 0.13);

/**
 * The wash colour: `color` with its chroma capped (no lightness change) at `alpha`, capped at 0.16,
 * as `rgba()`. A colour's own alpha is ignored, so a saved `rgba(200,164,92,0.18)` paints like
 * `#c8a45c`. `washColor('#b8913a', 0.1)` is `rgba(177, 147, 83, 0.1)`.
 */
export const washColor = (color: string, alpha: number): string => {
  const capped = parseColor(capChroma(color)) ?? {r: 0, g: 0, b: 0, a: 1};
  const a = Math.round(clamp(alpha, 0, WASH_ALPHA_CAP) * 10_000) / 10_000;
  return `rgba(${Math.round(capped.r)}, ${Math.round(capped.g)}, ${Math.round(capped.b)}, ${a})`;
};

/** `a` mixed `amount` of the way to `b` in sRGB, as `#rrggbb`: `mixColors(ink, ground, 0.32)` is 68 % ink. */
export const mixColors = (a: string, b: string, amount: number): string => {
  const from = parseColor(a);
  const to = parseColor(b);
  if (from === null || to === null) return a;
  const t = clamp(amount, 0, 1);
  return toHex({r: from.r + (to.r - from.r) * t, g: from.g + (to.g - from.g) * t, b: from.b + (to.b - from.b) * t});
};

/**
 * A translation, gloss or label colour as drawn: `color` when it reads at 4.5:1 on `ground`, else
 * the ink mixed a third of the way into the ground (`mixColors(ink, ground, 0.32)`), so a muted
 * colour never fades into the page. `readableInk('#c9c1b2', '#1c1a16', '#f8f3e6')` is the mixed ink.
 */
export const readableInk = (color: string, ink: string, ground: string): string =>
  contrast(color, ground) >= TEXT_CONTRAST ? color : mixColors(ink, ground, 0.32);

/**
 * The colour the marks are measured against: the page colour, unless the text does not sit on it
 * (an image or a video behind, or a page colour more than half transparent, as in a slot): then a
 * stand-in from the ink, charcoal under light ink and ivory under dark ink.
 */
export const groundOf = (
  layout: {readonly background: string; readonly color: string},
  kind: 'color' | 'image' | 'video' | 'gradient' = 'color',
): string => {
  const page = parseColor(layout.background);
  if (kind !== 'image' && kind !== 'video' && page !== null && page.a >= 0.5) return layout.background;
  return relativeLuminance(layout.color) > 0.5 ? CHARCOAL : IVORY;
};

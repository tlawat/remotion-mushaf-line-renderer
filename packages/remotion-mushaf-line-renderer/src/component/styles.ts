import type * as React from 'react';
import {describeValue, MushafError} from '../errors';
import {getMushafMetrics} from '../mushaf/registry';
import type {MushafId} from '../types';

/**
 * The type size at which *every* line of the mushaf fits a box `width` pixels wide: the widest line
 * in the dataset is `referenceLineWidth` font units, so this size never overflows. 1920 → 108 px.
 *
 * It is the starting size, not the final one. Lines are not all the same width (full lines run from
 * about 39,000 to 43,700 units), so `<MushafLine>` scales this base so the line fills its box exactly
 * — see the `fit` prop. With `fit="mushaf"` this size is used as it is and shorter lines stop short
 * of the margin, which is the one-size-for-the-whole-mushaf look.
 *
 * `<MushafLine>` uses it with the composition width by default; pass your own measure when the line
 * sits inside margins: `fontSizeForWidth(width - 2 * margin)`.
 */
export const fontSizeForWidth = (width: number, mushaf?: MushafId): number => {
  const metrics = getMushafMetrics(mushaf);
  return Math.floor((width * metrics.unitsPerEm) / metrics.referenceLineWidth);
};

/**
 * 2.2 em keeps the glyph extremes (+1.368 em / −0.729 em around the baseline, with the pinned
 * ascent/descent) inside the box, so stacked lines never overlap: 112 → 246 px, 15 lines ≈ 1.94 × W.
 */
export const lineHeightForFontSize = (fontSize: number): number => Math.round(fontSize * 2.2);

export const assertSize = (name: 'fontSize' | 'lineHeight', value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new MushafError(
      'BAD_SIZE',
      `${name} must be a positive finite number of pixels, got ${describeValue(value)}.`,
      {[name]: value},
    );
  }
  return value;
};

export const buildRootStyle = (lineHeight: number, user: React.CSSProperties | undefined): React.CSSProperties => ({
  position: 'relative',
  display: 'block',
  boxSizing: 'border-box',
  width: '100%',
  height: lineHeight,
  margin: 0,
  padding: 0,
  overflow: 'visible',
  ...user,
});

export type RowStyleInput = {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly centered: boolean;
  readonly visible: boolean;
  /** `font-palette` ident for a colour font, from `paletteIdent()`. Omitted leaves the font's default palette. */
  readonly fontPalette?: string;
  /** A slice is in effect: the words that remain are centred (the hidden ones take no space). */
  readonly sliced?: boolean;
};

/**
 * The line row. Glyph advances already include the inter-word gaps, so the words are laid out with no
 * spaces **and no added justification**: the cursor starts at the right margin and each word follows
 * at its own advance, exactly as the page font was designed. Distributing leftover width between the
 * words (`space-between`) would inflate every gap by whatever the line falls short — the printed
 * spacing is the font's, not the layout's. Centred lines are centred instead — and so is a sliced
 * line, whose remaining words form one run at their own advances.
 *
 * Everything that could change glyph widths is pinned so inherited CSS cannot leak in.
 */
export const buildRowStyle = ({
  fontFamily,
  fontSize,
  lineHeight,
  centered,
  visible,
  fontPalette,
  sliced = false,
}: RowStyleInput): React.CSSProperties => ({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'nowrap',
  alignItems: 'stretch',
  justifyContent: centered || sliced ? 'center' : 'flex-start',
  direction: 'rtl',
  unicodeBidi: 'isolate',
  whiteSpace: 'nowrap',
  fontFamily: `"${fontFamily}"`,
  // Set only when the data asks for a palette: left alone, `font-palette` inherits, so a caller can
  // still choose one on an ancestor with their own @font-palette-values rule.
  ...(fontPalette === undefined ? {} : {fontPalette}),
  fontSize: `${fontSize}px`,
  lineHeight: `${lineHeight}px`,
  fontWeight: 400,
  fontStyle: 'normal',
  fontVariant: 'normal',
  fontSynthesis: 'none',
  fontFeatureSettings: 'normal',
  fontKerning: 'auto',
  letterSpacing: 0,
  wordSpacing: 0,
  textTransform: 'none',
  textDecoration: 'none',
  textIndent: 0,
  textAlign: 'start',
  margin: 0,
  padding: 0,
  overflow: 'visible',
  // Fallback fonts render wrong Arabic words, not blanks: never paint before the page font is in document.fonts.
  visibility: visible ? 'visible' : 'hidden',
});

/** A word a slice hides. `display: none` so the words that remain close up into one centred run. */
export const HIDDEN_WORD_STYLE: React.CSSProperties = {display: 'none'};

export const WORD_STYLE: React.CSSProperties = {
  display: 'block',
  position: 'relative',
  flex: '0 0 auto',
  margin: 0,
  padding: 0,
  whiteSpace: 'nowrap',
};

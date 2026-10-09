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
  // Off: some words are a word glyph that already carries its waqf mark plus a zero-width mark glyph,
  // and the page font's kerning between the two moves that mark's copy sideways, so the mark shows
  // twice and the next word is pulled closer (e.g. 10:1:1 p208, 13:1:1 p249, 15:1:1 p262 in the plain
  // set). Without kerning the copies coincide; ordinary words' marks keep their place.
  fontKerning: 'none',
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

/** The row of a glyph element (a surah name, a basmalah, a juz name): the glyphs stack in it, each centred. */
export const buildGlyphRowStyle = (visible: boolean): React.CSSProperties => ({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  margin: 0,
  padding: 0,
  overflow: 'visible',
  // Never paint a fallback font: a system font would draw the private code points as other letters.
  visibility: visible ? 'visible' : 'hidden',
});

export type GlyphStyleInput = {
  readonly fontFamily: string;
  readonly fontSize: number;
  /** The row's height: the glyph is centred in one line box of this height. */
  readonly lineHeight: number;
  /** Vertical correction in em, so the glyph's ink (not its em box) sits in the middle; 0 keeps the baseline. */
  readonly shiftEm: number;
};

/**
 * One glyph of a shared font, filling its row: centred horizontally by `text-align`, vertically by
 * a single line box as tall as the row, then shifted by the glyph's own band so its ink is centred.
 * Every metric-affecting property is pinned, as on the word row.
 */
export const buildGlyphStyle = ({fontFamily, fontSize, lineHeight, shiftEm}: GlyphStyleInput): React.CSSProperties => ({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'block',
  textAlign: 'center',
  direction: 'rtl',
  unicodeBidi: 'isolate',
  whiteSpace: 'nowrap',
  fontFamily: `"${fontFamily}"`,
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
  margin: 0,
  padding: 0,
  overflow: 'visible',
  ...(shiftEm === 0 ? {} : {transform: `translateY(${shiftEm}em)`}),
});

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
/** Four decimals, like the translate: enough for any fade, and free of float noise such as 0.7250000000000001. */
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

export type WindowOpacityInput = {
  /** Index of the line in the window's `lines`. */
  readonly index: number;
  /** The window's fractional position (see `scrollPosition()`). */
  readonly position: number;
  readonly visibleLines: number;
  /** Opacity of a line one slot away from the centre; default 1 (no dimming). */
  readonly neighbourOpacity?: number;
};

/**
 * How much of a line the window edge lets through: 1 inside the window, fading to 0 over the last
 * line-height as the line crosses the edge, so a line slides in and out of the window as a fade,
 * not a cut. This part is the window's own (it goes on the slot) and never depends on `lineStyle`.
 */
export const windowEdgeOpacity = (distance: number, visibleLines: number): number =>
  round4(1 - clamp01(distance - (visibleLines - 1) / 2));

/**
 * The emphasis of a line by its distance from the centre: 1 in the centre slot, `neighbourOpacity`
 * one slot away, blended in between so the emphasis travels with the scroll. The default
 * `lineStyle` of `<MushafLineWindow>` is `{opacity: windowEmphasisOpacity(...)}`.
 */
export const windowEmphasisOpacity = (distance: number, neighbourOpacity: number): number =>
  round4(neighbourOpacity + (1 - neighbourOpacity) * (1 - clamp01(distance)));

/**
 * The opacity a line of `<MushafLineWindow>` ends up with under the default `lineStyle`: the edge
 * fade times the emphasis. Exported so a custom `lineStyle` can build on the same numbers, e.g.
 * `(line, ctx) => ({opacity: windowLineOpacity({...ctx, visibleLines: 3, neighbourOpacity: 0.3}), color: ...})`.
 */
export const windowLineOpacity = ({
  index,
  position,
  visibleLines,
  neighbourOpacity = 1,
}: WindowOpacityInput): number => {
  const distance = Math.abs(index - position);
  return round4(windowEdgeOpacity(distance, visibleLines) * windowEmphasisOpacity(distance, neighbourOpacity));
};

/** The window: a clipped block of `visibleLines` line-heights, the same normal-flow root as a line. */
export const buildWindowStyle = (
  visibleLines: number,
  lineHeight: number,
  user: React.CSSProperties | undefined,
): React.CSSProperties => ({
  position: 'relative',
  display: 'block',
  boxSizing: 'border-box',
  width: '100%',
  height: visibleLines * lineHeight,
  margin: 0,
  padding: 0,
  overflow: 'hidden',
  ...user,
});

/**
 * The track every slot sits on, translated by the position: one transform moves every line, so
 * they can never drift apart. Left sub-pixel on purpose (see `slideFadeStyle`).
 */
export const buildTrackStyle = (position: number, lineHeight: number): React.CSSProperties => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '100%',
  margin: 0,
  padding: 0,
  overflow: 'visible',
  transform: `translateY(${(-position * lineHeight).toFixed(4)}px)`,
});

/** The slot of line `index`: one line-height, placed so that line `position` lands in the middle of the window. */
export const buildSlotStyle = (
  index: number,
  visibleLines: number,
  lineHeight: number,
  edgeOpacity: number,
): React.CSSProperties => ({
  position: 'absolute',
  left: 0,
  right: 0,
  top: ((visibleLines - 1) / 2 + index) * lineHeight,
  height: lineHeight,
  margin: 0,
  padding: 0,
  opacity: edgeOpacity,
});

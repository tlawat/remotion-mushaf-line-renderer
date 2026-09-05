import type React from 'react';
import {MushafError, describeValue} from './errors';
import type {MushafDefinition} from './mushafs';

/**
 * The widest line in the mushaf is `referenceLineWidth` font units (42,501 for V4), so this size
 * lets every full line fit a box of the given width: 1920 → 112 px, 1080 → 63 px, 3840 → 225 px.
 * Integer so box edges stay on whole pixels.
 */
export const fontSizeForWidth = (width: number, def: MushafDefinition): number =>
  Math.floor((width * def.metrics.unitsPerEm) / def.metrics.referenceLineWidth);

/**
 * 2.2 em keeps the glyph extremes (+1.368 em / −0.729 em around the baseline, with the pinned
 * ascent/descent) inside the box, so stacked lines never overlap: 112 → 246 px, 15 lines ≈ 1.94 × W.
 */
export const defaultLineHeight = (fontSize: number): number => Math.round(fontSize * 2.2);

export const assertSize = (name: 'fontSize' | 'lineHeight', value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new MushafError('BAD_SIZE', `${name} must be a positive finite number of pixels, got ${describeValue(value)}.`, {[name]: value});
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
};

/**
 * The line row. Glyph advances already include the inter-word gaps, so words are laid out with no
 * spaces: centred lines are centred, all other lines fill the measure (`space-between` spreads only
 * the ≤5 % slack, which is how the printed page and QUL's `text-align-last: justify` behave).
 * Everything that could change glyph widths is pinned so inherited CSS cannot leak in.
 */
export const buildRowStyle = ({fontFamily, fontSize, lineHeight, centered, visible}: RowStyleInput): React.CSSProperties => ({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'nowrap',
  alignItems: 'stretch',
  justifyContent: centered ? 'center' : 'space-between',
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
  textAlign: 'start',
  margin: 0,
  padding: 0,
  overflow: 'visible',
  // Fallback fonts render wrong Arabic words, not blanks: never paint before the page font is in document.fonts.
  visibility: visible ? 'visible' : 'hidden',
});

export const WORD_STYLE: React.CSSProperties = {
  display: 'block',
  position: 'relative',
  flex: '0 0 auto',
  margin: 0,
  padding: 0,
  whiteSpace: 'nowrap',
};

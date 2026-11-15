// The wash as CSS on one element: a faint, soft-ended band painted as background layers of the
// element's own box. The compositions no longer paint words with it: a word's box is its advance,
// not its ink (an overhanging hamza-wasl alif fell outside it), and tiles that meet leave hairline
// seams, so the lines draw the wash themselves from the ink (`wordBandFrom()` and the renderer's
// `wordBand`). It stays for a band behind any other element, and for `activeWordStyleFrom()`.
import type * as React from 'react';

/** Which outer side of a word's band gets the soft round end: `start` is the right edge in RTL. */
export type WashCap = 'start' | 'end' | 'both' | 'none';

export type WashStyleOptions = {
  /** The band's colour with its alpha, from `washColor()`. */
  readonly color: string;
  /** Which outer side ends the run on this word. */
  readonly cap: WashCap;
  /**
   * The band's height. Default `1.65em`: the letter bodies and vowels, the kasra and tanween under
   * the letters inside its lower feather (the raised band of render-design.md 12.2, V11: 1.55 em let a kasra
   * touch its edge).
   */
  readonly height?: string | undefined;
  /** The band's place in the word's box, as a CSS background position. Default `55%`. */
  readonly y?: string | undefined;
};

/**
 * The band of the ayah wash, as the lines' `bandShape`: the renderer's (1.65 em at 55 %) with a
 * 0.6 em feather at its top and bottom and 0.9 em soft ends, so a band the length of an ayah reads
 * as light falling on the text, with no edge to read as a plate (render-design.md 5.1.3, deviation
 * 66). A word's band keeps the 0.22 em feather.
 */
export const AYAH_WASH_SHAPE = {feather: 0.6, end: 0.9} as const;

/** The feather at the band's top and bottom. */
const FEATHER = '0.22em';
/** The width of a round end: 0.35 em, never more than half the word. */
const CAP_WIDTH = 'min(0.35em, 50%)';

const band = (color: string): string =>
  `linear-gradient(to bottom, transparent 0, ${color} ${FEATHER}, ${color} calc(100% - ${FEATHER}), transparent 100%)`;

/** A half-ellipse tile whose solid core ends where the body's feather begins, so cap and body meet without a notch. */
const capAt = (color: string, inner: 'left' | 'right'): string =>
  `radial-gradient(farthest-side at ${inner} center, ${color} 72%, transparent 100%)`;

/**
 * The CSS of a word's wash: one band (`cap: 'none'`, inside a run), or a band with a round end on
 * its right (`'start'`, the first word in RTL), its left (`'end'`) or both (`'both'`, a lone word).
 *
 * ```ts
 * washStyle({color: washColor('#b8913a', 0.1), cap: 'both'});
 * ```
 */
export const washStyle = ({color, cap, height = '1.65em', y = '55%'}: WashStyleOptions): React.CSSProperties => {
  const tile = (width: string) => `${width} ${height}`;
  switch (cap) {
    case 'none':
      return {
        backgroundImage: band(color),
        backgroundSize: tile('100%'),
        backgroundPosition: `center ${y}`,
        backgroundRepeat: 'no-repeat',
      };
    case 'start':
      return {
        backgroundImage: `${capAt(color, 'left')}, ${band(color)}`,
        backgroundSize: `${tile(CAP_WIDTH)}, ${tile(`calc(100% - ${CAP_WIDTH})`)}`,
        backgroundPosition: `right ${y}, left ${y}`,
        backgroundRepeat: 'no-repeat',
      };
    case 'end':
      return {
        backgroundImage: `${capAt(color, 'right')}, ${band(color)}`,
        backgroundSize: `${tile(CAP_WIDTH)}, ${tile(`calc(100% - ${CAP_WIDTH})`)}`,
        backgroundPosition: `left ${y}, right ${y}`,
        backgroundRepeat: 'no-repeat',
      };
    case 'both':
      return {
        backgroundImage: `${capAt(color, 'left')}, ${band(color)}, ${capAt(color, 'right')}`,
        backgroundSize: `${tile(CAP_WIDTH)}, ${tile(`calc(100% - 2 * ${CAP_WIDTH})`)}, ${tile(CAP_WIDTH)}`,
        backgroundPosition: `right ${y}, center ${y}, left ${y}`,
        backgroundRepeat: 'no-repeat',
      };
  }
};

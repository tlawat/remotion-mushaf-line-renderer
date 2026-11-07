// The wash: a faint, soft-ended band painted behind a word, or behind an ayah's run of words on a
// line. Paint-only background layers on the word's own span, so the printed words (which abut with
// no gap) join into one band with no seam, and nothing about the line's metrics changes.
import type * as React from 'react';

/** Which outer side of a word's band gets the soft round end: `start` is the right edge in RTL. */
export type WashCap = 'start' | 'end' | 'both' | 'none';

export type WashStyleOptions = {
  /** The band's colour with its alpha, from `washColor()`. */
  readonly color: string;
  /** Which outer side ends the run on this word. */
  readonly cap: WashCap;
  /** The band's height. Default `1.55em`: the letter bodies and vowels, 0.32 em clear of the lines above and below. */
  readonly height?: string | undefined;
  /** The band's vertical centre in the word's box. Default `54%`. */
  readonly y?: string | undefined;
};

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
export const washStyle = ({color, cap, height = '1.55em', y = '54%'}: WashStyleOptions): React.CSSProperties => {
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

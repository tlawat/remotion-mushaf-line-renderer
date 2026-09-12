import {type RefObject, useState} from 'react';
import {useIsomorphicLayoutEffect} from './use-isomorphic-layout-effect';

export type LineFitOptions = {
  /** `false` for `fit="mushaf"` and for centred lines: the base size stands. */
  readonly enabled: boolean;
  /** Measuring is only meaningful once the page font is in. */
  readonly fontLoaded: boolean;
  /** Identifies one measurement: font family, base size and box width. */
  readonly fitKey: string;
  readonly rowRef: RefObject<HTMLDivElement | null>;
};

/**
 * Fits a justified line to its box: the scale factor to apply to the base font size, or `null`
 * while it is still unknown (the row stays hidden until then).
 *
 * The lines of the mushaf are not all equally wide, so a single type size cannot make each one
 * reach the margin; the page font's own advances must not be stretched either (that is what
 * inflates the word gaps). So the row is laid out at the base size and then scaled by
 * (box width / natural width), measured once per font+size from the word elements themselves.
 */
export const useLineFit = ({enabled, fontLoaded, fitKey, rowRef}: LineFitOptions): number | null => {
  const [fitted, setFitted] = useState<{key: string; scale: number} | null>(null);
  const scale = enabled ? (fitted?.key === fitKey ? fitted.scale : null) : 1;
  useIsomorphicLayoutEffect(() => {
    if (!enabled || !fontLoaded || fitted?.key === fitKey) return;
    const row = rowRef.current;
    if (!row) return;
    // Each word element is shrink-to-fit around its glyphs, so the sum of their widths is the line's
    // advance width. (`scrollWidth` cannot be used: it never reports less than the box.)
    let natural = 0;
    for (const child of Array.from(row.children)) natural += child.getBoundingClientRect().width;
    const box = row.getBoundingClientRect().width;
    // Where there is no layout to measure (jsdom, a zero-width box), the base size stands: the line
    // is still painted, just not fitted. The clamp is a guard against a pathological measurement,
    // not a design tolerance — real lines land within a few per cent of the base size.
    const measured = natural > 0 && box > 0 ? Math.min(2, Math.max(0.5, box / natural)) : 1;
    setFitted({key: fitKey, scale: measured});
  }, [enabled, fontLoaded, fitKey, fitted, rowRef]);
  return scale;
};

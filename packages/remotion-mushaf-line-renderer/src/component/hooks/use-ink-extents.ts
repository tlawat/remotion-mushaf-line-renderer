import {type RefObject, useState} from 'react';
import {measureInkOverhang} from '../bands';
import {useIsomorphicLayoutEffect} from './use-isomorphic-layout-effect';

/** Where a word's ink is on its row: px from the row's left edge, at the row's own scale. */
export type InkExtent = {readonly left: number; readonly right: number};

export type InkExtentsOptions = {
  /** Measure at all: the line has a `wordBand`. */
  readonly enabled: boolean;
  /** The row is laid out at its final size, in its page font (the fit is known, the font is in). */
  readonly laidOut: boolean;
  /** Identifies one measurement: font family, final size, box width and slice. */
  readonly key: string;
  /** The CSS `font` the words are set in, for the canvas. */
  readonly font: string;
  readonly rowRef: RefObject<HTMLDivElement | null>;
};

/**
 * The ink extent of every word of a row, by its index among the row's children: `null` while it is
 * not measured yet, an array (`undefined` for a word that takes no space) once it is. Measured once
 * per `key` in a layout effect, before the row is painted: each word's box from the DOM (divided by
 * the row's own scale, so a preview zoom or a presentation's transform does not count), widened by
 * how far its glyphs overhang their advance (`measureInkOverhang()`). Without a canvas, the boxes.
 */
export const useInkExtents = ({
  enabled,
  laidOut,
  key,
  font,
  rowRef,
}: InkExtentsOptions): readonly (InkExtent | undefined)[] | null => {
  const [measured, setMeasured] = useState<{key: string; extents: readonly (InkExtent | undefined)[]} | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!enabled || !laidOut || measured?.key === key) return;
    const row = rowRef.current;
    if (!row) return;
    const rowBox = row.getBoundingClientRect();
    const scale = row.offsetWidth > 0 && rowBox.width > 0 ? rowBox.width / row.offsetWidth : 1;
    const extents = Array.from(row.children).map((child): InkExtent | undefined => {
      const box = child.getBoundingClientRect();
      if (box.width === 0 && box.height === 0 && (child as HTMLElement).style.display === 'none') return undefined;
      const left = (box.left - rowBox.left) / scale;
      const right = (box.right - rowBox.left) / scale;
      const overhang = measureInkOverhang(child.textContent ?? '', font);
      return overhang === null ? {left, right} : {left: left - overhang.left, right: right + overhang.right};
    });
    setMeasured({key, extents});
  }, [enabled, laidOut, key, font, measured, rowRef]);
  return enabled && measured?.key === key ? measured.extents : null;
};

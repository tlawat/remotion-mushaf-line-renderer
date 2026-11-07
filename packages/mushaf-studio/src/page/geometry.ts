import {fontSizeForWidth, lineHeightForFontSize} from '@tlawat/remotion-mushaf-line';

/** Lines of a printed page of the V4 mushaf (pages 1-2 have 8, centred in the same grid). */
export const LINES_PER_PAGE = 15;

/**
 * Where the page sits in the frame and how it is divided, in px. The page box holds, from the
 * outside in, the border's band, a margin, and the text block of `LINES_PER_PAGE` line boxes of
 * `measure` × `lineHeight`; the page number's strip runs under the border. The band and the strip
 * are kept whatever `frame` and `pageNumber` say, so turning them on or off never moves a line.
 */
export type PageGeometry = {
  /** The width the lines are set to: what `fontSizeForWidth()` is given. */
  readonly measure: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  /** The border's band, on every side of the text block's margins. */
  readonly band: number;
  /** Between the band and the text block, left and right. */
  readonly padX: number;
  /** Between the band and the text block, top and bottom. */
  readonly padY: number;
  /** The strip under the border that holds the page number. */
  readonly footer: number;
  /** The page box. */
  readonly width: number;
  readonly height: number;
  /** The page box's top-left corner in the frame: centred. */
  readonly left: number;
  readonly top: number;
  /** The text block's top-left corner in the page box. */
  readonly textLeft: number;
  readonly textTop: number;
};

/** A page box's size for a measure, without its place in the frame. */
export type PageBox = Omit<PageGeometry, 'left' | 'top' | 'textLeft' | 'textTop'>;

/** The page box for a measure, its parts in type-size units so every aspect has the same proportions. */
export const pageBox = (measure: number): PageBox => {
  const fontSize = Math.max(1, fontSizeForWidth(measure));
  const lineHeight = lineHeightForFontSize(fontSize);
  const band = Math.round(0.5 * fontSize);
  const padX = Math.round(0.6 * fontSize);
  const padY = Math.round(0.25 * fontSize);
  const footer = Math.round(1.1 * fontSize);
  return {
    measure,
    fontSize,
    lineHeight,
    band,
    padX,
    padY,
    footer,
    width: measure + 2 * (band + padX),
    height: LINES_PER_PAGE * lineHeight + 2 * (band + padY) + footer,
  };
};

/** The share of the frame a page may fill: 84 % of its width, 92 % of its height. */
export const PAGE_FIT = {width: 0.84, height: 0.92} as const;

/** px kept clear above and below the page (the legend's band, `legendReserve()`). */
export type PageReserve = {readonly top: number; readonly bottom: number};

/**
 * The printed page in a frame of `size`: the widest measure whose page box fits in 84 % of the
 * width and 92 % of the height (less `reserve`, the legend's band), centred in the room the reserve
 * leaves. A wide or square frame is filled top to bottom (at 16:9 the page is 92 % of the height), a
 * tall one across (at 9:16, 84 % of the width). Pure, and the same for the same arguments on every
 * machine.
 */
export const pageGeometry = (
  size: {readonly width: number; readonly height: number},
  reserve: PageReserve = {top: 0, bottom: 0},
): PageGeometry => {
  const free = Math.max(1, size.height - reserve.top - reserve.bottom);
  const roomX = Math.max(1, Math.floor(PAGE_FIT.width * size.width));
  const roomY = Math.max(1, Math.min(Math.floor(PAGE_FIT.height * size.height), free));
  const fits = (measure: number) => {
    const box = pageBox(measure);
    return box.width <= roomX && box.height <= roomY;
  };
  // Both sides grow with the measure, so the largest that fits is a binary search away.
  let low = 1;
  let high = roomX;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  const box = pageBox(low);
  return {
    ...box,
    left: Math.round((size.width - box.width) / 2),
    top: Math.round(reserve.top + (free - box.height) / 2),
    textLeft: box.band + box.padX,
    textTop: box.band + box.padY,
  };
};

/** The row a printed line sits in: its number less one, a short page's lines centred in the grid. */
export const rowOf = (line: number, linesOnPage: number): number =>
  line - 1 + Math.max(0, LINES_PER_PAGE - linesOnPage) / 2;

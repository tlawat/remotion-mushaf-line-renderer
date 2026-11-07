// The page's geometry in the four frame shapes and the grid rows.
import {fontSizeForWidth, lineHeightForFontSize} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {LINES_PER_PAGE, PAGE_FIT, pageBox, pageGeometry, rowOf} from '../../../src/page';
import {ASPECTS, sizeForAspect} from '../../../src/schema';

const room = (size: {width: number; height: number}) => ({
  x: Math.floor(PAGE_FIT.width * size.width),
  y: Math.floor(PAGE_FIT.height * size.height),
});

describe('pageGeometry', () => {
  it.each(ASPECTS)('%s: the largest page that fits 84 % of the width and 92 % of the height, centred', (aspect) => {
    const size = sizeForAspect(aspect);
    const g = pageGeometry(size);
    const {x, y} = room(size);
    expect(g.fontSize).toBe(fontSizeForWidth(g.measure));
    expect(g.lineHeight).toBe(lineHeightForFontSize(g.fontSize));
    expect(g.width).toBe(g.measure + 2 * (g.band + g.padX));
    expect(g.height).toBe(LINES_PER_PAGE * g.lineHeight + 2 * (g.band + g.padY) + g.footer);
    expect(g.width).toBeLessThanOrEqual(x);
    expect(g.height).toBeLessThanOrEqual(y);
    const bigger = pageBox(g.measure + 1);
    expect(bigger.width > x || bigger.height > y).toBe(true);
    expect(Math.abs(g.left - (size.width - g.left - g.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(g.top - (size.height - g.top - g.height))).toBeLessThanOrEqual(1);
    expect(g.textLeft).toBe(g.band + g.padX);
    expect(g.textTop).toBe(g.band + g.padY);
  });

  it('scales the page to 92 % of the height at 16:9 and to 84 % of the width at 9:16', () => {
    const wide = pageGeometry(sizeForAspect('16:9'));
    // Within one step of the type size, which is whole px.
    expect(wide.height / 1080).toBeGreaterThan(0.87);
    expect(wide.height / 1080).toBeLessThanOrEqual(0.92);
    const tall = pageGeometry(sizeForAspect('9:16'));
    expect(tall.width / 1080).toBeGreaterThan(0.82);
    expect(tall.width / 1080).toBeLessThanOrEqual(0.84);
    expect(pageBox(tall.measure + 1).width).toBeGreaterThan(room(sizeForAspect('9:16')).x);
    for (const aspect of ['16:9', '1:1', '4:5'] as const) {
      const size = sizeForAspect(aspect);
      const g = pageGeometry(size);
      expect(pageBox(g.measure + 1).height, aspect).toBeGreaterThan(room(size).y);
      expect(g.width, aspect).toBeLessThan(room(size).x);
    }
  });

  it('keeps the same proportions in every shape', () => {
    const ratios = ASPECTS.map((aspect) => {
      const g = pageGeometry(sizeForAspect(aspect));
      return g.height / g.width;
    });
    // The same up to the rounding of whole-px type sizes and line boxes.
    for (const ratio of ratios) expect(Math.abs(ratio - ratios[0]!)).toBeLessThan(0.1);
  });

  it('fits the page around a reserved band and centres it in the room left, the same for the same arguments', () => {
    const size = sizeForAspect('16:9');
    const free = pageGeometry(size);
    const reserved = pageGeometry(size, {top: 0, bottom: 200});
    expect(reserved.height).toBeLessThanOrEqual(1080 - 200);
    expect(reserved.measure).toBeLessThan(free.measure);
    expect(reserved.top + reserved.height).toBeLessThanOrEqual(1080 - 200);
    expect(Math.abs(reserved.top - (880 - reserved.top - reserved.height))).toBeLessThanOrEqual(1);
    const above = pageGeometry(size, {top: 200, bottom: 0});
    expect(above.top).toBeGreaterThanOrEqual(200);
    expect(pageGeometry(size)).toEqual(pageGeometry(size));
  });
});

describe('rowOf', () => {
  it('puts line n in row n - 1, and a short page’s lines in the middle of the grid', () => {
    expect(rowOf(1, 15)).toBe(0);
    expect(rowOf(15, 15)).toBe(14);
    expect(rowOf(1, 8)).toBe(3.5);
    expect(rowOf(8, 8)).toBe(10.5);
  });
});

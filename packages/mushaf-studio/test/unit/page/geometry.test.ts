// The page's geometry in the four frame shapes and the grid rows.
import {fontSizeForWidth, lineHeightForFontSize} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {LINES_PER_PAGE, pageBox, pageGeometry, rowOf} from '../../../src/page';
import {ASPECTS, defaultLayout, sizeForAspect} from '../../../src/schema';

const room = (size: {width: number; height: number}, marginX = defaultLayout.marginX) => ({
  x: size.width - 2 * marginX,
  y: size.height - 2 * Math.round(marginX / 2),
});

describe('pageGeometry', () => {
  it.each(ASPECTS)('%s: the largest page that fits between the margins, centred, sized from its measure', (aspect) => {
    const size = sizeForAspect(aspect);
    const g = pageGeometry(defaultLayout, size);
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

  it('fills a tall frame across and a wide or square one top to bottom', () => {
    const tall = sizeForAspect('9:16');
    expect(pageBox(pageGeometry(defaultLayout, tall).measure + 1).width).toBeGreaterThan(room(tall).x);
    for (const aspect of ['16:9', '1:1', '4:5'] as const) {
      const size = sizeForAspect(aspect);
      const g = pageGeometry(defaultLayout, size);
      expect(pageBox(g.measure + 1).height, aspect).toBeGreaterThan(room(size).y);
      expect(g.width, aspect).toBeLessThan(room(size).x);
    }
  });

  it('gives the 16:9 page the height of the frame and the same proportions in every shape', () => {
    const wide = pageGeometry(defaultLayout, sizeForAspect('16:9'));
    expect(wide.measure).toBeGreaterThan(400);
    expect(wide.height / wide.width).toBeGreaterThan(1.5);
    const ratios = ASPECTS.map((aspect) => {
      const g = pageGeometry(defaultLayout, sizeForAspect(aspect));
      return g.height / g.width;
    });
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0]!, 1);
  });

  it('shrinks with wider margins and is the same for the same arguments', () => {
    const size = sizeForAspect('9:16');
    expect(pageGeometry({marginX: 300}, size).measure).toBeLessThan(pageGeometry({marginX: 120}, size).measure);
    expect(pageGeometry(defaultLayout, size)).toEqual(pageGeometry(defaultLayout, size));
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

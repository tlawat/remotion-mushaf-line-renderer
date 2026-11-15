import {describe, expect, it} from 'vitest';
import {
  backdropImage,
  bandsOf,
  chromaHueOf,
  DesignImageError,
  decodePng,
  deltaE2000,
  diffBox,
  diffColumnBands,
  dissolveShares,
  encodePng,
  groundColorOf,
  hexOf,
  type Image,
  inkBox,
  inkiestPixel,
  opacityIn,
  pixelAt,
  type Rgb,
  rgbOf,
  solidImage,
} from './design-image';

const IVORY = rgbOf('#f8f3e6');
const INK = rgbOf('#1c1a16');

/** `color` mixed over `ground` at `alpha`, per channel, as a browser composites it. */
const over = (ground: Rgb, color: Rgb, alpha: number): Rgb => ({
  r: Math.round(ground.r + (color.r - ground.r) * alpha),
  g: Math.round(ground.g + (color.g - ground.g) * alpha),
  b: Math.round(ground.b + (color.b - ground.b) * alpha),
});

/** `image` with a rectangle painted in `color`. */
const paint = (image: Image, x0: number, y0: number, x1: number, y1: number, color: Rgb): Image => {
  const data = new Uint8Array(image.data);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) data.set([color.r, color.g, color.b, 255], (y * image.width + x) * 4);
  return {...image, data};
};

describe('PNG', () => {
  it('reads back what it writes', () => {
    const image = paint(solidImage(7, 5, IVORY), 2, 1, 5, 4, INK);
    const back = decodePng(encodePng(image));
    expect(back.width).toBe(7);
    expect(back.height).toBe(5);
    expect(Array.from(back.data)).toEqual(Array.from(image.data));
  });

  it('refuses a file that is not a PNG', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(DesignImageError);
  });

  it('draws the backdrop of V19: a sky with two white stripes at 20 % and 80 %', () => {
    const backdrop = backdropImage(200, 20);
    expect(pixelAt(backdrop, 40, 10)).toEqual({r: 255, g: 255, b: 255});
    expect(pixelAt(backdrop, 160, 10)).toEqual({r: 255, g: 255, b: 255});
    expect(pixelAt(backdrop, 100, 0)).toEqual({r: 93, g: 127, b: 163});
  });
});

describe('colour', () => {
  it('reads and writes #rrggbb', () => {
    expect(rgbOf('#806321')).toEqual({r: 128, g: 99, b: 33});
    expect(hexOf({r: 128, g: 99, b: 33})).toBe('#806321');
    expect(() => rgbOf('gold')).toThrow(DesignImageError);
  });

  it('measures ΔE2000 as the reference pairs of Sharma et al. give it', () => {
    expect(deltaE2000(IVORY, IVORY)).toBe(0);
    // Black and white are 100 apart.
    expect(deltaE2000({r: 0, g: 0, b: 0}, {r: 255, g: 255, b: 255})).toBeCloseTo(100, 0);
    // A one-level step is far under what an eye sees.
    expect(deltaE2000(rgbOf('#806321'), rgbOf('#806322'))).toBeLessThan(1);
  });

  it('tells gold from ink by chroma and hue', () => {
    const gold = chromaHueOf(rgbOf('#806321'));
    expect(gold.chroma).toBeGreaterThan(30);
    expect(gold.hue).toBeGreaterThan(60);
    expect(gold.hue).toBeLessThan(100);
    expect(chromaHueOf(INK).chroma).toBeLessThan(5);
  });
});

describe('measures', () => {
  const page = solidImage(100, 60, IVORY);

  it('finds the ground in the corners, whatever is drawn in the middle', () => {
    expect(groundColorOf(paint(page, 20, 20, 80, 40, INK))).toEqual(IVORY);
  });

  it('reads the opacity of a word at rest', () => {
    const rest = paint(page, 30, 20, 60, 30, over(IVORY, INK, 0.6));
    expect(opacityIn(rest, {x0: 0, y0: 0, x1: 100, y1: 60}, IVORY, INK)).toBeCloseTo(0.6, 2);
    expect(opacityIn(page, {x0: 0, y0: 0, x1: 100, y1: 60}, IVORY, INK)).toBeCloseTo(0, 6);
    expect(inkiestPixel(rest, {x0: 0, y0: 0, x1: 100, y1: 60}, IVORY)).toEqual(over(IVORY, INK, 0.6));
  });

  it('joins rows across short gaps into bands', () => {
    expect(bandsOf([0, 3, 0, 4, 0, 0, 0, 5, 5, 0], {gap: 2})).toEqual([
      {start: 1, end: 4},
      {start: 7, end: 9},
    ]);
    expect(bandsOf([0, 0], {gap: 1})).toEqual([]);
    expect(bandsOf([2, 9, 2], {min: 5, origin: 10})).toEqual([{start: 11, end: 12}]);
  });

  it('boxes the ink and what changed', () => {
    const word = paint(page, 30, 20, 60, 30, INK);
    expect(inkBox(word, {x0: 0, y0: 0, x1: 100, y1: 60}, IVORY)).toEqual({x0: 30, y0: 20, x1: 60, y1: 30});
    expect(inkBox(page, {x0: 0, y0: 0, x1: 100, y1: 60}, IVORY)).toBeNull();
    expect(diffBox(page, word)).toEqual({x0: 30, y0: 20, x1: 60, y1: 30});
    expect(diffBox(page, page)).toBeNull();
    const two = paint(word, 70, 20, 80, 30, INK);
    expect(diffColumnBands(page, two, {x0: 0, y0: 0, x1: 100, y1: 60})).toEqual([
      {start: 30, end: 60},
      {start: 70, end: 80},
    ]);
    expect(() => diffBox(page, solidImage(10, 10, IVORY))).toThrow(DesignImageError);
  });

  it('tells the shares of two lines in one place, and how far the second has still to rise', () => {
    const first = paint(page, 10, 20, 40, 30, INK);
    const second = paint(page, 50, 22, 90, 32, INK);
    const mixed = paint(paint(page, 10, 20, 40, 30, over(IVORY, INK, 0.7)), 50, 22, 90, 32, over(IVORY, INK, 0.1));
    const fit = dissolveShares(mixed, first, second, {x0: 0, y0: 0, x1: 100, y1: 60}, IVORY, INK);
    expect(fit.a).toBeCloseTo(0.7, 1);
    expect(fit.b).toBeCloseTo(0.1, 1);
    const lower = paint(page, 50, 25, 90, 35, over(IVORY, INK, 0.5));
    const risen = dissolveShares(lower, first, second, {x0: 0, y0: 0, x1: 100, y1: 60}, IVORY, INK, 5);
    expect(risen.dy).toBe(3);
    expect(risen.b).toBeCloseTo(0.5, 1);
  });
});

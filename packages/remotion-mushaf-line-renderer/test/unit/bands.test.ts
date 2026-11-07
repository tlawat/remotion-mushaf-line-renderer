import {describe, expect, it} from 'vitest';
import {
  bandBoxes,
  bandGradient,
  bandProfile,
  bandRuns,
  DEFAULT_BAND_SHAPE,
  measureInkOverhang,
  parseBandColor,
  resolveBandShape,
} from '../../src/component/bands';

/** The profile's value at `x`, read back by linear interpolation between its points. */
const at = (profile: readonly (readonly [number, number])[], x: number): number => {
  for (let i = 1; i < profile.length; i++) {
    const [x0, v0] = profile[i - 1]!;
    const [x1, v1] = profile[i]!;
    if (x >= x0 && x <= x1) return x1 === x0 ? v1 : v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
  }
  return 0;
};

describe('bandProfile', () => {
  it('is empty without a segment of any strength', () => {
    expect(bandProfile([], 5, 20)).toEqual([]);
    expect(bandProfile([{left: 0, right: 10, strength: 0}], 5, 20)).toEqual([]);
  });

  it('is full over the ink and pad, with an S-curve end past it, starting and ending at 0', () => {
    const profile = bandProfile([{left: 100, right: 200, strength: 0.13}], 5, 20);
    expect(profile[0]).toEqual([75, 0]);
    expect(profile.at(-1)).toEqual([225, 0]);
    expect(at(profile, 95)).toBe(0.13);
    expect(at(profile, 150)).toBe(0.13);
    expect(at(profile, 205)).toBe(0.13);
    // Half-way down its end, half its strength; the S-curve is gentle at either end of it.
    expect(at(profile, 85)).toBeCloseTo(0.065, 4);
    expect(at(profile, 80)).toBeCloseTo(0.156 * 0.13, 4);
  });

  it('takes the stronger of two bands where they overlap, never their sum', () => {
    // A mark letting go (0.05) beside the next one coming in (0.13), their ends overlapping.
    const profile = bandProfile(
      [
        {left: 0, right: 100, strength: 0.05},
        {left: 110, right: 200, strength: 0.13},
      ],
      5,
      20,
    );
    const xs = Array.from({length: 251}, (_, i) => i - 25);
    for (const x of xs) {
      const one = at(bandProfile([{left: 0, right: 100, strength: 0.05}], 5, 20), x);
      const two = at(bandProfile([{left: 110, right: 200, strength: 0.13}], 5, 20), x);
      expect(at(profile, x)).toBeCloseTo(Math.max(one, two), 3);
    }
    // One run: the two bands touch.
    expect(bandRuns(profile)).toHaveLength(1);
  });

  it('joins the words of one run into one flat band, with no dip where they meet', () => {
    const profile = bandProfile(
      [
        {left: 0, right: 100, strength: 0.13},
        {left: 98, right: 180, strength: 0.13},
        {left: 182, right: 260, strength: 0.13},
      ],
      5,
      20,
    );
    expect(profile).toEqual([
      [-25, 0],
      [-20, 0.0203],
      // The curve's middle stretch is straight: no point is needed at its half-way mark.
      [-10, 0.1097],
      [-5, 0.13],
      [265, 0.13],
      [270, 0.1097],
      [280, 0.0203],
      [285, 0],
    ]);
  });

  it('keeps two bands apart as two runs when they do not touch', () => {
    const profile = bandProfile(
      [
        {left: 0, right: 50, strength: 0.1},
        {left: 200, right: 260, strength: 0.1},
      ],
      5,
      20,
    );
    const runs = bandRuns(profile);
    expect(runs).toHaveLength(2);
    expect(runs[0]![0]).toEqual([-25, 0]);
    expect(runs[0]!.at(-1)).toEqual([75, 0]);
    expect(runs[1]![0]).toEqual([175, 0]);
  });
});

describe('parseBandColor', () => {
  it('reads hex and rgb() colours, the alpha as the strength', () => {
    expect(parseBandColor('rgba(177, 147, 83, 0.13)')).toEqual({rgb: '177, 147, 83', alpha: 0.13});
    expect(parseBandColor('rgb(1 2 3 / 50%)')).toEqual({rgb: '1, 2, 3', alpha: 0.5});
    expect(parseBandColor('#b19353')).toEqual({rgb: '177, 147, 83', alpha: 1});
    expect(parseBandColor('#fff8')?.alpha).toBeCloseTo(0x88 / 255, 6);
  });

  it('gives null for a colour it cannot read', () => {
    expect(parseBandColor('crimson')).toBeNull();
    expect(parseBandColor('color-mix(in srgb, red 10%, transparent)')).toBeNull();
  });
});

describe('bandBoxes', () => {
  it('draws one box per run of one colour, from its first point to its last, its stops from its left edge', () => {
    const boxes = bandBoxes(
      [
        {left: 100, right: 200, color: 'rgba(177, 147, 83, 0.13)'},
        {left: 198, right: 300, color: 'rgba(177, 147, 83, 0.13)'},
      ],
      {fontSize: 100, lineHeight: 220},
    );
    expect(boxes).toHaveLength(1);
    const style = boxes[0]!.style;
    // pad 0.05 em and end 0.3 em past the ink on each side.
    expect(style.left).toBe(65);
    expect(style.width).toBe(270);
    // 1.65 em tall at 55 % of the 2.2 em box.
    expect(style.height).toBe(165);
    expect(style.top).toBe(30.25);
    expect(style.backgroundImage).toBe(
      'linear-gradient(to right, rgba(177, 147, 83, 0) 0px, rgba(177, 147, 83, 0.0203) 7.5px, rgba(177, 147, 83, 0.1097) 22.5px, rgba(177, 147, 83, 0.13) 30px, rgba(177, 147, 83, 0.13) 240px, rgba(177, 147, 83, 0.1097) 247.5px, rgba(177, 147, 83, 0.0203) 262.5px, rgba(177, 147, 83, 0) 270px)',
    );
    expect(style.borderRadius).toBe('30px / 50%');
    expect(style.maskImage).toBe(
      'linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%)',
    );
  });

  it('gives each colour its own boxes, and skips colours it cannot read or with no alpha', () => {
    const boxes = bandBoxes(
      [
        {left: 0, right: 50, color: 'rgba(10, 20, 30, 0.1)'},
        {left: 0, right: 50, color: 'rgba(40, 50, 60, 0.1)'},
        {left: 0, right: 50, color: 'crimson'},
        {left: 0, right: 50, color: 'rgba(10, 20, 30, 0)'},
      ],
      {fontSize: 50, lineHeight: 110},
    );
    expect(boxes.map((box) => box.key.split('@')[0])).toEqual(['10, 20, 30', '40, 50, 60']);
  });

  it('follows the shape it is given', () => {
    expect(resolveBandShape(undefined)).toEqual(DEFAULT_BAND_SHAPE);
    const [box] = bandBoxes([{left: 0, right: 100, color: '#000000'}], {
      fontSize: 100,
      lineHeight: 190,
      shape: {height: 1.35, y: 0.55, pad: 0, end: 0.2},
    });
    expect(box!.style.height).toBe(135);
    expect(box!.style.top).toBe(30.25);
    expect(box!.style.left).toBe(-20);
    expect(box!.style.width).toBe(140);
  });

  it('writes a gradient with its x from the run’s own left edge', () => {
    expect(
      bandGradient('1, 2, 3', [
        [10, 0],
        [20, 0.5],
        [30, 0],
      ]),
    ).toBe('linear-gradient(to right, rgba(1, 2, 3, 0) 0px, rgba(1, 2, 3, 0.5) 10px, rgba(1, 2, 3, 0) 20px)');
  });
});

describe('measureInkOverhang', () => {
  it('gives null where there is no canvas to measure on', () => {
    expect(typeof OffscreenCanvas).toBe('undefined');
    expect(measureInkOverhang('ﱉ', '90px "mushaf-qpc-v4-p1"')).toBeNull();
  });
});

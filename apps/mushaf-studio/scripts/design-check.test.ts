import {dissolve, INOUT} from '@tlawat/mushaf-studio';
import {describe, expect, it} from 'vitest';
import {DESIGN_CASES} from './design-cases';
import {
  bandNear,
  type CaseImages,
  CHECKS,
  checkAyahWash,
  checkJadwal,
  checkTint,
  checkV2,
  fitDissolve,
  fitEasing,
  formatReports,
  INKS,
  inkArea,
  legendRows,
  lineBands,
  metalColumns,
  runChecks,
  verdictOf,
} from './design-check';
import {type Image, type Rgb, rgbOf, solidImage} from './design-image';

const IVORY = rgbOf('#f8f3e6');
const INK = rgbOf('#1c1a16');

const mix = (ground: Rgb, ink: Rgb, alpha: number): Rgb => ({
  r: Math.round(ground.r + (ink.r - ground.r) * alpha),
  g: Math.round(ground.g + (ink.g - ground.g) * alpha),
  b: Math.round(ground.b + (ink.b - ground.b) * alpha),
});

const over = (alpha: number): Rgb => mix(IVORY, INK, alpha);

const paint = (image: Image, x0: number, y0: number, x1: number, y1: number, color: Rgb): Image => {
  const data = new Uint8Array(image.data);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) data.set([color.r, color.g, color.b, 255], (y * image.width + x) * 4);
  return {...image, data};
};

const noImages: CaseImages = {still: () => null, strip: () => null, duration: () => null, asset: () => null};

/** A V2 strip: one word filling from 0.6 to 1 over f58-f64, on an otherwise still page. */
const fillStrip = (stray = false): CaseImages => {
  const page = paint(solidImage(120, 60, IVORY), 70, 20, 110, 30, INK);
  const at = (frame: number): Image => {
    const k = Math.min(1, Math.max(0, (frame - 58) / 6));
    const word = paint(page, 20, 20, 60, 30, over(0.6 + 0.4 * k));
    return stray && frame === 62 ? paint(word, 0, 50, 4, 54, INK) : word;
  };
  return {...noImages, strip: (id, frame) => (id === 'V2' && frame >= 56 && frame <= 66 ? at(frame) : null)};
};

describe('the checks', () => {
  it('has a check for every case that is not a reference', () => {
    const ids = DESIGN_CASES.filter((c) => c.referenceOf === undefined).map((c) => c.id);
    expect(Object.keys(CHECKS).sort()).toEqual(ids.sort());
  });

  it('passes an ink fill that rises monotonically from rest to full ink', () => {
    const checks = checkV2(fillStrip());
    expect(checks.map((c) => c.pass)).toEqual([true, true, true, true]);
    expect(verdictOf(checks)).toBe(true);
  });

  it('fails a strip where something else changes on screen', () => {
    const checks = checkV2(fillStrip(true));
    expect(checks.find((c) => c.name === 'no other change on screen')?.pass).toBe(false);
    expect(verdictOf(checks)).toBe(false);
  });

  it('fails a case whose images are missing, and keeps going after a check that throws', () => {
    const reports = runChecks(noImages, ['V1', 'V12']);
    expect(reports.map((r) => r.pass)).toEqual([false, false]);
    expect(reports[0]?.checks[0]?.detail).toMatch(/missing/);
    const throwing: CaseImages = {
      ...noImages,
      still: () => {
        throw new Error('bad PNG');
      },
    };
    expect(runChecks(throwing, ['V12'])[0]?.checks[0]).toEqual({name: 'measure', pass: false, detail: 'bad PNG'});
  });

  it('reads a verdict only from what was measured', () => {
    expect(verdictOf([{name: 'a', pass: null, detail: ''}])).toBeNull();
    expect(
      verdictOf([
        {name: 'a', pass: null, detail: ''},
        {name: 'b', pass: true, detail: ''},
      ]),
    ).toBe(true);
    expect(formatReports([{id: 'V6', pass: null, checks: [{name: 'gold', pass: null, detail: 'by eye'}]}])).toBe(
      'LOOK  V6\n      look gold: by eye',
    );
  });

  it('reads the start and the length of an eased scroll off its progress', () => {
    const samples = Array.from({length: 50}, (_, i) => ({
      frame: 96 + i,
      progress: INOUT(Math.min(1, Math.max(0, (96 + i - 106) / 24))),
    }));
    const fit = fitEasing(samples, (t) => INOUT(t), {from: 96, to: 120, durations: [18, 30]});
    expect(fit.duration).toBe(24);
    expect(fit.start).toBeCloseTo(106, 1);
  });

  it('finds the band nearest a row', () => {
    const bands = [
      {start: 10, end: 20},
      {start: 40, end: 60},
    ];
    expect(bandNear(bands, 45)).toEqual({start: 40, end: 60});
    expect(bandNear([], 45)).toBeNull();
  });
});

const GREEN = rgbOf(INKS.green.ground);
const GREEN_INK = rgbOf(INKS.green.ink);
const GREEN_METAL = rgbOf('#cfae63');

/** A Madinah green frame at half scale: the jadwal's outer rule at the safe area, and lines inside it. */
const jadwalFrame = (lines: readonly {y0: number; y1: number; x0: number; x1: number; color: Rgb}[]): Image => {
  let image = solidImage(960, 540, GREEN);
  const rule = mix(GREEN, GREEN_METAL, 0.45);
  image = paint(image, 27, 27, 28, 513, rule);
  image = paint(image, 932, 27, 933, 513, rule);
  image = paint(image, 27, 27, 933, 28, rule);
  image = paint(image, 27, 512, 933, 513, rule);
  // The inner rule, 4 px in: the vertical rules have ink on every row of the lines.
  image = paint(image, 31, 31, 32, 509, rule);
  image = paint(image, 928, 31, 929, 509, rule);
  for (const line of lines) image = paint(image, line.x0, line.y0, line.x1, line.y1, line.color);
  return image;
};

describe('the checks that read lines inside a jadwal (V12)', () => {
  const f60 = jadwalFrame([
    {x0: 300, x1: 700, y0: 240, y1: 300, color: GREEN_INK},
    {x0: 250, x1: 750, y0: 334, y1: 400, color: mix(GREEN, GREEN_INK, 0.25)},
  ]);
  const f160 = jadwalFrame([
    // RTL: ayah 3 at the right, its rosette, ayah 4 at rest, its rosette at the left.
    {x0: 545, x1: 760, y0: 240, y1: 300, color: GREEN_INK},
    {x0: 500, x1: 540, y0: 250, y1: 290, color: GREEN_METAL},
    {x0: 232, x1: 495, y0: 240, y1: 300, color: mix(GREEN, GREEN_INK, 0.6)},
    {x0: 190, x1: 228, y0: 250, y1: 290, color: GREEN_METAL},
  ]);

  it('finds the lines inside the inner rule, though the rules run through every row', () => {
    expect(lineBands(f60, GREEN, 99)).toHaveLength(1);
    const inside = {x0: 35, y0: 35, x1: 925, y1: 505};
    expect(lineBands(f60, GREEN, 99, 12, inside)).toEqual([
      {start: 240, end: 300},
      {start: 334, end: 400},
    ]);
    expect(metalColumns(f160, {x0: 35, y0: 240, x1: 925, y1: 300})).toEqual([
      {start: 190, end: 228},
      {start: 500, end: 540},
    ]);
  });

  it('measures ayah 2, the line below and the ayat beside each other', () => {
    const images: CaseImages = {
      ...noImages,
      still: (id, frame) => (id !== 'V12' ? null : frame === 60 ? f60 : frame === 160 ? f160 : null),
    };
    const checks = checkJadwal(images);
    expect(checks.map((c) => [c.name, c.pass])).toEqual([
      ['rule at the safe area', true],
      ['gold at 0.45', true],
      ['ayah 2 full', true],
      ['the line below at 0.25', true],
      ['ayah 3 full at f160', true],
      ['ayah 4 at rest beside it (0.6)', true],
    ]);
  });

  it('fails what it could not measure instead of leaving it out', () => {
    const empty = jadwalFrame([]);
    const checks = checkJadwal({...noImages, still: (id) => (id === 'V12' ? empty : null)});
    expect(checks.filter((c) => c.pass === false).map((c) => c.name)).toEqual([
      'ayah 2 full',
      'the line below at 0.25',
      'ayah 4 at rest beside ayah 3',
    ]);
    expect(verdictOf(checks)).toBe(false);
  });
});

const CHARCOAL = rgbOf(INKS.charcoal.ground);
const CHARCOAL_INK = rgbOf(INKS.charcoal.ink);
const GOLD = rgbOf('#d8b56a');

/** Adds `lift` levels to every pixel of `rect` that is the ground, as a faint wash does. */
const lifted = (image: Image, rect: {x0: number; y0: number; x1: number; y1: number}, ground: Rgb, lift: number) => {
  const data = new Uint8Array(image.data);
  for (let y = rect.y0; y < rect.y1; y++)
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = (y * image.width + x) * 4;
      if (data[i] === ground.r && data[i + 1] === ground.g && data[i + 2] === ground.b)
        data.set([ground.r + lift, ground.g + lift, ground.b + lift], i);
    }
  return {...image, data};
};

describe('the band over an ayah and its rosette (V10)', () => {
  // A line of letters (vertical strokes) and, at its left end, a rosette drawn as a gold ring.
  let ref = solidImage(960, 540, CHARCOAL);
  for (let x = 400; x < 760; x += 12) ref = paint(ref, x, 240, x + 4, 300, CHARCOAL_INK);
  ref = paint(ref, 340, 240, 380, 242, GOLD);
  ref = paint(ref, 340, 298, 380, 300, GOLD);
  ref = paint(ref, 340, 240, 342, 300, GOLD);
  ref = paint(ref, 378, 240, 380, 300, GOLD);
  const run = {x0: 330, y0: 230, x1: 770, y1: 310};

  it('passes a band that lifts the ground inside the rosette as it does between the words', () => {
    const shot = lifted(ref, run, CHARCOAL, 20);
    const images: CaseImages = {...noImages, still: (id) => (id === 'V10' ? shot : id === 'V10-ref' ? ref : null)};
    const under = checkAyahWash(images, 'V10', 'landscape').find((c) => c.name === 'the band under the rosette');
    expect(under?.pass).toBe(true);
  });

  it('fails a rosette whose fills, in the ground’s colour, leave a hole in the band', () => {
    const shot = paint(lifted(ref, run, CHARCOAL, 20), 343, 243, 377, 297, CHARCOAL);
    const images: CaseImages = {...noImages, still: (id) => (id === 'V10' ? shot : id === 'V10-ref' ? ref : null)};
    const under = checkAyahWash(images, 'V10', 'landscape').find((c) => c.name === 'the band under the rosette');
    expect(under?.pass).toBe(false);
    expect(under?.detail).toMatch(/lift 0\.0 levels inside the rosette/);
  });
});

describe('the tint on a legible page (V7, V9)', () => {
  /** One line of four words on `ground`; the words of `tinted` (x ranges) drawn in `tint`. */
  const page = (ground: Rgb, ink: Rgb, tinted: readonly [number, number][], tint: Rgb): Image => {
    let image = solidImage(960, 540, ground);
    for (const [x0, x1] of [
      [120, 220],
      [240, 340],
      [360, 460],
      [480, 580],
    ] as const)
      image = paint(image, x0, 250, x1, 290, tinted.some(([a]) => a === x0) ? tint : ink);
    return image;
  };
  const imagesOf = (ground: Rgb, ink: Rgb): CaseImages => ({
    ...noImages,
    still: (id, frame) => {
      if (id === 'V9-ref') return page(ground, ink, [], ink);
      if (id !== 'V9') return null;
      // At f56 the word before is tinted; at f63 the word being recited, and the one before letting go.
      return frame === 56
        ? page(ground, ink, [[360, 460]], rgbOf('#b19353'))
        : page(ground, ink, [[240, 340]], rgbOf('#b19353'));
    },
  });

  it('passes the gold on charcoal with white words', () => {
    const checks = checkTint(imagesOf(CHARCOAL, rgbOf('#ffffff')), 'V9', '#b19353', INKS.charcoal);
    expect(checks.find((c) => c.name === 'the unmarked words legible on the ground')?.pass).toBe(true);
    expect(checks.find((c) => c.name.startsWith('1:2:4 in'))?.pass).toBe(true);
  });

  it('fails white words on an ivory page, whatever colour the mark is', () => {
    const checks = checkTint(imagesOf(IVORY, rgbOf('#ffffff')), 'V9', '#b19353', INKS.ivory);
    expect(checks.find((c) => c.name === 'the unmarked words legible on the ground')?.pass).toBe(false);
    expect(verdictOf(checks)).toBe(false);
  });
});

describe('the other measures', () => {
  it('reads the length of a dissolve off its shares, at either tempo', () => {
    for (const duration of [10, 20, 28]) {
      const samples = Array.from({length: 50}, (_, i) => {
        const shares = dissolve(96 + i - 106, duration);
        return {frame: 96 + i, a: shares.out, b: shares.in};
      });
      expect(fitDissolve(samples, {from: 96, to: 140, durations: [6, 48]})).toMatchObject({start: 106, duration});
    }
  });

  it('takes the last bands, joined while close, as the legend, however many rows, and the text above them', () => {
    const bands = [
      {start: 100, end: 160},
      {start: 200, end: 262},
      {start: 330, end: 342},
      {start: 348, end: 360},
      {start: 366, end: 378},
    ];
    expect(legendRows(bands, 99)).toEqual({rows: bands.slice(2), above: bands[1]});
    // A gap wider than 0.12 of a line box ends the legend: the page number above it is not a row.
    const page = [
      {start: 20, end: 420},
      {start: 432, end: 440},
      {start: 462, end: 474},
    ];
    expect(legendRows(page, 99)).toEqual({rows: [page[2]], above: page[1]});
    expect(legendRows([], 99)).toEqual({rows: [], above: null});
  });

  it('measures ink as an area, so a size reads as the square root of a ratio', () => {
    const small = paint(solidImage(100, 100, IVORY), 10, 10, 30, 30, INK);
    const large = paint(solidImage(100, 100, IVORY), 10, 10, 40, 40, INK);
    const all = {x0: 0, y0: 0, x1: 100, y1: 100};
    expect(Math.sqrt(inkArea(large, all, IVORY, INK) / inkArea(small, all, IVORY, INK))).toBeCloseTo(1.5, 5);
  });
});

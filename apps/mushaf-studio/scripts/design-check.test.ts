import {INOUT} from '@tlawat/mushaf-studio';
import {describe, expect, it} from 'vitest';
import {DESIGN_CASES} from './design-cases';
import {
  bandNear,
  type CaseImages,
  CHECKS,
  checkV2,
  fitEasing,
  formatReports,
  runChecks,
  verdictOf,
} from './design-check';
import {type Image, type Rgb, rgbOf, solidImage} from './design-image';

const IVORY = rgbOf('#f8f3e6');
const INK = rgbOf('#1c1a16');

const over = (alpha: number): Rgb => ({
  r: Math.round(IVORY.r + (INK.r - IVORY.r) * alpha),
  g: Math.round(IVORY.g + (INK.g - IVORY.g) * alpha),
  b: Math.round(IVORY.b + (INK.b - IVORY.b) * alpha),
});

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

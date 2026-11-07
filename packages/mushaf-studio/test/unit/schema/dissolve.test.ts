// The staggered dissolve (render-design.md 3.2), the one shape of every text change: never two
// lines of text at reading strength, never an empty frame.
import {describe, expect, it} from 'vitest';
import {DURATIONS, dissolve, SINE, SOFT} from '../../../src/schema';

/** Every length a dissolve runs at: the design's test lengths, and each dissolving token at both tempos. */
const LENGTHS = [
  ...new Set([
    12,
    18,
    20,
    27,
    28,
    30,
    ...(['Dmin', 'lineDissolve', 'ayahDissolve', 'translationDissolve', 'endFade', 'labelChange'] as const).flatMap(
      (token) => [DURATIONS[token].calm, DURATIONS[token].slow],
    ),
  ]),
].sort((a, b) => a - b);

describe('dissolve', () => {
  it.each(LENGTHS)('over %i frames: never both above 0.2, never under 0.15 of ink on screen', (duration) => {
    for (let f = 0; f <= duration; f++) {
      const {out, in: incoming} = dissolve(f, duration);
      expect([f, out > 0.2 && incoming > 0.2]).toEqual([f, false]);
      expect([f, out + incoming >= 0.15]).toEqual([f, true]);
    }
  });

  it.each(LENGTHS)('over %i frames: the outgoing text is under 0.25 when the incoming one starts', (duration) => {
    const first = Array.from({length: duration + 1}, (_, f) => dissolve(f, duration)).find((o) => o.in > 0)!;
    expect(first.out).toBeLessThan(0.25);
  });

  it('is the outgoing text over the first 48 % on SINE and the incoming from 30 % to the end on SOFT', () => {
    // D = 20: out over f0-f10, in over f6-f20.
    expect(dissolve(0, 20)).toEqual({out: 1, in: 0});
    expect(dissolve(10, 20).out).toBe(0);
    expect(dissolve(6, 20).in).toBe(0);
    expect(dissolve(5, 20).out).toBeCloseTo(1 - SINE(0.5), 6);
    expect(dissolve(13, 20).in).toBeCloseTo(SOFT(0.5), 6);
    expect(dissolve(20, 20)).toEqual({out: 0, in: 1});
  });

  it('clamps outside the transition, and takes a one-frame dissolve', () => {
    expect(dissolve(-5, 20)).toEqual({out: 1, in: 0});
    expect(dissolve(50, 20)).toEqual({out: 0, in: 1});
    expect(dissolve(1, 1)).toEqual({out: 0, in: 1});
  });
});

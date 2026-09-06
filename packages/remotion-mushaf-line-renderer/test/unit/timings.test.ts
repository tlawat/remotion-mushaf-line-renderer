import {describe, expect, it} from 'vitest';
import {ENTER_EASING, EXIT_EASING, enterTiming, exitTiming, springyTiming} from '../../src/timings';
import {revealRtl, revealRtlStyle} from '../../src/presentations/reveal-rtl';
import {slideFade, slideFadeStyle} from '../../src/presentations/slide-fade';
import type * as React from 'react';

const fps = 30;
const sample = (timing: {getProgress: (o: {frame: number; fps: number}) => number}, frames: number) =>
  Array.from({length: frames + 1}, (_, frame) => timing.getProgress({frame, fps}));

const deltas = (values: number[]) => values.slice(1).map((v, i) => v - (values[i] as number));

describe('enterTiming / exitTiming', () => {
  it('defaults to 0.5 s in and 0.32 s out, and takes seconds or frames', () => {
    expect(enterTiming().getDurationInFrames({fps})).toBe(15);
    expect(exitTiming().getDurationInFrames({fps})).toBe(10);
    expect(enterTiming({seconds: 1}).getDurationInFrames({fps})).toBe(30);
    expect(enterTiming({durationInFrames: 7}).getDurationInFrames({fps})).toBe(7);
    // Seconds are resolved against the composition's fps, not baked in at call time.
    expect(enterTiming().getDurationInFrames({fps: 60})).toBe(30);
    // A zero-length window would divide by zero downstream; one frame is the floor.
    expect(enterTiming({durationInFrames: 0}).getDurationInFrames({fps})).toBe(1);
  });

  it('starts at 0, ends at exactly 1 and never goes backwards', () => {
    for (const timing of [enterTiming(), exitTiming(), enterTiming({seconds: 1})]) {
      const duration = timing.getDurationInFrames({fps});
      const values = sample(timing, duration + 3);
      expect(values[0]).toBe(0);
      expect(values[duration]).toBe(1);
      expect(values[duration + 3]).toBe(1); // clamped past the end
      for (const d of deltas(values)) expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it('eases at both ends on the way in and accelerates away on the way out (the "smooth" part)', () => {
    const inSteps = deltas(sample(enterTiming(), 15));
    // Both ends are gentle: the per-frame step rises to a peak and then falls, never the other way
    // round (a linear timing would be flat, starting and stopping abruptly).
    const peak = inSteps.indexOf(Math.max(...inSteps));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(inSteps.length - 1);
    for (let i = 1; i <= peak; i++) expect(inSteps[i]!).toBeGreaterThanOrEqual(inSteps[i - 1]! - 1e-9);
    for (let i = peak + 1; i < inSteps.length; i++) expect(inSteps[i]!).toBeLessThanOrEqual(inSteps[i - 1]! + 1e-9);
    // The tail is long: the last frame of the entrance moves a fraction of the peak frame.
    expect(inSteps[inSteps.length - 1]!).toBeLessThan(inSteps[peak]! / 5);
    // Ease-in: mirrored, the last frame moves the most.
    const outSteps = deltas(sample(exitTiming(), 10));
    expect(outSteps[outSteps.length - 1]!).toBeGreaterThan(outSteps[0]! * 3);
    // Half way through the entrance, most of the distance is already covered.
    expect(enterTiming().getProgress({frame: 7, fps})).toBeGreaterThan(0.8);
    // Half way through the exit, less than a third of it is — a linear curve would be at 0.5.
    expect(exitTiming().getProgress({frame: 5, fps})).toBeLessThan(0.4);
    expect(exitTiming().getProgress({frame: 5, fps})).toBeLessThan(enterTiming().getProgress({frame: 7, fps}));
  });

  it('exposes the curves and accepts a custom one', () => {
    expect(ENTER_EASING(0)).toBeCloseTo(0, 6);
    expect(ENTER_EASING(1)).toBeCloseTo(1, 6);
    expect(EXIT_EASING(0.5)).toBeLessThan(ENTER_EASING(0.5));
    const linear = enterTiming({durationInFrames: 10, easing: (t) => t});
    expect(linear.getProgress({frame: 5, fps})).toBeCloseTo(0.5, 6);
  });

  it('springyTiming measures its own duration and settles at 1', () => {
    const spring = springyTiming();
    const duration = spring.getDurationInFrames({fps});
    expect(duration).toBeGreaterThan(0);
    expect(spring.getProgress({frame: 0, fps})).toBeCloseTo(0, 6);
    expect(spring.getProgress({frame: duration, fps})).toBeCloseTo(1, 2);
    // damping 200 does not overshoot.
    for (let frame = 0; frame <= duration; frame++) expect(spring.getProgress({frame, fps})).toBeLessThanOrEqual(1.0001);
    expect(springyTiming({seconds: 0.5}).getDurationInFrames({fps})).toBe(15);
  });
});

describe('slideFade', () => {
  const style = slideFadeStyle;

  it('is a presentation, like the ones in @remotion/transitions', () => {
    const presentation = slideFade({distance: 10});
    expect(typeof presentation.component).toBe('function');
    expect(presentation.props).toEqual({distance: 10});
    expect(slideFade().props).toEqual({});
  });

  it('enters from below at full travel and lands exactly in place', () => {
    expect(style(0, 'entering')).toMatchObject({opacity: 0, transform: 'translateY(28.0000%)'});
    expect(style(1, 'entering')).toMatchObject({opacity: 1, transform: 'translateY(0.0000%)'});
  });

  it('reaches full opacity before the movement settles, so the end is a settle and not a fade', () => {
    // Fully opaque at 75 % of the window, while the line is still 7 % of a line box below its slot.
    expect(style(0.75, 'entering').opacity).toBe(1);
    expect(style(0.75, 'entering').transform).toBe('translateY(7.0000%)');
    expect(style(0.375, 'entering').opacity).toBeCloseTo(0.5, 6);
    // Opacity and movement are monotonic, and neither jumps between neighbouring frames.
    let previousOpacity = 0;
    let previousOffset = 28;
    for (let p = 0; p <= 1.0001; p += 1 / 15) {
      const {opacity, transform} = style(p, 'entering');
      const offset = Number(/-?[\d.]+/.exec(transform as string)?.[0]);
      expect(Number(opacity)).toBeGreaterThanOrEqual(previousOpacity);
      expect(offset).toBeLessThanOrEqual(previousOffset + 1e-9);
      expect(Math.abs(offset - previousOffset)).toBeLessThan(4);
      previousOpacity = Number(opacity);
      previousOffset = offset;
    }
  });

  it('leaves faster than it arrives, and travels less on the way out', () => {
    expect(style(0, 'exiting')).toMatchObject({opacity: 1, transform: 'translateY(0.0000%)'});
    expect(style(0.7, 'exiting').opacity).toBe(0);
    expect(style(1, 'exiting')).toMatchObject({opacity: 0, transform: 'translateY(-16.8000%)'});
    // Same progress, less travel and less opacity than the entering side: leaving is the quicker half.
    expect(Number(style(0.5, 'exiting').opacity)).toBeLessThan(1 - Number(style(0.5, 'entering').opacity));
  });

  it('honours direction, distance and the curve fractions', () => {
    expect(style(0, 'entering', {direction: 'down'}).transform).toBe('translateY(-28.0000%)');
    expect(style(0, 'entering', {distance: 50}).transform).toBe('translateY(50.0000%)');
    expect(style(0.5, 'entering', {enterOpacityAt: 1}).opacity).toBeCloseTo(0.5, 6);
    expect(style(0.9, 'exiting', {exitOpacityAt: 1}).opacity).toBeCloseTo(0.1, 6);
    expect(style(1, 'exiting', {exitDistanceScale: 1}).transform).toBe('translateY(-28.0000%)');
    expect(style(0.5, 'entering', {enterStyle: {filter: 'blur(1px)'}}).filter).toBe('blur(1px)');
  });
});

describe('revealRtl', () => {
  const style = (progress: number, direction: 'entering' | 'exiting', props = {}) =>
    revealRtlStyle(progress, direction, props) as React.CSSProperties & {maskImage?: string};

  it('is a presentation, like the ones in @remotion/transitions', () => {
    expect(typeof revealRtl().component).toBe('function');
    expect(revealRtl({softness: 8}).props).toEqual({softness: 8});
  });

  it('keeps the hard clip-path edge by default', () => {
    expect(style(0, 'entering').clipPath).toBe('inset(-100% 0 -100% 100.0000%)');
    expect(style(1, 'entering').clipPath).toBe('inset(-100% 0 -100% 0.0000%)');
    expect(style(0.25, 'exiting').clipPath).toBe('inset(-100% 25.0000% -100% 0)');
    expect(style(0.5, 'entering').maskImage).toBeUndefined();
  });

  it('fades the edge over `softness` % of the line when asked', () => {
    const soft = style(0.5, 'entering', {softness: 10});
    expect(soft.clipPath).toBeUndefined();
    expect(soft.maskImage).toBe('linear-gradient(to right, transparent 0 45.0000%, #000 55.0000% 100%)');
    const out = style(0.5, 'exiting', {softness: 10});
    expect(out.maskImage).toBe('linear-gradient(to right, #000 0 45.0000%, transparent 55.0000% 100%)');
    // The band is clamped at the edges of the line, never negative or past 100 %.
    expect(style(0, 'entering', {softness: 20}).maskImage).toContain('#000 100.0000% 100%');
    expect(style(1, 'entering', {softness: 20}).maskImage).toContain('transparent 0 0.0000%');
  });
});

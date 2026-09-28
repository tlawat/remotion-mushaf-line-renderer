import {linearTiming} from '@remotion/transitions';
import {describe, expect, it} from 'vitest';
import {scrollPosition} from '../../src/animation/scroll-position';
import {enterTiming, springyTiming} from '../../src/animation/timings';
import {windowEdgeOpacity, windowEmphasisOpacity, windowLineOpacity} from '../../src/component/styles';

const timing = linearTiming({durationInFrames: 10});
const at = (frame: number, steps: readonly number[], extra: Partial<Parameters<typeof scrollPosition>[0]> = {}) =>
  scrollPosition({frame, fps: 30, steps, timing, ...extra});

describe('scrollPosition', () => {
  it('is the line index at rest and eases through one line-height per step, finishing at the step', () => {
    const steps = [0, 30, 60];
    for (let f = 0; f <= 20; f++) expect(at(f, steps)).toBe(0);
    expect(at(21, steps)).toBeCloseTo(0.1);
    expect(at(25, steps)).toBeCloseTo(0.5);
    expect(at(29, steps)).toBeCloseTo(0.9);
    expect(at(30, steps)).toBe(1); // exactly: the settled frames are byte-identical
    for (let f = 30; f <= 50; f++) expect(at(f, steps)).toBe(1);
    expect(at(59, steps)).toBeCloseTo(1.9);
    expect(at(60, steps)).toBe(2);
    expect(at(600, steps)).toBe(2);
  });

  it("'start' begins the scroll at the step instead, and line 0 then rises into place from -1", () => {
    const steps = [0, 30, 60];
    expect(at(0, steps, {anchor: 'start'})).toBe(-1);
    expect(at(5, steps, {anchor: 'start'})).toBeCloseTo(-0.5);
    expect(at(10, steps, {anchor: 'start'})).toBe(0);
    expect(at(30, steps, {anchor: 'start'})).toBe(0);
    expect(at(35, steps, {anchor: 'start'})).toBeCloseTo(0.5);
    expect(at(40, steps, {anchor: 'start'})).toBe(1);
  });

  it('a later first step lets line 0 rise from the slot below into the centre', () => {
    const steps = [20, 50, 80];
    for (let f = 0; f <= 10; f++) expect(at(f, steps)).toBe(-1);
    expect(at(15, steps)).toBeCloseTo(-0.5);
    expect(at(20, steps)).toBe(0);
  });

  it('blends steps closer than the scroll into one non-decreasing movement, and lands on the integer', () => {
    const steps = [0, 30, 34];
    let previous = at(0, steps);
    for (let f = 1; f <= 60; f++) {
      const current = at(f, steps);
      expect(current).toBeGreaterThanOrEqual(previous);
      expect(current - previous).toBeLessThanOrEqual(2 / 10 + 1e-9);
      previous = current;
    }
    expect(at(30, steps)).toBeCloseTo(1.6); // step 1 done, step 2 six frames in: runs ahead of its step
    expect(at(34, steps)).toBe(2);
    expect(at(25, [0, 30, 30])).toBe(1); // two steps at once: a two-line glide over one scroll
    expect(at(30, [0, 30, 30])).toBe(2);
  });

  it('treats a negative frame as frame 0 and a 0-frame timing as a hard cut', () => {
    expect(at(-5, [0, 30])).toBe(at(0, [0, 30]));
    const cut = linearTiming({durationInFrames: 0});
    expect(scrollPosition({frame: 29, fps: 30, steps: [0, 30], timing: cut})).toBe(0);
    expect(scrollPosition({frame: 30, fps: 30, steps: [0, 30], timing: cut})).toBe(1);
  });

  it('defaults to enterTiming() and accepts a spring, both landing on exactly the integer', () => {
    const d30 = enterTiming().getDurationInFrames({fps: 30});
    const d60 = enterTiming().getDurationInFrames({fps: 60});
    expect(d30).toBe(15);
    expect(d60).toBe(30);
    expect(scrollPosition({frame: 30 - d30, fps: 30, steps: [0, 30]})).toBe(0);
    expect(scrollPosition({frame: 30 - d30 + 1, fps: 30, steps: [0, 30]})).toBeGreaterThan(0);
    expect(scrollPosition({frame: 30, fps: 30, steps: [0, 30]})).toBe(1);
    expect(scrollPosition({frame: 60, fps: 60, steps: [0, 60]})).toBe(1);
    const spring = springyTiming();
    const d = spring.getDurationInFrames({fps: 30});
    expect(scrollPosition({frame: 100 - d + 1, fps: 30, steps: [0, 100], timing: spring})).toBeGreaterThan(0);
    expect(scrollPosition({frame: 100, fps: 30, steps: [0, 100], timing: spring})).toBe(1);
  });

  it('is the same at any frame count: a step per line, an empty list is -1', () => {
    expect(at(0, [])).toBe(-1);
    expect(at(1000, [0])).toBe(0);
  });

  it('rejects malformed input with BAD_STEPS', () => {
    const bad = (options: Record<string, unknown>) => () =>
      scrollPosition({frame: 0, fps: 30, steps: [0], timing, ...(options as object)} as never);
    expect(bad({steps: [30, 0]})).toThrow(/never decrease/);
    expect(bad({steps: [0, Number.NaN]})).toThrow(/steps\[1\]/);
    expect(bad({steps: 'soon'})).toThrow(/array/);
    expect(bad({steps: [0, '30']})).toThrow(/steps\[1\]/);
    expect(bad({timing: {getProgress: () => 0}})).toThrow(/TransitionTiming/);
    expect(bad({timing: {getProgress: () => 0, getDurationInFrames: () => -1}})).toThrow(/returned -1/);
    expect(bad({steps: [5], timing: {getProgress: () => Number.NaN, getDurationInFrames: () => 10}})).toThrow(
      /getProgress\(\) returned NaN/,
    );
    expect(bad({anchor: 'middle'})).toThrow(/anchor/);
    expect(bad({frame: Number.NaN})).toThrow(/frame/);
    expect(bad({fps: 0})).toThrow(/fps/);
    try {
      bad({steps: [30, 0]})();
    } catch (e) {
      expect(e).toMatchObject({code: 'BAD_STEPS', details: {index: 1, step: 0, previous: 30}});
    }
  });
});

describe('window opacities', () => {
  it('fade a line out over the last line-height before the window edge', () => {
    expect(windowEdgeOpacity(0, 3)).toBe(1);
    expect(windowEdgeOpacity(1, 3)).toBe(1);
    expect(windowEdgeOpacity(1.5, 3)).toBe(0.5);
    expect(windowEdgeOpacity(2, 3)).toBe(0);
    expect(windowEdgeOpacity(3, 3)).toBe(0);
    expect(windowEdgeOpacity(0, 1)).toBe(1);
    expect(windowEdgeOpacity(0.5, 1)).toBe(0.5);
    expect(windowEdgeOpacity(2, 5)).toBe(1);
    expect(windowEdgeOpacity(2.5, 5)).toBe(0.5);
  });

  it('dim the neighbours by distance, the current line at 1', () => {
    expect(windowEmphasisOpacity(0, 0.45)).toBe(1);
    expect(windowEmphasisOpacity(0.5, 0.45)).toBeCloseTo(0.725);
    expect(windowEmphasisOpacity(1, 0.45)).toBeCloseTo(0.45);
    expect(windowEmphasisOpacity(2, 0.45)).toBeCloseTo(0.45);
    expect(windowEmphasisOpacity(1, 1)).toBe(1);
  });

  it('compose into the opacity a line ends up with', () => {
    const v3 = (index: number, position: number, neighbourOpacity?: number) =>
      windowLineOpacity({
        index,
        position,
        visibleLines: 3,
        ...(neighbourOpacity === undefined ? {} : {neighbourOpacity}),
      });
    expect(v3(0, 0)).toBe(1);
    expect(v3(1, 0)).toBe(1);
    expect(v3(1, -0.5)).toBe(0.5);
    expect(v3(2, 0)).toBe(0);
    expect(v3(0, 0, 0.45)).toBe(1);
    expect(v3(0, 0.5, 0.45)).toBeCloseTo(0.725);
    expect(v3(1, 0, 0.45)).toBeCloseTo(0.45);
    expect(v3(0, 1.5, 0.45)).toBeCloseTo(0.225);
  });
});

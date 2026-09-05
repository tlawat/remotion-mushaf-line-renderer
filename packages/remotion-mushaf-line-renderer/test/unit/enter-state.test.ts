import {linearTiming, springTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {describe, expect, it} from 'vitest';
import {getEnterState} from '../../src/enter-state';

describe('getEnterState', () => {
  const timing = linearTiming({durationInFrames: 10});
  const presentation = fade();

  it('follows the timing over the local frame and pins to 1 afterwards', () => {
    expect(getEnterState({enter: {presentation, timing}, frame: 0, fps: 30})).toEqual({progress: 0, durationInFrames: 10});
    expect(getEnterState({enter: {presentation, timing}, frame: 5, fps: 30}).progress).toBeCloseTo(0.5);
    expect(getEnterState({enter: {presentation, timing}, frame: 10, fps: 30}).progress).toBe(1);
    expect(getEnterState({enter: {presentation, timing}, frame: 20, fps: 30}).progress).toBe(1);
    expect(getEnterState({enter: {presentation, timing}, frame: -3, fps: 30}).progress).toBe(0);
  });

  it('uses the spring duration measured by @remotion/transitions', () => {
    const spring = springTiming({config: {damping: 200}});
    const state = getEnterState({enter: {presentation, timing: spring}, frame: 0, fps: 30});
    expect(state.durationInFrames).toBe(spring.getDurationInFrames({fps: 30}));
    expect(state.durationInFrames).toBeGreaterThan(0);
    expect(getEnterState({enter: {presentation, timing: spring}, frame: state.durationInFrames, fps: 30}).progress).toBe(1);
  });

  it('accepts memo/forwardRef style component objects', () => {
    const memoLike = {component: {$$typeof: Symbol.for('react.memo')}, props: {}};
    expect(() => getEnterState({enter: {presentation: memoLike as never, timing}, frame: 0, fps: 30})).not.toThrow();
  });

  it('rejects malformed presentations, timings and durations with BAD_ENTER', () => {
    const bad = (enter: unknown) => () => getEnterState({enter: enter as never, frame: 0, fps: 30});
    expect(bad({presentation: 'fade', timing})).toThrow(/enter\.presentation. must be a TransitionPresentation/);
    expect(bad({presentation: {props: {}}, timing})).toThrow(/enter\.presentation/);
    expect(bad({presentation, timing: {getProgress: () => 0}})).toThrow(/enter\.timing. must be a TransitionTiming/);
    expect(bad({presentation, timing: {getProgress: () => 0, getDurationInFrames: () => Number.NaN}})).toThrow(/returned NaN/);
    expect(bad({presentation, timing: {getProgress: () => 0, getDurationInFrames: () => -1}})).toThrow(/returned -1/);
    expect(bad({presentation, timing: {getProgress: () => Number.NaN, getDurationInFrames: () => 10}})).toThrow(/getProgress\(\) returned NaN/);
    expect(bad(undefined)).toThrow(/BAD_ENTER|TransitionPresentation/);
    try {
      bad({presentation: 'fade', timing})();
    } catch (e) {
      expect(e).toMatchObject({code: 'BAD_ENTER'});
    }
  });
});

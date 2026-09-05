import {MushafError, type MushafErrorCode} from './errors';
import type {MushafLineAnimation} from './types';

export type AnimationState = {
  readonly progress: number;
  readonly durationInFrames: number;
};
export type EnterState = AnimationState;

type Prop = 'enter' | 'exit';

const validate = (prop: Prop, value: MushafLineAnimation, fps: number): number => {
  const code: MushafErrorCode = prop === 'enter' ? 'BAD_ENTER' : 'BAD_EXIT';
  if (!value || typeof value !== 'object' || !value.presentation || typeof value.presentation !== 'object' || value.presentation.component == null) {
    throw new MushafError(code, `\`${prop}.presentation\` must be a TransitionPresentation, e.g. fade() from "@remotion/transitions/fade".`, {[prop]: value});
  }
  if (!value.timing || typeof value.timing.getProgress !== 'function' || typeof value.timing.getDurationInFrames !== 'function') {
    throw new MushafError(code, `\`${prop}.timing\` must be a TransitionTiming, e.g. linearTiming({durationInFrames: 15}) from "@remotion/transitions".`, {[prop]: value});
  }
  const durationInFrames = value.timing.getDurationInFrames({fps});
  if (typeof durationInFrames !== 'number' || !Number.isFinite(durationInFrames) || durationInFrames < 0) {
    throw new MushafError(code, `${prop}.timing.getDurationInFrames() returned ${String(durationInFrames)}; expected a finite number >= 0.`, {durationInFrames});
  }
  return durationInFrames;
};

const progressAt = (prop: Prop, value: MushafLineAnimation, localFrame: number, fps: number, durationInFrames: number): number => {
  const progress = localFrame >= durationInFrames ? 1 : value.timing.getProgress({frame: localFrame, fps});
  if (typeof progress !== 'number' || Number.isNaN(progress)) {
    throw new MushafError(prop === 'enter' ? 'BAD_ENTER' : 'BAD_EXIT', `${prop}.timing.getProgress() returned ${String(progress)} at frame ${localFrame}; expected a number.`, {progress, frame: localFrame});
  }
  return progress;
};

/**
 * Entrance progress for the local frame of the enclosing `<Sequence>`.
 *
 * Mirrors what `<TransitionSeries>` computes for the entering side of a sequence: progress is
 * `timing.getProgress({frame, fps})` over the local frame, and once the transition is over it is
 * pinned to exactly 1 so every settled frame renders the identical tree (slide() drops its epsilon
 * correction only at progress === 1). There is no "sequence too short" check: inside a Sequence only
 * the clamped duration is observable, so such a check would misfire whenever the composition ends
 * before the Sequence does; the stock timings clamp on their own.
 */
export const getEnterState = ({enter, frame, fps}: {enter: MushafLineAnimation; frame: number; fps: number}): EnterState => {
  const durationInFrames = validate('enter', enter, fps);
  const localFrame = Math.max(0, frame);
  return {progress: progressAt('enter', enter, localFrame, fps, durationInFrames), durationInFrames};
};

/**
 * Exit progress: the presentation's exiting side runs over the last `timing.getDurationInFrames()`
 * frames of the enclosing `<Sequence>` (`durationInFrames` is the Sequence's clamped duration from
 * `useVideoConfig()`), exactly like the exiting side of a `<TransitionSeries>` transition: 0 until the
 * window starts, `getProgress` inside it, and the line is gone with its Sequence right after.
 */
export const getExitState = ({exit, frame, fps, durationInFrames}: {exit: MushafLineAnimation; frame: number; fps: number; durationInFrames: number}): AnimationState => {
  const duration = validate('exit', exit, fps);
  if (typeof durationInFrames !== 'number' || !Number.isFinite(durationInFrames)) {
    throw new MushafError('BAD_EXIT', `An exit animation needs a finite sequence length to count back from; useVideoConfig().durationInFrames is ${String(durationInFrames)}. Give the enclosing <Sequence> a durationInFrames.`, {durationInFrames});
  }
  const localFrame = frame - (durationInFrames - duration);
  const progress = localFrame < 0 ? 0 : progressAt('exit', exit, localFrame, fps, duration);
  return {progress, durationInFrames: duration};
};

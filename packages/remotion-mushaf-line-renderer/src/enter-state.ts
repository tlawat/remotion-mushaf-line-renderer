import {MushafError, type MushafErrorCode} from './errors';
import {enterTiming, exitTiming} from './timings';
import type {MushafLineAnimation, MushafLineAnimationProp} from './types';

export type AnimationState = {
  readonly progress: number;
  readonly durationInFrames: number;
};
export type EnterState = AnimationState;

type Prop = 'enter' | 'exit';

/** Resolved form used internally: a timing is always present after `normaliseAnimation()`. */
export type ResolvedAnimation = MushafLineAnimation & {readonly timing: NonNullable<MushafLineAnimation['timing']>};

const DEFAULT_TIMING = {enter: enterTiming(), exit: exitTiming()} as const;

/**
 * Accepts what the props accept — `{presentation, timing?}` or a bare `TransitionPresentation` — and
 * fills in the package's default timing (`enterTiming()` / `exitTiming()`), so the rest of the
 * renderer only ever sees a complete `{presentation, timing}` pair.
 */
export const normaliseAnimation = (prop: Prop, value: MushafLineAnimationProp | undefined): ResolvedAnimation | undefined => {
  if (value === undefined) return undefined;
  const code: MushafErrorCode = prop === 'enter' ? 'BAD_ENTER' : 'BAD_EXIT';
  if (!value || typeof value !== 'object') {
    throw new MushafError(code, `\`${prop}\` must be {presentation, timing} or a TransitionPresentation such as fade(), got ${typeof value}.`, {[prop]: value});
  }
  if ('presentation' in value) {
    const timing = value.timing;
    return {presentation: value.presentation, timing: timing === undefined ? DEFAULT_TIMING[prop] : timing};
  }
  if ('component' in value) {
    return {presentation: value, timing: DEFAULT_TIMING[prop]};
  }
  throw new MushafError(
    code,
    `\`${prop}\` must be {presentation, timing} or a TransitionPresentation (an object with a \`component\`), e.g. fade() from "@remotion/transitions/fade" or slideFade() from this package.`,
    {[prop]: value},
  );
};

type Timing = NonNullable<MushafLineAnimation['timing']>;

const validate = (prop: Prop, value: MushafLineAnimation, fps: number): {timing: Timing; durationInFrames: number} => {
  const code: MushafErrorCode = prop === 'enter' ? 'BAD_ENTER' : 'BAD_EXIT';
  if (!value || typeof value !== 'object' || !value.presentation || typeof value.presentation !== 'object' || value.presentation.component == null) {
    throw new MushafError(code, `\`${prop}.presentation\` must be a TransitionPresentation, e.g. fade() from "@remotion/transitions/fade".`, {[prop]: value});
  }
  const timing = value.timing;
  if (!timing || typeof timing.getProgress !== 'function' || typeof timing.getDurationInFrames !== 'function') {
    throw new MushafError(code, `\`${prop}.timing\` must be a TransitionTiming, e.g. enterTiming() from this package or linearTiming({durationInFrames: 15}) from "@remotion/transitions".`, {[prop]: value});
  }
  const durationInFrames = timing.getDurationInFrames({fps});
  if (typeof durationInFrames !== 'number' || !Number.isFinite(durationInFrames) || durationInFrames < 0) {
    throw new MushafError(code, `${prop}.timing.getDurationInFrames() returned ${String(durationInFrames)}; expected a finite number >= 0.`, {durationInFrames});
  }
  return {timing, durationInFrames};
};

const progressAt = (prop: Prop, timing: Timing, localFrame: number, fps: number, durationInFrames: number): number => {
  const progress = localFrame >= durationInFrames ? 1 : timing.getProgress({frame: localFrame, fps});
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
  const {timing, durationInFrames} = validate('enter', enter, fps);
  const localFrame = Math.max(0, frame);
  return {progress: progressAt('enter', timing, localFrame, fps, durationInFrames), durationInFrames};
};

/**
 * Exit progress: the presentation's exiting side runs over the last `timing.getDurationInFrames()`
 * frames of the enclosing `<Sequence>` (`durationInFrames` is the Sequence's clamped duration from
 * `useVideoConfig()`), exactly like the exiting side of a `<TransitionSeries>` transition: 0 until the
 * window starts, `getProgress` inside it, and the line is gone with its Sequence right after.
 */
export const getExitState = ({exit, frame, fps, durationInFrames}: {exit: MushafLineAnimation; frame: number; fps: number; durationInFrames: number}): AnimationState => {
  const {timing, durationInFrames: duration} = validate('exit', exit, fps);
  if (typeof durationInFrames !== 'number' || !Number.isFinite(durationInFrames)) {
    throw new MushafError('BAD_EXIT', `An exit animation needs a finite sequence length to count back from; useVideoConfig().durationInFrames is ${String(durationInFrames)}. Give the enclosing <Sequence> a durationInFrames.`, {durationInFrames});
  }
  const localFrame = frame - (durationInFrames - duration);
  const progress = localFrame < 0 ? 0 : progressAt('exit', timing, localFrame, fps, duration);
  return {progress, durationInFrames: duration};
};

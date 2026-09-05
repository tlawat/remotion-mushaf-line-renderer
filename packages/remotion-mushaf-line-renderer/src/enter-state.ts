import {MushafError} from './errors';
import type {MushafLineAnimation} from './types';

export type EnterState = {
  readonly progress: number;
  readonly durationInFrames: number;
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
  if (!enter || typeof enter !== 'object' || !enter.presentation || typeof enter.presentation !== 'object' || enter.presentation.component == null) {
    throw new MushafError('BAD_ENTER', '`enter.presentation` must be a TransitionPresentation, e.g. fade() from "@remotion/transitions/fade".', {enter});
  }
  if (!enter.timing || typeof enter.timing.getProgress !== 'function' || typeof enter.timing.getDurationInFrames !== 'function') {
    throw new MushafError('BAD_ENTER', '`enter.timing` must be a TransitionTiming, e.g. linearTiming({durationInFrames: 15}) from "@remotion/transitions".', {enter});
  }
  const durationInFrames = enter.timing.getDurationInFrames({fps});
  if (typeof durationInFrames !== 'number' || !Number.isFinite(durationInFrames) || durationInFrames < 0) {
    throw new MushafError('BAD_ENTER', `enter.timing.getDurationInFrames() returned ${String(durationInFrames)}; expected a finite number >= 0.`, {durationInFrames});
  }
  const localFrame = Math.max(0, frame);
  const progress = localFrame >= durationInFrames ? 1 : enter.timing.getProgress({frame: localFrame, fps});
  if (typeof progress !== 'number' || Number.isNaN(progress)) {
    throw new MushafError('BAD_ENTER', `enter.timing.getProgress() returned ${String(progress)} at frame ${localFrame}; expected a number.`, {progress, frame: localFrame});
  }
  return {progress, durationInFrames};
};

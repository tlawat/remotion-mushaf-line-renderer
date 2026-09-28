// Type-only: @remotion/transitions stays a peer with no runtime coupling.
import type {TransitionTiming} from '@remotion/transitions';
import {describeValue, MushafError} from '../errors';
import type {MushafScrollAnchor, ScrollPositionOptions} from '../types';
import {enterTiming} from './timings';

const DEFAULT_TIMING = enterTiming();
const ANCHORS: readonly MushafScrollAnchor[] = ['end', 'start'];

const bad = (problem: string, details?: Record<string, unknown>): never => {
  throw new MushafError('BAD_STEPS', `scrollPosition(): ${problem}`, details);
};

/** The frames at which each line becomes current: an array of finite numbers that never decreases. */
export const assertSteps = (steps: unknown): readonly number[] => {
  if (!Array.isArray(steps)) bad(`\`steps\` must be an array of frames, one per line, got ${describeValue(steps)}.`);
  const list = steps as readonly unknown[];
  for (let i = 0; i < list.length; i++) {
    const step = list[i];
    if (typeof step !== 'number' || !Number.isFinite(step)) {
      bad(`\`steps[${i}]\` must be a finite frame number, got ${describeValue(step)}.`, {index: i, step});
    }
    const previous = list[i - 1] as number | undefined;
    if (previous !== undefined && (step as number) < previous) {
      bad(
        `\`steps\` must never decrease (line ${i} would become current at frame ${String(step)}, before line ${i - 1} at frame ${previous}). Sort the schedule, or fix the timing that puts a later line first.`,
        {index: i, step, previous},
      );
    }
  }
  return list as readonly number[];
};

const assertTiming = (timing: unknown, fps: number): {timing: TransitionTiming; durationInFrames: number} => {
  const t = timing as TransitionTiming | null | undefined;
  if (!t || typeof t.getProgress !== 'function' || typeof t.getDurationInFrames !== 'function') {
    bad(
      `\`timing\` must be a TransitionTiming, e.g. enterTiming() from this package or linearTiming({durationInFrames: 15}) from "@remotion/transitions".`,
      {timing},
    );
  }
  const durationInFrames = (t as TransitionTiming).getDurationInFrames({fps});
  if (typeof durationInFrames !== 'number' || !Number.isFinite(durationInFrames) || durationInFrames < 0) {
    bad(`timing.getDurationInFrames() returned ${String(durationInFrames)}; expected a finite number >= 0.`, {
      durationInFrames,
    });
  }
  return {timing: t as TransitionTiming, durationInFrames};
};

/**
 * Where a window of lines is scrolled to, as a fractional line index: `1` means line 1 is in the
 * centre slot, `1.37` means every line is 0.37 of a line-height on its way from line 1 to line 2.
 *
 * `steps[j]` is the local frame at which line `j` becomes current, one entry per line and never
 * decreasing. Each step contributes the eased progress of one scroll of `timing` (default
 * `enterTiming()`, 0.5 s), which under `anchor: 'end'` (the default) finishes exactly at `steps[j]`
 * and under `'start'` begins there; the position is the sum of those contributions minus one. So it
 * is a pure function of the frame (seekable, deterministic), an exact integer whenever no scroll is
 * in flight (every finished step counts exactly 1, every pending one exactly 0), and two steps closer
 * together than the scroll blend into one continuous movement instead of a jerk, at the price of
 * the position running ahead of `steps[j]` by up to a line while they overlap. A `steps[0]` of `0`
 * or less puts line 0 in the centre from the first frame; a later one lets it rise into place.
 */
export const scrollPosition = ({frame, fps, steps, timing, anchor}: ScrollPositionOptions): number => {
  if (typeof frame !== 'number' || Number.isNaN(frame)) bad(`\`frame\` must be a number, got ${describeValue(frame)}.`);
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0)
    bad(`\`fps\` must be a positive number, got ${describeValue(fps)}.`);
  const list = assertSteps(steps);
  const resolvedAnchor = anchor ?? 'end';
  if (!ANCHORS.includes(resolvedAnchor)) {
    bad(`\`anchor\` must be 'end' or 'start', got ${describeValue(anchor)}.`, {anchor});
  }
  const resolved = assertTiming(timing ?? DEFAULT_TIMING, fps);
  const duration = resolved.durationInFrames;
  const offset = resolvedAnchor === 'end' ? duration : 0;
  const local = Math.max(0, frame);
  let sum = 0;
  for (let j = 0; j < list.length; j++) {
    const at = local - ((list[j] as number) - offset);
    // Pinned to exactly 1 once the scroll is over and exactly 0 before it starts, like an entrance:
    // every settled frame is then the identical tree (and a 0-frame timing is a hard cut).
    if (at >= duration) {
      sum += 1;
      continue;
    }
    if (at <= 0) continue;
    const progress = resolved.timing.getProgress({frame: at, fps});
    if (typeof progress !== 'number' || Number.isNaN(progress)) {
      bad(`timing.getProgress() returned ${String(progress)} at frame ${at} of step ${j}; expected a number.`, {
        progress,
        frame: at,
        index: j,
      });
    }
    sum += progress;
  }
  return sum - 1;
};

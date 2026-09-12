// Type-only: @remotion/transitions stays a peer with no runtime coupling.
import type {TransitionTiming} from '@remotion/transitions';
import type {SpringConfig} from 'remotion';
import {Easing, interpolate, measureSpring, spring} from 'remotion';

export type MushafTimingOptions = {
  /** Duration in seconds, turned into frames at render time. Ignored when `durationInFrames` is set. */
  readonly seconds?: number;
  /** Duration in frames, when you need to line an animation up with an exact frame. */
  readonly durationInFrames?: number;
  /** Override the curve; any `(t: 0..1) => 0..1`, e.g. `Easing.bezier(...)` or `Easing.linear`. */
  readonly easing?: (input: number) => number;
};

export type MushafSpringTimingOptions = {
  readonly config?: Partial<SpringConfig>;
  readonly durationInFrames?: number;
  readonly seconds?: number;
  readonly durationRestThreshold?: number;
};

/**
 * Entrance curve: eases out of nothing, covers the distance in the middle and then decelerates for a
 * long time into place (Material 3's "emphasized" curve). Both ends are gentle, which is the whole
 * difference from a linear timing — that one starts and stops abruptly, and abrupt is what reads as
 * mechanical. The long tail is sub-pixel per frame, so it is felt rather than seen.
 */
export const ENTER_EASING = Easing.bezier(0.2, 0, 0, 1);

/**
 * Exit curve: starts gently and accelerates away (CSS `ease-in`). Something leaving should not
 * decelerate — there is nothing to land on.
 */
export const EXIT_EASING = Easing.bezier(0.4, 0, 1, 1);

const DEFAULT_ENTER_SECONDS = 0.5;
/** Exits are deliberately shorter than entrances: the eye needs less time to let something go. */
const DEFAULT_EXIT_SECONDS = 0.32;

const framesOf = (options: MushafTimingOptions, fps: number, fallbackSeconds: number): number =>
  Math.max(1, Math.round(options.durationInFrames ?? (options.seconds ?? fallbackSeconds) * fps));

const easedTiming =
  (defaultEasing: (input: number) => number, defaultSeconds: number) =>
  (options: MushafTimingOptions = {}): TransitionTiming => {
    const easing = options.easing ?? defaultEasing;
    return {
      getDurationInFrames: ({fps}) => framesOf(options, fps, defaultSeconds),
      getProgress: ({frame, fps}) =>
        interpolate(frame, [0, framesOf(options, fps, defaultSeconds)], [0, 1], {
          easing,
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
    };
  };

/**
 * Default timing of `<MushafLine enter>`: 0.5 s on `ENTER_EASING`.
 *
 * It is an ordinary `TransitionTiming`, so it also works in a `<TransitionSeries.Transition>`, and
 * `linearTiming()` / `springTiming()` from `@remotion/transitions` remain drop-in alternatives.
 */
export const enterTiming = easedTiming(ENTER_EASING, DEFAULT_ENTER_SECONDS);

/** Default timing of `<MushafLine exit>`: 0.32 s on `EXIT_EASING`. */
export const exitTiming = easedTiming(EXIT_EASING, DEFAULT_EXIT_SECONDS);

/**
 * A spring instead of a curve, for motion that settles physically. `damping: 200` (the default) does
 * not overshoot; lower it for a bounce. Duration is measured from the spring unless you pin it.
 */
export const springyTiming = ({
  config,
  durationInFrames,
  seconds,
  durationRestThreshold,
}: MushafSpringTimingOptions = {}): TransitionTiming => {
  const merged: Partial<SpringConfig> = {damping: 200, ...config};
  const frames = (fps: number): number | undefined =>
    durationInFrames ?? (seconds === undefined ? undefined : Math.max(1, Math.round(seconds * fps)));
  // Optional keys are spread in rather than set to undefined: the package is built with
  // exactOptionalPropertyTypes, and so are Remotion's own signatures.
  const rest = durationRestThreshold === undefined ? {} : {durationRestThreshold};
  return {
    getDurationInFrames: ({fps}) =>
      frames(fps) ??
      measureSpring({
        config: merged,
        fps,
        ...(durationRestThreshold === undefined ? {} : {threshold: durationRestThreshold}),
      }),
    getProgress: ({frame, fps}) => {
      const duration = frames(fps);
      return spring({
        fps,
        frame,
        config: merged,
        ...(duration === undefined ? {} : {durationInFrames: duration}),
        ...rest,
      });
    },
  };
};

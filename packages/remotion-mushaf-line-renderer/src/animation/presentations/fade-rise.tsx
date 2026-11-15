import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import type * as React from 'react';
import {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {CALM_EASINGS} from '../timings';

export type FadeRiseProps = {
  /** px the entering line starts below its place. The same in a lone line and in a window; 11 at 16:9 is plenty. */
  readonly distance: number;
  /** Curve of the entering opacity. Default `CALM_EASINGS.soft`. */
  readonly easing?: (input: number) => number;
  /** Curve of the entering rise. Default `CALM_EASINGS.arrive`. */
  readonly riseEasing?: (input: number) => number;
  readonly enterStyle?: React.CSSProperties;
  readonly exitStyle?: React.CSSProperties;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The whole animation, as a pure function of progress, so it can be unit-tested frame by frame.
 * Entering, opacity follows `easing` and the line rises from `distance` px below on `riseEasing`;
 * exiting, only the opacity falls (`1 − progress`): a line that is leaving does not move.
 *
 * `fadeRiseStyle(0, 'entering', {distance: 11})` is `{opacity: 0, transform: 'translateY(11.0000px)'}`.
 */
export const fadeRiseStyle = (
  progress: number,
  direction: 'entering' | 'exiting',
  props: FadeRiseProps,
): React.CSSProperties => {
  const p = clamp01(progress);
  if (direction === 'exiting') return {opacity: 1 - p, ...props.exitStyle};
  const easing = props.easing ?? CALM_EASINGS.soft;
  const riseEasing = props.riseEasing ?? CALM_EASINGS.arrive;
  const offset = (1 - riseEasing(p)) * props.distance;
  return {
    opacity: easing(p),
    // Sub-pixel on purpose, as in slideFadeStyle: a rise of a few px rounded to whole px steps visibly.
    transform: `translateY(${offset.toFixed(4)}px)`,
    ...props.enterStyle,
  };
};

const FadeRisePresentation: React.FC<TransitionPresentationComponentProps<FadeRiseProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const style = useMemo(
    () => fadeRiseStyle(presentationProgress, presentationDirection, passedProps),
    [presentationDirection, presentationProgress, passedProps],
  );
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

/**
 * A dissolve with a slight rise: the entering line fades in while it rises `distance` px into place,
 * the exiting one only fades. Its curves are its own (`easing`, `riseEasing`), so pair it with a
 * linear timing, e.g. `enterTiming({durationInFrames: 14, easing: Easing.linear})` or
 * `@remotion/transitions`' `linearTiming()`; an eased timing would ease the progress twice.
 *
 * Same shape as `fade()` from `@remotion/transitions/fade`, so it also works in a real
 * `<TransitionSeries>`.
 *
 * ```tsx
 * <MushafLine line={line} enter={{presentation: fadeRise({distance: 11}), timing: enterTiming({easing: Easing.linear})}} />
 * ```
 */
export const fadeRise = (props: FadeRiseProps): TransitionPresentation<FadeRiseProps> => ({
  component: FadeRisePresentation,
  props,
});

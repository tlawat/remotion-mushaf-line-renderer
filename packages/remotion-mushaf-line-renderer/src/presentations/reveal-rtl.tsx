import * as React from 'react';
import {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';

export type RevealRtlProps = {
  /**
   * Width of the fading edge, in % of the line. `0` (default) is a hard cut, like a `clip-path`;
   * 6–12 reads as ink appearing rather than a wipe passing over it.
   */
  readonly softness?: number;
  readonly enterStyle?: React.CSSProperties;
  readonly exitStyle?: React.CSSProperties;
};

/**
 * The mask runs right → left, so a gradient stop at `x %` from the *left* is the reveal edge; the
 * soft band straddles it. Percentages are of the line's own width, so it is resolution-independent.
 */
const softMask = (edge: number, softness: number, entering: boolean): string => {
  const half = softness / 2;
  const from = Math.max(0, edge - half).toFixed(4);
  const to = Math.min(100, edge + half).toFixed(4);
  // Entering: everything right of the edge is painted. Exiting: everything right of the edge is gone.
  return entering
    ? `linear-gradient(to right, transparent 0 ${from}%, #000 ${to}% 100%)`
    : `linear-gradient(to right, #000 0 ${from}%, transparent ${to}% 100%)`;
};

/** The reveal as a pure function of progress — exported so it can be unit-tested frame by frame. */
export const revealRtlStyle = (progress: number, direction: 'entering' | 'exiting', props: RevealRtlProps = {}): React.CSSProperties => {
  const p = Math.min(1, Math.max(0, progress));
  const entering = direction === 'entering';
  const softness = props.softness ?? 0;
  // Reading direction: entering reveals from the right edge, exiting hides from the right edge.
  const edge = entering ? (1 - p) * 100 : p * 100;
  if (softness > 0) {
    const mask = softMask(edge, softness, entering);
    return {maskImage: mask, WebkitMaskImage: mask, ...(entering ? props.enterStyle : props.exitStyle)};
  }
  return {
    // Vertical insets are negative so marks above and below the line box are never clipped.
    clipPath: entering ? `inset(-100% 0 -100% ${edge.toFixed(4)}%)` : `inset(-100% ${edge.toFixed(4)}% -100% 0)`,
    ...(entering ? props.enterStyle : props.exitStyle),
  };
};

const RevealRtlPresentation: React.FC<TransitionPresentationComponentProps<RevealRtlProps>> = ({children, presentationDirection, presentationProgress, passedProps}) => {
  const style = useMemo(() => revealRtlStyle(presentationProgress, presentationDirection, passedProps), [presentationDirection, presentationProgress, passedProps]);
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

/**
 * Reveals the line in reading direction (right to left). Same shape as `fade()` from
 * `@remotion/transitions/fade`, so it also works inside a real `<TransitionSeries>`.
 */
export const revealRtl = (props?: RevealRtlProps): TransitionPresentation<RevealRtlProps> => ({
  component: RevealRtlPresentation,
  props: props ?? {},
});

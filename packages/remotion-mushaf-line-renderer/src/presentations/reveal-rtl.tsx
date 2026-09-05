import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';

export type RevealRtlProps = {
  readonly enterStyle?: React.CSSProperties;
  readonly exitStyle?: React.CSSProperties;
};

const RevealRtlPresentation: React.FC<TransitionPresentationComponentProps<RevealRtlProps>> = ({children, presentationDirection, presentationProgress, passedProps}) => {
  const style = useMemo((): React.CSSProperties => {
    const p = Math.min(1, Math.max(0, presentationProgress));
    const entering = presentationDirection === 'entering';
    return {
      // Reading direction: entering reveals from the right edge, exiting hides from the right edge.
      // Vertical insets are negative so marks above and below the line box are never clipped.
      clipPath: entering ? `inset(-100% 0 -100% ${((1 - p) * 100).toFixed(4)}%)` : `inset(-100% ${(p * 100).toFixed(4)}% -100% 0)`,
      ...(entering ? passedProps.enterStyle : passedProps.exitStyle),
    };
  }, [presentationDirection, presentationProgress, passedProps.enterStyle, passedProps.exitStyle]);
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

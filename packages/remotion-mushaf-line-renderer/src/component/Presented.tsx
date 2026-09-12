import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import type * as React from 'react';

type AnyProps = Record<string, unknown>;
export type OnElementImage = TransitionPresentationComponentProps<AnyProps>['onElementImage'];

const noop = () => undefined;

/**
 * Renders a `TransitionPresentation` around the line, prop-for-prop the way `<TransitionSeries>`
 * renders the entering side of a sequence. Kept separate so a future `exit` prop reuses it with
 * `direction="exiting"`, nested outside the entering one exactly as TransitionSeries nests them.
 */
export const Presented: React.FC<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly presentation: TransitionPresentation<any>;
  readonly direction: 'entering' | 'exiting';
  readonly progress: number;
  readonly durationInFrames: number;
  readonly onElementImage: OnElementImage;
  readonly bothEnteringAndExiting?: boolean;
  readonly children: React.ReactNode;
}> = ({
  presentation,
  direction,
  progress,
  durationInFrames,
  onElementImage,
  bothEnteringAndExiting = false,
  children,
}) => {
  const Component = presentation.component as React.ComponentType<TransitionPresentationComponentProps<AnyProps>>;
  return (
    <Component
      passedProps={(presentation.props as AnyProps | undefined) ?? {}}
      presentationDirection={direction}
      presentationProgress={progress}
      presentationDurationInFrames={durationInFrames}
      onElementImage={onElementImage}
      onUnmount={noop}
      bothEnteringAndExiting={bothEnteringAndExiting}
    >
      {children}
    </Component>
  );
};

import type {TransitionPresentation, TransitionTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {
  enterTiming,
  exitTiming,
  type MushafLineAnimationProp,
  revealRtl,
  slideFade,
  springyTiming,
} from '@tlawat/remotion-mushaf-line';
import type {Animation} from './index';

/**
 * The `enter` / `exit` props of a line or a window. A side set to `'none'` is left out (never set to
 * `undefined`), so the object spreads straight into the component under `exactOptionalPropertyTypes`.
 */
export type LineAnimationProps = {
  readonly enter?: MushafLineAnimationProp;
  readonly exit?: MushafLineAnimationProp;
};

/** `slideFade()`'s default travel, in % of the line box. */
const SLIDE_DISTANCE = 28;

const presentationFor = (
  entrance: Animation['enter'],
  side: 'enter' | 'exit',
  slideDistance: number,
): TransitionPresentation<any> | undefined => {
  switch (entrance) {
    case 'slide-fade':
      return slideFade(slideDistance === SLIDE_DISTANCE ? undefined : {distance: slideDistance});
    case 'fade':
      // `fade()` keeps the exiting side fully visible unless told otherwise.
      return fade(side === 'exit' ? {shouldFadeOutExitingScene: true} : undefined);
    case 'reveal-rtl':
      return revealRtl();
    case 'none':
      return undefined;
  }
};

/**
 * The entrance and exit a composition hands to `<MushafLine>` or `<MushafLineWindow>`: the
 * package's `slideFade()` and `revealRtl()`, or `@remotion/transitions`' `fade()`, each on the
 * package's default timing (0.5 s in, 0.32 s out). `slideFade()`'s travel is a share of the box it
 * animates; in a window the box is `visibleLines` lines tall, so the travel is divided by it to
 * stay one line's worth.
 */
export const animationFrom = (
  animation: Pick<Animation, 'enter' | 'exit'>,
  options: {readonly visibleLines?: number | undefined} = {},
): LineAnimationProps => {
  const slideDistance = SLIDE_DISTANCE / Math.max(1, options.visibleLines ?? 1);
  const enter = presentationFor(animation.enter, 'enter', slideDistance);
  const exit = presentationFor(animation.exit, 'exit', slideDistance);
  return {
    ...(enter ? {enter: {presentation: enter, timing: enterTiming()}} : {}),
    ...(exit ? {exit: {presentation: exit, timing: exitTiming()}} : {}),
  };
};

/** The window's `scrollTiming` for the schema's `scroll`: the eased default, or the package's spring. */
export const scrollTimingFrom = (scroll: Animation['scroll']): TransitionTiming =>
  scroll === 'spring' ? springyTiming() : enterTiming();

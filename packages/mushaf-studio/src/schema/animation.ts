import type {TransitionTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {enterTiming, exitTiming, fadeRise, type MushafLineAnimationProp} from '@tlawat/remotion-mushaf-line';
import {Easing} from 'remotion';
import type {Animation} from './index';
import {INOUT, SINE, SOFT, type Tempo, tempoSeconds} from './tokens';

/**
 * The `enter` / `exit` props of a line or a window. Under `lines: 'cut'` both are left out (never
 * set to `undefined`), so the object spreads straight into the component under
 * `exactOptionalPropertyTypes`.
 */
export type LineAnimationProps = {
  readonly enter?: MushafLineAnimationProp;
  readonly exit?: MushafLineAnimationProp;
};

/** The rise of an entering line under `lines: 'rise'`, in px: 0.12 em of its type size, never more than 12 (11 at 16:9). */
export const riseDistance = (fontSize: number): number => Math.min(12, Math.round(0.12 * fontSize));

/**
 * The entrance and exit a composition hands to `<MushafLine>` or `<MushafLineWindow>` for
 * `animation.lines`: `'fade'` is `@remotion/transitions`' `fade()` on both sides (in on `SOFT`, out
 * on `SINE`); `'rise'` enters with the package's `fadeRise()` (`riseDistance(fontSize)` px, its own
 * curves on a linear timing) and leaves by the same fade, without moving; `'cut'` has neither. The
 * lengths are the package's default timings, so a composition's schedule built on them holds.
 */
export const animationFrom = (
  animation: Pick<Animation, 'lines'>,
  options: {readonly fontSize?: number | undefined} = {},
): LineAnimationProps => {
  if (animation.lines === 'cut') return {};
  // `fade()` keeps the exiting side fully visible unless told otherwise.
  const exit: MushafLineAnimationProp = {
    presentation: fade({shouldFadeOutExitingScene: true}),
    timing: exitTiming({easing: SINE}),
  };
  if (animation.lines === 'rise') {
    const distance = riseDistance(options.fontSize ?? 90);
    return {
      enter: {presentation: fadeRise({distance}), timing: enterTiming({easing: Easing.linear})},
      exit,
    };
  }
  return {enter: {presentation: fade(), timing: enterTiming({easing: SOFT})}, exit};
};

/**
 * The window's `scrollTiming`: one line box over `scroll` (24 frames, 34 slow) on `INOUT`.
 *
 * @deprecated The scroll has one curve now; the timing is the calm scroll at `tempo`.
 */
export const scrollTimingFrom = (tempo: Tempo = 'calm'): TransitionTiming =>
  enterTiming({seconds: tempoSeconds('scroll', tempo), easing: INOUT});

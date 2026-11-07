import type {TransitionTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {enterTiming, exitTiming, fadeRise, type MushafLineAnimationProp} from '@tlawat/remotion-mushaf-line';
import {Easing} from 'remotion';
import type {Animation} from './index';
import {INOUT, SINE, SOFT, type Tempo, tempoFrames, tempoSeconds} from './tokens';

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

export type AnimationFromOptions = {
  /** The line's type size, for the rise. Default 90 (16:9). */
  readonly fontSize?: number | undefined;
  /** Frames of the entrance: the incoming side of the boundary's dissolve. Default the package's 0.5 s. */
  readonly enterFrames?: number | undefined;
  /** Frames of the exit: the outgoing side of the boundary's dissolve. Default the package's 0.32 s. */
  readonly exitFrames?: number | undefined;
  /** The entrance's opacity curve. Default `SOFT` (a line); the window's first appearance is on `SINE`. */
  readonly enterEasing?: ((t: number) => number) | undefined;
};

/**
 * The entrance and exit a composition hands to `<MushafLine>` or `<MushafLineWindow>` for
 * `animation.lines`, at the lengths of the boundary they run at (`dissolveShares()` of its
 * `boundaryStart()`): `'fade'` is `@remotion/transitions`' `fade()` on both sides (in on `SOFT`,
 * out on `SINE`); `'rise'` enters with the package's `fadeRise()` (`riseDistance(fontSize)` px, on
 * `ARRIVE`, its opacity on the entrance's curve) and leaves by the same fade, without moving;
 * `'cut'` has neither. A length left out is the package's default.
 *
 * ```ts
 * animationFrom({lines: 'fade'}, {enterFrames: 14, exitFrames: 10}); // a 20-frame line dissolve
 * ```
 */
export const animationFrom = (
  animation: Pick<Animation, 'lines'>,
  options: AnimationFromOptions = {},
): LineAnimationProps => {
  if (animation.lines === 'cut') return {};
  const length = (frames: number | undefined) =>
    frames === undefined ? {} : {durationInFrames: Math.max(1, Math.round(frames))};
  const easing = options.enterEasing ?? SOFT;
  // `fade()` keeps the exiting side fully visible unless told otherwise.
  const exit: MushafLineAnimationProp = {
    presentation: fade({shouldFadeOutExitingScene: true}),
    timing: exitTiming({...length(options.exitFrames), easing: SINE}),
  };
  if (animation.lines === 'rise') {
    const distance = riseDistance(options.fontSize ?? 90);
    return {
      enter: {
        // fadeRise()'s own opacity curve is SOFT: pass another one only when asked.
        presentation: fadeRise(options.enterEasing === undefined ? {distance} : {distance, easing}),
        timing: enterTiming({...length(options.enterFrames), easing: Easing.linear}),
      },
      exit,
    };
  }
  return {enter: {presentation: fade(), timing: enterTiming({...length(options.enterFrames), easing})}, exit};
};

/** A scroll of no length: `scrollPosition()` jumps a whole line at its step (`lines: 'cut'`). */
const JUMP: TransitionTiming = {getDurationInFrames: () => 0, getProgress: () => 1};

/**
 * The window's `scrollTiming` for `animation`: one line box over `scroll` (24 frames, 34 slow) on
 * `INOUT`, or a jump under `lines: 'cut'`.
 */
export const windowScrollTiming = (animation: Pick<Animation, 'lines' | 'tempo'>, fps = 30): TransitionTiming =>
  animation.lines === 'cut'
    ? JUMP
    : enterTiming({durationInFrames: tempoFrames('scroll', animation.tempo, fps), easing: INOUT});

/**
 * The window's `scrollTiming`: one line box over `scroll` (24 frames, 34 slow) on `INOUT`.
 *
 * @deprecated The scroll has one curve now: use `windowScrollTiming()`, which also knows the cut.
 */
export const scrollTimingFrom = (tempo: Tempo = 'calm'): TransitionTiming =>
  enterTiming({seconds: tempoSeconds('scroll', tempo), easing: INOUT});

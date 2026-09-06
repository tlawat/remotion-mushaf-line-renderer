import * as React from "react";
import { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";

export type SlideFadeProps = {
  /** `'up'` (default): the line rises into place and keeps rising as it leaves. `'down'` mirrors it. */
  readonly direction?: "up" | "down";
  /** How far the line travels, in % of the line box (its own height). Default 28. */
  readonly distance?: number;
  /**
   * Fraction of the window over which the fade runs, separately for each side: the line is fully
   * opaque at `enterOpacityAt` of the entrance (default 0.75) and fully gone at `exitOpacityAt` of
   * the exit (default 0.7 — a line on its way out stops competing for attention early). Ending the fade before the movement is what makes the last part of an
   * entrance read as a settle rather than as a fade.
   *
   * Two lines in one slot should not cross-fade through each other — overlapping text is unreadable
   * mush whatever the curves are. Schedule the outgoing line's exit to *finish* where the next
   * line's entrance starts (the example composition does), and these two only shape each side.
   */
  readonly enterOpacityAt?: number;
  readonly exitOpacityAt?: number;
  /** The exit travels this much of `distance`. Default 0.6 — leaving needs less movement than arriving. */
  readonly exitDistanceScale?: number;
  readonly enterStyle?: React.CSSProperties;
  readonly exitStyle?: React.CSSProperties;
};

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

/**
 * The whole animation, as a pure function of progress — exported so it can be unit-tested frame by
 * frame, and reused if you build your own presentation on top of it.
 */
export const slideFadeStyle = (
  progress: number,
  direction: "entering" | "exiting",
  props: SlideFadeProps = {},
): React.CSSProperties => {
  const {
    direction: axis = "up",
    distance = 28,
    enterOpacityAt = 0.75,
    exitOpacityAt = 0.7,
    exitDistanceScale = 0.6,
  } = props;
  // `progress` is already shaped by the timing's easing; each property only re-maps it over a
  // shorter part of the window, so opacity and movement never ease twice.
  const p = clamp01(progress);
  const sign = axis === "up" ? 1 : -1;
  const entering = direction === "entering";
  const opacity = entering
    ? clamp01(p / Math.max(1e-6, enterOpacityAt))
    : 1 - clamp01(p / Math.max(1e-6, exitOpacityAt));
  // Entering: starts `distance` below (above) its slot and arrives at 0. Exiting: continues past it.
  const offset = entering
    ? (1 - p) * distance * sign
    : -p * distance * exitDistanceScale * sign;
  return {
    opacity,
    // Left sub-pixel on purpose: rounding to whole pixels makes slow motion step visibly, and a
    // frame-by-frame render rasterises the glyphs afresh either way.
    transform: `translateY(${offset.toFixed(4)}%)`,
    ...(entering ? props.enterStyle : props.exitStyle),
  };
};

const SlideFadePresentation: React.FC<
  TransitionPresentationComponentProps<SlideFadeProps>
> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const style = useMemo(
    () =>
      slideFadeStyle(presentationProgress, presentationDirection, passedProps),
    [presentationDirection, presentationProgress, passedProps],
  );
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

/**
 * A vertical slide combined with a fade — the default look for a line that replaces another.
 *
 * Opacity finishes before the movement does (see `enterOpacityAt` / `exitOpacityAt`), so an entrance
 * ends in a short settle of a line that is already fully readable, and the travel is a quarter of a
 * line box rather than half the screen. Pair it with `enterTiming()` / `exitTiming()` (the defaults),
 * whose curves decelerate in and accelerate out.
 *
 * Same shape as `fade()` from `@remotion/transitions/fade`, so it also works in a real
 * `<TransitionSeries>`.
 */
export const slideFade = (
  props?: SlideFadeProps,
): TransitionPresentation<SlideFadeProps> => ({
  component: SlideFadePresentation,
  props: props ?? {},
});

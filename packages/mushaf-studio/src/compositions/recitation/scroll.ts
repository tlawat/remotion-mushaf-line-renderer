// When the line window scrolls: each step starts after the outgoing line's last word has been
// recited, late and never early (render-design.md 4.3), and finishes `leadInSeconds` before the
// incoming line's first word when the pause allows it. Pure in its arguments.
import {boundaryStart} from '../../schema/marks';
import {type BoundaryInputs, slotEnd} from './transitions';

export type WindowScrollOptions = BoundaryInputs & {
  /** The scroll's length in frames (`windowScrollTiming(animation)`). */
  readonly scrollFrames: number;
  /**
   * The frame the window starts to appear at (`firstAppearance()`): its first line is in the centre
   * slot from then on, and the window fades in around it.
   */
  readonly appearFrame: number;
};

/**
 * The frame each step of the window's scroll starts at (`scrollPosition()`'s `anchor: 'start'`),
 * one per slot of `timeline`, never decreasing. The first line is in place from `appearFrame` (its
 * step is a whole scroll before it).
 * Every later step starts at `max(E, F − leadIn − scroll)` (`boundaryStart()` of kind `'scroll'`):
 * never while the outgoing line's last word is still being recited, so the word being heard never
 * leaves the centre slot, and its mark never fades with it.
 */
export const windowScrollStarts = (options: WindowScrollOptions): readonly number[] => {
  const {timeline, fps, leadInSeconds, scrollFrames} = options;
  let previous = Number.NEGATIVE_INFINITY;
  return timeline.map((slot, j) => {
    const outgoing = timeline[j - 1];
    const start =
      outgoing === undefined
        ? // Over before the window appears: its first line is in the centre slot from the first frame.
          options.appearFrame - scrollFrames
        : boundaryStart({
            kind: 'scroll',
            end: slotEnd(outgoing, slot, options),
            next: slot.start,
            fps,
            duration: scrollFrames,
            leadInSeconds,
          }).start;
    previous = Math.max(previous, start);
    return previous;
  });
};

// When the line window scrolls: each step starts after the outgoing line's last word has been
// recited, late and never early (render-design.md 4.3), and finishes `leadInSeconds` before the
// incoming line's first word when the pause allows it. Pure in its arguments.
import {
  type LineSchedule,
  type MushafLineData,
  type RecitationTimings,
  sliceWords,
  type WordOccurrence,
} from '@tlawat/remotion-mushaf-line';
import {audioClock, isIdentityTimeline, type MemorizeClip} from '../../memorize';
import {boundaryStart, outgoingEnd} from '../../schema/marks';

export type WindowScrollOptions = {
  /** The slots in composition time (`scheduleForClips()`), one per window step. */
  readonly timeline: readonly LineSchedule[];
  readonly lines: readonly MushafLineData[];
  readonly timings: RecitationTimings;
  /** The clip timeline: with repeats, a recording's time is moved to where its clip plays. */
  readonly clips: readonly MemorizeClip[];
  readonly fps: number;
  readonly leadInSeconds: number;
  /** The scroll's length in frames (`scrollTimingFrom(tempo)`). */
  readonly scrollFrames: number;
  /** Default `'first'`. */
  readonly occurrence?: WordOccurrence | undefined;
};

/**
 * `E` of the slot that gives way, in seconds of the composition: the end of the last word its line
 * shows (`outgoingEnd()`), moved onto the clip that plays it, never after the slot's own end. A
 * line with no word (a header) has nothing to wait for: its start.
 */
const slotEnd = (
  slot: LineSchedule,
  next: LineSchedule,
  options: WindowScrollOptions,
  toAudio: (seconds: number) => number,
): number => {
  const line = options.lines[slot.index];
  const words = line === undefined ? [] : sliceWords(line);
  const last = words[words.length - 1];
  if (last === undefined) return slot.start;
  const recorded = outgoingEnd({
    timings: options.timings,
    lastWordId: last.id,
    endsAyah: last.kind === 'end',
    next: toAudio(next.start),
    occurrence: options.occurrence,
  });
  let end = recorded;
  if (!isIdentityTimeline(options.clips)) {
    // The clip the slot ends in: the slot's times are cut to it.
    const at = Math.max(slot.start, slot.end - 1e-6);
    const clip = options.clips.filter((c) => c.compositionFrom <= at + 1e-9).at(-1);
    if (clip !== undefined) {
      end = clip.compositionFrom + Math.min(clip.audioTo, Math.max(clip.audioFrom, recorded)) - clip.audioFrom;
    }
  }
  return Math.max(slot.start, Math.min(slot.end, end));
};

/**
 * The frame each step of the window's scroll starts at (`scrollPosition()`'s `anchor: 'start'`),
 * one per slot of `timeline`, never decreasing. The first line rises into place to be settled
 * `leadInSeconds` before its first word. Every later step starts at `max(E, F − leadIn − scroll)`
 * (`boundaryStart()` of kind `'scroll'`): never while the outgoing line's last word is still being
 * recited, so the word being heard never leaves the centre slot, and its mark never fades with it.
 */
export const windowScrollStarts = (options: WindowScrollOptions): readonly number[] => {
  const {timeline, fps, leadInSeconds, scrollFrames} = options;
  const toAudio = audioClock(options.clips);
  let previous = Number.NEGATIVE_INFINITY;
  return timeline.map((slot, j) => {
    const outgoing = timeline[j - 1];
    const start =
      outgoing === undefined
        ? Math.round((slot.start - leadInSeconds) * fps) - scrollFrames
        : boundaryStart({
            kind: 'scroll',
            end: slotEnd(outgoing, slot, options, toAudio),
            next: slot.start,
            fps,
            duration: scrollFrames,
            leadInSeconds,
          }).start;
    previous = Math.max(previous, start);
    return previous;
  });
};

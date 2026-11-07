// When the printed page turns and how the line band moves between lines: the turn starts after the
// outgoing page's last word, late and never early (render-design.md 4.3), as the staggered dissolve
// (3.2); the band cross-fades at each line's first word (5.11). Pure, in frames of the composition.
import type {WordOccurrence} from '@tlawat/remotion-mushaf-line';
import {boundaryStart, outgoingEnd} from '../schema/marks';
import {INOUT, SOFT, tempoFrames} from '../schema/tokens';
import type {StudioTimings} from '../types';
import {inRanges, type PageLineSlot, type ResolvedPage, rangesOf} from './resolve';

/** One page turn: the frame its dissolve starts at and its length in frames (0: a cut at `start`). */
export type PageTurn = {readonly start: number; readonly duration: number};

export type PageTurnOptions = {
  readonly fps: number;
  /** `D`: the dissolve's length in frames (`round(turnSeconds × fps)`); 0 for `turn: 'cut'`. */
  readonly turnFrames: number;
  /** The longest the next page waits, settled, before its first word. */
  readonly leadInSeconds: number;
  /** Default `'first'`. */
  readonly occurrence?: WordOccurrence | undefined;
};

/** The id of the last word the passage recites on `page`, and whether it closes its ayah (its rosette). */
const lastRecitedWord = (
  resolved: Pick<ResolvedPage, 'pages' | 'lines' | 'range' | 'ranges'>,
  page: number,
): {readonly id: string; readonly endsAyah: boolean} | null => {
  const slot = resolved.lines.filter((line) => line.page === page).at(-1);
  const lines = resolved.pages.find((leaf) => leaf.page === page)?.lines ?? [];
  const line = slot === undefined ? undefined : lines.find((printed) => printed.line === slot.line);
  const ranges = rangesOf(resolved);
  const word = line?.words.filter((w) => inRanges(w, ranges)).at(-1);
  return word === undefined ? null : {id: word.id, endsAyah: word.kind === 'end'};
};

/**
 * The turn into each page after the first, in order (`turns[i]` leads into `pages[i + 1]`): `t0 =
 * max(E, F − leadIn − D_eff)` (`boundaryStart()`), with `E` the end of the last word the passage
 * recites on the outgoing page (`outgoingEnd()`) and `F` the incoming page's first line, `D` the
 * turn's frames compressed to `D_eff` between `Dmin` and `D`. A cut (`turnFrames: 0`) changes at
 * `max(E, F − leadIn)`. A turn never starts before the one before it is over.
 */
export const pageTurns = (
  resolved: Pick<ResolvedPage, 'pages' | 'lines' | 'range' | 'ranges'> & {readonly timings: StudioTimings},
  options: PageTurnOptions,
): readonly PageTurn[] => {
  const {fps, turnFrames, leadInSeconds} = options;
  const turns: PageTurn[] = [];
  let settled = 0;
  for (let i = 1; i < resolved.pages.length; i++) {
    const outgoing = resolved.pages[i - 1]!;
    const incoming = resolved.pages[i]!;
    const next = resolved.lines.find((line) => line.page === incoming.page)?.start ?? incoming.start;
    const last = lastRecitedWord(resolved, outgoing.page);
    const end =
      last === null
        ? next
        : outgoingEnd({
            timings: resolved.timings,
            lastWordId: last.id,
            endsAyah: last.endsAyah,
            next,
            occurrence: options.occurrence,
          });
    const boundary = boundaryStart({end, next, fps, duration: turnFrames, leadInSeconds});
    const start = Math.max(boundary.start, settled);
    turns.push({start, duration: boundary.duration});
    settled = start + boundary.duration;
  }
  return turns;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * How much the printed line `page`/`line` is the current one at `frame`, 0-1: the band's strength
 * and how far the line is out of `dimOtherLines`. A line comes in over `markIn` (5 frames) on
 * `SOFT` from its first word, and lets go over `markOut` (10 frames) on `INOUT` from the next line's
 * first word, so the old band fades out while the new one fades in: the band never jumps. 0 for a
 * line the passage does not recite, and for every line before the first word.
 */
export const pageLineEmphasis = (
  slots: readonly PageLineSlot[],
  page: number,
  line: number,
  frame: number,
  fps: number,
): number => {
  const index = slots.findIndex((slot) => slot.page === page && slot.line === line);
  if (index < 0) return 0;
  const markIn = tempoFrames('markIn', 'calm', fps);
  const markOut = tempoFrames('markOut', 'calm', fps);
  const from = slots[index]!.start * fps;
  const next = slots[index + 1];
  const into = SOFT(clamp01((frame - from) / markIn));
  const away = next === undefined ? 0 : INOUT(clamp01((frame - next.start * fps) / markOut));
  return Math.round(into * (1 - away) * 10_000) / 10_000;
};

/**
 * How far the page's dimming has come in at `frame`, 0-1: nothing before the passage's first word,
 * then over `markIn` on `SOFT` from it, as the first line's band does, so at the first word the
 * other lines ease down with the band instead of dropping in one frame.
 */
export const pageDimPresence = (slots: readonly PageLineSlot[], frame: number, fps: number): number => {
  const first = slots[0];
  if (first === undefined) return 0;
  const markIn = tempoFrames('markIn', 'calm', fps);
  return Math.round(SOFT(clamp01((frame - first.start * fps) / markIn)) * 10_000) / 10_000;
};

/**
 * A printed line's opacity under `pageView.dimOtherLines`: `1 − (1 − dimOtherLines) × (presence −
 * emphasis)`, never above 1. The line being recited (`emphasis` 1) stays at full ink, the others
 * rest at `dimOtherLines` once the dimming is in (`presence`, `pageDimPresence()`), and a line
 * coming in or letting go eases between the two. At the first word `presence` and the first line's
 * emphasis rise together, so that line never dips.
 */
export const pageLineDim = (dimOtherLines: number, presence: number, emphasis: number): number =>
  Math.round((1 - (1 - dimOtherLines) * Math.max(0, presence - emphasis)) * 10_000) / 10_000;

// When the lines, the translation and the corner number of a recitation change: each change starts
// after the outgoing unit's last word has been recited, late and never early (render-design.md 4.3),
// and runs as the staggered dissolve (3.2). Pure in its arguments, in frames of the composition.
import {
  type LineSchedule,
  type MushafLineData,
  normalizeTimings,
  type RecitationTimings,
  sliceWords,
  type WordOccurrence,
} from '@tlawat/remotion-mushaf-line';
import {audioClock, isIdentityTimeline, type MemorizeClip} from '../../memorize/timeline';
import type {LineMotion} from '../../schema';
import {boundaryStart, outgoingEnd} from '../../schema/marks';
import {type DissolveOpacities, dissolve, dissolveShares, SINE, type Tempo, tempoFrames} from '../../schema/tokens';

/** What every boundary of a recitation is measured on: the slots, their lines, the timings on the clip timeline. */
export type BoundaryInputs = {
  /** The slots in composition time (`scheduleForClips()`). */
  readonly timeline: readonly LineSchedule[];
  readonly lines: readonly MushafLineData[];
  readonly timings: RecitationTimings;
  /** The clip timeline: with repeats, a recording's time is moved to where its clip plays. */
  readonly clips: readonly MemorizeClip[];
  readonly fps: number;
  readonly leadInSeconds: number;
  /** Default `'first'`. */
  readonly occurrence?: WordOccurrence | undefined;
};

/** The second of the composition a second of the recording `seconds` is heard at, on `clip`. */
const onClip = (clip: MemorizeClip, seconds: number): number =>
  clip.compositionFrom + Math.min(clip.audioTo, Math.max(clip.audioFrom, seconds)) - clip.audioFrom;

/**
 * `E` of the slot that gives way to `next`, in seconds of the composition: the end of the last word
 * its line shows (`outgoingEnd()`), moved onto the clip that plays it, never outside the slot. A line
 * with no word (a header) has nothing to wait for: its start.
 */
export const slotEnd = (slot: LineSchedule, next: LineSchedule, inputs: BoundaryInputs): number => {
  const line = inputs.lines[slot.index];
  const words = line === undefined ? [] : sliceWords(line);
  const last = words[words.length - 1];
  if (last === undefined) return slot.start;
  const recorded = outgoingEnd({
    timings: inputs.timings,
    lastWordId: last.id,
    endsAyah: last.kind === 'end',
    next: audioClock(inputs.clips)(next.start),
    occurrence: inputs.occurrence,
  });
  let end = recorded;
  if (!isIdentityTimeline(inputs.clips)) {
    // The clip the slot ends in: the slot's times are cut to it.
    const at = Math.max(slot.start, slot.end - 1e-6);
    const clip = inputs.clips.filter((c) => c.compositionFrom <= at + 1e-9).at(-1);
    if (clip !== undefined) end = onClip(clip, recorded);
  }
  return Math.max(slot.start, Math.min(slot.end, end));
};

/**
 * The second of the composition the last ayah ends at: where the end hold counts from. The last
 * clip's end when ayahs repeat.
 */
export const recitationEndSeconds = (timings: RecitationTimings, clips: readonly MemorizeClip[]): number => {
  const last = clips[clips.length - 1];
  const ayat = normalizeTimings(timings).ayat;
  const lastAyah = ayat[ayat.length - 1];
  if (last === undefined || lastAyah === undefined) return lastAyah?.end ?? 0;
  return last.compositionFrom + Math.max(0, lastAyah.end - last.audioFrom);
};

/**
 * The frame the lines are gone at: the last word's end (`recitationEndSeconds()`), then `endHold`
 * (1.5 s), then `endFade` (1 s, 1.4 s slow). The end card, if any, starts there.
 */
export const linesEndFrame = (endSeconds: number, tempo: Tempo, fps: number): number =>
  Math.ceil(endSeconds * fps - 1e-6) + tempoFrames('endHold', tempo, fps) + tempoFrames('endFade', tempo, fps);

/**
 * The frame the first line (or the window) starts to appear at: settled `leadInSeconds` before the
 * first slot's start after an entrance of `entranceFrames`, never before `earliest` (0, or the end
 * of the intro card).
 */
export const firstAppearance = (options: {
  readonly firstStart: number;
  readonly leadInSeconds: number;
  readonly fps: number;
  readonly entranceFrames: number;
  readonly earliest: number;
}): number =>
  Math.max(
    options.earliest,
    Math.round((options.firstStart - options.leadInSeconds) * options.fps) - options.entranceFrames,
  );

/**
 * How present the lines are at `frame`, 0-1, for what comes and goes with them (the translation):
 * in over `windowIn` on `SINE` from their first appearance, out over `endFade` on `SINE` to their end.
 */
export const linesPresence = (
  frame: number,
  options: {readonly appear: number; readonly windowIn: number; readonly end: number; readonly endFade: number},
): number => {
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const rise =
    options.windowIn <= 0
      ? frame >= options.appear
        ? 1
        : 0
      : SINE(clamp01((frame - options.appear) / options.windowIn));
  const fall =
    options.endFade <= 0
      ? frame >= options.end
        ? 1
        : 0
      : SINE(clamp01((frame - (options.end - options.endFade)) / options.endFade));
  return Math.round(rise * (1 - fall) * 10_000) / 10_000;
};

/** One line of one-line mode: its `<Sequence>` and the lengths of its entrance and exit, in frames. */
export type LinePlan = {
  /** The slot of the timeline the line shows. */
  readonly slot: number;
  readonly from: number;
  readonly durationInFrames: number;
  /** 0: no entrance (a cut). */
  readonly enterFrames: number;
  /** 0: no exit (a cut). */
  readonly exitFrames: number;
  /** The first line: it appears over `windowIn` on `SINE`, as the window does. */
  readonly first: boolean;
};

export type LinePlanOptions = BoundaryInputs & {
  readonly motion: LineMotion;
  readonly tempo: Tempo;
  /** The earliest frame the first line may start to appear at: the end of the intro card, else 0. */
  readonly earliest: number;
  /** `recitationEndSeconds()`: the last line holds `endHold` after it, then fades over `endFade`. */
  readonly endSeconds: number;
};

type Change = {readonly start: number; readonly duration: number};

/**
 * The `<Sequence>` of every line in one-line mode (`visibleLines: 0`). Consecutive Sequences overlap
 * so the staggered dissolve runs between them: at each boundary, `D = lineDissolve` compressed to
 * `D_eff` and started at `t0` (`boundaryStart()`), the outgoing line ends `dissolveShares(D_eff).out`
 * frames after `t0` with an exit that long, and the incoming one starts `.in` frames after `t0` with
 * an entrance over the rest. Under `cut` the incoming line starts at `t0` and the outgoing one ends
 * there. A change never starts before the previous one is over (it may be late, never early). The
 * first line appears over `windowIn`; the last holds `endHold` after the last word and fades over
 * `endFade`. A header line squeezed out by a recitation that starts at once (it would leave before
 * its own entrance is over) is left out.
 */
export const oneLinePlan = (options: LinePlanOptions): readonly LinePlan[] => {
  const {timeline, fps, leadInSeconds, tempo} = options;
  const cut = options.motion === 'cut';
  const windowIn = cut ? 0 : tempoFrames('windowIn', tempo, fps);
  const lineDissolve = cut ? 0 : tempoFrames('lineDissolve', tempo, fps);
  const endFrame = linesEndFrame(options.endSeconds, tempo, fps);

  const changesOf = (slots: readonly number[]): readonly Change[] =>
    slots.slice(1).map((slot, k) => {
      const outgoing = timeline[slots[k]!]!;
      const incoming = timeline[slot]!;
      return boundaryStart({
        end: slotEnd(outgoing, incoming, options),
        next: incoming.start,
        fps,
        duration: lineDissolve,
        leadInSeconds,
        tempo,
      });
    });
  const appearOf = (slots: readonly number[]): number =>
    firstAppearance({
      firstStart: timeline[slots[0]!]!.start,
      leadInSeconds,
      fps,
      entranceFrames: windowIn,
      earliest: options.earliest,
    });

  // A header line is left out when the change after it would start before its own entrance is over.
  let slots = timeline.map((_, i) => i);
  for (;;) {
    const changes = changesOf(slots);
    const appear = appearOf(slots);
    const squeezed = slots.findIndex((slot, k) => {
      const next = changes[k];
      if (next === undefined || options.lines[timeline[slot]!.index]?.type === 'ayah') return false;
      const settled = k === 0 ? appear + windowIn : changes[k - 1]!.start + changes[k - 1]!.duration;
      return next.start < settled;
    });
    if (squeezed < 0 || slots.length === 1) break;
    slots = slots.filter((_, k) => k !== squeezed);
  }

  const appear = appearOf(slots);
  // Late, never early: a change waits for the one before it (or the first appearance) to be over.
  const changes: Change[] = [];
  let settled = appear + windowIn;
  for (const change of changesOf(slots)) {
    const start = Math.max(change.start, settled);
    changes.push({start, duration: change.duration});
    settled = start + change.duration;
  }
  return slots.map((slot, k) => {
    const before = changes[k - 1];
    const after = changes[k];
    const from = before === undefined ? appear : before.start + (cut ? 0 : dissolveShares(before.duration).in);
    const enterFrames =
      before === undefined ? windowIn : cut ? 0 : before.duration - dissolveShares(before.duration).in;
    const out = after === undefined ? 0 : cut ? 0 : dissolveShares(after.duration).out;
    const end = after === undefined ? endFrame : after.start + out;
    return {
      slot,
      from,
      durationInFrames: Math.max(1, end - from),
      enterFrames,
      exitFrames: after === undefined ? (cut ? 0 : tempoFrames('endFade', tempo, fps)) : out,
      first: before === undefined,
    };
  });
};

/** One change of the ayah on screen: to `key`, starting at frame `start`, `duration` frames of dissolve. */
export type AyahChange = {readonly key: string; readonly start: number; readonly duration: number};

export type AyahChangeOptions = Omit<BoundaryInputs, 'timeline' | 'lines'> & {
  readonly tempo: Tempo;
};

/** The translation key `"surah:ayah"` of a clip. */
const clipKey = (clip: MemorizeClip, timings: RecitationTimings): string =>
  `${clip.surah ?? (timings.version === 1 ? timings.surah : 0)}:${clip.ayah}`;

/**
 * When the ayah on screen changes, for the translation and the corner number: the first entry is
 * the first ayah, from the start (`start` −∞); every later one starts at `t0 = max(E, F − leadIn −
 * D_eff)` with `E` the end of the outgoing ayah's last word and `F` the incoming ayah's first word,
 * `D = translationDissolve` compressed to `D_eff` (`boundaryStart()`), and never before the change
 * before it is over. A play of the same ayah again (memorisation) changes nothing.
 */
export const ayahChanges = (options: AyahChangeOptions): readonly AyahChange[] => {
  const {timings, clips, fps, leadInSeconds, tempo} = options;
  const ayat = normalizeTimings(timings).ayat;
  const timingOf = (clip: MemorizeClip) =>
    ayat.find((a) => a.ayah === clip.ayah && (clip.surah === undefined || a.surah === clip.surah));
  const duration = tempoFrames('translationDissolve', tempo, fps);
  const changes: AyahChange[] = [];
  let previous: MemorizeClip | undefined;
  for (const clip of clips) {
    const key = clipKey(clip, timings);
    if (previous === undefined) {
      changes.push({key, start: Number.NEGATIVE_INFINITY, duration: 0});
    } else if (key !== clipKey(previous, timings)) {
      const outgoing = timingOf(previous);
      const incoming = timingOf(clip);
      const firstWord = incoming?.words?.[0]?.start ?? incoming?.start ?? clip.audioFrom;
      const next = onClip(clip, firstWord);
      const lastWord = outgoing?.words?.at(-1);
      const recorded =
        outgoing === undefined
          ? previous.audioTo
          : outgoingEnd({
              timings,
              lastWordId: lastWord?.id ?? `${outgoing.surah}:${outgoing.ayah}:0`,
              endsAyah: true,
              next: firstWord,
              occurrence: options.occurrence,
            });
      const boundary = boundaryStart({end: onClip(previous, recorded), next, fps, duration, leadInSeconds, tempo});
      const last = changes[changes.length - 1]!;
      const settled = last.start + last.duration;
      changes.push({key, start: Math.max(boundary.start, settled), duration: boundary.duration});
    }
    previous = clip;
  }
  return changes;
};

/** The ayah on screen at a frame, and the one leaving while the change runs. */
export type ShownAyah = {
  readonly key: string | null;
  /** The ayah leaving and its opacity, during a change; `null` otherwise. */
  readonly outgoing: {readonly key: string; readonly opacity: number} | null;
  /** The incoming ayah's opacity: 1 once the change is over. */
  readonly opacity: number;
};

/**
 * What `ayahChanges()` shows at `frame`: the ayah of the last change started, dissolving from the
 * one before over the change (`dissolve()`); `duration` replaces the change's own length (the
 * corner number changes over `labelChange` at the translation's `t0`). `{key: null}` for no ayah.
 */
export const shownAyahAt = (changes: readonly AyahChange[], frame: number, duration?: number): ShownAyah => {
  let index = -1;
  for (let i = 0; i < changes.length; i++) {
    if (changes[i]!.start <= frame) index = i;
    else break;
  }
  const current = changes[Math.max(0, index)];
  if (current === undefined) return {key: null, outgoing: null, opacity: 1};
  const before = index > 0 ? changes[index - 1] : undefined;
  const length = duration ?? current.duration;
  if (before === undefined || frame >= current.start + length) return {key: current.key, outgoing: null, opacity: 1};
  const sides: DissolveOpacities = dissolve(frame - current.start, length);
  return {key: current.key, outgoing: {key: before.key, opacity: sides.out}, opacity: sides.in};
};

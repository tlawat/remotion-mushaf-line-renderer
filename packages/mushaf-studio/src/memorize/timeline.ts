import type {TransitionTiming} from '@remotion/transitions';
import {
  type LineSchedule,
  type MushafLineData,
  type RecitationTimings,
  scrollPosition,
  sliceWords,
} from '@tlawat/remotion-mushaf-line';
import type {Memorize} from '../schema';

/**
 * One play of one ayah: the recording's `audioFrom`..`audioTo` (seconds of the audio the composition
 * plays, after its own offset) heard from `compositionFrom` (seconds of the composition).
 * `repetition` counts from 1 to the timeline's repeats.
 */
export type MemorizeClip = {
  readonly ayah: number;
  readonly repetition: number;
  readonly audioFrom: number;
  readonly audioTo: number;
  readonly compositionFrom: number;
};

/** Float noise from a sum (0.1 + 0.2) rounded off at the microsecond, finer than any aligner. */
const roundTime = (seconds: number): number => Math.round(seconds * 1e6) / 1e6;

/** How many times each ayah plays: `memorize.repeat` in every mode but `'off'`, where it is 1. */
export const repeatsOf = (memorize: Pick<Memorize, 'mode' | 'repeat'>): number =>
  memorize.mode === 'off' ? 1 : Math.max(1, Math.floor(memorize.repeat));

/**
 * The clip timeline of a recitation under `memorize`: each ayah `repeatsOf(memorize)` times, its
 * recording from `start` to `end` (to the next ayah's `start` when they overlap, so no audio is
 * heard twice at once), `pauseSeconds` of silence between two plays of the same ayah, and the gap
 * the recording has between two ayahs kept as it is. The first clip starts where the first ayah
 * does, so whatever comes before it (the lead-in, the header lines, the title card) is unchanged.
 *
 * With one play per ayah every clip starts at its ayah's own `start`: the timeline is the
 * recording's, and `audioTimeAt()` is the identity. `[]` for timings without ayahs.
 *
 * ```ts
 * clipTimeline(timings, {mode: 'repeat', repeat: 3, pauseSeconds: 0.5})
 * // [{ayah: 2, repetition: 1, audioFrom: 0.331, audioTo: 3.391, compositionFrom: 0.331},
 * //  {ayah: 2, repetition: 2, ..., compositionFrom: 3.891}, {ayah: 2, repetition: 3, ..., compositionFrom: 7.451}, ...]
 * ```
 */
export const clipTimeline = (
  timings: RecitationTimings,
  memorize: Pick<Memorize, 'mode' | 'repeat' | 'pauseSeconds'>,
): readonly MemorizeClip[] => {
  const repeats = repeatsOf(memorize);
  const pause = Math.max(0, memorize.pauseSeconds);
  const clips: MemorizeClip[] = [];
  // Seconds the composition has gained on the recording so far: the extra plays and their pauses.
  let shift = 0;
  timings.ayat.forEach((ayah, i) => {
    const next = timings.ayat[i + 1];
    const audioFrom = ayah.start;
    const audioTo = Math.max(audioFrom, next === undefined ? ayah.end : Math.min(ayah.end, next.start));
    const length = audioTo - audioFrom;
    for (let repetition = 1; repetition <= repeats; repetition++) {
      clips.push({
        ayah: ayah.ayah,
        repetition,
        audioFrom,
        audioTo,
        // Exactly the ayah's own start while nothing has been added before it: an identity timeline is exact.
        compositionFrom:
          repetition === 1 && shift === 0
            ? audioFrom
            : roundTime(audioFrom + shift + (repetition - 1) * (length + pause)),
      });
    }
    shift += (repeats - 1) * (length + pause);
  });
  return clips;
};

/** Whether a timeline plays the recording as it is (one clip per ayah, at its own time). */
export const isIdentityTimeline = (clips: readonly MemorizeClip[]): boolean =>
  clips.every((clip) => clip.repetition === 1 && clip.compositionFrom === clip.audioFrom);

/** Where the last clip ends, in seconds of the composition; 0 for no clips. */
export const timelineEnd = (clips: readonly MemorizeClip[]): number => {
  const last = clips[clips.length - 1];
  return last === undefined ? 0 : roundTime(last.compositionFrom + (last.audioTo - last.audioFrom));
};

/**
 * Frames for a timeline: the last clip's end plus one second, for the last line to leave, as
 * `recitationDuration()` counts the recording's. Never under 1.
 */
export const timelineDuration = (clips: readonly MemorizeClip[], fps: number): number =>
  Math.max(1, Math.ceil((timelineEnd(clips) + 1) * fps));

/**
 * The clip being heard at `seconds` of the composition, through the pause after it: the last one
 * that has started, `null` before the first.
 */
export const clipAt = (clips: readonly MemorizeClip[], seconds: number): MemorizeClip | null => {
  let current: MemorizeClip | null = null;
  for (const clip of clips) {
    if (clip.compositionFrom <= seconds) current = clip;
    else break;
  }
  return current;
};

/**
 * The second of the recording heard at `seconds` of the composition: the same second before the
 * first clip, the clip's own time while it plays, its end through the pause after it (the last
 * word stays current, as `wordAt()` keeps it between words), and the recording running on after
 * the last clip. What `wordAt()`, the dimming and the memorisation rules are asked about.
 */
export const audioTimeAt = (clips: readonly MemorizeClip[], seconds: number): number => {
  const clip = clipAt(clips, seconds);
  if (clip === null) return seconds;
  const time = clip.audioFrom + (seconds - clip.compositionFrom);
  return clip === clips[clips.length - 1] ? time : Math.min(time, clip.audioTo);
};

/**
 * `audioTimeAt()` bound to a timeline, and the identity itself for an identity timeline (so a
 * recitation played once is timed exactly as it was before the timeline existed).
 */
export const audioClock = (clips: readonly MemorizeClip[]): ((seconds: number) => number) =>
  isIdentityTimeline(clips) ? (seconds) => seconds : (seconds) => audioTimeAt(clips, seconds);

/**
 * The repetition counter's text for `clip`: `"2/3"`; `null` when ayahs play once (or before the
 * first clip), where a counter would say nothing.
 */
export const repeatCounterText = (clip: MemorizeClip | null, repeats: number): string | null =>
  clip === null || repeats <= 1 ? null : `${clip.repetition}/${repeats}`;

/**
 * A line schedule laid on the clip timeline, in seconds of the composition: the leading header
 * slots (the first `headers`) as they are, then for every clip the slots whose line shows a word of
 * the clip's ayah (`sliceWords()`, so a slice or a split line counts only its own words), their
 * times cut to the clip and moved to where it plays. A line still on screen from the clip before
 * (an ayah that starts mid-line, or the next play of an ayah on one line) continues that slot
 * instead of coming in again. The same schedule for an identity timeline.
 */
export const scheduleForClips = (
  schedule: readonly LineSchedule[],
  lines: readonly MushafLineData[],
  clips: readonly MemorizeClip[],
  headers: number,
): readonly LineSchedule[] => {
  if (isIdentityTimeline(clips)) return schedule;
  const out: LineSchedule[] = schedule.filter((slot) => slot.index < headers).map((slot) => ({...slot}));
  const timed = schedule.filter((slot) => slot.index >= headers);
  const ayahsOf = new Map<number, ReadonlySet<number>>();
  for (const slot of timed) {
    const line = lines[slot.index];
    ayahsOf.set(slot.index, new Set(line ? sliceWords(line).map((word) => word.ayah) : []));
  }
  for (const clip of clips) {
    const clamp = (t: number) => Math.min(clip.audioTo, Math.max(clip.audioFrom, t));
    const at = (t: number) => roundTime(clip.compositionFrom + clamp(t) - clip.audioFrom);
    for (const slot of timed) {
      if (!ayahsOf.get(slot.index)?.has(clip.ayah)) continue;
      const start = at(slot.start);
      const end = Math.max(start, at(slot.end));
      const last = out[out.length - 1];
      if (last !== undefined && last.index === slot.index && last.index >= headers) {
        out[out.length - 1] = {...last, end: Math.max(last.end, end)};
      } else {
        out.push({index: slot.index, start, end});
      }
    }
  }
  return out;
};

/**
 * Where a line window is scrolled to when its current line can go back as well as forward (the
 * next play of an ayah scrolls back to its first line): `steps[j]` is the frame at which line
 * `targets[j]` becomes current. Each step contributes its own scroll of `timing` (the package's
 * `scrollPosition()` of that step alone), weighted by how far it moves, so with `targets` 0, 1, 2…
 * this is `scrollPosition({steps})` exactly, and two steps closer together than the scroll blend
 * the same way. Before the first step the first target's line rises into place, as there.
 */
export const scrollTargetPosition = (options: {
  readonly frame: number;
  readonly fps: number;
  readonly steps: readonly number[];
  readonly targets: readonly number[];
  readonly timing?: TransitionTiming | undefined;
}): number => {
  const {frame, fps, steps, targets, timing} = options;
  const first = targets[0];
  if (first === undefined) return 0;
  let position = first - 1;
  let previous = first - 1;
  steps.forEach((step, j) => {
    const target = targets[j] ?? previous;
    // One step alone: its eased progress minus one.
    const progress = scrollPosition({frame, fps, steps: [step], ...(timing ? {timing} : {})}) + 1;
    position += (target - previous) * progress;
    previous = target;
  });
  return position;
};

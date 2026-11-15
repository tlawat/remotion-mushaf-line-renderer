// When each ayah of `<MushafAyahText>` is on screen and how it comes and goes: one ayah at a time,
// the staggered dissolve (`ayahDissolve`) at each boundary after the outgoing ayah's last word
// (render-design.md 4.3, 5.2), the first ayah appearing over `windowIn`, the last holding `endHold`
// after the last word and fading over `endFade`. Pure, in frames of the composition.
import type {RecitationTimings, WordOccurrence} from '@tlawat/remotion-mushaf-line';
import {
  ayahChanges,
  firstAppearance,
  linesEndFrame,
  recitationEndSeconds,
} from '../compositions/recitation/transitions';
import type {MemorizeClip} from '../memorize/timeline';
import type {LineMotion} from '../schema';
import {dissolve, dissolveShares, SINE, type Tempo, tempoFrames} from '../schema/tokens';

/** One ayah's `<Sequence>` and the two sides of its presence, in frames of the composition. */
export type AyahPlan = {
  /** `"surah:ayah"`. */
  readonly key: string;
  readonly from: number;
  readonly durationInFrames: number;
  /** The change that brings it in: its start and length (0: a cut); for the first ayah, its appearance over `windowIn`. */
  readonly enter: {readonly start: number; readonly duration: number; readonly first: boolean};
  /** The change that takes it away; for the last ayah, its fade over `endFade` ending at `from + durationInFrames`. */
  readonly exit: {readonly start: number; readonly duration: number; readonly last: boolean};
};

export type AyahPlanOptions = {
  readonly timings: RecitationTimings;
  readonly clips: readonly MemorizeClip[];
  /** The ayah-end rosettes (`markerIds()`): the end hold counts from the last word, not its rosette. */
  readonly markers: ReadonlySet<string>;
  readonly fps: number;
  readonly leadInSeconds: number;
  readonly tempo: Tempo;
  readonly motion: LineMotion;
  readonly occurrence?: WordOccurrence | undefined;
};

/**
 * The plan of every ayah, in order: the first appears over `windowIn` settled `leadInSeconds`
 * before its first word (`firstAppearance()`), each later one comes in by the staggered dissolve at
 * `ayahChanges({token: 'ayahDissolve'})` (after the outgoing ayah's last word, never before the
 * change before it is over), its Sequence starting at the incoming side's share and the outgoing
 * one ending at its own. The last holds `endHold` after the last word and fades over `endFade`
 * (`linesEndFrame()`): the end card, if any, starts there. Under `cut` the ayahs change at once.
 */
export const ayahTextPlan = (options: AyahPlanOptions): readonly AyahPlan[] => {
  const {timings, clips, fps, leadInSeconds, tempo} = options;
  const cut = options.motion === 'cut';
  const windowIn = cut ? 0 : tempoFrames('windowIn', tempo, fps);
  const firstClip = clips[0];
  const firstAyah = timings.ayat[0];
  const firstWord = firstAyah?.words?.[0]?.start ?? firstAyah?.start ?? 0;
  const firstStart = firstClip === undefined ? firstWord : firstClip.compositionFrom + firstWord - firstClip.audioFrom;
  const appear = firstAppearance({firstStart, leadInSeconds, fps, entranceFrames: windowIn, earliest: 0});
  const changes = ayahChanges({
    timings,
    clips,
    fps,
    leadInSeconds,
    tempo,
    token: 'ayahDissolve',
    cut,
    settledFrom: appear + windowIn,
    occurrence: options.occurrence,
  });
  const end = linesEndFrame(recitationEndSeconds(timings, clips, options.markers), tempo, fps);
  const endFade = cut ? 0 : tempoFrames('endFade', tempo, fps);
  return changes.flatMap((change, i) => {
    if (change.key === null) return [];
    const after = changes[i + 1];
    const from = i === 0 ? appear : change.start + (change.duration === 0 ? 0 : dissolveShares(change.duration).in);
    const to =
      after === undefined ? end : after.start + (after.duration === 0 ? 0 : dissolveShares(after.duration).out);
    return [
      {
        key: change.key,
        from,
        durationInFrames: Math.max(1, to - from),
        enter: i === 0 ? {start: appear, duration: windowIn, first: true} : {...change, first: false},
        exit:
          after === undefined
            ? {start: end - endFade, duration: endFade, last: true}
            : {start: after.start, duration: after.duration, last: false},
      },
    ];
  });
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * An ayah's presence at `frame` of the composition: its opacity, and how far into its entrance it
 * is (0-1, for the rise of `lines: 'rise'`). The first ayah comes in on `SINE`, the others by the
 * incoming side of the dissolve (`dissolve().in`); it leaves by the outgoing side, the last on
 * `SINE` over `endFade`. A cut is 1 throughout.
 */
export const ayahPresence = (plan: AyahPlan, frame: number): {readonly opacity: number; readonly entered: number} => {
  const {enter, exit} = plan;
  let opacity = 1;
  let entered = 1;
  if (enter.duration > 0) {
    if (enter.first) {
      entered = clamp01((frame - enter.start) / enter.duration);
      opacity = SINE(entered);
    } else {
      const {in: share} = dissolveShares(enter.duration);
      entered = clamp01((frame - enter.start - share) / Math.max(1, enter.duration - share));
      opacity = dissolve(frame - enter.start, enter.duration).in;
    }
  }
  if (exit.duration > 0) {
    opacity *= exit.last
      ? 1 - SINE(clamp01((frame - exit.start) / exit.duration))
      : dissolve(frame - exit.start, exit.duration).out;
  }
  return {opacity: Math.round(opacity * 10_000) / 10_000, entered};
};

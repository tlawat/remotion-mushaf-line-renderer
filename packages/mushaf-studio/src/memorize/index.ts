// The memorisation (hifz) modes: the clip timeline that plays each ayah several times (timeline.ts),
// the per-word visibility rule of the blank and first-letter modes (visibility.ts), the first-letter
// cue for Unicode words (first-letter.ts) and the repetition counter (RepeatCounter.tsx). Wired into
// <MushafRecitation> through `wordStyleFrom()` and into <MushafAyahText> through <AyahText>.
export {firstLetterOf, TATWEEL} from './first-letter';
export {RepeatCounter, type RepeatCounterProps} from './RepeatCounter';
export {
  audioClock,
  audioTimeAt,
  clipAt,
  clipTimeline,
  isIdentityTimeline,
  type MemorizeClip,
  repeatCounterText,
  repeatsOf,
  scheduleForClips,
  scrollTargetPosition,
  timelineDuration,
  timelineEnd,
} from './timeline';
export {
  FAINT_WORD_OPACITY,
  visibilityStyle,
  type WordVisibility,
  type WordVisibilityInput,
  wordVisibility,
} from './visibility';

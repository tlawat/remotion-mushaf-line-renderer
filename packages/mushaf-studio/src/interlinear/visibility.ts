// The memorisation modes over the interlinear labels: a label shows what its word shows, so a word a
// blank mode hides does not leave its gloss behind as a cue. Pure: the rule is `wordVisibility()`,
// the one the printed words' `wordStyle` applies (src/schema/highlight.ts), on the same clock.
import {normalizeTimings, type RecitationTimings} from '@tlawat/remotion-mushaf-line';
import {clipAt, type MemorizeClip} from '../memorize/timeline';
import {type WordVisibility, wordVisibility} from '../memorize/visibility';
import type {Memorize} from '../schema';

/** What the word with this `MushafWord.id` shows on the frame, and so what its label shows. */
export type GlossVisibility = (wordId: string) => WordVisibility;

export type GlossVisibilityOptions = {
  readonly memorize: Pick<Memorize, 'mode' | 'revealAfterRepeats'>;
  /** The clip timeline the composition plays (`clipTimeline()`). */
  readonly clips: readonly MemorizeClip[];
  /** The timings of either version: an ayah of version 2 names its own surah. */
  readonly timings: RecitationTimings;
  /** When each word is first heard, in seconds of the recording: `wordStarts(timings)`. */
  readonly starts: Readonly<Record<string, number>>;
  /** The word the lines highlight (`null` for none): always shown, as in the lines. */
  readonly activeWordId: string | null;
  /** The second of the composition. */
  readonly seconds: number;
  /** The second of the recording heard then: `audioClock(clips)(seconds)`. */
  readonly now: number;
};

/** "1:2:3" → "1:2"; `null` for an id that is not a word's. */
const ayahOf = (wordId: string): string | null => {
  const parts = wordId.split(':');
  return parts.length === 3 ? `${parts[0]}:${parts[1]}` : null;
};

/**
 * The labels' visibility for one frame, word by word, exactly as the printed lines' `wordStyle`
 * hides their words (a word without a time of its own is first heard at its ayah's start; the
 * printed lines are glyphs, so `'first-letters'` is a faint outline). `undefined` for `'off'` and
 * `'repeat'`, which hide nothing: the labels are then left as they are.
 */
export const glossVisibilityFrom = (options: GlossVisibilityOptions): GlossVisibility | undefined => {
  const {memorize, clips, timings, starts, activeWordId, seconds, now} = options;
  if (memorize.mode === 'off' || memorize.mode === 'repeat') return undefined;
  const ayahStarts = new Map(normalizeTimings(timings).ayat.map((ayah) => [`${ayah.surah}:${ayah.ayah}`, ayah.start]));
  const clip = clipAt(clips, seconds);
  return (wordId) => {
    const ayah = ayahOf(wordId);
    return wordVisibility({
      mode: memorize.mode,
      revealAfterRepeats: memorize.revealAfterRepeats,
      start: starts[wordId] ?? (ayah === null ? undefined : ayahStarts.get(ayah)),
      now,
      active: wordId === activeWordId,
      clip,
      script: 'glyph',
    });
  };
};

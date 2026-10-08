import type * as React from 'react';
import type {Memorize} from '../schema';
import type {MemorizeClip} from './timeline';

/**
 * What a word shows under a memorisation mode: all of it, nothing (it keeps its place), a faint
 * outline, or (Unicode text only) its first letter and a tatweel.
 */
export type WordVisibility = 'shown' | 'hidden' | 'faint' | 'first-letter';

/** The opacity of a word under `'first-letters'` in a glyph font, where a word cannot be cut into letters. */
export const FAINT_WORD_OPACITY = 0.12;

export type WordVisibilityInput = {
  readonly mode: Memorize['mode'];
  /** `memorize.revealAfterRepeats`: the plays of an ayah that blank it, from the first. */
  readonly revealAfterRepeats: number;
  /** When the word is first heard, in seconds of the recording; `undefined` when nothing times it. */
  readonly start: number | undefined;
  /** The second of the recording being heard (`audioTimeAt()`). */
  readonly now: number;
  /** The word is the one being recited. */
  readonly active: boolean;
  /** The clip being heard (`clipAt()`), `null` before the first: its play number and where it starts. */
  readonly clip: Pick<MemorizeClip, 'repetition' | 'audioFrom'> | null;
  /** `'glyph'` for the printed lines (whole glyphs only), `'unicode'` for Unicode text. */
  readonly script: 'glyph' | 'unicode';
};

/**
 * The memorisation rule for one word on one frame; pure.
 *
 * - `'off'` and `'repeat'` show every word.
 * - The blank modes and `'first-letters'` apply on the first `revealAfterRepeats` plays of an ayah
 *   (before the first clip too); later plays show everything.
 * - `'blank-upcoming'`: a word not yet recited (its start after `now`, or untimed) is hidden.
 * - `'blank-all'`: only the active word and those recited in this play (from the clip's start to
 *   `now`) are shown; what earlier plays and ayahs recited is hidden again.
 * - `'first-letters'`: as `'blank-upcoming'`, but an upcoming word shows its first letter in Unicode
 *   text, and a faint outline (`FAINT_WORD_OPACITY`) in the printed lines' glyph fonts, which set a
 *   whole word as one glyph and cannot be cut into letters.
 */
export const wordVisibility = (input: WordVisibilityInput): WordVisibility => {
  const {mode, revealAfterRepeats, start, now, active, clip, script} = input;
  if (mode === 'off' || mode === 'repeat') return 'shown';
  if ((clip?.repetition ?? 1) > revealAfterRepeats) return 'shown';
  const recited = start !== undefined && start <= now;
  const inThisPlay = mode !== 'blank-all' || (start !== undefined && start >= (clip?.audioFrom ?? -Infinity));
  if (active || (recited && inThisPlay)) return 'shown';
  if (mode === 'first-letters') return script === 'unicode' ? 'first-letter' : 'faint';
  return 'hidden';
};

/**
 * The paint-only style of a visibility: `opacity` 0 for hidden (the word keeps its place, so
 * nothing reflows), `FAINT_WORD_OPACITY` for faint, nothing otherwise (`'first-letter'` changes the
 * text, not the style).
 */
export const visibilityStyle = (visibility: WordVisibility): React.CSSProperties | undefined => {
  switch (visibility) {
    case 'hidden':
      return {opacity: 0};
    case 'faint':
      return {opacity: FAINT_WORD_OPACITY};
    case 'shown':
    case 'first-letter':
      return undefined;
  }
};

import type * as React from 'react';
import type {Memorize} from '../schema';
import {isLightGround} from '../schema/color';
import {SINE, SOFT, tempoSeconds} from '../schema/tokens';
import {clipAt, type MemorizeClip} from './timeline';

/**
 * What a word shows under a memorisation mode: all of it, nothing (it keeps its place), a faint
 * outline, or (Unicode text only) its first letter and a tatweel.
 */
export type WordVisibility = 'shown' | 'hidden' | 'faint' | 'first-letter';

/**
 * The opacity of a word under `'first-letters'` in a glyph font, where a word cannot be cut into
 * letters: the ghost on a light ground (`ghostOpacity()`; 0.20 on a dark one).
 */
export const FAINT_WORD_OPACITY = 0.14;

/** The `'first-letters'` ghost on `ground`: 0.14 on a light ground, 0.20 on a dark one, where the same faintness reads less. */
export const ghostOpacity = (ground: string): number => (isLightGround(ground) ? FAINT_WORD_OPACITY : 0.2);

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

export type MemorizeOpacityInput = Omit<WordVisibilityInput, 'clip'> & {
  /** Seconds of the composition: when a play starts. */
  readonly seconds: number;
  /** The clip timeline (`clipTimeline()`): the play being heard, and the one before it. */
  readonly clips: readonly MemorizeClip[];
  /** The ground (`groundOf()`): the ghost's strength. Default ivory. */
  readonly ground?: string | undefined;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The opacity memorisation gives a word on one frame, 0-1 (render-design.md 5.7): what
 * `wordVisibility()` decides, eased. A hidden word (or the `'first-letters'` ghost) comes in over
 * `reveal` (7 frames) on `SOFT` from its own start, never before it; a word that was shown at the
 * end of the previous play and is hidden in this one (`'blank-all'`, and every play after the
 * first of a blanking mode) goes back over `rehide` (12 frames) on `SINE` from the play's start.
 * 1 for a word shown. Pure.
 */
export const memorizeOpacity = (input: MemorizeOpacityInput): number => {
  const {clips, seconds, start, now} = input;
  const ghost = ghostOpacity(input.ground ?? '#f8f3e6');
  const clip = clipAt(clips, seconds);
  const levelOf = (visibility: WordVisibility): number =>
    visibility === 'hidden' ? 0 : visibility === 'faint' ? ghost : 1;
  const visibility = wordVisibility({...input, clip});
  const level = levelOf(visibility);
  if (level === 1) {
    // Revealed at its own start: from what it showed just before.
    const reveal = tempoSeconds('reveal');
    if (start === undefined || now < start || now - start >= reveal) return 1;
    const before = levelOf(wordVisibility({...input, now: start - 1e-6, active: false, clip}));
    return before >= 1 ? 1 : round4(before + (1 - before) * SOFT(clamp01((now - start) / reveal)));
  }
  // Hidden again as a play starts: from what it showed at the end of the previous play.
  const index = clip === null ? -1 : clips.indexOf(clip);
  const previous = index > 0 ? clips[index - 1] : undefined;
  if (clip === null || previous === undefined) return level;
  const rehide = tempoSeconds('rehide');
  const since = seconds - clip.compositionFrom;
  if (since >= rehide) return level;
  const was = levelOf(wordVisibility({...input, now: previous.audioTo, active: false, clip: previous}));
  return was <= level ? level : round4(level + (was - level) * (1 - SINE(clamp01(since / rehide))));
};

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

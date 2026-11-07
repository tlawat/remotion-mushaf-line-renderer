// The per-word rule of the memorisation modes, and the first-letter cue on real Uthmani words.
import {describe, expect, it} from 'vitest';
import {
  clipTimeline,
  FAINT_WORD_OPACITY,
  firstLetterOf,
  ghostOpacity,
  type MemorizeOpacityInput,
  memorizeOpacity,
  TATWEEL,
  visibilityStyle,
  type WordVisibilityInput,
  wordVisibility,
} from '../../../src/memorize';
import {SINE, SOFT} from '../../../src/schema';
import fatiha from '../../fixtures/timings/fatiha.json';
import fatihaText from '../../fixtures/unicode/fatiha-text.json';

const words = fatihaText.words as Record<string, string>;
/** A word heard at 5 s, asked about on the first play of an ayah that started at 4 s, now 6 s. */
const base: WordVisibilityInput = {
  mode: 'blank-upcoming',
  revealAfterRepeats: 1,
  start: 5,
  now: 6,
  active: false,
  clip: {repetition: 1, audioFrom: 4},
  script: 'glyph',
};
const at = (changes: Partial<WordVisibilityInput>) => wordVisibility({...base, ...changes});

describe('wordVisibility', () => {
  it('shows everything when off and in repeat', () => {
    expect(at({mode: 'off', start: 9})).toBe('shown');
    expect(at({mode: 'repeat', start: 9})).toBe('shown');
  });

  it('blank-upcoming hides the words not yet recited, and untimed words', () => {
    expect(at({start: 5})).toBe('shown');
    expect(at({start: 6})).toBe('shown');
    expect(at({start: 6.01})).toBe('hidden');
    expect(at({start: undefined})).toBe('hidden');
    // A word of an earlier ayah stays recited.
    expect(at({start: 1})).toBe('shown');
  });

  it('shows the active word whatever its time says', () => {
    expect(at({start: 7, active: true})).toBe('shown');
    expect(at({mode: 'blank-all', start: 1, active: true})).toBe('shown');
  });

  it('blank-all shows only what this play recited', () => {
    expect(at({mode: 'blank-all', start: 5})).toBe('shown');
    expect(at({mode: 'blank-all', start: 7})).toBe('hidden');
    expect(at({mode: 'blank-all', start: 3.9})).toBe('hidden');
    expect(at({mode: 'blank-all', start: 4})).toBe('shown');
  });

  it('blanks before the first clip, on the first revealAfterRepeats plays, and reveals after', () => {
    expect(at({start: 7, clip: null})).toBe('hidden');
    expect(at({start: 7, clip: {repetition: 2, audioFrom: 4}})).toBe('shown');
    expect(at({start: 7, revealAfterRepeats: 2, clip: {repetition: 2, audioFrom: 4}})).toBe('hidden');
    expect(at({start: 7, revealAfterRepeats: 2, clip: {repetition: 3, audioFrom: 4}})).toBe('shown');
  });

  it('first-letters: a faint outline in glyph fonts, the first letter in Unicode text', () => {
    expect(at({mode: 'first-letters', start: 7})).toBe('faint');
    expect(at({mode: 'first-letters', start: 7, script: 'unicode'})).toBe('first-letter');
    expect(at({mode: 'first-letters', start: 5, script: 'unicode'})).toBe('shown');
  });
});

describe('visibilityStyle', () => {
  it('is paint-only opacity, and nothing for shown or first-letter', () => {
    expect(visibilityStyle('hidden')).toEqual({opacity: 0});
    expect(visibilityStyle('faint')).toEqual({opacity: FAINT_WORD_OPACITY});
    // The ghost of the render design: 0.14 on a light ground (0.20 on a dark one, `ghostOpacity()`).
    expect(FAINT_WORD_OPACITY).toBe(0.14);
    expect(visibilityStyle('shown')).toBeUndefined();
    expect(visibilityStyle('first-letter')).toBeUndefined();
  });
});

describe('memorizeOpacity', () => {
  type Timings = Parameters<typeof clipTimeline>[0];
  const timings = fatiha as unknown as Timings;
  // Ayah 2 (0.331-3.391 s) twice, half a second apart: the second play from 3.891 s.
  const clips = clipTimeline(timings, {mode: 'blank-all', repeat: 2, pauseSeconds: 0.5});
  /** 1:2:2, heard at 0.901 s of the recording, on the composition's clock `seconds`. */
  const word = (seconds: number, changes: Partial<MemorizeOpacityInput> = {}): number => {
    const clip = clips.filter((c) => c.compositionFrom <= seconds).at(-1)!;
    const now = clip.audioFrom + Math.min(seconds - clip.compositionFrom, clip.audioTo - clip.audioFrom);
    return memorizeOpacity({
      mode: 'blank-all',
      revealAfterRepeats: 2,
      start: 0.901,
      now,
      seconds,
      active: false,
      clips,
      script: 'glyph',
      ...changes,
    });
  };

  it('reveals a hidden word over 7 frames on SOFT from its own start, never before it', () => {
    expect(word(0.9)).toBe(0);
    expect(word(0.901)).toBe(0);
    expect(word(0.901 + 3 / 30)).toBeCloseTo(SOFT(3 / 7), 4);
    expect(word(0.901 + 7 / 30)).toBe(1);
    // Monotonic, frame by frame.
    const ramp = Array.from({length: 9}, (_, f) => word(0.901 + f / 30));
    expect(ramp.every((value, i) => i === 0 || value >= ramp[i - 1]!)).toBe(true);
  });

  it('fades a word heard in the previous play back to hidden over 12 frames when the next play starts', () => {
    const next = clips[1]!.compositionFrom;
    expect(word(next - 0.01)).toBe(1);
    expect(word(next)).toBe(1);
    expect(word(next + 6 / 30)).toBeCloseTo(1 - SINE(0.5), 4);
    expect(word(next + 12 / 30)).toBe(0);
    // And it comes back at its own start in this play.
    expect(word(next + (0.901 - 0.331) + 7 / 30)).toBe(1);
  });

  it('eases in the words a later play shows that the play before hid, from the play’s start, never popping', () => {
    // blank-all, three plays, revealed after the first: play 2 of ayah 2 shows every word, the
    // next ayah's too, which were hidden at the end of play 1.
    const three = clipTimeline(timings, {mode: 'blank-all', repeat: 3, pauseSeconds: 0.5});
    const playTwo = three[1]!;
    const nextAyahWord = (timings as unknown as {ayat: {words: {start: number}[]}[]}).ayat[1]!.words[0]!.start;
    const opacity = (frame: number): number => {
      const seconds = playTwo.compositionFrom + frame / 30;
      const clip = three.filter((c) => c.compositionFrom <= seconds + 1e-9).at(-1)!;
      const now = clip.audioFrom + Math.min(seconds - clip.compositionFrom, clip.audioTo - clip.audioFrom);
      return memorizeOpacity({
        mode: 'blank-all',
        revealAfterRepeats: 1,
        start: nextAyahWord,
        now,
        seconds,
        active: false,
        clips: three,
        script: 'glyph',
      });
    };
    const frames = Array.from({length: 24}, (_, k) => opacity(k - 8));
    // Hidden through play 1 and its pause, 0 as play 2 starts, in over 7 frames on SOFT, then shown.
    expect(frames.slice(0, 9)).toEqual(Array(9).fill(0));
    expect(opacity(3)).toBeCloseTo(SOFT(3 / 7), 4);
    expect(opacity(7)).toBe(1);
    // Never a step larger than the reveal's own largest.
    const largest = Math.max(...Array.from({length: 7}, (_, f) => SOFT((f + 1) / 7) - SOFT(f / 7)));
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]! - frames[i - 1]!).toBeGreaterThanOrEqual(0);
      expect(frames[i]! - frames[i - 1]!).toBeLessThanOrEqual(largest + 1e-4);
    }
  });

  it('reveals the first-letters ghost from 0.14 on a light ground, 0.20 on a dark one', () => {
    expect(ghostOpacity('#f8f3e6')).toBe(0.14);
    expect(ghostOpacity('#121416')).toBe(0.2);
    expect(word(0.5, {mode: 'first-letters'})).toBe(0.14);
    expect(word(0.5, {mode: 'first-letters', ground: '#121416'})).toBe(0.2);
    expect(word(0.901 + 3 / 30, {mode: 'first-letters'})).toBeCloseTo(0.14 + 0.86 * SOFT(3 / 7), 4);
  });

  it('is 1 for a word the mode shows', () => {
    expect(word(0.5, {mode: 'off'})).toBe(1);
    expect(word(0.5, {mode: 'repeat'})).toBe(1);
    expect(word(2, {mode: 'blank-upcoming'})).toBe(1);
  });
});

describe('firstLetterOf', () => {
  it('keeps the first letter of real Uthmani words without its diacritics, then a tatweel', () => {
    expect(firstLetterOf(words['1:1:1']!)).toBe(`ب${TATWEEL}`); // بِسْمِ
    expect(firstLetterOf(words['1:1:2']!)).toBe(`ٱ${TATWEEL}`); // ٱللَّهِ: the hamzat wasl letter stays
    expect(firstLetterOf(words['1:2:2']!)).toBe(`ل${TATWEEL}`); // لِلَّهِ
    expect(firstLetterOf(words['1:2:3']!)).toBe(`ر${TATWEEL}`); // رَبِّ: fatha off
    expect(firstLetterOf(words['1:4:1']!)).toBe(`م${TATWEEL}`); // مَـٰلِكِ
    expect(firstLetterOf(words['1:5:1']!)).toBe(`إ${TATWEEL}`); // إِيَّاكَ: the precomposed hamza below stays
  });

  it('leaves no mark of the stripped ranges in any word of the fixture', () => {
    for (const [id, word] of Object.entries(words)) {
      const cue = firstLetterOf(word);
      expect(cue, id).toMatch(new RegExp(`^.${TATWEEL}$`, 'u'));
      expect(cue, id).not.toMatch(/[ً-ٰٟۖ-ۭ]/u);
    }
  });

  it('strips shadda and small high marks from a first grapheme, and gives "" for an empty word', () => {
    expect(firstLetterOf('بَّۜ')).toBe(`ب${TATWEEL}`);
    expect(firstLetterOf('')).toBe('');
  });
});

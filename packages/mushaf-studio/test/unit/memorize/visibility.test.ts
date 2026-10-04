// The per-word rule of the memorisation modes, and the first-letter cue on real Uthmani words.
import {describe, expect, it} from 'vitest';
import {
  FAINT_WORD_OPACITY,
  firstLetterOf,
  TATWEEL,
  visibilityStyle,
  type WordVisibilityInput,
  wordVisibility,
} from '../../../src/memorize';
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
    expect(FAINT_WORD_OPACITY).toBe(0.12);
    expect(visibilityStyle('shown')).toBeUndefined();
    expect(visibilityStyle('first-letter')).toBeUndefined();
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

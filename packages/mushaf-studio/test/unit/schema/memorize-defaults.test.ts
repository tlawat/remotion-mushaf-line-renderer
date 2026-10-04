// The schema fields of the interlinear glosses and the memorisation modes: their defaults validate,
// and the bounds the Props sidebar enforces.
import {describe, expect, it} from 'vitest';
import {defaultMushafRecitationProps, mushafRecitationSchema} from '../../../src/compositions/recitation';
import {defaultMemorize, defaultRecitationText, memorizeSchema, recitationTextSchema} from '../../../src/schema';
import {defaultMushafAyahTextProps, mushafAyahTextSchema} from '../../../src/unicode';

describe('memorize and glossPosition', () => {
  it('default to off and the strip, and the compositions carry them', () => {
    expect(defaultMemorize).toEqual({mode: 'off', repeat: 3, pauseSeconds: 0.5, revealAfterRepeats: 1});
    expect(defaultRecitationText.glossPosition).toBe('strip');
    expect(defaultMushafRecitationProps.memorize).toEqual(defaultMemorize);
    expect(defaultMushafRecitationProps.text).toEqual(defaultRecitationText);
    expect(defaultMushafAyahTextProps.memorize).toEqual(defaultMemorize);
    expect(mushafRecitationSchema.safeParse(defaultMushafRecitationProps).success).toBe(true);
    expect(mushafAyahTextSchema.safeParse(defaultMushafAyahTextProps).success).toBe(true);
  });

  it('bounds repeat to 1-10, the pause to 0-5 s, the reveal to 1-10, and knows the modes and positions', () => {
    const ok = (changes: object) => memorizeSchema.safeParse({...defaultMemorize, ...changes}).success;
    expect(ok({repeat: 1})).toBe(true);
    expect(ok({repeat: 10})).toBe(true);
    expect(ok({repeat: 0})).toBe(false);
    expect(ok({repeat: 11})).toBe(false);
    expect(ok({repeat: 2.5})).toBe(false);
    expect(ok({pauseSeconds: 5})).toBe(true);
    expect(ok({pauseSeconds: 5.5})).toBe(false);
    expect(ok({revealAfterRepeats: 0})).toBe(false);
    for (const mode of ['off', 'first-letters', 'blank-upcoming', 'blank-all', 'repeat']) expect(ok({mode})).toBe(true);
    expect(ok({mode: 'hide'})).toBe(false);
    const position = (glossPosition: string) =>
      recitationTextSchema.safeParse({...defaultRecitationText, glossPosition}).success;
    expect(['strip', 'interlinear', 'none'].map(position)).toEqual([true, true, true]);
    expect(position('above')).toBe(false);
  });
});

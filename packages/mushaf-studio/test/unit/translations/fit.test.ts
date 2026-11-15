// How large a translation is drawn (render-design.md 5.5): at its size while it takes two lines, at
// 0.85 of it when it needs more, never cut. Under node there is no canvas: the estimate (0.5 em a
// character) stands in for the measure, the same rule applied.
import {describe, expect, it} from 'vitest';
import {
  lineCount,
  measureWidth,
  TRANSLATION_MAX_LINES,
  TRANSLATION_SHRINK,
  textAdvance,
  translationFitSize,
} from '../../../src/translations';

const face = {fontFamily: '"EB Garamond", serif', fontWeight: 500};

describe('lineCount', () => {
  it('wraps at spaces like the browser, a word too wide on a line of its own, nothing for no text', () => {
    // 10 px a character at 20 px.
    expect(textAdvance('abcd', face, 20)).toBe(40);
    expect(lineCount('', face, 20, 100)).toBe(0);
    expect(lineCount('   ', face, 20, 100)).toBe(0);
    expect(lineCount('abcd', face, 20, 100)).toBe(1);
    // "abcd abcd" is 90 px: one line in 100, two in 80.
    expect(lineCount('abcd abcd', face, 20, 100)).toBe(1);
    expect(lineCount('abcd abcd', face, 20, 80)).toBe(2);
    expect(lineCount('abcdefghijklmnop ab', face, 20, 80)).toBe(2);
  });
});

describe('translationFitSize', () => {
  it('keeps the size for two lines, and draws a longer ayah at 0.85 of it', () => {
    expect(TRANSLATION_MAX_LINES).toBe(2);
    expect(TRANSLATION_SHRINK).toBe(0.85);
    const word = 'abcd';
    const two = Array.from({length: 4}, () => word).join(' ');
    // 60 ch of 18 px caps a wide box at 540 px; 4 words of 4 at 36 px are 4 × 72 + 3 × 18 = 342 px: one line.
    expect(measureWidth(face, 36, 2000)).toBe(60 * 18);
    expect(translationFitSize(two, face, 36, 400)).toBe(36);
    const long = Array.from({length: 20}, () => word).join(' ');
    expect(translationFitSize(long, face, 36, 400)).toBe(30.6);
  });
});

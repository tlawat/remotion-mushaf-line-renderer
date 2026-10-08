import {describe, expect, it} from 'vitest';
import {type Caption, captionsToSrt, toCaptions} from '../../../src/captions';

const caption = (text: string, startMs: number, endMs: number): Caption => ({
  text,
  startMs,
  endMs,
  timestampMs: startMs,
  confidence: null,
});

describe('captionsToSrt', () => {
  it('writes index, HH:MM:SS,mmm times and trimmed text, each cue followed by a blank line', () => {
    // As toCaptions() writes them: every caption after the first starts with a space.
    expect(
      captionsToSrt([
        caption('ٱلْحَمْدُ', 0, 59_999),
        caption(' لِلَّهِ', 60_000, 3_599_999),
        caption(' ۝٧', 3_723_004, 363_600_000),
      ]),
    ).toBe(
      [
        '1',
        '00:00:00,000 --> 00:00:59,999',
        'ٱلْحَمْدُ',
        '',
        '2',
        '00:01:00,000 --> 00:59:59,999',
        'لِلَّهِ',
        '',
        '3',
        '01:02:03,004 --> 101:00:00,000',
        '۝٧',
        '',
        '',
      ].join('\n'),
    );
  });

  it('rounds to the millisecond and clamps below 0', () => {
    expect(captionsToSrt([caption('a', -5, 1499.6)])).toBe('1\n00:00:00,000 --> 00:00:01,500\na\n\n');
  });

  it("drops a caption's blank lines, which would end its cue, and trims each line", () => {
    expect(captionsToSrt([caption('a\r\n\nb\n  \nc', 0, 1)])).toBe('1\n00:00:00,000 --> 00:00:00,001\na\nb\nc\n\n');
    expect(captionsToSrt([caption(' a \n\t b', 0, 1)])).toBe('1\n00:00:00,000 --> 00:00:00,001\na\nb\n\n');
  });

  it('writes no leading space for the captions toCaptions() makes', () => {
    const timings = {
      version: 1 as const,
      surah: 112,
      ayat: [
        {
          ayah: 1,
          start: 0,
          end: 1,
          words: [
            {id: '112:1:1', start: 0, end: 0.5},
            {id: '112:1:2', start: 0.5, end: 1},
          ],
        },
      ],
    };
    const srt = captionsToSrt(toCaptions(timings));
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:00,500\n112:1:1\n\n2\n00:00:00,500 --> 00:00:01,000\n112:1:2\n\n');
  });

  it('refuses a time that is not a finite number (BAD_TIMING_EDIT naming the caption), never NaN:NaN', () => {
    for (const [bad, said] of [
      [caption('b', Number.NaN, 2), /Caption 1 \("b"\) starts at NaN: expected a finite number of milliseconds/],
      [caption('b', 1, Number.POSITIVE_INFINITY), /Caption 1 \("b"\) ends at Infinity: expected a finite number/],
      [caption('b', Number.NEGATIVE_INFINITY, 2), /starts at -Infinity/],
    ] as const) {
      expect(() => captionsToSrt([caption('a', 0, 1), bad])).toThrow(
        expect.objectContaining({code: 'BAD_TIMING_EDIT', details: {index: 1}, message: expect.stringMatching(said)}),
      );
    }
  });

  it('is empty for no captions', () => {
    expect(captionsToSrt([])).toBe('');
  });
});

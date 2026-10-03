import {describe, expect, it} from 'vitest';
import {type Caption, captionsToSrt} from '../../../src/captions';

const caption = (text: string, startMs: number, endMs: number): Caption => ({
  text,
  startMs,
  endMs,
  timestampMs: startMs,
  confidence: null,
});

describe('captionsToSrt', () => {
  it('writes index, HH:MM:SS,mmm times and text, each cue followed by a blank line', () => {
    expect(
      captionsToSrt([
        caption('ٱلْحَمْدُ', 0, 59_999),
        caption('لِلَّهِ', 60_000, 3_599_999),
        caption('۝٧', 3_723_004, 363_600_000),
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

  it("drops a caption's blank lines, which would end its cue", () => {
    expect(captionsToSrt([caption('a\r\n\nb\n  \nc', 0, 1)])).toBe('1\n00:00:00,000 --> 00:00:00,001\na\nb\nc\n\n');
  });

  it('is empty for no captions', () => {
    expect(captionsToSrt([])).toBe('');
  });
});

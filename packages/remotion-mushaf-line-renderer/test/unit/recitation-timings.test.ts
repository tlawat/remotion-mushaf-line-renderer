import {describe, expect, it} from 'vitest';
import {parseRecitationTimings, recitedRange, wordAt, wordTiming} from '../../src/recitation/recitation-timings';
import type {RecitationTimings} from '../../src/types';

// Surah 2 of the synthetic mushaf: ayah 3 is recited with a repeat (2:3:1, 2:3:2 twice), ayah 4 has
// no per-word times.
const timings: RecitationTimings = {
  version: 1,
  surah: 2,
  ayat: [
    {
      ayah: 2,
      start: 0,
      end: 9,
      words: [
        {id: '2:2:1', start: 0, end: 2},
        {id: '2:2:2', start: 2, end: 4},
      ],
    },
    {
      ayah: 3,
      start: 10,
      end: 15,
      words: [
        {id: '2:3:1', start: 10, end: 11},
        {id: '2:3:2', start: 11, end: 12},
        {id: '2:3:1', start: 12, end: 13},
        {id: '2:3:2', start: 13, end: 14},
        {id: '2:3:3', start: 14, end: 15},
      ],
    },
    {ayah: 4, start: 16, end: 20, complete: false},
  ],
};

describe('parseRecitationTimings', () => {
  const bad = (value: unknown, message: RegExp) => {
    expect(() => parseRecitationTimings(value)).toThrow(message);
    expect(() => parseRecitationTimings(value)).toThrow(expect.objectContaining({code: 'BAD_RECITATION_TIMINGS'}));
  };
  const withAyah = (ayah: Record<string, unknown>) => ({version: 1, surah: 2, ayat: [ayah]});

  it('returns valid timings as they are, unknown keys included', () => {
    expect(parseRecitationTimings(timings)).toBe(timings);
    const fromTool = {...timings, audio: 'x.mp3', durationSeconds: 21, source: 'a tool'};
    expect(parseRecitationTimings(fromTool)).toBe(fromTool);
    expect(parseRecitationTimings(JSON.parse(JSON.stringify(timings)))).toEqual(timings);
  });

  it('names the version it understands', () => {
    bad(undefined, /must be an object/);
    bad([], /must be an object/);
    bad({surah: 2, ayat: []}, /version is undefined but .* understands version 1/);
    bad({version: 2, surah: 2, ayat: []}, /version is 2 but/);
  });

  it('checks the surah and the ayat list', () => {
    bad({version: 1, surah: 0, ayat: []}, /surah is invalid: expected an integer from 1 to 114 \(got 0\)/);
    bad({version: 1, surah: 115, ayat: []}, /surah is invalid/);
    bad({version: 1, surah: 2}, /ayat is invalid: expected a non-empty array\./);
    bad({version: 1, surah: 2, ayat: []}, /ayat is invalid: expected a non-empty array/);
    bad({version: 1, surah: 2, ayat: [1]}, /ayat\[0\] is invalid: expected an object/);
    bad(withAyah({ayah: 1.5, start: 0, end: 1}), /ayat\[0\]\.ayah is invalid: expected a positive integer \(got 1.5\)/);
    bad(
      {
        version: 1,
        surah: 2,
        ayat: [
          {ayah: 3, start: 0, end: 1},
          {ayah: 3, start: 1, end: 2},
        ],
      },
      /ayat\[1\]\.ayah is invalid: ayat must be in ascending order \(3 after 3\)/,
    );
    bad(withAyah({ayah: 1, start: -1, end: 1}), /ayat\[0\]\.start is invalid: expected seconds/);
    bad(withAyah({ayah: 1, start: 0, end: Number.NaN}), /ayat\[0\]\.end is invalid: expected seconds/);
    bad(withAyah({ayah: 1, start: 2, end: 1}), /ayat\[0\]\.end is invalid: 1 is before start \(2\)/);
    bad(withAyah({ayah: 1, start: 0, end: 1, complete: 'no'}), /ayat\[0\]\.complete is invalid: expected a boolean/);
  });

  it('checks the words: shape, id, ayah, span and audio order', () => {
    const w = (words: unknown) => withAyah({ayah: 3, start: 0, end: 9, words});
    bad(w({}), /ayat\[0\]\.words is invalid: expected an array/);
    bad(w(['2:3:1']), /ayat\[0\]\.words\[0\] is invalid: expected an object/);
    bad(w([{id: '2:3', start: 0, end: 1}]), /words\[0\]\.id is invalid: expected "surah:ayah:position"/);
    bad(w([{id: '2:4:1', start: 0, end: 1}]), /words\[0\]\.id is invalid: expected a word of 2:3 \(got "2:4:1"\)/);
    bad(w([{id: '3:3:1', start: 0, end: 1}]), /expected a word of 2:3/);
    bad(w([{id: '2:3:1', start: 0, end: -1}]), /words\[0\]\.end is invalid: expected seconds/);
    bad(w([{id: '2:3:1', start: 1, end: 0}]), /words\[0\]\.end is invalid: 0 is before start \(1\)/);
    bad(
      w([
        {id: '2:3:1', start: 1, end: 2},
        {id: '2:3:2', start: 0.5, end: 2},
      ]),
      /words\[1\]\.start is invalid: words must be in audio order/,
    );
    // Repeats and a marker sharing its word's location are ordinary entries.
    expect(() =>
      w([
        {id: '2:3:1', start: 1, end: 2},
        {id: '2:3:1', start: 2, end: 3},
        {id: '2:3:1', start: 2, end: 3},
      ]),
    ).not.toThrow();
  });
});

describe('recitedRange', () => {
  it('is the first and last ayah, ready for getMushafLines()', () => {
    expect(recitedRange(timings)).toEqual({surah: 2, fromAyah: 2, toAyah: 4});
    expect(recitedRange({version: 1, surah: 9, ayat: [{ayah: 5, start: 0, end: 1}]})).toEqual({
      surah: 9,
      fromAyah: 5,
      toAyah: 5,
    });
  });
});

describe('wordTiming', () => {
  it('finds the first occurrence by default and the last on request', () => {
    expect(wordTiming(timings, '2:3:1')).toEqual({id: '2:3:1', start: 10, end: 11});
    expect(wordTiming(timings, '2:3:1', 'first')).toEqual({id: '2:3:1', start: 10, end: 11});
    expect(wordTiming(timings, '2:3:1', 'last')).toEqual({id: '2:3:1', start: 12, end: 13});
    expect(wordTiming(timings, '2:3:3', 'last')).toEqual({id: '2:3:3', start: 14, end: 15});
    expect(wordTiming(timings, '2:2:2')).toEqual({id: '2:2:2', start: 2, end: 4});
  });

  it('is null for a word the file does not time', () => {
    expect(wordTiming(timings, '2:2:3')).toBeNull(); // the ayah is timed, the word is not
    expect(wordTiming(timings, '2:4:1')).toBeNull(); // the ayah has no per-word times
    expect(wordTiming(timings, '2:9:1')).toBeNull(); // not recited
    expect(wordTiming(timings, '3:1:1')).toBeNull(); // another surah
  });
});

describe('wordAt', () => {
  it('names the last word started, through pauses and repeats', () => {
    expect(wordAt(timings, -1)).toBeNull();
    expect(wordAt(timings, 0)).toBe('2:2:1');
    expect(wordAt(timings, 1.5)).toBe('2:2:1');
    expect(wordAt(timings, 2)).toBe('2:2:2');
    // The pause between ayah 2's last timed word and ayah 3 keeps 2:2:2 current.
    expect(wordAt(timings, 7)).toBe('2:2:2');
    expect(wordAt(timings, 10)).toBe('2:3:1');
    expect(wordAt(timings, 11.5)).toBe('2:3:2');
    expect(wordAt(timings, 12.5)).toBe('2:3:1'); // the repeat
    expect(wordAt(timings, 13.5)).toBe('2:3:2');
    expect(wordAt(timings, 14)).toBe('2:3:3');
    // After the last timed word (ayah 4 has none) the last one stays current.
    expect(wordAt(timings, 99)).toBe('2:3:3');
  });

  it('is null for a file without per-word times', () => {
    expect(wordAt({version: 1, surah: 2, ayat: [{ayah: 1, start: 0, end: 5}]}, 2)).toBeNull();
  });
});

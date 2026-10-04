import {describe, expect, it} from 'vitest';
import {
  normalizeTimings,
  parseRecitationTimings,
  recitedRange,
  recitedRanges,
  wordAt,
  wordTiming,
} from '../../src/recitation/recitation-timings';
import type {RecitationTimings, RecitationTimingsV1} from '../../src/types';

// A recording that crosses from surah 1 into surah 2 of the synthetic mushaf. Ayah 1:2 and 2:2
// share an ayah number, so a lookup by ayah alone would confuse them.
const timings: RecitationTimings = {
  version: 2,
  ayat: [
    {
      surah: 1,
      ayah: 2,
      start: 0,
      end: 2,
      words: [
        {id: '1:2:1', start: 0, end: 1},
        {id: '1:2:2', start: 1, end: 2},
      ],
    },
    {surah: 2, ayah: 1, start: 3, end: 7, words: [{id: '2:1:1', start: 3, end: 4}]},
    {
      surah: 2,
      ayah: 2,
      start: 8,
      end: 13,
      complete: false,
      words: [
        {id: '2:2:1', start: 8, end: 9},
        {id: '2:2:1', start: 9, end: 10},
      ],
    },
  ],
};

const v1: RecitationTimingsV1 = {
  version: 1,
  surah: 2,
  ayat: [
    {ayah: 1, start: 0, end: 4, words: [{id: '2:1:1', start: 0, end: 1}]},
    {ayah: 2, start: 5, end: 9},
  ],
};

describe('parseRecitationTimings, version 2', () => {
  const bad = (value: unknown, message: RegExp) => {
    expect(() => parseRecitationTimings(value)).toThrow(message);
    expect(() => parseRecitationTimings(value)).toThrow(expect.objectContaining({code: 'BAD_RECITATION_TIMINGS'}));
  };
  const withAyat = (...ayat: unknown[]) => ({version: 2, ayat});

  it('returns valid timings as they are, unknown keys included', () => {
    expect(parseRecitationTimings(timings)).toBe(timings);
    const fromTool = {...timings, audio: 'juz.mp3', source: 'a tool'};
    expect(parseRecitationTimings(fromTool)).toBe(fromTool);
    expect(parseRecitationTimings(JSON.parse(JSON.stringify(timings)))).toEqual(timings);
    // One surah is a valid version 2 file too.
    expect(() => parseRecitationTimings(withAyat({surah: 9, ayah: 1, start: 0, end: 1}))).not.toThrow();
  });

  it('names both versions it understands, and the shape of each', () => {
    bad({version: 3, ayat: []}, /version is 3 but .* understands version 1 \(one surah\) and version 2/);
    bad(null, /must be an object \{version: 1, surah, ayat\} or \{version: 2, ayat\}/);
    // A version 1 body labelled version 2: the surah belongs on each ayah.
    bad({version: 2, surah: 2, ayat: [{ayah: 1, start: 0, end: 1}]}, /version is 2 but the file has a top-level surah/);
    bad(
      {version: 2},
      /ayat is invalid: expected a non-empty array\. The format is \{version: 2, ayat: \[\{surah, ayah/,
    );
    bad(withAyat(), /ayat is invalid: expected a non-empty array/);
    bad(withAyat(7), /ayat\[0\] is invalid: expected an object \{surah, ayah, start, end\}/);
  });

  it('checks each ayah: its surah, its number, its span', () => {
    bad(
      withAyat({ayah: 1, start: 0, end: 1}),
      /ayat\[0\]\.surah is invalid: expected an integer from 1 to 114\. The format is \{version: 2/,
    );
    bad(withAyat({surah: 115, ayah: 1, start: 0, end: 1}), /ayat\[0\]\.surah is invalid/);
    bad(withAyat({surah: 2, ayah: 0, start: 0, end: 1}), /ayat\[0\]\.ayah is invalid: expected a positive integer/);
    bad(withAyat({surah: 2, ayah: 1, start: 2, end: 1}), /ayat\[0\]\.end is invalid: 1 is before start \(2\)/);
    bad(withAyat({surah: 2, ayah: 1, start: 0, end: 1, complete: 1}), /ayat\[0\]\.complete is invalid/);
  });

  it('wants the ayat in recitation order: surah ascending, then ayah', () => {
    const order = /ayat\[1\] is invalid: ayat must be in recitation order, surah ascending then ayah/;
    bad(withAyat({surah: 2, ayah: 1, start: 0, end: 1}, {surah: 1, ayah: 7, start: 1, end: 2}), order);
    bad(withAyat({surah: 2, ayah: 3, start: 0, end: 1}, {surah: 2, ayah: 2, start: 1, end: 2}), /\(2:2 after 2:3\)/);
    bad(withAyat({surah: 2, ayah: 3, start: 0, end: 1}, {surah: 2, ayah: 3, start: 1, end: 2}), /\(2:3 after 2:3\)/);
    // A later surah may restart at any ayah.
    expect(() =>
      parseRecitationTimings(withAyat({surah: 1, ayah: 7, start: 0, end: 1}, {surah: 2, ayah: 1, start: 1, end: 2})),
    ).not.toThrow();
  });

  it("checks each word against its own entry's surah and ayah", () => {
    const entry = (surah: number, ayah: number, words: unknown) => ({surah, ayah, start: 0, end: 9, words});
    bad(
      withAyat(entry(1, 7, []), entry(2, 1, [{id: '1:1:1', start: 0, end: 1}])),
      /ayat\[1\]\.words\[0\]\.id is invalid: expected a word of 2:1 \(got "1:1:1"\)/,
    );
    // The surah of the previous entry is no excuse.
    bad(withAyat(entry(1, 7, []), entry(2, 1, [{id: '1:7:1', start: 0, end: 1}])), /expected a word of 2:1/);
    bad(
      withAyat(entry(2, 1, [{id: '2:1', start: 0, end: 1}])),
      /words\[0\]\.id is invalid: expected "surah:ayah:position"/,
    );
    bad(
      withAyat(
        entry(2, 1, [
          {id: '2:1:1', start: 1, end: 2},
          {id: '2:1:2', start: 0, end: 2},
        ]),
      ),
      /words\[1\]\.start is invalid: words must be in audio order/,
    );
  });
});

describe('normalizeTimings', () => {
  it('returns version 2 as it is', () => {
    expect(normalizeTimings(timings)).toBe(timings);
  });

  it('gives version 1 its surah on every ayah, other keys kept, the same object every call', () => {
    const withAudio = {...v1, audio: 'baqarah.mp3'};
    expect(normalizeTimings(withAudio)).toEqual({
      audio: 'baqarah.mp3',
      version: 2,
      ayat: [
        {surah: 2, ayah: 1, start: 0, end: 4, words: [{id: '2:1:1', start: 0, end: 1}]},
        {surah: 2, ayah: 2, start: 5, end: 9},
      ],
    });
    expect(normalizeTimings(withAudio)).toBe(normalizeTimings(withAudio));
    // The view is valid version 2, and the input is left alone.
    expect(() => parseRecitationTimings(JSON.parse(JSON.stringify(normalizeTimings(v1))))).not.toThrow();
    expect(v1).toEqual({version: 1, surah: 2, ayat: expect.any(Array)});
  });
});

describe('recitedRanges', () => {
  it('gives one range per surah, in recitation order', () => {
    expect(recitedRanges(timings)).toEqual([
      {surah: 1, fromAyah: 2, toAyah: 2},
      {surah: 2, fromAyah: 1, toAyah: 2},
    ]);
    expect(recitedRanges(v1)).toEqual([{surah: 2, fromAyah: 1, toAyah: 2}]);
    expect(
      recitedRanges({
        version: 2,
        ayat: [
          {surah: 112, ayah: 4, start: 0, end: 1},
          {surah: 113, ayah: 1, start: 1, end: 2},
          {surah: 114, ayah: 1, start: 2, end: 3},
          {surah: 114, ayah: 6, start: 3, end: 4},
        ],
      }),
    ).toEqual([
      {surah: 112, fromAyah: 4, toAyah: 4},
      {surah: 113, fromAyah: 1, toAyah: 1},
      {surah: 114, fromAyah: 1, toAyah: 6},
    ]);
  });
});

describe('recitedRange', () => {
  it('takes a version 2 file of one surah, and refuses one that crosses surahs', () => {
    expect(recitedRange({version: 2, ayat: [{surah: 9, ayah: 5, start: 0, end: 1}]})).toEqual({
      surah: 9,
      fromAyah: 5,
      toAyah: 5,
    });
    expect(() => recitedRange(timings)).toThrow(expect.objectContaining({code: 'BAD_RECITATION_TIMINGS'}));
    expect(() => recitedRange(timings)).toThrow(/cross surahs \(1:2-2, 2:1-2\).*Use recitedRanges\(timings\)/);
  });
});

describe('wordTiming and wordAt, version 2', () => {
  it('looks a word up by surah and ayah, not by ayah alone', () => {
    expect(wordTiming(timings, '1:2:1')).toEqual({id: '1:2:1', start: 0, end: 1});
    expect(wordTiming(timings, '2:2:1')).toEqual({id: '2:2:1', start: 8, end: 9});
    expect(wordTiming(timings, '2:2:1', 'last')).toEqual({id: '2:2:1', start: 9, end: 10});
    // 1:1 and 3:2 are not recited, though ayahs numbered 1 and 2 are.
    expect(wordTiming(timings, '1:1:1')).toBeNull();
    expect(wordTiming(timings, '3:2:1')).toBeNull();
    expect(wordTiming(timings, '2:2:2')).toBeNull();
  });

  it('follows the recording across the boundary', () => {
    expect(wordAt(timings, -1)).toBeNull();
    expect(wordAt(timings, 1.5)).toBe('1:2:2');
    // The pause between the surahs keeps the last word of surah 1 current.
    expect(wordAt(timings, 2.5)).toBe('1:2:2');
    expect(wordAt(timings, 3)).toBe('2:1:1');
    expect(wordAt(timings, 9.5)).toBe('2:2:1');
  });
});

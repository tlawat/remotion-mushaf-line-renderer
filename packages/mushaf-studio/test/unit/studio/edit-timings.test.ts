import {parseRecitationTimings} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {isMushafStudioError} from '../../../src/errors';
import {nudgeWord, nudgeWords, roundMs, withEdit} from '../../../src/studio/edit-timings';
import type {AlignmentWord, StudioTimings, StudioTimingsV1} from '../../../src/types';

const AT = '2026-10-03T12:00:00.000Z';

const word = (id: string, text: string, segment: number, start: number, end: number): AlignmentWord => ({
  id,
  text,
  segment,
  start,
  end,
});

const timings = (): StudioTimingsV1 => ({
  version: 1,
  surah: 1,
  audio: 'mushaf-studio/default/fatiha.mp3',
  ayat: [
    {
      ayah: 2,
      start: 0.1,
      end: 2.95,
      words: [
        {id: '1:2:1', start: 0.1, end: 0.67},
        {id: '1:2:2', start: 0.67, end: 1.29},
        {id: '1:2:3', start: 1.29, end: 1.72},
        {id: '1:2:4', start: 1.72, end: 2.95},
      ],
    },
    {
      ayah: 3,
      start: 3.49,
      end: 5.69,
      complete: true,
      words: [
        {id: '1:3:1', start: 3.49, end: 4.56},
        {id: '1:3:2', start: 4.56, end: 5.69},
      ],
    },
  ],
  alignment: {
    version: 1,
    source: 'qud',
    audioId: 'abc',
    segments: [
      {
        segment: 1,
        timeFrom: 0,
        timeTo: 3,
        refFrom: '1:2:1',
        refTo: '1:2:4',
        confidence: 1,
        hasMissingWords: false,
        hasRepeatedWords: false,
        error: null,
        matchedText: 'الحمد لله رب العالمين',
      },
      {
        segment: 2,
        timeFrom: 3.4,
        timeTo: 5.8,
        refFrom: '1:3:1',
        refTo: '1:3:2',
        confidence: 0.7,
        hasMissingWords: false,
        hasRepeatedWords: false,
        error: null,
        matchedText: 'الرحمن الرحيم',
      },
    ],
    words: [
      word('1:2:1', 'ٱلْحَمْدُ', 1, 0.1, 0.67),
      word('1:2:2', 'لِلَّهِ', 1, 0.67, 1.29),
      word('1:2:3', 'رَبِّ', 1, 1.29, 1.72),
      word('1:2:4', 'ٱلْعَٰلَمِينَ', 1, 1.72, 2.95),
      word('1:3:1', 'ٱلرَّحْمَٰنِ', 2, 3.49, 4.56),
      word('1:3:2', 'ٱلرَّحِيمِ', 2, 4.56, 5.69),
    ],
    edits: [],
  },
});

const idsOf = (t: StudioTimings, ayah: number) => t.ayat.find((a) => a.ayah === ayah)!.words!.map((w) => w.id);

describe('nudgeWord', () => {
  it('moves one word in its ayah and in the sidecar, logs the edit and leaves the input alone', () => {
    const before = timings();
    const snapshot = JSON.stringify(before);
    const after = nudgeWord(before, {id: '1:2:2', occurrenceIndex: 0, start: 0.6, end: 1.3, at: AT});
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after.ayat[0]!.words![1]).toEqual({id: '1:2:2', start: 0.6, end: 1.3});
    expect(idsOf(after, 2)).toEqual(['1:2:1', '1:2:2', '1:2:3', '1:2:4']);
    expect(after.ayat[0]!.start).toBe(0.1);
    expect(after.ayat[0]!.end).toBe(2.95);
    expect(after.ayat[1]).toEqual(before.ayat[1]);
    expect(after.alignment!.words[1]).toEqual(word('1:2:2', 'لِلَّهِ', 1, 0.6, 1.3));
    expect(after.alignment!.edits).toEqual([{kind: 'nudge', at: AT, note: '1:2:2#0: 0.67-1.29s to 0.6-1.3s'}]);
    expect(after.audio).toBe(before.audio);
    expect(after.alignment!.segments).toBe(before.alignment!.segments);
    expect(() => parseRecitationTimings(after)).not.toThrow();
  });

  it("recomputes the ayah's span from its words", () => {
    const earlier = nudgeWord(timings(), {id: '1:2:1', occurrenceIndex: 0, start: 0.05, end: 0.67, at: AT});
    expect(earlier.ayat[0]!.start).toBe(0.05);
    const later = nudgeWord(timings(), {id: '1:2:4', occurrenceIndex: 0, start: 1.72, end: 3.1, at: AT});
    expect(later.ayat[0]!.end).toBe(3.1);
    const shorter = nudgeWord(timings(), {id: '1:2:4', occurrenceIndex: 0, start: 1.72, end: 2.5, at: AT});
    expect(shorter.ayat[0]!.end).toBe(2.5);
  });

  it('keeps the words in audio order when a nudge crosses a neighbour, so the file stays valid', () => {
    const after = nudgeWord(timings(), {id: '1:2:3', occurrenceIndex: 0, start: 0.5, end: 0.6, at: AT});
    expect(idsOf(after, 2)).toEqual(['1:2:1', '1:2:3', '1:2:2', '1:2:4']);
    expect(after.alignment!.words.map((w) => w.id)).toEqual(['1:2:1', '1:2:3', '1:2:2', '1:2:4', '1:3:1', '1:3:2']);
    expect(() => parseRecitationTimings(after)).not.toThrow();
  });

  it('addresses a repeated word by its occurrence', () => {
    const base = timings();
    const repeated: StudioTimingsV1 = {
      ...base,
      ayat: [
        base.ayat[0]!,
        {
          ayah: 3,
          start: 3.49,
          end: 7,
          words: [
            {id: '1:3:1', start: 3.49, end: 4.56},
            {id: '1:3:1', start: 5, end: 6},
            {id: '1:3:2', start: 6, end: 7},
          ],
        },
      ],
      alignment: {
        ...base.alignment!,
        words: [
          ...base.alignment!.words.slice(0, 5),
          word('1:3:1', 'ٱلرَّحْمَٰنِ', 2, 5, 6),
          word('1:3:2', 'ٱلرَّحِيمِ', 2, 6, 7),
        ],
      },
    };
    const after = nudgeWord(repeated, {id: '1:3:1', occurrenceIndex: 1, start: 5.1, end: 6, at: AT});
    expect(after.ayat[1]!.words).toEqual([
      {id: '1:3:1', start: 3.49, end: 4.56},
      {id: '1:3:1', start: 5.1, end: 6},
      {id: '1:3:2', start: 6, end: 7},
    ]);
    expect(after.alignment!.words[5]!.start).toBe(5.1);
    expect(after.alignment!.words[4]!.start).toBe(3.49);
    expect(() => nudgeWord(repeated, {id: '1:3:1', occurrenceIndex: 2, start: 5, end: 6, at: AT})).toThrow(
      /recited 2 times in ayah 3; occurrence 2 does not exist/,
    );
  });

  it('rejects a start after the end, a negative time, and a word it cannot find', () => {
    const cases: readonly [Parameters<typeof nudgeWord>[1], RegExp][] = [
      [{id: '1:2:2', occurrenceIndex: 0, start: 1.3, end: 0.6}, /start of 1:2:2 \(1.3s\) is after its end \(0.6s\)/],
      [{id: '1:2:2', occurrenceIndex: 0, start: -0.1, end: 0.6}, /must be seconds, 0 or more/],
      [{id: '2:2:2', occurrenceIndex: 0, start: 0, end: 1}, /not in surah 1/],
      [{id: '1:9:1', occurrenceIndex: 0, start: 0, end: 1}, /ayah 9 is not in this file \(it has 2, 3\)/],
      [{id: '1:2:9', occurrenceIndex: 0, start: 0, end: 1}, /1:2:9 is not timed in ayah 2/],
    ];
    for (const [nudge, message] of cases) {
      let caught: unknown;
      try {
        nudgeWord(timings(), nudge);
      } catch (error) {
        caught = error;
      }
      expect(isMushafStudioError(caught) && caught.code).toBe('BAD_TIMING_EDIT');
      expect((caught as Error).message).toMatch(message);
    }
    const untimed: StudioTimings = {version: 1, surah: 1, ayat: [{ayah: 2, start: 0, end: 3}]};
    expect(() => nudgeWord(untimed, {id: '1:2:1', occurrenceIndex: 0, start: 0, end: 1})).toThrow(
      /ayah 2 has no per-word times/,
    );
    const crossing: StudioTimings = {
      version: 2,
      ayat: [
        {surah: 1, ayah: 7, start: 0, end: 1, words: [{id: '1:7:1', start: 0, end: 1}]},
        {surah: 2, ayah: 1, start: 1, end: 2, words: [{id: '2:1:1', start: 1, end: 2}]},
      ],
    };
    expect(() => nudgeWord(crossing, {id: '1:7:1', occurrenceIndex: 0, start: 0, end: 0.5, at: AT})).toThrow(
      /version 2 \(they cross surahs\); the panel edits a file of one surah/,
    );
  });

  it('starts a manual sidecar when the file has none', () => {
    const base = timings();
    const {alignment: _alignment, ...plain} = base;
    const after = nudgeWord(plain, {id: '1:2:2', occurrenceIndex: 0, start: 0.6, end: 1.3, at: AT});
    expect(after.alignment).toEqual({
      version: 1,
      source: 'manual',
      segments: [],
      words: [],
      edits: [{kind: 'nudge', at: AT, note: '1:2:2#0: 0.67-1.29s to 0.6-1.3s'}],
    });
  });

  it('rounds to the millisecond and appends to the edit log', () => {
    expect(roundMs(1.45 - 0.05)).toBe(1.4);
    expect(roundMs(0.1 + 0.2)).toBe(0.3);
    const once = withEdit(timings(), {kind: 'realign', at: AT, note: '2 boundaries'});
    const twice = withEdit(once, {kind: 'split-segment', at: AT, note: 'max 1 verse'});
    expect(twice.alignment!.edits.map((e) => e.kind)).toEqual(['realign', 'split-segment']);
    expect(once.alignment!.edits).toHaveLength(1);
  });
});

/** Ayah 3 recited with its first word twice, no marker, no `complete` flag. */
const repeated = (): StudioTimingsV1 => {
  const base = timings();
  return {
    ...base,
    ayat: [
      base.ayat[0]!,
      {
        ayah: 3,
        start: 3.49,
        end: 7,
        words: [
          {id: '1:3:1', start: 3.49, end: 4.56},
          {id: '1:3:1', start: 5, end: 6},
          {id: '1:3:2', start: 6, end: 7},
        ],
      },
    ],
    alignment: {
      ...base.alignment!,
      words: [...base.alignment!.words.slice(0, 5), word('1:3:1', 'ٱلرَّحْمَٰنِ', 2, 5, 6), word('1:3:2', 'ٱلرَّحِيمِ', 2, 6, 7)],
    },
  };
};

/** Ayah 3 complete, with the end marker `timingsFromQud()` emits (1:3:3, held 0.8 s after the last word). */
const withMarker = (): StudioTimingsV1 => {
  const base = timings();
  return {
    ...base,
    ayat: [
      base.ayat[0]!,
      {
        ayah: 3,
        start: 3.49,
        end: 6.49,
        complete: true,
        words: [
          {id: '1:3:1', start: 3.49, end: 4.56},
          {id: '1:3:2', start: 4.56, end: 5.69},
          {id: '1:3:3', start: 5.69, end: 6.49},
        ],
      },
    ],
  };
};

const wordsOf = (t: StudioTimings, ayah: number) => t.ayat.find((a) => a.ayah === ayah)!.words!;

describe('nudgeWords', () => {
  it('resolves every occurrence against the file as it is, so a batch lands where the user pointed', () => {
    const before = repeated();
    const nudges = [
      {id: '1:3:1', occurrenceIndex: 0, start: 5.5, end: 5.9, at: AT},
      {id: '1:3:1', occurrenceIndex: 1, start: 3, end: 3.4, at: AT},
    ];
    // One after the other, the first move re-sorts the words and the second one lands on it instead.
    const oneByOne = nudges.reduce(nudgeWord, before);
    expect(wordsOf(oneByOne, 3).map((w) => w.start)).toEqual([3, 5, 6]);
    const together = nudgeWords(before, nudges);
    expect(wordsOf(together, 3)).toEqual([
      {id: '1:3:1', start: 3, end: 3.4},
      {id: '1:3:1', start: 5.5, end: 5.9},
      {id: '1:3:2', start: 6, end: 7},
    ]);
    expect(together.alignment!.words.slice(4).map((w) => [w.id, w.start, w.end])).toEqual([
      ['1:3:1', 3, 3.4],
      ['1:3:1', 5.5, 5.9],
      ['1:3:2', 6, 7],
    ]);
    expect(together.ayat[1]!.start).toBe(3);
    expect(together.ayat[1]!.end).toBe(7);
    expect(together.alignment!.edits).toEqual([
      {kind: 'nudge', at: AT, note: '1:3:1#0: 3.49-4.56s to 5.5-5.9s; 1:3:1#1: 5-6s to 3-3.4s'},
    ]);
    expect(() => parseRecitationTimings(together)).not.toThrow();
    expect(JSON.stringify(before)).toBe(JSON.stringify(repeated()));
  });

  it("moves a complete ayah's end marker with its last recited word", () => {
    const later = nudgeWords(withMarker(), [{id: '1:3:2', occurrenceIndex: 0, start: 5.8, end: 6, at: AT}]);
    expect(wordsOf(later, 3)).toEqual([
      {id: '1:3:1', start: 3.49, end: 4.56},
      {id: '1:3:2', start: 5.8, end: 6},
      {id: '1:3:3', start: 6, end: 6.49},
    ]);
    // Past the marker's own end: the marker shrinks to nothing rather than sort before the word.
    const past = nudgeWords(withMarker(), [{id: '1:3:2', occurrenceIndex: 0, start: 5.8, end: 6.6, at: AT}]);
    expect(wordsOf(past, 3)[2]).toEqual({id: '1:3:3', start: 6.6, end: 6.6});
    expect(past.ayat[1]!.end).toBe(6.6);
    // The last word moved before its neighbour: the marker follows the word that now ends last.
    const earlier = nudgeWords(withMarker(), [{id: '1:3:2', occurrenceIndex: 0, start: 3, end: 3.3, at: AT}]);
    expect(wordsOf(earlier, 3).map((w) => [w.id, w.start, w.end])).toEqual([
      ['1:3:2', 3, 3.3],
      ['1:3:1', 3.49, 4.56],
      ['1:3:3', 4.56, 6.49],
    ]);
    for (const t of [later, past, earlier]) expect(() => parseRecitationTimings(t)).not.toThrow();
    // The marker nudged by hand is left where the user put it.
    const byHand = nudgeWords(withMarker(), [{id: '1:3:3', occurrenceIndex: 0, start: 5.9, end: 6.2, at: AT}]);
    expect(wordsOf(byHand, 3)[2]).toEqual({id: '1:3:3', start: 5.9, end: 6.2});
  });

  it('finds the marker without a sidecar only in the shape the converter gives it', () => {
    const {alignment: _alignment, ...plain} = withMarker();
    const moved = nudgeWords(plain, [{id: '1:3:2', occurrenceIndex: 0, start: 4.56, end: 5.8, at: AT}]);
    expect(wordsOf(moved, 3)[2]).toEqual({id: '1:3:3', start: 5.8, end: 6.49});
    // A complete ayah that simply ends on its last word (the committed fixtures): that word stays a word.
    const ending: StudioTimings = {
      version: 1,
      surah: 1,
      ayat: [{...timings().ayat[0]!, complete: true}],
    };
    const nudged = nudgeWords(ending, [{id: '1:2:3', occurrenceIndex: 0, start: 1.29, end: 1.8, at: AT}]);
    expect(wordsOf(nudged, 2)[3]).toEqual({id: '1:2:4', start: 1.72, end: 2.95});
  });

  it('returns the input for no nudges, checks every nudge before changing anything, and lets the last of two win', () => {
    const base = timings();
    expect(nudgeWords(base, [])).toBe(base);
    expect(() =>
      nudgeWords(base, [
        {id: '1:2:2', occurrenceIndex: 0, start: 0.6, end: 1.3, at: AT},
        {id: '1:9:1', occurrenceIndex: 0, start: 0, end: 1, at: AT},
      ]),
    ).toThrow(/ayah 9 is not in this file/);
    const twice = nudgeWords(base, [
      {id: '1:2:2', occurrenceIndex: 0, start: 0.6, end: 1.3, at: AT},
      {id: '1:2:2', occurrenceIndex: 0, start: 0.65, end: 1.3, at: AT},
    ]);
    expect(wordsOf(twice, 2)[1]).toEqual({id: '1:2:2', start: 0.65, end: 1.3});
  });
});

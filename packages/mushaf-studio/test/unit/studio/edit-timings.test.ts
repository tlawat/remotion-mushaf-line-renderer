import {parseRecitationTimings} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {isMushafStudioError} from '../../../src/errors';
import {nudgeWord, roundMs, withEdit} from '../../../src/studio/edit-timings';
import type {AlignmentWord, StudioTimings} from '../../../src/types';

const AT = '2026-10-03T12:00:00.000Z';

const word = (id: string, text: string, segment: number, start: number, end: number): AlignmentWord => ({
  id,
  text,
  segment,
  start,
  end,
});

const timings = (): StudioTimings => ({
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
    const repeated: StudioTimings = {
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

// doubtfulWords(): the words the Review tab marks, from the timings and the alignment sidecar.
import type {AyahTiming, WordTiming} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {doubtfulWords} from '../../../src/lines';
import type {AlignmentSegment, AlignmentWord, StudioTimings} from '../../../src/types';

const words = (ayah: number, positions: readonly number[], from: number): readonly WordTiming[] =>
  positions.map((position, i) => ({id: `2:${ayah}:${position}`, start: from + i, end: from + i + 1}));

const segment = (number: number, changes: Partial<AlignmentSegment> = {}): AlignmentSegment => ({
  segment: number,
  timeFrom: 0,
  timeTo: 1,
  refFrom: null,
  refTo: null,
  confidence: 1,
  hasMissingWords: false,
  hasRepeatedWords: false,
  error: null,
  matchedText: null,
  ...changes,
});

const sidecarWords = (ayat: readonly AyahTiming[], segmentOf: (ayah: number) => number): AlignmentWord[] =>
  ayat.flatMap((a) =>
    (a.words ?? []).map((w) => ({id: w.id, text: 'x', segment: segmentOf(a.ayah), start: w.start, end: w.end})),
  );

// Ayah 1: fine (its segment sits exactly on the default threshold). Ayah 2: a 0.6 segment, 2:2:2
// recited twice. Ayah 3: incomplete, and its segment reports missing words. Ayah 4: its segment
// carries an error.
const ayat: AyahTiming[] = [
  {ayah: 1, start: 0, end: 3, words: words(1, [1, 2, 3], 0)},
  {ayah: 2, start: 10, end: 14, words: words(2, [1, 2, 2, 3], 10)},
  {ayah: 3, start: 20, end: 23, complete: false, words: words(3, [1, 2, 3], 20)},
  {ayah: 4, start: 30, end: 32, words: words(4, [1, 2], 30)},
];
const timings: StudioTimings = {
  version: 1,
  surah: 2,
  ayat,
  alignment: {
    version: 1,
    source: 'qud',
    segments: [
      segment(1, {confidence: 0.8}),
      segment(2, {confidence: 0.6, hasRepeatedWords: true}),
      segment(3, {hasMissingWords: true}),
      segment(4, {confidence: 0.9, error: 'no match'}),
    ],
    words: sidecarWords(ayat, (ayah) => ayah),
    edits: [],
  },
};

describe('doubtfulWords', () => {
  it('marks every reason, keyed in mushaf order with the reasons in a fixed order', () => {
    expect(doubtfulWords(timings)).toEqual({
      '2:2:1': ['low-confidence'],
      '2:2:2': ['low-confidence', 'repeated'],
      '2:2:3': ['low-confidence'],
      '2:3:1': ['missing-words', 'incomplete-ayah'],
      '2:3:2': ['missing-words', 'incomplete-ayah'],
      '2:3:3': ['missing-words', 'incomplete-ayah'],
      '2:4:1': ['segment-error'],
      '2:4:2': ['segment-error'],
    });
    expect(Object.keys(doubtfulWords(timings))).toEqual([
      '2:2:1',
      '2:2:2',
      '2:2:3',
      '2:3:1',
      '2:3:2',
      '2:3:3',
      '2:4:1',
      '2:4:2',
    ]);
  });

  it('applies the threshold as a strict bound', () => {
    expect(doubtfulWords(timings, {threshold: 0.5})['2:2:1']).toBeUndefined();
    expect(doubtfulWords(timings, {threshold: 0.5})['2:2:2']).toEqual(['repeated']);
    expect(doubtfulWords(timings, {threshold: 0.6})['2:2:1']).toBeUndefined();
    expect(doubtfulWords(timings, {threshold: 0.61})['2:2:1']).toEqual(['low-confidence']);
    expect(doubtfulWords(timings, {threshold: 0.81})['2:1:1']).toEqual(['low-confidence']);
    expect(doubtfulWords(timings, {threshold: 1})['2:4:1']).toEqual(['low-confidence', 'segment-error']);
  });

  it('reads the incomplete ayahs and the repeated words from the timings alone', () => {
    const {alignment: _alignment, ...bare} = timings;
    expect(doubtfulWords(bare)).toEqual({
      '2:2:2': ['repeated'],
      '2:3:1': ['incomplete-ayah'],
      '2:3:2': ['incomplete-ayah'],
      '2:3:3': ['incomplete-ayah'],
    });
  });

  it('is empty when nothing is doubtful, and names no word of an ayah without per-word times', () => {
    expect(doubtfulWords({version: 1, surah: 2, ayat: [ayat[0]!]})).toEqual({});
    expect(doubtfulWords({version: 1, surah: 2, ayat: [{ayah: 5, start: 0, end: 1, complete: false}]})).toEqual({});
    expect(doubtfulWords({...timings, ayat: [ayat[0]!], alignment: {...timings.alignment!, words: []}})).toEqual({});
  });
});

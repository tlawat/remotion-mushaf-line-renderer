import {describe, expect, it} from 'vitest';
import {scheduleLines} from '../../src/recitation/schedule';
import type {AyahTiming, MushafLineData, RecitationTimings} from '../../src/types';
import {syntheticLine} from '../fixtures/synthetic-lines';

// Surah 2 of the synthetic mushaf, in reading order:
//   p2l3: 2:1:1, 2:1:2, 2:1:3, 2:1:4(end)
//   p2l4: 2:2:1, 2:2:2, 2:2:3
//   p3l1: 2:2:4, 2:2:5(end), 2:3:1(rub-el-hizb, wordId 9001), 2:3:1(word, wordId 15)
//   p3l2: 2:3:2, 2:3:3(end), 2:4:1, 2:4:2(end)
const p2l3 = syntheticLine(2, 3);
const p2l4 = syntheticLine(2, 4);
const p3l1 = syntheticLine(3, 1);
const p3l2 = syntheticLine(3, 2);
const surah3 = syntheticLine(3, 4);
const header = syntheticLine(2, 1);
const passage = [p2l3, p2l4, p3l1, p3l2];

const t = (surah: number, ayat: AyahTiming[]): RecitationTimings => ({version: 1, surah, ayat});
/** Per-word times: one second per word from `from`, positions 1..n, the marker included. */
const ayah = (n: number, from: number, count: number): AyahTiming => ({
  ayah: n,
  start: from,
  end: from + count,
  words: Array.from({length: count}, (_, i) => ({id: `2:${n}:${i + 1}`, start: from + i, end: from + i + 1})),
});

describe('scheduleLines', () => {
  it('starts each line at its first timed word and ends it where the next line starts', () => {
    // 2:1 at 0-4 (4 words), 2:2 at 10-15 (5), 2:3 at 20-23 (3), 2:4 at 30-32 (2).
    const timings = t(2, [ayah(1, 0, 4), ayah(2, 10, 5), ayah(3, 20, 3), ayah(4, 30, 2)]);
    expect(scheduleLines(passage, timings)).toEqual([
      {index: 0, start: 0, end: 10}, // 2:1:1
      {index: 1, start: 10, end: 13}, // 2:2:1
      {index: 2, start: 13, end: 21}, // 2:2:4
      {index: 3, start: 21, end: 32}, // 2:3:2; the last line ends with the last timed ayah
    ]);
  });

  it('leaves out lines with no timed word: headers, other surahs, ayahs outside the recording', () => {
    const timings = t(2, [ayah(2, 10, 5), ayah(3, 20, 3)]);
    expect(scheduleLines([header, ...passage, surah3], timings)).toEqual([
      {index: 2, start: 10, end: 13},
      {index: 3, start: 13, end: 21},
      {index: 4, start: 21, end: 23},
    ]);
    expect(scheduleLines([], timings)).toEqual([]);
    expect(scheduleLines([surah3], timings)).toEqual([]);
  });

  it("ignores the words a line's own slice hides", () => {
    // 2:2:4 is timed, so without the slice it starts p3l1; the slice keeps 2:3 only.
    const timings = t(2, [ayah(2, 10, 5), ayah(3, 20, 3), ayah(4, 30, 2)]);
    const sliced = syntheticLine(3, 1, {slice: {fromAyah: 3}});
    expect(scheduleLines([p2l4, p3l1, p3l2], timings)[1]).toEqual({index: 1, start: 13, end: 21});
    expect(scheduleLines([p2l4, sliced, p3l2], timings)[1]).toEqual({index: 1, start: 20, end: 21});
    // The rub-el-hizb marker is the first kept word: it shares 2:3:1 and resolves to that word's time.
    expect(sliced.words.find((w) => w.kind === 'rub-el-hizb')?.id).toBe('2:3:1');
    // A slice that keeps nothing of the line leaves the line out.
    expect(scheduleLines([syntheticLine(3, 1, {slice: {ayah: 9}})], timings)).toEqual([]);
  });

  it('takes the first recitation of a repeated word by default, the last on request', () => {
    const repeat: AyahTiming = {
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
    };
    const timings = t(2, [repeat]);
    const sliced = syntheticLine(3, 1, {slice: {fromAyah: 3}});
    expect(scheduleLines([sliced, p3l2], timings)).toEqual([
      {index: 0, start: 10, end: 11},
      {index: 1, start: 11, end: 15},
    ]);
    expect(scheduleLines([sliced, p3l2], timings, {occurrence: 'last'})).toEqual([
      {index: 0, start: 12, end: 13},
      {index: 1, start: 13, end: 15},
    ]);
    expect(scheduleLines([sliced, p3l2], timings, {occurrence: undefined})).toEqual(
      scheduleLines([sliced, p3l2], timings),
    );
  });

  it('never ends a line before it starts, and never reorders', () => {
    // Under 'last', p3l1's first word (2:3:1) is repeated after p3l2's first word (2:3:2) was heard.
    const timings = t(2, [
      {
        ayah: 3,
        start: 10,
        end: 15,
        words: [
          {id: '2:3:1', start: 10, end: 11},
          {id: '2:3:2', start: 11, end: 12},
          {id: '2:3:1', start: 13, end: 14},
          {id: '2:3:3', start: 14, end: 15},
        ],
      },
    ]);
    const sliced = syntheticLine(3, 1, {slice: {fromAyah: 3}});
    expect(scheduleLines([sliced, p3l2], timings, {occurrence: 'last'})).toEqual([
      {index: 0, start: 13, end: 13},
      {index: 1, start: 11, end: 15},
    ]);
  });

  it('interpolates by position when an ayah has no per-word times', () => {
    // Ayah 2 spans 20-30 over 5 words (positions 1..5 across p2l4 and p3l1): 2 s per word.
    const timings = t(2, [{ayah: 2, start: 20, end: 30}]);
    expect(scheduleLines([p2l4, p3l1], timings)).toEqual([
      {index: 0, start: 20, end: 26},
      {index: 1, start: 26, end: 30},
    ]);
    // `words: []` means the same as no words.
    expect(scheduleLines([p2l4, p3l1], t(2, [{ayah: 2, start: 20, end: 30, words: []}]))).toEqual([
      {index: 0, start: 20, end: 26},
      {index: 1, start: 26, end: 30},
    ]);
    // The word count is what the given lines show: alone, p3l1 counts 5 but p2l4 counts 3.
    expect(scheduleLines([p2l4], timings)).toEqual([{index: 0, start: 20, end: 30}]);
    // A line whose first timed word sits past the counted positions is clamped to the ayah's span.
    const tail = syntheticLine(3, 1, {words: p3l1.words.slice(0, 1)}); // 2:2:4 alone: count 4, start 20 + 10 * 3 / 4
    expect(scheduleLines([tail], timings)).toEqual([{index: 0, start: 27.5, end: 30}]);
  });

  it('falls back to interpolation for a word the file leaves untimed, and puts the marker at the end', () => {
    // Positions 1-3 of ayah 2 are timed, 4 and the marker (5) are not: p3l1 still starts, by position.
    const partial: AyahTiming = {
      ayah: 2,
      start: 20,
      end: 30,
      complete: false,
      words: [
        {id: '2:2:1', start: 20, end: 21},
        {id: '2:2:2', start: 21, end: 22},
        {id: '2:2:3', start: 22, end: 23},
      ],
    };
    expect(scheduleLines([p2l4, p3l1], t(2, [partial]))).toEqual([
      {index: 0, start: 20, end: 26},
      {index: 1, start: 26, end: 30},
    ]);
    // A line that holds only the ayah's rosette is scheduled at the ayah's end, not dropped.
    const marker: MushafLineData = syntheticLine(3, 1, {words: p3l1.words.filter((w) => w.kind === 'end')});
    expect(scheduleLines([p2l4, marker], t(2, [partial]))).toEqual([
      {index: 0, start: 20, end: 30},
      {index: 1, start: 30, end: 30},
    ]);
    // Two consecutive lines starting in the same ayah: the second is still placed after the first.
    const [a, b] = scheduleLines([p2l4, p3l1], t(2, [partial]));
    expect(b!.start).toBeGreaterThan(a!.start);
  });

  it('ends the last line at the end of the last timed ayah the lines carry', () => {
    // Ayah 4 is timed but on no given line: it does not extend the last line.
    const timings = t(2, [ayah(2, 10, 5), ayah(3, 20, 3), ayah(4, 30, 2)]);
    expect(scheduleLines([p2l4, p3l1], timings)).toEqual([
      {index: 0, start: 10, end: 13},
      {index: 1, start: 13, end: 23},
    ]);
  });
});

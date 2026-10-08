import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {chaptersFromTimings} from '../../../src/export';
import type {StudioTimings} from '../../../src/types';

const fatiha = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../fixtures/timings/fatiha.json'), 'utf8'),
) as StudioTimings;

/** Timings of surah `surah`, ayah i+1 starting at `starts[i]` and running to the next start (the last to `end`). */
const timings = (starts: readonly number[], end: number, surah = 2): StudioTimings => ({
  version: 1,
  surah,
  ayat: starts.map((start, i) => ({ayah: i + 1, start, end: starts[i + 1] ?? end})),
});

/** Seconds of a chapter line's `M:SS` or `H:MM:SS`. */
const secondsOf = (line: string): number =>
  line
    .split(' ')[0]!
    .split(':')
    .reduce((total, part) => total * 60 + Number(part), 0);

describe('chaptersFromTimings', () => {
  it('starts a chapter at every ayah 10 s or more apart, the first at 0:00, named by the surah', () => {
    expect(chaptersFromTimings(timings([2, 15, 30, 45], 60))).toEqual([
      '0:00 Al-Baqarah 2:1',
      '0:15 Al-Baqarah 2:2',
      '0:30 Al-Baqarah 2:3',
      '0:45 Al-Baqarah 2:4',
    ]);
  });

  it('merges an ayah that starts under 10 s after its chapter into it, as a range', () => {
    expect(chaptersFromTimings(timings([0.5, 5, 12, 20, 35], 50), {surahName: 'The Cow'})).toEqual([
      '0:00 The Cow 2:1–2',
      '0:12 The Cow 2:3–4',
      '0:35 The Cow 2:5',
    ]);
  });

  it('measures the second chapter from 0:00, where the first is moved', () => {
    // Ayah 2 starts 9 s after ayah 1 but 11 s after the video's start: a chapter of its own.
    expect(chaptersFromTimings(timings([2, 11, 25], 40))[1]).toBe('0:11 Al-Baqarah 2:2');
    expect(chaptersFromTimings(timings([2, 9.9, 25, 40], 55))[1]).toBe('0:25 Al-Baqarah 2:3');
  });

  it('merges a last chapter shorter than 10 s into the one before it', () => {
    expect(chaptersFromTimings(timings([0, 15, 30, 45], 50))).toEqual([
      '0:00 Al-Baqarah 2:1',
      '0:15 Al-Baqarah 2:2',
      '0:30 Al-Baqarah 2:3–4',
    ]);
  });

  it('gives none when fewer than 3 chapters are left, as for Al-Fatihah’s 27 seconds', () => {
    expect(chaptersFromTimings(fatiha)).toEqual([]);
    expect(chaptersFromTimings(timings([0, 20], 40))).toEqual([]);
    expect(chaptersFromTimings(timings([0, 15, 30], 35))).toEqual([]);
    expect(chaptersFromTimings({version: 1, surah: 1, ayat: []})).toEqual([]);
  });

  it('starts a chapter at every n-th ayah under every: n-ayahs', () => {
    expect(chaptersFromTimings(timings([0, 12, 24, 36, 48, 60], 72), {every: 'n-ayahs', n: 2})).toEqual([
      '0:00 Al-Baqarah 2:1–2',
      '0:24 Al-Baqarah 2:3–4',
      '0:48 Al-Baqarah 2:5–6',
    ]);
    // Default n is 5.
    const ten = timings([0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72], 80);
    expect(chaptersFromTimings(ten, {every: 'n-ayahs'})).toEqual([
      '0:00 Al-Baqarah 2:1–5',
      '0:30 Al-Baqarah 2:6–10',
      '1:00 Al-Baqarah 2:11–13',
    ]);
  });

  it('adds offsetSeconds (an intro card) to every time but the first', () => {
    expect(chaptersFromTimings(timings([2, 10, 25, 40], 55), {offsetSeconds: 3})).toEqual([
      '0:00 Al-Baqarah 2:1',
      '0:13 Al-Baqarah 2:2',
      '0:28 Al-Baqarah 2:3',
      '0:43 Al-Baqarah 2:4',
    ]);
  });

  it('writes H:MM:SS from an hour, floored to the second', () => {
    expect(chaptersFromTimings(timings([0, 3600, 3725.9], 4000)).map((line) => line.split(' ')[0])).toEqual([
      '0:00',
      '1:00:00',
      '1:02:05',
    ]);
  });

  it('keeps the written times 10 s apart however the starts fall', () => {
    const starts = [0.2, 9.95, 19.949, 29.9491, 41.0004, 50.9999, 61.5, 70.1, 83.999];
    const lines = chaptersFromTimings(timings(starts, 100));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(secondsOf(lines[0]!)).toBe(0);
    for (let i = 1; i < lines.length; i++)
      expect(secondsOf(lines[i]!) - secondsOf(lines[i - 1]!)).toBeGreaterThanOrEqual(10);
  });

  it('refuses an n that is not a whole number from 1, or an offset that is not finite', () => {
    const t = timings([0, 15, 30], 45);
    for (const n of [0, 1.5, -2])
      expect(() => chaptersFromTimings(t, {every: 'n-ayahs', n})).toThrow(
        expect.objectContaining({code: 'BAD_STUDIO_PROP', details: {option: 'n', value: n}}),
      );
    expect(() => chaptersFromTimings(t, {offsetSeconds: Number.NaN})).toThrow(
      expect.objectContaining({code: 'BAD_STUDIO_PROP', message: expect.stringMatching(/offsetSeconds/)}),
    );
  });
});

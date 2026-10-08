import {ayahKey} from '../data/format';
import {isInSlice, resolveSlice} from '../resolve/slice';
import type {
  AyahTiming,
  LineSchedule,
  MushafLineData,
  MushafWord,
  RecitationTimings,
  ScheduleLinesOptions,
} from '../types';
import {timingsByAyah, wordTiming} from './recitation-timings';

/**
 * When each line of a passage is on screen, from a recording's timings: one entry per line that
 * carries a timed word, in the order the lines were given (nothing is reordered), with `index` into
 * `lines` and `start` / `end` in seconds, ready to become `<Sequence from durationInFrames>`.
 *
 * - A line starts when its first timed word is heard: the word's own time when the file has one
 *   (`occurrence` chooses which recitation of a repeated word), else a time interpolated inside its
 *   ayah by position — the ayah-end marker at the ayah's `end`. The words a line's own `slice`
 *   hides never start it.
 * - A line ends when the next scheduled line starts; the last one at the end of the last timed ayah
 *   on the lines. An end is never before its own start, so under `occurrence: 'last'` a line whose
 *   first word was repeated after the next line began collapses to nothing rather than reordering.
 * - Lines with no timed word (headers, lines outside the recording, another surah) are left out.
 *   Timings of either version work: an ayah is looked up by surah and number, so a passage that
 *   crosses surahs (`getMushafLinesForRanges()` with version 2 timings) schedules across the boundary.
 *
 * Interpolation shares an ayah's span evenly over its words; the word count is the highest position
 * seen for that ayah across `lines`, marker included, which is exact when every line of the ayah is
 * given (a passage from `getMushafLines()`), and clamped to the ayah's span otherwise.
 */
export const scheduleLines = (
  lines: readonly MushafLineData[],
  timings: RecitationTimings,
  options: ScheduleLinesOptions = {},
): LineSchedule[] => {
  const occurrence = options.occurrence ?? 'first';
  const byAyah = timingsByAyah(timings);

  const counts = new Map<number, number>();
  for (const line of lines) {
    for (const word of line.words) {
      const key = ayahKey(word.surah, word.ayah);
      if (!byAyah.has(key)) continue;
      counts.set(key, Math.max(counts.get(key) ?? 0, word.position));
    }
  }

  const startOf = (word: MushafWord, timing: AyahTiming): number => {
    const exact = timing.words && timing.words.length > 0 ? wordTiming(timings, word.id, occurrence) : null;
    if (exact) return exact.start;
    if (word.kind === 'end') return timing.end;
    const count = Math.max(1, counts.get(ayahKey(word.surah, word.ayah)) ?? word.position);
    const interpolated = timing.start + ((timing.end - timing.start) * (word.position - 1)) / count;
    return Math.min(timing.end, Math.max(timing.start, interpolated));
  };

  let lastEnd = 0;
  const starts = lines.map((line): number | null => {
    const slice = resolveSlice(line, line.slice);
    let start: number | null = null;
    for (const word of line.words) {
      if (!isInSlice(slice, word.wordId)) continue;
      const timing = byAyah.get(ayahKey(word.surah, word.ayah));
      if (!timing) continue;
      lastEnd = Math.max(lastEnd, timing.end);
      if (start === null) start = startOf(word, timing);
    }
    return start;
  });

  const schedule: LineSchedule[] = [];
  starts.forEach((start, index) => {
    if (start === null) return;
    const next = starts.slice(index + 1).find((s): s is number => s !== null);
    schedule.push({index, start, end: Math.max(start, next ?? lastEnd)});
  });
  return schedule;
};

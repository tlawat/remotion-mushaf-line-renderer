// A recitation across surahs: the end of Al-Falaq (113:4-5) and the start of An-Nas (114:1-2), with
// the basmalah heard between them untimed. Lines shaped like page 604 of the print, built on the
// synthetic mushaf's line data so they are valid `MushafLineData`: one ayah per line, the ayah-end
// marker last; An-Nas's name and basmalah lines between the two surahs.
import type {MushafLineData, MushafWord} from '@tlawat/remotion-mushaf-line';
import {syntheticLine} from '../../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import falaqNas from '../../../fixtures/timings/falaq-nas.json';

/** Words per ayah, marker excluded. */
const WORDS: Readonly<Record<string, number>> = {'113:3': 4, '113:4': 5, '113:5': 5, '114:1': 4, '114:2': 2};

const ayahLine = (line: number, surah: number, ayah: number): MushafLineData => {
  const count = WORDS[`${surah}:${ayah}`]!;
  const words: MushafWord[] = [];
  for (let position = 1; position <= count + 1; position++) {
    words.push({
      id: `${surah}:${ayah}:${position}`,
      wordId: line * 10 + position,
      surah,
      ayah,
      position,
      kind: position > count ? 'end' : 'word',
      text: 'ﱁ',
    });
  }
  return syntheticLine(1, 2, {page: 604, line, centered: false, words});
};

/** The synthetic mushaf's surah 2 header lines, moved to page 604 as An-Nas's. */
const nasName = syntheticLine(2, 1, {page: 604, line: 11, surahNumber: 114});
const nasBasmalah = syntheticLine(2, 2, {page: 604, line: 12, surahNumber: 114});

/** What `getMushafLinesForRanges()` gives for 113:4-5 and 114:1-2: An-Nas's header lines between the two surahs. */
export const FALAQ_NAS_LINES: readonly MushafLineData[] = [
  ayahLine(9, 113, 4),
  ayahLine(10, 113, 5),
  nasName,
  nasBasmalah,
  ayahLine(13, 114, 1),
  ayahLine(14, 114, 2),
];

/**
 * `getMushafLinesForRanges()` over these lines: the ayah lines the ranges reach, and An-Nas's header
 * lines when its range starts at ayah 1 after another range (never before the first range).
 */
export const falaqNasLinesFor = (
  ranges: readonly {readonly surah: number; readonly fromAyah: number; readonly toAyah: number}[],
): readonly MushafLineData[] =>
  FALAQ_NAS_LINES.filter((line) => {
    if (line.type !== 'ayah') return ranges.slice(1).some((r) => r.surah === line.surahNumber && r.fromAyah === 1);
    const word = line.words[0]!;
    return ranges.some((r) => r.surah === word.surah && word.ayah >= r.fromAyah && word.ayah <= r.toAyah);
  });

/** Page 604 whole, as `getMushafLines({page: 604})` gives it (113:3 before the passage). */
export const PAGE_604: readonly MushafLineData[] = [ayahLine(8, 113, 3), ...FALAQ_NAS_LINES];

/** The ranges `recitedRanges()` finds in the fixture. */
export const FALAQ_NAS_RANGES = [
  {surah: 113, fromAyah: 4, toAyah: 5},
  {surah: 114, fromAyah: 1, toAyah: 2},
] as const;

/** The version 2 timings fixture (113:4-5 at 0.42-8.2 s, the basmalah untimed, 114:1-2 at 13.2-18.7 s). */
export {falaqNas};

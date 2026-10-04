// The synthetic three-page mushaf of the main package as `getMushafLines()` would give it, and
// timings of its surah 2, which runs from page 2 (its header, basmalah and two ayah lines) onto
// page 3 (two ayah lines, then surah 3's header and first line): a passage across a page boundary.
import type {GetMushafLinesOptions, MushafLineData} from '@tlawat/remotion-mushaf-line';
import {SYNTHETIC_DEF} from '../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-layout';
import {syntheticLine} from '../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';

const ALL: readonly MushafLineData[] = Array.from({length: SYNTHETIC_DEF.pages}, (_, p) => p + 1).flatMap((page) =>
  Array.from({length: SYNTHETIC_DEF.linesOnPage(page)}, (_, l) => syntheticLine(page, l + 1)),
);

/** `getMushafLines()` over the synthetic mushaf: a whole page, or the ayah lines of a range (unsliced). */
export const syntheticMushafLines = (options: GetMushafLinesOptions): readonly MushafLineData[] => {
  if (options.page !== undefined) return ALL.filter((line) => line.page === options.page);
  const {surah, fromAyah = 1, toAyah = Number.POSITIVE_INFINITY} = options;
  return ALL.filter(
    (line) =>
      line.type === 'ayah' && line.words.some((w) => w.surah === surah && w.ayah >= fromAyah && w.ayah <= toAyah),
  );
};

/**
 * Surah 2 of the synthetic mushaf, ayahs 1-4: page 2 line 3 starts at 0.5 s, line 4 at 3.2 s; page 3
 * line 1 at 6 s (2:2:4), line 2 at 8 s (2:3:2); the last ayah ends at 10 s.
 */
export const surah2Timings = {
  version: 1,
  surah: 2,
  ayat: [
    {
      ayah: 1,
      start: 0.5,
      end: 3,
      words: [
        {id: '2:1:1', start: 0.5, end: 1},
        {id: '2:1:2', start: 1, end: 1.5},
        {id: '2:1:3', start: 1.5, end: 3},
      ],
    },
    {
      ayah: 2,
      start: 3.2,
      end: 7,
      words: [
        {id: '2:2:1', start: 3.2, end: 4},
        {id: '2:2:2', start: 4, end: 5},
        {id: '2:2:3', start: 5, end: 6},
        {id: '2:2:4', start: 6, end: 7},
      ],
    },
    {
      ayah: 3,
      start: 7.2,
      end: 9,
      words: [
        {id: '2:3:1', start: 7.2, end: 8},
        {id: '2:3:2', start: 8, end: 9},
      ],
    },
    {ayah: 4, start: 9.2, end: 10, words: [{id: '2:4:1', start: 9.2, end: 10}]},
  ],
};

export const staticFile = (path: string): string => `/static/${path}`;

/** A `fetch` that answers every request with `body` as JSON. */
export const fetchJson = (body: unknown): typeof fetch =>
  (async () => ({ok: true, status: 200, json: async () => body})) as unknown as typeof fetch;

// `MushafLineData` values from the synthetic three-page layout, for the browser and render suites
// (which cannot mock the layout loader) and for anyone who needs lines before the real data lands.
import {lineFromLayout} from '../../src/get-mushaf-line';
import type {MushafId, MushafLineData} from '../../src/types';
import {syntheticLayout} from './synthetic-layout';

export const syntheticLine = (page: number, line: number, extra: Partial<MushafLineData> = {}, mushaf: MushafId = 'qpc-v4'): MushafLineData => ({
  ...lineFromLayout(syntheticLayout, mushaf, page, line),
  ...extra,
});

/** The ayah lines of the synthetic layout, in page order. */
export const SYNTHETIC_AYAH_LINES: ReadonlyArray<readonly [page: number, line: number]> = [
  [1, 2],
  [1, 3],
  [2, 3],
  [2, 4],
  [3, 1],
  [3, 2],
  [3, 4],
];

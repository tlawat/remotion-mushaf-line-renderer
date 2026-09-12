// `MushafLineData` values from the synthetic three-page layout, for the browser and render suites
// (which cannot mock the layout loader) and for anyone who needs lines before the real data lands.
import {resolveSelection} from '../../src/mushaf/registry';
import {lineFromLayout} from '../../src/resolve/get-mushaf-line';
import type {MushafLineData, MushafSelection} from '../../src/types';
import {syntheticLayout} from './synthetic-layout';

export type SyntheticLineOptions = MushafSelection & Partial<Omit<MushafLineData, 'mushaf' | 'theme'>>;

/** A line of the synthetic mushaf; `theme` selects the appearance, other keys override the data. */
export const syntheticLine = (page: number, line: number, options: SyntheticLineOptions = {}): MushafLineData => {
  const {mushaf, theme, ...extra} = options;
  return {...lineFromLayout(syntheticLayout, resolveSelection({mushaf, theme}), page, line), ...extra};
};

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

import * as React from 'react';
import type {ResolvedSlice} from '../slice';
import type {MushafLineData, MushafLineCommonProps} from '../types';

/**
 * Per-line context read by `<Word>`: the resolved layout numbers plus the per-word hooks, so a word
 * needs no props of its own beyond its data and the line markup stays one element per word.
 */
export type LineContextValue = {
  readonly line: MushafLineData;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly ready: boolean;
  readonly frame: number;
  readonly fps: number;
  readonly activeWordId: MushafLineCommonProps['activeWordId'];
  readonly activeWordStyle: MushafLineCommonProps['activeWordStyle'];
  readonly wordStyle: MushafLineCommonProps['wordStyle'];
  readonly wordClassName: MushafLineCommonProps['wordClassName'];
  /** The slice in effect: which words are painted. `null` paints them all. */
  readonly slice: ResolvedSlice;
};

export const LineContext = React.createContext<LineContextValue | null>(null);

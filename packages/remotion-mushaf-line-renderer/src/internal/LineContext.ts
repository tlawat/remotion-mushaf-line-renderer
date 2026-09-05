import * as React from 'react';
import type {MushafLineData} from '../types';

/**
 * Per-line context read by `<Word>`. Reserved seam for word highlighting: a later `highlight`
 * prop adds the set of active word ids here without touching the line markup or existing props.
 */
export type LineContextValue = {
  readonly line: MushafLineData;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly ready: boolean;
  readonly frame: number;
  readonly fps: number;
};

export const LineContext = React.createContext<LineContextValue | null>(null);

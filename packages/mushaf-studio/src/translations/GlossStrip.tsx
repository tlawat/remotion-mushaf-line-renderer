import type * as React from 'react';
import type {WordGloss} from '../types';

export type GlossStripProps = {
  /** The word translation and/or transliteration to show for the active word. */
  readonly translation: WordGloss | null;
  readonly transliteration: WordGloss | null;
  /** `MushafWord.id` of the word being recited, or `null` between words. */
  readonly activeWordId: string | null;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

/**
 * A strip that shows the active word's gloss: its translation and, under it, its transliteration.
 * Keeps its height when there is no active word, so the layout never jumps. Implemented by
 * workstream 3.
 */
export const GlossStrip: React.FC<GlossStripProps> = () => {
  throw new Error('GlossStrip is not implemented yet (workstream 3).');
};

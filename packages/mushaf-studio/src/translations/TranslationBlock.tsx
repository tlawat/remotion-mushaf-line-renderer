import type * as React from 'react';
import type {AyahTranslation} from '../types';

export type TranslationBlockProps = {
  readonly translation: AyahTranslation;
  /** The ayah to show, as a key `"surah:ayah"`; nothing is painted for `null`. */
  readonly ayahKey: string | null;
  readonly fontFamily: string;
  /** px. */
  readonly fontSize: number;
  readonly color: string;
  /** `'ltr'` for most languages, `'rtl'` for Urdu, Persian, ... */
  readonly direction: 'ltr' | 'rtl';
  /** 0-1: the block's own opacity (the composition fades it with the line it belongs to). */
  readonly opacity?: number | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

/**
 * One ayah's translation as a block of text under (or above) the lines. Plain text only: the
 * loader has stripped the markup. Pure in its props, so frames are deterministic. Implemented by
 * workstream 3.
 */
export const TranslationBlock: React.FC<TranslationBlockProps> = () => {
  throw new Error('TranslationBlock is not implemented yet (workstream 3).');
};

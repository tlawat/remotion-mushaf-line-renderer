import type * as React from 'react';
import type {WordGloss} from '../types';
import {TRANSLATION_LINE_HEIGHT} from './TranslationBlock';

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
 * A strip that shows the active word's gloss: its translation and, under it, its transliteration,
 * centred. There is one row per gloss given (`null` leaves its row out), and a row keeps its height
 * when there is no active word or the word has no gloss there, so the layout never jumps. Pure in
 * its props.
 */
export const GlossStrip: React.FC<GlossStripProps> = ({
  translation,
  transliteration,
  activeWordId,
  fontFamily,
  fontSize,
  color,
  style,
  className,
}) => {
  const row = (gloss: WordGloss, kind: 'translation' | 'transliteration') => (
    <div className={`mushaf-gloss__${kind}`} style={{minHeight: fontSize * TRANSLATION_LINE_HEIGHT}}>
      {activeWordId === null ? '' : (gloss.words[activeWordId] ?? '')}
    </div>
  );
  return (
    <div
      className={className ? `mushaf-gloss ${className}` : 'mushaf-gloss'}
      data-word-id={activeWordId ?? undefined}
      style={{fontFamily, fontSize, color, textAlign: 'center', lineHeight: TRANSLATION_LINE_HEIGHT, ...style}}
    >
      {translation ? row(translation, 'translation') : null}
      {transliteration ? row(transliteration, 'transliteration') : null}
    </div>
  );
};

import * as React from 'react';
import {useContext} from 'react';
import {WORD_STYLE} from '../layout';
import type {MushafWord} from '../types';
import {LineContext} from './LineContext';

/**
 * One DOM element per word. The text always comes from data and is rendered as-is (1–4 code points
 * in the page font's private range). Adjacent words carry no whitespace between them.
 *
 * DOM contract (stable under semver):
 *   span.mushaf-word.mushaf-word--{kind}[data-word-id][data-location="s:a:w"][data-surah][data-ayah][data-position][data-kind]
 */
export const Word: React.FC<{readonly word: MushafWord}> = ({word}) => {
  useContext(LineContext); // reserved for highlighting (active-word lookups)
  return (
    <span
      className={`mushaf-word mushaf-word--${word.kind}`}
      data-word-id={word.wordId}
      data-location={word.id}
      data-surah={word.surah}
      data-ayah={word.ayah}
      data-position={word.position}
      data-kind={word.kind}
      style={WORD_STYLE}
    >
      {word.text}
    </span>
  );
};

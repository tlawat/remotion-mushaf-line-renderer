import * as React from 'react';
import {useContext} from 'react';
import {WORD_STYLE} from '../layout';
import type {MushafWord, WordContext} from '../types';
import {LineContext} from './LineContext';

/**
 * One DOM element per word. The text always comes from data and is rendered as-is (1–4 code points
 * in the page font's private range). Adjacent words carry no whitespace between them.
 *
 * DOM contract (stable under semver):
 *   span.mushaf-word.mushaf-word--{kind}[.mushaf-word--active][data-word-id][data-location="s:a:w"]
 *     [data-surah][data-ayah][data-position][data-kind][data-active]
 */
export const Word: React.FC<{readonly word: MushafWord}> = ({word}) => {
  const ctx = useContext(LineContext);
  if (!ctx) return null; // <Word> is only rendered by <LineRenderer>, which always provides the context
  const active = ctx.activeWordId != null && (ctx.activeWordId === word.id || ctx.activeWordId === word.wordId);
  const context: WordContext = {line: ctx.line, frame: ctx.frame, fps: ctx.fps, active};
  const extra = ctx.wordStyle?.(word, context);
  const extraClass = ctx.wordClassName?.(word, context);
  const style = extra || (active && ctx.activeWordStyle) ? {...WORD_STYLE, ...(active ? ctx.activeWordStyle : undefined), ...extra} : WORD_STYLE;
  return (
    <span
      className={`mushaf-word mushaf-word--${word.kind}${active ? ' mushaf-word--active' : ''}${extraClass ? ` ${extraClass}` : ''}`}
      data-word-id={word.wordId}
      data-location={word.id}
      data-surah={word.surah}
      data-ayah={word.ayah}
      data-position={word.position}
      data-kind={word.kind}
      data-active={active ? 'true' : undefined}
      style={style}
    >
      {word.text}
    </span>
  );
};

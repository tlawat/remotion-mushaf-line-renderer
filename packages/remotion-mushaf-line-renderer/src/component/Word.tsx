import type * as React from 'react';
import {useContext} from 'react';
import {isInSlice} from '../resolve/slice';
import type {MushafWord, WordContext} from '../types';
import {LineContext} from './LineContext';
import {HIDDEN_WORD_STYLE, WORD_STYLE} from './styles';

/**
 * One DOM element per word. The text always comes from data and is rendered as-is (1–4 code points
 * in the page font's private range). Adjacent words carry no whitespace between them.
 *
 * DOM contract (stable under semver):
 *   span.mushaf-word.mushaf-word--{kind}[.mushaf-word--active][.mushaf-word--hidden][data-word-id]
 *     [data-location="s:a:w"][data-surah][data-ayah][data-position][data-kind][data-active][data-hidden]
 */
export const Word: React.FC<{readonly word: MushafWord}> = ({word}) => {
  const ctx = useContext(LineContext);
  if (!ctx) return null; // <Word> is only rendered by <LineRenderer>, which always provides the context
  const active = ctx.activeWordId != null && (ctx.activeWordId === word.id || ctx.activeWordId === word.wordId);
  // A word outside the slice stays in the DOM (the layout is measured from every word) but takes
  // no space and is not painted. Its style is spread last: `wordStyle` cannot re-show it.
  const hidden = !isInSlice(ctx.slice, word.wordId);
  const context: WordContext = {line: ctx.line, frame: ctx.frame, fps: ctx.fps, active, inSlice: !hidden};
  const extra = ctx.wordStyle?.(word, context);
  const extraClass = ctx.wordClassName?.(word, context);
  const style =
    extra || (active && ctx.activeWordStyle) || hidden
      ? {
          ...WORD_STYLE,
          ...(active ? ctx.activeWordStyle : undefined),
          ...extra,
          ...(hidden ? HIDDEN_WORD_STYLE : undefined),
        }
      : WORD_STYLE;
  return (
    <span
      className={`mushaf-word mushaf-word--${word.kind}${active ? ' mushaf-word--active' : ''}${hidden ? ' mushaf-word--hidden' : ''}${extraClass ? ` ${extraClass}` : ''}`}
      data-word-id={word.wordId}
      data-location={word.id}
      data-surah={word.surah}
      data-ayah={word.ayah}
      data-position={word.position}
      data-kind={word.kind}
      data-active={active ? 'true' : undefined}
      data-hidden={hidden ? 'true' : undefined}
      style={style}
    >
      {word.text}
    </span>
  );
};

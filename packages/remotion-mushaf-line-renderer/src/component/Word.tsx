import type * as React from 'react';
import {useContext} from 'react';
import {isInSlice} from '../resolve/slice';
import type {MushafWord, WordContext} from '../types';
import {LineContext, type LineContextValue} from './LineContext';
import {HIDDEN_WORD_STYLE, WORD_STYLE} from './styles';

/** `wordStyle`'s result for a word: the rosette keeps its marker palette, whatever `fontPalette` asks. */
const paintOf = (word: MushafWord, style: React.CSSProperties | undefined): React.CSSProperties | undefined => {
  if (word.kind !== 'end' || style?.fontPalette === undefined) return style;
  const {fontPalette: _ignored, ...rest} = style;
  return rest;
};

/** What `wordStyle`, `wordClassName` and `wordBand` are told about a word of the line. */
export const wordContextOf = (ctx: LineContextValue, word: MushafWord): WordContext => ({
  line: ctx.line,
  frame: ctx.frame,
  fps: ctx.fps,
  active: ctx.activeWordId != null && (ctx.activeWordId === word.id || ctx.activeWordId === word.wordId),
  inSlice: isInSlice(ctx.slice, word.wordId),
  linePosition: ctx.linePosition,
  inkPalette: ctx.inkPalette,
});

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
  const context = wordContextOf(ctx, word);
  const {active} = context;
  // A word outside the slice stays in the DOM (the layout is measured from every word) but takes
  // no space and is not painted. Its style is spread last: `wordStyle` cannot re-show it.
  const hidden = !context.inSlice;
  const extra = paintOf(word, ctx.wordStyle?.(word, context));
  const extraClass = ctx.wordClassName?.(word, context);
  // The ayah-number marker glyph takes the theme's marker palette (QUL's `.char-end` rule).
  const marker = word.kind === 'end' && ctx.markerPalette ? {fontPalette: ctx.markerPalette} : undefined;
  const style =
    extra || marker || (active && ctx.activeWordStyle) || hidden
      ? {
          ...WORD_STYLE,
          ...marker,
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

import * as React from 'react';
import type {AyahWord} from './text';

export type AyahTextProps = {
  /** One ayah's words in reading order, the marker last: `ayahWordsOf()`. */
  readonly words: readonly AyahWord[];
  /** The word being recited (`"surah:ayah:position"`), painted with `highlightStyle`; `null` for none. */
  readonly activeWordId?: string | null | undefined;
  readonly highlightStyle?: React.CSSProperties | undefined;
  /** A style per word (dimming, a whole-ayah highlight); the active word's `highlightStyle` goes over it. */
  readonly wordStyle?: ((word: AyahWord) => React.CSSProperties | undefined) | undefined;
  /**
   * The text shown for a word in place of its own (the ayah-end marker keeps its ornament): the
   * first-letter cue of the memorisation mode. `undefined`, or no function, shows the word's text.
   */
  readonly wordText?: ((word: AyahWord) => string | undefined) | undefined;
  readonly fontFamily: string;
  /** px. */
  readonly fontSize: number;
  /** A multiple of `fontSize`: Uthmani marks above and below need 1.8 or more. */
  readonly lineHeight: number;
  readonly color?: string | undefined;
  /** px; the text wraps inside it and is centred. */
  readonly maxWidth?: number | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

/** U+06DD ARABIC END OF AYAH: the font draws the ornament around the digits that follow it. */
const END_OF_AYAH = '۝';

const classOf = (word: AyahWord, active: boolean): string =>
  `mushaf-uword mushaf-uword--${word.kind}${active ? ' mushaf-uword--active' : ''}`;

/**
 * One ayah as Unicode text, right to left and centred, a `<span class="mushaf-uword">` per word
 * (`data-location` its id) with a space between, the ayah-end marker as U+06DD and its digits
 * (`۝١`) in a span of its own. The active word gets `highlightStyle` and `mushaf-uword--active`.
 * Font features are left to the font. Pure in its props, so frames are deterministic.
 */
export const AyahText: React.FC<AyahTextProps> = ({
  words,
  activeWordId,
  highlightStyle,
  wordStyle,
  wordText,
  fontFamily,
  fontSize,
  lineHeight,
  color,
  maxWidth,
  style,
  className,
}) => (
  <div
    dir="rtl"
    lang="ar"
    className={className ? `mushaf-ayah-text ${className}` : 'mushaf-ayah-text'}
    style={{
      fontFamily,
      fontSize,
      lineHeight,
      color,
      maxWidth,
      textAlign: 'center',
      wordSpacing: '0.25em',
      ...style,
    }}
  >
    {words.map((word, i) => {
      const active = activeWordId === word.id;
      const own = wordStyle?.(word);
      const merged = active && highlightStyle ? {...own, ...highlightStyle} : own;
      const shown = wordText?.(word) ?? word.text;
      return (
        <React.Fragment key={word.id}>
          {i > 0 ? ' ' : null}
          <span className={classOf(word, active)} data-location={word.id} style={merged}>
            {word.kind === 'end' ? `${END_OF_AYAH}${shown}` : shown}
          </span>
        </React.Fragment>
      );
    })}
  </div>
);

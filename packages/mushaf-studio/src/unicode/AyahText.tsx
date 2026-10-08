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
   * A cue shown over a word in place of its text: the first-letter cue of the memorisation mode. The
   * word's own text stays under it, hidden, so the word keeps its width and the lines break where
   * the full text's do. `undefined`, or no function, shows the word's text.
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

/** The class of the span holding an ayah's last word and its end marker, which never wraps between them. */
export const AYAH_TAIL_CLASS = 'mushaf-ayah-tail';

const classOf = (word: AyahWord, active: boolean): string =>
  `mushaf-uword mushaf-uword--${word.kind}${active ? ' mushaf-uword--active' : ''}`;

// A cue over the word it stands for. The word is laid out, hidden, in an inline block as tall as a
// line, and the cue is a block of the same line height at its top right (where a right-to-left word
// starts): the same width, the same baseline, so nothing on the line moves.
const cueOver = (text: string, cue: string): React.ReactNode => (
  <span data-mushaf-cue-box="" style={{display: 'inline-block', position: 'relative'}}>
    <span data-mushaf-cue-word="" style={{visibility: 'hidden'}}>
      {text}
    </span>
    <span data-mushaf-cue="" style={{position: 'absolute', top: 0, right: 0, whiteSpace: 'nowrap'}}>
      {cue}
    </span>
  </span>
);

/**
 * One ayah as Unicode text, right to left and centred, a `<span class="mushaf-uword">` per word
 * (`data-location` its id) with a space between, the ayah-end marker as its Arabic-Indic digits
 * (`١`) in a span of its own: QUL's Uthmani Hafs font draws the rosette around them itself, and a
 * U+06DD in front would add a second, empty one. The last word and the marker sit together in a
 * `white-space: nowrap` span (`mushaf-ayah-tail`), so the marker never starts a line on its own.
 * The active word gets `highlightStyle` and `mushaf-uword--active`. Font features are left to the
 * font. Pure in its props, so frames are deterministic.
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
}) => {
  const wordSpan = (word: AyahWord): React.ReactNode => {
    const active = activeWordId === word.id;
    const own = wordStyle?.(word);
    const merged = active && highlightStyle ? {...own, ...highlightStyle} : own;
    const cue = wordText?.(word);
    return (
      <span className={classOf(word, active)} data-location={word.id} style={merged}>
        {cue === undefined || cue === word.text ? word.text : cueOver(word.text, cue)}
      </span>
    );
  };
  const marker = words[words.length - 1];
  const tail = marker?.kind === 'end' && words.length > 1 ? words.slice(-2) : [];
  const lead = words.slice(0, words.length - tail.length);
  return (
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
      {lead.map((word, i) => (
        <React.Fragment key={word.id}>
          {i > 0 ? ' ' : null}
          {wordSpan(word)}
        </React.Fragment>
      ))}
      {tail.length > 0 ? (
        <>
          {lead.length > 0 ? ' ' : null}
          {/* The space inside does not break: the marker stays at the end of its last word's line. */}
          <span className={AYAH_TAIL_CLASS} style={{whiteSpace: 'nowrap'}}>
            {wordSpan(tail[0]!)} {wordSpan(tail[1]!)}
          </span>
        </>
      ) : null}
    </div>
  );
};

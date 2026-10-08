import type * as React from 'react';
import {type Tafsir, tafsirEntryFor, tafsirEntryLabel} from './tafsir';

/** Line height of the cards' body text, in ems. */
export const CARD_LINE_HEIGHT = 1.4;

/**
 * The style that cuts a block of text to `lines` lines with an ellipsis at the end of the last
 * (Chrome's `-webkit-line-clamp`, which Remotion renders with): the box is exactly that tall.
 */
export const clampStyle = (lines: number, fontSize: number): React.CSSProperties => ({
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: lines,
  overflow: 'hidden',
  lineHeight: CARD_LINE_HEIGHT,
  maxHeight: lines * fontSize * CARD_LINE_HEIGHT,
});

export type TafsirCardProps = {
  readonly tafsir: Tafsir;
  /** The ayah to explain, `"surah:ayah"`: the card shows the commentary that covers it. */
  readonly ayahKey: string | null;
  /** The body is cut to this many lines, with an ellipsis (default 8). */
  readonly maxLines?: number | undefined;
  readonly fontFamily: string;
  /** px, of the body; the header is 0.8 of it. */
  readonly fontSize: number;
  readonly color: string;
  /** The card's background (default none). */
  readonly background?: string | undefined;
  /** The header's colour (default `color`). */
  readonly accentColor?: string | undefined;
  /** The text's direction (default `'ltr'`; `'rtl'` for an Arabic or Urdu tafsir). */
  readonly direction?: 'ltr' | 'rtl' | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * A card with a tafsir's commentary of an ayah, for an end card or a side panel: a header with the
 * ayahs the commentary covers ("2:11–12") and the tafsir's name, then the text, its paragraphs
 * joined, cut to `maxLines` lines with an ellipsis. Nothing when the tafsir has no commentary of
 * the ayah. Plain text only. Pure in its props.
 */
export const TafsirCard: React.FC<TafsirCardProps> = ({
  tafsir,
  ayahKey,
  maxLines,
  fontFamily,
  fontSize,
  color,
  background,
  accentColor,
  direction,
  style,
  className,
}) => {
  const entry = tafsirEntryFor(tafsir, ayahKey);
  if (!entry) return null;
  const {language} = tafsir.meta;
  return (
    <div
      className={className ? `mushaf-tafsir-card ${className}` : 'mushaf-tafsir-card'}
      data-ayah-key={ayahKey ?? undefined}
      lang={language !== 'und' && LANG_TAG.test(language) ? language : undefined}
      style={{
        direction: direction ?? 'ltr',
        fontFamily,
        color,
        background,
        padding: background ? fontSize : 0,
        borderRadius: background ? fontSize * 0.5 : 0,
        textAlign: 'start',
        ...style,
      }}
    >
      <div
        data-mushaf-card-part="header"
        style={{
          display: 'flex',
          gap: fontSize * 0.6,
          fontSize: fontSize * 0.8,
          color: accentColor ?? color,
          marginBottom: fontSize * 0.5,
        }}
      >
        <span data-mushaf-card-part="ayahs" style={{fontWeight: 700, direction: 'ltr', unicodeBidi: 'isolate'}}>
          {tafsirEntryLabel(entry)}
        </span>
        <span data-mushaf-card-part="name">{tafsir.meta.name}</span>
      </div>
      <div data-mushaf-card-part="text" style={{fontSize, ...clampStyle(maxLines ?? 8, fontSize)}}>
        {entry.paragraphs.join(' ')}
      </div>
    </div>
  );
};

import type * as React from 'react';
import type {AyahTranslation} from '../types';
import {translationFitSize} from './fit';

/** A translation's text alignment, relative to its direction. */
export type TranslationAlign = 'start' | 'center' | 'end';

/** The ayah leaving while the block dissolves to the next one, and its opacity. */
export type OutgoingAyah = {readonly ayahKey: string | null; readonly opacity: number};

export type TranslationBlockProps = {
  readonly translation: AyahTranslation;
  /** The ayah to show, as a key `"surah:ayah"`; nothing is painted for `null`. */
  readonly ayahKey: string | null;
  readonly fontFamily: string;
  /** px. */
  readonly fontSize: number;
  /** CSS `font-weight` (the design's translation is 500); unset: the text's own. */
  readonly fontWeight?: number | undefined;
  readonly color: string;
  /** `'ltr'` for most languages, `'rtl'` for Urdu, Persian, ... */
  readonly direction: 'ltr' | 'rtl';
  /**
   * Where the lines sit: `'start'` (the default) on the side the direction reads from, `'center'`
   * under a centred text, `'end'` on the other side.
   */
  readonly align?: TranslationAlign | undefined;
  /** In ems (default `TRANSLATION_LINE_HEIGHT`). */
  readonly lineHeight?: number | undefined;
  /**
   * px the text is set in: an ayah that needs more than two lines there is drawn at 0.85 of
   * `fontSize` (`translationFitSize()`), and the lines are balanced (`text-wrap: balance`). Unset:
   * the text is drawn at `fontSize` as it wraps.
   */
  readonly fitWidth?: number | undefined;
  /**
   * The ayah leaving during a dissolve (`shownAyahAt()`), drawn in the same place at its opacity
   * under the incoming one, so the block's height is the taller of the two. Unset or `null`: none.
   */
  readonly outgoing?: OutgoingAyah | null | undefined;
  /** 0-1: the incoming text's own opacity during a dissolve (default 1). */
  readonly textOpacity?: number | undefined;
  /** 0-1: the block's own opacity (the composition fades it with the line it belongs to). */
  readonly opacity?: number | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

/** Line height of the translation text, in ems; an empty block is one such line tall. */
export const TRANSLATION_LINE_HEIGHT = 1.35;

// A BCP 47 tag (`en`, `ur`, `zh-Hant`): `lang` is set only when it tells the browser something (fonts, shaping);
// `'und'` and quran.com's language names ('tajik') leave the page's own `lang` in force.
const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const langOf = (language: string): string | undefined =>
  language !== 'und' && LANG_TAG.test(language) ? language : undefined;

/**
 * One ayah's translation as a block of text under (or above) the lines. Plain text only: the
 * loader has stripped the markup. With no ayah (`ayahKey` `null`, or a key the translation does not
 * have) the block stays, empty and one line tall, so the layout never jumps. With `fitWidth`, an
 * ayah too long for two lines is drawn smaller (never cut); with `outgoing`, the leaving ayah is
 * drawn under the incoming one, each at its opacity (the staggered dissolve). Pure in its props, so
 * frames are deterministic.
 */
export const TranslationBlock: React.FC<TranslationBlockProps> = ({
  translation,
  ayahKey,
  fontFamily,
  fontSize,
  fontWeight,
  color,
  direction,
  align,
  lineHeight,
  fitWidth,
  outgoing,
  textOpacity,
  opacity,
  style,
  className,
}) => {
  const textOf = (key: string | null): string | undefined => (key === null ? undefined : translation.text[key]);
  const text = textOf(ayahKey);
  const leading = lineHeight ?? TRANSLATION_LINE_HEIGHT;
  const face = {fontFamily, fontWeight};
  const sizeOf = (value: string | undefined): number =>
    fitWidth === undefined || value === undefined ? fontSize : translationFitSize(value, face, fontSize, fitWidth);
  const fitted: React.CSSProperties = fitWidth === undefined ? {} : {textWrap: 'balance'};
  const base: React.CSSProperties = {
    direction,
    fontFamily,
    ...(fontWeight === undefined ? {} : {fontWeight}),
    color,
    textAlign: align ?? 'start',
    lineHeight: leading,
    minHeight: fontSize * leading,
    opacity: opacity ?? 1,
  };
  const name = className ? `mushaf-translation ${className}` : 'mushaf-translation';
  const lang = langOf(translation.meta.language);
  if (outgoing === undefined || outgoing === null) {
    const incoming = textOpacity ?? 1;
    return (
      <div
        className={name}
        data-ayah-key={ayahKey ?? undefined}
        lang={lang}
        style={{
          ...base,
          fontSize: sizeOf(text),
          ...fitted,
          ...(incoming < 1 ? {opacity: (opacity ?? 1) * incoming} : {}),
          ...style,
        }}
      >
        {text ?? ''}
      </div>
    );
  }
  // Both ayahs in one grid cell: the block is as tall as the taller one, and neither moves.
  const leaving = textOf(outgoing.ayahKey);
  return (
    <div
      className={name}
      data-ayah-key={ayahKey ?? undefined}
      lang={lang}
      style={{...base, fontSize, display: 'grid', ...style}}
    >
      <div
        data-mushaf-translation-part="outgoing"
        aria-hidden="true"
        style={{gridArea: '1 / 1', fontSize: sizeOf(leaving), opacity: outgoing.opacity, ...fitted}}
      >
        {leaving ?? ''}
      </div>
      <div
        data-mushaf-translation-part="incoming"
        style={{gridArea: '1 / 1', fontSize: sizeOf(text), opacity: textOpacity ?? 1, ...fitted}}
      >
        {text ?? ''}
      </div>
    </div>
  );
};

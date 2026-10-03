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
 * have) the block stays, empty and one line tall, so the layout never jumps. Pure in its props, so
 * frames are deterministic.
 */
export const TranslationBlock: React.FC<TranslationBlockProps> = ({
  translation,
  ayahKey,
  fontFamily,
  fontSize,
  color,
  direction,
  opacity,
  style,
  className,
}) => {
  const text = ayahKey === null ? undefined : translation.text[ayahKey];
  return (
    <div
      className={className ? `mushaf-translation ${className}` : 'mushaf-translation'}
      data-ayah-key={ayahKey ?? undefined}
      lang={langOf(translation.meta.language)}
      style={{
        direction,
        fontFamily,
        fontSize,
        color,
        textAlign: 'start',
        lineHeight: TRANSLATION_LINE_HEIGHT,
        minHeight: fontSize * TRANSLATION_LINE_HEIGHT,
        opacity: opacity ?? 1,
        ...style,
      }}
    >
      {text ?? ''}
    </div>
  );
};

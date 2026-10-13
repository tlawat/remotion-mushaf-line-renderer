import type * as React from 'react';
import {Sequence, useVideoConfig} from 'remotion';
import {assertSurahNumber, DEFAULT_MUSHAF, getMushafDefinition} from '../mushaf/registry';
import type {MushafSurahNameProps} from '../types';
import {GlyphRenderer, surahHeaderItems} from './GlyphRenderer';
import {fontSizeForWidth, lineHeightForFontSize} from './styles';

/**
 * The name of a surah as printed above its first ayah, from QUL's surah-name header font (or the
 * V4 surah-name font, `surahNameFont="v4"`; Al-Fatihah always comes from it), inside the
 * ornamental frame of QUL's quran-common font (`framed`, the default) or alone. A block of
 * `width: 100%` and height `lineHeight`, like `<MushafLine>`; the name takes the inherited CSS
 * `color`. Fonts load behind `delayRender()`; `enter` / `exit` work as on a line.
 */
export const MushafSurahName: React.FC<MushafSurahNameProps> = ({
  surah,
  framed = true,
  surahNameFont = 'header',
  mushaf,
  fontSize,
  lineHeight,
  enter,
  exit,
  style,
  className,
  name,
  fontSrc,
  fontFallback,
}) => {
  const def = getMushafDefinition(mushaf ?? DEFAULT_MUSHAF);
  assertSurahNumber(surah);
  const {width} = useVideoConfig();
  const baseFontSize = fontSize ?? fontSizeForWidth(width, def.id);
  const resolvedLineHeight = lineHeight ?? lineHeightForFontSize(baseFontSize);
  const body = (
    <GlyphRenderer
      def={def}
      items={surahHeaderItems(def, surah, baseFontSize, framed, surahNameFont)}
      lineHeight={resolvedLineHeight}
      enter={enter}
      exit={exit}
      style={style}
      className={className}
      rootClassName="mushaf-surah-name"
      rootData={{mushaf: def.id, surah: String(surah), framed: String(framed), 'name-font': surahNameFont}}
      label={`<MushafSurahName> surah ${surah}`}
      fontSrc={fontSrc}
      fontFallback={fontFallback}
    />
  );
  return name === undefined ? (
    body
  ) : (
    <Sequence layout="none" name={name}>
      {body}
    </Sequence>
  );
};

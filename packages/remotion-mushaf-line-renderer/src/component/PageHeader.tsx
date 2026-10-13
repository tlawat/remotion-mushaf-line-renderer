import type * as React from 'react';
import {Sequence, useVideoConfig} from 'remotion';
import {MushafError} from '../errors';
import {DEFAULT_MUSHAF, getMushafDefinition} from '../mushaf/registry';
import type {MushafPageHeaderProps} from '../types';
import {type GlyphItem, GlyphRenderer} from './GlyphRenderer';
import {fontSizeForWidth, lineHeightForFontSize} from './styles';

/**
 * A page's running header, as printed above its first line: the juz's name against the right edge
 * and the surah's name against the left, from QUL's juz-name and surah-name page-header fonts (the
 * surah is 2-114: Al-Fatihah fills page 1, which has no running header). A block of
 * `width: 100%` and height `lineHeight`, like `<MushafLine>`; give it the width of the page's lines
 * (`style={{width}}`) to align the names with them. The names take the inherited CSS `color`; fonts
 * load behind `delayRender()`; `enter` / `exit` work as on a line.
 */
export const MushafPageHeader: React.FC<MushafPageHeaderProps> = ({
  juz,
  surah,
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
  const {width} = useVideoConfig();
  if (juz === undefined && surah === undefined) {
    throw new MushafError('BAD_PAGE_HEADER', '<MushafPageHeader> needs a juz, a surah or both.', {juz, surah});
  }
  // The glyph functions check the numbers (JUZ_OUT_OF_RANGE, SURAH_OUT_OF_RANGE).
  const items: GlyphItem[] = [];
  const baseFontSize = fontSize ?? fontSizeForWidth(width, def.id);
  const resolvedLineHeight = lineHeight ?? lineHeightForFontSize(baseFontSize);
  if (juz !== undefined) {
    items.push({glyph: def.glyphs.pageHeaderJuzName(juz), fontSize: baseFontSize, align: 'center', side: 'right'});
  }
  if (surah !== undefined) {
    items.push({glyph: def.glyphs.pageHeaderSurahName(surah), fontSize: baseFontSize, align: 'center', side: 'left'});
  }
  const body = (
    <GlyphRenderer
      def={def}
      items={items}
      lineHeight={resolvedLineHeight}
      enter={enter}
      exit={exit}
      style={style}
      className={className}
      rootClassName="mushaf-page-header"
      rootData={{
        mushaf: def.id,
        juz: juz === undefined ? undefined : String(juz),
        surah: surah === undefined ? undefined : String(surah),
      }}
      label={`<MushafPageHeader>${juz === undefined ? '' : ` juz ${juz}`}${surah === undefined ? '' : ` surah ${surah}`}`}
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

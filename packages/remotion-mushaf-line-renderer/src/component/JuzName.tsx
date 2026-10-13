import type * as React from 'react';
import {Sequence, useVideoConfig} from 'remotion';
import {assertJuzNumber, DEFAULT_MUSHAF, getMushafDefinition} from '../mushaf/registry';
import type {MushafJuzNameProps} from '../types';
import {GlyphRenderer} from './GlyphRenderer';
import {fontSizeForWidth, lineHeightForFontSize} from './styles';

/**
 * The name of a juz written out ("the first juz"), from QUL's quran-common font, centred in a block
 * of `width: 100%` and height `lineHeight`, in the inherited CSS `color`. The font loads behind
 * `delayRender()`; `enter` / `exit` work as on a line.
 */
export const MushafJuzName: React.FC<MushafJuzNameProps> = ({
  juz,
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
  assertJuzNumber(juz);
  const {width} = useVideoConfig();
  const baseFontSize = fontSize ?? fontSizeForWidth(width, def.id);
  const resolvedLineHeight = lineHeight ?? lineHeightForFontSize(baseFontSize);
  const body = (
    <GlyphRenderer
      def={def}
      items={[{glyph: def.glyphs.juzName(juz), fontSize: baseFontSize, align: 'center'}]}
      lineHeight={resolvedLineHeight}
      enter={enter}
      exit={exit}
      style={style}
      className={className}
      rootClassName="mushaf-juz-name"
      rootData={{mushaf: def.id, juz: String(juz)}}
      label={`<MushafJuzName> juz ${juz}`}
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

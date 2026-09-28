import type * as React from 'react';
import {Sequence, useVideoConfig} from 'remotion';
import {describeValue, MushafError} from '../errors';
import {assertJuzNumber, DEFAULT_MUSHAF, getMushafDefinition} from '../mushaf/registry';
import type {MushafJuzNameProps, MushafJuzNameVariant} from '../types';
import {GlyphRenderer} from './GlyphRenderer';
import {fontSizeForWidth, lineHeightForFontSize} from './styles';

const VARIANTS: readonly MushafJuzNameVariant[] = ['ordinal', 'opening'];

/**
 * The name of a juz from QUL's quran-common font: `'ordinal'` ("the first juz", the default) or
 * `'opening'` (its first words, "Alif Lam Mim" for juz 1), centred in a block of `width: 100%` and height
 * `lineHeight`, in the inherited CSS `color`. The font loads behind `delayRender()`; `enter` /
 * `exit` work as on a line.
 */
export const MushafJuzName: React.FC<MushafJuzNameProps> = ({
  juz,
  variant = 'ordinal',
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
  if (!VARIANTS.includes(variant)) {
    throw new MushafError(
      'JUZ_OUT_OF_RANGE',
      `variant must be 'ordinal' or 'opening', got ${describeValue(variant)}.`,
      {variant},
    );
  }
  const {width} = useVideoConfig();
  const baseFontSize = fontSize ?? fontSizeForWidth(width, def.id);
  const resolvedLineHeight = lineHeight ?? lineHeightForFontSize(baseFontSize);
  const body = (
    <GlyphRenderer
      def={def}
      items={[{glyph: def.glyphs.juzName(juz, variant), fontSize: baseFontSize, align: 'center'}]}
      lineHeight={resolvedLineHeight}
      enter={enter}
      exit={exit}
      style={style}
      className={className}
      rootClassName="mushaf-juz-name"
      rootData={{mushaf: def.id, juz: String(juz), variant}}
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

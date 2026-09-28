import type * as React from 'react';
import {useVideoConfig} from 'remotion';
import {MushafError} from '../errors';
import {getMushafDefinition} from '../mushaf/registry';
import {GlyphRenderer, surahHeaderItems} from './GlyphRenderer';
import type {LineRendererProps} from './LineRenderer';
import {fontSizeForWidth, lineHeightForFontSize} from './styles';

/**
 * Renders a `surah_name` line (the name in its ornamental frame, from QUL's surah-name and
 * quran-common fonts) or a `basmallah` line (the basmalah of the surah-name font, set on the page
 * baseline). Same root, sizing and props as an ayah line; the word props have nothing to apply to.
 */
export const HeaderLine: React.FC<LineRendererProps> = ({
  line,
  enter,
  exit,
  fontSize,
  lineHeight,
  style,
  className,
  framed = true,
  fontSrc,
  fontFallback,
}) => {
  const def = getMushafDefinition(line.mushaf);
  const {width} = useVideoConfig();
  const baseFontSize = fontSize ?? fontSizeForWidth(width, line.mushaf);
  const resolvedLineHeight = lineHeight ?? lineHeightForFontSize(baseFontSize);
  if (line.type === 'surah_name' && line.surahNumber === undefined) {
    throw new MushafError(
      'BAD_LINE_DATA',
      `MushafLineData.surahNumber is missing on the surah_name line of page ${line.page} line ${line.line}. Pass the object returned by getMushafLine() unchanged.`,
      {field: 'surahNumber'},
    );
  }
  const items =
    line.type === 'surah_name'
      ? surahHeaderItems(def, line.surahNumber as number, baseFontSize, framed)
      : [{glyph: def.glyphs.basmalah, fontSize: baseFontSize, align: 'baseline' as const}];
  return (
    <GlyphRenderer
      def={def}
      items={items}
      lineHeight={resolvedLineHeight}
      enter={enter}
      exit={exit}
      style={style}
      className={className}
      rootClassName="mushaf-line"
      rootData={{
        mushaf: line.mushaf,
        theme: typeof line.theme === 'string' ? line.theme : 'custom',
        page: String(line.page),
        line: String(line.line),
        'line-type': line.type,
        centered: 'true',
        surah: line.surahNumber === undefined ? undefined : String(line.surahNumber),
        framed: line.type === 'surah_name' ? String(framed) : undefined,
      }}
      label={`<MushafLine> page ${line.page} line ${line.line}`}
      fontSrc={fontSrc}
      fontFallback={fontFallback}
    />
  );
};

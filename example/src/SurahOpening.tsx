// The opening of a surah, as a title card: the juz it starts in, its header (the name in its
// printed frame), its basmalah when it has one, and its first lines, entering one after the other.
// The header and basmalah lines come from the same call as the ayah lines (`getMushafLines({page})`)
// and render through the same component; the juz name is a standalone element.
import {
  fontSizeForWidth,
  getMushafLines,
  getMushafLocation,
  lineHeightForFontSize,
  MushafJuzName,
  type MushafJuzNameVariant,
  MushafLine,
  type MushafLineData,
  type MushafThemeSelection,
  slideFade,
} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {AbsoluteFill, type CalculateMetadataFunction, Sequence, useVideoConfig} from 'remotion';
import {type DataFiles, dataFromFiles, type FontMode, fontProps} from './sources';

export type SurahOpeningProps = {
  /** 'plain' follows CSS `color`; a preset (light, dark, sepia, black, normal, p1-p5) or a custom theme selects the colour font. */
  theme: MushafThemeSelection;
  /** The surah, 1-114. */
  surah: number;
  /** How many ayah lines to show after the header and the basmalah. */
  ayahLines: number;
  /** The juz the surah starts in (1-30), shown above the header; null shows none. The layout data carries no juz, so say it here. */
  juz: number | null;
  /** 'ordinal' is "الجزء الأول"; 'opening' the juz's first words. */
  juzVariant: MushafJuzNameVariant;
  /** Whether the surah name sits in its printed frame. */
  framed: boolean;
  /** Where the fonts come from: 'fallback' (QUL's CDN, then the fonts packages), 'cdn' or 'package' (with the shared fonts from public/fonts). */
  fonts: FontMode;
  /** Mirror of QUL's two exports in the public folder ({words, layout} paths); null fetches them from Tarteel's CDN. */
  dataFiles: DataFiles | null;
  /** Resolved once by calculateMetadata (null in defaultProps): the header line, the basmalah line and the ayah lines. */
  lines: MushafLineData[] | null;
};

export const defaultSurahOpeningProps: SurahOpeningProps = {
  theme: 'normal',
  surah: 36,
  ayahLines: 2,
  juz: 22,
  juzVariant: 'ordinal',
  framed: true,
  fonts: 'fallback',
  dataFiles: null,
  lines: null,
};

/** Frames between two entrances. */
export const STAGGER_FRAMES = 20;
/** Frames the whole opening stays after the last entrance. */
export const HOLD_FRAMES = 60;
const MARGIN_X = 120;

export const calculateSurahOpeningMetadata: CalculateMetadataFunction<SurahOpeningProps> = async ({props}) => {
  const resolve = async () => {
    const data = dataFromFiles(props.dataFiles);
    // The header of a surah is printed right above its first ayah, on the same page.
    const {page, line} = await getMushafLocation({surah: props.surah, data});
    const pageLines = await getMushafLines({theme: props.theme, page, data});
    const header = pageLines.findIndex((l) => l.type === 'surah_name' && l.surahNumber === props.surah);
    // Surah 1 opens page 1 with its header; surah 9 has no basmalah; every other surah has both.
    const from = header >= 0 ? header : line - 1;
    const out: MushafLineData[] = [];
    let ayahs = 0;
    for (const l of pageLines.slice(from)) {
      if (l.type === 'ayah') {
        if (ayahs === props.ayahLines) break;
        ayahs++;
      }
      out.push(l);
    }
    return out;
  };
  const lines = props.lines ?? (await resolve());
  const elements = lines.length + (props.juz === null ? 0 : 1);
  return {props: {...props, lines}, durationInFrames: STAGGER_FRAMES * (elements - 1) + HOLD_FRAMES};
};

export const SurahOpening: React.FC<SurahOpeningProps> = ({lines, juz, juzVariant, framed, fonts}) => {
  const {width, height, fps} = useVideoConfig();
  if (!lines) {
    throw new Error(
      'SurahOpening: `lines` is null. calculateMetadata resolves it; a <Player> host must pass resolved lines.',
    );
  }
  const measure = width - 2 * MARGIN_X;
  const fontSize = fontSizeForWidth(measure);
  const lineHeight = lineHeightForFontSize(fontSize);
  // The juz name is a label, not a line of the page: half the type size, in the same grid.
  const juzFontSize = Math.round(fontSize / 2);
  const rows = lines.length + (juz === null ? 0 : 1);
  const top = Math.round((height - rows * lineHeight) / 2);
  let slot = 0;
  const next = () => {
    const i = slot++;
    return {from: i * STAGGER_FRAMES, top: top + i * lineHeight};
  };
  const enter = slideFade();
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee', color: '#1b1b1b'}}>
      {juz !== null
        ? (() => {
            const at = next();
            return (
              <Sequence
                from={at.from}
                premountFor={fps}
                name={`Juz ${juz}`}
                style={{top: at.top, height: lineHeight, left: MARGIN_X, width: measure}}
              >
                <MushafJuzName
                  juz={juz}
                  variant={juzVariant}
                  fontSize={juzFontSize}
                  lineHeight={lineHeight}
                  enter={enter}
                  {...fontProps(fonts, 'qpc-v4')}
                />
              </Sequence>
            );
          })()
        : null}
      {lines.map((line) => {
        const at = next();
        return (
          <Sequence
            key={`${line.page}/${line.line}`}
            from={at.from}
            premountFor={fps}
            name={`Page ${line.page} line ${line.line} (${line.type})`}
            style={{top: at.top, height: lineHeight, left: MARGIN_X, width: measure}}
          >
            <MushafLine
              line={line}
              fontSize={fontSize}
              lineHeight={lineHeight}
              framed={framed}
              enter={enter}
              {...fontProps(fonts, line.fontSet)}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

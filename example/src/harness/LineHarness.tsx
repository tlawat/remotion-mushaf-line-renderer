// Test harness composition: explicit lines, one entrance/exit for all of them, and font-source
// knobs. Used by the <Player> page (test/browser) and the render suite (test/render) of the package.

import {linearTiming, type TransitionTiming} from '@remotion/transitions';
import {dissolve} from '@remotion/transitions/dissolve';
import {fade} from '@remotion/transitions/fade';
import {none} from '@remotion/transitions/none';
import {slide} from '@remotion/transitions/slide';
import type * as React from 'react';
import {AbsoluteFill, type CalculateMetadataFunction, Sequence, staticFile, useVideoConfig} from 'remotion';
import plainFonts from 'remotion-mushaf-fonts-qpc-v4';
import tajweedFonts from 'remotion-mushaf-fonts-qpc-v4-tajweed';
import {
  fontSizeForWidth,
  lineHeightForFontSize,
  type MushafDataSource,
  type MushafFontFallback,
  type MushafFontSrc,
  MushafLine,
  type MushafLineAnimation,
  type MushafLineData,
  type MushafSlice,
  type MushafThemeSelection,
  type MushafWord,
  revealRtl,
  slideFade,
} from 'remotion-mushaf-line-renderer';

export type EnterName = 'plain' | 'none' | 'fade' | 'slide' | 'reveal' | 'soft-reveal' | 'slide-fade' | 'dissolve';

export type LineHarnessProps = {
  lines: MushafLineData[];
  /** 'plain' passes no `enter`; 'dissolve' is a canvas presentation and must be rejected. */
  enter: EnterName;
  enterFrames: number;
  /** 'plain' passes no `exit`. For 'fade' the exiting side is told to fade out. */
  exit: EnterName;
  exitFrames: number;
  /** <Sequence from> of the first line; each further line starts `stagger` frames later. */
  from: number;
  stagger: number;
  /** <Sequence durationInFrames>; null leaves the Sequences unbounded. */
  durationInFrames: number | null;
  premountFor: number;
  /** 'stack' lays the lines down the page; 'same' puts them all in one slot (replacing). */
  slot: 'stack' | 'same';
  /** 'line' (the package default) fits the line to its box; 'mushaf' keeps one fixed type size. */
  fit: 'line' | 'mushaf';
  /** Font from the public folder (render tests), turned into `fontUrl` via staticFile() in calculateMetadata. */
  fontFile: string | null;
  /**
   * One font URL for every line, as-is (Player page, failure scenarios): `fontSrc={() => fontUrl}`.
   * Wins over fontFile. Null: QUL's CDN.
   */
  fontUrl: string | null;
  /** The fonts packages: 'fallback' passes them as `fontFallback`, 'source' as `fontSrc` (wins over fontUrl). */
  fontPackages: 'none' | 'fallback' | 'source';
  fontSize: number | null;
  lineHeight: number | null;
  /** Word to mark as current (`word.id` or `word.wordId`), for the highlighting scenarios. */
  activeWordId: string | number | null;
  /** When set, every word gets this opacity unless it is the active one. */
  dimOthersTo: number | null;
  /** CSS `color` of the page. Plain glyphs follow it; so does everything a theme paints in `currentColor`. */
  color: string;
  /** Show only these ayahs of every line (the `slice` prop), or null for whole lines. */
  slice: MushafSlice | null;
  /** Put `slice` on the line data instead of the prop, to exercise that surface. */
  sliceOnData: boolean;
  /**
   * The convenience form: one `<MushafLine theme page line>` resolved in the browser tab (with
   * `data` as its source), instead of the resolved `lines`. Rendered alone, in the first slot.
   */
  resolve: {theme: MushafThemeSelection; page: number; line: number} | null;
  /** Data source for `resolve` — URLs as they are (Player page, failure scenarios); each part given wins over dataFiles. */
  data: MushafDataSource | null;
  /** Data source from the public folder (render tests), pinned via staticFile() in calculateMetadata. */
  dataFiles: {words: string; layout: string} | null;
  /** Background of the page, for the dark themes. */
  background: string;
};

export const defaultLineHarnessProps: LineHarnessProps = {
  lines: [],
  enter: 'plain',
  enterFrames: 20,
  exit: 'plain',
  exitFrames: 20,
  from: 0,
  stagger: 0,
  durationInFrames: null,
  premountFor: 0,
  slot: 'stack',
  fit: 'line',
  fontFile: null,
  fontUrl: null,
  fontPackages: 'none',
  fontSize: null,
  lineHeight: null,
  activeWordId: null,
  dimOthersTo: null,
  color: '#000000',
  slice: null,
  sliceOnData: false,
  resolve: null,
  data: null,
  dataFiles: null,
  background: '#ffffff',
};

export const calculateLineHarnessMetadata: CalculateMetadataFunction<LineHarnessProps> = ({props}) => {
  const fontUrl = props.fontUrl ?? (props.fontFile ? staticFile(props.fontFile) : null);
  const pinned = props.dataFiles
    ? {words: staticFile(props.dataFiles.words), layout: staticFile(props.dataFiles.layout)}
    : null;
  const data = pinned || props.data ? {...pinned, ...props.data} : null;
  return {props: {...props, fontUrl, fontFile: null, data, dataFiles: null}};
};

const presentation = (
  name: Exclude<EnterName, 'plain'>,
  timing: TransitionTiming,
  side: 'enter' | 'exit',
): MushafLineAnimation => {
  switch (name) {
    case 'none':
      return {presentation: none(), timing};
    case 'fade':
      return {presentation: side === 'exit' ? fade({shouldFadeOutExitingScene: true}) : fade(), timing};
    case 'slide':
      return {presentation: slide({direction: 'from-right'}), timing};
    case 'reveal':
      return {presentation: revealRtl(), timing};
    case 'soft-reveal':
      return {presentation: revealRtl({softness: 10}), timing};
    case 'slide-fade':
      return {presentation: slideFade(), timing};
    case 'dissolve':
      return {presentation: dissolve({}), timing};
  }
};

export const LineHarness: React.FC<LineHarnessProps> = ({
  lines,
  enter,
  enterFrames,
  exit,
  exitFrames,
  from,
  stagger,
  durationInFrames,
  premountFor,
  slot,
  fit,
  fontUrl,
  fontPackages,
  fontSize,
  lineHeight,
  activeWordId,
  dimOthersTo,
  color,
  slice,
  sliceOnData,
  resolve,
  data,
  background,
}) => {
  const {width} = useVideoConfig();
  const resolvedFontSize = fontSize ?? fontSizeForWidth(width);
  const resolvedLineHeight = lineHeight ?? lineHeightForFontSize(resolvedFontSize);
  const wordStyle =
    dimOthersTo === null
      ? undefined
      : (_word: MushafWord, ctx: {active: boolean}) => ({opacity: ctx.active ? 1 : dimOthersTo});
  const enterAnimation =
    enter === 'plain' ? undefined : presentation(enter, linearTiming({durationInFrames: enterFrames}), 'enter');
  const exitAnimation =
    exit === 'plain' ? undefined : presentation(exit, linearTiming({durationInFrames: exitFrames}), 'exit');
  // The font props every line gets: the same source for the resolved lines and the convenience form.
  const fonts = (fontSet: string): {fontSrc?: MushafFontSrc; fontFallback?: MushafFontFallback} => {
    const pkg = fontSet === 'qpc-v4' ? plainFonts : tajweedFonts;
    if (fontPackages === 'source') return {fontSrc: pkg};
    return {
      ...(fontUrl ? {fontSrc: () => fontUrl} : {}),
      ...(fontPackages === 'fallback' ? {fontFallback: [plainFonts, tajweedFonts]} : {}),
    };
  };
  return (
    <AbsoluteFill style={{backgroundColor: background, color}}>
      {resolve ? (
        <Sequence
          from={from}
          durationInFrames={durationInFrames ?? undefined}
          premountFor={premountFor}
          name={`p${resolve.page} l${resolve.line} (resolved here)`}
          style={{top: 0, height: resolvedLineHeight}}
        >
          <MushafLine
            theme={resolve.theme}
            page={resolve.page}
            line={resolve.line}
            {...(data ? {data} : {})}
            fontSize={resolvedFontSize}
            lineHeight={resolvedLineHeight}
            fit={fit}
            slice={slice === null ? undefined : slice}
            enter={enterAnimation}
            exit={exitAnimation}
            activeWordId={activeWordId}
            activeWordStyle={{color: '#b30000'}}
            wordStyle={wordStyle}
            {...fonts(resolve.theme === 'plain' ? 'qpc-v4' : 'qpc-v4-tajweed')}
          />
        </Sequence>
      ) : null}
      {lines.map((line, i) => {
        const lineData = sliceOnData && slice ? {...line, slice} : line;
        return (
          <Sequence
            key={`${line.mushaf}/${line.page}/${line.line}`}
            from={from + i * stagger}
            durationInFrames={durationInFrames ?? undefined}
            premountFor={premountFor}
            name={`p${line.page} l${line.line}`}
            style={{top: slot === 'same' ? 0 : i * resolvedLineHeight, height: resolvedLineHeight}}
          >
            <MushafLine
              line={lineData}
              fontSize={resolvedFontSize}
              lineHeight={resolvedLineHeight}
              fit={fit}
              slice={sliceOnData || slice === null ? undefined : slice}
              enter={enterAnimation}
              exit={exitAnimation}
              activeWordId={activeWordId}
              activeWordStyle={{color: '#b30000'}}
              wordStyle={wordStyle}
              {...fonts(line.fontSet)}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

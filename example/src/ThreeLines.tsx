// Three consecutive lines of one page, each with a different entrance/exit pair. In 'replace' mode
// the lines share one slot and each leaves as the next enters (a slideshow); in 'stack' mode they
// stack down the page and stay.
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import type * as React from 'react';
import {AbsoluteFill, type CalculateMetadataFunction, Sequence, useVideoConfig} from 'remotion';
import {
  enterTiming,
  exitTiming,
  fontSizeForWidth,
  getMushafLines,
  lineHeightForFontSize,
  MushafLine,
  type MushafLineAnimation,
  type MushafLineData,
  type MushafThemeSelection,
  revealRtl,
  slideFade,
} from 'remotion-mushaf-line-renderer';
import {type DataFiles, dataFromFiles, type FontMode, fontProps} from './sources';

export type ThreeLinesProps = {
  /** 'plain' follows CSS `color`; a preset (light, dark, sepia, black, normal, p1-p5) or a custom theme selects the colour font. */
  theme: MushafThemeSelection;
  page: number;
  lineNumbers: number[];
  /** Resolved once by calculateMetadata (null in defaultProps), so every render tab receives the same JSON. */
  lines: MushafLineData[] | null;
  /** Where the page fonts come from: 'fallback' (QUL's CDN, then the fonts packages), 'cdn' or 'package'. */
  fonts: FontMode;
  /** Mirror of QUL's two exports in the public folder ({words, layout} paths); null fetches them from Tarteel's CDN. */
  dataFiles: DataFiles | null;
  mode: 'replace' | 'stack';
};

export const defaultThreeLinesProps: ThreeLinesProps = {
  theme: 'plain',
  page: 10,
  lineNumbers: [3, 4, 5],
  lines: null,
  fonts: 'fallback',
  dataFiles: null,
  mode: 'replace',
};

/** Frames a line is on screen, exit included, before the next one takes the slot. */
export const HOLD_FRAMES = 60;
/** stack mode: frames between two entrances, and the hold after the last one. */
export const STAGGER_FRAMES = 45;
/** Long enough for the slowest of the four entrances. */
export const ENTRANCE_FRAMES = 30;
const MARGIN_X = 120;

export const durationFor = (mode: ThreeLinesProps['mode'], lineCount: number): number =>
  Math.max(
    1,
    mode === 'replace'
      ? lineCount * HOLD_FRAMES + ENTRANCE_FRAMES
      : STAGGER_FRAMES * (lineCount - 1) + ENTRANCE_FRAMES + HOLD_FRAMES,
  );

// Resolve the lines here rather than in the component: it runs once per render (not once per
// browser tab), the Studio shows the resolved props, and the duration follows the line count.
export const calculateThreeLinesMetadata: CalculateMetadataFunction<ThreeLinesProps> = async ({props}) => {
  const resolve = async () => {
    // One call for the whole page; `data` points it at a mirror of QUL's two exports (else
    // Tarteel's CDN). Where the fonts come from is decided where the lines are drawn (`fonts`).
    const page = await getMushafLines({
      theme: props.theme,
      page: props.page,
      data: dataFromFiles(props.dataFiles),
    });
    return props.lineNumbers.map((line) => {
      const found = page[line - 1];
      if (found?.type !== 'ayah') {
        throw new Error(
          `ThreeLines: page ${props.page} line ${line} is ${found ? `a "${found.type}" line` : 'missing'}; pick an ayah line.`,
        );
      }
      return found;
    });
  };
  const lines = props.lines ?? (await resolve());
  return {props: {...props, lines}, durationInFrames: durationFor(props.mode, lines.length)};
};

// One entrance/exit pair per line, cycling: the package's slide+fade, then two stock presentations
// with the package's eased default timings, then a soft revealRtl. `fade()` keeps the exiting side
// visible unless told otherwise.
const transitions: Array<{enter: MushafLineAnimation; exit: MushafLineAnimation}> = [
  {enter: {presentation: slideFade()}, exit: {presentation: slideFade()}},
  {
    enter: {presentation: fade(), timing: enterTiming()},
    exit: {presentation: fade({shouldFadeOutExitingScene: true}), timing: exitTiming()},
  },
  {
    enter: {presentation: slide({direction: 'from-right'}), timing: enterTiming()},
    exit: {presentation: slide({direction: 'from-right'}), timing: exitTiming()},
  },
  {enter: {presentation: revealRtl({softness: 8})}, exit: {presentation: revealRtl({softness: 8})}},
];

export const ThreeLines: React.FC<ThreeLinesProps> = ({lines, mode, fonts}) => {
  const {width, height, fps} = useVideoConfig();
  if (!lines) {
    throw new Error(
      'ThreeLines: `lines` is null. calculateMetadata resolves it; a <Player> host must pass resolved lines.',
    );
  }
  // The package's default type size is for a line spanning the full composition width; this
  // composition insets the lines, so ask for the same rule on the inset measure.
  const measure = width - 2 * MARGIN_X;
  const fontSize = fontSizeForWidth(measure);
  const lineHeight = lineHeightForFontSize(fontSize);
  const replace = mode === 'replace';
  const top = Math.round((height - (replace ? 1 : lines.length) * lineHeight) / 2);
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee', color: '#1b1b1b'}}>
      {lines.map((line, i) => {
        const {enter, exit} = transitions[i % transitions.length]!;
        return (
          <Sequence
            key={`${line.page}/${line.line}`}
            // replace: line i takes the slot as line i-1 leaves; its own exit is its last frames.
            from={replace ? i * HOLD_FRAMES : i * STAGGER_FRAMES}
            durationInFrames={replace ? HOLD_FRAMES + ENTRANCE_FRAMES : undefined}
            premountFor={fps}
            name={`Page ${line.page} line ${line.line}`}
            style={{top: replace ? top : top + i * lineHeight, height: lineHeight, left: MARGIN_X, width: measure}}
          >
            <MushafLine
              line={line}
              fontSize={fontSize}
              lineHeight={lineHeight}
              enter={enter}
              exit={replace ? exit : undefined}
              {...fontProps(fonts, line.fontSet)}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

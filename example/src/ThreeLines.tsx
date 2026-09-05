import * as React from 'react';
import {AbsoluteFill, Sequence, staticFile, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {linearTiming, springTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {MushafLine, getMushafLine, type MushafId, type MushafLineAnimation, type MushafLineData} from 'remotion-mushaf-line-renderer';
import {revealRtl} from 'remotion-mushaf-line-renderer/presentations/reveal-rtl';

export type ThreeLinesProps = {
  mushaf: MushafId;
  page: number;
  lineNumbers: number[];
  /** Resolved once by calculateMetadata (null in defaultProps), so every render tab receives the same JSON. */
  lines: MushafLineData[] | null;
  /** Optional font in the public folder, e.g. 'fonts/qpc-v4-tajweed/p10.woff2'; null uses QUL's CDN. */
  fontFile: string | null;
};

export const ENTRANCE_FRAMES = 30;
export const STAGGER_FRAMES = 45;
export const HOLD_FRAMES = 60;
const MARGIN_X = 120;

// Resolve the lines here rather than in the component: it runs once per render (not once per
// browser tab), the Studio shows the resolved props, and the duration follows the line count.
export const calculateThreeLinesMetadata: CalculateMetadataFunction<ThreeLinesProps> = async ({props}) => {
  const lines = props.lines ?? (await Promise.all(props.lineNumbers.map((line) => getMushafLine({mushaf: props.mushaf, page: props.page, line}))));
  const fontUrl = props.fontFile ? staticFile(props.fontFile) : null;
  return {
    props: {...props, lines: fontUrl ? lines.map((line) => ({...line, fontUrl})) : lines},
    durationInFrames: Math.max(1, STAGGER_FRAMES * (lines.length - 1) + ENTRANCE_FRAMES + HOLD_FRAMES),
  };
};

const entrances: MushafLineAnimation[] = [
  {presentation: fade(), timing: linearTiming({durationInFrames: ENTRANCE_FRAMES})},
  {presentation: slide({direction: 'from-right'}), timing: springTiming({config: {damping: 200}, durationInFrames: ENTRANCE_FRAMES})},
  {presentation: revealRtl(), timing: linearTiming({durationInFrames: ENTRANCE_FRAMES})},
];

export const ThreeLines: React.FC<ThreeLinesProps> = ({lines}) => {
  const {width, height, fps} = useVideoConfig();
  if (!lines) {
    throw new Error('ThreeLines: `lines` is null. calculateMetadata resolves it; a <Player> host must pass resolved lines.');
  }
  // The package's default type size is for a line spanning the full composition width; this
  // composition insets the lines, so apply the same rule (width x 2500 / 42501) to the inset measure.
  const measure = width - 2 * MARGIN_X;
  const fontSize = Math.floor((measure * 2500) / 42501);
  const lineHeight = Math.round(2.2 * fontSize);
  const top = Math.round((height - lines.length * lineHeight) / 2);
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee'}}>
      {lines.map((line, i) => (
        <Sequence
          key={`${line.page}/${line.line}`}
          from={i * STAGGER_FRAMES}
          premountFor={fps}
          name={`Page ${line.page} line ${line.line}`}
          style={{top: top + i * lineHeight, height: lineHeight, left: MARGIN_X, width: measure}}
        >
          <MushafLine line={line} fontSize={fontSize} lineHeight={lineHeight} enter={entrances[i % entrances.length]} style={{color: '#1b1b1b'}} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

import * as React from 'react';
import {AbsoluteFill, Sequence, staticFile, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {linearTiming, springTiming, type TransitionTiming} from '@remotion/transitions';
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
  /**
   * 'replace': one slot; each line leaves (its `exit`) while the next one enters, like a slideshow.
   * 'stack': the lines stay and stack down the page, each entering in turn.
   */
  mode: 'replace' | 'stack';
};

export const ENTRANCE_FRAMES = 30;
/** replace mode: frames a line is on screen before the next one starts replacing it. */
export const HOLD_FRAMES = 60;
/** stack mode: frames between two entrances, and the hold after the last one. */
export const STAGGER_FRAMES = 45;
const MARGIN_X = 120;

export const durationFor = (mode: ThreeLinesProps['mode'], lineCount: number): number =>
  Math.max(1, mode === 'replace' ? lineCount * HOLD_FRAMES + ENTRANCE_FRAMES : STAGGER_FRAMES * (lineCount - 1) + ENTRANCE_FRAMES + HOLD_FRAMES);

// Resolve the lines here rather than in the component: it runs once per render (not once per
// browser tab), the Studio shows the resolved props, and the duration follows the line count.
export const calculateThreeLinesMetadata: CalculateMetadataFunction<ThreeLinesProps> = async ({props}) => {
  const lines = props.lines ?? (await Promise.all(props.lineNumbers.map((line) => getMushafLine({mushaf: props.mushaf, page: props.page, line}))));
  const fontUrl = props.fontFile ? staticFile(props.fontFile) : null;
  return {
    props: {...props, lines: fontUrl ? lines.map((line) => ({...line, fontUrl})) : lines},
    durationInFrames: durationFor(props.mode, lines.length),
  };
};

// One entrance/exit pair per line, cycling. `fade()` keeps the exiting side visible unless told
// otherwise; `slide` pushes it out; `revealRtl` hides it in reading direction.
const linear: TransitionTiming = linearTiming({durationInFrames: ENTRANCE_FRAMES});
const spring: TransitionTiming = springTiming({config: {damping: 200}, durationInFrames: ENTRANCE_FRAMES});
const transitions: Array<{enter: MushafLineAnimation; exit: MushafLineAnimation}> = [
  {enter: {presentation: fade(), timing: linear}, exit: {presentation: fade({shouldFadeOutExitingScene: true}), timing: linear}},
  {enter: {presentation: slide({direction: 'from-right'}), timing: spring}, exit: {presentation: slide({direction: 'from-right'}), timing: spring}},
  {enter: {presentation: revealRtl(), timing: linear}, exit: {presentation: revealRtl(), timing: linear}},
];

export const ThreeLines: React.FC<ThreeLinesProps> = ({lines, mode}) => {
  const {width, height, fps} = useVideoConfig();
  if (!lines) {
    throw new Error('ThreeLines: `lines` is null. calculateMetadata resolves it; a <Player> host must pass resolved lines.');
  }
  // The package's default type size is for a line spanning the full composition width; this
  // composition insets the lines, so apply the same rule (width x 2500 / 42501) to the inset measure.
  const measure = width - 2 * MARGIN_X;
  const fontSize = Math.floor((measure * 2500) / 42501);
  const lineHeight = Math.round(2.2 * fontSize);
  const replace = mode === 'replace';
  const top = Math.round((height - (replace ? 1 : lines.length) * lineHeight) / 2);
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee'}}>
      {lines.map((line, i) => {
        const {enter, exit} = transitions[i % transitions.length]!;
        return (
          <Sequence
            key={`${line.page}/${line.line}`}
            // replace: line i starts when line i-1 begins to leave; its own exit is its last ENTRANCE_FRAMES.
            from={replace ? i * HOLD_FRAMES : i * STAGGER_FRAMES}
            durationInFrames={replace ? HOLD_FRAMES + ENTRANCE_FRAMES : undefined}
            premountFor={fps}
            name={`Page ${line.page} line ${line.line}`}
            style={{top: replace ? top : top + i * lineHeight, height: lineHeight, left: MARGIN_X, width: measure}}
          >
            <MushafLine line={line} fontSize={fontSize} lineHeight={lineHeight} enter={enter} exit={replace ? exit : undefined} style={{color: '#1b1b1b'}} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

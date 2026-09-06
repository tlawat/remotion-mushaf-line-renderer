import * as React from 'react';
import {AbsoluteFill, Sequence, staticFile, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {
  MushafLine,
  enterTiming,
  exitTiming,
  fontSizeForWidth,
  getMushafLines,
  lineHeightForFontSize,
  type MushafId,
  type MushafLineAnimation,
  type MushafColors,
  type MushafLineData,
} from 'remotion-mushaf-line-renderer';
import {revealRtl} from 'remotion-mushaf-line-renderer/presentations/reveal-rtl';
import {slideFade} from 'remotion-mushaf-line-renderer/presentations/slide-fade';

export type ThreeLinesProps = {
  mushaf: MushafId;
  /** Colour font (tajweed) instead of plain black glyphs. */
  tajweed: boolean;
  /** The ayah rosettes in colour with the writing following CSS `color`; `{ink, accent, detail, background}` recolours it. */
  mandala: boolean | MushafColors;
  page: number;
  lineNumbers: number[];
  /** Resolved once by calculateMetadata (null in defaultProps), so every render tab receives the same JSON. */
  lines: MushafLineData[] | null;
  /** Optional font pattern in the public folder, e.g. 'fonts/{mushaf}/p{page}.woff2'; null uses QUL's CDN. */
  fontFile: string | null;
  /**
   * 'replace': one slot; each line leaves (its `exit`) as the next one enters, like a slideshow.
   * 'stack': the lines stay and stack down the page, each entering in turn.
   */
  mode: 'replace' | 'stack';
};

/** Frames a line is on screen, exit included, before the next one takes the slot. */
export const HOLD_FRAMES = 60;
/** stack mode: frames between two entrances, and the hold after the last one. */
export const STAGGER_FRAMES = 45;
/** Long enough for the slowest of the four entrances (springyTiming settles on its own). */
export const ENTRANCE_FRAMES = 30;
const MARGIN_X = 120;

export const durationFor = (mode: ThreeLinesProps['mode'], lineCount: number): number =>
  Math.max(1, mode === 'replace' ? lineCount * HOLD_FRAMES + ENTRANCE_FRAMES : STAGGER_FRAMES * (lineCount - 1) + ENTRANCE_FRAMES + HOLD_FRAMES);

// Resolve the lines here rather than in the component: it runs once per render (not once per
// browser tab), the Studio shows the resolved props, and the duration follows the line count.
export const calculateThreeLinesMetadata: CalculateMetadataFunction<ThreeLinesProps> = async ({props}) => {
  const pattern = props.fontFile;
  const resolve = async () => {
    // One call for the whole page, and `fontUrl` pins the mirror on every line it returns; without
    // it the fonts come from QUL's CDN.
    const page = await getMushafLines({
      mushaf: props.mushaf,
      tajweed: props.tajweed,
      mandala: props.mandala,
      page: props.page,
      ...(pattern ? {fontUrl: (p: number, mushaf: MushafId) => staticFile(pattern.replace('{mushaf}', mushaf).replace('{page}', String(p)))} : {}),
    });
    return props.lineNumbers.map((line) => {
      const found = page[line - 1];
      if (!found || found.type !== 'ayah') throw new Error(`ThreeLines: page ${props.page} line ${line} is ${found ? `a "${found.type}" line` : 'missing'}; pick an ayah line.`);
      return found;
    });
  };
  const lines = props.lines ?? (await resolve());
  return {props: {...props, lines}, durationInFrames: durationFor(props.mode, lines.length)};
};

// One entrance/exit pair per line, cycling: the package's slide+fade, then the two stock
// presentations, each with the package's eased default timings (decelerate in, accelerate out).
// `fade()` keeps the exiting side visible unless told otherwise; `revealRtl` hides it in reading
// direction, here with a soft edge.
const transitions: Array<{enter: MushafLineAnimation; exit: MushafLineAnimation}> = [
  {enter: {presentation: slideFade()}, exit: {presentation: slideFade()}},
  {enter: {presentation: fade(), timing: enterTiming()}, exit: {presentation: fade({shouldFadeOutExitingScene: true}), timing: exitTiming()}},
  {enter: {presentation: slide({direction: 'from-right'}), timing: enterTiming()}, exit: {presentation: slide({direction: 'from-right'}), timing: exitTiming()}},
  {enter: {presentation: revealRtl({softness: 8})}, exit: {presentation: revealRtl({softness: 8})}},
];

export const ThreeLines: React.FC<ThreeLinesProps> = ({lines, mode}) => {
  const {width, height, fps} = useVideoConfig();
  if (!lines) {
    throw new Error('ThreeLines: `lines` is null. calculateMetadata resolves it; a <Player> host must pass resolved lines.');
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
            <MushafLine line={line} fontSize={fontSize} lineHeight={lineHeight} enter={enter} exit={replace ? exit : undefined} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

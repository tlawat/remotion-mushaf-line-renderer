// Test harness composition: explicit lines, one entrance/exit for all of them, and font-source
// knobs. Used by the <Player> page (test/browser) and the render suite (test/render) of the package.
import * as React from 'react';
import {AbsoluteFill, Sequence, staticFile, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {linearTiming, type TransitionTiming} from '@remotion/transitions';
import {dissolve} from '@remotion/transitions/dissolve';
import {fade} from '@remotion/transitions/fade';
import {none} from '@remotion/transitions/none';
import {slide} from '@remotion/transitions/slide';
import {MushafLine, fontSizeForWidth, lineHeightForFontSize, type MushafLineAnimation, type MushafLineData, type MushafWord} from 'remotion-mushaf-line-renderer';
import {revealRtl} from 'remotion-mushaf-line-renderer/presentations/reveal-rtl';
import {slideFade} from 'remotion-mushaf-line-renderer/presentations/slide-fade';

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
  /** Font from the public folder (render tests), pinned via staticFile() in calculateMetadata. */
  fontFile: string | null;
  /** Font URL pinned as-is (Player page, failure scenarios). Wins over fontFile. */
  fontUrl: string | null;
  fontSize: number | null;
  lineHeight: number | null;
  /** Word to mark as current (`word.id` or `word.wordId`), for the highlighting scenarios. */
  activeWordId: string | number | null;
  /** When set, every word gets this opacity unless it is the active one. */
  dimOthersTo: number | null;
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
  fontFile: null,
  fontUrl: null,
  fontSize: null,
  lineHeight: null,
  activeWordId: null,
  dimOthersTo: null,
};

export const calculateLineHarnessMetadata: CalculateMetadataFunction<LineHarnessProps> = ({props}) => {
  const fontUrl = props.fontUrl ?? (props.fontFile ? staticFile(props.fontFile) : null);
  return {props: {...props, fontUrl, fontFile: null}};
};

const presentation = (name: Exclude<EnterName, 'plain'>, timing: TransitionTiming, side: 'enter' | 'exit'): MushafLineAnimation => {
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
  fontUrl,
  fontSize,
  lineHeight,
  activeWordId,
  dimOthersTo,
}) => {
  const {width} = useVideoConfig();
  const resolvedFontSize = fontSize ?? fontSizeForWidth(width);
  const resolvedLineHeight = lineHeight ?? lineHeightForFontSize(resolvedFontSize);
  const wordStyle = dimOthersTo === null ? undefined : (_word: MushafWord, ctx: {active: boolean}) => ({opacity: ctx.active ? 1 : dimOthersTo});
  const enterAnimation = enter === 'plain' ? undefined : presentation(enter, linearTiming({durationInFrames: enterFrames}), 'enter');
  const exitAnimation = exit === 'plain' ? undefined : presentation(exit, linearTiming({durationInFrames: exitFrames}), 'exit');
  return (
    <AbsoluteFill style={{backgroundColor: '#ffffff', color: '#000000'}}>
      {lines.map((line, i) => {
        const data = fontUrl ? {...line, fontUrl} : line;
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
              line={data}
              fontSize={resolvedFontSize}
              lineHeight={resolvedLineHeight}
              enter={enterAnimation}
              exit={exitAnimation}
              activeWordId={activeWordId}
              activeWordStyle={{color: '#b30000'}}
              wordStyle={wordStyle}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

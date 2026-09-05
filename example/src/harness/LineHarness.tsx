// Test harness composition: explicit lines, one entrance for all of them, and font-source knobs.
// Used by the <Player> page (test/browser) and the render suite (test/render) of the package.
import * as React from 'react';
import {AbsoluteFill, Sequence, staticFile, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {linearTiming, type TransitionTiming} from '@remotion/transitions';
import {dissolve} from '@remotion/transitions/dissolve';
import {fade} from '@remotion/transitions/fade';
import {none} from '@remotion/transitions/none';
import {slide} from '@remotion/transitions/slide';
import {MushafLine, type MushafLineAnimation, type MushafLineData} from 'remotion-mushaf-line-renderer';
import {revealRtl} from 'remotion-mushaf-line-renderer/presentations/reveal-rtl';

export type EnterName = 'plain' | 'none' | 'fade' | 'slide' | 'reveal' | 'dissolve';

export type LineHarnessProps = {
  lines: MushafLineData[];
  /** 'plain' passes no `enter`; 'dissolve' is a canvas presentation and must be rejected. */
  enter: EnterName;
  enterFrames: number;
  /** <Sequence from> for every line. */
  from: number;
  premountFor: number;
  /** Font from the public folder (render tests), pinned via staticFile() in calculateMetadata. */
  fontFile: string | null;
  /** Font URL pinned as-is (Player page, failure scenarios). Wins over fontFile. */
  fontUrl: string | null;
  fontSize: number | null;
  lineHeight: number | null;
};

export const defaultLineHarnessProps: LineHarnessProps = {
  lines: [],
  enter: 'plain',
  enterFrames: 20,
  from: 0,
  premountFor: 0,
  fontFile: null,
  fontUrl: null,
  fontSize: null,
  lineHeight: null,
};

export const calculateLineHarnessMetadata: CalculateMetadataFunction<LineHarnessProps> = ({props}) => {
  const fontUrl = props.fontUrl ?? (props.fontFile ? staticFile(props.fontFile) : null);
  return {props: {...props, fontUrl, fontFile: null}};
};

const presentation = (name: Exclude<EnterName, 'plain'>, timing: TransitionTiming): MushafLineAnimation => {
  switch (name) {
    case 'none':
      return {presentation: none(), timing};
    case 'fade':
      return {presentation: fade(), timing};
    case 'slide':
      return {presentation: slide({direction: 'from-right'}), timing};
    case 'reveal':
      return {presentation: revealRtl(), timing};
    case 'dissolve':
      return {presentation: dissolve({}), timing};
  }
};

export const LineHarness: React.FC<LineHarnessProps> = ({lines, enter, enterFrames, from, premountFor, fontUrl, fontSize, lineHeight}) => {
  const {width} = useVideoConfig();
  const resolvedFontSize = fontSize ?? Math.floor((width * 2500) / 42501);
  const resolvedLineHeight = lineHeight ?? Math.round(2.2 * resolvedFontSize);
  const timing = linearTiming({durationInFrames: enterFrames});
  const animation = enter === 'plain' ? undefined : presentation(enter, timing);
  return (
    <AbsoluteFill style={{backgroundColor: '#ffffff', color: '#000000'}}>
      {lines.map((line, i) => {
        const data = fontUrl ? {...line, fontUrl} : line;
        return (
          <Sequence key={`${line.mushaf}/${line.page}/${line.line}`} from={from} premountFor={premountFor} name={`p${line.page} l${line.line}`} style={{top: i * resolvedLineHeight, height: resolvedLineHeight}}>
            <MushafLine line={data} fontSize={resolvedFontSize} lineHeight={resolvedLineHeight} enter={animation} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

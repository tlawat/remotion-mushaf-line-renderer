// Compile-only assertions (tsc --noEmit -p tsconfig.test-types.json): stock @remotion/transitions
// presentations pass to `enter` unchanged, and the props surface is exactly the documented one.
import React from 'react';
import {linearTiming, pushCut, springTiming} from '@remotion/transitions';
import {clockWipe} from '@remotion/transitions/clock-wipe';
import {fade} from '@remotion/transitions/fade';
import {flip} from '@remotion/transitions/flip';
import {iris} from '@remotion/transitions/iris';
import {none} from '@remotion/transitions/none';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {MushafLine, type MushafId, type MushafLineAnimation, type MushafLineData} from '../../src';
import {revealRtl} from '../../src/presentations/reveal-rtl';

declare const data: MushafLineData;
const timing = linearTiming({durationInFrames: 10});

export const animations: MushafLineAnimation[] = [
  {presentation: fade(), timing},
  {presentation: slide({direction: 'from-right'}), timing: springTiming({config: {damping: 200}, durationInFrames: 25})},
  {presentation: wipe(), timing},
  {presentation: flip(), timing},
  {presentation: clockWipe({width: 1920, height: 246}), timing},
  {presentation: iris({width: 1920, height: 246}), timing},
  {presentation: pushCut(), timing},
  {presentation: none(), timing},
  {presentation: revealRtl(), timing},
  {presentation: revealRtl({enterStyle: {opacity: 0.9}}), timing},
];

// @ts-expect-error a string is not a presentation
export const badPresentation: MushafLineAnimation = {presentation: 'fade', timing};
// @ts-expect-error timing is required
export const missingTiming: MushafLineAnimation = {presentation: fade()};

export const ok = (
  <>
    <MushafLine line={data} />
    <MushafLine line={data} enter={{presentation: fade(), timing}} fontSize={112} lineHeight={246} style={{top: 10}} className="x" name="p10 l3" />
    <MushafLine mushaf="qpc-v4" page={10} line={3} />
    <MushafLine mushaf="qpc-v4-tajweed" page={10} line={3} enter={{presentation: revealRtl(), timing}} />
  </>
);

// @ts-expect-error no layout prop (the root is a normal-flow block)
export const noLayout = <MushafLine line={data} layout="none" />;
// @ts-expect-error line must be data or a number
export const badLine = <MushafLine mushaf="qpc-v4" page={10} line="3" />;
// @ts-expect-error unknown mushaf id
export const badMushaf = <MushafLine mushaf="qpc-v9" page={10} line={3} />;
// @ts-expect-error no start-time prop: timing comes from <Sequence from>
export const noFrom = <MushafLine line={data} from={30} />;

export const ids: MushafId[] = ['qpc-v4', 'qpc-v4-tajweed'];
// @ts-expect-error not a registered mushaf
export const badId: MushafId = 'qpc-v2';

// Data is plain JSON.
type Json = string | number | boolean | null | readonly Json[] | {readonly [k: string]: Json};
type IsJson<T> = T extends Json ? true : false;
export const jsonCheck: IsJson<MushafLineData> = true;

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
import {
  MushafLine,
  enterTiming,
  exitTiming,
  fontSizeForWidth,
  getMushafLine,
  getMushafLines,
  getMushafLocation,
  lineAyahs,
  lineHeightForFontSize,
  springyTiming,
  type MushafId,
  type MushafLineAnimation,
  type MushafLineData,
  type MushafWord,
} from '../../src';
import {revealRtl} from '../../src/presentations/reveal-rtl';
import {slideFade} from '../../src/presentations/slide-fade';

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
// `timing` is optional now: it defaults to enterTiming() / exitTiming().
export const defaultedTiming: MushafLineAnimation = {presentation: fade()};

// The package's own timings are ordinary TransitionTimings.
export const timings: MushafLineAnimation[] = [
  {presentation: slideFade(), timing: enterTiming()},
  {presentation: slideFade({direction: 'down', distance: 20}), timing: exitTiming({seconds: 0.4})},
  {presentation: revealRtl({softness: 8}), timing: springyTiming({config: {damping: 200}})},
  {presentation: fade(), timing: enterTiming({durationInFrames: 12, easing: (t) => t})},
];
// @ts-expect-error seconds must be a number
export const badTiming = enterTiming({seconds: '1'});

export const ok = (
  <>
    <MushafLine line={data} />
    <MushafLine line={data} enter={{presentation: fade(), timing}} fontSize={112} lineHeight={246} style={{top: 10}} className="x" name="p10 l3" />
    <MushafLine mushaf="qpc-v4" page={10} line={3} />
    <MushafLine mushaf="qpc-v4-tajweed" page={10} line={3} enter={{presentation: revealRtl(), timing}} />
    {/* mushaf is optional (plain by default) and tajweed picks the colour font */}
    <MushafLine page={10} line={3} />
    <MushafLine page={10} line={3} tajweed />
    <MushafLine page={10} line={3} mushaf="qpc-v4" tajweed={false} />
    {/* mandala: the colour font at palette 3 (CSS-coloured text, coloured ayah rosettes) */}
    <MushafLine page={10} line={3} mandala />
    <MushafLine page={10} line={3} mandala={false} tajweed />
    <MushafLine page={10} line={3} mandala={{ink: 'crimson'}} />
    <MushafLine page={10} line={3} mandala={{accent: '#c8a45c', detail: '#0aa', background: 'transparent'}} />
    {/* a bare presentation uses the package's default timing */}
    <MushafLine line={data} enter={slideFade()} exit={slideFade()} />
    <MushafLine line={data} enter={fade()} />
    {/* per-word hooks */}
    <MushafLine
      line={data}
      activeWordId="9:1:3"
      activeWordStyle={{color: 'crimson'}}
      wordStyle={(word: MushafWord, ctx) => (ctx.active ? {opacity: 1} : {opacity: word.ayah === 1 ? 1 : 0.4})}
      wordClassName={(word) => `w-${word.wordId}`}
    />
    <MushafLine line={data} activeWordId={42} />
    {/* fit */}
    <MushafLine line={data} fit="line" />
    <MushafLine line={data} fit="mushaf" fontSize={112} />
    <MushafLine line={data} activeWordId={null} />
  </>
);

// @ts-expect-error resolved data carries its own font set
export const tajweedWithData = <MushafLine line={data} tajweed />;
// @ts-expect-error ... and its own palette
export const mandalaWithData = <MushafLine line={data} mandala />;
// @ts-expect-error only the parts the font paints can be coloured
export const badPart = <MushafLine page={10} line={3} mandala={{glow: 'red'}} />;
// @ts-expect-error only 'line' and 'mushaf' fit the line
export const badFit = <MushafLine line={data} fit="stretch" />;
// @ts-expect-error wordStyle must return CSS properties
export const badWordStyle = <MushafLine line={data} wordStyle={() => 'red'} />;

// Data helpers: `mushaf` is optional everywhere, and the two shapes of getMushafLines are exclusive.
export const helpers = [
  getMushafLine({page: 187, line: 2}),
  getMushafLine({mushaf: 'qpc-v4', page: 187, line: 2, tajweed: true}),
  getMushafLine({page: 187, line: 2, mandala: true}),
  getMushafLine({page: 187, line: 2, mandala: {ink: 'currentColor', accent: '#0aa'}}),
  getMushafLines({surah: 9, mandala: true}),
  getMushafLines({surah: 9, mandala: {accent: 'crimson'}}),
  getMushafLines({page: 187}),
  getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, tajweed: true, fontUrl: (page, mushaf) => `/fonts/${mushaf}/p${page}.woff2`}),
  getMushafLocation({surah: 9}).then(({page, line}) => page + line),
];
// @ts-expect-error a page and an ayah range are two different questions
export const bothShapes = getMushafLines({page: 187, surah: 9});
// @ts-expect-error one of them is required
export const neitherShape = getMushafLines({tajweed: true});

export const ayahs: number[] = lineAyahs(data);
export const sizes: number[] = [fontSizeForWidth(1920), fontSizeForWidth(1680, 'qpc-v4-tajweed'), lineHeightForFontSize(112)];

// `exit` takes the same shape as `enter`.
export const okExit = (
  <>
    <MushafLine line={data} exit={{presentation: fade({shouldFadeOutExitingScene: true}), timing}} />
    <MushafLine line={data} enter={{presentation: fade(), timing}} exit={{presentation: slide({direction: 'from-right'}), timing}} />
    <MushafLine mushaf="qpc-v4-tajweed" page={10} line={3} exit={{presentation: revealRtl(), timing}} />
  </>
);
// @ts-expect-error a string is not a presentation
export const badExit = <MushafLine line={data} exit={{presentation: 'fade', timing}} />;

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

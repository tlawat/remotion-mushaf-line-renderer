// Compile-only assertions (tsc --noEmit -p tsconfig.test-types.json): stock @remotion/transitions
// presentations pass to `enter` unchanged, and the props surface is exactly the documented one.
import {linearTiming, pushCut, springTiming} from '@remotion/transitions';
import {clockWipe} from '@remotion/transitions/clock-wipe';
import {fade} from '@remotion/transitions/fade';
import {flip} from '@remotion/transitions/flip';
import {iris} from '@remotion/transitions/iris';
import {none} from '@remotion/transitions/none';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {
  enterTiming,
  exitTiming,
  fontSizeForWidth,
  getMushafFontFile,
  getMushafLine,
  getMushafLines,
  getMushafLocation,
  lineAyahs,
  lineHeightForFontSize,
  loadPageFont,
  MUSHAF_THEME_NAMES,
  MUSHAF_THEMES,
  type MushafDataSource,
  type MushafFontFallback,
  type MushafFontPackage,
  type MushafFontSet,
  type MushafFontSrc,
  type MushafId,
  MushafLine,
  type MushafLineAnimation,
  type MushafLineData,
  type MushafTheme,
  type MushafThemeName,
  type MushafThemeSelection,
  type MushafWord,
  revealRtl,
  sliceWords,
  slideFade,
  springyTiming,
} from '../../src';

declare const data: MushafLineData;
const timing = linearTiming({durationInFrames: 10});

export const animations: MushafLineAnimation[] = [
  {presentation: fade(), timing},
  {
    presentation: slide({direction: 'from-right'}),
    timing: springTiming({config: {damping: 200}, durationInFrames: 25}),
  },
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
// `timing` is optional: it defaults to enterTiming() / exitTiming().
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
    <MushafLine
      line={data}
      enter={{presentation: fade(), timing}}
      fontSize={112}
      lineHeight={246}
      style={{top: 10}}
      className="x"
      name="p10 l3"
    />
    {/* convenience form: everything about the selection is optional (plain V4 by default) */}
    <MushafLine page={10} line={3} />
    <MushafLine mushaf="qpc-v4" page={10} line={3} />
    <MushafLine page={10} line={3} theme="light" enter={{presentation: revealRtl(), timing}} />
    <MushafLine page={10} line={3} theme="normal" />
    <MushafLine page={10} line={3} theme="black" />
    <MushafLine page={10} line={3} theme="p4" />
    <MushafLine page={10} line={3} theme={{base: 'normal', colors: {ink: 'crimson'}}} />
    <MushafLine
      page={10}
      line={3}
      theme={{base: 3, colors: {accent: '#c8a45c', detail: '#0aa', background: 'transparent', '7': 'navy'}}}
    />
    <MushafLine page={10} line={3} theme={{base: 'black', marker: {frame: '#333'}}} />
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
    {/* slice: one ayah, a range, open-ended, on either form, and null to cancel the data's slice */}
    <MushafLine line={data} slice={{ayah: 5}} />
    <MushafLine line={data} slice={{fromAyah: 5, toAyah: 7}} />
    <MushafLine line={data} slice={{fromAyah: 5}} />
    <MushafLine page={187} line={2} slice={{ayah: 1}} />
    <MushafLine line={data} slice={null} />
    {/* fit */}
    <MushafLine line={data} fit="line" />
    <MushafLine line={data} fit="mushaf" fontSize={112} />
    <MushafLine line={data} activeWordId={null} />
    {/* data source: either export, both, or none (QUL's CDN) — on the convenience form only */}
    <MushafLine
      page={10}
      line={3}
      data={{words: '/data/qpc-v4/words.json.zip', layout: '/data/qpc-v4/layout.db.zip'}}
    />
    <MushafLine page={10} line={3} theme="light" data={{layout: 'https://mirror.example/layout.db.zip'}} />
    <MushafLine page={10} line={3} data={{}} />
  </>
);

// @ts-expect-error resolved data is already loaded; `data` goes to getMushafLine()
export const dataWithData = <MushafLine line={data} data={{words: '/x'}} />;
// @ts-expect-error a source is a URL
export const badDataUrl = <MushafLine page={10} line={3} data={{words: 42}} />;
// @ts-expect-error only the two exports have a source
export const badDataKey = <MushafLine page={10} line={3} data={{fonts: '/x'}} />;
export const source: MushafDataSource = {words: '/data/qpc-v4/words.json.zip'};
// @ts-expect-error a slice is one ayah or a range, not both
export const bothSliceShapes = <MushafLine line={data} slice={{ayah: 5, fromAyah: 2}} />;
// @ts-expect-error a range starts somewhere
export const openStart = <MushafLine line={data} slice={{toAyah: 7}} />;
// @ts-expect-error no ayah list: a line's ayahs are contiguous, so a range says the same thing
export const ayahList = <MushafLine line={data} slice={{ayahs: [5, 6]}} />;
export const sliced: readonly MushafWord[] = sliceWords(data, {ayah: 5});
export const ownSlice: readonly MushafWord[] = sliceWords(data);

// @ts-expect-error resolved data carries its own theme
export const themeWithData = <MushafLine line={data} theme="light" />;
// @ts-expect-error ... and its own mushaf
export const mushafWithData = <MushafLine line={data} mushaf="qpc-v4" />;
// @ts-expect-error only the parts the font paints (or numeric entries) can be coloured
export const badPart = <MushafLine page={10} line={3} theme={{base: 3, colors: {glow: 'red'}}} />;
// @ts-expect-error not a preset
export const badTheme = <MushafLine page={10} line={3} theme="neon" />;
// @ts-expect-error a theme needs a base
export const noBase = <MushafLine page={10} line={3} theme={{colors: {ink: 'red'}}} />;
// @ts-expect-error only 'line' and 'mushaf' fit the line
export const badFit = <MushafLine line={data} fit="stretch" />;
// Font sources: a fonts package (the shape its default export has), a resolver, or 'cdn'.
export const fontsPackage: MushafFontPackage = {
  kind: 'remotion-mushaf-fonts',
  schema: 1,
  name: '@tlawat/mushaf-fonts-qpc-v4-tajweed',
  version: '1.20260912.0',
  mushaf: 'qpc-v4',
  fontSet: 'qpc-v4-tajweed',
  snapshot: '2026-09-12',
  files: {10: {url: '/p10.woff2', bytes: 1, sha256: '0'.repeat(64)}},
};
export const sources: MushafFontSrc[] = ['cdn', fontsPackage, (f) => [`/a/${f.fileName}`, f.cdnUrl]];
export const fallbacks: MushafFontFallback[] = [fontsPackage, [fontsPackage, fontsPackage]];
export const withFallback = <MushafLine line={data} fontFallback={fontsPackage} />;
export const packageOnly = <MushafLine line={data} fontSrc={fontsPackage} />;
export const ownUrls = (
  <MushafLine page={10} line={3} theme="light" fontSrc={(f) => `/fonts/${f.fontSet}/${f.fileName}`} />
);
// @ts-expect-error a bare URL is not a source: pass () => url
export const bareUrl = <MushafLine line={data} fontSrc="/p10.woff2" />;
// @ts-expect-error a fallback is a fonts package, not a URL
export const urlFallback = <MushafLine line={data} fontFallback="/p10.woff2" />;

// @ts-expect-error wordStyle must return CSS properties
export const badWordStyle = <MushafLine line={data} wordStyle={() => 'red'} />;

// Data helpers: the selection is optional everywhere, and the two shapes of getMushafLines are exclusive.
export const helpers = [
  getMushafLine({page: 187, line: 2}),
  getMushafLine({mushaf: 'qpc-v4', page: 187, line: 2, theme: 'light'}),
  getMushafLine({page: 187, line: 2, theme: 'normal'}),
  getMushafLine({page: 187, line: 2, theme: {base: 'normal', colors: {ink: 'currentColor', accent: '#0aa'}}}),
  getMushafLines({surah: 9, theme: 'sepia'}),
  getMushafLines({surah: 9, theme: {base: 5, colors: {accent: 'crimson'}}}),
  getMushafLines({page: 187}),
  getMushafLines({
    surah: 9,
    fromAyah: 1,
    toAyah: 11,
    theme: 'light',
  }),
  getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, slice: true}),
  getMushafLocation({surah: 9}).then(({page, line}) => page + line),
  // The data source goes with every helper.
  getMushafLine({
    page: 187,
    line: 2,
    data: {words: '/data/qpc-v4/words.json.zip', layout: '/data/qpc-v4/layout.db.zip'},
  }),
  getMushafLines({page: 187, data: {layout: 'https://mirror.example/layout.db.zip'}}),
  getMushafLines({surah: 9, slice: true, data: {}}),
  getMushafLocation({surah: 9, data: {words: '/w'}}).then(({page}) => page),
  loadPageFont({page: 10}).waitUntilDone(),
  loadPageFont({theme: 'light', page: 10, fontSrc: (f) => `/fonts/${f.fontSet}/${f.fileName}`}).fontFamily,
  loadPageFont({theme: 'light', page: 10, fallback: fontsPackage}).origin(),
  getMushafFontFile({theme: 'light', page: 328}).fileName,
];
// @ts-expect-error `url` was removed: use fontSrc
export const loadWithUrl = loadPageFont({page: 10, url: '/p10.woff2'});
// @ts-expect-error `fontUrl` was removed from getMushafLines
export const pinnedLines = getMushafLines({page: 10, fontUrl: () => '/p10.woff2'});
// @ts-expect-error a page and an ayah range are two different questions
export const bothShapes = getMushafLines({page: 187, surah: 9});
// @ts-expect-error one of them is required
export const neitherShape = getMushafLines({theme: 'light'});
// @ts-expect-error a page has no ayah range to slice to
export const pageSlice = getMushafLines({page: 187, slice: true});

export const ayahs: number[] = lineAyahs(data);
export const sizes: number[] = [fontSizeForWidth(1920), fontSizeForWidth(1680, 'qpc-v4'), lineHeightForFontSize(112)];

// `exit` takes the same shape as `enter`.
export const okExit = (
  <>
    <MushafLine line={data} exit={{presentation: fade({shouldFadeOutExitingScene: true}), timing}} />
    <MushafLine
      line={data}
      enter={{presentation: fade(), timing}}
      exit={{presentation: slide({direction: 'from-right'}), timing}}
    />
    <MushafLine page={10} line={3} theme="light" exit={{presentation: revealRtl(), timing}} />
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

export const ids: MushafId[] = ['qpc-v4'];
// @ts-expect-error a font set is not a mushaf id
export const badId: MushafId = 'qpc-v4-tajweed';
export const names: MushafThemeName[] = [...MUSHAF_THEME_NAMES];
export const selections: MushafThemeSelection[] = ['plain', 'light', MUSHAF_THEMES.normal, {base: 2}];
export const custom: MushafTheme = {base: 'dark', colors: {silent: '#888', '15': '#999'}, marker: {frame: 'white'}};
// @ts-expect-error a theme is a name or a theme object, never an old look
export const badSelection: MushafThemeSelection = 'tajweed';
export const fontSets: MushafFontSet[] = ['qpc-v4', 'qpc-v4-tajweed'];

// Data is plain JSON (optional keys are allowed: JSON.stringify drops them).
type Json = string | number | boolean | null | readonly Json[] | {readonly [k: string]: Json | undefined};
type IsJson<T> = T extends Json ? true : false;
export const jsonCheck: IsJson<MushafLineData> = true;

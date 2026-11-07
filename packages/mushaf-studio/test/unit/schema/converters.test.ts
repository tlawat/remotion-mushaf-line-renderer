// The schema's converters: pure functions from the Props sidebar's values to the package's vocabulary.
import {fade} from '@remotion/transitions/fade';
import {
  enterTiming,
  exitTiming,
  fadeRise,
  type MushafFontPackage,
  type MushafLineAnimation,
  type WordContext,
} from '@tlawat/remotion-mushaf-line';
import {afterEach, describe, expect, it} from 'vitest';
import {syntheticLine} from '../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import {defaultMushafPassageProps, mushafPassageSchema, passageDuration} from '../../../src/compositions/passage';
import {
  defaultMushafRecitationProps,
  mushafRecitationSchema,
  recitationDuration,
} from '../../../src/compositions/recitation';
import {registerMushafFonts} from '../../../src/fonts';
import * as schema from '../../../src/schema';
import {
  activeWordStyleFrom,
  animationFrom,
  dataSchema,
  dataSourceFrom,
  defaultCustomTheme,
  defaultHighlight,
  defaultLayout,
  defaultReview,
  defaultText,
  effectiveNeighbourOpacity,
  effectiveRestOpacity,
  fontPropsFrom,
  type Highlight,
  inkTintFor,
  markerIds,
  riseDistance,
  SINE,
  SOFT,
  scrollTimingFrom,
  sizeForAspect,
  themeSelectionFrom,
  tintPath,
  type WashCap,
  washColor,
  washStyle,
  wordStyleFrom,
} from '../../../src/schema';
import {withAlpha} from '../../../src/schema/highlight';

const staticFile = (path: string) => `/static/${path}`;
const fps = 30;
const framesOf = (animation: MushafLineAnimation | undefined) => animation?.timing?.getDurationInFrames({fps});
const asAnimation = (value: unknown) => value as MushafLineAnimation | undefined;

describe('dataSchema / dataSourceFrom', () => {
  it('is cdn or mirror, mirror by default in both compositions', () => {
    expect(dataSchema.options).toEqual(['cdn', 'mirror']);
    expect(mushafRecitationSchema.parse(defaultMushafRecitationProps).data).toBe('mirror');
    expect(mushafPassageSchema.parse(defaultMushafPassageProps).data).toBe('mirror');
    expect(mushafRecitationSchema.parse({...defaultMushafRecitationProps, data: 'cdn'}).data).toBe('cdn');
    expect(() => mushafRecitationSchema.parse({...defaultMushafRecitationProps, data: 'local'})).toThrow();
  });

  it('is undefined for the CDN and the two mirror files through staticFile() otherwise', () => {
    expect(dataSourceFrom('cdn', staticFile)).toBeUndefined();
    expect(dataSourceFrom('mirror', staticFile)).toEqual({
      words: '/static/data/qpc-v4/words.json.zip',
      layout: '/static/data/qpc-v4/layout.db.zip',
    });
  });
});

describe('animationFrom', () => {
  it('dissolves on both sides for fade, on the package default lengths and the calm curves', () => {
    const faded = animationFrom({lines: 'fade'});
    expect(asAnimation(faded.enter)?.presentation.component).toBe(fade().component);
    expect(asAnimation(faded.enter)?.presentation.props).toEqual({});
    // fade() keeps the exiting side visible unless told otherwise.
    expect(asAnimation(faded.exit)?.presentation.props).toEqual({shouldFadeOutExitingScene: true});
    expect([framesOf(asAnimation(faded.enter)), framesOf(asAnimation(faded.exit))]).toEqual([
      enterTiming().getDurationInFrames({fps}),
      exitTiming().getDurationInFrames({fps}),
    ]);
    // In on SOFT, out on SINE: half way through the entrance is SOFT(0.5).
    expect(asAnimation(faded.enter)?.timing?.getProgress({frame: 7.5, fps})).toBeCloseTo(SOFT(0.5), 6);
    expect(asAnimation(faded.exit)?.timing?.getProgress({frame: 5, fps})).toBeCloseTo(SINE(0.5), 6);
  });

  it('rises the entering line a few px on a linear timing for rise, and leaves it unmoved', () => {
    const rise = animationFrom({lines: 'rise'}, {fontSize: 90});
    expect(asAnimation(rise.enter)?.presentation.component).toBe(fadeRise({distance: 1}).component);
    expect(asAnimation(rise.enter)?.presentation.props).toEqual({distance: 11});
    // fadeRise() has its own curves: the timing is linear, so nothing eases twice.
    expect(asAnimation(rise.enter)?.timing?.getProgress({frame: 7.5, fps})).toBeCloseTo(0.5, 6);
    expect(asAnimation(rise.exit)?.presentation.component).toBe(fade().component);
    expect(riseDistance(52)).toBe(6);
    expect(riseDistance(200)).toBe(12);
  });

  it('has neither side for cut, so the result spreads into the component', () => {
    expect(animationFrom({lines: 'cut'})).toEqual({});
  });
});

describe('scrollTimingFrom', () => {
  it('is the calm scroll: 24 frames on INOUT, 34 slow, no lurch and no overshoot', () => {
    const calm = scrollTimingFrom();
    expect(calm.getDurationInFrames({fps})).toBe(24);
    expect(scrollTimingFrom('slow').getDurationInFrames({fps})).toBe(34);
    expect(calm.getProgress({frame: 0, fps})).toBe(0);
    expect(calm.getProgress({frame: 1, fps})).toBeCloseTo(0.003, 3);
    expect(calm.getProgress({frame: 12, fps})).toBeCloseTo(0.5, 2);
    expect(calm.getProgress({frame: 24, fps})).toBe(1);
    expect(calm.getProgress({frame: 40, fps})).toBe(1);
  });
});

const fakePackage = (fontSet: MushafFontPackage['fontSet']): MushafFontPackage => ({
  kind: 'remotion-mushaf-fonts',
  schema: 1,
  name: `@tlawat/mushaf-fonts-${fontSet}`,
  version: '1.0.0',
  mushaf: 'qpc-v4',
  fontSet,
  snapshot: '2026-01-01',
  files: {},
});
const plain = fakePackage('qpc-v4');
const tajweed = fakePackage('qpc-v4-tajweed');
const pageFile = {
  kind: 'page',
  mushaf: 'qpc-v4',
  fontSet: 'qpc-v4',
  page: 1,
  format: 'woff2',
  id: 'p1',
  fileName: 'p1.woff2',
  cdnUrl: 'x',
} as const;
const sharedFile = {
  kind: 'shared',
  mushaf: 'qpc-v4',
  font: 'surah-names-v4',
  format: 'woff2',
  id: 'surah-names-v4',
  fileName: 'surah_names.woff2',
  cdnUrl: 'x',
} as const;

describe('fontPropsFrom', () => {
  afterEach(() => registerMushafFonts({}));

  it('gives the CDN nothing, the fallback the registered package of the line font set', () => {
    expect(fontPropsFrom('cdn', 'qpc-v4', staticFile, {plain, tajweed})).toEqual({props: {}, warning: null});
    expect(fontPropsFrom('fallback', 'qpc-v4', staticFile, {plain, tajweed})).toEqual({
      props: {fontFallback: plain},
      warning: null,
    });
    expect(fontPropsFrom('fallback', 'qpc-v4-tajweed', staticFile, {plain, tajweed}).props).toEqual({
      fontFallback: tajweed,
    });
    // Picked by the package's own fontSet, not by the slot it was registered in.
    expect(fontPropsFrom('fallback', 'qpc-v4-tajweed', staticFile, {plain: tajweed}).props).toEqual({
      fontFallback: tajweed,
    });
  });

  it('serves pages from the package and the shared fonts from public/ in package mode', () => {
    const {props, warning} = fontPropsFrom('package', 'qpc-v4-tajweed', staticFile, {plain, tajweed});
    expect(warning).toBeNull();
    expect(props.fontFallback).toBeUndefined();
    const resolver = props.fontSrc as (file: unknown) => unknown;
    expect(resolver(pageFile)).toBe(tajweed);
    expect(resolver(sharedFile)).toBe('/static/fonts/surah-names-v4/surah_names.woff2');
  });

  it('degrades to the CDN with a warning when the package is not registered', () => {
    for (const mode of ['fallback', 'package'] as const) {
      const {props, warning} = fontPropsFrom(mode, 'qpc-v4-tajweed', staticFile, {plain});
      expect(props).toEqual({});
      expect(warning).toContain(`fonts is "${mode}"`);
      expect(warning).toContain('qpc-v4-tajweed');
      expect(warning).toContain('registerMushafFonts');
    }
    expect(fontPropsFrom('fallback', 'qpc-v4', staticFile, {}).warning).toContain('@tlawat/mushaf-fonts-qpc-v4');
  });

  it('reads the registration by default', () => {
    expect(fontPropsFrom('fallback', 'qpc-v4', staticFile).warning).not.toBeNull();
    registerMushafFonts({plain});
    expect(fontPropsFrom('fallback', 'qpc-v4', staticFile)).toEqual({props: {fontFallback: plain}, warning: null});
  });
});

describe('withAlpha / activeWordStyleFrom', () => {
  it('scales the colour own alpha, for every form zColor() accepts', () => {
    expect(withAlpha('#c8a45c', 0.35)).toBe('rgba(200, 164, 92, 0.35)');
    expect(withAlpha('#c8a45c80', 0.5)).toBe('rgba(200, 164, 92, 0.251)');
    expect(withAlpha('rgba(27, 111, 63, 1)', 1)).toBe('rgba(27, 111, 63, 1)');
    expect(withAlpha('crimson', 0.35)).toBe('rgba(220, 20, 60, 0.35)');
    expect(withAlpha('transparent', 0.35)).toBe('rgba(0, 0, 0, 0)');
    // Something Remotion cannot read is left to CSS.
    expect(withAlpha('var(--ink)', 0.35)).toBe('color-mix(in srgb, var(--ink) 35%, transparent)');
  });

  it("is the schema module's own, not part of its index", () => {
    expect('withAlpha' in schema).toBe(false);
  });

  it('migrates its argument and gives the mark at full emphasis: none for ink, the legible tint, a lone wash', () => {
    const color = '#c8a45c';
    expect(activeWordStyleFrom({style: 'ink', color})).toBeUndefined();
    expect(activeWordStyleFrom({style: 'tint', color})).toEqual({color: '#816321'});
    // The old styles: a colour or a glow is a tint now, a marker a wash, none nothing.
    expect(activeWordStyleFrom({style: 'color', color})).toEqual({color: '#816321'});
    expect(activeWordStyleFrom({style: 'glow', color})).toEqual({color: '#816321'});
    expect(activeWordStyleFrom({style: 'marker', color})).toEqual(
      washStyle({color: washColor(color, 0.1), cap: 'both'}),
    );
    expect(activeWordStyleFrom({style: 'none', color})).toBeUndefined();
    // On a dark ground the tint is lightened instead.
    expect(activeWordStyleFrom({style: 'tint', color: '#b8913a'}, '#121416')).toEqual({color: '#b19353'});
  });
});

describe('tintPath / effectiveRestOpacity / effectiveNeighbourOpacity / inkTintFor', () => {
  it('paints a tint in CSS under plain, as a wash on tajweed colours, else through the line palettes', () => {
    expect(tintPath('plain')).toBe('css');
    // normal follows the text colour only as its palette rule resolves it: a word's color cannot reach it.
    expect(tintPath('normal')).toBe('palette');
    expect(tintPath(themeSelectionFrom('custom', defaultCustomTheme))).toBe('palette');
    for (const theme of ['light', 'dark', 'sepia', 'p1', 'p2'] as const) expect(tintPath(theme), theme).toBe('wash');
    for (const theme of ['black', 'p3', 'p4', 'p5'] as const) expect(tintPath(theme), theme).toBe('palette');
    const ownInk = {...defaultCustomTheme, override: {...defaultCustomTheme.override, ink: true}};
    expect(tintPath(themeSelectionFrom('custom', ownInk))).toBe('palette');
  });

  it('raises the rest to 0.65 on tajweed themes, and keeps the neighbours 0.2 under it under ink', () => {
    const ink = {...defaultHighlight, restOpacity: 0.5};
    expect(effectiveRestOpacity(ink, 'plain')).toBe(0.5);
    expect(effectiveRestOpacity(ink, 'light')).toBe(0.65);
    expect(effectiveRestOpacity({restOpacity: 0.8}, 'light')).toBe(0.8);
    expect(effectiveNeighbourOpacity(0.45, ink, 'plain')).toBe(0.3);
    expect(effectiveNeighbourOpacity(0.45, ink, 'light')).toBe(0.45);
    expect(effectiveNeighbourOpacity(0.3, defaultHighlight, 'plain')).toBe(0.3);
    expect(effectiveNeighbourOpacity(0.45, {...ink, style: 'wash'}, 'plain')).toBe(0.45);
    expect(effectiveNeighbourOpacity(0.45, {...ink, mode: 'none'}, 'plain')).toBe(0.45);
  });

  it('gives a line its inkTint only for a tint painted through palettes', () => {
    const tint = {...defaultHighlight, style: 'tint' as const};
    expect(inkTintFor(tint, 'black', '#121416')).toBe('#b19353');
    expect(inkTintFor(tint, themeSelectionFrom('custom', defaultCustomTheme), '#f8f3e6')).toBe('#806321');
    expect(inkTintFor(tint, 'plain', '#f8f3e6')).toBeUndefined();
    expect(inkTintFor(tint, 'light', '#f8f3e6')).toBeUndefined();
    expect(inkTintFor(defaultHighlight, 'black', '#121416')).toBeUndefined();
    expect(inkTintFor({...tint, mode: 'none'}, 'black', '#121416')).toBeUndefined();
  });
});

describe('wordStyleFrom', () => {
  // p1l2 of the synthetic mushaf: 1:1:1, 1:1:2, 1:1:3 (end); p1l3: 1:2:1, 1:2:2 (end).
  const line = syntheticLine(1, 2);
  const other = syntheticLine(1, 3);
  const [w1, w2, w3] = line.words as [
    (typeof line.words)[number],
    (typeof line.words)[number],
    (typeof line.words)[number],
  ];
  const w4 = other.words[0]!;
  const timings = {
    version: 1 as const,
    surah: 1,
    ayat: [
      {
        ayah: 1,
        start: 0,
        end: 3,
        words: [
          {id: '1:1:1', start: 0, end: 1},
          {id: '1:1:2', start: 1, end: 2},
          {id: '1:1:3', start: 2, end: 3},
        ],
      },
      {
        ayah: 2,
        start: 4,
        end: 6,
        words: [
          {id: '1:2:1', start: 4, end: 5},
          {id: '1:2:2', start: 5, end: 6},
        ],
      },
    ],
  };
  const timingsIndex = {'1:1:1': 0, '1:1:2': 1, '1:1:3': 2, '1:2:1': 4};
  const ctx = (frame: number, changes: Partial<WordContext> = {}): WordContext => ({
    line,
    frame,
    fps,
    active: false,
    inSlice: true,
    linePosition: 0,
    ...changes,
  });
  const base = {review: defaultReview, doubtful: {}, timingsIndex, timings, isStudio: false};
  const highlight = (changes: Partial<Highlight>): Highlight => ({...defaultHighlight, ...changes});
  const ink = '#1c1a16';

  it('ink: rests the words still to come at restOpacity and fills each in as it is heard', () => {
    const style = wordStyleFrom({...base, highlight: highlight({})});
    // 1.5 s: 1:1:1 and 1:1:2 are heard, 1:1:3 (2 s) and the next ayah are still to come.
    expect(style(w1, ctx(45))).toBeUndefined();
    expect(style(w2, ctx(45))).toBeUndefined();
    expect(style(w3, ctx(45))).toEqual({opacity: 0.6});
    expect(style(w4, ctx(45))).toEqual({opacity: 0.6});
    // The fill over 6 frames from the word's start, on SOFT.
    expect(style(w3, ctx(61))).toEqual({opacity: Math.round((0.6 + 0.4 * SOFT(1 / 6)) * 10_000) / 10_000});
    expect(style(w3, ctx(63))?.opacity).toBeGreaterThan(style(w3, ctx(61))!.opacity as number);
    expect(style(w3, ctx(66))).toBeUndefined();
    // The Sequence starts at frame 60: local frame 30 is 3 s of audio.
    const offset = wordStyleFrom({...base, highlight: highlight({}), sequenceFrom: 60});
    expect(offset(w3, ctx(30))).toBeUndefined();
    expect(offset(w4, ctx(30))).toEqual({opacity: 0.6});
  });

  it('ink: only the current line rests, by its distance from the centre slot, never compounding', () => {
    const style = wordStyleFrom({...base, highlight: highlight({})});
    expect(style(w3, ctx(45, {linePosition: 1}))).toBeUndefined();
    expect(style(w3, ctx(45, {linePosition: -1.5}))).toBeUndefined();
    expect(style(w3, ctx(45, {linePosition: 0.5}))).toEqual({opacity: 0.8});
    expect(style(w3, ctx(45, {linePosition: -0.25}))).toEqual({opacity: 0.7});
  });

  it('ink: rests at 0.65 or more on a theme with tajweed colours, and a word nothing times is not dimmed', () => {
    expect(wordStyleFrom({...base, theme: 'light', highlight: highlight({restOpacity: 0.5})})(w3, ctx(45))).toEqual({
      opacity: 0.65,
    });
    const untimed = wordStyleFrom({...base, timings: undefined, timingsIndex: {}, highlight: highlight({})});
    expect(untimed(w3, ctx(0))).toBeUndefined();
  });

  it("ink under mode ayah: every ayah but the one being recited rests; a word without a time takes its ayah's", () => {
    const style = wordStyleFrom({...base, highlight: highlight({mode: 'ayah'})});
    expect(style(w1, ctx(45))).toBeUndefined();
    expect(style(w3, ctx(45))).toBeUndefined();
    expect(style(w4, ctx(45))).toEqual({opacity: 0.6});
    // Ayah 1 lets go at its release (3.25 s) over ayahMark: heard, it rests again.
    expect(style(w1, ctx(150))).toEqual({opacity: 0.6});
    // Without word times, mode word follows the ayahs.
    const byAyah = wordStyleFrom({
      ...base,
      timingsIndex: {},
      timings: {...timings, ayat: timings.ayat.map(({words: _words, ...ayah}) => ayah)},
      highlight: highlight({mode: 'word'}),
    });
    expect(byAyah(w3, ctx(45))).toBeUndefined();
    expect(byAyah(w4, ctx(45))).toEqual({opacity: 0.6});
  });

  it('tint: eases the word into the legible accent and out with a trail, the rosette never', () => {
    const style = wordStyleFrom({...base, highlight: highlight({style: 'tint'}), ink, ground: '#f8f3e6'});
    expect(style(w2, ctx(45))).toEqual({color: 'rgba(128, 99, 33, 1)'});
    expect(style(w1, ctx(45))).toBeUndefined();
    expect(style(w4, ctx(45))).toBeUndefined();
    // 1.1 s: 1:1:2 coming in, 1:1:1 still letting go: both partly marked.
    expect(style(w1, ctx(33))?.color).toMatch(/^rgba\(/);
    expect(style(w2, ctx(33))?.color).toMatch(/^rgba\(/);
    expect(style(w1, ctx(33))?.color).not.toBe('rgba(128, 99, 33, 1)');
    // The ayah-end rosette keeps its own palette.
    expect(style(w3, ctx(75))).toBeUndefined();
    // Nothing before the word: no lead.
    expect(style(w2, ctx(29))).toBeUndefined();
  });

  it('tint: a wash on tajweed colours, the line palettes on a fixed ink', () => {
    const tajweed = wordStyleFrom({...base, theme: 'light', highlight: highlight({style: 'tint'})});
    expect(tajweed(w2, ctx(45))).toEqual(washStyle({color: washColor(defaultHighlight.color, 0.1), cap: 'both'}));
    const black = wordStyleFrom({...base, theme: 'black', ground: '#121416', highlight: highlight({style: 'tint'})});
    const palette = (amount: number) => (amount < 0.125 ? undefined : `--tint-${Math.round(amount * 4)}`);
    expect(black(w2, ctx(45, {inkPalette: palette}))).toEqual({fontPalette: '--tint-4'});
    // A line without the tint palettes falls back to CSS colour.
    expect(black(w2, ctx(45))?.color).toBe('rgba(177, 147, 83, 1)');
  });

  it('wash: a faint band behind the word, or the ayah run with round ends on its line, the rosette included', () => {
    const word = wordStyleFrom({...base, highlight: highlight({style: 'wash'})});
    expect(word(w2, ctx(45))).toEqual(washStyle({color: 'rgba(177, 147, 83, 0.1)', cap: 'both'}));
    expect(word(w3, ctx(75))).toBeUndefined();
    const ayah = wordStyleFrom({...base, highlight: highlight({mode: 'ayah', style: 'wash'})});
    const band = (cap: WashCap) => washStyle({color: 'rgba(177, 147, 83, 0.1)', cap});
    expect(ayah(w1, ctx(45))).toEqual(band('start'));
    expect(ayah(w2, ctx(45))).toEqual(band('none'));
    expect(ayah(w3, ctx(45))).toEqual(band('end'));
    expect(ayah(w4, ctx(45))).toBeUndefined();
    // On a dark ground the band is a little stronger.
    const dark = wordStyleFrom({...base, ground: '#121416', highlight: highlight({style: 'wash'})});
    expect(dark(w2, ctx(45))).toEqual(washStyle({color: 'rgba(177, 147, 83, 0.13)', cap: 'both'}));
  });

  it('holds the last word of an ayah to the release when the timings time its rosette as a word', () => {
    // The rosette 1:1:3 has its own entry (2-3 s): told it is the marker, 1:1:2 keeps its band past 2 s.
    const plain = wordStyleFrom({...base, highlight: highlight({style: 'wash'})});
    expect(plain(w2, ctx(75))).toBeUndefined();
    const held = wordStyleFrom({...base, highlight: highlight({style: 'wash'}), markers: markerIds([line])});
    expect(held(w2, ctx(75))).toEqual(washStyle({color: 'rgba(177, 147, 83, 0.1)', cap: 'both'}));
    // It lets go at the release, 3.25 s, over markOut.
    expect(held(w2, ctx(110))).toBeUndefined();
    expect(held(w3, ctx(75))).toBeUndefined();
  });

  it('carries no tint or wash on a line leaving the centre slot upward, full strength on one coming in', () => {
    const style = wordStyleFrom({...base, highlight: highlight({style: 'wash'})});
    expect(style(w2, ctx(45, {linePosition: -0.5}))).toEqual(
      washStyle({color: 'rgba(177, 147, 83, 0.05)', cap: 'both'}),
    );
    expect(style(w2, ctx(45, {linePosition: -1}))).toBeUndefined();
    expect(style(w2, ctx(45, {linePosition: 0.6}))).toEqual(washStyle({color: 'rgba(177, 147, 83, 0.1)', cap: 'both'}));
  });

  it('marks nothing under mode none', () => {
    for (const style of ['ink', 'tint', 'wash'] as const) {
      const off = wordStyleFrom({...base, highlight: highlight({mode: 'none', style})});
      expect([w1, w2, w3, w4].map((w) => off(w, ctx(45)))).toEqual([undefined, undefined, undefined, undefined]);
    }
  });

  it('underlines doubtful words in the Studio only, when asked, on top of the mark', () => {
    const doubtful = {'1:1:3': ['low-confidence' as const]};
    const mark = {textDecoration: 'underline dotted #d94848', textDecorationThickness: '0.08em'};
    const studio = wordStyleFrom({...base, doubtful, isStudio: true, highlight: highlight({})});
    expect(studio(w3, ctx(45))).toEqual({opacity: 0.6, ...mark});
    expect(studio(w1, ctx(45))).toBeUndefined();
    expect(wordStyleFrom({...base, doubtful, isStudio: false, highlight: highlight({})})(w3, ctx(45))).toEqual({
      opacity: 0.6,
    });
    const off = wordStyleFrom({
      ...base,
      doubtful,
      isStudio: true,
      highlight: highlight({mode: 'none'}),
      review: {...defaultReview, showDoubtful: false},
    });
    expect(off(w3, ctx(0))).toBeUndefined();
    // The colour follows the review settings.
    const red = wordStyleFrom({
      ...base,
      doubtful,
      isStudio: true,
      highlight: highlight({mode: 'none'}),
      review: {...defaultReview, doubtColor: 'red'},
    });
    expect(red(w3, ctx(0))?.textDecoration).toBe('underline dotted red');
  });
});

describe('layout.offsetY / text.translationOffsetY', () => {
  it('default to 0 in both compositions and take whole tens of px within 800', () => {
    expect(defaultLayout.offsetY).toBe(0);
    expect(defaultText.translationOffsetY).toBe(0);
    expect(mushafRecitationSchema.parse(defaultMushafRecitationProps).layout.offsetY).toBe(0);
    expect(mushafPassageSchema.parse(defaultMushafPassageProps).text.translationOffsetY).toBe(0);
    const layout = (offsetY: number) => ({...defaultMushafRecitationProps, layout: {...defaultLayout, offsetY}});
    expect(mushafRecitationSchema.parse(layout(-800)).layout.offsetY).toBe(-800);
    expect(mushafRecitationSchema.parse(layout(800)).layout.offsetY).toBe(800);
    expect(() => mushafRecitationSchema.parse(layout(810))).toThrow();
    expect(() => mushafRecitationSchema.parse(layout(15))).toThrow();
    const text = (translationOffsetY: number) => ({
      ...defaultMushafPassageProps,
      text: {...defaultText, translationOffsetY},
    });
    expect(mushafPassageSchema.parse(text(-120)).text.translationOffsetY).toBe(-120);
    expect(() => mushafPassageSchema.parse(text(-801))).toThrow();
    expect(() => mushafPassageSchema.parse(text(2.5))).toThrow();
  });
});

describe('themeSelectionFrom / sizeForAspect / durations', () => {
  it('passes a preset through and builds a custom theme from the overridden parts only', () => {
    expect(themeSelectionFrom('plain', defaultMushafRecitationProps.customTheme)).toBe('plain');
    expect(themeSelectionFrom('custom', defaultMushafRecitationProps.customTheme)).toEqual({
      base: 'normal',
      // The Mushaf palette: the ink follows layout.color, the rosettes are gold line work on vellum.
      colors: {frame: '#8c6c26', accent: '#efe3c4', detail: '#8c6c26', background: '#f8f3e6'},
    });
  });

  it('sizes every aspect at 1080p class', () => {
    expect(sizeForAspect('16:9')).toEqual({width: 1920, height: 1080});
    expect(sizeForAspect('9:16')).toEqual({width: 1080, height: 1920});
    expect(sizeForAspect('1:1')).toEqual({width: 1080, height: 1080});
    expect(sizeForAspect('4:5')).toEqual({width: 1080, height: 1350});
  });

  it('counts a recitation to the last end plus a second, a passage to its holds plus the exit', () => {
    expect(recitationDuration({version: 1, surah: 1, ayat: [{ayah: 2, start: 0, end: 27.559}]}, 30)).toBe(857);
    expect(recitationDuration({version: 1, surah: 1, ayat: [{ayah: 2, start: 0, end: 0}]}, 30)).toBe(30);
    expect(exitTiming().getDurationInFrames({fps: 30})).toBe(10);
    expect(passageDuration(5, 4, 30)).toBe(610);
    expect(passageDuration(0, 4, 30)).toBe(10);
  });
});

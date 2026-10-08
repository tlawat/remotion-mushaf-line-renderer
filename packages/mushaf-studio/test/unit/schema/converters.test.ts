// The schema's converters: pure functions from the Props sidebar's values to the package's vocabulary.
import {fade} from '@remotion/transitions/fade';
import {
  enterTiming,
  exitTiming,
  type MushafFontPackage,
  type MushafLineAnimation,
  revealRtl,
  slideFade,
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
  defaultHighlight,
  defaultLayout,
  defaultReview,
  defaultText,
  fontPropsFrom,
  type Highlight,
  scrollTimingFrom,
  sizeForAspect,
  themeSelectionFrom,
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
  it('maps every entrance to a presentation on the package default timings', () => {
    const slide = animationFrom({enter: 'slide-fade', exit: 'slide-fade'});
    expect(asAnimation(slide.enter)?.presentation.component).toBe(slideFade().component);
    expect(asAnimation(slide.exit)?.presentation.component).toBe(slideFade().component);
    expect(asAnimation(slide.enter)?.presentation.props).toEqual({});
    expect(framesOf(asAnimation(slide.enter))).toBe(enterTiming().getDurationInFrames({fps}));
    expect(framesOf(asAnimation(slide.exit))).toBe(exitTiming().getDurationInFrames({fps}));
    expect([framesOf(asAnimation(slide.enter)), framesOf(asAnimation(slide.exit))]).toEqual([15, 10]);

    const faded = animationFrom({enter: 'fade', exit: 'fade'});
    expect(asAnimation(faded.enter)?.presentation.component).toBe(fade().component);
    expect(asAnimation(faded.enter)?.presentation.props).toEqual({});
    // fade() keeps the exiting side visible unless told otherwise.
    expect(asAnimation(faded.exit)?.presentation.props).toEqual({shouldFadeOutExitingScene: true});

    const reveal = animationFrom({enter: 'reveal-rtl', exit: 'reveal-rtl'});
    expect(asAnimation(reveal.enter)?.presentation.component).toBe(revealRtl().component);
  });

  it("leaves a side set to 'none' out, never undefined, so the result spreads into the component", () => {
    expect(animationFrom({enter: 'none', exit: 'none'})).toEqual({});
    const half = animationFrom({enter: 'slide-fade', exit: 'none'});
    expect(Object.keys(half)).toEqual(['enter']);
  });

  it('divides the slide travel by the window height so it stays one line', () => {
    const inWindow = animationFrom({enter: 'slide-fade', exit: 'slide-fade'}, {visibleLines: 4});
    expect(asAnimation(inWindow.enter)?.presentation.props).toEqual({distance: 7});
    expect(asAnimation(inWindow.exit)?.presentation.props).toEqual({distance: 7});
    expect(
      asAnimation(animationFrom({enter: 'slide-fade', exit: 'none'}, {visibleLines: 1}).enter)?.presentation.props,
    ).toEqual({});
  });
});

describe('scrollTimingFrom', () => {
  it('is the eased default for ease and the package spring for spring', () => {
    const ease = scrollTimingFrom('ease');
    const spring = scrollTimingFrom('spring');
    expect(ease.getDurationInFrames({fps})).toBe(15);
    expect(spring.getDurationInFrames({fps})).toBeGreaterThan(0);
    expect(spring.getDurationInFrames({fps})).not.toBe(15);
    for (const timing of [ease, spring]) {
      expect(timing.getProgress({frame: 0, fps})).toBe(0);
      expect(timing.getProgress({frame: timing.getDurationInFrames({fps}), fps})).toBeCloseTo(1, 1);
    }
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

  it('paints the ink, a glow, a marker, or nothing', () => {
    const color = '#c8a45c';
    expect(activeWordStyleFrom({style: 'color', color})).toEqual({color});
    expect(activeWordStyleFrom({style: 'glow', color})).toEqual({color, textShadow: '0 0 0.25em #c8a45c'});
    expect(activeWordStyleFrom({style: 'marker', color})).toEqual({background: 'rgba(200, 164, 92, 0.35)'});
    expect(activeWordStyleFrom({style: 'none', color})).toBeUndefined();
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
  const timingsIndex = {'1:1:1': 0, '1:1:2': 1, '1:1:3': 2, '1:2:1': 4};
  const ctx = (frame: number, active = false): WordContext => ({line, frame, fps, active, inSlice: true});
  const base = {review: defaultReview, doubtful: {}, timingsIndex, activeWordId: null, isStudio: false};
  const highlight = (changes: Partial<Highlight>): Highlight => ({...defaultHighlight, ...changes});

  it('paints nothing when nothing applies', () => {
    const style = wordStyleFrom({...base, highlight: highlight({dimOthers: 1})});
    expect(style(w1, ctx(0))).toBeUndefined();
    expect(style(w1, ctx(0, true))).toBeUndefined();
  });

  it('dims every word that is not current', () => {
    const style = wordStyleFrom({...base, highlight: highlight({dimOthers: 0.4}), activeWordId: '1:1:2'});
    expect(style(w1, ctx(0))).toEqual({opacity: 0.4});
    expect(style(w2, ctx(0, true))).toBeUndefined();
    // Highlighting off: nothing is current, so nothing is dimmed either.
    expect(wordStyleFrom({...base, highlight: highlight({mode: 'none', dimOthers: 0.4})})(w1, ctx(0))).toBeUndefined();
  });

  it('dims only the words still to come under dimUpcomingOnly, by the time the local frame maps to', () => {
    const style = wordStyleFrom({...base, highlight: highlight({dimOthers: 0.4, dimUpcomingOnly: true})});
    // 1 s: 1:1:1 (0 s) and 1:1:2 (1 s) were heard, 1:1:3 (2 s) has not.
    expect(style(w1, ctx(30))).toBeUndefined();
    expect(style(w2, ctx(30))).toBeUndefined();
    expect(style(w3, ctx(30))).toEqual({opacity: 0.4});
    // The Sequence starts at frame 60: local frame 30 is 3 s of audio.
    const offset = wordStyleFrom({
      ...base,
      highlight: highlight({dimOthers: 0.4, dimUpcomingOnly: true}),
      sequenceFrom: 60,
    });
    expect(offset(w3, ctx(30))).toBeUndefined();
    expect(offset(w4, ctx(30))).toEqual({opacity: 0.4});
    // A word the file never times is not known to be upcoming.
    const untimed = wordStyleFrom({
      ...base,
      timingsIndex: {},
      highlight: highlight({dimOthers: 0.4, dimUpcomingOnly: true}),
    });
    expect(untimed(w1, ctx(0))).toBeUndefined();
  });

  it("falls back to the ayah's time for a word without one of its own under dimUpcomingOnly", () => {
    const timings = {
      version: 1 as const,
      surah: 1,
      ayat: [
        {ayah: 1, start: 0, end: 3},
        {ayah: 2, start: 4, end: 6},
      ],
    };
    const dim = highlight({dimOthers: 0.4, dimUpcomingOnly: true});
    // Nothing timed by word: a word is upcoming until its ayah starts, the marker until its ayah ends.
    const byAyah = wordStyleFrom({...base, timingsIndex: {}, timings, highlight: dim});
    expect(byAyah(w1, ctx(30))).toBeUndefined();
    expect(byAyah(w2, ctx(30))).toBeUndefined();
    expect(byAyah(w3, ctx(30))).toEqual({opacity: 0.4});
    expect(byAyah(w3, ctx(90))).toBeUndefined();
    expect(byAyah(w4, ctx(30))).toEqual({opacity: 0.4});
    expect(byAyah(w4, ctx(120))).toBeUndefined();
    // A word's own time wins over its ayah's.
    const own = wordStyleFrom({...base, timingsIndex: {'1:1:2': 2}, timings, highlight: dim});
    expect(own(w2, ctx(30))).toEqual({opacity: 0.4});
    expect(own(w1, ctx(30))).toBeUndefined();
    // An ayah the timings do not carry stays unknown, so it is not dimmed.
    const other = wordStyleFrom({
      ...base,
      timingsIndex: {},
      timings: {...timings, ayat: [timings.ayat[0]!]},
      highlight: dim,
    });
    expect(other(w4, ctx(30))).toBeUndefined();
  });

  it('paints the active style on the whole ayah under mode: ayah', () => {
    const style = wordStyleFrom({...base, highlight: highlight({mode: 'ayah', dimOthers: 0.4}), activeWordId: '1:1:2'});
    expect(style(w1, ctx(0))).toEqual({color: '#c8a45c'});
    expect(style(w2, ctx(0, true))).toEqual({color: '#c8a45c'});
    expect(style(w3, ctx(0))).toEqual({color: '#c8a45c'});
    expect(style(w4, ctx(0))).toEqual({opacity: 0.4});
    expect(
      wordStyleFrom({...base, highlight: highlight({mode: 'ayah'}), activeWordId: null})(w1, ctx(0)),
    ).toBeUndefined();
    expect(
      wordStyleFrom({...base, highlight: highlight({mode: 'ayah', style: 'none'}), activeWordId: '1:1:2'})(w1, ctx(0)),
    ).toBeUndefined();
  });

  it('underlines doubtful words in the Studio only, when asked, on top of the dimming', () => {
    const doubtful = {'1:1:2': ['low-confidence' as const]};
    const mark = {textDecoration: 'underline dotted #d94848', textDecorationThickness: '0.08em'};
    const studio = wordStyleFrom({...base, doubtful, isStudio: true, highlight: highlight({dimOthers: 0.4})});
    expect(studio(w2, ctx(0))).toEqual({opacity: 0.4, ...mark});
    expect(studio(w1, ctx(0))).toEqual({opacity: 0.4});
    expect(wordStyleFrom({...base, doubtful, isStudio: true, highlight: highlight({})})(w2, ctx(0))).toEqual(mark);
    expect(wordStyleFrom({...base, doubtful, isStudio: false, highlight: highlight({})})(w2, ctx(0))).toBeUndefined();
    const off = wordStyleFrom({
      ...base,
      doubtful,
      isStudio: true,
      highlight: highlight({}),
      review: {...defaultReview, showDoubtful: false},
    });
    expect(off(w2, ctx(0))).toBeUndefined();
    // The colour follows the review settings.
    const red = wordStyleFrom({
      ...base,
      doubtful,
      isStudio: true,
      highlight: highlight({}),
      review: {...defaultReview, doubtColor: 'red'},
    });
    expect(red(w2, ctx(0))?.textDecoration).toBe('underline dotted red');
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
      colors: {accent: '#c8a45c', detail: '#c8a45c'},
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

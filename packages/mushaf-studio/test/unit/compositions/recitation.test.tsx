// @vitest-environment jsdom
// <MushafRecitation> mounted under jsdom with `remotion`, the package's two line components, the
// translations and the Studio panel mocked: what the composition builds from its props. The mocked
// lines evaluate `wordStyle` for real, on every word, at the local frame a real line would see.
import {cleanup, render} from '@testing-library/react';
import React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fatiha from '../../fixtures/timings/fatiha.json';
import {fatihaLines} from './helpers/fatiha-lines';
import {createRemotionMock} from './helpers/remotion-mock';

const remotion = createRemotionMock();
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
}));

type LineData = import('@tlawat/remotion-mushaf-line').MushafLineData;
type LineProps = import('@tlawat/remotion-mushaf-line').MushafLineProps & {line: LineData};
type WindowProps = import('@tlawat/remotion-mushaf-line').MushafLineWindowProps;
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>();
  // Every word's style, by id, as the real line would ask for it on this frame.
  const wordStyles = (
    props: Pick<LineProps, 'wordStyle' | 'activeWordId'>,
    lines: readonly LineData[],
    frame: number,
  ) =>
    JSON.stringify(
      Object.fromEntries(
        lines.flatMap((line) =>
          line.words.map((word) => [
            word.id,
            props.wordStyle?.(word, {line, frame, fps: 30, active: word.id === props.activeWordId, inSlice: true}) ??
              null,
          ]),
        ),
      ),
    );
  const MushafLine = (props: LineProps) => {
    const frame = remotion.useLocalFrame();
    return (
      <span
        className="mushaf-line-mock"
        data-page={props.line.page}
        data-line={props.line.line}
        data-slice={JSON.stringify(props.line.slice ?? null)}
        data-active-word-id={props.activeWordId ?? ''}
        data-active-style={JSON.stringify(props.activeWordStyle ?? null)}
        data-word-styles={wordStyles(props, [props.line], frame)}
        data-enter={props.enter ? 'yes' : 'no'}
        data-font-fallback={props.fontFallback ? 'yes' : 'no'}
      />
    );
  };
  const MushafLineWindow = (props: WindowProps) => {
    const frame = remotion.useLocalFrame();
    return (
      <div
        className="mushaf-line-window-mock"
        data-line-count={props.lines.length}
        data-steps={JSON.stringify(props.steps)}
        data-visible-lines={props.visibleLines}
        data-neighbour-opacity={props.neighbourOpacity}
        data-scroll-frames={props.scrollTiming?.getDurationInFrames({fps: 30})}
        data-active-word-id={props.activeWordId ?? ''}
        data-active-style={JSON.stringify(props.activeWordStyle ?? null)}
        data-word-styles={wordStyles(props, props.lines, frame)}
        data-enter={props.enter ? 'yes' : 'no'}
      />
    );
  };
  const MushafSurahName = (props: {surah: number}) => <span data-surah-name={props.surah} />;
  return {...actual, MushafLine, MushafLineWindow, MushafSurahName};
});

vi.mock('../../../src/translations', () => ({
  ayahKeyOf: (id: string | null) => (id ? id.split(':').slice(0, 2).join(':') : null),
  TranslationBlock: (props: {ayahKey: string | null; fontFamily: string; fontSize: number}) => (
    <div data-translation-block={props.ayahKey ?? ''} data-font={props.fontFamily} data-size={props.fontSize} />
  ),
  TranslationStack: (props: {
    layers: readonly {fontFamily: string; fontSize: number; direction: string; color: string}[];
    ayahKey: string | null;
  }) => (
    <div data-translation-stack={props.layers.length}>
      {props.layers.map((layer, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a layer is a position.
          key={i}
          data-translation-block={props.ayahKey ?? ''}
          data-font={layer.fontFamily}
          data-size={layer.fontSize}
          data-direction={layer.direction}
          data-color={layer.color}
        />
      ))}
    </div>
  ),
  GlossStrip: (props: {activeWordId: string | null; translation: unknown; transliteration: unknown}) => (
    <div
      data-gloss-strip={props.activeWordId ?? ''}
      data-has-gloss={props.translation ? 'yes' : 'no'}
      data-has-transliteration={props.transliteration ? 'yes' : 'no'}
    />
  ),
}));
vi.mock('@remotion/media', () => ({
  Audio: (props: {src: string; trimBefore?: number}) => (
    <div data-media-audio={props.src} data-trim-before={props.trimBefore} />
  ),
}));
vi.mock('../../../src/studio', () => ({
  MushafStudioPanel: (props: {compositionId: string}) => <div data-panel={props.compositionId} />,
  isInStudio: () => false,
}));

const {MushafRecitation, defaultMushafRecitationProps} = await import('../../../src/compositions/recitation');
const {scheduleLines, scrollPosition} = await import('@tlawat/remotion-mushaf-line');
const {registerMushafFonts} = await import('../../../src/fonts');
const {withHeaderSlots} = await import('../../../src/compositions/shared');
const {defaultOverlay} = await import('../../../src/schema');
const {syntheticLine} = await import('../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;
type ResolvedRecitation = import('../../../src/compositions/recitation').ResolvedRecitation;
type StudioTimings = import('../../../src/types').StudioTimings;

class Boundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  override state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  override render() {
    return this.state.error ? <div data-error={this.state.error.message} /> : this.props.children;
  }
}

const timings = fatiha as unknown as StudioTimings;
const lines = fatihaLines();
const meta = {id: 'test', name: 'Test', language: 'en', source: 'file'};
const ayahText = {kind: 'ayah' as const, meta, text: {'1:2': 'Praise', '1:3': 'Merciful'}};
const wordText = {kind: 'word' as const, meta, words: {'1:2:1': 'praise'}};
const resolved = (changes: Partial<ResolvedRecitation> = {}): ResolvedRecitation => ({
  timings,
  audioOffsetSeconds: 0,
  lines,
  schedule: scheduleLines(lines, timings),
  translation: null,
  gloss: null,
  transliteration: null,
  doubtful: {},
  ...changes,
});
const props = (
  changes: Partial<MushafRecitationProps> = {},
  content: Partial<ResolvedRecitation> = {},
): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  ...changes,
  resolved: resolved(content),
});
const mount = (p: MushafRecitationProps) => render(<MushafRecitation {...p} />).container;
const layout = (changes: Partial<MushafRecitationProps['layout']>) => ({
  ...defaultMushafRecitationProps.layout,
  ...changes,
});
const text = (changes: Partial<MushafRecitationProps['text']>) => ({...defaultMushafRecitationProps.text, ...changes});
const highlight = (changes: Partial<MushafRecitationProps['highlight']>) => ({
  ...defaultMushafRecitationProps.highlight,
  ...changes,
});
const sequences = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-sequence]'));
const block = (c: HTMLElement, name: string) => c.querySelector<HTMLElement>(`[data-mushaf-block="${name}"]`);
const windowOf = (c: HTMLElement) => c.querySelector<HTMLElement>('.mushaf-line-window-mock');
const lineMocks = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.mushaf-line-mock'));
const translationOf = (c: HTMLElement) =>
  block(c, 'Translation')!.querySelector<HTMLElement>('[data-translation-block]')!.dataset.translationBlock;
type Styles = Record<string, Record<string, unknown> | null>;
const stylesOf = (element: HTMLElement): Styles => JSON.parse(element.dataset.wordStyles!);
const underline = {textDecoration: 'underline dotted #d94848', textDecorationThickness: '0.08em'};
/** The lead frame of a slot: in place 0.4 s before its first word. */
const lead = (start: number) => Math.round((start - 0.4) * 30);
/** 1:2:1 recited again at 4.0 s, after ayah 3 began at 3.533: under `occurrence: 'last'` line 1 starts after line 2. */
const repeated: StudioTimings = {
  ...timings,
  ayat: timings.ayat.map((a) => (a.ayah === 2 ? {...a, words: [...a.words!, {id: '1:2:1', start: 4.0, end: 4.4}]} : a)),
};
/** The same recitation timed by ayah only. */
const ayahsOnly: StudioTimings = {...timings, ayat: timings.ayat.map(({words: _words, ...a}) => a)};

const overlay = (changes: Partial<MushafRecitationProps['overlay']>) => ({...defaultOverlay, ...changes});
/** The fixture three seconds later, with room before its first word. */
const later = (seconds: number): StudioTimings => {
  const move = (t: number) => Math.round((t + seconds) * 1000) / 1000;
  return {
    ...timings,
    ayat: timings.ayat.map((a) => ({
      ...a,
      start: move(a.start),
      end: move(a.end),
      words: a.words!.map((w) => ({...w, start: move(w.start), end: move(w.end)})),
    })),
  };
};

beforeEach(() => {
  remotion.reset();
  registerMushafFonts({});
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<MushafRecitation>', () => {
  it('plays the audio and shows the window in one Sequence, inset by the margins', () => {
    const c = mount(props());
    expect(c.querySelector<HTMLElement>('[data-audio]')?.dataset).toMatchObject({
      audio: defaultMushafRecitationProps.audioFile,
      trimBefore: '0',
    });
    const seq = sequences(c);
    expect(seq).toHaveLength(1);
    expect(seq[0]!.dataset).toMatchObject({from: '0', duration: '900', sequence: '6 lines, 3 at once'});
    const w = windowOf(c)!;
    expect(w.dataset).toMatchObject({
      lineCount: '6',
      visibleLines: '3',
      neighbourOpacity: '0.45',
      scrollFrames: '15',
      enter: 'yes',
    });
    // Line j becomes current 0.4 s before its first word, in frames; the first one before frame 0.
    const steps = resolved().schedule.map((slot) => lead(slot.start));
    expect(JSON.parse(w.dataset.steps!)).toEqual(steps);
    expect(steps[0]).toBe(-2);
    const lineBlock = block(c, 'Mushaf lines')!;
    expect(lineBlock.contains(w)).toBe(true);
    expect(lineBlock.style.left).toBe('120px');
    expect(lineBlock.style.width).toBe('1680px');
    const lineHeight = Number.parseInt(lineBlock.style.height, 10) / 3;
    expect(lineBlock.style.top).toBe(`${Math.round((1080 - 3 * lineHeight) / 2)}px`);
    expect(block(c, 'Translation')).toBeNull();
    expect(block(c, 'Gloss')).toBeNull();
    expect(c.querySelector('[data-panel]')).toBeNull();
    expect(c.querySelector('img')).toBeNull();
    expect((c.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(251, 247, 238)');
  });

  it('places the blocks between the margins, as plain absolute boxes, moved by the offsets only', () => {
    const c = mount(props({}, {translation: ayahText, gloss: wordText}));
    for (const name of ['Mushaf lines', 'Translation', 'Gloss']) {
      const box = block(c, name)!;
      expect(box.tagName).toBe('DIV');
      expect(box.style.position).toBe('absolute');
      expect(box.style.left).toBe('120px');
      expect(box.style.width).toBe(`${1920 - 2 * 120}px`);
      expect(box.style.transform).toBe('');
    }
    cleanup();
    remotion.state.width = 1080;
    const narrow = mount(
      props(
        {layout: layout({marginX: 40, offsetY: -60}), text: text({translationOffsetY: 120})},
        {translation: ayahText, gloss: wordText},
      ),
    );
    const linesBox = block(narrow, 'Mushaf lines')!;
    expect(linesBox.style.left).toBe('40px');
    expect(linesBox.style.width).toBe('1000px');
    expect(linesBox.style.transform).toBe('translateY(-60px)');
    const translation = block(narrow, 'Translation')!;
    expect(translation.style.left).toBe('40px');
    expect(translation.style.width).toBe('1000px');
    expect(translation.style.transform).toBe('translateY(120px)');
    expect(block(narrow, 'Gloss')!.style.transform).toBe('');
  });

  it('follows the layout: a public audio path, a background image, the vertical position, the scroll spring', () => {
    const c = mount(
      props({
        audioFile: 'mushaf-studio/fatiha/audio.mp3',
        layout: layout({backgroundImage: 'bg.png', verticalAlign: 0, marginX: 0}),
        animation: {...defaultMushafRecitationProps.animation, scroll: 'spring'},
      }),
    );
    expect(c.querySelector<HTMLElement>('[data-audio]')?.dataset.audio).toBe('/static/mushaf-studio/fatiha/audio.mp3');
    expect(c.querySelector('img')?.dataset.src).toBe('/static/bg.png');
    const lineBlock = block(c, 'Mushaf lines')!;
    expect(lineBlock.style.top).toBe('0px');
    expect(lineBlock.style.width).toBe('1920px');
    expect(windowOf(c)!.dataset.scrollFrames).not.toBe('15');
    expect(mount(props({audioFile: ''})).querySelector('[data-audio]')).toBeNull();
  });

  it('trims the audio by the resolved offset, in frames', () => {
    const c = mount(props({}, {audioOffsetSeconds: 2.633}));
    expect(c.querySelector<HTMLElement>('[data-audio]')?.dataset.trimBefore).toBe('79');
  });

  it('shows one Sequence per slot when visibleLines is 0, each ending where the next begins', () => {
    const c = mount(props({layout: layout({visibleLines: 0})}));
    expect(windowOf(c)).toBeNull();
    const seq = sequences(c);
    expect(seq).toHaveLength(6);
    expect(lineMocks(c).map((l) => `${l.dataset.page}/${l.dataset.line}`)).toEqual([
      '1/3',
      '1/4',
      '1/5',
      '1/6',
      '1/7',
      '1/8',
    ]);
    const starts = resolved().schedule.map((slot) => Math.max(0, lead(slot.start) - 15));
    expect(seq.map((s) => Number(s.dataset.from))).toEqual(starts);
    expect(seq.slice(0, 5).map((s) => Number(s.dataset.duration))).toEqual(
      starts.slice(1).map((next, i) => next - starts[i]!),
    );
    expect(Number(seq[5]!.dataset.duration)).toBe(Math.round((27.559 + 1) * 30) - starts[5]!);
    const lineBlock = block(c, 'Mushaf lines')!;
    expect(seq.every((s) => lineBlock.contains(s))).toBe(true);
    expect(lineMocks(c).every((l) => l.dataset.enter === 'yes')).toBe(true);
  });

  it('keeps the steps from decreasing when a later line starts first under occurrence: last', () => {
    const schedule = scheduleLines(lines, repeated, {occurrence: 'last'});
    expect(schedule[0]!.start).toBe(4.0);
    expect(schedule[1]!.start).toBe(3.533);
    const raw = schedule.map((slot) => lead(slot.start));
    expect(raw[0]).toBeGreaterThan(raw[1]!);
    expect(() => scrollPosition({frame: 0, fps: 30, steps: raw})).toThrow(/never decrease/);
    const content = {timings: repeated, schedule};
    const c = mount(props({highlight: highlight({occurrence: 'last'})}, content));
    // The window starts its entrance 15 frames before the first slot is in place (frame 108); its steps are local.
    expect(sequences(c)[0]!.dataset.from).toBe('93');
    const steps = JSON.parse(windowOf(c)!.dataset.steps!) as number[];
    expect(steps).toEqual([108 - 93, 108 - 93, 172 - 93, 250 - 93, 383 - 93, 483 - 93]);
    expect(steps.every((step, i) => i === 0 || step >= steps[i - 1]!)).toBe(true);
    expect(() => scrollPosition({frame: 0, fps: 30, steps})).not.toThrow();
    cleanup();
    const seq = sequences(mount(props({layout: layout({visibleLines: 0})}, content)));
    expect(seq.map((s) => Number(s.dataset.from))).toEqual([93, 93, 157, 235, 368, 468]);
    // The slot that collapsed to nothing still gets the frames its exit needs.
    expect(Number(seq[0]!.dataset.duration)).toBe(11);
    cleanup();
    // The current slot follows the same frames: at 3.8 s line 1 and line 2 are both in place, so line 2 is current.
    remotion.state.frame = 114;
    expect(translationOf(mount(props({}, {...content, timings: ayahsOnly, translation: ayahText})))).toBe('1:3');
  });

  it('marks the word being recited, by frame, in the way the highlight asks', () => {
    expect(windowOf(mount(props()))!.dataset.activeWordId).toBe('');
    remotion.state.frame = 30; // 1 s: 1:2:2 (0.901-1.521)
    const word = windowOf(mount(props()))!;
    expect(word.dataset.activeWordId).toBe('1:2:2');
    expect(JSON.parse(word.dataset.activeStyle!)).toEqual({color: '#c8a45c'});
    expect(stylesOf(word)['1:2:1']).toBeNull();
    cleanup();
    const ayah = windowOf(mount(props({highlight: highlight({mode: 'ayah', style: 'glow'})})))!;
    expect(ayah.dataset.activeWordId).toBe('1:2:2');
    expect(JSON.parse(ayah.dataset.activeStyle!)).toBeNull();
    expect(stylesOf(ayah)['1:2:1']).toEqual({color: '#c8a45c', textShadow: '0 0 0.25em #c8a45c'});
    expect(stylesOf(ayah)['1:3:1']).toBeNull();
    cleanup();
    const none = windowOf(mount(props({highlight: highlight({mode: 'none'})})))!;
    expect(none.dataset.activeWordId).toBe('');
    expect(JSON.parse(none.dataset.activeStyle!)).toBeNull();
    cleanup();
    const perLine = lineMocks(mount(props({layout: layout({visibleLines: 0})})));
    expect(perLine.every((l) => l.dataset.activeWordId === '1:2:2')).toBe(true);
  });

  it('dims the words still to come under dimUpcomingOnly, by the audio time of each line', () => {
    remotion.state.frame = 30; // 1 s: 1:2:1 and 1:2:2 heard, 1:2:3 (1.521) not yet
    const dim = highlight({dimOthers: 0.4, dimUpcomingOnly: true});
    const styles = stylesOf(windowOf(mount(props({highlight: dim})))!);
    expect(styles['1:2:1']).toBeNull();
    expect(styles['1:2:2']).toBeNull();
    expect(styles['1:2:3']).toEqual({opacity: 0.4});
    expect(styles['1:3:1']).toEqual({opacity: 0.4});
    // The ayah-end marker has no time of its own: upcoming until its ayah ends (3.391).
    expect(styles['1:2:5']).toEqual({opacity: 0.4});
    cleanup();
    // One line at a time: the line of ayah 3 sits in a Sequence from frame 79, and at 4 s its
    // local frame 41 still maps to 4 s of audio, where 1:3:1 (3.533) was heard and 1:3:2 (4.563) not.
    remotion.state.frame = 120;
    const perLine = lineMocks(mount(props({layout: layout({visibleLines: 0}), highlight: dim})));
    const ayah3 = perLine.find((l) => l.dataset.line === '4')!;
    expect(sequences(ayah3.ownerDocument.body)[1]!.dataset.from).toBe('79');
    expect(stylesOf(ayah3)['1:3:1']).toBeNull();
    expect(stylesOf(ayah3)['1:3:2']).toEqual({opacity: 0.4});
    cleanup();
    // Without dimUpcomingOnly every word but the current one is dimmed, heard or not.
    remotion.state.frame = 30;
    const all = stylesOf(windowOf(mount(props({highlight: highlight({dimOthers: 0.4})})))!);
    expect(all['1:2:1']).toEqual({opacity: 0.4});
    expect(all['1:2:2']).toBeNull();
  });

  it('underlines the doubtful words in the Studio preview only', () => {
    const doubtful = {'1:2:2': ['low-confidence' as const]};
    expect(stylesOf(windowOf(mount(props({}, {doubtful})))!)['1:2:2']).toBeNull();
    cleanup();
    remotion.state.env.isStudio = true;
    const studio = stylesOf(windowOf(mount(props({}, {doubtful})))!);
    expect(studio['1:2:2']).toEqual(underline);
    expect(studio['1:2:1']).toBeNull();
    cleanup();
    const perLine = lineMocks(mount(props({layout: layout({visibleLines: 0})}, {doubtful})));
    expect(stylesOf(perLine[0]!)['1:2:2']).toEqual(underline);
    expect(stylesOf(perLine[0]!)['1:2:3']).toBeNull();
    cleanup();
    remotion.state.env.isClientSideRendering = true;
    expect(stylesOf(windowOf(mount(props({}, {doubtful})))!)['1:2:2']).toBeNull();
    cleanup();
    remotion.state.env.isClientSideRendering = false;
    remotion.state.env.isRendering = true;
    expect(stylesOf(windowOf(mount(props({}, {doubtful})))!)['1:2:2']).toBeNull();
    cleanup();
    remotion.state.env.isRendering = false;
    const off = {...defaultMushafRecitationProps.review, showDoubtful: false};
    expect(stylesOf(windowOf(mount(props({review: off}, {doubtful})))!)['1:2:2']).toBeNull();
  });

  it('puts the translation under or above the lines, with the current ayah', () => {
    const below = mount(props({text: text({translationPosition: 'below'})}, {translation: ayahText}));
    const t = block(below, 'Translation')!;
    expect(t.style.top).not.toBe('');
    expect(t.style.bottom).toBe('');
    expect(block(below, 'Mushaf lines')!.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const tb = t.querySelector<HTMLElement>('[data-translation-block]')!;
    // Before the first word: the first ayah of the current line.
    expect(tb.dataset).toMatchObject({
      translationBlock: '1:2',
      font: defaultMushafRecitationProps.text.translationFont,
      size: '40',
    });
    cleanup();
    const above = block(
      mount(props({text: text({translationPosition: 'above'})}, {translation: ayahText})),
      'Translation',
    )!;
    expect(above.style.bottom).not.toBe('');
    expect(above.style.top).toBe('');
    cleanup();
    expect(
      block(mount(props({text: text({translationPosition: 'none'})}, {translation: ayahText})), 'Translation'),
    ).toBeNull();
    cleanup();
    remotion.state.frame = 120; // 4 s: 1:3:1 (3.533)
    expect(translationOf(mount(props({}, {translation: ayahText})))).toBe('1:3');
    cleanup();
    // With the highlight off, the word being heard still decides: 1:2:4 at 3.4 s (1:3:1 starts at 3.533).
    remotion.state.frame = 102;
    expect(translationOf(mount(props({highlight: highlight({mode: 'none'})}, {translation: ayahText})))).toBe('1:2');
    cleanup();
    // Without per-word times the ayah being heard decides, and before the first one the current line.
    expect(translationOf(mount(props({}, {timings: ayahsOnly, translation: ayahText})))).toBe('1:2');
    cleanup();
    remotion.state.frame = 120;
    expect(translationOf(mount(props({}, {timings: ayahsOnly, translation: ayahText})))).toBe('1:3');
    cleanup();
    remotion.state.frame = 0;
    expect(translationOf(mount(props({}, {timings: ayahsOnly, translation: ayahText})))).toBe('1:2');
  });

  it('shows the gloss strip only with a gloss or a transliteration, for the word heard whatever the highlight', () => {
    expect(block(mount(props()), 'Gloss')).toBeNull();
    cleanup();
    remotion.state.frame = 30;
    const gloss = block(mount(props({}, {gloss: wordText})), 'Gloss')!.querySelector<HTMLElement>(
      '[data-gloss-strip]',
    )!;
    expect(gloss.dataset).toMatchObject({glossStrip: '1:2:2', hasGloss: 'yes', hasTransliteration: 'no'});
    cleanup();
    const translit = block(mount(props({}, {transliteration: wordText})), 'Gloss')!.querySelector<HTMLElement>(
      '[data-gloss-strip]',
    )!;
    expect(translit.dataset).toMatchObject({hasGloss: 'no', hasTransliteration: 'yes'});
    cleanup();
    const none = mount(props({highlight: highlight({mode: 'none'})}, {gloss: wordText}));
    expect(block(none, 'Gloss')!.querySelector<HTMLElement>('[data-gloss-strip]')!.dataset.glossStrip).toBe('1:2:2');
    expect(windowOf(none)!.dataset.activeWordId).toBe('');
  });

  it('renders the panel and the fonts warning in the Studio preview only', () => {
    const render1 = mount(props({fonts: 'package'}));
    expect(render1.querySelector('[data-panel]')).toBeNull();
    expect(render1.textContent).not.toContain('registerMushafFonts');
    cleanup();
    remotion.state.env.isStudio = true;
    const studio = mount(props({fonts: 'package'}));
    expect(studio.querySelector<HTMLElement>('[data-panel]')!.dataset.panel).toBe('MushafRecitation');
    expect(studio.textContent).toContain('Mushaf Studio: fonts is "package"');
    expect(studio.textContent).toContain('registerMushafFonts');
    cleanup();
    expect(mount(props({fonts: 'cdn'})).textContent).not.toContain('registerMushafFonts');
    cleanup();
    // The Studio's own in-browser render: `isStudio` stays set, `isClientSideRendering` comes through the hook.
    remotion.state.env.isClientSideRendering = true;
    const clientRender = mount(props({fonts: 'package'}));
    expect(clientRender.querySelector('[data-panel]')).toBeNull();
    expect(clientRender.textContent).not.toContain('Mushaf Studio');
    cleanup();
    remotion.state.env.isClientSideRendering = false;
    remotion.state.env.isRendering = true;
    const rendering = mount(props({fonts: 'package'}));
    expect(rendering.querySelector('[data-panel]')).toBeNull();
    expect(rendering.textContent).not.toContain('Mushaf Studio');
  });

  it('passes the registered fonts package as the fallback', () => {
    expect(
      lineMocks(mount(props({layout: layout({visibleLines: 0})}))).every((l) => l.dataset.fontFallback === 'no'),
    ).toBe(true);
    cleanup();
    registerMushafFonts({
      plain: {
        kind: 'remotion-mushaf-fonts',
        schema: 1,
        name: 'p',
        version: '1',
        mushaf: 'qpc-v4',
        fontSet: 'qpc-v4',
        snapshot: 'x',
        files: {},
      },
    });
    expect(
      lineMocks(mount(props({layout: layout({visibleLines: 0})}))).every((l) => l.dataset.fontFallback === 'yes'),
    ).toBe(true);
  });

  it('shows no title by default', () => {
    const c = mount(props());
    expect(c.querySelector('[data-mushaf-overlay]')).toBeNull();
  });

  it('shows the intro card until 0.3 s before the first word, with the surah and the range played', () => {
    const p = props({overlay: overlay({title: 'intro', introSeconds: 5})}, {timings: later(3)});
    remotion.state.frame = 0;
    const c = mount(p);
    const card = c.querySelector<HTMLElement>('[data-mushaf-overlay="intro"]')!;
    expect(card.querySelector<HTMLElement>('[data-surah-name]')!.dataset.surahName).toBe('1');
    expect(card.querySelector('[data-mushaf-overlay-part="range"]')!.textContent).toBe('Al-Fatihah · 1:2–7 · ١:٢–٧');
    cleanup();
    // The first word is at 3.331 s: the card is gone at 3.031 s (frame 91), before introSeconds.
    remotion.state.frame = 90;
    expect(mount(p).querySelector('[data-mushaf-overlay="intro"]')).not.toBeNull();
    cleanup();
    remotion.state.frame = 91;
    expect(mount(p).querySelector('[data-mushaf-overlay="intro"]')).toBeNull();
  });

  it('shows the corner label with the ayah of the word heard and the reciter', () => {
    const p = props({overlay: overlay({title: 'corner', reciter: 'Abdul Hamid Ghraio'})});
    remotion.state.frame = 30; // 1 s: 1:2:2
    expect(mount(p).querySelector('[data-mushaf-overlay="corner"]')!.textContent).toBe(
      'Al-Fatihah · 1:2 · Abdul Hamid Ghraio',
    );
    cleanup();
    remotion.state.frame = 120; // 4 s: ayah 3 (3.533-5.693)
    expect(mount(p).querySelector('[data-mushaf-overlay="corner"]')!.textContent).toBe(
      'Al-Fatihah · 1:3 · Abdul Hamid Ghraio',
    );
  });

  it('shows the header line first, in the window and one at a time, its step before the first ayah line', () => {
    const moved = later(3);
    const withHeader = [syntheticLine(1, 1), ...lines];
    const schedule = withHeaderSlots(scheduleLines(lines, moved), 1, 1.5);
    const content = {timings: moved, lines: withHeader, schedule};
    const w = windowOf(mount(props({}, content)))!;
    expect(w.dataset.lineCount).toBe('7');
    const from = lead(3.331 - 1.5) - 15;
    expect(sequences(w.parentElement!.parentElement!)[0]!.dataset.from).toBe(String(from));
    const steps = JSON.parse(w.dataset.steps!) as number[];
    expect(steps.slice(0, 2)).toEqual([lead(1.831) - from, lead(3.331) - from]);
    expect(steps.every((step, i) => i === 0 || step >= steps[i - 1]!)).toBe(true);
    cleanup();
    const c = mount(props({layout: layout({visibleLines: 0})}, content));
    expect(lineMocks(c).map((l) => `${l.dataset.page}/${l.dataset.line}`)).toEqual([
      '1/1',
      '1/3',
      '1/4',
      '1/5',
      '1/6',
      '1/7',
      '1/8',
    ]);
    const seq = sequences(c);
    expect(seq[0]!.dataset).toMatchObject({from: String(from), duration: String(lead(3.331) - 15 - from)});
    expect(seq[0]!.dataset.sequence).toBe('p1 l1 (surah_name)');
  });

  it('leaves out a header line squeezed out by a recitation that starts at once, one line at a time', () => {
    const withHeader = [syntheticLine(1, 1), ...lines];
    const schedule = withHeaderSlots(scheduleLines(lines, timings), 1, 1.5);
    expect(schedule[0]).toEqual({index: 0, start: 0, end: 0.331});
    const c = mount(props({layout: layout({visibleLines: 0})}, {lines: withHeader, schedule}));
    expect(lineMocks(c)).toHaveLength(6);
    expect(lineMocks(c)[0]!.dataset.line).toBe('3');
  });

  it('throws a clear error without resolved props', () => {
    const {container} = render(
      <Boundary>
        <MushafRecitation {...defaultMushafRecitationProps} />
      </Boundary>,
    );
    expect(container.querySelector<HTMLElement>('[data-error]')!.dataset.error).toContain('`resolved` is null');
  });
});

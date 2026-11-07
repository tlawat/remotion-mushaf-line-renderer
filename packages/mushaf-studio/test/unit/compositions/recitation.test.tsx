// @vitest-environment jsdom
// <MushafRecitation> mounted under jsdom with `remotion`, the package's two line components, the
// translations and the Studio panel mocked: what the composition builds from its props. The mocked
// lines evaluate `wordStyle` for real, on every word, at the local frame a real line would see.
import {cleanup, render} from '@testing-library/react';
import React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fatiha from '../../fixtures/timings/fatiha.json';
import {FALAQ_NAS_LINES, falaqNas} from './helpers/falaq-nas';
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
  // A line's `linePosition` is its signed distance from the window's centre slot (0 alone), as the real window gives it.
  const wordStyles = (
    props: Pick<LineProps, 'wordStyle' | 'activeWordId'>,
    lines: readonly LineData[],
    frame: number,
    position = 0,
  ) =>
    JSON.stringify(
      Object.fromEntries(
        lines.flatMap((line, index) =>
          line.words.map((word) => [
            word.id,
            props.wordStyle?.(word, {
              line,
              frame,
              fps: 30,
              active: word.id === props.activeWordId,
              inSlice: true,
              linePosition: lines.length === 1 ? 0 : index - position,
            }) ?? null,
          ]),
        ),
      ),
    );
  // The length of an entrance or exit the composition gave, in frames.
  const framesOf = (animation: LineProps['enter']) =>
    animation !== undefined && 'timing' in animation ? animation.timing?.getDurationInFrames({fps: 30}) : undefined;
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
        data-enter-frames={framesOf(props.enter)}
        data-exit-frames={framesOf(props.exit)}
        data-font-fallback={props.fontFallback ? 'yes' : 'no'}
      />
    );
  };
  const MushafLineWindow = (props: WindowProps) => {
    const frame = remotion.useLocalFrame();
    const position =
      props.steps === undefined
        ? (props.position as number)
        : actual.scrollPosition({frame, fps: 30, steps: props.steps, timing: props.scrollTiming, anchor: props.anchor});
    return (
      <div
        className="mushaf-line-window-mock"
        data-line-count={props.lines.length}
        data-steps={JSON.stringify(props.steps)}
        data-anchor={props.anchor ?? 'end'}
        data-visible-lines={props.visibleLines}
        data-neighbour-opacity={props.neighbourOpacity}
        data-scroll-frames={props.scrollTiming?.getDurationInFrames({fps: 30})}
        data-active-word-id={props.activeWordId ?? ''}
        data-active-style={JSON.stringify(props.activeWordStyle ?? null)}
        data-word-styles={wordStyles(props, props.lines, frame, position)}
        data-ink-tint={props.inkTint ?? ''}
        data-frame-color={props.frameColor ?? ''}
        data-word-band={props.wordBand === undefined ? 'no' : 'yes'}
        data-enter={props.enter ? 'yes' : 'no'}
        data-enter-frames={framesOf(props.enter)}
        data-exit-frames={framesOf(props.exit)}
      />
    );
  };
  const MushafSurahName = (props: {surah: number}) => <span data-surah-name={props.surah} />;
  return {...actual, MushafLine, MushafLineWindow, MushafSurahName};
});

vi.mock('../../../src/translations', async () => ({
  glossStripState: (
    await vi.importActual<typeof import('../../../src/translations/GlossStrip')>('../../../src/translations/GlossStrip')
  ).glossStripState,
  ayahKeyOf: (id: string | null) => (id ? id.split(':').slice(0, 2).join(':') : null),
  TranslationBlock: (props: {ayahKey: string | null; fontFamily: string; fontSize: number}) => (
    <div data-translation-block={props.ayahKey ?? ''} data-font={props.fontFamily} data-size={props.fontSize} />
  ),
  TranslationStack: (props: {
    layers: readonly {fontFamily: string; fontSize: number; direction: string; color: string}[];
    ayahKey: string | null;
    outgoing?: {ayahKey: string | null; opacity: number} | null;
    textOpacity?: number;
    opacity?: number;
  }) => (
    <div
      data-translation-stack={props.layers.length}
      data-outgoing={props.outgoing?.ayahKey ?? ''}
      data-outgoing-opacity={props.outgoing?.opacity}
      data-text-opacity={props.textOpacity}
      data-opacity={props.opacity}
    >
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
const {withHeaderSlots, withInnerHeaderSlots} = await import('../../../src/compositions/shared');
const {clipTimeline} = await import('../../../src/memorize');
const {introCardOpacity, introHandoffFrames} = await import('../../../src/overlay');
const {defaultOverlay, dissolveShares, SINE, scrollTimingFrom} = await import('../../../src/schema');
const {syntheticLine} = await import('../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;
type ResolvedRecitation = import('../../../src/compositions/recitation').ResolvedRecitation;
type StudioTimings = import('../../../src/types').StudioTimings;
type StudioTimingsV1 = import('../../../src/types').StudioTimingsV1;

class Boundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  override state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  override render() {
    return this.state.error ? <div data-error={this.state.error.message} /> : this.props.children;
  }
}

const timings = fatiha as unknown as StudioTimingsV1;
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
const basicProps = props;
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
      // The default audioFile is the sample's recording in public/, through staticFile().
      audio: `/static/${defaultMushafRecitationProps.audioFile}`,
      trimBefore: '0',
    });
    const seq = sequences(c);
    expect(seq).toHaveLength(1);
    // The window appears at once (its first line is settled 0.4 s before 0.331 s, earlier than frame
    // 0) and holds 45 frames after the last ayah's end (27.559 s, f827), then fades over 30.
    expect(seq[0]!.dataset).toMatchObject({from: '0', duration: '902', sequence: '6 lines, 3 at once'});
    const w = windowOf(c)!;
    expect(w.dataset).toMatchObject({
      lineCount: '6',
      visibleLines: '3',
      neighbourOpacity: '0.3',
      scrollFrames: '24',
      enter: 'yes',
    });
    // The first line is in the centre slot from the window's first frame (its step a whole scroll
    // before it). Every later scroll starts where it does, never earlier: once the outgoing line's
    // last word has been recited (E), or 0.4 s + 24 frames before the incoming line's first word if
    // that is later. On this recitation the pauses are short: each starts at E.
    expect(w.dataset.anchor).toBe('start');
    const steps = JSON.parse(w.dataset.steps!) as number[];
    expect(steps[0]).toBe(-24);
    const ends = [3.391, 5.693, 8.615, 12.989, 16.106].map((end) => Math.ceil(end * 30));
    expect(steps.slice(1)).toEqual(ends);
    resolved().schedule.forEach((slot, j) => {
      if (j > 0) expect(steps[j]).toBe(Math.max(ends[j - 1]!, lead(slot.start) - 24));
    });
    // The window does not move before E of a boundary: 1:2:4 (f58-f102) stays in the centre slot.
    for (let j = 1; j < steps.length; j++) {
      for (let frame = steps[j - 1]! + 24; frame <= ends[j - 1]!; frame++) {
        expect(scrollPosition({frame, fps: 30, steps, timing: scrollTimingFrom(), anchor: 'start'})).toBe(j - 1);
      }
    }
    const lineBlock = block(c, 'Mushaf lines')!;
    expect(lineBlock.contains(w)).toBe(true);
    expect(lineBlock.style.left).toBe('190px');
    expect(lineBlock.style.width).toBe('1540px');
    const lineHeight = Number.parseInt(lineBlock.style.height, 10) / 3;
    expect(lineBlock.style.top).toBe(`${Math.round((1080 - 3 * lineHeight) / 2)}px`);
    expect(block(c, 'Translation')).toBeNull();
    expect(block(c, 'Gloss')).toBeNull();
    expect(c.querySelector('[data-panel]')).toBeNull();
    expect(c.querySelector('img')).toBeNull();
    expect((c.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(248, 243, 230)');
  });

  it('places the blocks between the margins, as plain absolute boxes, moved by the offsets only', () => {
    const c = mount(props({}, {translation: ayahText, gloss: wordText}));
    for (const name of ['Mushaf lines', 'Translation', 'Gloss']) {
      const box = block(c, name)!;
      expect(box.tagName).toBe('DIV');
      expect(box.style.position).toBe('absolute');
      expect(box.style.left).toBe('190px');
      expect(box.style.width).toBe(`${1920 - 2 * 190}px`);
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

  it('follows the layout: a public audio path, a background image, the vertical position, the slow tempo', () => {
    const c = mount(
      props({
        audioFile: 'mushaf-studio/fatiha/audio.mp3',
        layout: layout({backgroundImage: 'bg.png', verticalAlign: 0, marginX: 0}),
        animation: {...defaultMushafRecitationProps.animation, tempo: 'slow'},
      }),
    );
    expect(c.querySelector<HTMLElement>('[data-audio]')?.dataset.audio).toBe('/static/mushaf-studio/fatiha/audio.mp3');
    expect(c.querySelector('img')?.dataset.src).toBe('/static/bg.png');
    const lineBlock = block(c, 'Mushaf lines')!;
    expect(lineBlock.style.top).toBe('0px');
    expect(lineBlock.style.width).toBe('1920px');
    expect(windowOf(c)!.dataset.scrollFrames).toBe('34');
    expect(mount(props({audioFile: ''})).querySelector('[data-audio]')).toBeNull();
  });

  it('trims the audio by the resolved offset, in frames', () => {
    const c = mount(props({}, {audioOffsetSeconds: 2.633}));
    expect(c.querySelector<HTMLElement>('[data-audio]')?.dataset.trimBefore).toBe('79');
  });

  it('shows one Sequence per slot when visibleLines is 0, overlapping by the staggered dissolve after each last word', () => {
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
    const froms = seq.map((s) => Number(s.dataset.from));
    const ends = seq.map((s, i) => froms[i]! + Number(s.dataset.duration));
    const mocks = lineMocks(c);
    // The first line appears over windowIn (24 frames) from frame 0, the earliest it can.
    expect(froms[0]).toBe(0);
    expect(mocks[0]!.dataset.enterFrames).toBe('24');
    // Each boundary: E the outgoing line's last word, F the incoming line's first, D = 20 frames
    // compressed to F − E (never under 10), t0 = max(E, F − 0.4 s − D_eff).
    const lastWordEnds = [3.391, 5.693, 8.615, 12.989, 16.106];
    resolved()
      .schedule.slice(1)
      .forEach((slot, k) => {
        const e = Math.ceil(lastWordEnds[k]! * 30);
        const d = Math.min(20, Math.max(10, Math.round((slot.start - lastWordEnds[k]!) * 30)));
        const t0 = Math.max(e, Math.round((slot.start - 0.4) * 30) - d);
        const {out, in: incoming} = dissolveShares(d);
        // Late, never early: the change starts once the outgoing line's last word has been recited.
        expect(t0).toBeGreaterThanOrEqual(lastWordEnds[k]! * 30);
        expect([k, ends[k]]).toEqual([k, t0 + out]);
        expect([k, froms[k + 1]]).toEqual([k, t0 + incoming]);
        expect(mocks[k]!.dataset.exitFrames).toBe(String(out));
        expect(mocks[k + 1]!.dataset.enterFrames).toBe(String(d - incoming));
        // The two Sequences overlap: the dissolve runs between them.
        expect(froms[k + 1]).toBeLessThan(ends[k]!);
      });
    // The last line holds 45 frames after the last ayah's end (f827), then fades over 30.
    expect(ends[5]).toBe(827 + 45 + 30);
    expect(mocks[5]!.dataset.exitFrames).toBe('30');
    const lineBlock = block(c, 'Mushaf lines')!;
    expect(seq.every((s) => lineBlock.contains(s))).toBe(true);
    expect(lineMocks(c).every((l) => l.dataset.enter === 'yes')).toBe(true);
  });

  it('cuts between lines under lines: cut, at t0, and rises the incoming line under rise', () => {
    const cut = sequences(
      mount(
        props({
          layout: layout({visibleLines: 0}),
          animation: {...defaultMushafRecitationProps.animation, lines: 'cut'},
        }),
      ),
    );
    const froms = cut.map((s) => Number(s.dataset.from));
    cut.slice(0, 5).forEach((s, k) => {
      expect(froms[k]! + Number(s.dataset.duration)).toBe(froms[k + 1]);
    });
    // 1:2:4 ends at 3.391 s: the cut is at f102, never before.
    expect(froms[1]).toBe(102);
    cleanup();
    const rise = lineMocks(
      mount(
        props({
          layout: layout({visibleLines: 0}),
          animation: {...defaultMushafRecitationProps.animation, lines: 'rise'},
        }),
      ),
    );
    expect(rise.every((l) => l.dataset.enter === 'yes')).toBe(true);
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
    // The window comes in over 24 frames to be settled when the first slot is (frame 108); its steps are local.
    expect(sequences(c)[0]!.dataset.from).toBe('84');
    // The first line is in place from the window's first frame; the later scrolls start once the
    // outgoing line is over (line 1's slot, collapsed to nothing, at 4.0 s: f120).
    const steps = JSON.parse(windowOf(c)!.dataset.steps!) as number[];
    expect(steps).toEqual([-24, 120 - 84, 171 - 84, 259 - 84, 390 - 84, 484 - 84]);
    expect(steps.every((step, i) => i === 0 || step >= steps[i - 1]!)).toBe(true);
    expect(() => scrollPosition({frame: 0, fps: 30, steps})).not.toThrow();
    cleanup();
    const seq = sequences(mount(props({layout: layout({visibleLines: 0})}, content)));
    const froms = seq.map((s) => Number(s.dataset.from));
    // Never a Sequence that starts before the one before it, and every one has frames of its own.
    expect(froms.every((from, i) => i === 0 || from >= froms[i - 1]!)).toBe(true);
    expect(seq.every((s) => Number(s.dataset.duration) > 0)).toBe(true);
    expect(froms[0]).toBe(84);
    cleanup();
    // The translation changes after ayah 2's end (3.391 s, f102), whichever line is on screen.
    remotion.state.frame = 114;
    expect(translationOf(mount(props({}, {...content, timings: ayahsOnly, translation: ayahText})))).toBe('1:3');
  });

  it('gives the lines a band to draw only under a wash, and the header frame in the metal toward the ground', () => {
    const ink = windowOf(mount(props()))!;
    expect(ink.dataset.wordBand).toBe('no');
    // The default rosette gold, #8c6c26, 30 % into the ivory.
    expect(ink.dataset.frameColor).toBe('#ac9560');
    cleanup();
    expect(windowOf(mount(props({highlight: highlight({style: 'wash'})})))!.dataset.wordBand).toBe('yes');
    cleanup();
    // A tint on a tajweed theme is shown as a wash: the band, and no letter repainted.
    const tajweed = windowOf(mount(props({theme: 'light', highlight: highlight({style: 'tint'})})))!;
    expect(tajweed.dataset.wordBand).toBe('yes');
    expect(tajweed.dataset.inkTint).toBe('');
  });

  it('names the word being recited, and marks it only through the word style, by frame', () => {
    expect(windowOf(mount(props()))!.dataset.activeWordId).toBe('');
    remotion.state.frame = 30; // 1 s: 1:2:2 (0.901-1.521)
    const word = windowOf(mount(props()))!;
    expect(word.dataset.activeWordId).toBe('1:2:2');
    expect(JSON.parse(word.dataset.activeStyle!)).toBeNull();
    expect(stylesOf(word)['1:2:1']).toBeNull();
    cleanup();
    // Under plain a tint is the word's CSS colour, eased into the accent read at 5:1 on the ivory page.
    const tint = windowOf(mount(props({theme: 'plain', highlight: highlight({style: 'tint'})})))!;
    expect(stylesOf(tint)['1:2:2']?.color).toMatch(/^rgba\(/);
    expect(stylesOf(tint)['1:2:4']).toBeNull();
    expect(tint.dataset.inkTint).toBe('');
    cleanup();
    // Under a colour-font theme the lines get the tint palettes, the default Mushaf palette included.
    expect(windowOf(mount(props({highlight: highlight({style: 'tint'})})))!.dataset.inkTint).toBe('#806321');
    cleanup();
    expect(windowOf(mount(props({theme: 'black', highlight: highlight({style: 'tint'})})))!.dataset.inkTint).toBe(
      '#806321',
    );
    cleanup();
    const none = windowOf(mount(props({highlight: highlight({mode: 'none'})})))!;
    expect(none.dataset.activeWordId).toBe('');
    expect(Object.values(stylesOf(none)).every((style) => style === null)).toBe(true);
    cleanup();
    const perLine = lineMocks(mount(props({layout: layout({visibleLines: 0})})));
    expect(perLine.every((l) => l.dataset.activeWordId === '1:2:2')).toBe(true);
  });

  it('rests the words still to come on the current line in ink, by the audio time of each line', () => {
    remotion.state.frame = 40; // 1.33 s: 1:2:1 and 1:2:2 heard, 1:2:3 (1.521) not yet
    const styles = stylesOf(windowOf(mount(props()))!);
    expect(styles['1:2:1']).toBeNull();
    expect(styles['1:2:2']).toBeNull();
    expect(styles['1:2:3']).toEqual({opacity: 0.6});
    // The ayah-end marker rests until its own time (3.391).
    expect(styles['1:2:5']).toEqual({opacity: 0.6});
    // The next line sits in the slot below: full ink, only the window's neighbour opacity.
    expect(styles['1:3:1']).toBeNull();
    cleanup();
    // One line at a time: the line of ayah 3 sits in a Sequence from frame 105 (the dissolve after
    // 1:2:4 starts at f102), and at 4 s its local frame 15 still maps to 4 s of audio, where 1:3:1
    // (3.533) was heard and 1:3:2 (4.563) not.
    remotion.state.frame = 120;
    const perLine = lineMocks(mount(props({layout: layout({visibleLines: 0})})));
    const ayah3 = perLine.find((l) => l.dataset.line === '4')!;
    expect(sequences(ayah3.ownerDocument.body)[1]!.dataset.from).toBe('105');
    expect(stylesOf(ayah3)['1:3:1']).toBeNull();
    expect(stylesOf(ayah3)['1:3:2']).toEqual({opacity: 0.6});
    cleanup();
    // Under ink the neighbours stay 0.2 under the resting words.
    expect(windowOf(mount(props({layout: layout({neighbourOpacity: 0.5})})))!.dataset.neighbourOpacity).toBe('0.4');
  });

  it('underlines the doubtful words in the Studio preview only', () => {
    const doubtful = {'1:2:2': ['low-confidence' as const]};
    // Nothing marked, so the underline is all there is to see.
    const props = (changes: Partial<MushafRecitationProps> = {}, content: Partial<ResolvedRecitation> = {}) =>
      basicProps({highlight: highlight({mode: 'none'}), ...changes}, content);
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
      // `auto`: the web font of the translation's language, EB Garamond for English.
      font: '"EB Garamond", serif',
      size: '36',
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
    // It changes after ayah 2's last word, whatever the highlight: 1:2:4 ends at 3.391 s (f101.7), so
    // f101 still shows ayah 2 alone, and from f102 the two dissolve over 10 frames (the pause to
    // 1:3:1 at 3.533 s is short), the outgoing gone by f107.
    remotion.state.frame = 101;
    expect(translationOf(mount(props({highlight: highlight({mode: 'none'})}, {translation: ayahText})))).toBe('1:2');
    cleanup();
    for (const [frame, outgoing] of [
      [102, '1'],
      [104, String(1 - SINE(2 / 5))],
    ] as const) {
      remotion.state.frame = frame;
      const stack = block(mount(props({}, {translation: ayahText})), 'Translation')!.firstElementChild as HTMLElement;
      expect(stack.dataset).toMatchObject({outgoing: '1:2', textOpacity: '0'});
      expect(Number(stack.dataset.outgoingOpacity)).toBeCloseTo(Number(outgoing), 6);
      cleanup();
    }
    remotion.state.frame = 112;
    const settled = block(mount(props({}, {translation: ayahText})), 'Translation')!.firstElementChild as HTMLElement;
    expect(settled.dataset).toMatchObject({outgoing: '', textOpacity: '1'});
    cleanup();
    remotion.state.frame = 90;
    // Without per-word times the change follows the ayah's end (3.391 s), and before the first ayah it is the first.
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
    // In a drop-in slot the panel is the slot's, docked beside the box: the composition draws none.
    const inSlot = render(<MushafRecitation {...props({fonts: 'package'})} panel={false} />).container;
    expect(inSlot.querySelector('[data-panel]')).toBeNull();
    expect(inSlot.textContent).toContain('registerMushafFonts');
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

  it('shows the intro card for its whole introSeconds on the bare ground, the lines as it goes and the recording after it', () => {
    // calculateMetadata put 3 s + 0.8 s + 0.4 s − 0.331 s = 3.869 s before the recording: the first word is at 4.2 s.
    const p = props(
      {overlay: overlay({title: 'intro', introSeconds: 3})},
      {timings: later(3.869), introDelaySeconds: 3.869},
    );
    const intro = (frame: number) => {
      cleanup();
      remotion.state.frame = frame;
      return mount(p).querySelector<HTMLElement>('[data-mushaf-overlay="intro"]');
    };
    // Frame 0 is the bare ground; the card comes in from 0.2 s.
    expect(intro(0)).toBeNull();
    const card = intro(30)!;
    expect(card.querySelector<HTMLElement>('[data-surah-name]')!.dataset.surahName).toBe('1');
    expect(card.querySelector('[data-mushaf-overlay-part="arabic-range"]')!.textContent).toBe('\u2067الآيات ٢–٧\u2069');
    expect(card.querySelector('[data-mushaf-overlay-part="range"]')!.textContent).toBe('Ayat 2–7');
    // No ground of its own: it is drawn on the page, and nothing is under it.
    expect(card.querySelector('[data-mushaf-overlay-part="backdrop"]')).toBeNull();
    expect(intro(89)).not.toBeNull();
    expect(intro(90)).toBeNull();
    // The window comes in as the card goes: 7 frames before introSeconds (f90), from the first
    // frame the card is under 0.25, so the frame never dips to bare paper between them.
    expect(introCardOpacity(83 / 30, 3)).toBeLessThan(0.25);
    expect(introCardOpacity(82 / 30, 3)).toBeGreaterThanOrEqual(0.25);
    expect(introHandoffFrames('calm', 30)).toBe(7);
    expect(intro(90)).toBeNull();
    const c = document.body;
    const window = sequences(c).find((s) => s.dataset.sequence?.endsWith('at once'))!;
    expect(window.dataset.from).toBe('83');
    // The recording starts after the card: its <Audio> sits in a Sequence from the delay.
    const recitation = sequences(c).find((s) => s.dataset.sequence === 'Recitation')!;
    expect(recitation.dataset.from).toBe(String(Math.round(3.869 * 30)));
    expect(recitation.querySelector('[data-audio]')).not.toBeNull();
  });

  it('shows the corner label with the surah and the ayah on screen, the number changing after the ayah ends', () => {
    const p = props({overlay: overlay({title: 'corner', reciter: 'Abdul Hamid Ghraio'})});
    const corner = (frame: number) => {
      cleanup();
      remotion.state.frame = frame;
      return mount(p).querySelector<HTMLElement>('[data-mushaf-overlay="corner"]');
    };
    // Without a card it comes in from 0.5 s over 24 frames, at 60 % of its ink; no reciter in it.
    expect(corner(0)).toBeNull();
    expect(corner(30)!.textContent).toBe('Al-Fatihah · 2');
    expect(Number(corner(30)!.style.opacity)).toBeCloseTo(0.6 * SINE(15 / 24), 4);
    expect(corner(60)!.style.opacity).toBe('0.6');
    // The number dissolves over 12 frames from the translation's change (f102).
    expect(corner(101)!.textContent).toBe('Al-Fatihah · 2');
    const changing = corner(106)!;
    expect(changing.querySelector('[data-mushaf-overlay-part="outgoing"]')!.textContent).toBe('2');
    expect(changing.textContent).toBe('Al-Fatihah · 23');
    expect(corner(120)!.textContent).toBe('Al-Fatihah · 3');
  });

  it('shows the header line first, in the window and one at a time, its step before the first ayah line', () => {
    const moved = later(3);
    const withHeader = [syntheticLine(1, 1), ...lines];
    const schedule = withHeaderSlots(scheduleLines(lines, moved), 1, 1.5);
    const content = {timings: moved, lines: withHeader, schedule};
    const w = windowOf(mount(props({}, content)))!;
    expect(w.dataset.lineCount).toBe('7');
    // The window comes in over 24 frames to be settled 0.4 s before the header's slot (1.831 s, f43).
    const from = lead(1.831) - 24;
    expect(sequences(w.parentElement!.parentElement!)[0]!.dataset.from).toBe(String(from));
    const steps = JSON.parse(w.dataset.steps!) as number[];
    // The header has nothing to wait for: the first ayah line scrolls in to be settled 0.4 s before its word.
    expect(steps.slice(0, 2)).toEqual([-24, lead(3.331) - 24 - from]);
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
    // It gives way by a 20-frame dissolve settled 0.4 s before the first word: t0 = f88 − 20, out over 10.
    expect(seq[0]!.dataset).toMatchObject({from: String(from), duration: String(68 + 10 - from)});
    expect(seq[0]!.dataset.sequence).toBe('p1 l1 (surah_name)');
    expect(seq[1]!.dataset.from).toBe(String(68 + 6));
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

describe('<MushafRecitation> across surahs', () => {
  const v2 = falaqNas as unknown as StudioTimings;
  const content = {
    timings: v2,
    lines: FALAQ_NAS_LINES,
    schedule: withInnerHeaderSlots(scheduleLines(FALAQ_NAS_LINES, v2), FALAQ_NAS_LINES, v2, 1.5),
  };

  it('names both surahs in the intro card, and the surah heard in the corner label', () => {
    remotion.state.frame = 30;
    const card = mount(props({overlay: overlay({title: 'intro'})}, content)).querySelector<HTMLElement>(
      '[data-mushaf-overlay="intro"]',
    )!;
    expect(card.querySelector<HTMLElement>('[data-surah-name]')!.dataset.surahName).toBe('113');
    expect(card.querySelector('[data-mushaf-overlay-part="range"]')!.textContent).toBe('Ayat 113:4–114:2');
    expect(card.querySelector('[data-mushaf-overlay-part="arabic-range"]')!.textContent).toBe(
      '\u2067الآيات ١١٣:٤–١١٤:٢\u2069',
    );
    cleanup();
    const p = props({overlay: overlay({title: 'corner'})}, content);
    remotion.state.frame = 150; // 5 s: 113:5
    expect(mount(p).querySelector('[data-mushaf-overlay="corner"]')!.textContent).toBe('Al-Falaq · 5');
    cleanup();
    remotion.state.frame = 420; // 14 s: 114:1
    expect(mount(p).querySelector('[data-mushaf-overlay="corner"]')!.textContent).toBe('An-Nas · 1');
  });

  it('shows An-Nas’s header lines between the two surahs, one at a time', () => {
    const c = mount(props({layout: layout({visibleLines: 0})}, content));
    expect(lineMocks(c).map((l) => `${l.dataset.page}/${l.dataset.line}`)).toEqual([
      '604/9',
      '604/10',
      '604/11',
      '604/12',
      '604/13',
      '604/14',
    ]);
    const names = sequences(c).map((seq) => seq.dataset.sequence);
    expect(names).toContain('p604 l11 (surah_name)');
    expect(names).toContain('p604 l12 (basmallah)');
  });

  it('names each play of an ayah by its surah when ayahs repeat, every key its own', () => {
    const memorize = {...defaultMushafRecitationProps.memorize, mode: 'repeat' as const, repeat: 2, pauseSeconds: 0.5};
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const c = mount(
        props({memorize}, {...content, clips: clipTimeline(v2, memorize)} as Partial<ResolvedRecitation>),
      );
      const audio = sequences(c)
        .map((seq) => seq.dataset.sequence!)
        .filter((name) => name.startsWith('Ayah '));
      expect(audio).toEqual([
        'Ayah 113:4 (1/2)',
        'Ayah 113:4 (2/2)',
        'Ayah 113:5 (1/2)',
        'Ayah 113:5 (2/2)',
        'Ayah 114:1 (1/2)',
        'Ayah 114:1 (2/2)',
        'Ayah 114:2 (1/2)',
        'Ayah 114:2 (2/2)',
      ]);
      expect(error.mock.calls.flat().join(' ')).not.toContain('same key');
    } finally {
      error.mockRestore();
    }
  });
});

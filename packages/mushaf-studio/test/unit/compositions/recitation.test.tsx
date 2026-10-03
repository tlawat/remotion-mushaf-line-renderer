// @vitest-environment jsdom
// <MushafRecitation> mounted under jsdom with `remotion`, the package's two line components, the
// translations and the Studio panel mocked: what the composition builds from its props.
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

type LineProps = import('@tlawat/remotion-mushaf-line').MushafLineProps & {
  line: import('@tlawat/remotion-mushaf-line').MushafLineData;
};
type WindowProps = import('@tlawat/remotion-mushaf-line').MushafLineWindowProps;
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>();
  // The style of the line's first word at local frame 0, so a test sees what `wordStyle` paints.
  const firstWordStyle = (props: Pick<LineProps, 'wordStyle'>, line: LineProps['line']) =>
    JSON.stringify(props.wordStyle?.(line.words[0]!, {line, frame: 0, fps: 30, active: false, inSlice: true}) ?? null);
  const MushafLine = (props: LineProps) => (
    <span
      className="mushaf-line-mock"
      data-page={props.line.page}
      data-line={props.line.line}
      data-slice={JSON.stringify(props.line.slice ?? null)}
      data-active-word-id={props.activeWordId ?? ''}
      data-active-style={JSON.stringify(props.activeWordStyle ?? null)}
      data-word-style={firstWordStyle(props, props.line)}
      data-enter={props.enter ? 'yes' : 'no'}
      data-font-fallback={props.fontFallback ? 'yes' : 'no'}
    />
  );
  const MushafLineWindow = (props: WindowProps) => (
    <div
      className="mushaf-line-window-mock"
      data-line-count={props.lines.length}
      data-steps={JSON.stringify(props.steps)}
      data-visible-lines={props.visibleLines}
      data-neighbour-opacity={props.neighbourOpacity}
      data-scroll-frames={props.scrollTiming?.getDurationInFrames({fps: 30})}
      data-active-word-id={props.activeWordId ?? ''}
      data-active-style={JSON.stringify(props.activeWordStyle ?? null)}
      data-word-style={firstWordStyle(props, props.lines[0]!)}
      data-enter={props.enter ? 'yes' : 'no'}
    />
  );
  return {...actual, MushafLine, MushafLineWindow};
});

vi.mock('../../../src/translations', () => ({
  ayahKeyOf: (id: string | null) => (id ? id.split(':').slice(0, 2).join(':') : null),
  TranslationBlock: (props: {ayahKey: string | null; fontFamily: string; fontSize: number}) => (
    <div data-translation-block={props.ayahKey ?? ''} data-font={props.fontFamily} data-size={props.fontSize} />
  ),
  GlossStrip: (props: {activeWordId: string | null; translation: unknown; transliteration: unknown}) => (
    <div
      data-gloss-strip={props.activeWordId ?? ''}
      data-has-gloss={props.translation ? 'yes' : 'no'}
      data-has-transliteration={props.transliteration ? 'yes' : 'no'}
    />
  ),
}));
vi.mock('../../../src/studio', () => ({
  MushafStudioPanel: (props: {compositionId: string}) => <div data-panel={props.compositionId} />,
  isInStudio: () => false,
}));

const {MushafRecitation, defaultMushafRecitationProps} = await import('../../../src/compositions/recitation');
const {scheduleLines} = await import('@tlawat/remotion-mushaf-line');
const {registerMushafFonts} = await import('../../../src/fonts');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;
type StudioResolvedRecitation = import('../../../src/compositions/recitation').StudioResolvedRecitation;
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
const resolved = (changes: Partial<StudioResolvedRecitation> = {}): StudioResolvedRecitation => ({
  timings,
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
  content: Partial<StudioResolvedRecitation> = {},
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
const block = (c: HTMLElement, name: string) => c.querySelector<HTMLElement>(`[data-interactive="${name}"]`);
const windowOf = (c: HTMLElement) => c.querySelector<HTMLElement>('.mushaf-line-window-mock');
const lineMocks = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.mushaf-line-mock'));

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
    expect(c.querySelector<HTMLElement>('[data-audio]')?.dataset.audio).toBe(defaultMushafRecitationProps.audioFile);
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
    const steps = resolved().schedule.map((slot) => Math.round((slot.start - 0.4) * 30));
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
    const starts = resolved().schedule.map((slot) => Math.max(0, Math.round((slot.start - 0.4) * 30) - 15));
    expect(seq.map((s) => Number(s.dataset.from))).toEqual(starts);
    expect(seq.slice(0, 5).map((s) => Number(s.dataset.duration))).toEqual(
      starts.slice(1).map((next, i) => next - starts[i]!),
    );
    expect(Number(seq[5]!.dataset.duration)).toBe(Math.round((27.559 + 1) * 30) - starts[5]!);
    const lineBlock = block(c, 'Mushaf lines')!;
    expect(seq.every((s) => lineBlock.contains(s))).toBe(true);
    expect(lineMocks(c).every((l) => l.dataset.enter === 'yes')).toBe(true);
  });

  it('marks the word being recited, by frame, in the way the highlight asks', () => {
    expect(windowOf(mount(props()))!.dataset.activeWordId).toBe('');
    remotion.state.frame = 30; // 1 s: 1:2:2 (0.901-1.521)
    const word = windowOf(mount(props()))!;
    expect(word.dataset.activeWordId).toBe('1:2:2');
    expect(JSON.parse(word.dataset.activeStyle!)).toEqual({color: '#c8a45c'});
    expect(JSON.parse(word.dataset.wordStyle!)).toBeNull();
    cleanup();
    const ayah = windowOf(mount(props({highlight: highlight({mode: 'ayah', style: 'glow'})})))!;
    expect(ayah.dataset.activeWordId).toBe('1:2:2');
    expect(JSON.parse(ayah.dataset.activeStyle!)).toBeNull();
    expect(JSON.parse(ayah.dataset.wordStyle!)).toEqual({color: '#c8a45c', textShadow: '0 0 0.25em #c8a45c'});
    cleanup();
    const none = windowOf(mount(props({highlight: highlight({mode: 'none'})})))!;
    expect(none.dataset.activeWordId).toBe('');
    expect(JSON.parse(none.dataset.activeStyle!)).toBeNull();
    cleanup();
    const perLine = lineMocks(mount(props({layout: layout({visibleLines: 0})})));
    expect(perLine.every((l) => l.dataset.activeWordId === '1:2:2')).toBe(true);
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
    expect(
      block(mount(props({}, {translation: ayahText})), 'Translation')!.querySelector<HTMLElement>(
        '[data-translation-block]',
      )!.dataset.translationBlock,
    ).toBe('1:3');
    cleanup();
    // With the highlight off, the current line decides.
    remotion.state.frame = 102; // 3.4 s: line 2 is in place (its lead-in started at 3.133)
    expect(
      block(
        mount(props({highlight: highlight({mode: 'none'})}, {translation: ayahText})),
        'Translation',
      )!.querySelector<HTMLElement>('[data-translation-block]')!.dataset.translationBlock,
    ).toBe('1:3');
  });

  it('shows the gloss strip only with a gloss or a transliteration', () => {
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
  });

  it('renders the panel and the fonts warning in the Studio only', () => {
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

  it('throws a clear error without resolved props', () => {
    const {container} = render(
      <Boundary>
        <MushafRecitation {...defaultMushafRecitationProps} />
      </Boundary>,
    );
    expect(container.querySelector<HTMLElement>('[data-error]')!.dataset.error).toContain('`resolved` is null');
  });
});

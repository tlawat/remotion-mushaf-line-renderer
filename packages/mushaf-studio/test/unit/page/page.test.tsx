// @vitest-environment jsdom
// <MushafPage> mounted under jsdom with `remotion` and the package's line component and font loader
// mocked, on the synthetic surah 2 that runs from page 2 onto page 3: what the composition builds.
// The mocked line evaluates `wordStyle` for real, on every word, at the local frame a real one sees.
import {cleanup, render} from '@testing-library/react';
import React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {falaqNas, falaqNasLinesFor, PAGE_604} from '../compositions/helpers/falaq-nas';
import {createRemotionMock} from '../compositions/helpers/remotion-mock';
import {fetchJson, staticFile, surah2Timings, syntheticMushafLines} from './helpers';

const remotion = createRemotionMock();
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
}));

const mocks = vi.hoisted(() => ({loadPageFont: vi.fn(), getMushafLines: vi.fn(), getMushafLinesForRanges: vi.fn()}));
type LineData = import('@tlawat/remotion-mushaf-line').MushafLineData;
type LineProps = import('@tlawat/remotion-mushaf-line').MushafLineProps & {line: LineData};
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>();
  const MushafLine = (props: LineProps) => {
    const frame = remotion.useLocalFrame();
    const styles = Object.fromEntries(
      props.line.words.map((word) => [
        word.id,
        props.wordStyle?.(word, {
          line: props.line,
          frame,
          fps: 30,
          active: word.id === props.activeWordId,
          inSlice: true,
        }) ?? null,
      ]),
    );
    return (
      <span
        className="mushaf-line-mock"
        data-type={props.line.type}
        data-fit={props.fit}
        data-font-size={props.fontSize}
        data-line-height={props.lineHeight}
        data-active-word-id={props.activeWordId ?? ''}
        data-word-styles={JSON.stringify(styles)}
      />
    );
  };
  return {
    ...actual,
    MushafLine,
    getMushafLines: (options: unknown) => mocks.getMushafLines(options),
    getMushafLinesForRanges: (ranges: unknown, options: unknown) => mocks.getMushafLinesForRanges(ranges, options),
    loadPageFont: (options: unknown) => mocks.loadPageFont(options),
  };
});

const {MushafPage, defaultMushafPageProps, defaultPageView, OUTSIDE_OPACITY, pageGeometry, resolvePage} = await import(
  '../../../src/page'
);
type MushafPageProps = import('../../../src/page').MushafPageProps;
type PageView = import('../../../src/page').PageView;

class Boundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  override state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  override render() {
    return this.state.error ? <div data-error={this.state.error.message} /> : this.props.children;
  }
}

const props = async (
  changes: Partial<MushafPageProps> = {},
  view: Partial<PageView> = {},
): Promise<MushafPageProps> => {
  const p: MushafPageProps = {
    ...defaultMushafPageProps,
    timingsFile: 'surah2.json',
    audioFile: 'audio.mp3',
    ...changes,
    pageView: {...defaultPageView, ...view},
  };
  return {...p, resolved: await resolvePage(p, {fetch: fetchJson(surah2Timings), staticFile})};
};
const mount = (p: MushafPageProps) => render(<MushafPage {...p} />).container;
const at = (seconds: number) => {
  remotion.state.frame = Math.round(seconds * 30);
};
const page = (root: HTMLElement, n: number) => root.querySelector<HTMLElement>(`[data-mushaf-page="${n}"]`)!;
const slot = (root: HTMLElement, p: number, line: number) =>
  page(root, p).querySelector<HTMLElement>(`[data-page-line="${line}"]`)!;
const wordStyles = (root: HTMLElement, p: number, line: number): Record<string, {opacity?: number} | null> =>
  JSON.parse(slot(root, p, line).querySelector<HTMLElement>('.mushaf-line-mock')!.dataset.wordStyles!);
/** The style of the wrapper the page's turn is applied to. */
const leaf = (root: HTMLElement, n: number) => page(root, n).parentElement!.style;

beforeEach(() => {
  remotion.reset();
  remotion.state.durationInFrames = 330;
  mocks.loadPageFont.mockReset();
  mocks.getMushafLines.mockReset();
  mocks.getMushafLines.mockImplementation(async (options: never) => syntheticMushafLines(options));
});
afterEach(cleanup);

describe('<MushafPage>: the page', () => {
  it('shows every line of each page in its row, headers included, fitted to the page’s measure', async () => {
    const root = mount(await props());
    const g = pageGeometry(defaultMushafPageProps.layout, {width: 1920, height: 1080});
    const types = (n: number) =>
      [...page(root, n).querySelectorAll<HTMLElement>('.mushaf-line-mock')].map((l) => l.dataset.type);
    expect(types(2)).toEqual(['surah_name', 'basmallah', 'ayah', 'ayah']);
    expect(types(3)).toEqual(['ayah', 'ayah', 'surah_name', 'ayah']);
    const line = slot(root, 2, 3).querySelector<HTMLElement>('.mushaf-line-mock')!;
    expect(line.dataset.fit).toBe('line');
    expect(Number(line.dataset.fontSize)).toBe(g.fontSize);
    expect(Number(line.dataset.lineHeight)).toBe(g.lineHeight);
    // The synthetic pages have four lines: centred in the 15-line grid, in printed order.
    expect(slot(root, 2, 1).style.top).toBe(`${Math.round(5.5 * g.lineHeight)}px`);
    expect(slot(root, 2, 2).style.top).toBe(`${Math.round(6.5 * g.lineHeight)}px`);
    expect(page(root, 2).style.width).toBe(`${g.width}px`);
    expect(page(root, 2).style.left).toBe(`${g.left}px`);
  });

  it('puts one Sequence per page, the outgoing one held through the next one’s turn', async () => {
    const root = mount(await props());
    const sequences = [...root.querySelectorAll<HTMLElement>('[data-sequence]')];
    expect(sequences.map((s) => [s.dataset.sequence, s.dataset.from, s.dataset.duration])).toEqual([
      ['Page 2', '0', String(162 + 18)],
      ['Page 3', '162', String(330 - 162)],
    ]);
  });

  it('cuts without overlap', async () => {
    const root = mount(await props({}, {turn: 'cut'}));
    const sequences = [...root.querySelectorAll<HTMLElement>('[data-sequence]')];
    expect(sequences.map((s) => s.dataset.duration)).toEqual(['162', '168']);
    at(5.5);
    expect(leaf(mount(await props({}, {turn: 'cut'})), 3).transform).toBe('');
  });

  it('dims the words outside the passage, at both ends, and another surah’s header', async () => {
    at(4);
    const root = mount(await props({fromAyah: 2, toAyah: 3}));
    const p2l3 = wordStyles(root, 2, 3);
    expect(Object.values(p2l3).every((style) => style?.opacity === OUTSIDE_OPACITY)).toBe(true);
    expect(Object.values(wordStyles(root, 2, 4)).every((style) => style?.opacity !== OUTSIDE_OPACITY)).toBe(true);
    const p3l2 = wordStyles(root, 3, 2);
    expect(p3l2['2:3:2']?.opacity).not.toBe(OUTSIDE_OPACITY);
    expect(p3l2['2:4:1']?.opacity).toBe(OUTSIDE_OPACITY);
    expect(p3l2['2:4:2']?.opacity).toBe(OUTSIDE_OPACITY);
    // Surah 2's header heads the passage's surah and stays; surah 3's is dimmed with its words.
    expect(slot(root, 2, 1).style.opacity).toBe('');
    expect(slot(root, 3, 3).style.opacity).toBe(String(OUTSIDE_OPACITY));
    expect(Object.values(wordStyles(root, 3, 4)).every((style) => style?.opacity === OUTSIDE_OPACITY)).toBe(true);
  });

  it('follows a recitation across surahs: what neither surah recites is dimmed, An-Nas’s header is not', async () => {
    mocks.getMushafLines.mockImplementation(async (options: {page?: number}) =>
      options.page === 604 ? PAGE_604 : syntheticMushafLines(options as never),
    );
    mocks.getMushafLinesForRanges.mockImplementation(async (ranges: Parameters<typeof falaqNasLinesFor>[0]) =>
      falaqNasLinesFor(ranges),
    );
    const p: MushafPageProps = {...defaultMushafPageProps, timingsFile: 'falaq-nas.json', audioFile: 'audio.mp3'};
    const resolved = await resolvePage(p, {fetch: fetchJson(falaqNas), staticFile});
    at(14);
    const root = mount({...p, resolved});
    expect(Object.values(wordStyles(root, 604, 8)).every((style) => style?.opacity === OUTSIDE_OPACITY)).toBe(true);
    expect(Object.values(wordStyles(root, 604, 10)).every((style) => style?.opacity !== OUTSIDE_OPACITY)).toBe(true);
    expect(Object.values(wordStyles(root, 604, 13)).every((style) => style?.opacity !== OUTSIDE_OPACITY)).toBe(true);
    expect(slot(root, 604, 11).style.opacity).toBe('');
    expect(slot(root, 604, 12).style.opacity).toBe('');
    expect(slot(root, 604, 13).dataset.current).toBe('true');
  });

  it('highlights the word being heard', async () => {
    at(4.5);
    const root = mount(await props());
    expect(slot(root, 2, 4).querySelector<HTMLElement>('.mushaf-line-mock')!.dataset.activeWordId).toBe('2:2:2');
    const none = mount(await props({highlight: {...defaultMushafPageProps.highlight, mode: 'none'}}));
    expect(slot(none, 2, 4).querySelector<HTMLElement>('.mushaf-line-mock')!.dataset.activeWordId).toBe('');
  });
});

describe('<MushafPage>: the current line', () => {
  const marks = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-line-highlight]')];

  it('draws the band behind the current line only, in its slot', async () => {
    at(4);
    const root = mount(await props());
    expect(marks(root)).toHaveLength(1);
    const band = marks(root)[0]!;
    expect(band.dataset.lineHighlight).toBe('band');
    expect(band.parentElement).toBe(slot(root, 2, 4));
    expect(slot(root, 2, 4).dataset.current).toBe('true');
    expect(band.style.position).toBe('absolute');
    expect(band.style.background).toBe('rgba(200, 164, 92, 0.18)');
    // Behind the line: before it in the slot, the line positioned over it.
    expect(band.nextElementSibling!.querySelector('.mushaf-line-mock')).not.toBeNull();
  });

  it('moves with the recitation across the page boundary, and marks nothing before the first word', async () => {
    const p = await props();
    at(0.2);
    expect(marks(mount(p))).toHaveLength(0);
    cleanup();
    at(8.5);
    const root = mount(p);
    expect(marks(root)).toHaveLength(1);
    expect(marks(root)[0]!.parentElement).toBe(slot(root, 3, 2));
  });

  it('draws a rule for underline and nothing for none', async () => {
    at(4);
    expect(marks(mount(await props({}, {lineHighlight: 'underline'})))[0]!.dataset.lineHighlight).toBe('underline');
    cleanup();
    expect(marks(mount(await props({}, {lineHighlight: 'none'})))).toHaveLength(0);
  });

  it('dims the other lines with dimOtherLines', async () => {
    at(4);
    const root = mount(await props({}, {dimOtherLines: 0.5}));
    expect(slot(root, 2, 4).style.opacity).toBe('');
    expect(slot(root, 2, 3).style.opacity).toBe('0.5');
    expect(slot(root, 2, 1).style.opacity).toBe('0.5');
  });
});

describe('<MushafPage>: the page around the lines', () => {
  it('draws the border as asked', async () => {
    const simple = mount(await props());
    expect(page(simple, 2).querySelector('svg')!.getAttribute('data-page-frame')).toBe('simple');
    expect(page(simple, 2).querySelectorAll('svg rect')).toHaveLength(2);
    expect(page(simple, 2).querySelectorAll('[data-corner]')).toHaveLength(0);
    cleanup();
    const ornate = mount(await props({}, {frame: 'ornate'}));
    expect(page(ornate, 2).querySelectorAll('[data-corner]')).toHaveLength(4);
    cleanup();
    expect(page(mount(await props({}, {frame: 'none'})), 2).querySelector('svg')).toBeNull();
  });

  it('numbers the page in Arabic-Indic digits, or not', async () => {
    const root = mount(await props());
    expect(page(root, 2).querySelector('[data-page-number]')!.textContent).toBe('٢');
    expect(page(root, 3).querySelector('[data-page-number]')!.textContent).toBe('٣');
    cleanup();
    expect(page(mount(await props({}, {pageNumber: false})), 2).querySelector('[data-page-number]')).toBeNull();
  });

  it('slides the next page in from the left while the one read goes right', async () => {
    const p = await props();
    at(5.7); // halfway through the turn that starts at 5.4 s
    const root = mount(p);
    const x = (n: number) => Number(/translateX\((-?\d+)px\)/.exec(leaf(root, n).transform)?.[1] ?? 0);
    expect(x(3)).toBeLessThan(0);
    expect(x(2)).toBeGreaterThan(0);
    expect(x(2) - x(3)).toBe(1920);
    cleanup();
    at(7);
    const settled = mount(p);
    expect(leaf(settled, 3).transform).toBe('');
  });

  it('cross-fades with fade', async () => {
    at(5.7);
    const root = mount(await props({}, {turn: 'fade'}));
    expect(Number(leaf(root, 3).opacity)).toBeCloseTo(0.5, 1);
    expect(Number(leaf(root, 2).opacity)).toBeCloseTo(0.5, 1);
  });

  it('preloads the next page’s font one page ahead, from the lines’ own sources', async () => {
    mount(await props({fonts: 'cdn'}));
    expect(mocks.loadPageFont.mock.calls.map(([options]) => options)).toEqual([
      {mushaf: 'qpc-v4', theme: 'plain', page: 3, fontSrc: undefined, fallback: undefined},
    ]);
  });

  it('plays the audio from the offset and throws a studio error without resolved', async () => {
    const root = mount(await props());
    expect(root.querySelector<HTMLElement>('[data-audio]')!.dataset.audio).toBe('/static/audio.mp3');
    cleanup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {container} = render(
      <Boundary>
        <MushafPage {...defaultMushafPageProps} />
      </Boundary>,
    );
    expect(container.querySelector<HTMLElement>('[data-error]')!.dataset.error).toMatch(/`resolved` is null/);
  });
});

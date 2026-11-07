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

// The panel as a marker: whether the page docks it, and with which composition id.
vi.mock('../../../src/studio', () => ({
  MushafStudioPanel: (props: {compositionId: string}) => <div data-panel={props.compositionId} />,
  isInStudio: () => false,
}));

const {
  MushafPage,
  defaultMushafPageProps,
  defaultPageView,
  OUTSIDE_OPACITY,
  pageDimPresence,
  pageGeometry,
  pageLineDim,
  pageLineEmphasis,
  pageReserve,
  pageTurns,
  resolvePage,
} = await import('../../../src/page');
const {jadwalRules} = await import('../../../src/background');
const {legendBand} = await import('../../../src/compositions/parts');
const {frameGeometry, SOFT, tempoFrames} = await import('../../../src/schema/tokens');
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
    const g = pageGeometry({width: 1920, height: 1080});
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

  it('puts one Sequence per page, the two overlapping by the staggered dissolve after the last word', async () => {
    const root = mount(await props());
    const sequences = [...root.querySelectorAll<HTMLElement>('[data-sequence]')];
    // Page 2's last word (2:2:3) ends at 6 s, where page 3's first (2:2:4) starts: no pause, so the
    // 27-frame dissolve shrinks to Dmin (10 frames) from frame 180; page 2 goes over its first 5,
    // page 3 comes from its 3rd.
    expect(sequences.map((s) => [s.dataset.sequence, s.dataset.from, s.dataset.duration])).toEqual([
      ['Page 2', '0', '185'],
      ['Page 3', '183', String(330 - 183)],
    ]);
  });

  it('cuts without overlap, after the last word', async () => {
    const root = mount(await props({}, {turn: 'cut'}));
    const sequences = [...root.querySelectorAll<HTMLElement>('[data-sequence]')];
    expect(sequences.map((s) => s.dataset.duration)).toEqual(['180', '150']);
    at(6.1);
    expect(leaf(mount(await props({}, {turn: 'cut'})), 3).transform).toBe('');
  });

  it('turns no earlier than the outgoing page’s last word, and waits leadIn before a pause', async () => {
    const p = await props();
    const resolved = p.resolved as import('../../../src/page').ResolvedPage;
    expect(pageTurns(resolved, {fps: 30, turnFrames: 27, leadInSeconds: 0.4})).toEqual([{start: 180, duration: 10}]);
    // With a 2 s pause before page 3, the whole dissolve runs and page 3 is settled 0.4 s before its word.
    const paused = {
      ...resolved,
      lines: resolved.lines.map((line) => (line.page === 3 && line.line === 1 ? {...line, start: 8} : line)),
    };
    expect(pageTurns(paused, {fps: 30, turnFrames: 27, leadInSeconds: 0.4})).toEqual([
      {start: Math.round(7.6 * 30) - 27, duration: 27},
    ]);
    // A cut changes at max(E, F − leadIn).
    expect(pageTurns(paused, {fps: 30, turnFrames: 0, leadInSeconds: 0.4})).toEqual([{start: 228, duration: 0}]);
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
    // The band's gold with its chroma capped, at the wash's faint strength on the ivory page.
    expect(band.style.background).toBe('rgba(177, 147, 83, 0.1)');
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

  it('makes the band the page’s one mark, and marks the words as highlight says without it', async () => {
    at(4);
    // With the band, the words of the current line carry no mark of their own.
    const banded = Object.values(wordStyles(mount(await props()), 2, 4));
    expect(banded.every((style) => style === null)).toBe(true);
    cleanup();
    const none = mount(await props({}, {lineHighlight: 'none'}));
    expect(marks(none)).toHaveLength(0);
    // Without it, the ink rests the words still to come.
    expect(Object.values(wordStyles(none, 2, 4)).some((style) => style?.opacity === 0.6)).toBe(true);
  });

  it('cross-fades the band between lines at the new line’s first word: out over 10 frames, in over 5', () => {
    const slots = [
      {page: 2, line: 3, start: 0.5, end: 3.2},
      {page: 2, line: 4, start: 3.2, end: 6},
    ];
    const at30 = (line: number, frame: number) => pageLineEmphasis(slots, 2, line, frame, 30);
    // Before the first word, nothing; in over markIn from it, then held.
    expect(at30(3, 14)).toBe(0);
    expect(at30(3, 17)).toBeGreaterThan(0);
    expect(at30(3, 17)).toBeLessThan(1);
    expect(at30(3, 20)).toBe(1);
    // At line 4's first word (frame 96): line 3 lets go over 10 frames while line 4 comes in over 5.
    expect(at30(3, 96)).toBe(1);
    expect(at30(4, 96)).toBe(0);
    const outs = [97, 98, 99, 100, 101, 102, 103, 104, 105, 106].map((f) => at30(3, f));
    const ins = [97, 98, 99, 100, 101].map((f) => at30(4, f));
    for (let i = 1; i < outs.length; i++) expect(outs[i]!).toBeLessThan(outs[i - 1]!);
    for (let i = 1; i < ins.length; i++) expect(ins[i]!).toBeGreaterThan(ins[i - 1]!);
    expect(at30(3, 106)).toBe(0);
    expect(at30(4, 101)).toBe(1);
    // Both partly there for a few frames: a cross-fade, never a jump.
    expect(at30(3, 98)).toBeGreaterThan(0.2);
    expect(at30(4, 98)).toBeGreaterThan(0.2);
    expect(pageLineEmphasis(slots, 2, 1, 50, 30)).toBe(0);
  });

  it('draws both bands while they cross-fade, each at its share of the faint strength', async () => {
    remotion.state.frame = 96 + 2; // line 4 of page 2 starts at 3.2 s
    const root = mount(await props());
    expect(marks(root)).toHaveLength(2);
    const [outgoing, incoming] = [slot(root, 2, 3), slot(root, 2, 4)].map((s) =>
      s.querySelector<HTMLElement>('[data-line-highlight]'),
    );
    const alpha = (band: HTMLElement | null | undefined) => Number(/, ([\d.]+)\)$/.exec(band!.style.background)![1]);
    expect(alpha(outgoing)).toBeGreaterThan(0);
    expect(alpha(outgoing)).toBeLessThan(0.1);
    expect(alpha(incoming)).toBeGreaterThan(0);
    expect(alpha(incoming)).toBeLessThan(0.1);
  });

  it('dims the other lines with dimOtherLines', async () => {
    at(4);
    const root = mount(await props({}, {dimOtherLines: 0.5}));
    expect(slot(root, 2, 4).style.opacity).toBe('');
    expect(slot(root, 2, 3).style.opacity).toBe('0.5');
    expect(slot(root, 2, 1).style.opacity).toBe('0.5');
  });

  it('eases the dimming in with the first band: no line drops in one frame, the recited one never dips', async () => {
    const p = await props({}, {dimOtherLines: 0.6});
    const markIn = tempoFrames('markIn', 'calm', 30);
    // No more than the band's own steepest frame on SOFT, at the dimming's depth.
    const steepest = Math.max(...Array.from({length: markIn}, (_, i) => SOFT((i + 1) / markIn) - SOFT(i / markIn)));
    const step = (1 - 0.6) * steepest + 1e-4;
    // Page 2: surah 2's header, the basmalah, then ayah lines 3 and 4.
    const lines = [1, 2, 3, 4];
    const opacityOf = (root: HTMLElement, line: number) => Number(slot(root, 2, line).style.opacity || 1);
    let before: number[] | null = null;
    // The first word is at 0.5 s, frame 15.
    for (let frame = 12; frame <= 24; frame++) {
      remotion.state.frame = frame;
      const root = mount(p);
      const now = lines.map((line) => opacityOf(root, line));
      cleanup();
      if (before !== null) {
        for (const [i, line] of lines.entries()) {
          expect(before[i]! - now[i]!, `line ${line} at frame ${frame}`).toBeLessThanOrEqual(step);
          // Line 3 is the one recited from the first word.
          if (line === 3) expect(now[i]!, `frame ${frame}`).toBeGreaterThanOrEqual(before[i]!);
        }
      }
      before = now;
    }
    // Settled: the recited line at full ink, the others at dimOtherLines.
    expect(before).toEqual([0.6, 0.6, 1, 0.6]);
    // The pure parts: nothing before the first word, in over markIn on SOFT, then held.
    const slots = [{page: 2, line: 3, start: 0.5, end: 3.2}];
    expect(pageDimPresence(slots, 14, 30)).toBe(0);
    expect(pageDimPresence(slots, 15 + markIn, 30)).toBe(1);
    expect(pageDimPresence([], 100, 30)).toBe(0);
    expect(pageLineDim(0.6, 1, 0)).toBe(0.6);
    expect(pageLineDim(0.6, 1, 1)).toBe(1);
    expect(pageLineDim(0.6, 0.4, 0.4)).toBe(1);
    expect(pageLineDim(1, 1, 0)).toBe(1);
  });

  it('never multiplies a word’s own dimming by its line’s: the lower of the two wins', async () => {
    at(4);
    // Ayah 1 (page 2, line 3) is outside the passage and no longer recited: its words rest at 0.5, not 0.5 × 0.6.
    const root = mount(await props({fromAyah: 2, toAyah: 3}, {dimOtherLines: 0.6}));
    expect(slot(root, 2, 3).style.opacity).toBe('0.6');
    for (const style of Object.values(wordStyles(root, 2, 3)))
      expect(0.6 * style!.opacity!).toBeCloseTo(OUTSIDE_OPACITY, 3);
    // Another surah's header: the lower of the two, not their product.
    expect(slot(root, 3, 3).style.opacity).toBe(String(OUTSIDE_OPACITY));
    cleanup();
    // Without the band, the ink's rest (0.6) of the words still to come, inside a line at 0.6, stays 0.6.
    at(1);
    const ink = mount(await props({}, {dimOtherLines: 0.6, lineHighlight: 'none'}));
    expect(slot(ink, 2, 4).style.opacity).toBe('0.6');
    for (const style of Object.values(wordStyles(ink, 2, 4))) expect(0.6 * (style?.opacity ?? 1)).toBeCloseTo(0.6, 3);
  });
});

describe('<MushafPage>: the page around the lines', () => {
  it('draws one border: the page’s own rule is its jadwal, and without it the page sits inside the jadwal', async () => {
    const hairline = {...defaultMushafPageProps.layout, frame: 'hairline' as const};
    const ruled = mount(await props({layout: hairline}));
    expect(ruled.querySelector('[data-mushaf-jadwal]')).toBeNull();
    expect(page(ruled, 2).querySelector('svg[data-page-frame="simple"]')).not.toBeNull();
    cleanup();
    for (const [width, height] of [
      [1920, 1080],
      [1080, 1920],
      [1080, 1080],
    ] as const) {
      remotion.state.width = width;
      remotion.state.height = height;
      const bare = mount(await props({layout: hairline}, {frame: 'none'}));
      expect(bare.querySelector('[data-mushaf-jadwal]')).not.toBeNull();
      const {inner} = jadwalRules(width, height);
      const box = page(bare, 2).style;
      const [left, top, w, h] = [box.left, box.top, box.width, box.height].map((v) => Number.parseFloat(v));
      // The page box, its page number included, never meets the jadwal's rules.
      const clear = inner.inset + inner.width;
      expect(top, `${width}x${height}`).toBeGreaterThan(clear);
      expect(left).toBeGreaterThan(clear);
      expect(top! + h!).toBeLessThan(height - clear);
      expect(left! + w!).toBeLessThan(width - clear);
      cleanup();
    }
  });

  it('keeps half a line box between the page and the legend’s band, and fits it inside the jadwal', () => {
    const legend = {show: true, position: 'bottom-left' as const, names: 'both' as const};
    const frame = {width: 1920, height: 1080, lineHeight: pageGeometry({width: 1920, height: 1080}).lineHeight};
    const band = legendBand(legend, 'light', frame)!;
    const reserve = pageReserve(legend, 'light', frame);
    // The other edge keeps the page's own margin (4 % of the height), so the page is not pushed against it.
    expect(reserve).toEqual({top: 43, bottom: band.inset + band.height + Math.round(0.5 * frame.lineHeight)});
    const g = pageGeometry({width: 1920, height: 1080}, reserve);
    const bandTop = 1080 - band.inset - band.height;
    expect(bandTop - (g.top + g.height)).toBeGreaterThanOrEqual(Math.round(0.5 * frame.lineHeight));
    expect(g.top).toBeGreaterThanOrEqual(43);
    // No legend and no jadwal: only the margins, so the page is fitted exactly as without a reserve.
    expect(pageReserve({...legend, show: false}, 'light', frame)).toEqual({top: 43, bottom: 43});
    for (const size of [
      {width: 1920, height: 1080},
      {width: 1080, height: 1920},
      {width: 1080, height: 1350},
    ])
      expect(pageGeometry(size, pageReserve({...legend, show: false}, 'light', {...frame, ...size}))).toEqual(
        pageGeometry(size),
      );
    // The jadwal alone: its inner rule and half a label.
    const inside = frameGeometry(1920, 1080, {jadwal: true}).safe;
    expect(pageReserve({...legend, show: false}, 'light', {...frame, jadwal: true})).toEqual({
      top: inside,
      bottom: inside,
    });
    const both = pageReserve(legend, 'light', {...frame, jadwal: true});
    const ruledBand = legendBand(legend, 'light', {...frame, jadwal: true})!;
    expect(both).toEqual({
      top: inside,
      bottom: ruledBand.inset + ruledBand.height + Math.round(0.5 * frame.lineHeight),
    });
  });

  it('draws the border as asked, in the rosettes’ gold', async () => {
    const simple = mount(await props());
    expect(page(simple, 2).querySelector('svg')!.getAttribute('data-page-frame')).toBe('simple');
    expect(page(simple, 2).querySelectorAll('svg rect')).toHaveLength(2);
    // The default custom theme repaints the rosette frame: its gold is the metal.
    for (const rule of page(simple, 2).querySelectorAll('svg rect'))
      expect(rule.getAttribute('stroke')).toBe(defaultMushafPageProps.customTheme.frame);
    // Square corners, no ornaments.
    expect(page(simple, 2).querySelectorAll('[data-corner]')).toHaveLength(0);
    cleanup();
    expect(page(mount(await props({}, {frame: 'none'})), 2).querySelector('svg')).toBeNull();
  });

  it('numbers the page in Arabic-Indic digits, or not', async () => {
    const root = mount(await props());
    expect(page(root, 2).querySelector('[data-page-number]')!.textContent).toBe('٢');
    expect(page(root, 2).querySelector<HTMLElement>('[data-page-number]')!.style.opacity).toBe('0.6');
    expect(page(root, 3).querySelector('[data-page-number]')!.textContent).toBe('٣');
    cleanup();
    expect(page(mount(await props({}, {pageNumber: false})), 2).querySelector('[data-page-number]')).toBeNull();
  });

  it('dissolves to the next page by default, and nothing moves', async () => {
    const p = await props();
    remotion.state.frame = 183; // into the 10-frame turn from frame 180: page 2 fading, page 3 coming
    const root = mount(p);
    const out = Number(leaf(root, 2).opacity);
    const into = Number(leaf(root, 3).opacity);
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(0.5);
    expect(into).toBeLessThan(0.2);
    expect(leaf(root, 3).transform).toBe('');
    cleanup();
    at(7);
    // Settled: no opacity of its own.
    expect(leaf(mount(p), 3).opacity).toBe('');
  });

  it('preloads the next page’s font one page ahead, from the lines’ own sources', async () => {
    mount(await props({fonts: 'cdn'}));
    expect(mocks.loadPageFont.mock.calls.map(([options]) => options)).toEqual([
      {mushaf: 'qpc-v4', theme: 'plain', page: 3, fontSrc: undefined, fallback: undefined},
    ]);
  });

  it("docks the panel in the Studio's preview only, and not with panel={false} (a drop-in slot docks its own)", async () => {
    const p = await props();
    expect(mount(p).querySelector('[data-panel]')).toBeNull();
    cleanup();
    remotion.state.env.isStudio = true;
    expect(mount(p).querySelector<HTMLElement>('[data-panel]')?.dataset.panel).toBeTruthy();
    cleanup();
    expect(render(<MushafPage {...p} panel={false} />).container.querySelector('[data-panel]')).toBeNull();
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

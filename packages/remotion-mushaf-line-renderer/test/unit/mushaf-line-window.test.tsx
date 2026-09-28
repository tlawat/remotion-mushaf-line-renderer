// @vitest-environment jsdom
// <MushafLineWindow>: a window of stacked lines scrolled as one by a position.
import {act, cleanup, render, waitFor} from '@testing-library/react';
import React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {syntheticLayout} from '../fixtures/synthetic-layout';
import {createRemotionMock, installFontFakes} from './helpers/remotion-mock';

const remotion = createRemotionMock();
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
}));

const loadMock = vi.fn();
vi.mock('../../src/data/load-layout', async () => {
  const actual = await vi.importActual<typeof import('../../src/data/load-layout')>('../../src/data/load-layout');
  return {...actual, loadLayout: (id: string, data?: unknown) => loadMock(id, data)};
});

const {MushafLineWindow} = await import('../../src/component/MushafLineWindow');
const {getMushafLine} = await import('../../src/resolve/get-mushaf-line');
const {resetFontStore} = await import('../../src/fonts/font-store');
const {resetPaletteStore} = await import('../../src/fonts/palette-store');
const {fade} = await import('@remotion/transitions/fade');
const {linearTiming} = await import('@remotion/transitions');
type MushafLineData = import('../../src/types').MushafLineData;
type LineWindowContext = import('../../src/types').LineWindowContext;
type MushafLineWindowProps = import('../../src/types').MushafLineWindowProps;

class Boundary extends React.Component<
  {onError: (e: Error) => void; children: React.ReactNode},
  {error: Error | null}
> {
  override state = {error: null as Error | null};
  static getDerivedStateFromError(error: Error) {
    return {error};
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  override render() {
    return this.state.error ? <div data-error={this.state.error.message} /> : this.props.children;
  }
}

let fakes: ReturnType<typeof installFontFakes>;
/** Five ayah lines across the three synthetic pages: p1 l2, p1 l3, p2 l3, p2 l4, p3 l1. */
let lines: MushafLineData[];
const STEPS = [0, 30, 60, 90, 120];
const timing = linearTiming({durationInFrames: 10});
const sizing = {fontSize: 40, lineHeight: 100, fit: 'mushaf'} as const;

beforeEach(async () => {
  resetFontStore();
  remotion.reset();
  loadMock.mockReset();
  loadMock.mockResolvedValue(syntheticLayout);
  fakes = installFontFakes();
  vi.stubGlobal('CSS', {supports: () => true});
  resetPaletteStore();
  lines = await Promise.all(
    (
      [
        [1, 2],
        [1, 3],
        [2, 3],
        [2, 4],
        [3, 1],
      ] as const
    ).map(([page, line]) => getMushafLine({mushaf: 'qpc-v4', page, line})),
  );
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rootOf = (c: HTMLElement) => c.querySelector<HTMLElement>('.mushaf-line-window')!;
const trackOf = (c: HTMLElement) => c.querySelector<HTMLElement>('.mushaf-line-window__track')!;
const slotsOf = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.mushaf-line-window__slot'));
const indices = (c: HTMLElement) => slotsOf(c).map((s) => Number(s.dataset.index));
const lineRoot = (slot: HTMLElement) => slot.querySelector<HTMLElement>('.mushaf-line')!;
const fetched = () => (fakes.fetchMock.mock.calls as unknown[][]).map((c) => String(c[0]));

/** The window under test; `props` override the defaults, `steps: undefined` switches to the position form. */
const Window = (props: Record<string, unknown>) => (
  <MushafLineWindow
    {...({lines, steps: STEPS, scrollTiming: timing, preloadLines: 1, ...sizing, ...props} as MushafLineWindowProps)}
  />
);

describe('<MushafLineWindow>', () => {
  it('renders the DOM contract: a clipped window, one track, a slot per mounted line', async () => {
    const {container} = render(<Window className="hero" style={{top: 12}} />);
    const root = rootOf(container);
    expect(root.className).toBe('mushaf-line-window hero');
    expect(root.dataset).toMatchObject({visibleLines: '3', position: '0.0000', current: '0'});
    expect(root.style.position).toBe('relative');
    expect(root.style.height).toBe('300px');
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.top).toBe('12px');
    const track = trackOf(container);
    expect(root.firstElementChild).toBe(track); // no presentation: the track is the root's only child
    expect(track.style.transform).toBe('translateY(0.0000px)');
    // Lines 0 and 1 are in the window, line 2 is the one preloaded below it; 3 and 4 are not mounted.
    expect(indices(container)).toEqual([0, 1, 2]);
    const slots = slotsOf(container);
    expect(slots.map((s) => s.style.top)).toEqual(['100px', '200px', '300px']);
    expect(slots.map((s) => s.style.height)).toEqual(['100px', '100px', '100px']);
    expect(slots.map((s) => s.dataset.current)).toEqual(['true', undefined, undefined]);
    expect(slots.map((s) => s.dataset.distance)).toEqual(['0.0000', '1.0000', '2.0000']);
    // The edge fade on the slot, the emphasis on the line root (the default lineStyle).
    expect(slots.map((s) => s.style.opacity)).toEqual(['1', '1', '0']);
    expect(slots.map((s) => lineRoot(s).style.opacity)).toEqual(['1', '0.45', '0.45']);
    expect(slots.map((s) => lineRoot(s).dataset.line)).toEqual(['2', '3', '3']);
    expect(slots.map((s) => lineRoot(s).dataset.page)).toEqual(['1', '1', '2']);
    // Every mounted line is sized by the window, never by its own measure.
    for (const slot of slots) {
      expect(lineRoot(slot).style.height).toBe('100px');
      expect(lineRoot(slot).querySelector<HTMLElement>('.mushaf-line__row')!.style.fontSize).toBe('40px');
    }
    // Only the mounted pages' fonts are fetched: page 3 is not asked for yet.
    await waitFor(() => expect(fetched()).toHaveLength(2));
    expect(fetched().some((u) => u.includes('p1.'))).toBe(true);
    expect(fetched().some((u) => u.includes('p2.'))).toBe(true);
    expect(fetched().some((u) => u.includes('p3.'))).toBe(false);
    await waitFor(() => {
      for (const slot of slotsOf(container))
        expect(lineRoot(slot).querySelector<HTMLElement>('.mushaf-line__row')!.style.visibility).toBe('visible');
    });
  });

  it('scrolls every line together by the position, and mounts by it', () => {
    const {container, rerender} = render(<Window />);
    const seek = (frame: number) => {
      remotion.state.frame = frame;
      rerender(<Window />);
    };
    seek(25); // half way from line 0 to line 1
    expect(rootOf(container).dataset.position).toBe('0.5000');
    expect(trackOf(container).style.transform).toBe('translateY(-50.0000px)');
    expect(indices(container)).toEqual([0, 1, 2, 3]);
    let slots = slotsOf(container);
    expect(slots.map((s) => s.style.top)).toEqual(['100px', '200px', '300px', '400px']); // slots never move on their own
    expect(slots.map((s) => Number(s.style.opacity))).toEqual([1, 1, 0.5, 0]);
    expect(slots.map((s) => Number(lineRoot(s).style.opacity))).toEqual([0.725, 0.725, 0.45, 0.45]);
    expect(slots.map((s) => s.dataset.current)).toEqual([undefined, 'true', undefined, undefined]);
    seek(30); // line 1 centred
    expect(rootOf(container).dataset.position).toBe('1.0000');
    expect(trackOf(container).style.transform).toBe('translateY(-100.0000px)');
    expect(indices(container)).toEqual([0, 1, 2, 3]);
    slots = slotsOf(container);
    expect(slots.map((s) => Number(s.style.opacity))).toEqual([1, 1, 1, 0]);
    expect(slots.map((s) => Number(lineRoot(s).style.opacity))).toEqual([0.45, 1, 0.45, 0.45]);
    seek(60); // line 2 centred: line 0 has left the window and is unmounted
    expect(rootOf(container).dataset.position).toBe('2.0000');
    expect(indices(container)).toEqual([1, 2, 3, 4]);
    seek(1000);
    expect(rootOf(container).dataset.position).toBe('4.0000');
    expect(indices(container)).toEqual([3, 4]);
  });

  it('takes a position directly, and a first step in the future starts below the centre', () => {
    const {container, rerender} = render(<Window steps={undefined} position={1.25} />);
    expect(rootOf(container).dataset.position).toBe('1.2500');
    expect(trackOf(container).style.transform).toBe('translateY(-125.0000px)');
    expect(rootOf(container).dataset.current).toBe('1');
    rerender(<Window steps={[20, 50, 80, 110, 140]} />);
    expect(rootOf(container).dataset.position).toBe('-1.0000');
    expect(trackOf(container).style.transform).toBe('translateY(100.0000px)');
    expect(indices(container)).toEqual([0, 1]); // line 0 in the bottom slot, line 1 preloaded
    expect(slotsOf(container)[0]!.style.opacity).toBe('1');
  });

  it('calls lineStyle / lineClassName with the window context; their opacity wins over the dimming', () => {
    const seen: LineWindowContext[] = [];
    const lineStyle = (_line: MushafLineData, ctx: LineWindowContext) => {
      seen.push(ctx);
      return ctx.current ? {color: 'crimson'} : {opacity: 0.2, color: 'grey'};
    };
    const lineClassName = (_line: MushafLineData, ctx: LineWindowContext) => `line-${ctx.index}`;
    remotion.state.frame = 25;
    const {container} = render(<Window lineStyle={lineStyle} lineClassName={lineClassName} />);
    expect(seen.map((c) => [c.index, c.distance, c.current])).toEqual([
      [0, 0.5, false],
      [1, 0.5, true],
      [2, 1.5, false],
      [3, 2.5, false],
    ]);
    expect(seen[0]).toMatchObject({position: 0.5, frame: 25, fps: 30, line: lines[0]});
    const slots = slotsOf(container);
    expect(lineRoot(slots[1]!).style.opacity).toBe('0.725'); // the default dimming, under a style that sets none
    expect(lineRoot(slots[1]!).style.color).toBe('crimson');
    expect(lineRoot(slots[0]!).style.opacity).toBe('0.2'); // the caller's opacity wins
    expect(lineRoot(slots[0]!).style.color).toBe('grey');
    expect(slots[0]!.style.opacity).toBe('1'); // the edge fade stays the window's own
    expect(lineRoot(slots[0]!).className).toBe('mushaf-line line-0');
  });

  it('forwards the per-word hooks to every line, so activeWordId marks exactly one word', () => {
    const wordId = lines[1]!.words[1]!.id;
    const {container} = render(<Window activeWordId={wordId} activeWordStyle={{color: 'red'}} />);
    const active = container.querySelectorAll<HTMLElement>('.mushaf-word--active');
    expect(active).toHaveLength(1);
    expect(active[0]!.dataset.location).toBe(wordId);
    expect(active[0]!.style.color).toBe('red');
  });

  it('animates the whole window with enter / exit, wrapping the track like a line', () => {
    const {container, rerender} = render(<Window enter={{presentation: fade(), timing}} />);
    const root = rootOf(container);
    const wrapper = root.firstElementChild as HTMLElement;
    expect(wrapper.dataset.absoluteFill).toBe('');
    expect(wrapper.firstElementChild).toBe(trackOf(container));
    expect(wrapper.style.opacity).toBe('0');
    remotion.state.frame = 5;
    rerender(<Window enter={{presentation: fade(), timing}} />);
    expect(Number((rootOf(container).firstElementChild as HTMLElement).style.opacity)).toBeCloseTo(0.5);
    remotion.state.frame = 30;
    rerender(<Window enter={{presentation: fade(), timing}} />);
    expect((rootOf(container).firstElementChild as HTMLElement).style.opacity).toBe('1');
  });

  it('wraps itself in a named Sequence when asked', () => {
    const {container} = render(<Window name="window" />);
    expect(container.querySelector('[data-sequence="window"] > .mushaf-line-window')).not.toBeNull();
  });

  it('refuses malformed props with BAD_WINDOW_PROP and bad steps with BAD_STEPS', () => {
    const attempt = (props: Record<string, unknown>) => {
      const onError = vi.fn();
      render(
        <Boundary onError={onError}>
          <MushafLineWindow lines={lines} steps={STEPS} {...sizing} {...(props as object)} />
        </Boundary>,
      );
      cleanup();
      return onError.mock.calls[0]?.[0] as (Error & {code?: string}) | undefined;
    };
    expect(attempt({position: 1})).toMatchObject({code: 'BAD_WINDOW_PROP', message: /not both/});
    expect(attempt({steps: undefined})).toMatchObject({code: 'BAD_WINDOW_PROP', message: /needs `steps`/});
    expect(attempt({steps: [0, 30]})).toMatchObject({code: 'BAD_WINDOW_PROP', message: /2 steps for 5 lines/});
    expect(attempt({steps: [0, 30, 20, 90, 120]})).toMatchObject({code: 'BAD_STEPS', message: /never decrease/});
    expect(attempt({steps: undefined, position: Number.NaN})).toMatchObject({
      code: 'BAD_WINDOW_PROP',
      message: /position/,
    });
    expect(attempt({visibleLines: 0})).toMatchObject({code: 'BAD_WINDOW_PROP', message: /visibleLines/});
    expect(attempt({visibleLines: 2.5})).toMatchObject({code: 'BAD_WINDOW_PROP', message: /visibleLines/});
    expect(attempt({neighbourOpacity: 2})).toMatchObject({code: 'BAD_WINDOW_PROP', message: /neighbourOpacity/});
    expect(attempt({preloadLines: -1})).toMatchObject({code: 'BAD_WINDOW_PROP', message: /preloadLines/});
    expect(attempt({lines: 'p10'})).toMatchObject({code: 'BAD_WINDOW_PROP', message: /array/});
    expect(attempt({enter: 'fade'})).toMatchObject({code: 'BAD_ENTER'});
    expect(attempt({lines: [lines[0], {...lines[1], version: 2}], steps: [0, 30]})).toMatchObject({
      code: 'BAD_LINE_DATA',
    });
  });

  it('takes an even window and a window of one', () => {
    const {container, rerender} = render(<Window visibleLines={1} preloadLines={0} />);
    expect(rootOf(container).style.height).toBe('100px');
    expect(indices(container)).toEqual([0]);
    expect(slotsOf(container)[0]!.style.top).toBe('0px');
    rerender(<Window visibleLines={4} preloadLines={0} />);
    expect(rootOf(container).style.height).toBe('400px');
    expect(slotsOf(container).map((s) => s.style.top)).toEqual(['150px', '250px', '350px']);
    expect(slotsOf(container).map((s) => s.style.opacity)).toEqual(['1', '1', '0.5']);
  });

  it('never releases a font handle for a line that unmounts before its font arrived', async () => {
    fakes.holdLoads();
    const {rerender} = render(<Window />);
    const held = remotion.hook.delayRender.mock.calls.length;
    expect(held).toBeGreaterThan(0);
    remotion.state.frame = 60; // line 0 leaves the window while its font is still loading
    rerender(<Window />);
    await act(async () => {
      fakes.releaseLoads();
      await Promise.resolve();
    });
    await waitFor(() => expect(remotion.hook.continueRender.mock.calls.length).toBeGreaterThan(0));
  });
});

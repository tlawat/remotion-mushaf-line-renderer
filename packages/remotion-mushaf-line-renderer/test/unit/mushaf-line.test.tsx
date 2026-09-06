// @vitest-environment jsdom
import {act, cleanup, render, waitFor} from '@testing-library/react';
import React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRemotionMock, installFontFakes} from './helpers/remotion-mock';
import {syntheticLayout} from '../fixtures/synthetic-layout';

const remotion = createRemotionMock();
// Partial mock: the hooks/handles/components the component touches are replaced, everything else
// (`Internals`, `interpolate`, `spring`, ...) is the real thing so `@remotion/transitions` loads.
vi.mock('remotion', async (importOriginal) => ({...(await importOriginal<typeof import('remotion')>()), ...remotion.module}));

const loadMock = vi.fn();
vi.mock('../../src/data/load-layout', async () => {
  const actual = await vi.importActual<typeof import('../../src/data/load-layout')>('../../src/data/load-layout');
  return {...actual, loadLayout: (id: string) => loadMock(id)};
});

const {MushafLine} = await import('../../src/MushafLine');
const {getMushafLine} = await import('../../src/get-mushaf-line');
const {resetFontStore, getFontStatus} = await import('../../src/font-store');
const {revealRtl} = await import('../../src/presentations/reveal-rtl');
const {fade} = await import('@remotion/transitions/fade');
const {slide} = await import('@remotion/transitions/slide');
const {none} = await import('@remotion/transitions/none');
const {linearTiming} = await import('@remotion/transitions');
type MushafLineData = import('../../src/types').MushafLineData;

class Boundary extends React.Component<{onError: (e: Error) => void; children: React.ReactNode}, {error: Error | null}> {
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
let line: MushafLineData;
let justified: MushafLineData;

beforeEach(async () => {
  resetFontStore();
  remotion.reset();
  loadMock.mockReset();
  loadMock.mockResolvedValue(syntheticLayout);
  fakes = installFontFakes();
  line = await getMushafLine({mushaf: 'qpc-v4', page: 1, line: 2});
  justified = await getMushafLine({mushaf: 'qpc-v4', page: 2, line: 3});
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rowOf = (container: HTMLElement) => container.querySelector<HTMLElement>('.mushaf-line__row')!;

describe('<MushafLine>', () => {
  it('renders the DOM contract with computed defaults and one span per word', async () => {
    const {container} = render(<MushafLine line={justified} className="hero" style={{top: 12}} />);
    const root = container.querySelector<HTMLElement>('.mushaf-line')!;
    expect(root.className).toBe('mushaf-line hero');
    expect(root.dataset).toMatchObject({mushaf: 'qpc-v4', page: '2', line: '3', lineType: 'ayah', centered: 'false'});
    expect(root.style.position).toBe('relative');
    expect(root.style.height).toBe('246px');
    expect(root.style.top).toBe('12px');
    expect(root.firstElementChild).toBe(rowOf(container)); // no presentation: the row is the root's only child
    const row = rowOf(container);
    expect(row.style.direction).toBe('rtl');
    expect(row.style.justifyContent).toBe('space-between');
    expect(row.style.fontFamily).toBe('"mushaf-qpc-v4-p2"');
    expect(row.style.fontSize).toBe('112px');
    expect(row.style.lineHeight).toBe('246px');
    expect(row.style.visibility).toBe('hidden');
    const spans = Array.from(row.querySelectorAll('span'));
    expect(spans).toHaveLength(4);
    expect(spans.map((s) => s.dataset.location)).toEqual(['2:1:1', '2:1:2', '2:1:3', '2:1:4']);
    expect(spans[3]!.className).toBe('mushaf-word mushaf-word--end');
    expect(spans[3]!.dataset).toMatchObject({wordId: '9', surah: '2', ayah: '1', position: '4', kind: 'end'});
    expect(Array.from(row.childNodes).every((n) => n.nodeType === 1)).toBe(true); // no whitespace text nodes
    expect(spans[0]!.textContent).toBe(justified.words[0]!.text);
    await waitFor(() => expect(rowOf(container).style.visibility).toBe('visible'));
  });

  it('centres centred lines and honours fontSize/lineHeight overrides', () => {
    const {container} = render(<MushafLine line={line} fontSize={50} lineHeight={120} />);
    expect(rowOf(container).style.justifyContent).toBe('center');
    expect(rowOf(container).style.fontSize).toBe('50px');
    expect(container.querySelector<HTMLElement>('.mushaf-line')!.style.height).toBe('120px');
  });

  it('holds a delayRender handle from the first render until the visible row has committed', async () => {
    fakes.holdLoads();
    const {container} = render(<MushafLine line={line} />);
    expect(remotion.hook.delayRender).toHaveBeenCalledTimes(1);
    expect(remotion.hook.delayRender.mock.calls[0]?.[0]).toContain('waiting for font mushaf-qpc-v4-p1');
    expect(remotion.hook.delayRender.mock.calls[0]?.[1]).toEqual({retries: 1});
    expect(remotion.hook.continueRender).not.toHaveBeenCalled();
    expect(rowOf(container).style.visibility).toBe('hidden');
    expect(fakes.fetchMock).toHaveBeenCalledTimes(1); // started in an effect
    await act(async () => {
      fakes.releaseLoads();
    });
    await waitFor(() => expect(rowOf(container).style.visibility).toBe('visible'));
    expect(remotion.hook.continueRender).toHaveBeenCalledTimes(1);
    expect(remotion.hook.continueRender).toHaveBeenCalledWith(remotion.hook.delayRender.mock.results[0]?.value);
    expect(getFontStatus('qpc-v4/1')).toBe('loaded');
  });

  it('renders visibly on the first paint when the font is already loaded, without a handle', async () => {
    const first = render(<MushafLine line={line} />);
    await waitFor(() => expect(rowOf(first.container).style.visibility).toBe('visible'));
    first.unmount();
    remotion.reset();
    const {container} = render(<MushafLine line={line} />);
    expect(rowOf(container).style.visibility).toBe('visible');
    expect(remotion.hook.delayRender).not.toHaveBeenCalled();
  });

  it('continues its handle when unmounted before the font arrives', () => {
    fakes.holdLoads();
    const {unmount} = render(<MushafLine line={line} />);
    const handle = remotion.hook.delayRender.mock.results[0]?.value;
    unmount();
    expect(remotion.hook.continueRender).toHaveBeenCalledWith(handle);
  });

  it('hides again and re-arms when the line moves to a page whose font is not loaded', async () => {
    const {container, rerender} = render(<MushafLine line={line} />);
    await waitFor(() => expect(rowOf(container).style.visibility).toBe('visible'));
    fakes.holdLoads();
    rerender(<MushafLine line={justified} />);
    expect(rowOf(container).style.visibility).toBe('hidden');
    expect(rowOf(container).style.fontFamily).toBe('"mushaf-qpc-v4-p2"');
    expect(remotion.hook.delayRender).toHaveBeenCalledTimes(2);
    await act(async () => {
      fakes.releaseLoads();
    });
    await waitFor(() => expect(rowOf(container).style.visibility).toBe('visible'));
  });

  it('throws the stored font error from render', async () => {
    fakes.fetchMock.mockResolvedValue({ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0)});
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine line={line} />
      </Boundary>,
    );
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'FONT_HTTP'});
  });

  it('rejects non-ayah lines and bad props loudly', async () => {
    const header = await getMushafLine({mushaf: 'qpc-v4', page: 1, line: 1});
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine line={header} />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'UNSUPPORTED_LINE_TYPE', message: expect.stringContaining('is a "surah_name" line')});
    const onError2 = vi.fn();
    render(
      <Boundary onError={onError2}>
        <MushafLine line={'3' as never} />
      </Boundary>,
    );
    expect(onError2.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_LINE_PROP'});
    const onError3 = vi.fn();
    render(
      <Boundary onError={onError3}>
        <MushafLine line={{...line, fontFamily: 'Arial'}} />
      </Boundary>,
    );
    expect(onError3.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_LINE_DATA'});
  });

  it('resolves the convenience props behind a handle released after commit, and re-resolves on change', async () => {
    const {container, rerender} = render(<MushafLine mushaf="qpc-v4" page={2} line={3} />);
    expect(remotion.hook.delayRender).toHaveBeenCalledTimes(1);
    expect(remotion.hook.delayRender.mock.calls[0]?.[0]).toBe('<MushafLine> resolving qpc-v4 page 2 line 3');
    expect(container.querySelector('.mushaf-line')).toBeNull();
    await waitFor(() => expect(container.querySelector('.mushaf-line')).not.toBeNull());
    expect(container.querySelector<HTMLElement>('.mushaf-line')!.dataset.page).toBe('2');
    await waitFor(() => expect(rowOf(container).style.visibility).toBe('visible'));
    expect(remotion.hook.continueRender).toHaveBeenCalledWith(remotion.hook.delayRender.mock.results[0]?.value);
    rerender(<MushafLine mushaf="qpc-v4" page={3} line={2} />);
    await waitFor(() => expect(container.querySelector<HTMLElement>('.mushaf-line')?.dataset.page).toBe('3'));
    expect(container.querySelectorAll('.mushaf-word')).toHaveLength(4);
  });

  it('surfaces convenience-path failures from render', async () => {
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine mushaf="qpc-v4" page={2} line={99} />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'LINE_OUT_OF_RANGE'});
    loadMock.mockRejectedValue(new Error('boom'));
    const onError2 = vi.fn();
    render(
      <Boundary onError={onError2}>
        <MushafLine mushaf="qpc-v4" page={2} line={3} />
      </Boundary>,
    );
    await waitFor(() => expect(onError2).toHaveBeenCalled());
  });

  it('is plain by default and switches font set with tajweed on the convenience path', async () => {
    const plain = render(<MushafLine page={2} line={3} />);
    await waitFor(() => expect(plain.container.querySelector('.mushaf-line')).not.toBeNull());
    expect(plain.container.querySelector<HTMLElement>('.mushaf-line')!.dataset.mushaf).toBe('qpc-v4');
    expect(rowOf(plain.container).style.fontFamily).toBe('"mushaf-qpc-v4-p2"');
    // Nothing sets a colour: the glyphs inherit CSS `color`, which is what makes them black.
    expect(plain.container.querySelector<HTMLElement>('.mushaf-line')!.style.color).toBe('');
    expect(rowOf(plain.container).style.color).toBe('');
    cleanup();

    const coloured = render(<MushafLine page={2} line={3} tajweed />);
    await waitFor(() => expect(coloured.container.querySelector('.mushaf-line')).not.toBeNull());
    expect(coloured.container.querySelector<HTMLElement>('.mushaf-line')!.dataset.mushaf).toBe('qpc-v4-tajweed');
    expect(rowOf(coloured.container).style.fontFamily).toBe('"mushaf-qpc-v4-tajweed-p2"');
  });

  it('refuses tajweed next to resolved line data, which carries its own font set', () => {
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        {/* @ts-expect-error the prop types forbid this; the runtime says why */}
        <MushafLine line={line} tajweed />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_LINE_PROP'});
    expect(onError.mock.calls[0]?.[0].message).toMatch(/pass `tajweed` to getMushafLine/i);
  });

  it('styles and marks individual words through the per-word hooks', () => {
    const {container} = render(
      <MushafLine
        line={justified}
        activeWordId="2:1:2"
        activeWordStyle={{color: 'crimson'}}
        wordStyle={(word, ctx) => (ctx.active ? {opacity: 1} : {opacity: word.kind === 'end' ? 0.4 : 0.8})}
        wordClassName={(word) => `ayah-${word.ayah}`}
      />,
    );
    const words = [...container.querySelectorAll<HTMLElement>('.mushaf-word')];
    expect(words.map((w) => w.dataset.location)).toEqual(['2:1:1', '2:1:2', '2:1:3', '2:1:4']);
    const active = words[1]!;
    expect(active.dataset.active).toBe('true');
    expect(active.className).toContain('mushaf-word--active');
    expect(active.className).toContain('ayah-1');
    expect(active.style.color).toBe('crimson');
    expect(active.style.opacity).toBe('1'); // wordStyle wins over activeWordStyle
    expect(words[0]!.dataset.active).toBeUndefined();
    expect(words[0]!.style.opacity).toBe('0.8');
    expect(words[3]!.style.opacity).toBe('0.4'); // the ayah marker is an ordinary word here
    // The pinned layout is never lost: hooks add to WORD_STYLE, they do not replace it.
    expect(words[0]!.style.display).toBe('block');
  });

  it('matches the active word by wordId as well, and highlights nothing without one', () => {
    const {container, rerender} = render(<MushafLine line={justified} activeWordId={7} />);
    const active = container.querySelectorAll<HTMLElement>('[data-active="true"]');
    expect(active).toHaveLength(1);
    expect(active[0]!.dataset.wordId).toBe('7');
    rerender(<MushafLine line={justified} activeWordId={null} />);
    expect(container.querySelectorAll('[data-active]')).toHaveLength(0);
  });

  it('accepts a bare presentation and drives it with the default timing', () => {
    // enterTiming(): 0.5 s = 15 frames at 30 fps, decelerating.
    const {container, rerender} = render(<MushafLine line={line} enter={fade()} />);
    const root = container.querySelector<HTMLElement>('.mushaf-line')!;
    const opacityAt = (frame: number) => {
      remotion.state.frame = frame;
      rerender(<MushafLine line={line} enter={fade()} />);
      return Number(root.querySelector<HTMLElement>('[data-absolute-fill]')!.style.opacity);
    };
    expect(opacityAt(0)).toBe(0);
    expect(opacityAt(15)).toBe(1);
    expect(opacityAt(30)).toBe(1);
    // Eased, not linear: over half way by a third of the window.
    expect(opacityAt(5)).toBeGreaterThan(0.5);
  });

  it('wraps in a named Sequence when name is given', () => {
    const {container} = render(<MushafLine line={line} name="p1 l2" />);
    expect(container.querySelector('[data-sequence="p1 l2"] .mushaf-line')).not.toBeNull();
    const plain = render(<MushafLine line={line} />);
    expect(plain.container.querySelector('[data-sequence]')).toBeNull();
  });

  it('drives fade() over the local frame and keeps the row inside the root', async () => {
    const enter = {presentation: fade(), timing: linearTiming({durationInFrames: 20})};
    const {container, rerender} = render(<MushafLine line={line} enter={enter} />);
    const root = container.querySelector<HTMLElement>('.mushaf-line')!;
    const fill = root.querySelector<HTMLElement>('[data-absolute-fill]')!;
    expect(fill).not.toBeNull();
    expect(fill.parentElement).toBe(root); // presentation inside the root, row inside the presentation
    expect(fill.querySelector('.mushaf-line__row')).not.toBeNull();
    expect(fill.style.opacity).toBe('0');
    for (const [frame, opacity] of [[10, '0.5'], [20, '1'], [40, '1']] as const) {
      remotion.state.frame = frame;
      rerender(<MushafLine line={line} enter={enter} />);
      expect(root.querySelector<HTMLElement>('[data-absolute-fill]')!.style.opacity).toBe(opacity);
    }
  });

  it('drives the exiting side over the last frames of the sequence, nested outside the entrance', () => {
    const enter = {presentation: fade(), timing: linearTiming({durationInFrames: 10})};
    const exit = {presentation: fade({shouldFadeOutExitingScene: true}), timing: linearTiming({durationInFrames: 20})};
    remotion.state.durationInFrames = 120; // the enclosing <Sequence durationInFrames>
    remotion.state.frame = 50;
    const {container, rerender} = render(<MushafLine line={line} enter={enter} exit={exit} />);
    const root = container.querySelector<HTMLElement>('.mushaf-line')!;
    const fills = root.querySelectorAll<HTMLElement>('[data-absolute-fill]');
    expect(fills).toHaveLength(2);
    const [outer, inner] = [fills[0]!, fills[1]!];
    expect(outer.parentElement).toBe(root); // exiting presentation outside ...
    expect(inner.parentElement).toBe(outer); // ... the entering one, like TransitionSeries
    expect(inner.querySelector('.mushaf-line__row')).not.toBeNull();
    expect(inner.style.opacity).toBe('1'); // entrance finished
    expect(outer.style.opacity).toBe('1'); // exit not started
    for (const [frame, opacity] of [[99, 1], [100, 1], [110, 0.5], [119, 0.05]] as const) {
      remotion.state.frame = frame;
      rerender(<MushafLine line={line} enter={enter} exit={exit} />);
      expect(Number(root.querySelector<HTMLElement>('[data-absolute-fill]')!.style.opacity)).toBeCloseTo(opacity, 5);
    }
    // Exit alone: a single wrapper.
    remotion.state.frame = 110;
    const alone = render(<MushafLine line={line} exit={exit} />);
    const wrappers = alone.container.querySelectorAll<HTMLElement>('[data-absolute-fill]');
    expect(wrappers).toHaveLength(1);
    expect(Number(wrappers[0]!.style.opacity)).toBeCloseTo(0.5, 5);
  });

  it('throws BAD_EXIT for a malformed exit prop', () => {
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine line={line} exit={{presentation: fade(), timing: 'fast'} as never} />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_EXIT'});
  });

  it('accepts slide(), none() and revealRtl() and keeps the same DOM shape', () => {
    remotion.state.frame = 5;
    const timing = linearTiming({durationInFrames: 10});
    for (const presentation of [slide({direction: 'from-right'}), none(), revealRtl()]) {
      const {container, unmount} = render(<MushafLine line={line} enter={{presentation, timing}} />);
      const root = container.querySelector<HTMLElement>('.mushaf-line')!;
      expect(root.style.height).toBe('246px');
      expect(root.querySelector('[data-absolute-fill] .mushaf-line__row')).not.toBeNull();
      unmount();
    }
    const {container} = render(<MushafLine line={line} enter={{presentation: revealRtl(), timing}} />);
    expect(container.querySelector<HTMLElement>('[data-absolute-fill]')!.style.clipPath).toBe('inset(-100% 0 -100% 50.0000%)');
  });

  it('rejects canvas presentations from the next render and cancels renders', async () => {
    let capture: ((img: unknown, draw: unknown) => void) | null = null;
    const CanvasLike: React.FC<{onElementImage: (img: unknown, draw: unknown) => void; children: React.ReactNode}> = ({onElementImage, children}) => {
      capture = onElementImage;
      return <div>{children}</div>;
    };
    const enter = {presentation: {component: CanvasLike as never, props: {}}, timing: linearTiming({durationInFrames: 10})};
    remotion.state.env = {...remotion.state.env, isRendering: true};
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine line={line} enter={enter} />
      </Boundary>,
    );
    expect(capture).not.toBeNull();
    act(() => {
      capture!(null, null);
    });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'CANVAS_PRESENTATION'});
    expect(remotion.hook.cancelRender).toHaveBeenCalledTimes(1);
  });

  it('rejects a presentation that mounts the line inside a <canvas>, before the first paint', async () => {
    // HTML-in-canvas presentations put their children inside the canvas element; browsers without
    // paint events for it would otherwise show a blank canvas.
    const CanvasWrapper: React.FC<{children: React.ReactNode}> = ({children}) => (
      <div>
        <canvas>{children}</canvas>
      </div>
    );
    const enter = {presentation: {component: CanvasWrapper as never, props: {}}, timing: linearTiming({durationInFrames: 10})};
    remotion.state.env = {...remotion.state.env, isRendering: true};
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine line={line} enter={enter} />
      </Boundary>,
    );
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'CANVAS_PRESENTATION'});
    expect(remotion.hook.cancelRender).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.mushaf-line')).toBeNull();
  });

  it('throws BAD_ENTER for a malformed enter prop', () => {
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine line={line} enter={{presentation: 'fade', timing: linearTiming({durationInFrames: 10})} as never} />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_ENTER'});
  });
});

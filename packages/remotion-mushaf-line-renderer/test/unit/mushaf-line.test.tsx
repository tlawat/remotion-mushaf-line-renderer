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

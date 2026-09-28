// @vitest-environment jsdom
import {act, cleanup, render, waitFor} from '@testing-library/react';
import React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {syntheticLayout} from '../fixtures/synthetic-layout';
import {createRemotionMock, installFontFakes} from './helpers/remotion-mock';

const remotion = createRemotionMock();
// Partial mock: the hooks/handles/components the component touches are replaced, everything else
// (`Internals`, `interpolate`, `spring`, ...) is the real thing so `@remotion/transitions` loads.
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
}));

const loadMock = vi.fn();
vi.mock('../../src/data/load-layout', async () => {
  const actual = await vi.importActual<typeof import('../../src/data/load-layout')>('../../src/data/load-layout');
  return {...actual, loadLayout: (id: string, data?: unknown) => loadMock(id, data)};
});

const {MushafLine} = await import('../../src/component/MushafLine');
const {getMushafLine} = await import('../../src/resolve/get-mushaf-line');
const {resetFontStore, getFontStatus} = await import('../../src/fonts/font-store');
const {resetPaletteStore} = await import('../../src/fonts/palette-store');
const {revealRtl} = await import('../../src/animation/presentations/reveal-rtl');
const {fade} = await import('@remotion/transitions/fade');
const {slide} = await import('@remotion/transitions/slide');
const {none} = await import('@remotion/transitions/none');
const {linearTiming} = await import('@remotion/transitions');
type MushafLineData = import('../../src/types').MushafLineData;

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
let line: MushafLineData;
let justified: MushafLineData;

beforeEach(async () => {
  resetFontStore();
  remotion.reset();
  loadMock.mockReset();
  loadMock.mockResolvedValue(syntheticLayout);
  fakes = installFontFakes();
  // jsdom has no CSS object, so palette rules would be skipped; these tests stand in for a browser
  // that supports font-palette (jsdom then logs that it cannot parse the at-rule, which is fine).
  vi.stubGlobal('CSS', {supports: () => true});
  resetPaletteStore();
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

/** The `@font-palette-values` rule the row's `font-palette` names, as it was written to the page. */
const paletteRuleFor = (row: HTMLElement): string => {
  const ident = row.style.getPropertyValue('font-palette');
  const css = Array.from(document.querySelectorAll('style[data-mushaf-palettes]'))
    .map((s) => s.textContent ?? '')
    .join('');
  return css.split('\n').find((rule) => rule.includes(`${ident}{`)) ?? `no rule for ${ident || '(none)'}`;
};

describe('<MushafLine>', () => {
  it('renders the DOM contract with computed defaults and one span per word', async () => {
    const {container} = render(<MushafLine line={justified} className="hero" style={{top: 12}} />);
    const root = container.querySelector<HTMLElement>('.mushaf-line')!;
    expect(root.className).toBe('mushaf-line hero');
    expect(root.dataset).toMatchObject({
      mushaf: 'qpc-v4',
      theme: 'plain',
      page: '2',
      line: '3',
      lineType: 'ayah',
      centered: 'false',
    });
    expect(root.dataset.fontOrigin).toBeUndefined(); // set once the font has loaded
    expect(root.style.position).toBe('relative');
    expect(root.style.height).toBe('246px');
    expect(root.style.top).toBe('12px');
    expect(root.firstElementChild).toBe(rowOf(container)); // no presentation: the row is the root's only child
    const row = rowOf(container);
    expect(row.style.direction).toBe('rtl');
    expect(row.style.justifyContent).toBe('flex-start'); // the font's own advances, never stretched
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
    expect(root.dataset.fontOrigin).toBe('cdn');
  });

  it('paints from a fonts package when the CDN fails, and marks where the font came from', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const pkg = {
      kind: 'remotion-mushaf-fonts',
      schema: 1,
      name: '@tlawat/mushaf-fonts-qpc-v4',
      version: '1.20260912.0',
      mushaf: 'qpc-v4',
      fontSet: 'qpc-v4',
      snapshot: '2026-09-12',
      files: {2: {url: '/pkg/p2.woff2', bytes: 12, sha256: digest}},
    } as const;
    fakes.fetchMock.mockImplementation((async (url: string) =>
      url.startsWith('/pkg/')
        ? {ok: true, status: 200, arrayBuffer: async () => bytes}
        : {ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0)}) as never);
    const {container} = render(<MushafLine line={justified} fontFallback={pkg} />);
    const root = container.querySelector<HTMLElement>('.mushaf-line')!;
    await waitFor(() => expect(rowOf(container).style.visibility).toBe('visible'));
    expect(root.dataset.fontOrigin).toBe('package');
    // Its own family, so a CDN-only line of the same page elsewhere keeps its own face.
    expect(rowOf(container).style.fontFamily).toMatch(/^"mushaf-qpc-v4-p2-[0-9a-z]+"$/);
    expect(remotion.hook.cancelRender).not.toHaveBeenCalled();
  });

  it('reports a fallback for the wrong font set while rendering, not during an outage', () => {
    const onError = vi.fn();
    const pkg = {
      kind: 'remotion-mushaf-fonts',
      schema: 1,
      name: '@tlawat/mushaf-fonts-qpc-v4-tajweed',
      version: '1.20260912.0',
      mushaf: 'qpc-v4',
      fontSet: 'qpc-v4-tajweed',
      snapshot: '2026-09-12',
      files: {},
    } as const;
    render(
      <Boundary onError={onError}>
        <MushafLine line={justified} fontFallback={pkg} />
      </Boundary>,
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'BAD_FONT_FALLBACK',
        message: expect.stringContaining('@tlawat/mushaf-fonts-qpc-v4.'),
      }),
    );
    expect(fakes.fetchMock).not.toHaveBeenCalled();
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
    expect(getFontStatus('qpc-v4/1#cdn')).toBe('loaded');
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

  it('rejects bad props loudly', async () => {
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

  it('is plain by default and switches font set with a theme on the convenience path', async () => {
    const plain = render(<MushafLine page={2} line={3} />);
    await waitFor(() => expect(plain.container.querySelector('.mushaf-line')).not.toBeNull());
    expect(plain.container.querySelector<HTMLElement>('.mushaf-line')!.dataset).toMatchObject({
      mushaf: 'qpc-v4',
      theme: 'plain',
    });
    expect(rowOf(plain.container).style.fontFamily).toBe('"mushaf-qpc-v4-p2"');
    // Nothing sets a colour: the glyphs inherit CSS `color`, which is what makes them black.
    expect(plain.container.querySelector<HTMLElement>('.mushaf-line')!.style.color).toBe('');
    expect(rowOf(plain.container).style.color).toBe('');
    cleanup();

    const coloured = render(<MushafLine page={2} line={3} theme="light" />);
    await waitFor(() => expect(coloured.container.querySelector('.mushaf-line')).not.toBeNull());
    expect(coloured.container.querySelector<HTMLElement>('.mushaf-line')!.dataset).toMatchObject({
      mushaf: 'qpc-v4',
      theme: 'light',
    });
    expect(rowOf(coloured.container).style.fontFamily).toBe('"mushaf-qpc-v4-tajweed-p2"');
    cleanup();

    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine page={2} line={3} theme={'neon' as never} />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_THEME'});
  });

  it('forwards the data source on the convenience path and re-resolves when it changes', async () => {
    const data = {words: '/data/qpc-v4/words.json.zip', layout: '/data/qpc-v4/layout.db.zip'};
    loadMock.mockClear(); // the fixtures above were resolved through it too
    const {container, rerender} = render(<MushafLine page={2} line={3} data={data} />);
    await waitFor(() => expect(container.querySelector('.mushaf-line')).not.toBeNull());
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenLastCalledWith('qpc-v4', data);
    // A new object naming the same sources is the same line: no second resolution.
    rerender(<MushafLine page={2} line={3} data={{...data}} />);
    await waitFor(() => expect(container.querySelector('.mushaf-line')).not.toBeNull());
    expect(loadMock).toHaveBeenCalledTimes(1);
    // Another source is another resolution, behind a new handle.
    rerender(<MushafLine page={2} line={3} data={{layout: 'https://mirror.example/layout.db.zip'}} />);
    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2));
    expect(loadMock).toHaveBeenLastCalledWith('qpc-v4', {layout: 'https://mirror.example/layout.db.zip'});
    expect(remotion.hook.delayRender).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(container.querySelector('.mushaf-line')).not.toBeNull());
  });

  it('refuses data next to resolved line data, which is already loaded', () => {
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        {/* @ts-expect-error the prop types forbid this; the runtime says why */}
        <MushafLine line={line} data={{words: '/x'}} />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_LINE_PROP'});
    expect(onError.mock.calls[0]?.[0].message).toMatch(/already loaded.*pass `data` to getMushafLine/i);
  });

  it('refuses theme and mushaf next to resolved line data, which carries its own', () => {
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        {/* @ts-expect-error the prop types forbid this; the runtime says why */}
        <MushafLine line={line} theme="light" />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_LINE_PROP'});
    expect(onError.mock.calls[0]?.[0].message).toMatch(/pass `theme` to getMushafLine/i);

    const onColorsError = vi.fn();
    render(
      <Boundary onError={onColorsError}>
        {/* @ts-expect-error same rule for the mushaf id */}
        <MushafLine line={line} mushaf="qpc-v4" />
      </Boundary>,
    );
    expect(onColorsError.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_LINE_PROP'});
    expect(onColorsError.mock.calls[0]?.[0].message).toMatch(/pass `mushaf` to getMushafLine/i);
  });

  it('selects the theme palette on the row, and leaves font-palette alone without one', async () => {
    const mandala = render(<MushafLine page={2} line={3} theme="normal" />);
    await waitFor(() => expect(mandala.container.querySelector('.mushaf-line')).not.toBeNull());
    expect(mandala.container.querySelector<HTMLElement>('.mushaf-line')!.dataset).toMatchObject({
      mushaf: 'qpc-v4',
      theme: 'normal',
    });
    const row = rowOf(mandala.container);
    expect(row.style.fontFamily).toBe('"mushaf-qpc-v4-tajweed-p2"');
    // jsdom reports a computed colour, so `ink: 'currentColor'` resolves and the ident is hashed.
    expect(row.style.getPropertyValue('font-palette')).toMatch(/^--mushaf-qpc-v4-tajweed-p2-palette-3-[0-9a-f]{8}$/);
    cleanup();

    // A bare base palette (p3) needs no overrides, so its ident is not hashed; plain data sets nothing.
    const colourLine = {
      ...justified,
      theme: 'p3' as const,
      fontSet: 'qpc-v4-tajweed' as const,
      fontFamily: 'mushaf-qpc-v4-tajweed-p2',
    };
    const fromData = render(<MushafLine line={colourLine} />);
    expect(rowOf(fromData.container).style.getPropertyValue('font-palette')).toBe(
      '--mushaf-qpc-v4-tajweed-p2-palette-3',
    );
    cleanup();
    expect(rowOf(render(<MushafLine line={justified} />).container).style.getPropertyValue('font-palette')).toBe('');
  });

  it('resolves the ink from the inherited CSS color, and follows an explicit one', async () => {
    const mandalaLine = {
      ...justified,
      theme: 'normal' as const,
      fontSet: 'qpc-v4-tajweed' as const,
      fontFamily: 'mushaf-qpc-v4-tajweed-p2',
    };
    // The whole point of mandala: everything written takes the CSS colour that plain glyphs would
    // take, and only the rosette's ornaments keep the font's own colours. COLR glyphs ignore
    // `color`, so the colour is read from the row and written into the palette rule.
    const inherited = render(
      <div style={{color: 'rgb(27, 111, 63)'}}>
        <MushafLine line={mandalaLine} />
      </div>,
    );
    const rule = paletteRuleFor(rowOf(inherited.container));
    expect(rule).toContain('base-palette:3');
    // Every letter entry (the greys included) and 13 — the rosette's frame and the ayah number.
    expect(rule).toContain('override-colors:0 rgb(27, 111, 63)');
    expect(rule).toContain('13 rgb(27, 111, 63)');
    expect(rule).toContain('15 rgb(27, 111, 63)');
    // The petals (11), the jewel (10) and the disc (12) are left to the font.
    expect(rule).not.toMatch(/1[0-2] rgb/);
    cleanup();

    // An explicit colour needs no resolution, and each part paints only its own entries.
    const explicit = render(
      <MushafLine
        line={{
          ...mandalaLine,
          theme: {
            base: 'normal',
            colors: {ink: '#1b6f3f', accent: '#c8a45c', detail: '#0aa', background: 'transparent'},
          },
        }}
      />,
    );
    const explicitRule = paletteRuleFor(rowOf(explicit.container));
    expect(explicitRule).toContain('0 #1b6f3f');
    expect(explicitRule).toContain('10 #0aa');
    expect(explicitRule).toContain('11 #c8a45c');
    expect(explicitRule).toContain('12 transparent');
    expect(explicitRule).toContain('14 #1b6f3f');
    expect(explicitRule).not.toContain('13 #1b6f3f'); // the frame is its own part
  });

  it('gives the ayah-number marker its own palette when the theme colours it apart (QUL black)', () => {
    const black = {
      ...justified,
      theme: 'black' as const,
      fontSet: 'qpc-v4-tajweed' as const,
      fontFamily: 'mushaf-qpc-v4-tajweed-p2',
    };
    const {container} = render(<MushafLine line={black} />);
    const row = rowOf(container);
    const rowIdent = row.style.getPropertyValue('font-palette');
    expect(paletteRuleFor(row)).toContain('override-colors:0 #ffffff,1 #ffffff');
    // Every word inherits the row's palette except the marker, which names the second rule.
    const words = [...container.querySelectorAll<HTMLElement>('.mushaf-word')];
    expect(
      words.filter((w) => w.dataset.kind !== 'end').every((w) => w.style.getPropertyValue('font-palette') === ''),
    ).toBe(true);
    const marker = container.querySelector<HTMLElement>('.mushaf-word--end')!;
    const markerIdent = marker.style.getPropertyValue('font-palette');
    expect(markerIdent).toMatch(/^--mushaf-qpc-v4-tajweed-p2-palette-5-[0-9a-f]{8}$/);
    expect(markerIdent).not.toBe(rowIdent);
    expect(paletteRuleFor(marker)).toContain('13 #000000');
    // Without a marker colour no word carries its own palette.
    cleanup();
    const light = render(<MushafLine line={{...black, theme: 'light'}} />);
    expect(
      light.container.querySelector<HTMLElement>('.mushaf-word--end')!.style.getPropertyValue('font-palette'),
    ).toBe('');
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
    for (const [frame, opacity] of [
      [10, '0.5'],
      [20, '1'],
      [40, '1'],
    ] as const) {
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
    for (const [frame, opacity] of [
      [99, 1],
      [100, 1],
      [110, 0.5],
      [119, 0.05],
    ] as const) {
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
    expect(container.querySelector<HTMLElement>('[data-absolute-fill]')!.style.clipPath).toBe(
      'inset(-100% 0 -100% 50.0000%)',
    );
  });

  it('rejects canvas presentations from the next render and cancels renders', async () => {
    let capture: ((img: unknown, draw: unknown) => void) | null = null;
    const CanvasLike: React.FC<{onElementImage: (img: unknown, draw: unknown) => void; children: React.ReactNode}> = ({
      onElementImage,
      children,
    }) => {
      capture = onElementImage;
      return <div>{children}</div>;
    };
    const enter = {
      presentation: {component: CanvasLike as never, props: {}},
      timing: linearTiming({durationInFrames: 10}),
    };
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
    const enter = {
      presentation: {component: CanvasWrapper as never, props: {}},
      timing: linearTiming({durationInFrames: 10}),
    };
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

describe('<MushafLine slice>', () => {
  const spans = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.mushaf-word'));
  const rootOf = (c: HTMLElement) => c.querySelector<HTMLElement>('.mushaf-line')!;
  const visible = (c: HTMLElement) => waitFor(() => expect(rowOf(c).style.visibility).toBe('visible'));
  // Synthetic page 3 line 2: 2:3:2 (17), 2:3:3 rosette (18), 2:4:1 (19), 2:4:2 rosette (20).
  const twoAyahs = () => getMushafLine({mushaf: 'qpc-v4', page: 3, line: 2});

  it('hides the words outside the slice and centres the rest, every span still in the DOM', async () => {
    const {container} = render(<MushafLine line={await twoAyahs()} slice={{ayah: 4}} />);
    await visible(container);
    const all = spans(container);
    expect(all.map((s) => s.dataset.wordId)).toEqual(['17', '18', '19', '20']);
    expect(all.map((s) => s.style.display)).toEqual(['none', 'none', 'block', 'block']);
    expect(all.map((s) => s.dataset.hidden)).toEqual(['true', 'true', undefined, undefined]);
    expect(all[0]!.className).toBe('mushaf-word mushaf-word--word mushaf-word--hidden');
    expect(all[2]!.className).toBe('mushaf-word mushaf-word--word');
    expect(rowOf(container).style.justifyContent).toBe('center');
    expect(rootOf(container).dataset.sliced).toBe('19-20');
  });

  it('is a no-op when the slice keeps every word, and hides everything when it keeps none', async () => {
    const line = await twoAyahs();
    const whole = render(<MushafLine line={line} slice={{fromAyah: 3}} />);
    await visible(whole.container);
    expect(spans(whole.container).every((s) => s.style.display === 'block' && s.dataset.hidden === undefined)).toBe(
      true,
    );
    expect(rowOf(whole.container).style.justifyContent).toBe('flex-start');
    expect(rootOf(whole.container).dataset.sliced).toBeUndefined();
    cleanup();
    const empty = render(<MushafLine line={line} slice={{ayah: 9}} />);
    await visible(empty.container);
    expect(spans(empty.container).every((s) => s.style.display === 'none' && s.dataset.hidden === 'true')).toBe(true);
    expect(rootOf(empty.container).dataset.sliced).toBe('empty');
    // The line keeps its slot in a stack.
    expect(rootOf(empty.container).style.height).toBe('246px');
  });

  it("applies the data's own slice, lets the prop win, and lets null cancel it", async () => {
    const data = {...(await twoAyahs()), slice: {ayah: 3} as const};
    const fromData = render(<MushafLine line={data} />);
    await visible(fromData.container);
    expect(rootOf(fromData.container).dataset.sliced).toBe('17-18');
    cleanup();
    const prop = render(<MushafLine line={data} slice={{ayah: 4}} />);
    await visible(prop.container);
    expect(rootOf(prop.container).dataset.sliced).toBe('19-20');
    cleanup();
    const cancelled = render(<MushafLine line={data} slice={null} />);
    await visible(cancelled.container);
    expect(rootOf(cancelled.container).dataset.sliced).toBeUndefined();
    expect(spans(cancelled.container).every((s) => s.dataset.hidden === undefined)).toBe(true);
  });

  it('refuses a malformed slice loudly', async () => {
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine line={justified} slice={{ayah: 0}} />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({code: 'BAD_SLICE'});
    expect(onError.mock.calls[0]?.[0].message).toMatch(/<MushafLine slice>\.ayah must be a positive integer, got 0/);
  });

  it('keeps hidden words hidden whatever wordStyle says, tells it which side they are on, and keeps data-active', async () => {
    const seen: Array<[number, boolean]> = [];
    const {container} = render(
      <MushafLine
        line={await twoAyahs()}
        slice={{ayah: 4}}
        activeWordId={17}
        wordStyle={(word, ctx) => {
          seen.push([word.wordId, ctx.inSlice]);
          return {display: 'block', opacity: ctx.inSlice ? 1 : 0.3};
        }}
      />,
    );
    await visible(container);
    const all = spans(container);
    expect(all.map((s) => s.style.display)).toEqual(['none', 'none', 'block', 'block']);
    expect(all[2]!.style.opacity).toBe('1');
    expect(seen.slice(-4)).toEqual([
      [17, false],
      [18, false],
      [19, true],
      [20, true],
    ]);
    // The current word is still the current word, painted or not.
    expect(all[0]!.dataset.active).toBe('true');
    expect(all[0]!.dataset.hidden).toBe('true');
  });

  it('measures the fit on the whole line, so a slice never changes the type size', async () => {
    const line = await twoAyahs();
    // jsdom has no layout; stand in for one: four 50 px words in a 300 px box, so the fit is 1.5.
    // Every measurement records how many words were hidden at that moment.
    const hiddenAtMeasure: number[] = [];
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      hiddenAtMeasure.push(document.querySelectorAll('[data-hidden]').length);
      const width = this.classList.contains('mushaf-line__row') ? 300 : 50;
      return {x: 0, y: 0, width, height: 0, top: 0, left: 0, right: width, bottom: 0, toJSON: () => ({})} as DOMRect;
    });
    const sliced = render(<MushafLine line={line} slice={{ayah: 4}} />);
    await visible(sliced.container);
    expect(rowOf(sliced.container).style.fontSize).toBe('168px');
    expect(rootOf(sliced.container).dataset.sliced).toBe('19-20');
    expect(hiddenAtMeasure.length).toBeGreaterThan(0);
    expect(hiddenAtMeasure.every((n) => n === 0)).toBe(true);
    cleanup();
    const whole = render(<MushafLine line={line} />);
    await visible(whole.container);
    expect(rowOf(whole.container).style.fontSize).toBe('168px');
  });
});

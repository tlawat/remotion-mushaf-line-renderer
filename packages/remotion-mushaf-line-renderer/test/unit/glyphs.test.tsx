// @vitest-environment jsdom
// Surah names, the basmalah and juz names: the shared fonts through <MushafLine> (header lines),
// <MushafSurahName> and <MushafJuzName>.
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

const {MushafLine} = await import('../../src/component/MushafLine');
const {MushafSurahName} = await import('../../src/component/SurahName');
const {MushafJuzName} = await import('../../src/component/JuzName');
const {getMushafLine} = await import('../../src/resolve/get-mushaf-line');
const {resetFontStore, getFontStatus} = await import('../../src/fonts/font-store');
const {fade} = await import('@remotion/transitions/fade');
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

const SURAH_NAMES_URL = 'https://static-cdn.tarteel.ai/qul/fonts/surah_names_v4/surah_names.woff2';
const COMMON_URL = 'https://static-cdn.tarteel.ai/qul/fonts/common/quran-common.woff2';

let fakes: ReturnType<typeof installFontFakes>;
let header: MushafLineData;
let basmalah: MushafLineData;

beforeEach(async () => {
  resetFontStore();
  remotion.reset();
  loadMock.mockReset();
  loadMock.mockResolvedValue(syntheticLayout);
  fakes = installFontFakes();
  header = await getMushafLine({mushaf: 'qpc-v4', page: 2, line: 1, theme: 'light'});
  basmalah = await getMushafLine({mushaf: 'qpc-v4', page: 2, line: 2});
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rowOf = (c: HTMLElement, root = '.mushaf-line') => c.querySelector<HTMLElement>(`${root}__row`)!;
const glyphs = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.mushaf-glyph'));
const fetched = () => (fakes.fetchMock.mock.calls as unknown[][]).map((c) => c[0]);
const visible = (c: HTMLElement, root = '.mushaf-line') =>
  waitFor(() => expect(rowOf(c, root).style.visibility).toBe('visible'));

describe('<MushafLine> on a surah_name line', () => {
  it('sets the name in its frame from the two shared fonts, behind one handle, and keeps the DOM contract', async () => {
    expect(header).toMatchObject({type: 'surah_name', surahNumber: 2, fontFamily: 'mushaf-surah-names-v4'});
    fakes.holdLoads();
    const {container} = render(<MushafLine line={header} className="hero" style={{top: 12}} />);
    const root = container.querySelector<HTMLElement>('.mushaf-line')!;
    expect(root.className).toBe('mushaf-line hero');
    expect(root.dataset).toMatchObject({
      mushaf: 'qpc-v4',
      theme: 'light',
      page: '2',
      line: '1',
      lineType: 'surah_name',
      centered: 'true',
      surah: '2',
      framed: 'true',
    });
    expect(root.dataset.fontOrigin).toBeUndefined();
    expect(root.style.height).toBe('246px');
    expect(root.style.top).toBe('12px');
    const row = rowOf(container);
    expect(root.firstElementChild).toBe(row);
    expect(row.style.visibility).toBe('hidden');
    // Both fonts are fetched from QUL's CDN, and one handle is held for the pair.
    expect(fetched()).toEqual([SURAH_NAMES_URL, COMMON_URL]);
    expect(remotion.hook.delayRender).toHaveBeenCalledTimes(1);
    expect(remotion.hook.delayRender.mock.calls[0]?.[0]).toContain('<MushafLine> page 2 line 1: waiting for fonts');
    expect(remotion.hook.delayRender.mock.calls[0]?.[0]).toContain('mushaf-surah-names-v4');
    expect(remotion.hook.delayRender.mock.calls[0]?.[0]).toContain('mushaf-quran-common');
    // The frame first (under the name), then the name: each centred in the row, in its own font.
    const [frame, name] = glyphs(container);
    expect(glyphs(container)).toHaveLength(2);
    expect(frame!.className).toBe('mushaf-glyph mushaf-glyph--frame');
    expect(frame!.dataset).toMatchObject({glyph: 'frame', font: 'quran-common'});
    expect(frame!.style.fontFamily).toBe('"mushaf-quran-common"');
    expect(frame!.textContent).toBe('');
    expect(name!.className).toBe('mushaf-glyph mushaf-glyph--surah-name');
    expect(name!.dataset).toMatchObject({glyph: 'surah-name', font: 'surah-names-v4'});
    expect(name!.style.fontFamily).toBe('"mushaf-surah-names-v4"');
    expect(name!.textContent).toBe('ﱆ'); // Al-Baqarah
    expect(name!.style.fontSize).toBe('112px');
    expect(name!.style.lineHeight).toBe('246px');
    expect(name!.style.textAlign).toBe('center');
    // The frame spans the widest line of the mushaf at the page's type size: 17 em of 112 px over
    // 8,240 units of 1,024 per em.
    expect(Number.parseFloat(frame!.style.fontSize)).toBeCloseTo((112 * (42501 / 2500)) / (8240 / 1024), 3);
    // The ink of each glyph is centred in the box, by its own band: names up a tenth of an em.
    expect(name!.style.transform).toBe('translateY(-0.1044em)');
    expect(frame!.style.transform).toBe('translateY(0.0126953125em)');
    await act(async () => {
      fakes.releaseLoads();
    });
    await visible(container);
    expect(root.dataset.fontOrigin).toBe('cdn');
    expect(remotion.hook.continueRender).toHaveBeenCalledWith(remotion.hook.delayRender.mock.results[0]?.value);
    expect(getFontStatus('surah-names-v4#cdn')).toBe('loaded');
    expect(getFontStatus('quran-common#cdn')).toBe('loaded');
    // No word spans: the line has no words.
    expect(container.querySelectorAll('.mushaf-word')).toHaveLength(0);
  });

  it('sets the name alone with framed={false}, from the surah-name font only', async () => {
    const {container} = render(<MushafLine line={header} framed={false} />);
    await visible(container);
    expect(container.querySelector<HTMLElement>('.mushaf-line')!.dataset.framed).toBe('false');
    expect(glyphs(container).map((g) => g.dataset.glyph)).toEqual(['surah-name']);
    expect(fetched()).toEqual([SURAH_NAMES_URL]);
  });

  it('sets a basmallah line with the four glyphs of the surah-name font on the page baseline', async () => {
    expect(basmalah).toMatchObject({type: 'basmallah', fontFamily: 'mushaf-surah-names-v4'});
    const {container} = render(<MushafLine line={basmalah} />);
    await visible(container);
    const root = container.querySelector<HTMLElement>('.mushaf-line')!;
    expect(root.dataset).toMatchObject({lineType: 'basmallah', centered: 'true', surah: '2'});
    expect(root.dataset.framed).toBeUndefined();
    const [glyph] = glyphs(container);
    expect(glyphs(container)).toHaveLength(1);
    expect(glyph!.dataset.glyph).toBe('basmalah');
    expect(glyph!.textContent).toBe('ﲪﲫﲮﲴ');
    expect(glyph!.style.transform).toBe('');
    expect(glyph!.style.direction).toBe('rtl');
    expect(fetched()).toEqual([SURAH_NAMES_URL]);
  });

  it('resolves a header on the convenience path and animates it like a line', async () => {
    const enter = {presentation: fade(), timing: linearTiming({durationInFrames: 10})};
    remotion.state.frame = 5;
    const {container} = render(<MushafLine page={2} line={1} enter={enter} />);
    await waitFor(() => expect(container.querySelector('.mushaf-line')).not.toBeNull());
    const root = container.querySelector<HTMLElement>('.mushaf-line')!;
    expect(root.dataset.lineType).toBe('surah_name');
    const fill = root.querySelector<HTMLElement>('[data-absolute-fill]')!;
    expect(fill.parentElement).toBe(root);
    expect(fill.style.opacity).toBe('0.5');
    expect(fill.querySelector('.mushaf-line__row')).not.toBeNull();
    await visible(container);
  });

  it('refuses a fonts package as fontSrc for the shared fonts, naming the fix', () => {
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
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine line={header} fontSrc={pkg} />
      </Boundary>,
    );
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      code: 'BAD_FONT_SRC',
      message: expect.stringContaining('holds page fonts only, and mushaf font surah-names-v4 (surah_names.woff2)'),
    });
    expect(fakes.fetchMock).not.toHaveBeenCalled();
    // A fallback package is simply not used for them.
    cleanup();
    const {container} = render(<MushafLine line={header} fontFallback={pkg} />);
    expect(fetched()).toEqual([SURAH_NAMES_URL, COMMON_URL]);
    expect(container.querySelector('.mushaf-line')).not.toBeNull();
  });

  it('serves the shared fonts from a resolver, under families of their own', async () => {
    const seen: unknown[] = [];
    const {container} = render(
      <MushafLine
        line={header}
        fontSrc={(f) => {
          seen.push(f);
          return `/fonts/${f.kind === 'page' ? f.fontSet : f.font}/${f.fileName}`;
        }}
      />,
    );
    await visible(container);
    // The resolver is called on every render; the first two calls are the two fonts.
    expect(seen.slice(0, 2)).toEqual([
      {
        kind: 'shared',
        mushaf: 'qpc-v4',
        font: 'surah-names-v4',
        format: 'woff2',
        id: 'surah-names-v4',
        fileName: 'surah_names.woff2',
        cdnUrl: SURAH_NAMES_URL,
      },
      {
        kind: 'shared',
        mushaf: 'qpc-v4',
        font: 'quran-common',
        format: 'woff2',
        id: 'quran-common',
        fileName: 'quran-common.woff2',
        cdnUrl: COMMON_URL,
      },
    ]);
    expect(fetched()).toEqual(['/fonts/surah-names-v4/surah_names.woff2', '/fonts/quran-common/quran-common.woff2']);
    const [frame, name] = glyphs(container);
    expect(name!.style.fontFamily).toMatch(/^"mushaf-surah-names-v4-[0-9a-z]+"$/);
    expect(frame!.style.fontFamily).toMatch(/^"mushaf-quran-common-[0-9a-z]+"$/);
    expect(container.querySelector<HTMLElement>('.mushaf-line')!.dataset.fontOrigin).toBe('custom');
  });

  it('throws the font error from render and refuses header data without a surah number', async () => {
    fakes.fetchMock.mockResolvedValue({ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0)});
    const onError = vi.fn();
    render(
      <Boundary onError={onError}>
        <MushafLine line={header} />
      </Boundary>,
    );
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      code: 'FONT_HTTP',
      message: expect.stringMatching(/HTTP 404 for mushaf font (surah-names-v4|quran-common)/),
    });
    const {surahNumber: _dropped, ...noSurah} = header;
    const onError2 = vi.fn();
    render(
      <Boundary onError={onError2}>
        <MushafLine line={noSurah as MushafLineData} />
      </Boundary>,
    );
    expect(onError2.mock.calls[0]?.[0]).toMatchObject({
      code: 'BAD_LINE_DATA',
      message: expect.stringContaining('surahNumber'),
    });
  });
});

describe('<MushafSurahName> and <MushafJuzName>', () => {
  it('renders a framed surah name as a block of its own, named after the surah', async () => {
    const {container} = render(<MushafSurahName surah={9} name="At-Tawbah" />);
    const root = container.querySelector<HTMLElement>('[data-sequence="At-Tawbah"] .mushaf-surah-name')!;
    expect(root).not.toBeNull();
    expect(root.dataset).toMatchObject({mushaf: 'qpc-v4', surah: '9', framed: 'true'});
    expect(root.style.height).toBe('246px');
    expect(root.style.width).toBe('100%');
    expect(glyphs(container).map((g) => g.dataset.glyph)).toEqual(['frame', 'surah-name']);
    expect(glyphs(container)[1]!.textContent).toBe('\uFC52'); // surah 9, At-Tawbah
    await visible(container, '.mushaf-surah-name');
    expect(root.dataset.fontOrigin).toBe('cdn');
    cleanup();
    const alone = render(<MushafSurahName surah={114} framed={false} fontSize={80} lineHeight={100} />);
    expect(glyphs(alone.container).map((g) => g.textContent)).toEqual(['ﯫ']); // An-Nas
    expect(glyphs(alone.container)[0]!.style.fontSize).toBe('80px');
    expect(alone.container.querySelector<HTMLElement>('.mushaf-surah-name')!.style.height).toBe('100px');
  });

  it('renders a juz name from the quran-common font', async () => {
    const {container} = render(<MushafJuzName juz={1} />);
    const root = container.querySelector<HTMLElement>('.mushaf-juz-name')!;
    expect(root.dataset).toMatchObject({mushaf: 'qpc-v4', juz: '1'});
    expect(root.dataset.variant).toBeUndefined();
    const [glyph] = glyphs(container);
    expect(glyph!.dataset).toMatchObject({glyph: 'juz-name', font: 'quran-common'});
    expect(glyph!.textContent).toBe(''); // الجزء الأول
    expect(glyph!.style.transform).toBe('translateY(-0.1123046875em)');
    expect(fetched()).toEqual([COMMON_URL]);
    await visible(container, '.mushaf-juz-name');
    cleanup();
    const last = render(<MushafJuzName juz={30} className="x" />);
    expect(last.container.querySelector<HTMLElement>('.mushaf-juz-name')!.className).toBe('mushaf-juz-name x');
    expect(glyphs(last.container)[0]!.textContent).toBe('\uE01E'); // the thirtieth juz
  });

  it('refuses surah and juz numbers out of range', () => {
    const cases: Array<[() => React.ReactElement, string, string]> = [
      [() => <MushafSurahName surah={0} />, 'SURAH_OUT_OF_RANGE', 'surah must be an integer from 1 to 114, got 0'],
      [() => <MushafSurahName surah={115} />, 'SURAH_OUT_OF_RANGE', 'got 115'],
      [() => <MushafJuzName juz={31} />, 'JUZ_OUT_OF_RANGE', 'juz must be an integer from 1 to 30, got 31'],
      [() => <MushafJuzName juz={1.5} />, 'JUZ_OUT_OF_RANGE', 'got 1.5'],
    ];
    for (const [element, code, text] of cases) {
      const onError = vi.fn();
      render(<Boundary onError={onError}>{element()}</Boundary>);
      expect(onError.mock.calls[0]?.[0]).toMatchObject({code, message: expect.stringContaining(text)});
      cleanup();
    }
    expect(fakes.fetchMock).not.toHaveBeenCalled();
  });

  it('shares one face between a header line and a standalone name, and releases handles on unmount', async () => {
    fakes.holdLoads();
    const a = render(<MushafSurahName surah={2} />);
    const b = render(<MushafLine line={header} />);
    expect(fakes.fetchMock).toHaveBeenCalledTimes(2); // the two fonts, once each
    expect(remotion.hook.delayRender).toHaveBeenCalledTimes(2);
    const handles = remotion.hook.delayRender.mock.results.map((r) => r.value);
    a.unmount();
    expect(remotion.hook.continueRender).toHaveBeenCalledWith(handles[0]);
    await act(async () => {
      fakes.releaseLoads();
    });
    await visible(b.container);
    expect(remotion.hook.continueRender).toHaveBeenCalledWith(handles[1]);
  });
});

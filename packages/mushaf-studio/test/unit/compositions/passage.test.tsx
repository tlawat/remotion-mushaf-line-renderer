// @vitest-environment jsdom
// <MushafPassage> and calculateMushafPassageMetadata(): a text-only passage on the synthetic mushaf.
import {cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {syntheticLine} from '../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import {createRemotionMock} from './helpers/remotion-mock';

const remotion = createRemotionMock();
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
}));

const mocks = vi.hoisted(() => ({getMushafLines: vi.fn(), loadTranslation: vi.fn()}));
type LineProps = import('@tlawat/remotion-mushaf-line').MushafLineProps & {
  line: import('@tlawat/remotion-mushaf-line').MushafLineData;
};
type WindowProps = import('@tlawat/remotion-mushaf-line').MushafLineWindowProps;
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  getMushafLines: (options: unknown) => mocks.getMushafLines(options),
  MushafLine: (props: LineProps) => (
    <span
      className="mushaf-line-mock"
      data-page={props.line.page}
      data-line={props.line.line}
      data-exit={props.exit ? 'yes' : 'no'}
    />
  ),
  MushafLineWindow: (props: WindowProps) => (
    <div
      className="mushaf-line-window-mock"
      data-line-count={props.lines.length}
      data-steps={JSON.stringify(props.steps)}
      data-visible-lines={props.visibleLines}
    />
  ),
  MushafSurahName: (props: {surah: number}) => <span data-surah-name={props.surah} />,
}));
vi.mock('../../../src/translations', () => ({
  loadTranslation: (...args: unknown[]) => mocks.loadTranslation(...args),
  ayahKeyOf: () => null,
  TranslationBlock: (props: {ayahKey: string | null}) => <div data-translation-block={props.ayahKey ?? ''} />,
  GlossStrip: () => null,
}));

const {MushafPassage, calculateMushafPassageMetadata, defaultMushafPassageProps, resolvePassage} = await import(
  '../../../src/compositions/passage'
);
type MushafPassageProps = import('../../../src/compositions/passage').MushafPassageProps;
type ResolvedPassage = import('../../../src/compositions/passage').ResolvedPassage;

// Surah 2 of the synthetic mushaf: 2:1 on p2l3, 2:2 on p2l4 and p3l1, 2:3 and 2:4 on p3l1-l2.
const passage = [syntheticLine(2, 3), syntheticLine(2, 4), syntheticLine(3, 1), syntheticLine(3, 2)];
const meta = {id: 'test', name: 'Test', language: 'en', source: 'file'};
const ayahText = {kind: 'ayah' as const, meta, text: {'2:1': 'Alif', '2:2': 'That'}};
const props = (
  changes: Partial<MushafPassageProps> = {},
  content: Partial<ResolvedPassage> = {},
): MushafPassageProps => ({
  ...defaultMushafPassageProps,
  surah: 2,
  fromAyah: 1,
  toAyah: 4,
  ...changes,
  resolved: {lines: passage, translation: null, ...content},
});
const layout = (changes: Partial<MushafPassageProps['layout']>) => ({...defaultMushafPassageProps.layout, ...changes});
const mount = (p: MushafPassageProps) => render(<MushafPassage {...p} />).container;
const sequences = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-sequence]'));
const block = (c: HTMLElement, name: string) => c.querySelector<HTMLElement>(`[data-mushaf-block="${name}"]`);
const translationOf = (c: HTMLElement) =>
  c.querySelector<HTMLElement>('[data-translation-block]')?.dataset.translationBlock;
const metadataArgs = (p: MushafPassageProps) => ({
  props: p,
  defaultProps: p,
  abortSignal: new AbortController().signal,
  compositionId: 'MushafPassage',
  isRendering: false,
});

beforeEach(() => {
  remotion.reset();
  remotion.state.id = 'MushafPassage';
  mocks.getMushafLines.mockReset();
  mocks.getMushafLines.mockResolvedValue(passage);
  mocks.loadTranslation.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('calculateMushafPassageMetadata', () => {
  it('resolves the lines of the range, sizes the frame and holds every line for holdSeconds plus the exit', async () => {
    const metadata = await calculateMushafPassageMetadata(
      metadataArgs({...defaultMushafPassageProps, surah: 2, fromAyah: 1, toAyah: 4}),
    );
    expect(mocks.getMushafLines).toHaveBeenCalledWith({
      surah: 2,
      fromAyah: 1,
      toAyah: 4,
      slice: true,
      theme: 'normal',
      data: expect.objectContaining({words: expect.stringContaining('data/qpc-v4/words.json.zip')}),
    });
    expect(metadata).toMatchObject({width: 1920, height: 1080, fps: 30, durationInFrames: 4 * 4 * 30 + 10});
    expect((metadata.props as MushafPassageProps).resolved).toEqual({lines: passage, translation: null});
    expect(mocks.loadTranslation).not.toHaveBeenCalled();
  });

  it('hands its abortSignal to the translation fetch', async () => {
    mocks.loadTranslation.mockResolvedValue(ayahText);
    const args = metadataArgs({
      ...defaultMushafPassageProps,
      text: {...defaultMushafPassageProps.text, translationFile: 't.json'},
    });
    await calculateMushafPassageMetadata(args);
    expect(mocks.loadTranslation.mock.calls[0]![1]).toMatchObject({signal: args.abortSignal});
    mocks.loadTranslation.mockClear();
    await resolvePassage(args.props, {fetch: vi.fn() as unknown as typeof fetch});
    expect((mocks.loadTranslation.mock.calls[0]![1] as {signal?: unknown}).signal).toBeUndefined();
  });

  it('leaves toAyah out for 0, loads the translation, refuses a reversed range', async () => {
    mocks.loadTranslation.mockResolvedValue(ayahText);
    const staticFile = (path: string) => `/static/${path}`;
    const resolved = await resolvePassage(
      {
        ...defaultMushafPassageProps,
        toAyah: 0,
        data: 'cdn',
        text: {...defaultMushafPassageProps.text, translationFile: 't.json'},
      },
      {staticFile},
    );
    const options = mocks.getMushafLines.mock.calls[0]![0] as Record<string, unknown>;
    expect('toAyah' in options).toBe(false);
    expect(options).toMatchObject({surah: 9, fromAyah: 1});
    expect(options.data).toBeUndefined();
    expect(resolved.translation).toBe(ayahText);
    expect(mocks.loadTranslation.mock.calls[0]![0]).toBe('/static/t.json');
    await expect(
      resolvePassage({...defaultMushafPassageProps, fromAyah: 5, toAyah: 2}, {staticFile}),
    ).rejects.toMatchObject({
      code: 'BAD_STUDIO_PROP',
    });
    const portrait = await calculateMushafPassageMetadata(
      metadataArgs({...defaultMushafPassageProps, layout: layout({aspect: '4:5'}), holdSeconds: 2}),
    );
    expect(portrait).toMatchObject({width: 1080, height: 1350, durationInFrames: 4 * 2 * 30 + 10});
  });
});

describe('<MushafPassage>', () => {
  it('shows the lines in a window stepping every hold, no audio, no panel', () => {
    const c = mount(props());
    expect(c.querySelector('[data-audio]')).toBeNull();
    expect(c.querySelector('[data-panel]')).toBeNull();
    const seq = sequences(c);
    expect(seq).toHaveLength(1);
    expect(seq[0]!.dataset).toMatchObject({from: '0', duration: '900'});
    const w = c.querySelector<HTMLElement>('.mushaf-line-window-mock')!;
    expect(w.dataset).toMatchObject({lineCount: '4', visibleLines: '3'});
    expect(JSON.parse(w.dataset.steps!)).toEqual([0, 120, 240, 360]);
    expect(block(c, 'Mushaf lines')!.contains(w)).toBe(true);
    expect(block(c, 'Translation')).toBeNull();
  });

  it('places the lines and the translation between the margins, as plain absolute boxes, moved by the offsets', () => {
    const c = mount(props({}, {translation: ayahText}));
    for (const name of ['Mushaf lines', 'Translation']) {
      const box = block(c, name)!;
      expect(box.tagName).toBe('DIV');
      expect(box.style.position).toBe('absolute');
      expect(box.style.left).toBe('120px');
      expect(box.style.width).toBe(`${1920 - 2 * 120}px`);
      expect(box.style.transform).toBe('');
    }
    cleanup();
    const moved = mount(
      props(
        {
          layout: layout({marginX: 200, offsetY: 80}),
          text: {...defaultMushafPassageProps.text, translationOffsetY: -40},
        },
        {translation: ayahText},
      ),
    );
    const linesBox = block(moved, 'Mushaf lines')!;
    expect(linesBox.style.left).toBe('200px');
    expect(linesBox.style.width).toBe('1520px');
    expect(linesBox.style.transform).toBe('translateY(80px)');
    expect(block(moved, 'Translation')!.style.transform).toBe('translateY(-40px)');
  });

  it('shows the fonts warning in the Studio preview only', () => {
    expect(mount(props({fonts: 'package'})).textContent).not.toContain('Mushaf Studio');
    cleanup();
    remotion.state.env.isStudio = true;
    expect(mount(props({fonts: 'package'})).textContent).toContain('Mushaf Studio: fonts is "package"');
    cleanup();
    remotion.state.env.isClientSideRendering = true;
    expect(mount(props({fonts: 'package'})).textContent).not.toContain('Mushaf Studio');
  });

  it('shows one line at a time, each leaving as the next enters', () => {
    const c = mount(props({layout: layout({visibleLines: 0})}));
    const seq = sequences(c);
    expect(seq.map((s) => Number(s.dataset.from))).toEqual([0, 120, 240, 360]);
    expect(seq.map((s) => Number(s.dataset.duration))).toEqual([120, 120, 120, 130]);
    expect(
      Array.from(c.querySelectorAll<HTMLElement>('.mushaf-line-mock')).map(
        (l) => `${l.dataset.page}/${l.dataset.line}`,
      ),
    ).toEqual(['2/3', '2/4', '3/1', '3/2']);
  });

  it('translates the first ayah of the current line', () => {
    expect(translationOf(mount(props({}, {translation: ayahText})))).toBe('2:1');
    cleanup();
    remotion.state.frame = 130; // second hold: p2l4 starts with 2:2
    expect(translationOf(mount(props({}, {translation: ayahText})))).toBe('2:2');
    cleanup();
    remotion.state.frame = 10_000; // past the end: the last line stays current
    expect(translationOf(mount(props({}, {translation: ayahText})))).toBe('2:3');
    cleanup();
    expect(
      translationOf(
        mount(props({text: {...defaultMushafPassageProps.text, translationPosition: 'none'}}, {translation: ayahText})),
      ),
    ).toBeUndefined();
  });

  it('holds the header lines 1.5 s each before the ayah lines, or introSeconds after the intro card', () => {
    const header = [syntheticLine(2, 1), syntheticLine(2, 2)];
    const content = {lines: [...header, ...passage]};
    const w = mount(props({}, content)).querySelector<HTMLElement>('.mushaf-line-window-mock')!;
    expect(w.dataset.lineCount).toBe('6');
    expect(JSON.parse(w.dataset.steps!)).toEqual([0, 45, 90, 210, 330, 450]);
    cleanup();
    const intro = {...defaultMushafPassageProps.overlay, title: 'intro' as const, introSeconds: 2};
    const seq = sequences(mount(props({layout: layout({visibleLines: 0}), overlay: intro}, content)));
    expect(seq.map((s) => [Number(s.dataset.from), Number(s.dataset.duration)])).toEqual([
      [60, 60],
      [120, 60],
      [180, 120],
      [300, 120],
      [420, 120],
      [540, 130],
    ]);
    expect(seq[0]!.dataset.sequence).toBe('p2 l1 (surah_name)');
  });

  it('shows the intro card with the surah and the range, and the corner label with the current line’s ayah', () => {
    const both = {...defaultMushafPassageProps.overlay, title: 'both' as const, reciter: 'Reader'};
    const c = mount(props({overlay: both, toAyah: 0}));
    expect(c.querySelector<HTMLElement>('[data-surah-name]')!.dataset.surahName).toBe('2');
    // toAyah 0 is the end of the surah: Al-Baqarah has 286 ayahs.
    expect(c.querySelector('[data-mushaf-overlay-part="range"]')!.textContent).toBe('Al-Baqarah · 2:1–286 · ٢:١–٢٨٦');
    expect(c.querySelector('[data-mushaf-overlay-part="reciter"]')!.textContent).toBe('Reader');
    expect(c.querySelector('[data-mushaf-overlay="corner"]')).toBeNull();
    cleanup();
    // 3 s of card, then 4 s a line: at 7.5 s the second line (2:2) is on screen.
    remotion.state.frame = 225;
    const later = mount(props({overlay: both}));
    expect(later.querySelector('[data-mushaf-overlay="intro"]')).toBeNull();
    expect(later.querySelector('[data-mushaf-overlay="corner"]')!.textContent).toBe('Al-Baqarah · 2:2 · Reader');
  });

  it('throws a clear error without resolved props', () => {
    expect(() => render(<MushafPassage {...defaultMushafPassageProps} />)).toThrow('`resolved` is null');
  });
});

// @vitest-environment jsdom
// <MushafThumbnail> and calculateMushafThumbnailMetadata() under jsdom, with `remotion` and the
// package's components and resolver mocked: the line resolved, the parts drawn, the texts shown.
import {cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {syntheticLine} from '../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import {createRemotionMock} from '../compositions/helpers/remotion-mock';

const remotion = createRemotionMock();
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
}));

const mocks = vi.hoisted(() => ({getMushafLines: vi.fn()}));
type LineProps = import('@tlawat/remotion-mushaf-line').MushafLineProps & {
  line: import('@tlawat/remotion-mushaf-line').MushafLineData;
};
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  getMushafLines: (options: unknown) => mocks.getMushafLines(options),
  MushafLine: (props: LineProps) => (
    <span
      className="mushaf-line-mock"
      data-page={props.line.page}
      data-line={props.line.line}
      data-font-size={props.fontSize}
      data-font-fallback={props.fontFallback ? 'yes' : 'no'}
    />
  ),
  MushafSurahName: (props: {surah: number; framed?: boolean; fontSize?: number}) => (
    <span data-surah-name={props.surah} data-framed={String(props.framed)} data-font-size={props.fontSize} />
  ),
}));

const {
  calculateMushafThumbnailMetadata,
  defaultMushafThumbnailProps,
  MushafThumbnail,
  mushafThumbnailSchema,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  thumbnailSubtitle,
} = await import('../../../src/export');
const {registerMushafFonts} = await import('../../../src/fonts');
type Props = import('../../../src/export').MushafThumbnailProps;

const hero = syntheticLine(2, 3);
const props = (changes: Partial<Props> = {}): Props => ({
  ...defaultMushafThumbnailProps,
  surah: 2,
  fromAyah: 1,
  toAyah: 4,
  ...changes,
  resolved: {line: hero},
});
const metadataArgs = (p: Props) => ({
  props: p,
  defaultProps: p,
  abortSignal: new AbortController().signal,
  compositionId: 'MushafThumbnail',
  isRendering: false,
});
const mount = (p: Props) => render(<MushafThumbnail {...p} />).container;
const part = (c: HTMLElement, name: string) => c.querySelector<HTMLElement>(`[data-mushaf-thumbnail-part="${name}"]`);

beforeEach(() => {
  remotion.reset();
  remotion.state.width = THUMBNAIL_WIDTH;
  remotion.state.height = THUMBNAIL_HEIGHT;
  mocks.getMushafLines.mockReset();
  mocks.getMushafLines.mockResolvedValue([hero, syntheticLine(2, 4)]);
});
afterEach(() => {
  cleanup();
  registerMushafFonts({});
});

describe('mushafThumbnailSchema', () => {
  it('accepts the defaults and describes every field', () => {
    expect(mushafThumbnailSchema.parse(defaultMushafThumbnailProps)).toEqual(defaultMushafThumbnailProps);
    for (const [key, field] of Object.entries(mushafThumbnailSchema.shape)) {
      if (key === 'customTheme') continue; // the shared fragment, described field by field
      expect(field.description, key).toBeTruthy();
    }
  });
});

describe('calculateMushafThumbnailMetadata', () => {
  it('resolves the first printed line of fromAyah, sliced to it, from the mirror, at 1280×720', async () => {
    const result = await calculateMushafThumbnailMetadata(metadataArgs(props({fromAyah: 2, toAyah: 0})));
    expect(mocks.getMushafLines).toHaveBeenCalledWith({
      surah: 2,
      fromAyah: 2,
      toAyah: 2,
      slice: true,
      theme: 'normal',
      data: {words: '/static/data/qpc-v4/words.json.zip', layout: '/static/data/qpc-v4/layout.db.zip'},
    });
    expect(result).toMatchObject({width: 1280, height: 720, props: {resolved: {line: hero}}});
  });

  it('reads the CDN when data is cdn', async () => {
    await calculateMushafThumbnailMetadata(metadataArgs(props({data: 'cdn', theme: 'plain'})));
    expect(mocks.getMushafLines.mock.calls[0]![0]).toMatchObject({data: undefined, theme: 'plain'});
  });

  it('refuses toAyah before fromAyah, and an ayah without a line', async () => {
    await expect(calculateMushafThumbnailMetadata(metadataArgs(props({fromAyah: 5, toAyah: 3})))).rejects.toThrow(
      expect.objectContaining({code: 'BAD_STUDIO_PROP', details: expect.objectContaining({prop: 'toAyah'})}),
    );
    mocks.getMushafLines.mockResolvedValue([]);
    await expect(calculateMushafThumbnailMetadata(metadataArgs(props()))).rejects.toThrow(
      expect.objectContaining({code: 'BAD_STUDIO_PROP', details: expect.objectContaining({prop: 'fromAyah'})}),
    );
  });
});

describe('thumbnailSubtitle', () => {
  it('is the subtitle, else the surah and its range, toAyah 0 the surah’s last', () => {
    expect(thumbnailSubtitle({surah: 1, fromAyah: 2, toAyah: 7, subtitle: ''})).toBe('Al-Fatihah · 1:2–7');
    expect(thumbnailSubtitle({surah: 112, fromAyah: 1, toAyah: 0, subtitle: ''})).toBe('Al-Ikhlas · 112:1–4');
    expect(thumbnailSubtitle({surah: 2, fromAyah: 255, toAyah: 255, subtitle: ''})).toBe('Al-Baqarah · 2:255');
    expect(thumbnailSubtitle({surah: 1, fromAyah: 1, toAyah: 7, subtitle: 'Juz Amma'})).toBe('Juz Amma');
  });
});

describe('<MushafThumbnail>', () => {
  it('draws the framed surah name, the resolved line across the measure, and the subtitle', () => {
    const c = mount(props());
    const name = part(c, 'surah-name')!;
    expect(name.querySelector<HTMLElement>('[data-surah-name]')!.dataset).toMatchObject({
      surahName: '2',
      framed: 'true',
    });
    const line = part(c, 'line')!;
    expect(line.style.width).toBe('1120px');
    expect(line.querySelector<HTMLElement>('.mushaf-line-mock')!.dataset).toMatchObject({page: '2', line: '3'});
    // The name's frame is narrower than the line, so its type is smaller.
    expect(Number(name.style.width.replace('px', ''))).toBeLessThan(1120);
    expect(part(c, 'title')).toBeNull();
    expect(part(c, 'subtitle')!.textContent).toBe('Al-Baqarah · 2:1–4');
  });

  it('shows the title and a set subtitle, in the props’ font and colour, over the background', () => {
    const c = mount(
      props({
        title: 'Abdul Hamid Ghraio',
        subtitle: 'Ramadan 1447',
        font: 'Inter',
        color: '#112233',
        background: '#000000',
      }),
    );
    expect(part(c, 'title')!.textContent).toBe('Abdul Hamid Ghraio');
    expect(part(c, 'subtitle')!.textContent).toBe('Ramadan 1447');
    const fill = c.querySelector<HTMLElement>('[data-absolute-fill]')!;
    expect(fill.style).toMatchObject({backgroundColor: 'rgb(0, 0, 0)', color: 'rgb(17, 34, 51)'});
    expect(c.querySelector<HTMLElement>('[data-mushaf-thumbnail]')!.style.fontFamily).toBe('Inter');
    expect(c.querySelector('img')).toBeNull();
  });

  it('draws a background image from public/ or a URL', () => {
    expect(mount(props({backgroundImage: 'bg/paper.jpg'})).querySelector('img')!.dataset.src).toBe(
      '/static/bg/paper.jpg',
    );
    cleanup();
    expect(mount(props({backgroundImage: 'https://x.test/a.jpg'})).querySelector('img')!.dataset.src).toBe(
      'https://x.test/a.jpg',
    );
  });

  it('hands the font props to the line', () => {
    const tajweed = {fontSet: 'qpc-v4-tajweed', name: 'tajweed'} as never;
    const plainPkg = {fontSet: 'qpc-v4', name: 'plain'} as never;
    registerMushafFonts({plain: plainPkg, tajweed});
    const c = mount(props({fonts: 'fallback'}));
    expect(c.querySelector<HTMLElement>('.mushaf-line-mock')!.dataset.fontFallback).toBe('yes');
  });

  it('throws when resolved is missing', () => {
    expect(() => render(<MushafThumbnail {...props()} resolved={null} />)).toThrow(/calculateMushafThumbnailMetadata/);
  });
});

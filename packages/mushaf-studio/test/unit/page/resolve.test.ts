// resolvePage(), its pure parts and calculateMushafPageMetadata() against the synthetic mushaf, with
// the package's line resolver mocked; and the schema's defaults.
import type {GetMushafLinesOptions} from '@tlawat/remotion-mushaf-line';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fetchJson, staticFile, surah2Timings, syntheticMushafLines} from './helpers';

const mocks = vi.hoisted(() => ({getMushafLines: vi.fn()}));

vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  getMushafLines: (options: unknown) => mocks.getMushafLines(options),
}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  staticFile: (path: string) => `/static/${path}`,
}));

const {
  calculateMushafPageMetadata,
  defaultMushafPageProps,
  defaultPageView,
  inRange,
  mushafPageSchema,
  pageLineAt,
  pageLineSlots,
  pageViewSchema,
  resolvePage,
  schedulePages,
} = await import('../../../src/page');
const {isMushafStudioError} = await import('../../../src/errors');
type MushafPageProps = import('../../../src/page').MushafPageProps;

const props = (changes: Partial<MushafPageProps> = {}): MushafPageProps => ({
  ...defaultMushafPageProps,
  timingsFile: 'surah2.json',
  ...changes,
});
const resolve = (changes: Partial<MushafPageProps> = {}, body: unknown = surah2Timings) =>
  resolvePage(props(changes), {fetch: fetchJson(body), staticFile});
const calls = () => mocks.getMushafLines.mock.calls.map(([options]) => options as GetMushafLinesOptions);

beforeEach(() => {
  mocks.getMushafLines.mockReset();
  mocks.getMushafLines.mockImplementation(async (options: GetMushafLinesOptions) => syntheticMushafLines(options));
});

describe('resolvePage', () => {
  it('groups a passage across a page boundary into two pages, each loaded whole, starts non-decreasing', async () => {
    const resolved = await resolve();
    expect(resolved.pages.map((p) => p.page)).toEqual([2, 3]);
    expect(resolved.pages.map((p) => [p.start, p.end])).toEqual([
      [0, 5.4],
      [5.4, 11],
    ]);
    for (let i = 1; i < resolved.pages.length; i++)
      expect(resolved.pages[i]!.start).toBeGreaterThanOrEqual(resolved.pages[i - 1]!.start);
    // The range first, unsliced, then each page whole, from the same theme and data.
    const data = {words: '/static/data/qpc-v4/words.json.zip', layout: '/static/data/qpc-v4/layout.db.zip'};
    expect(calls()).toEqual([
      {surah: 2, fromAyah: 1, toAyah: 4, theme: 'plain', data},
      {page: 2, theme: 'plain', data},
      {page: 3, theme: 'plain', data},
    ]);
    expect(resolved.pages[0]!.lines.map((l) => l.type)).toEqual(['surah_name', 'basmallah', 'ayah', 'ayah']);
    expect(resolved.pages[1]!.lines.map((l) => l.type)).toEqual(['ayah', 'ayah', 'surah_name', 'ayah']);
    expect(resolved.range).toEqual({surah: 2, fromAyah: 1, toAyah: 4});
    expect(resolved.audioOffsetSeconds).toBe(0);
    expect(resolved.doubtful).toEqual({});
  });

  it('maps the schedule of the passage to page and line numbers', async () => {
    const resolved = await resolve();
    expect(resolved.lines).toEqual([
      {page: 2, line: 3, start: 0.5, end: 3.2},
      {page: 2, line: 4, start: 3.2, end: 6},
      {page: 3, line: 1, start: 6, end: 8},
      {page: 3, line: 2, start: 8, end: 10},
    ]);
  });

  it('turns with pageView.turnSeconds: the next page starts that long before its first word', async () => {
    const resolved = await resolve({pageView: {...defaultPageView, turnSeconds: 2}});
    expect(resolved.pages.map((p) => p.start)).toEqual([0, 4]);
  });

  it('keeps one page for a passage on one page, with the audio offset of a later ayah', async () => {
    const resolved = await resolve({fromAyah: 3, toAyah: 4});
    expect(resolved.pages.map((p) => p.page)).toEqual([3]);
    expect(resolved.range).toEqual({surah: 2, fromAyah: 3, toAyah: 4});
    // The recitation's offset logic: the first ayah's start less the lead-in and the entrance.
    expect(resolved.audioOffsetSeconds).toBeGreaterThan(0);
    expect(resolved.lines[0]!.start).toBeLessThan(7.2);
  });

  it('refuses a range outside the file with the recitation’s error', async () => {
    const error = await resolve({fromAyah: 10, toAyah: 12}).catch((e: unknown) => e);
    expect(isMushafStudioError(error)).toBe(true);
    expect((error as {code: string}).code).toBe('BAD_STUDIO_PROP');
  });

  it('refuses timings no line carries', async () => {
    mocks.getMushafLines.mockImplementation(async () => []);
    const error = await resolve().catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/No line of surah 2 ayahs 1-4 carries a timed word/);
  });
});

describe('the pure parts', () => {
  it('schedulePages: none for no slots, one page from 0 to the end, starts clamped to stay in order', () => {
    expect(schedulePages([], 0.6, 10)).toEqual([]);
    expect(schedulePages([{page: 5, line: 1, start: 2, end: 3}], 0.6, 10)).toEqual([{page: 5, start: 0, end: 10}]);
    // Page 6's first line starts before page 5's turn could: it never starts before page 5.
    expect(
      schedulePages(
        [
          {page: 4, line: 15, start: 0, end: 0.1},
          {page: 5, line: 1, start: 0.1, end: 0.2},
          {page: 6, line: 1, start: 0.2, end: 1},
        ],
        0.6,
        2,
      ),
    ).toEqual([
      {page: 4, start: 0, end: 0},
      {page: 5, start: 0, end: 0},
      {page: 6, start: 0, end: 2},
    ]);
  });

  it('pageLineAt: null before the first line, the last started line after', () => {
    const slots = pageLineSlots(syntheticMushafLines({surah: 2}), [
      {index: 0, start: 1, end: 2},
      {index: 2, start: 2, end: 3},
    ]);
    expect(slots).toEqual([
      {page: 2, line: 3, start: 1, end: 2},
      {page: 3, line: 1, start: 2, end: 3},
    ]);
    expect(pageLineAt(slots, 0.5)).toBeNull();
    expect(pageLineAt(slots, 1)).toEqual(slots[0]);
    expect(pageLineAt(slots, 2.5)).toEqual(slots[1]);
    expect(pageLineAt(slots, 99)).toEqual(slots[1]);
    expect(pageLineAt([], 1)).toBeNull();
  });

  it('inRange: by surah and ayah, both ends included', () => {
    const range = {surah: 2, fromAyah: 2, toAyah: 3};
    expect(inRange({surah: 2, ayah: 2}, range)).toBe(true);
    expect(inRange({surah: 2, ayah: 3}, range)).toBe(true);
    expect(inRange({surah: 2, ayah: 1}, range)).toBe(false);
    expect(inRange({surah: 2, ayah: 4}, range)).toBe(false);
    expect(inRange({surah: 3, ayah: 2}, range)).toBe(false);
  });
});

describe('calculateMushafPageMetadata', () => {
  it('fills resolved, sizes the frame from the aspect and counts frames to a second after the last ayah', async () => {
    vi.stubGlobal('fetch', fetchJson(surah2Timings));
    try {
      const result = await calculateMushafPageMetadata({
        props: props({layout: {...defaultMushafPageProps.layout, aspect: '4:5'}}),
        defaultProps: props(),
        abortSignal: new AbortController().signal,
        compositionId: 'MushafPage',
        isRendering: false,
      });
      expect(result).toMatchObject({width: 1080, height: 1350, fps: 30, durationInFrames: 330});
      expect((result.props as MushafPageProps).resolved.pages).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('mushafPageSchema', () => {
  it('parses its defaults unchanged: the Fatiha sample, 16:9, a band, a simple frame, a sliding turn', () => {
    expect(mushafPageSchema.parse(defaultMushafPageProps)).toEqual(defaultMushafPageProps);
    expect(defaultMushafPageProps.timingsFile).toBe('mushaf-studio/fatiha/timings.json');
    // The sample's recording in the app's public/, as every composition plays it (audio-source.test.ts).
    expect(defaultMushafPageProps.audioFile).toBe('mushaf-studio/fatiha/audio.mp3');
    expect(defaultMushafPageProps.layout.aspect).toBe('16:9');
    expect(defaultPageView).toEqual({
      lineHighlight: 'band',
      lineHighlightColor: 'rgba(200,164,92,0.18)',
      dimOtherLines: 1,
      frame: 'simple',
      pageNumber: true,
      turn: 'slide',
      turnSeconds: 0.6,
    });
  });

  it('describes every field, the page options included', () => {
    for (const [key, field] of Object.entries(mushafPageSchema.shape)) expect(field.description, key).toBeTruthy();
    for (const [key, field] of Object.entries(pageViewSchema.shape)) expect(field.description, key).toBeTruthy();
  });

  it('bounds the page options', () => {
    const view = (changes: object) => pageViewSchema.safeParse({...defaultPageView, ...changes}).success;
    expect(view({turnSeconds: 0.1})).toBe(false);
    expect(view({turnSeconds: 2.5})).toBe(false);
    expect(view({dimOtherLines: 1.5})).toBe(false);
    expect(view({lineHighlight: 'glow'})).toBe(false);
    expect(view({frame: 'ornate', turn: 'fade', lineHighlight: 'underline'})).toBe(true);
  });
});

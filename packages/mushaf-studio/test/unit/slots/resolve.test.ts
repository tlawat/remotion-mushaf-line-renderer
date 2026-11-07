// The slot resolvers against the Fatiha timings fixture, with the package's line resolver mocked:
// what a template's calculateMetadata() gets back for null, empty, good and broken props, in the
// Studio's preview and in a render.
import type {GetMushafLinesOptions} from '@tlawat/remotion-mushaf-line';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fatiha from '../../fixtures/timings/fatiha.json';
import fatihaText from '../../fixtures/unicode/fatiha-text.json';
import {fatihaLines} from '../compositions/helpers/fatiha-lines';
import {surah2Timings, syntheticMushafLines} from '../page/helpers';

const mocks = vi.hoisted(() => ({getMushafLines: vi.fn()}));
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  getMushafLines: (options: unknown) => mocks.getMushafLines(options),
}));
const env = vi.hoisted(() => ({
  isStudio: true,
  isRendering: false,
  isPlayer: false,
  isClientSideRendering: false,
  isReadOnlyStudio: false,
}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  getRemotionEnvironment: () => env,
  staticFile: (path: string) => `/static/${path}`,
}));

const {
  defaultMushafAyahTextSlotProps,
  defaultMushafPageSlotProps,
  defaultMushafRecitationSlotProps,
  emptySlotPropsFor,
  mushafRecitationSlotSchema,
  resolveMushafAyahTextSlot,
  resolveMushafPageSlot,
  resolveMushafRecitationSlot,
  slotDurationOf,
  slotErrorOf,
} = await import('../../../src/slots');
const {recitationDuration} = await import('../../../src/compositions/recitation');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;
type ResolvedRecitation = import('../../../src/types').ResolvedRecitation;
type ResolvedAyahText = import('../../../src/unicode/resolve').ResolvedAyahText;
type ResolvedPage = import('../../../src/page/resolve').ResolvedPage;

const fetchJson = (body: unknown, status = 200) =>
  vi.fn(async () => ({ok: status < 400, status, json: async () => body})) as unknown as typeof fetch;

/** `public/` as the Studio serves it: `files` by path under it, 404 for anything else. */
const serve = (files: Readonly<Record<string, unknown>>) =>
  vi.fn(async (url: string) => {
    const body = files[url.replace(/^\/static\//, '')];
    return body === undefined
      ? new Response('{}', {status: 404})
      : new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json'}});
  }) as unknown as typeof fetch;

/** A two-second end card that needs no file: what the slot's length must count after the last ayah. */
const credits = {show: 'credits', seconds: 2, tafsirFile: '', chapterInfoFile: ''} as const;

const props = (changes: Partial<MushafRecitationProps> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationSlotProps,
  ...changes,
});

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as Error & {code?: string};
  }
  throw new Error('expected a rejection');
};

beforeEach(() => {
  env.isStudio = true;
  mocks.getMushafLines.mockReset();
  mocks.getMushafLines.mockImplementation(async (options: GetMushafLinesOptions) =>
    fatihaLines(options.fromAyah ?? 1, options.toAyah ?? 7),
  );
  vi.stubGlobal('fetch', fetchJson(fatiha));
});
afterEach(() => vi.unstubAllGlobals());

describe('the slot schemas and defaults', () => {
  it('take null, and the defaults paint nothing behind the text', () => {
    expect(mushafRecitationSlotSchema.parse(null)).toBeNull();
    expect(mushafRecitationSlotSchema.safeParse(defaultMushafRecitationSlotProps).success).toBe(true);
    for (const defaults of [
      defaultMushafRecitationSlotProps,
      defaultMushafAyahTextSlotProps,
      defaultMushafPageSlotProps,
    ]) {
      expect(defaults.layout.background).toBe('transparent');
      expect(defaults.background).toMatchObject({kind: 'color', color: 'transparent'});
    }
  });

  it('a partial patch under a null field fails the schema, the empty props do not', () => {
    // What a first save would write without them: a slot the template's schema refuses.
    expect(mushafRecitationSlotSchema.safeParse({audioFile: 'a.mp3', timingsFile: 'a.timings.json'}).success).toBe(
      false,
    );
    const empty = emptySlotPropsFor('recitation');
    expect(mushafRecitationSlotSchema.safeParse(empty).success).toBe(true);
    expect(empty).toMatchObject({audioFile: '', timingsFile: '', resolved: null});
    expect(emptySlotPropsFor('ayah-text')).toMatchObject({audioFile: '', timingsFile: '', textFile: ''});
    expect('textFile' in emptySlotPropsFor('page')).toBe(false);
  });
});

describe('resolveMushafRecitationSlot', () => {
  it('gives 0 frames and no error for null props and an empty timingsFile, without fetching', async () => {
    expect(await resolveMushafRecitationSlot(null, {fps: 30})).toEqual({props: null, durationInFrames: 0, error: null});
    const empty = await resolveMushafRecitationSlot(props({timingsFile: '', resolved: {stale: true}}), {fps: 30});
    expect(empty.durationInFrames).toBe(0);
    expect(empty.error).toBeNull();
    expect(empty.props?.resolved).toBeNull();
    // The same in a render: an empty slot is the template's choice.
    env.isStudio = false;
    expect((await resolveMushafRecitationSlot(null, {fps: 30, isRendering: true})).durationInFrames).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('migrates props saved before the render design first, and gives them back migrated', async () => {
    const saved = {
      ...props({timingsFile: ''}),
      highlight: {mode: 'word', style: 'marker', color: '#ffd166', dimOthers: 0.35, dimUpcomingOnly: false},
    } as unknown as MushafRecitationProps;
    const empty = await resolveMushafRecitationSlot(saved, {fps: 30});
    expect(empty.props?.highlight).toEqual({
      mode: 'word',
      style: 'wash',
      color: '#b8913a',
      restOpacity: 0.6,
      occurrence: 'first',
    });
    const resolved = await resolveMushafRecitationSlot({...saved, timingsFile: props().timingsFile}, {fps: 30});
    expect(resolved.props?.highlight.style).toBe('wash');
    expect(resolved.error).toBeNull();
  });

  it("resolves at the template's fps, with the length in resolved.durationInFrames and no size", async () => {
    const abortSignal = new AbortController().signal;
    const at30 = await resolveMushafRecitationSlot(props(), {fps: 30, abortSignal});
    const at60 = await resolveMushafRecitationSlot(props(), {fps: 60, abortSignal});
    // The same 857 frames calculateMushafRecitationMetadata() gives at 30 fps.
    expect(at30.durationInFrames).toBe(857);
    const resolved = at60.props?.resolved as ResolvedRecitation;
    expect(at60.durationInFrames).toBe(recitationDuration(resolved.timings, 60));
    expect(at60.durationInFrames).toBeGreaterThan(1700);
    expect(resolved.durationInFrames).toBe(at60.durationInFrames);
    expect(resolved.lines).toHaveLength(6);
    expect(at60.error).toBeNull();
    expect(Object.keys(at60).sort()).toEqual(['durationInFrames', 'error', 'props']);
    expect(slotDurationOf(at60.props)).toBe(at60.durationInFrames);
    // The template's abortSignal reaches the fetch.
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/fatiha/timings.json', {
      cache: 'no-store',
      signal: abortSignal,
    });
  });

  it("reports a MushafStudioError in the Studio's preview instead of throwing, and leaves it for the panel", async () => {
    vi.stubGlobal('fetch', fetchJson({}, 404));
    const result = await resolveMushafRecitationSlot(props({timingsFile: 'missing.timings.json'}), {fps: 30});
    expect(result.durationInFrames).toBe(0);
    expect(result.error).toMatch(/missing\.timings\.json.*HTTP 404/);
    expect(slotErrorOf(result.props)).toBe(result.error);
    expect(slotDurationOf(result.props)).toBe(0);
    // The base package's MushafError (timings in a shape it refuses) is reported the same way.
    vi.stubGlobal('fetch', fetchJson({version: 1, surah: 0, ayat: []}));
    const shape = await resolveMushafRecitationSlot(props(), {fps: 30});
    expect(shape.error).not.toBeNull();
  });

  it('rethrows when rendering, and anywhere outside the Studio', async () => {
    vi.stubGlobal('fetch', fetchJson({}, 404));
    const broken = props({timingsFile: 'missing.timings.json'});
    expect((await rejection(resolveMushafRecitationSlot(broken, {fps: 30, isRendering: true}))).code).toBe(
      'BAD_STUDIO_PROP',
    );
    env.isStudio = false;
    expect((await rejection(resolveMushafRecitationSlot(broken, {fps: 30}))).code).toBe('BAD_STUDIO_PROP');
  });

  it('passes an error that is not the package’s through, in the Studio too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ok: true, status: 200, json: async () => fatiha})),
    );
    mocks.getMushafLines.mockRejectedValue(new TypeError('boom'));
    const error = await rejection(resolveMushafRecitationSlot(props(), {fps: 30}));
    expect(error).toBeInstanceOf(TypeError);
  });

  it('leaves a split that no longer fits out in the preview and refuses it in a render', async () => {
    const split = props({toAyah: 5, splits: [{page: 1, line: 8, atWordId: 26}]});
    const preview = await resolveMushafRecitationSlot(split, {fps: 30});
    const resolved = preview.props?.resolved as ResolvedRecitation | undefined;
    expect(resolved?.droppedSplits).toEqual([{page: 1, line: 8, atWordId: 26}]);
    expect((await rejection(resolveMushafRecitationSlot(split, {fps: 30, isRendering: true}))).code).toBe(
      'BAD_LINE_SPLIT',
    );
  });
});

describe('resolveMushafAyahTextSlot and resolveMushafPageSlot', () => {
  it('give 0 frames for null props and for an empty timings or text file', async () => {
    expect(await resolveMushafAyahTextSlot(null, {fps: 30})).toEqual({props: null, durationInFrames: 0, error: null});
    const noText = await resolveMushafAyahTextSlot({...defaultMushafAyahTextSlotProps, textFile: ''}, {fps: 30});
    expect(noText).toMatchObject({durationInFrames: 0, error: null});
    const noTimings = await resolveMushafPageSlot({...defaultMushafPageSlotProps, timingsFile: ''}, {fps: 30});
    expect(noTimings).toMatchObject({durationInFrames: 0, error: null});
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolve an ayah text at the template's fps, the end card counted, the length in resolved", async () => {
    vi.stubGlobal(
      'fetch',
      serve({'mushaf-studio/fatiha/timings.json': fatiha, 'mushaf-studio/fatiha/text-uthmani.json': fatihaText}),
    );
    const ayahText = {...defaultMushafAyahTextSlotProps, endCard: credits};
    const at30 = await resolveMushafAyahTextSlot(ayahText, {fps: 30});
    const at60 = await resolveMushafAyahTextSlot(ayahText, {fps: 60});
    const resolved = at60.props?.resolved as ResolvedAyahText;
    expect(at60.error).toBeNull();
    expect(resolved.ayahs).toHaveLength(6);
    expect(at60.durationInFrames).toBe(recitationDuration(resolved.timings, 60) + 120);
    expect(at30.durationInFrames).toBe(recitationDuration(resolved.timings, 30) + 60);
    expect(at60.durationInFrames).toBeGreaterThan(at30.durationInFrames * 1.9);
    expect(resolved.durationInFrames).toBe(at60.durationInFrames);
    expect(slotDurationOf(at60.props)).toBe(at60.durationInFrames);
    expect(Object.keys(at60).sort()).toEqual(['durationInFrames', 'error', 'props']);
  });

  it("resolve a page at the template's fps, the end card counted, the length in resolved", async () => {
    mocks.getMushafLines.mockImplementation(async (options: GetMushafLinesOptions) => syntheticMushafLines(options));
    vi.stubGlobal('fetch', serve({'surah2.json': surah2Timings}));
    const page = {...defaultMushafPageSlotProps, timingsFile: 'surah2.json', endCard: credits};
    const at30 = await resolveMushafPageSlot(page, {fps: 30});
    const at60 = await resolveMushafPageSlot(page, {fps: 60});
    const resolved = at60.props?.resolved as ResolvedPage;
    expect(at60.error).toBeNull();
    expect(resolved.pages.map((p) => p.page)).toEqual([2, 3]);
    // The same 330 frames calculateMushafPageMetadata() gives at 30 fps, and the card's 60.
    expect(at30.durationInFrames).toBe(330 + 60);
    expect(at60.durationInFrames).toBe(recitationDuration(resolved.timings, 60) + 120);
    expect(at60.durationInFrames).toBe(660 + 120);
    expect(resolved.durationInFrames).toBe(at60.durationInFrames);
    expect(slotDurationOf(at60.props)).toBe(at60.durationInFrames);
  });

  it("report a missing file in the Studio's preview and rethrow it when rendering", async () => {
    vi.stubGlobal('fetch', serve({'mushaf-studio/fatiha/timings.json': fatiha}));
    // The text file is not in public/.
    const ayahText = defaultMushafAyahTextSlotProps;
    const preview = await resolveMushafAyahTextSlot(ayahText, {fps: 30});
    expect(preview.durationInFrames).toBe(0);
    expect(preview.error).toMatch(/text-uthmani\.json/);
    expect(slotErrorOf(preview.props)).toBe(preview.error);
    // The render refuses with the very error the preview reported.
    const refused = await rejection(resolveMushafAyahTextSlot(ayahText, {fps: 30, isRendering: true}));
    expect(refused.message).toBe(preview.error);
    expect(refused.code).toBe('TRANSLATION_FETCH_FAILED');
    // A page whose timings are missing: the same in the preview, and anywhere outside the Studio.
    const page = {...defaultMushafPageSlotProps, timingsFile: 'missing.timings.json'};
    expect((await resolveMushafPageSlot(page, {fps: 30})).error).toMatch(/missing\.timings\.json/);
    env.isStudio = false;
    expect((await rejection(resolveMushafPageSlot(page, {fps: 30}))).code).toBe('BAD_STUDIO_PROP');
  });
});

describe('slotErrorOf and slotDurationOf', () => {
  it('read only what a slot resolver left', () => {
    expect(slotErrorOf(null)).toBeNull();
    expect(slotErrorOf({resolved: null})).toBeNull();
    expect(slotErrorOf({resolved: {error: 'no file', durationInFrames: 0}})).toBe('no file');
    // A resolved recitation is never an error, whatever else it carries.
    expect(slotErrorOf({resolved: {timings: {}, error: 'x'}})).toBeNull();
    expect(slotDurationOf(null)).toBe(0);
    expect(slotDurationOf({resolved: {durationInFrames: 90}})).toBe(0);
    expect(slotDurationOf({resolved: {timings: {}, durationInFrames: 90.4}})).toBe(90);
    expect(slotDurationOf({resolved: {timings: {}}})).toBe(0);
  });
});

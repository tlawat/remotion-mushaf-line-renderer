// The slot resolvers against the Fatiha timings fixture, with the package's line resolver mocked:
// what a template's calculateMetadata() gets back for null, empty, good and broken props, in the
// Studio's preview and in a render.
import type {GetMushafLinesOptions} from '@tlawat/remotion-mushaf-line';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fatiha from '../../fixtures/timings/fatiha.json';
import {fatihaLines} from '../compositions/helpers/fatiha-lines';

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

const fetchJson = (body: unknown, status = 200) =>
  vi.fn(async () => ({ok: status < 400, status, json: async () => body})) as unknown as typeof fetch;

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

import {afterEach, describe, expect, it, vi} from 'vitest';
import {isMushafStudioError} from '../../../src/errors';

const studio = vi.hoisted(() => ({
  goToComposition: vi.fn(),
  writeStaticFile: vi.fn(async () => undefined),
  saveDefaultProps: vi.fn(async () => undefined),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => [] as {src: string; name: string; sizeInBytes: number; lastModified: number}[]),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
}));
vi.mock('@remotion/studio', () => studio);
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  staticFile: (path: string) => `/static/${path}`,
}));

const api = await import('../../../src/studio/studio-api');
const {getStudioState, resetStudioStore} = await import('../../../src/studio/store');

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetStudioStore();
  api.resetSaveTracking();
});

type Call = [
  {compositionId: string; defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>},
];

/** What the `index`th save writes, given the page-load props the Studio passes as `savedDefaultProps`. */
const write = (index: number, savedDefaultProps: Record<string, unknown>): Record<string, unknown> =>
  (studio.saveDefaultProps.mock.calls[index] as unknown as Call)[0].defaultProps({savedDefaultProps});

describe('deepMerge', () => {
  it('merges nested groups, replaces arrays and scalars, skips undefined, keeps the inputs', () => {
    const base = {
      audioFile: 'a.mp3',
      splits: [{page: 1, line: 2, atWordId: 3}],
      text: {translationFile: 't.json', glossFile: 'g.json', glossSize: 34},
      layout: {aspect: '16:9'},
    };
    const patch = {
      audioFile: 'b.mp3',
      splits: [],
      text: {glossFile: ''},
      review: {confidenceThreshold: 0.9},
      timingsFile: undefined,
    };
    const merged = api.deepMerge(base, patch);
    expect(merged).toEqual({
      audioFile: 'b.mp3',
      splits: [],
      text: {translationFile: 't.json', glossFile: '', glossSize: 34},
      layout: {aspect: '16:9'},
      review: {confidenceThreshold: 0.9},
    });
    expect(base.text.glossFile).toBe('g.json');
    expect(base.splits).toHaveLength(1);
    expect(merged.layout).toBe(base.layout);
    expect(api.deepMerge({}, {})).toEqual({});
    expect(api.deepMerge({a: {b: 1}}, {a: null})).toEqual({a: null});
    expect(api.deepMerge({a: 1}, {a: {b: 1}})).toEqual({a: {b: 1}});
  });
});

describe('names and paths', () => {
  it('slugs file names to ASCII and keeps them under the project folder', () => {
    expect(api.slugify('Abdul Hamid Ghraio 2025 (YT)')).toBe('abdul-hamid-ghraio-2025-yt');
    expect(api.slugify('سورة الفاتحة.mp3')).toBe('.mp3'.replace(/^[-.]+/, '')); // nothing ASCII left but the extension
    expect(api.slugify('--Hello__World--')).toBe('hello__world');
    expect(api.fileNameFor('My Recording.M4A')).toBe('my-recording.m4a');
    expect(api.fileNameFor('تلاوة.mp3')).toBe('audio.mp3');
    expect(api.fileNameFor('noext')).toBe('noext');
    expect(api.projectDir(undefined)).toBe('mushaf-studio/default');
    expect(api.projectDir('My Project')).toBe('mushaf-studio/my-project');
    expect(api.projectDir('   ')).toBe('mushaf-studio/default');
    expect(api.projectPath('fatiha', 'x.timings.json')).toBe('mushaf-studio/fatiha/x.timings.json');
    expect(api.baseName('a/b/c.mp3')).toBe('c.mp3');
    expect(api.stemOf('a/b/c.timings.json')).toBe('c.timings');
    expect(api.isUrl('https://x.y/z.mp3')).toBe(true);
    expect(api.isUrl('mushaf-studio/default/z.mp3')).toBe(false);
  });
});

describe('the Studio API wrappers', () => {
  it('writes files through writeStaticFile and returns the path the props record', async () => {
    const bytes = new ArrayBuffer(4);
    expect(await api.writeFile('mushaf-studio/p/a.mp3', bytes)).toBe('mushaf-studio/p/a.mp3');
    expect(studio.writeStaticFile).toHaveBeenCalledWith({filePath: 'mushaf-studio/p/a.mp3', contents: bytes});
    await api.writeJsonFile('mushaf-studio/p/t.json', {version: 1, ayat: [{ayah: 1}]});
    expect(studio.writeStaticFile).toHaveBeenLastCalledWith({
      filePath: 'mushaf-studio/p/t.json',
      contents: JSON.stringify({version: 1, ayat: [{ayah: 1}]}, null, 1),
    });
  });

  it('patches the saved default props by merging and re-evaluates the composition', async () => {
    await api.patchProps('MushafRecitation', {timingsFile: 't.json', text: {glossFile: 'g.json'}});
    expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1);
    const call = studio.saveDefaultProps.mock.calls[0] as unknown as [
      {compositionId: string; defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => unknown},
    ];
    expect(call[0].compositionId).toBe('MushafRecitation');
    // The Studio has not read the composition's live props yet: the page-load props are the base.
    const saved = {audioFile: 'a.mp3', timingsFile: 'old.json', text: {translationFile: 'x.json', glossFile: ''}};
    expect(call[0].defaultProps({savedDefaultProps: saved})).toEqual({
      audioFile: 'a.mp3',
      timingsFile: 't.json',
      text: {translationFile: 'x.json', glossFile: 'g.json'},
    });
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
  });

  it('carries a patch the live props have not come back with into the next save', async () => {
    // The Root has not been read back between the two saves: no live props, the same page-load props both times.
    const saved = {splits: [], text: {glossFile: 'g.json', transliterationFile: 't.json'}};
    await api.patchProps('MushafRecitation', {splits: [{page: 1, line: 2, atWordId: 3}]});
    expect(getStudioState().pendingPatches.MushafRecitation).toEqual({splits: [{page: 1, line: 2, atWordId: 3}]});
    await api.patchProps('MushafRecitation', {text: {glossFile: ''}});
    expect(getStudioState().pendingPatches.MushafRecitation).toEqual({
      splits: [{page: 1, line: 2, atWordId: 3}],
      text: {glossFile: ''},
    });
    expect(write(0, saved)).toEqual({
      splits: [{page: 1, line: 2, atWordId: 3}],
      text: {glossFile: 'g.json', transliterationFile: 't.json'},
    });
    expect(write(1, saved)).toEqual({
      splits: [{page: 1, line: 2, atWordId: 3}],
      text: {glossFile: '', transliterationFile: 't.json'},
    });
    // A save that fails leaves the pending patch as it was, and the next save still runs.
    studio.saveDefaultProps.mockRejectedValueOnce(new Error('read-only'));
    await expect(api.patchProps('MushafRecitation', {text: {transliterationFile: ''}})).rejects.toThrow('read-only');
    expect(getStudioState().pendingPatches.MushafRecitation).toEqual({
      splits: [{page: 1, line: 2, atWordId: 3}],
      text: {glossFile: ''},
    });
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(2);
    await api.patchProps('MushafRecitation', {slice: false});
    expect(studio.saveDefaultProps).toHaveBeenCalledTimes(4);
  });

  it('starts every save from the live props, and keeps compositions apart', async () => {
    const page = {audioFile: 'page-load.mp3', layout: {visibleLines: 3}};
    api.rememberLiveProps({MushafRecitation: {audioFile: 'live.mp3', layout: {visibleLines: 5}}});
    await api.patchProps('MushafRecitation', {slice: true});
    expect(write(0, page)).toEqual({audioFile: 'live.mp3', layout: {visibleLines: 5}, slice: true});
    // Another composition has none of this one's in-flight patch, and no live props yet.
    await api.patchProps('MushafPassage', {slice: false});
    expect(write(1, {})).toEqual({slice: false});
    expect(Object.keys(getStudioState().inFlightPatches).sort()).toEqual(['MushafPassage', 'MushafRecitation']);
  });

  it('runs one save at a time, in call order', async () => {
    const order: string[] = [];
    let finish!: () => void;
    studio.saveDefaultProps.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          order.push('first starts');
          finish = () => resolve(undefined);
        }),
    );
    studio.saveDefaultProps.mockImplementationOnce(async () => {
      order.push('second starts');
      return undefined;
    });
    const first = api.patchProps('MushafRecitation', {slice: true}).then(() => order.push('first done'));
    const second = api.patchProps('MushafRecitation', {splits: []}).then(() => order.push('second done'));
    // Both changes show at once, but the second save waits for the first.
    expect(getStudioState().pendingPatches.MushafRecitation).toEqual({slice: true, splits: []});
    await vi.waitFor(() => expect(order).toEqual(['first starts']));
    finish();
    await Promise.all([first, second]);
    expect(order).toEqual(['first starts', 'first done', 'second starts', 'second done']);
    // The second carries the first: the live props had not come back with it.
    expect(write(1, {})).toEqual({slice: true, splits: []});
  });

  it("nests a slot's patch under its props key, and starts an empty slot from its kind's props", async () => {
    const target = {
      compositionId: 'Template',
      propsKey: 'mushaf',
      emptyProps: {audioFile: '', layout: {aspect: '16:9'}},
    };
    api.rememberLiveProps({Template: {title: 'My video', mushaf: null}});
    await api.patchProps(target, {audioFile: 'a.mp3', layout: {visibleLines: 2}});
    expect(write(0, {title: 'page load', mushaf: null})).toEqual({
      title: 'My video',
      mushaf: {audioFile: 'a.mp3', layout: {aspect: '16:9', visibleLines: 2}},
    });
    expect(getStudioState().pendingPatches).toEqual({
      'Template/mushaf': {audioFile: 'a.mp3', layout: {visibleLines: 2}},
    });
    // The live props come back with it; the next save merges into the slot's props and leaves the template's alone.
    const live = {
      Template: {title: 'My video', mushaf: {audioFile: 'a.mp3', layout: {aspect: '16:9', visibleLines: 2}}},
    };
    api.observeLiveProps(live);
    expect(getStudioState().inFlightPatches).toEqual({});
    await api.patchProps(target, {splits: []});
    expect(write(1, {})).toEqual({
      title: 'My video',
      mushaf: {audioFile: 'a.mp3', layout: {aspect: '16:9', visibleLines: 2}, splits: []},
    });
    // A slot without `emptyProps` starts from nothing.
    api.rememberLiveProps({Other: {mushaf: null}});
    await api.patchProps({compositionId: 'Other', propsKey: 'other'}, {slice: true});
    expect(write(2, {})).toEqual({mushaf: null, other: {slice: true}});
  });

  it("carries one slot's save in flight into a save of another slot of the template, and judges each by its own", async () => {
    const intro = {compositionId: 'Template', propsKey: 'intro'};
    const outro = {compositionId: 'Template', propsKey: 'outro'};
    const aligned = {audioFile: 'take-1.mp3', timingsFile: 'take-1.timings.json'};
    api.rememberLiveProps({
      Template: {intro: {audioFile: 'a.mp3', timingsFile: 'a.timings.json'}, outro: {layout: {visibleLines: 3}}},
    });
    await api.patchProps(intro, aligned);
    const first = write(0, {});
    // The outro changes before the intro's save has come back: the save writes both.
    await api.patchProps(outro, {layout: {visibleLines: 5}});
    const second = write(1, {});
    expect(second).toEqual({intro: aligned, outro: {layout: {visibleLines: 5}}});
    // The intro's echo is older than the outro's save: nothing is offered, the outro's stays in flight.
    api.observeLiveProps({Template: first});
    expect(getStudioState().rolledBack).toEqual({});
    expect(getStudioState().inFlightPatches).toEqual({'Template/outro': {layout: {visibleLines: 5}}});
    api.observeLiveProps({Template: second});
    expect(getStudioState().inFlightPatches).toEqual({});
    expect(getStudioState().rolledBack).toEqual({});
  });

  it("reads and writes a target inside its composition's props", () => {
    const whole = {title: 'x', mushaf: {a: 1}, empty: null};
    expect(api.targetPropsOf(whole, {compositionId: 'T'})).toBe(whole);
    expect(api.targetPropsOf(whole, {compositionId: 'T', propsKey: 'mushaf'})).toEqual({a: 1});
    expect(api.targetPropsOf(whole, {compositionId: 'T', propsKey: 'empty'})).toBeNull();
    expect(api.targetPropsOf(whole, {compositionId: 'T', propsKey: 'title'})).toBeNull();
    expect(api.patchTarget(whole, {compositionId: 'T'}, {title: 'y'})).toEqual({...whole, title: 'y'});
    expect(api.patchTarget(whole, {compositionId: 'T', propsKey: 'mushaf'}, {b: 2})).toEqual({
      ...whole,
      mushaf: {a: 1, b: 2},
    });
    expect(api.patchTarget(whole, {compositionId: 'T', propsKey: 'empty', emptyProps: {a: 0}}, {b: 2})).toEqual({
      ...whole,
      empty: {a: 0, b: 2},
    });
    expect(whole.empty).toBeNull();
  });

  it("removes the fields of a part from a patch, and names a patch's fields", () => {
    expect(api.withoutPart({a: 1, b: {c: 2, d: 3}}, {b: {c: 0}})).toEqual({a: 1, b: {d: 3}});
    expect(api.withoutPart({a: 1, b: {c: 2}}, {a: 5, b: {c: 0}})).toBeNull();
    expect(api.withoutPart({s: [1]}, {s: [2]})).toBeNull();
    expect(api.withoutPart({a: {b: 1}}, {a: 1})).toBeNull();
    expect(api.patchPaths({audioFile: 'a', text: {glossFile: '', font: undefined}, splits: []})).toEqual([
      'audioFile',
      'text.glossFile',
      'splits',
    ]);
  });

  it('gives a click-time action the props the panel was last rendered with, pending patch applied', async () => {
    const memoized = {audioFile: 'old.mp3', overlay: {reciter: ''}};
    expect(api.latestPanelProps('MushafRecitation', memoized)).toBe(memoized);
    api.rememberPanelProps('MushafRecitation', {audioFile: 'old.mp3', overlay: {reciter: 'Alafasy'}});
    await api.patchProps('MushafRecitation', {audioFile: 'new.mp3'});
    expect(api.latestPanelProps('MushafRecitation', memoized)).toEqual({
      audioFile: 'new.mp3',
      overlay: {reciter: 'Alafasy'},
    });
    expect(api.latestPanelProps({compositionId: 'Template', propsKey: 'k'}, memoized)).toBe(memoized);
  });

  it("saves another composition from its live props, after the panel's own saves", async () => {
    api.rememberLiveProps({MushafThumbnail: {surah: 1, title: 'Sidebar title', theme: 'night'}});
    let finish!: () => void;
    studio.saveDefaultProps.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve(undefined))));
    const own = api.patchProps('MushafRecitation', {slice: true});
    const other = api.patchOtherComposition('MushafThumbnail', {surah: 36});
    await vi.waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    finish();
    expect(await other).toBe(true);
    await own;
    const call = studio.saveDefaultProps.mock.calls[1] as unknown as Call;
    expect(call[0].defaultProps({savedDefaultProps: {surah: 2, title: 'Page load', theme: 'plain'}})).toEqual({
      surah: 36,
      title: 'Sidebar title',
      theme: 'night',
    });
    expect(studio.goToComposition).toHaveBeenCalledWith('MushafThumbnail');
    studio.saveDefaultProps.mockRejectedValueOnce(new Error('No composition with the ID MushafThumbnail found.'));
    expect(await api.patchOtherComposition('MushafThumbnail', {surah: 2})).toBe(false);
  });

  it('saves another composition without selecting it when asked (a slot stays on its template)', async () => {
    expect(await api.patchOtherComposition('MushafThumbnail', {surah: 36}, {select: false})).toBe(true);
    expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1);
    expect(studio.goToComposition).not.toHaveBeenCalled();
  });

  it('finds the part of a patch the props do not carry yet', () => {
    expect(api.unappliedPart({a: 1, b: {c: 2, d: 3}}, {a: 1, b: {c: 2}})).toBeNull();
    expect(api.unappliedPart({a: 1, b: {c: 2, d: 3}}, {a: 2, b: {c: 2, d: 4}, e: undefined})).toEqual({
      a: 2,
      b: {d: 4},
    });
    expect(api.unappliedPart({s: [{x: 1}]}, {s: [{x: 1}]})).toBeNull();
  });

  it('applies a pending patch to the props the tabs see and knows when the props carry it', () => {
    const props = {audioFile: 'a.mp3', splits: [], text: {glossFile: 'g.json', glossSize: 34}, resolved: null};
    const patch = {splits: [{page: 1, line: 2, atWordId: 3}], text: {glossFile: ''}};
    expect(api.applyPatch(props, null)).toBe(props);
    expect(api.applyPatch(props, patch)).toEqual({
      audioFile: 'a.mp3',
      splits: [{page: 1, line: 2, atWordId: 3}],
      text: {glossFile: '', glossSize: 34},
      resolved: null,
    });
    expect(api.patchApplied(props, patch)).toBe(false);
    expect(api.patchApplied(api.applyPatch(props, patch), patch)).toBe(true);
    expect(api.patchApplied(props, {})).toBe(true);
    expect(api.patchApplied(props, {timingsFile: undefined})).toBe(true);
    expect(api.patchApplied({...props, splits: [{page: 1, line: 2, atWordId: 3}]}, {splits: []})).toBe(false);
    expect(api.patchApplied({text: 'no'}, {text: {glossFile: ''}})).toBe(false);
  });

  it('seeks by frame and plays', () => {
    api.seekTo(1.234, 30);
    expect(studio.seek).toHaveBeenCalledWith(37);
    expect(studio.play).toHaveBeenCalledTimes(1);
    api.seekTo(-1, 30);
    expect(studio.seek).toHaveBeenLastCalledWith(0);
  });

  it("seeks a slot's time at its start in the template: the offset added, never before the slot", () => {
    api.seekTo(1.234, 30, 45);
    expect(studio.seek).toHaveBeenLastCalledWith(82);
    api.seekToTime(2, 60, 90);
    expect(studio.seek).toHaveBeenLastCalledWith(210);
    // A time before the recitation's 0 lands on its first frame, not in the intro.
    api.seekToTime(-1, 30, 45);
    expect(studio.seek).toHaveBeenLastCalledWith(45);
    expect(studio.play).toHaveBeenCalledTimes(1);
    expect(api.studioFrameOf(1, 30)).toBe(30);
    expect(api.studioFrameOf(1, 30, 15)).toBe(45);
  });

  it('lists public files by extension, sorted, and copes with the Studio not answering', () => {
    const file = (name: string) => ({src: `/${name}`, name, sizeInBytes: 1, lastModified: 0});
    studio.getStaticFiles.mockReturnValue([file('z.MP3'), file('a.json'), file('b.wav'), file('c.txt'), file('a.m4a')]);
    expect(api.publicFiles(api.AUDIO_EXTENSIONS).map((f) => f.name)).toEqual(['a.m4a', 'b.wav', 'z.MP3']);
    expect(api.publicFiles(api.JSON_EXTENSIONS).map((f) => f.name)).toEqual(['a.json']);
    studio.getStaticFiles.mockImplementation(() => {
      throw new Error('not in the Studio');
    });
    expect(api.publicFiles(api.AUDIO_EXTENSIONS)).toEqual([]);
  });

  it('reads a public file through staticFile() and names the path when it is missing', async () => {
    const blob = new Blob(['x']);
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('ok.mp3') ? {ok: true, status: 200, blob: async () => blob} : {ok: false, status: 404},
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await api.readPublicFile('p/ok.mp3')).toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('/static/p/ok.mp3');
    let caught: unknown;
    try {
      await api.readPublicFile('p/missing.mp3');
    } catch (error) {
      caught = error;
    }
    expect(isMushafStudioError(caught) && caught.code).toBe('BAD_STUDIO_PROP');
    expect((caught as Error).message).toMatch(/public\/p\/missing.mp3 could not be read \(HTTP 404\)/);
  });

  it('reads a timings file from public/ or a URL, validated, and names the path when it is missing or bad', async () => {
    const file = {version: 1, surah: 1, audio: 'a.mp3', ayat: [{ayah: 2, start: 0.1, end: 2.9}], alignment: {}};
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('missing.json')
        ? {ok: false, status: 404}
        : {ok: true, status: 200, json: async () => (url.endsWith('bad.json') ? {version: 2} : file)},
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await api.readTimingsFile('p/t.json')).toEqual(file);
    expect(fetchMock).toHaveBeenLastCalledWith('/static/p/t.json');
    expect(await api.readTimingsFile('https://x.y/t.json')).toEqual(file);
    expect(fetchMock).toHaveBeenLastCalledWith('https://x.y/t.json');
    await expect(api.readTimingsFile('p/missing.json')).rejects.toThrow(
      /timingsFile p\/missing.json could not be read \(HTTP 404\)/,
    );
    await expect(api.readTimingsFile('p/bad.json')).rejects.toThrow(/version/);
  });
});

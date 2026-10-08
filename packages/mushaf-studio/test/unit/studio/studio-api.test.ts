import {afterEach, describe, expect, it, vi} from 'vitest';
import {isMushafStudioError} from '../../../src/errors';

const studio = vi.hoisted(() => ({
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
});

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
    const saved = {audioFile: 'a.mp3', timingsFile: 'old.json', text: {translationFile: 'x.json', glossFile: ''}};
    expect(call[0].defaultProps({savedDefaultProps: saved})).toEqual({
      audioFile: 'a.mp3',
      timingsFile: 't.json',
      text: {translationFile: 'x.json', glossFile: 'g.json'},
    });
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
  });

  it('carries a patch the composition has not come back with into the next save', async () => {
    type Call = [{defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>}];
    // The Root has not reloaded between the two saves: `savedDefaultProps` is the same old object both times.
    const saved = {splits: [], text: {glossFile: 'g.json', transliterationFile: 't.json'}};
    await api.patchProps('MushafRecitation', {splits: [{page: 1, line: 2, atWordId: 3}]});
    expect(getStudioState().pendingPatch).toEqual({splits: [{page: 1, line: 2, atWordId: 3}]});
    await api.patchProps('MushafRecitation', {text: {glossFile: ''}});
    expect(getStudioState().pendingPatch).toEqual({splits: [{page: 1, line: 2, atWordId: 3}], text: {glossFile: ''}});
    const [first, second] = studio.saveDefaultProps.mock.calls as unknown as [Call, Call];
    expect(first[0].defaultProps({savedDefaultProps: saved})).toEqual({
      splits: [{page: 1, line: 2, atWordId: 3}],
      text: {glossFile: 'g.json', transliterationFile: 't.json'},
    });
    expect(second[0].defaultProps({savedDefaultProps: saved})).toEqual({
      splits: [{page: 1, line: 2, atWordId: 3}],
      text: {glossFile: '', transliterationFile: 't.json'},
    });
    // A save that fails leaves the pending patch as it was.
    studio.saveDefaultProps.mockRejectedValueOnce(new Error('read-only'));
    await expect(api.patchProps('MushafRecitation', {text: {transliterationFile: ''}})).rejects.toThrow('read-only');
    expect(getStudioState().pendingPatch).toEqual({splits: [{page: 1, line: 2, atWordId: 3}], text: {glossFile: ''}});
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(2);
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

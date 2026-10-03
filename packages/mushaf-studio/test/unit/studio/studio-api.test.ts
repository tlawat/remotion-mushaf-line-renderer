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
vi.mock('remotion', () => ({staticFile: (path: string) => `/static/${path}`}));

const api = await import('../../../src/studio/studio-api');

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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
});

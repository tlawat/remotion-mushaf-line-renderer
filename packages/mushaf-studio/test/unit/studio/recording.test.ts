// A new recording's save (`saveRecording()` and its parts): the timings never replace a reviewed
// file (a numbered name instead), the range and the splits are reset only for another recording,
// and the text and end-card files of the old passage are cleared, by name. Uploads pick a free
// name the same way (`numberedName()`, `freePublicPath()`).
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  staticFile: (path: string) => `/static/${path}`,
}));

const studio = vi.hoisted(() => ({
  writeStaticFile: vi.fn(async () => undefined),
  saveDefaultProps: vi.fn(async () => undefined),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => [] as {src: string; name: string; sizeInBytes: number; lastModified: number}[]),
}));
vi.mock('@remotion/studio', () => studio);

const {numberedName, freePublicPath, resetSaveTracking, writeFile} = await import('../../../src/studio/studio-api');
const {isOtherRecording, saveRecording, sameTimings, stalePassageFiles, timingsPathFor} = await import(
  '../../../src/studio/recording'
);
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {resetStudioStore} = await import('../../../src/studio/store');
const {serialiseTranslation} = await import('../../../src/translations');
const {serialiseTafsir, serialiseChapterInfo} = await import('../../../src/content');
type StudioTimingsV1 = import('../../../src/types').StudioTimingsV1;
type MushafRecitationProps = import('../../../src/compositions/recitation/schema').MushafRecitationProps;

const meta = {id: 'x', name: 'X', language: 'en', source: 'file'};

/** Timings of Al-Fatihah ayahs `from`..`to`, one word each, with a sidecar carrying `edits` and a summary. */
const timingsOf = (from: number, to: number, options: {edits?: number; duration?: number} = {}): StudioTimingsV1 => ({
  version: 1,
  surah: 1,
  ayat: Array.from({length: to - from + 1}, (_, i) => ({
    ayah: from + i,
    start: i,
    end: i + 0.9,
    words: [{id: `1:${from + i}:1`, start: i, end: i + 0.9}],
  })),
  alignment: {
    version: 1,
    source: 'qud',
    segments: [],
    words: [],
    edits: Array.from({length: options.edits ?? 0}, (_, i) => ({kind: 'nudge', at: `2026-11-0${i + 1}`, note: 'n'})),
    audio: {lufs: -18, peak: 0.5, firstSoundSeconds: 0.1, durationSeconds: options.duration ?? 10},
  },
});

const listed = (...names: string[]) =>
  studio.getStaticFiles.mockReturnValue(
    names.map((name) => ({src: `/static/${name}`, name, sizeInBytes: 1, lastModified: 0})),
  );

/** `fetch` answering the files of `files` (by `public/` path) with their JSON, anything else with a 404. */
const serve = (files: Readonly<Record<string, unknown>>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url).replace(/^\/static\//, '');
      if (!(path in files)) return {ok: false, status: 404, json: async () => ({}), text: async () => ''};
      const body = files[path];
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      return {ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text};
    }),
  );

type SaveCall = [{defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>}];
const saved = (index: number) =>
  (studio.saveDefaultProps.mock.calls[index] as unknown as SaveCall)[0].defaultProps({savedDefaultProps: {}});
const writtenPaths = () =>
  studio.writeStaticFile.mock.calls.map((call) => (call as unknown as [{filePath: string}])[0].filePath);

beforeEach(() => {
  resetStudioStore();
  resetSaveTracking();
  listed();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetStudioStore();
});

describe('numberedName / freePublicPath', () => {
  it('numbers before the extension, the timings double one included', () => {
    expect(numberedName('p/take.m4a', 1)).toBe('p/take.m4a');
    expect(numberedName('p/take.m4a', 2)).toBe('p/take-2.m4a');
    expect(numberedName('p/take.timings.json', 3)).toBe('p/take-3.timings.json');
    expect(numberedName('p/my.take.m4a', 2)).toBe('p/my.take-2.m4a');
    expect(numberedName('p.d/readme', 2)).toBe('p.d/readme-2');
  });

  it('picks the first name public/ does not have', () => {
    expect(freePublicPath('p/take.m4a', new Set())).toBe('p/take.m4a');
    expect(freePublicPath('p/take.m4a', new Set(['p/take.m4a', 'p/take-2.m4a', 'p/take-4.m4a']))).toBe('p/take-3.m4a');
    listed('p/take.m4a');
    expect(freePublicPath('p/take.m4a')).toBe('p/take-2.m4a');
  });

  it('counts the files written this session before the Studio lists them', async () => {
    // Two uploads of one name back to back: public/'s list still shows neither.
    listed();
    await writeFile(freePublicPath('p/take.m4a'), new ArrayBuffer(1));
    await writeFile(freePublicPath('p/take.m4a'), new ArrayBuffer(1));
    expect(writtenPaths()).toEqual(['p/take.m4a', 'p/take-2.m4a']);
    expect(freePublicPath('p/take.m4a')).toBe('p/take-3.m4a');
    resetSaveTracking();
    expect(freePublicPath('p/take.m4a')).toBe('p/take.m4a');
  });
});

describe('timingsPathFor', () => {
  const read = (files: Readonly<Record<string, StudioTimingsV1 | null>>) => async (path: string) => {
    const file = files[path];
    if (!file) throw new Error(`cannot read ${path}`);
    return file;
  };

  it('uses the name while it is free, or holds exactly these timings', async () => {
    const timings = timingsOf(1, 7);
    expect(await timingsPathFor('p', 'take.timings.json', timings, {taken: new Set()})).toEqual({
      path: 'mushaf-studio/p/take.timings.json',
      kept: null,
      same: false,
    });
    const reordered = JSON.parse(JSON.stringify({alignment: timings.alignment, ...timings})) as StudioTimingsV1;
    const taken = new Set(['mushaf-studio/p/take.timings.json']);
    expect(
      await timingsPathFor('p', 'take.timings.json', timings, {
        taken,
        read: read({'mushaf-studio/p/take.timings.json': reordered}),
      }),
    ).toEqual({path: 'mushaf-studio/p/take.timings.json', kept: null, same: true});
  });

  it('never replaces a file with edits, other timings, or one it cannot read', async () => {
    const timings = timingsOf(1, 7);
    const taken = new Set([
      'mushaf-studio/p/take.timings.json',
      'mushaf-studio/p/take-2.timings.json',
      'mushaf-studio/p/take-3.timings.json',
    ]);
    const files = {
      'mushaf-studio/p/take.timings.json': timingsOf(1, 7, {edits: 2}),
      'mushaf-studio/p/take-2.timings.json': timingsOf(1, 6),
      'mushaf-studio/p/take-3.timings.json': null,
    };
    expect(await timingsPathFor('p', 'take.timings.json', timings, {taken, read: read(files)})).toEqual({
      path: 'mushaf-studio/p/take-4.timings.json',
      kept: 'mushaf-studio/p/take.timings.json',
      same: false,
    });
  });

  it('counts a timings file written this session before the Studio lists it', async () => {
    listed();
    const first = timingsOf(1, 7);
    await writeFile('mushaf-studio/p/take.timings.json', JSON.stringify(first));
    const files = {'mushaf-studio/p/take.timings.json': first};
    expect(await timingsPathFor('p', 'take.timings.json', timingsOf(1, 6), {read: read(files)})).toEqual({
      path: 'mushaf-studio/p/take-2.timings.json',
      kept: 'mushaf-studio/p/take.timings.json',
      same: false,
    });
    expect(await timingsPathFor('p', 'take.timings.json', first, {read: read(files)})).toEqual({
      path: 'mushaf-studio/p/take.timings.json',
      kept: null,
      same: true,
    });
  });

  it('compares the whole file, keys in any order', () => {
    expect(sameTimings(timingsOf(1, 7), timingsOf(1, 7))).toBe(true);
    expect(sameTimings(timingsOf(1, 7), timingsOf(1, 7, {edits: 1}))).toBe(false);
  });
});

describe('isOtherRecording', () => {
  const props = {audioFile: 'mushaf-studio/p/take.m4a'};

  it('is false for the same file, bytes and passage', () => {
    expect(isOtherRecording(props, 'mushaf-studio/p/take.m4a', timingsOf(1, 7, {edits: 3}), timingsOf(1, 7))).toBe(
      false,
    );
  });

  it('is true for another file, other bytes, another passage, or nothing to compare with', () => {
    expect(isOtherRecording(props, 'mushaf-studio/p/take-2.m4a', timingsOf(1, 7), timingsOf(1, 7))).toBe(true);
    expect(isOtherRecording(props, props.audioFile, timingsOf(1, 7), timingsOf(1, 7, {duration: 12}))).toBe(true);
    expect(isOtherRecording(props, props.audioFile, timingsOf(1, 7), timingsOf(2, 7))).toBe(true);
    expect(isOtherRecording(props, props.audioFile, null, timingsOf(1, 7))).toBe(true);
  });
});

describe('stalePassageFiles', () => {
  const ayahs = (keys: readonly string[]) =>
    serialiseTranslation({kind: 'ayah', meta, text: Object.fromEntries(keys.map((key) => [key, key]))});
  const words = (keys: readonly string[]) =>
    serialiseTranslation({kind: 'word', meta, words: Object.fromEntries(keys.map((key) => [`${key}:1`, key]))});
  const info = (surah: number) =>
    serialiseChapterInfo({
      kind: 'chapter-info',
      meta,
      surah,
      nameSimple: 'S',
      nameArabic: 'س',
      translatedName: 'S',
      revelationPlace: 'makkah',
      revelationOrder: 5,
      ayahCount: 7,
      shortText: 'Short.',
      paragraphs: ['Long.'],
    });
  const tafsir = (from: string, to: string) =>
    serialiseTafsir({kind: 'tafsir', meta, entries: [{from, to, paragraphs: ['Commentary.']}]});
  const fatiha = ['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7'];

  const props = (overrides: {
    text?: Partial<MushafRecitationProps['text']>;
    endCard?: Partial<MushafRecitationProps['endCard']>;
  }): MushafRecitationProps => ({
    ...defaultMushafRecitationProps,
    text: {...defaultMushafRecitationProps.text, ...overrides.text},
    endCard: {...defaultMushafRecitationProps.endCard, ...overrides.endCard},
  });

  it('clears every file of another passage, the end card showing nothing once its file goes', async () => {
    serve({
      'p/t-1-2.json': ayahs(['1:1', '1:2']),
      'p/t-all.json': ayahs(fatiha),
      'p/g-1-2.json': words(['1:1', '1:2']),
      'p/tr-all.json': words(fatiha),
      'p/tafsir-1-1-2.json': tafsir('1:1', '1:2'),
      'p/info-2.json': info(2),
    });
    const stale = await stalePassageFiles(
      props({
        text: {
          translationFile: 'p/t-1-2.json',
          translations: [
            {file: 'p/t-1-2.json', font: 'auto', fontSize: 40, color: '#000000'},
            {file: 'p/t-all.json', font: 'auto', fontSize: 40, color: '#000000'},
          ],
          glossFile: 'p/g-1-2.json',
          transliterationFile: 'p/tr-all.json',
        },
        endCard: {show: 'tafsir', tafsirFile: 'p/tafsir-1-1-2.json', chapterInfoFile: 'p/info-2.json'},
      }),
      timingsOf(1, 7),
    );
    expect(stale.cleared).toEqual(['p/t-1-2.json', 'p/g-1-2.json', 'p/tafsir-1-1-2.json', 'p/info-2.json']);
    expect(stale.patch).toEqual({
      text: {
        translations: [{file: 'p/t-all.json', font: 'auto', fontSize: 40, color: '#000000'}],
        translationFile: 'p/t-all.json',
        glossFile: '',
      },
      endCard: {tafsirFile: '', show: 'none', chapterInfoFile: ''},
    });
  });

  it('keeps the files that fit, and those it cannot read', async () => {
    serve({'p/t-all.json': ayahs(fatiha), 'p/info-1.json': info(1), 'p/tafsir.json': tafsir('1:6', '1:7')});
    const stale = await stalePassageFiles(
      props({
        text: {translationFile: 'p/t-all.json', translations: [], glossFile: 'p/missing.json'},
        endCard: {show: 'chapter-info', tafsirFile: 'p/tafsir.json', chapterInfoFile: 'p/info-1.json'},
      }),
      timingsOf(2, 7),
    );
    expect(stale).toEqual({patch: {}, cleared: []});
  });

  it('clears the one translationFile of a composition without layers', async () => {
    serve({'p/t.json': ayahs(['1:1'])});
    const {translations: _layers, ...text} = {...defaultMushafRecitationProps.text, translationFile: 'p/t.json'};
    const stale = await stalePassageFiles(
      {...defaultMushafRecitationProps, text} as MushafRecitationProps,
      timingsOf(1, 2),
    );
    expect(stale).toEqual({patch: {text: {translationFile: ''}}, cleared: ['p/t.json']});
  });
});

describe('saveRecording', () => {
  const reviewed = 'mushaf-studio/p/take.timings.json';
  const base: MushafRecitationProps = {
    ...defaultMushafRecitationProps,
    audioFile: 'mushaf-studio/p/take.m4a',
    timingsFile: reviewed,
    fromAyah: 2,
    toAyah: 5,
    splits: [{page: 1, line: 3, atWordId: 4}],
  };
  const save = (props: MushafRecitationProps, audioFile: string, timings: StudioTimingsV1) =>
    saveRecording({
      target: {compositionId: 'MushafRecitation'},
      props,
      project: 'p',
      audioFile,
      timings,
      timingsName: 'take.timings.json',
    });

  it('aligning the same recording again keeps the reviewed file, the range and the splits', async () => {
    listed(reviewed);
    serve({[reviewed]: timingsOf(1, 7, {edits: 2})});
    const result = await save(base, base.audioFile, timingsOf(1, 7));
    expect(writtenPaths()).toEqual(['mushaf-studio/p/take-2.timings.json']);
    expect(result.timingsFile).toBe('mushaf-studio/p/take-2.timings.json');
    expect(saved(0)).toEqual({audioFile: base.audioFile, timingsFile: 'mushaf-studio/p/take-2.timings.json'});
    expect(result.notices).toEqual([
      'public/mushaf-studio/p/take.timings.json has your edits or other timings, so it is kept: the new timings are public/mushaf-studio/p/take-2.timings.json, and the composition uses them.',
      'The same recording as before: the ayah range and the line splits are kept.',
    ]);
  });

  it('writes nothing when the file already holds these timings', async () => {
    listed(reviewed);
    serve({[reviewed]: timingsOf(1, 7)});
    const result = await save(base, base.audioFile, timingsOf(1, 7));
    expect(studio.writeStaticFile).not.toHaveBeenCalled();
    expect(result.timingsFile).toBe(reviewed);
    expect(saved(0)).toEqual({audioFile: base.audioFile, timingsFile: reviewed});
  });

  it('another recording resets the range and the splits and clears the old passage’s files, by name', async () => {
    listed(reviewed);
    serve({
      [reviewed]: timingsOf(1, 7),
      'p/t-1-7.json': serialiseTranslation({kind: 'ayah', meta, text: {'1:1': 'a'}}),
    });
    const props = {...base, text: {...base.text, translationFile: 'p/t-1-7.json', translations: []}};
    const result = await save(props, 'mushaf-studio/p/other.m4a', timingsOf(1, 7));
    // The same timings for another file (a re-encode, say): nothing to write, but the range starts again.
    expect(writtenPaths()).toEqual([]);
    expect(saved(0)).toEqual({
      audioFile: 'mushaf-studio/p/other.m4a',
      timingsFile: reviewed,
      fromAyah: 0,
      toAyah: 0,
      splits: [],
      text: {translations: [], translationFile: ''},
    });
    expect(result.notices).toEqual([
      'Cleared public/p/t-1-7.json: it is not for the new passage, 1:1-7. Fetch it again in the Text tab.',
    ]);
  });
});

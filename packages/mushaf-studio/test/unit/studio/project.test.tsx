// @vitest-environment jsdom
// Project files: what they collect and how they are checked (pure), then the header menu's export
// (written into public/ and downloaded) and import (validated, files checked, props saved).
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

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
  useRemotionEnvironment: () => env,
  useVideoConfig: () => ({width: 1920, height: 1080, fps: 30, durationInFrames: 900, id: 'MushafRecitation'}),
  useCurrentFrame: () => 0,
  Sequence: () => null,
  staticFile: (path: string) => `/static/${path}`,
}));

const studio = vi.hoisted(() => ({
  writeStaticFile: vi.fn(async () => undefined),
  saveDefaultProps: vi.fn(async () => undefined),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => [] as {name: string; src: string; sizeInBytes: number; lastModified: number}[]),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);
vi.mock('../../../src/qud', () => ({listRecitations: vi.fn(async () => []), DEFAULT_CONFIDENCE_THRESHOLD: 0.8}));

const project = await import('../../../src/studio/project');
const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {defaultMushafAyahTextProps} = await import('../../../src/unicode/schema');
const {resetStudioStore, getStudioState} = await import('../../../src/studio/store');
const {isMushafStudioError} = await import('../../../src/errors');
type MushafRecitationProps = import('../../../src/compositions/recitation/schema').MushafRecitationProps;

const recitation: MushafRecitationProps = {
  ...defaultMushafRecitationProps,
  audioFile: 'mushaf-studio/p/a.mp3',
  timingsFile: 'mushaf-studio/p/a.timings.json',
  data: 'mirror',
  text: {...defaultMushafRecitationProps.text, translationFile: 'mushaf-studio/p/t.json', glossFile: ''},
  layout: {...defaultMushafRecitationProps.layout, backgroundImage: '/mushaf-studio/p/bg.png'},
  resolved: {
    timings: {version: 1, surah: 1, ayat: []},
    audioOffsetSeconds: 0,
    lines: [],
    schedule: [],
    translation: null,
    gloss: null,
    transliteration: null,
    doubtful: {},
  },
};

const entry = (name: string) => ({name, src: `/static/${name}`, sizeInBytes: 1, lastModified: 0});

const errorOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    expect(isMushafStudioError(error) && error.code).toBe('BAD_STUDIO_PROP');
    return (error as Error).message;
  }
  throw new Error('did not throw');
};

describe('collectProjectFiles / projectFileOf', () => {
  it('lists the public/ paths the props point to, sorted, once each, without URLs or empty fields', () => {
    expect(project.collectProjectFiles(recitation)).toEqual([
      'data/qpc-v4/layout.db.zip',
      'data/qpc-v4/words.json.zip',
      'mushaf-studio/p/a.mp3',
      'mushaf-studio/p/a.timings.json',
      'mushaf-studio/p/bg.png',
      'mushaf-studio/p/t.json',
    ]);
    const cdn = {
      ...recitation,
      data: 'cdn' as const,
      audioFile: 'https://x.y/a.mp3',
      layout: defaultMushafRecitationProps.layout,
    };
    expect(project.collectProjectFiles(cdn)).toEqual(['mushaf-studio/p/a.timings.json', 'mushaf-studio/p/t.json']);
  });

  it("adds an ayah text's Quran text", () => {
    const files = project.collectProjectFiles({...defaultMushafAyahTextProps, textFile: 'mushaf-studio/r/text.json'});
    expect(files).toContain('mushaf-studio/r/text.json');
  });

  it('keeps the content and style props and drops resolved', () => {
    const file = project.projectFileOf('MushafRecitation', recitation);
    expect(file.version).toBe(1);
    expect(file.compositionId).toBe('MushafRecitation');
    expect(file.props).not.toHaveProperty('resolved');
    expect(file.props).toMatchObject({audioFile: 'mushaf-studio/p/a.mp3', theme: 'plain', splits: []});
    expect(file.files).toEqual(project.collectProjectFiles(recitation));
  });
});

describe('validateProjectFile', () => {
  const valid = () => JSON.parse(JSON.stringify(project.projectFileOf('MushafRecitation', recitation)));

  it('reads back what projectFileOf wrote', () => {
    expect(project.validateProjectFile(valid())).toEqual(project.projectFileOf('MushafRecitation', recitation));
  });

  it('names what is wrong', () => {
    expect(errorOf(() => project.validateProjectFile(null))).toBe(
      'The project file is not valid: it is not a JSON object.',
    );
    expect(errorOf(() => project.validateProjectFile([]))).toMatch(/not a JSON object/);
    expect(errorOf(() => project.validateProjectFile({...valid(), version: 2}))).toBe(
      'The project file is not valid: version is 2; this panel reads version 1.',
    );
    expect(errorOf(() => project.validateProjectFile({...valid(), version: undefined}))).toMatch(
      /version is undefined/,
    );
    expect(errorOf(() => project.validateProjectFile({...valid(), compositionId: ''}))).toMatch(
      /compositionId is missing/,
    );
    expect(errorOf(() => project.validateProjectFile({...valid(), props: 'x'}))).toMatch(/props is not an object/);
    expect(errorOf(() => project.validateProjectFile({...valid(), files: [1]}))).toMatch(
      /files is not a list of paths/,
    );
    const bad = valid();
    bad.props.fromAyah = -3;
    expect(errorOf(() => project.validateProjectFile(bad))).toMatch(
      /^The project file is not valid: props\.fromAyah: /,
    );
    const missingKey = valid();
    delete missingKey.props.layout;
    expect(errorOf(() => project.validateProjectFile(missingKey))).toMatch(/props\.layout: /);
  });

  it('completes the file list from the props, so a trimmed list cannot hide a file', () => {
    const trimmed = {...valid(), files: ['extra/readme.txt']};
    expect(project.validateProjectFile(trimmed).files).toEqual(
      [...project.collectProjectFiles(recitation), 'extra/readme.txt'].sort(),
    );
  });

  it('tells the missing files and the kind of composition', () => {
    const file = project.validateProjectFile(valid());
    expect(
      project.missingProjectFiles(file, [entry('mushaf-studio/p/a.mp3'), entry('/data/qpc-v4/layout.db.zip')]),
    ).toEqual([
      'data/qpc-v4/words.json.zip',
      'mushaf-studio/p/a.timings.json',
      'mushaf-studio/p/bg.png',
      'mushaf-studio/p/t.json',
    ]);
    expect(project.missingProjectFiles({files: []}, [])).toEqual([]);
    expect(project.projectFits(file, recitation)).toBe(true);
    expect(project.projectFits(file, defaultMushafAyahTextProps)).toBe(false);
  });
});

describe('the Project menu', () => {
  beforeEach(() => resetStudioStore());
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    resetStudioStore();
  });

  const openMenu = () => fireEvent.click(document.querySelector('[data-mushaf-control="project-menu"]')!);

  it('exports the props into the project folder and offers the file as a download', async () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:project';
    });
    Object.assign(URL, {createObjectURL, revokeObjectURL: vi.fn()});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<MushafStudioPanel compositionId="MushafRecitation" props={recitation} project="My Fatiha" />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'Export project'}));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(1));
    const [write] = studio.writeStaticFile.mock.calls[0] as unknown as [{filePath: string; contents: string}];
    expect(write.filePath).toBe('mushaf-studio/my-fatiha/project.json');
    expect(JSON.parse(write.contents)).toEqual(project.projectFileOf('MushafRecitation', recitation));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('project.json');
    expect(link.href).toBe('blob:project');
    expect(created[0]!.type).toBe('application/json');
    expect(document.querySelector('a[download]')).toBeNull();
    await waitFor(() =>
      expect(getStudioState().notice).toMatch(/public\/mushaf-studio\/my-fatiha\/project\.json is written/),
    );
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });

  const importFile = (contents: string) => {
    openMenu();
    const input = document.querySelector<HTMLInputElement>('[data-mushaf-control="import-project-file"]')!;
    fireEvent.change(input, {target: {files: [new File([contents], 'project.json', {type: 'application/json'})]}});
  };

  it('imports a project whose files are all in public/: one save of its props', async () => {
    const file = project.projectFileOf('Other', recitation);
    studio.getStaticFiles.mockReturnValue(file.files.map(entry));
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    importFile(JSON.stringify(file));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    const call = studio.saveDefaultProps.mock.calls[0] as unknown as [
      {
        compositionId: string;
        defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>;
      },
    ];
    expect(call[0].compositionId).toBe('MushafRecitation');
    const saved = call[0].defaultProps({savedDefaultProps: {...defaultMushafRecitationProps}});
    expect(saved).toEqual({...file.props, resolved: null});
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(getStudioState().notice).toBe(
        'project.json is imported: the props are saved; its 6 files are in public/.',
      ),
    );
  });

  it('names the missing files and changes nothing', async () => {
    studio.getStaticFiles.mockReturnValue([entry('mushaf-studio/p/a.mp3')]);
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    importFile(JSON.stringify(project.projectFileOf('MushafRecitation', recitation)));
    await waitFor(() => expect(getStudioState().error).toMatch(/^public\/ lacks 5 files the project needs: /));
    expect(getStudioState().error).toContain('public/mushaf-studio/p/t.json');
    expect(getStudioState().error).not.toContain('public/mushaf-studio/p/a.mp3,');
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a project, or one for the other kind of composition', async () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    importFile('{not json');
    await waitFor(() => expect(getStudioState().error).toBe('The project file is not valid: it is not a JSON object.'));
    const ayahText = project.projectFileOf('MushafAyahText', defaultMushafAyahTextProps);
    studio.getStaticFiles.mockReturnValue(ayahText.files.map(entry));
    importFile(JSON.stringify(ayahText));
    await waitFor(() => expect(getStudioState().error).toMatch(/^The project was saved from MushafAyahText/));
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });
});

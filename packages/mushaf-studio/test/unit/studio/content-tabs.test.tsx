// @vitest-environment jsdom
// The Text tab's translation layers (add, replace, reorder, remove, the cap, the single file as the
// first layer), the end card's tafsir and surah introduction, and a page composition in the panel:
// its pages in Lines, its translations in Text, Review and a new recording without `splits`.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fatihaLines} from '../compositions/helpers/fatiha-lines';

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
  getStaticFiles: vi.fn(() => []),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
  goToComposition: vi.fn(),
  focusDefaultPropsPath: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);
vi.mock('../../../src/qud', () => ({listRecitations: vi.fn(async () => []), DEFAULT_CONFIDENCE_THRESHOLD: 0.8}));

const translations = vi.hoisted(() => ({
  listQuranComTranslations: vi.fn(
    async (): Promise<unknown[]> => [
      {id: 20, name: 'Saheeh International', authorName: 'Saheeh', language: 'en', languageName: 'English'},
      {id: 131, name: 'Clear Quran', authorName: 'Khattab', language: 'en', languageName: 'English'},
    ],
  ),
  fetchQuranComTranslation: vi.fn(async () => ({kind: 'ayah'})),
  fetchQuranComWordGloss: vi.fn(),
  serialiseTranslation: vi.fn(() => '{"translation":true}'),
  loadTranslation: vi.fn(),
}));
vi.mock('../../../src/translations', () => translations);

const content = vi.hoisted(() => ({
  listQuranComTafsirs: vi.fn(
    async (): Promise<unknown[]> => [
      {id: 169, name: 'Ibn Kathir (Abridged)', authorName: 'Hafiz Ibn Kathir', language: 'en', languageName: 'English'},
      {id: 16, name: 'Tafsir Muyassar', authorName: 'Muyassar', language: 'ar', languageName: 'Arabic'},
    ],
  ),
  fetchQuranComTafsir: vi.fn(async () => ({kind: 'tafsir'})),
  serialiseTafsir: vi.fn(() => '{"tafsir":true}'),
  fetchChapterInfo: vi.fn(async () => ({kind: 'chapter-info'})),
  serialiseChapterInfo: vi.fn(() => '{"info":true}'),
}));
vi.mock('../../../src/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/content')>()),
  ...content,
}));

const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {defaultMushafPageProps} = await import('../../../src/page/schema');
const {resetStudioStore, getStudioState} = await import('../../../src/studio/store');
const {freshRecording, isPageProps, translationLayersOf, hasLines, isPageResolved, audioOffsetOf} = await import(
  '../../../src/studio/tab-props'
);
const {projectFits, collectProjectFiles} = await import('../../../src/studio/project');
type StudioTimings = import('../../../src/types').StudioTimings;
type MushafRecitationProps = import('../../../src/compositions/recitation/schema').MushafRecitationProps;
type MushafPageProps = import('../../../src/page/schema').MushafPageProps;
type ResolvedPage = import('../../../src/page/resolve').ResolvedPage;
type TranslationLayer = import('../../../src/studio/tab-props').TranslationLayer;

const timings: StudioTimings = {
  version: 1,
  surah: 1,
  audio: 'mushaf-studio/p/fatiha.mp3',
  ayat: [
    {ayah: 2, start: 0, end: 3, words: [{id: '1:2:1', start: 0, end: 3}]},
    {ayah: 3, start: 3, end: 6, words: [{id: '1:3:1', start: 3, end: 6}]},
  ],
};

const recitation = (text: Partial<MushafRecitationProps['text']> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  audioFile: 'mushaf-studio/p/fatiha.mp3',
  timingsFile: 'mushaf-studio/p/fatiha.timings.json',
  text: {...defaultMushafRecitationProps.text, ...text},
  resolved: {
    timings,
    audioOffsetSeconds: 0,
    lines: fatihaLines(2, 3),
    schedule: [{index: 0, start: 0, end: 6}],
    translation: null,
    gloss: null,
    transliteration: null,
    doubtful: {},
  },
});

const resolvedPage: ResolvedPage = {
  timings,
  audioOffsetSeconds: 0,
  range: {surah: 1, fromAyah: 2, toAyah: 3},
  pages: [
    {page: 1, lines: [], start: 0, end: 4.5},
    {page: 2, lines: [], start: 4.5, end: 9},
  ],
  lines: [
    {page: 1, line: 3, start: 0, end: 2},
    {page: 1, line: 4, start: 2, end: 4.5},
    {page: 2, line: 2, start: 4.5, end: 9},
  ],
  doubtful: {},
  translation: null,
};

const page = (): MushafPageProps => ({
  ...defaultMushafPageProps,
  audioFile: 'mushaf-studio/p/fatiha.mp3',
  timingsFile: 'mushaf-studio/p/fatiha.timings.json',
  resolved: resolvedPage,
});

const layer = (file: string, font = 'auto'): TranslationLayer => ({file, font, fontSize: 32, color: '#222222'});

type SaveCall = [
  {compositionId: string; defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>},
];
const saved = (index: number): Record<string, unknown> =>
  (studio.saveDefaultProps.mock.calls[index] as unknown as SaveCall)[0].defaultProps({savedDefaultProps: {}});
type WriteCall = [{filePath: string; contents: string}];
const written = (index: number) => (studio.writeStaticFile.mock.calls[index] as unknown as WriteCall)[0];

const textTab = (props: MushafRecitationProps | MushafPageProps, id = 'MushafRecitation') =>
  render(<MushafStudioPanel compositionId={id} props={props} initialTab="text" />);
const idle = () => waitFor(() => expect(getStudioState().busy).toBeNull());

beforeEach(() => resetStudioStore());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetStudioStore();
});

describe('translation layers', () => {
  it('adds a fetched translation as a layer in the font of its script, and keeps translationFile as the first', async () => {
    textTab(recitation());
    expect(screen.getByText('Translation layers (0/3)')).toBeTruthy();
    expect(screen.getByText('No translation layer yet.')).toBeTruthy();
    fireEvent.click(await screen.findByText('Add a layer: fetch for this passage'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(translations.fetchQuranComTranslation).toHaveBeenCalledWith({
      resourceId: 20,
      chapter: 1,
      fromAyah: 2,
      toAyah: 3,
    });
    const file = 'mushaf-studio/mushafrecitation/translation-20-1-2-3.json';
    expect(written(0)).toEqual({filePath: file, contents: '{"translation":true}'});
    // The new layer takes the single translation's size and colour; `font: 'auto'` picks the script's font.
    expect(saved(0)).toEqual({
      text: {translations: [{file, font: 'auto', fontSize: 40, color: '#4a4a4a'}], translationFile: file},
    });
    // The second one comes after it, whichever resource.
    await idle();
    fireEvent.change(screen.getByLabelText('Translation'), {target: {value: '131'}});
    fireEvent.click(screen.getByText('Add a layer: fetch for this passage'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    const second = 'mushaf-studio/mushafrecitation/translation-131-1-2-3.json';
    expect(saved(1)).toEqual({
      text: {
        translations: [
          {file, font: 'auto', fontSize: 40, color: '#4a4a4a'},
          {file: second, font: 'auto', fontSize: 40, color: '#4a4a4a'},
        ],
        translationFile: file,
      },
    });
  });

  it('shows a lone translationFile as the first layer, and adding one keeps it first', async () => {
    textTab(recitation({translationFile: 'mushaf-studio/p/old.json'}));
    expect(screen.getByText('1. mushaf-studio/p/old.json (font: auto)')).toBeTruthy();
    fireEvent.click(await screen.findByText('Add a layer: fetch for this passage'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    const patch = saved(0) as {text: {translations: TranslationLayer[]; translationFile: string}};
    expect(patch.text.translations.map((entry) => entry.file)).toEqual([
      'mushaf-studio/p/old.json',
      'mushaf-studio/mushafrecitation/translation-20-1-2-3.json',
    ]);
    expect(patch.text.translationFile).toBe('mushaf-studio/p/old.json');
  });

  it('moves, replaces and removes layers, saving the whole list each time', async () => {
    const layers = [layer('a.json'), layer('b.json', 'Amiri'), layer('c.json')];
    textTab(recitation({translations: layers, translationFile: 'a.json'}));
    expect(screen.getByText('Translation layers (3/3)')).toBeTruthy();
    // Three is the most: nothing more to add.
    expect(
      (await screen.findByText<HTMLButtonElement>('Add a layer: fetch for this passage')).closest('button')!.disabled,
    ).toBe(true);
    const row = (index: number) => within(document.body.querySelector<HTMLElement>(`[data-layer="${index}"]`)!);
    expect(row(0).getByTitle<HTMLButtonElement>('Move this layer up').disabled).toBe(true);
    expect(row(2).getByTitle<HTMLButtonElement>('Move this layer down').disabled).toBe(true);

    fireEvent.click(row(0).getByTitle('Move this layer down'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(saved(0)).toEqual({
      text: {translations: [layer('b.json', 'Amiri'), layer('a.json'), layer('c.json')], translationFile: 'b.json'},
    });
    await idle();

    // The panel shows what it saved until the Root comes back: `b` is first now.
    expect(screen.getByText('1. b.json (font: Amiri)')).toBeTruthy();
    fireEvent.click(row(1).getByTitle('Replace with the selected translation, fetched for this passage'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    const fetched = 'mushaf-studio/mushafrecitation/translation-20-1-2-3.json';
    expect(saved(1)).toEqual({
      text: {translations: [layer('b.json', 'Amiri'), layer(fetched), layer('c.json')], translationFile: 'b.json'},
    });
    await idle();

    fireEvent.click(row(0).getByTitle('Remove this layer'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(3));
    expect(saved(2)).toEqual({text: {translations: [layer(fetched), layer('c.json')], translationFile: fetched}});
    await idle();
    expect(getStudioState().error).toBeNull();
  });

  it('reads the layers without a text group, and with layers of another shape left out', () => {
    expect(translationLayersOf({...page(), text: undefined} as unknown as MushafPageProps)).toEqual([]);
    expect(
      translationLayersOf(
        recitation({translations: [layer('a.json'), {file: 'b.json'} as unknown as TranslationLayer]}),
      ),
    ).toEqual([layer('a.json')]);
  });
});

describe('end card', () => {
  it("fetches the passage's tafsir in the chosen language and shows it on the end card", async () => {
    textTab(recitation());
    await screen.findByLabelText('Tafsir');
    const language = screen.getAllByRole('combobox', {name: 'Language'});
    // The tafsir's language picker is the last one (the translation's comes first).
    fireEvent.change(language[language.length - 1]!, {target: {value: 'ar'}});
    expect(screen.getByLabelText<HTMLSelectElement>('Tafsir').value).toBe('16');
    fireEvent.click(screen.getByText('Fetch the tafsir for this passage'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(content.fetchQuranComTafsir).toHaveBeenCalledWith({tafsirId: 16, surah: 1, fromAyah: 2, toAyah: 3});
    const file = 'mushaf-studio/mushafrecitation/tafsir-16-1-2-3.json';
    expect(written(0)).toEqual({filePath: file, contents: '{"tafsir":true}'});
    expect(saved(0)).toEqual({endCard: {tafsirFile: file, show: 'tafsir'}});
    await idle();
    expect(getStudioState().notice).toBe(`public/${file} is written and the end card shows it.`);
    expect(content.listQuranComTafsirs).toHaveBeenCalledTimes(1);
  });

  it("fetches the surah's introduction in the language typed and shows it on the end card", async () => {
    textTab(recitation());
    fireEvent.change(screen.getByLabelText('Language (quran.com code, en, ar, ur, ...)'), {target: {value: 'UR'}});
    fireEvent.click(screen.getByText('Fetch surah info'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(content.fetchChapterInfo).toHaveBeenCalledWith({surah: 1, language: 'ur'});
    const file = 'mushaf-studio/mushafrecitation/chapter-info-1-ur.json';
    expect(written(0)).toEqual({filePath: file, contents: '{"info":true}'});
    expect(saved(0)).toEqual({endCard: {chapterInfoFile: file, show: 'chapter-info'}});
  });

  it('offers neither on a composition without an end card, and fetches no tafsir list', () => {
    const {endCard: _card, ...props} = recitation();
    textTab(props as MushafRecitationProps);
    expect(screen.getByText('This composition has no end card, so no tafsir or surah introduction.')).toBeTruthy();
    expect(screen.queryByText('Fetch surah info')).toBeNull();
    expect(content.listQuranComTafsirs).not.toHaveBeenCalled();
  });
});

describe('a page composition', () => {
  it('is told apart by its pageView, its resolution by its pages', () => {
    expect(isPageProps(page())).toBe(true);
    expect(isPageProps(recitation())).toBe(false);
    expect(hasLines(resolvedPage)).toBe(false);
    expect(isPageResolved(resolvedPage)).toBe(true);
    expect(audioOffsetOf({...resolvedPage, audioOffsetSeconds: 1.5})).toBe(1.5);
    // A new recording resets the range; a page has no splits to reset.
    expect(freshRecording(page())).toEqual({fromAyah: 0, toAyah: 0});
    expect(freshRecording(recitation())).toEqual({fromAyah: 0, toAyah: 0, splits: []});
  });

  it('lists its pages in Lines with their times, and a click seeks to a page', () => {
    render(<MushafStudioPanel compositionId="MushafPage" props={page()} initialTab="lines" />);
    expect(screen.getByText('Pages (2)')).toBeTruthy();
    expect(screen.getByText('Page 1')).toBeTruthy();
    expect(screen.getByText('0.00–4.50 s')).toBeTruthy();
    expect(screen.getByText('2 lines recited')).toBeTruthy();
    expect(screen.getByText('1 line recited')).toBeTruthy();
    expect(screen.queryByText(/^Splits/)).toBeNull();
    fireEvent.click(screen.getByText('Page 2'));
    expect(studio.seek).toHaveBeenCalledWith(135);
    expect(studio.play).toHaveBeenCalled();
  });

  it('says so in Lines before its pages are resolved', () => {
    render(<MushafStudioPanel compositionId="MushafPage" props={{...page(), resolved: null}} initialTab="lines" />);
    expect(screen.getByText('No pages yet: the composition resolves them from the timings file.')).toBeTruthy();
  });

  it('takes translation layers but no word gloss in Text', async () => {
    textTab(page(), 'MushafPage');
    expect(screen.getByText('Translation layers (0/3)')).toBeTruthy();
    expect(screen.queryByText('Word by word')).toBeNull();
    fireEvent.click(await screen.findByText('Add a layer: fetch for this passage'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect((studio.saveDefaultProps.mock.calls[0] as unknown as SaveCall)[0].compositionId).toBe('MushafPage');
    expect(saved(0)).toEqual({
      text: {
        translations: [
          {file: 'mushaf-studio/mushafpage/translation-20-1-2-3.json', font: 'auto', fontSize: 40, color: '#4a4a4a'},
        ],
        translationFile: 'mushaf-studio/mushafpage/translation-20-1-2-3.json',
      },
    });
  });

  it('reviews its resolved timings and exports from them', () => {
    render(<MushafStudioPanel compositionId="MushafPage" props={page()} initialTab="review" />);
    expect(screen.getByRole('button', {name: 'VTT (words)'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Copy description'})).toBeTruthy();
    expect(getStudioState().error).toBeNull();
  });

  it('keeps its project apart from a recitation’s, with its layers and end card files', () => {
    const props = {
      ...page(),
      text: {...page().text, translations: [layer('mushaf-studio/p/a.json'), layer('https://x.test/b.json')]},
      endCard: {...page().endCard, tafsirFile: 'mushaf-studio/p/tafsir.json', chapterInfoFile: ''},
    };
    const files = collectProjectFiles(props);
    expect(files).toContain('mushaf-studio/p/a.json');
    expect(files).toContain('mushaf-studio/p/tafsir.json');
    expect(files.some((file) => file.includes('x.test'))).toBe(false);
    const project = {version: 1 as const, compositionId: 'MushafPage', props: {...props}, files};
    expect(projectFits(project, page())).toBe(true);
    expect(projectFits(project, recitation())).toBe(false);
  });
});

// @vitest-environment jsdom
// What the panel greys out because the current props make it do nothing: the reasons as pure
// functions, then the Text tab (a translation or a gloss placed none, an end-card file the card
// does not show) and the Look tab (a page colour under an image, a video or a gradient), each
// greyed out under its reason and still usable.
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
vi.mock('../../../src/translations', () => ({
  listQuranComTranslations: vi.fn(async () => [
    {id: 20, name: 'Saheeh International', authorName: 'Saheeh', language: 'en', languageName: 'English'},
  ]),
  fetchQuranComTranslation: vi.fn(async () => ({kind: 'ayah'})),
  fetchQuranComWordGloss: vi.fn(async () => ({kind: 'word'})),
  serialiseTranslation: vi.fn(() => '{"translation":true}'),
  loadTranslation: vi.fn(),
}));
vi.mock('../../../src/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/content')>()),
  listQuranComTafsirs: vi.fn(async () => [
    {id: 169, name: 'Ibn Kathir (Abridged)', authorName: 'Hafiz Ibn Kathir', language: 'en', languageName: 'English'},
  ]),
}));

const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {defaultMushafPageProps} = await import('../../../src/page/schema');
const {endCardFileInactive, pageColourInactive, translationInactive, wordByWordInactive} = await import(
  '../../../src/studio/inactive'
);
const {resetStudioStore, getStudioState, setStudioState} = await import('../../../src/studio/store');
const {translate} = await import('../../../src/studio/i18n');
type MushafRecitationProps = import('../../../src/compositions/recitation/schema').MushafRecitationProps;
type StudioTimings = import('../../../src/types').StudioTimings;

const timings: StudioTimings = {
  version: 1,
  surah: 1,
  audio: 'mushaf-studio/p/fatiha.mp3',
  ayat: [{ayah: 2, start: 0, end: 3, words: [{id: '1:2:1', start: 0, end: 3}]}],
};

const recitation = (patch: Partial<MushafRecitationProps> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  audioFile: 'mushaf-studio/p/fatiha.mp3',
  timingsFile: 'mushaf-studio/p/fatiha.timings.json',
  resolved: {
    timings,
    audioOffsetSeconds: 0,
    lines: fatihaLines(2, 2),
    schedule: [{index: 0, start: 0, end: 3}],
    translation: null,
    gloss: null,
    transliteration: null,
    doubtful: {},
  },
  ...patch,
});

const text = (patch: Partial<MushafRecitationProps['text']>) => ({...defaultMushafRecitationProps.text, ...patch});
const card = (patch: Partial<MushafRecitationProps['endCard']>) => ({
  ...defaultMushafRecitationProps.endCard,
  ...patch,
});
const background = (patch: Partial<MushafRecitationProps['background']>) => ({
  ...defaultMushafRecitationProps.background,
  ...patch,
});

const inactive = () => [...document.body.querySelectorAll<HTMLElement>('[data-mushaf-inactive]')];
const sectionOf = (title: string) => screen.getByRole('heading', {name: title}).closest('section')!;
const en = (key: Parameters<typeof translate>[1], params = {}) => translate('en', key, params);

beforeEach(() => resetStudioStore());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetStudioStore();
});

describe('the reasons', () => {
  it('find nothing inactive in the defaults', () => {
    const props = recitation();
    expect(translationInactive(props)).toBeNull();
    expect(wordByWordInactive(props)).toBeNull();
    expect(endCardFileInactive(props, 'tafsir')).toBeNull();
    expect(endCardFileInactive(props, 'chapter-info')).toBeNull();
    expect(pageColourInactive(props)).toBeNull();
  });

  it('name a translation or a gloss placed none', () => {
    expect(translationInactive(recitation({text: text({translationPosition: 'none'})}))?.key).toBe(
      'inactive.translationHidden',
    );
    expect(wordByWordInactive(recitation({text: {...text({}), glossPosition: 'none'}}))?.key).toBe(
      'inactive.glossHidden',
    );
    // A page places its translation too; it has no glossPosition, so no word-by-word reason.
    const page = {
      ...defaultMushafPageProps,
      text: {...defaultMushafPageProps.text, translationPosition: 'none' as const},
    };
    expect(translationInactive(page)?.key).toBe('inactive.translationHidden');
    expect(wordByWordInactive(page)).toBeNull();
  });

  it('name an end-card file only when one is set and the card shows something else', () => {
    expect(endCardFileInactive(recitation({endCard: card({show: 'credits'})}), 'tafsir')).toBeNull();
    const props = recitation({endCard: card({show: 'credits', tafsirFile: 't.json', chapterInfoFile: 'c.json'})});
    expect(endCardFileInactive(props, 'tafsir')).toEqual({
      key: 'inactive.endCardFile',
      params: {show: 'credits', kind: 'tafsir'},
    });
    expect(endCardFileInactive(props, 'chapter-info')?.params).toEqual({show: 'credits', kind: 'chapter-info'});
    const shown = recitation({endCard: card({show: 'tafsir', tafsirFile: 't.json', chapterInfoFile: 'c.json'})});
    expect(endCardFileInactive(shown, 'tafsir')).toBeNull();
    expect(endCardFileInactive(shown, 'chapter-info')?.params).toEqual({show: 'tafsir', kind: 'chapter-info'});
  });

  it('name the page colour under an image, a video, a gradient or a legacy backgroundImage', () => {
    for (const kind of ['video', 'gradient'] as const)
      expect(pageColourInactive(recitation({background: background({kind})}))).toEqual({
        key: 'inactive.pageColour',
        params: {kind},
      });
    // An image without a src of its own and no legacy image paints the colour only.
    expect(pageColourInactive(recitation({background: background({kind: 'image'})}))).toEqual({
      key: 'inactive.pageColour',
      params: {kind: 'image'},
    });
    const legacy = recitation({layout: {...defaultMushafRecitationProps.layout, backgroundImage: 'bg.jpg'}});
    expect(pageColourInactive(legacy)).toEqual({key: 'inactive.pageColourLegacy', params: {kind: 'image'}});
  });
});

describe('the Text tab', () => {
  const textTab = (props: MushafRecitationProps) =>
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="text" />);

  it('greys out nothing with the defaults', async () => {
    textTab(recitation());
    await screen.findByText('Add a layer: fetch for this passage');
    expect(inactive()).toEqual([]);
  });

  it('greys out the translation and the gloss placed none, under the reason, and keeps them usable', async () => {
    textTab(recitation({text: {...text({translationPosition: 'none'}), glossPosition: 'none'}}));
    const add = await screen.findByText<HTMLButtonElement>('Add a layer: fetch for this passage');
    const translation = within(sectionOf('Translation layers (0/3)'));
    expect(translation.getByText(en('inactive.translationHidden'))).toBeTruthy();
    const words = within(sectionOf('Word by word'));
    expect(words.getByText(en('inactive.glossHidden'))).toBeTruthy();
    expect(inactive()).toHaveLength(2);
    // Greyed out, not disabled: the files can be fetched before the position is set.
    expect(add.closest('button')!.disabled).toBe(false);
    fireEvent.click(words.getByText('Fetch translation'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
  });

  it('keeps a section mounted, focus and all, while its reason comes and goes', async () => {
    const {rerender} = textTab(recitation());
    const add = (await screen.findByText('Add a layer: fetch for this passage')).closest('button')!;
    add.focus();
    const panel = (props: MushafRecitationProps) => (
      <MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="text" />
    );
    rerender(panel(recitation({text: text({translationPosition: 'none'})})));
    expect(inactive()).toHaveLength(1);
    expect(screen.getByText('Add a layer: fetch for this passage').closest('button')).toBe(add);
    expect(document.activeElement).toBe(add);
    rerender(panel(recitation()));
    expect(inactive()).toEqual([]);
    expect(screen.getByText('Add a layer: fetch for this passage').closest('button')).toBe(add);
    expect(document.activeElement).toBe(add);
  });

  it('greys out an end-card file the card does not show, and says what Fetch will set', async () => {
    textTab(recitation({endCard: card({show: 'credits', tafsirFile: 'mushaf-studio/p/tafsir.json'})}));
    await screen.findByText('Fetch the tafsir for this passage');
    const tafsir = within(sectionOf('Tafsir (end card)'));
    const reason = en('inactive.endCardFile', {show: 'credits', kind: 'tafsir'});
    expect(reason).toBe(
      'Not shown now: endCard.show is credits. Fetching again sets it to tafsir, or pick tafsir in the Props sidebar.',
    );
    expect(tafsir.getByText(reason).closest('[data-mushaf-inactive]')!.textContent).toContain(
      'Now: mushaf-studio/p/tafsir.json',
    );
    // The surah introduction has no file: nothing to grey out there.
    expect(inactive()).toHaveLength(1);
  });

  it('says why in Arabic when the panel speaks it', async () => {
    setStudioState({language: 'ar'});
    textTab(recitation({text: text({translationPosition: 'none'})}));
    expect(await screen.findByText(translate('ar', 'inactive.translationHidden'))).toBeTruthy();
  });
});

describe('the Look tab', () => {
  const lookTab = (props: MushafRecitationProps) =>
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="look" />);
  const pageChips = () => [...document.body.querySelectorAll<HTMLElement>('[data-look] [title^="Page:"]')];

  it('leaves the page colour as it is under the colour kind', () => {
    lookTab(recitation());
    expect(pageChips().length).toBeGreaterThan(0);
    expect(pageChips().every((chip) => chip.dataset.inactive === undefined)).toBe(true);
    expect(inactive()).toEqual([]);
  });

  it('greys out every page chip under a video background and says where the colour still shows', () => {
    lookTab(recitation({background: background({kind: 'video', src: 'bg.mp4'})}));
    expect(screen.getByText(en('inactive.pageColour', {kind: 'video'}))).toBeTruthy();
    expect(pageChips().every((chip) => chip.dataset.inactive === '')).toBe(true);
    // The other chips keep their colour.
    const ink = document.body.querySelector<HTMLElement>('[data-look] [title^="Ink:"]')!;
    expect(ink.dataset.inactive).toBeUndefined();
  });

  it('under a legacy backgroundImage greys out no look’s page: every look empties layout.backgroundImage', () => {
    lookTab(recitation({layout: {...defaultMushafRecitationProps.layout, backgroundImage: 'bg.jpg'}}));
    expect(screen.getByText(en('inactive.pageColourLegacy', {kind: 'image'}))).toBeTruthy();
    const chipOf = (id: string) => document.body.querySelector<HTMLElement>(`[data-look="${id}"] [title^="Page:"]`)!;
    for (const id of ['mushaf', 'haram-night', 'madinah-green', 'tajweed', 'learning'])
      expect(chipOf(id).dataset.inactive, id).toBeUndefined();
  });
});

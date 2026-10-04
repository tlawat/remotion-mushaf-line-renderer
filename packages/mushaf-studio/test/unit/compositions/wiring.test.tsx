// @vitest-environment jsdom
// The groups wired into every composition: `background`, `audio` (the analysis in calculateMetadata,
// its fallback, the silence trim and the `<Audio volume>` curve), the stacked translations and their
// script fonts, the tajweed legend and the end card. `remotion`, the package's line components, the
// analysis and `@remotion/media` are mocked; the translations, the stack and the cards are real.
import {cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fatiha from '../../fixtures/timings/fatiha.json';
import fatihaText from '../../fixtures/unicode/fatiha-text.json';
import {fakeFetch} from '../translations/helpers';
import {fatihaLines} from './helpers/fatiha-lines';
import {createRemotionMock} from './helpers/remotion-mock';

const remotion = createRemotionMock();
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
  staticFile: (path: string) => `https://studio.test/${path}`,
}));

const mocks = vi.hoisted(() => ({
  analyzeAudio: vi.fn(),
  getMushafLines: vi.fn(),
  mediaAudios: [] as {src: string; trimBefore?: number; volume?: (f: number) => number}[],
}));
vi.mock('../../../src/audio/analyze', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/audio/analyze')>()),
  analyzeAudio: (...args: unknown[]) => mocks.analyzeAudio(...args),
}));
vi.mock('@remotion/media', () => ({
  Audio: (props: {src: string; trimBefore?: number; volume?: (f: number) => number}) => {
    mocks.mediaAudios.push(props);
    return <div data-media-audio={props.src} />;
  },
}));
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  MushafLine: () => <span className="mushaf-line-mock" />,
  MushafLineWindow: () => <div className="mushaf-line-window-mock" />,
  MushafSurahName: (props: {surah: number}) => <span data-surah-name={props.surah} />,
  getMushafLines: (options: unknown) => mocks.getMushafLines(options),
  loadPageFont: () => undefined,
}));
vi.mock('../../../src/unicode/font', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/unicode/font')>()),
  useUnicodeFont: () => ({fontFamily: 'mushaf-uthmanic-hafs', ready: true}),
}));
vi.mock('../../../src/studio', () => ({
  MushafStudioPanel: (props: {compositionId: string}) => <div data-panel={props.compositionId} />,
  isInStudio: () => false,
}));

const {
  calculateMushafRecitationMetadata,
  defaultMushafRecitationProps,
  enterSeconds,
  MushafRecitation,
  mushafRecitationSchema,
  recitationDuration,
  skipRecitationStart,
} = await import('../../../src/compositions/recitation');
const {defaultMushafPassageProps, mushafPassageSchema} = await import('../../../src/compositions/passage');
const {
  calculateMushafAyahTextMetadata,
  defaultMushafAyahTextProps,
  MushafAyahText,
  mushafAyahTextSchema,
  resolveAyahText,
  skipAyahTextStart,
} = await import('../../../src/unicode');
const {calculateMushafPageMetadata, defaultMushafPageProps, MushafPage, mushafPageSchema, resolvePage, skipPageStart} =
  await import('../../../src/page');
const {backgroundFor, defaultBackground, glowOpacity} = await import('../../../src/background');
const {clipTimeline} = await import('../../../src/memorize');
const {MushafStudioError} = await import('../../../src/errors');
const {FONTS_ATTRIBUTION} = await import('../../../src/export');
const {defaultEndCard, defaultLegend, endCardSchema, legendSchema, textSchema} = await import('../../../src/schema');
const {planTranslationLayer} = await import('../../../src/compositions/parts');
const {loadTranslationLayers, pickAyahs, translationLayerSpecs} = await import('../../../src/compositions/extras');
const {levelAt} = await import('../../../src/audio');
const {surah2Timings, syntheticMushafLines} = await import('../page/helpers');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;
type ResolvedRecitationWithClips = import('../../../src/compositions/recitation').ResolvedRecitationWithClips;
type MushafAyahTextProps = import('../../../src/unicode').MushafAyahTextProps;
type MushafPageProps = import('../../../src/page').MushafPageProps;
type StudioTimings = import('../../../src/types').StudioTimings;
type AyahTranslation = import('../../../src/types').AyahTranslation;

const meta = (language: string, name = `Translation ${language}`) => ({
  id: `t:${language}`,
  name,
  language,
  source: 'quran.com',
});
const envelope = (language: string, text: Record<string, string>, name?: string) => ({
  version: 1,
  kind: 'ayah',
  meta: meta(language, name),
  text,
});
const FATIHA_EN = {'1:2': 'Praise', '1:3': 'Merciful', '1:4': 'Sovereign', '1:7': 'The path', '2:1': 'Alif'};
const TAFSIR = {
  version: 1,
  kind: 'tafsir',
  meta: {id: 'quran.com:169', name: 'Ibn Kathir', language: 'en', source: 'quran.com'},
  entries: [
    {from: '1:2', to: '1:2', paragraphs: ['On praise.']},
    {from: '1:6', to: '1:7', paragraphs: ['On the straight path.']},
  ],
};
const INFO = (surah: number) => ({
  version: 1,
  kind: 'chapter-info',
  meta: {id: 'quran.com:chapter-info', name: 'Sayyid Maududi', language: 'en', source: 'quran.com'},
  surah,
  nameSimple: 'Al-Fatihah',
  nameArabic: 'الفاتحة',
  translatedName: 'The Opener',
  revelationPlace: 'makkah',
  revelationOrder: 5,
  ayahCount: 7,
  shortText: 'The opening of the Book.',
  paragraphs: ['The opening of the Book.'],
});
/** The fixture `seconds` later: room for a leading silence to skip. */
const later = (seconds: number): StudioTimings => {
  const move = (t: number) => Math.round((t + seconds) * 1000) / 1000;
  const timings = fatiha as unknown as StudioTimings;
  return {
    ...timings,
    ayat: timings.ayat.map((a) => ({
      ...a,
      start: move(a.start),
      end: move(a.end),
      words: a.words!.map((w) => ({...w, start: move(w.start), end: move(w.end)})),
    })),
  };
};

const FILES: Record<string, unknown> = {
  'timings.json': fatiha,
  'late.json': later(3),
  'surah2.json': surah2Timings,
  'text.json': fatihaText,
  'en.json': envelope('en', FATIHA_EN, 'Saheeh International'),
  'ur.json': envelope('ur', {'1:2': 'سب تعریف'}),
  'zh.json': envelope('zh', {'1:2': '一切赞颂'}),
  'tafsir.json': TAFSIR,
  'info-1.json': INFO(1),
  'info-2.json': INFO(2),
};
const ANALYSIS = {
  lufs: -20,
  peak: 0.5,
  durationSeconds: 31,
  firstSoundSeconds: 3.2,
  fps: 30,
  levels: Array.from({length: 930}, (_, i) => (i % 10) / 9),
};

const metadataArgs = <P,>(props: P) => ({
  props,
  defaultProps: props,
  abortSignal: new AbortController().signal,
  compositionId: 'test',
  isRendering: false,
});
const recitationProps = (changes: Partial<MushafRecitationProps> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  audioFile: 'audio.mp3',
  timingsFile: 'timings.json',
  ...changes,
});
const audio = (changes: Partial<MushafRecitationProps['audio']>) => ({
  ...defaultMushafRecitationProps.audio,
  ...changes,
});
const background = (changes: Partial<MushafRecitationProps['background']>) => ({...defaultBackground, ...changes});
const text = (changes: Partial<MushafRecitationProps['text']>) => ({...defaultMushafRecitationProps.text, ...changes});
const resolvedOf = async (props: MushafRecitationProps) =>
  (await calculateMushafRecitationMetadata(metadataArgs(props))).props!.resolved as ResolvedRecitationWithClips;
const mount = (element: React.ReactElement) => render(element).container;

beforeEach(() => {
  remotion.reset();
  mocks.mediaAudios.length = 0;
  mocks.analyzeAudio.mockReset();
  mocks.analyzeAudio.mockResolvedValue(ANALYSIS);
  mocks.getMushafLines.mockReset();
  mocks.getMushafLines.mockImplementation(async (options: {page?: number; surah?: number}) =>
    options.surah === 1 ? fatihaLines() : syntheticMushafLines(options as never),
  );
  vi.stubGlobal(
    'fetch',
    fakeFetch((url) => ({body: FILES[url.pathname.slice(1)], status: FILES[url.pathname.slice(1)] ? 200 : 404})).fetch,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the new groups in the schemas', () => {
  it('parses every composition’s defaults unchanged, the new groups included', () => {
    expect(mushafRecitationSchema.parse(defaultMushafRecitationProps)).toEqual(defaultMushafRecitationProps);
    expect(mushafPassageSchema.parse(defaultMushafPassageProps)).toEqual(defaultMushafPassageProps);
    expect(mushafAyahTextSchema.parse(defaultMushafAyahTextProps)).toEqual(defaultMushafAyahTextProps);
    expect(mushafPageSchema.parse(defaultMushafPageProps)).toEqual(defaultMushafPageProps);
    expect(defaultMushafRecitationProps.background).toEqual(defaultBackground);
    expect(defaultMushafAyahTextProps.background.color).toBe(defaultMushafAyahTextProps.layout.background);
    expect(defaultMushafRecitationProps.legend).toEqual(defaultLegend);
    expect(defaultMushafPageProps.endCard).toEqual({show: 'none', seconds: 5, tafsirFile: '', chapterInfoFile: ''});
    expect(defaultMushafRecitationProps.text.translations).toEqual([]);
  });

  it('holds three translations at most, each described, and bounds the end card and the legend', () => {
    const layer = {file: 'en.json', font: 'auto', fontSize: 40, color: '#4a4a4a'};
    const withLayers = (n: number) =>
      textSchema.safeParse({...defaultMushafRecitationProps.text, translations: Array(n).fill(layer)}).success;
    expect(withLayers(3)).toBe(true);
    expect(withLayers(4)).toBe(false);
    expect(textSchema.shape.translations.description).toBeTruthy();
    for (const [key, field] of Object.entries(textSchema.shape.translations.element.shape))
      expect(field.description, key).toBeTruthy();
    expect(endCardSchema.safeParse({...defaultEndCard, seconds: 1}).success).toBe(false);
    expect(endCardSchema.safeParse({...defaultEndCard, seconds: 16}).success).toBe(false);
    expect(legendSchema.safeParse({...defaultLegend, names: 'fr'}).success).toBe(false);
  });
});

describe('background', () => {
  it('keeps layout.background as the page colour and layout.backgroundImage for files saved before the group', () => {
    const layout = {background: '#101418', backgroundImage: ''};
    expect(backgroundFor(defaultBackground, layout)).toMatchObject({kind: 'color', color: '#101418'});
    // A saved file with its image in the layout: shown as before, over the page colour.
    expect(backgroundFor(defaultBackground, {...layout, backgroundImage: 'bg.jpg'})).toMatchObject({
      kind: 'image',
      src: 'bg.jpg',
      color: '#101418',
    });
    expect(backgroundFor(background({kind: 'image'}), {...layout, backgroundImage: 'old.jpg'}).src).toBe('old.jpg');
    expect(
      backgroundFor(background({kind: 'image', src: 'new.jpg'}), {...layout, backgroundImage: 'old.jpg'}).src,
    ).toBe('new.jpg');
    const gradient = background({kind: 'gradient'});
    expect(backgroundFor(gradient, layout)).toBe(gradient);
  });

  it('paints the background in every composition, the glow following the recitation’s level', async () => {
    const props = recitationProps({background: background({glow: {enabled: true, color: '#c8a45c', strength: 0.8}})});
    const resolved = await resolvedOf(props);
    expect(resolved.audio!.levels.length).toBeGreaterThan(0);
    remotion.state.frame = 13;
    const c = mount(<MushafRecitation {...props} resolved={resolved} />);
    const glow = c.querySelector<HTMLElement>('[data-mushaf-background-part="glow"]')!;
    expect(Number(glow.style.opacity)).toBe(glowOpacity(levelAt(resolved.audio!.levels, 13), 0.8));
    cleanup();
    // The layout's image of a saved file is still painted.
    const image = mount(
      <MushafRecitation {...props} layout={{...props.layout, backgroundImage: 'bg.jpg'}} resolved={resolved} />,
    );
    expect(image.querySelector<HTMLElement>('img[data-src]')!.dataset.src).toBe('https://studio.test/bg.jpg');
  });
});

describe('audio', () => {
  it('analyses the recording in calculateMetadata and keeps its gain, and its levels when the glow is on', async () => {
    const resolved = await resolvedOf(recitationProps());
    expect(mocks.analyzeAudio).toHaveBeenCalledWith(
      'https://studio.test/audio.mp3',
      expect.objectContaining({fps: 30}),
    );
    expect(resolved.audio).toEqual({gain: 1.7825, trimSeconds: 0, levels: []});
    expect(resolved.audioWarning).toBeNull();
    const glowing = await resolvedOf(
      recitationProps({background: background({glow: {enabled: true, color: '#fff', strength: 0.5}})}),
    );
    const levels = glowing.audio!.levels;
    // One level per frame to the last ayah's end plus a second, three decimals.
    expect(levels).toHaveLength(Math.ceil((27.559 + 1) * 30));
    expect(levels.slice(0, 3)).toEqual([0, 0.111, 0.222]);
  });

  it('does not analyse when nothing uses the analysis', async () => {
    const resolved = await resolvedOf(recitationProps({audio: audio({normalize: false})}));
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    expect(resolved.audio).toEqual({gain: 1, trimSeconds: 0, levels: []});
  });

  it('falls back to the audio as it is when the analysis fails, and says why in the Studio only', async () => {
    mocks.analyzeAudio.mockRejectedValue(new MushafStudioError('AUDIO_ANALYSIS_FAILED', 'No Web Audio here.'));
    const props = recitationProps({audio: audio({trimSilence: true})});
    const resolved = await resolvedOf(props);
    expect(resolved.audio).toEqual({gain: 1, trimSeconds: 0, levels: []});
    expect(resolved.audioWarning).toBe('No Web Audio here.');
    expect(resolved.audioOffsetSeconds).toBe(0);
    expect(mount(<MushafRecitation {...props} resolved={resolved} />).textContent).not.toContain('No Web Audio');
    cleanup();
    remotion.state.env.isStudio = true;
    const studio = mount(<MushafRecitation {...props} resolved={resolved} />);
    const lines = Array.from(studio.querySelector('[data-mushaf-warnings]')!.children).map((line) => line.textContent);
    expect(lines).toContain('Mushaf Studio: No Web Audio here.');
  });

  it('lets any other failure through', async () => {
    mocks.analyzeAudio.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(resolvedOf(recitationProps())).rejects.toThrow('Aborted');
  });

  it('skips the leading silence, never past the first line’s entrance, and moves the timings by it', async () => {
    const props = recitationProps({timingsFile: 'late.json', audio: audio({trimSilence: true})});
    const resolved = await resolvedOf(props);
    // The first word at 3.331 s: its line comes in leadInSeconds and the entrance before it.
    const latest = 3.331 - props.animation.leadInSeconds - enterSeconds(30);
    const trim = Math.round(Math.min(3.2 - 0.15, latest) * 1e6) / 1e6;
    expect(resolved.audio!.trimSeconds).toBe(trim);
    expect(resolved.audioOffsetSeconds).toBe(trim);
    expect(resolved.timings.ayat[0]!.start).toBeCloseTo(3.331 - trim, 6);
    expect(resolved.timings.ayat[0]!.words![0]!.start).toBeCloseTo(3.331 - trim, 6);
    expect(resolved.schedule[0]!.start).toBeCloseTo(3.331 - trim, 6);
    const metadata = await calculateMushafRecitationMetadata(metadataArgs(props));
    expect(metadata.durationInFrames).toBe(recitationDuration(resolved.timings, 30));
    // The audio starts that much later in the file.
    mount(<MushafRecitation {...props} resolved={resolved} />);
    expect(remotion.audios[0]!.trimBefore).toBe(Math.round(trim * 30));
  });

  it('moves a page and an ayah text by the trim too', async () => {
    const page = await resolvePage({...defaultMushafPageProps, timingsFile: 'surah2.json'});
    const moved = skipPageStart(page, 0.3, 0.6);
    expect(moved.audioOffsetSeconds).toBe(page.audioOffsetSeconds + 0.3);
    expect(moved.timings.ayat[0]!.start).toBeCloseTo(0.2, 6);
    expect(moved.lines[0]!.start).toBeCloseTo(page.lines[0]!.start - 0.3, 6);
    expect(moved.pages.map((p) => p.page)).toEqual(page.pages.map((p) => p.page));
    expect(moved.pages[1]!.start).toBeCloseTo(page.pages[1]!.start - 0.3, 6);
    expect(skipPageStart(page, 0, 0.6)).toBe(page);
    const ayahs = await resolveAyahText({
      ...defaultMushafAyahTextProps,
      timingsFile: 'late.json',
      textFile: 'text.json',
    });
    const text = skipAyahTextStart(ayahs, 2, defaultMushafAyahTextProps.memorize);
    expect(text.audioOffsetSeconds).toBe(2);
    expect(text.ayahs[0]!.start).toBeCloseTo(1.331, 6);
    expect(text.clips[0]!.audioFrom).toBeCloseTo(1.331, 6);
    // The ayah text's audio starts at the trim.
    mount(<MushafAyahText {...defaultMushafAyahTextProps} audioFile="audio.mp3" resolved={text} />);
    expect(remotion.audios[0]!.trimBefore).toBe(60);
  });

  it('fades the <Audio> in from the first frame and out to the last, at the analysed gain times the volume', async () => {
    const props = recitationProps({audio: audio({fadeInSeconds: 1, fadeOutSeconds: 1, volume: 0.5})});
    const resolved = {...(await resolvedOf(props)), audio: {gain: 2, trimSeconds: 0, levels: []}};
    remotion.state.durationInFrames = 900;
    mount(<MushafRecitation {...props} resolved={resolved} />);
    const volume = remotion.audios[0]!.volume as (f: number) => number;
    expect(volume(0)).toBe(0);
    expect(volume(15)).toBe(0.5);
    expect(volume(450)).toBe(1);
    expect(volume(884)).toBe(0.5);
    expect(volume(899)).toBe(0);
  });

  it('ends the fade where the end card begins, and plays no audio under it', async () => {
    const props = recitationProps({
      audio: audio({fadeInSeconds: 0, fadeOutSeconds: 1}),
      endCard: {...defaultEndCard, show: 'credits', seconds: 5},
    });
    const resolved = {...(await resolvedOf(props)), audio: {gain: 1, trimSeconds: 0, levels: []}};
    remotion.state.durationInFrames = 900;
    mount(<MushafRecitation {...props} resolved={resolved} />);
    const volume = remotion.audios[0]!.volume as (f: number) => number;
    expect(volume(0)).toBe(1);
    expect(volume(749 - 15)).toBe(0.5);
    expect(volume(749)).toBe(0);
    expect(volume(800)).toBe(0);
  });

  it('gives every memorisation clip the same gain, fading only at the composition’s very start and end', async () => {
    const memorize = {...defaultMushafRecitationProps.memorize, mode: 'repeat' as const, repeat: 2};
    const props = recitationProps({memorize, audio: audio({fadeInSeconds: 1, fadeOutSeconds: 1})});
    const resolved = {...(await resolvedOf(props)), audio: {gain: 1.5, trimSeconds: 0, levels: []}};
    remotion.state.durationInFrames = 1800;
    mount(<MushafRecitation {...props} resolved={resolved} />);
    const clips = clipTimeline(resolved.timings, memorize);
    expect(remotion.audios).toHaveLength(clips.length);
    const fromOf = (i: number) => Math.round(clips[i]!.compositionFrom * 30);
    const volumeOf = (i: number) => remotion.audios[i]!.volume as (f: number) => number;
    // The first clip starts at 0.331 s: ten frames into the one-second fade in.
    expect(volumeOf(0)(0)).toBe(Math.round(1.5 * (fromOf(0) / 30) * 1e4) / 1e4);
    // Every later clip starts at full gain: no fade between two plays.
    for (let i = 1; i < clips.length; i++) expect(volumeOf(i)(0)).toBe(1.5);
    // The composition's last frame is silent, whichever clip plays there.
    const last = clips.length - 1;
    expect(volumeOf(last)(1799 - fromOf(last))).toBe(0);
  });

  it('renders @remotion/media’s <Audio> under the in-browser renderer, remotion’s otherwise', async () => {
    const props = recitationProps();
    const resolved = await resolvedOf(props);
    mount(<MushafRecitation {...props} resolved={resolved} />);
    expect(remotion.audios).toHaveLength(1);
    expect(mocks.mediaAudios).toHaveLength(0);
    cleanup();
    remotion.audios.length = 0;
    remotion.state.env.isClientSideRendering = true;
    mount(<MushafRecitation {...props} resolved={resolved} />);
    expect(remotion.audios).toHaveLength(0);
    expect(mocks.mediaAudios).toHaveLength(1);
    expect(mocks.mediaAudios[0]).toMatchObject({src: 'https://studio.test/audio.mp3', trimBefore: 0});
    expect(mocks.mediaAudios[0]!.volume!(450)).toBe(1.7825);
    cleanup();
    mocks.mediaAudios.length = 0;
    const page = await resolvePage({...defaultMushafPageProps, timingsFile: 'surah2.json'});
    mount(<MushafPage {...defaultMushafPageProps} audioFile="audio.mp3" resolved={page} />);
    expect(mocks.mediaAudios).toHaveLength(1);
  });
});

describe('stacked translations', () => {
  const layer = (file: string, font = 'auto') => ({file, font, fontSize: 36, color: '#333333'});
  const blocks = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.mushaf-translation'));

  it('reads translationFile as the one layer while translations is empty, with its own type', async () => {
    const props = recitationProps({text: text({translationFile: 'en.json', translationDirection: 'rtl'})});
    const resolved = await resolvedOf(props);
    // Cut to the ayahs the composition can show.
    expect(Object.keys(resolved.translations![0]!.text)).toEqual(['1:2', '1:3', '1:4', '1:7']);
    expect(resolved.translation).toBe(resolved.translations![0]);
    remotion.state.frame = 110; // 3.67 s: ayah 3
    const [block, ...rest] = blocks(mount(<MushafRecitation {...props} resolved={resolved} />));
    expect(rest).toHaveLength(0);
    expect(block!.textContent).toBe('Merciful');
    expect(block!.style.fontFamily).toBe(props.text.translationFont);
    expect(block!.style.direction).toBe('rtl');
  });

  it('stacks three translations, each in its language’s web font and direction when its font is auto', async () => {
    const props = recitationProps({
      text: text({
        translationFile: 'ignored.json',
        translations: [layer('en.json'), layer('ur.json'), layer('zh.json', 'Georgia, serif')],
      }),
    });
    const resolved = await resolvedOf(props);
    expect(resolved.translations!.map((t) => t.meta.language)).toEqual(['en', 'ur', 'zh']);
    const c = mount(<MushafRecitation {...props} resolved={resolved} />);
    const [en, ur, zh] = blocks(c);
    expect(c.querySelectorAll('[data-mushaf-rule]')).toHaveLength(2);
    expect(en!.style.fontFamily).toBe('"Noto Serif", serif');
    expect(en!.style.direction).toBe('ltr');
    expect(ur!.style.fontFamily).toBe('"Noto Nastaliq Urdu", serif');
    expect(ur!.style.direction).toBe('rtl');
    expect(ur!.textContent).toBe('سب تعریف');
    expect(zh!.style.fontFamily).toBe('Georgia, serif');
    expect(zh!.style.fontSize).toBe('36px');
  });

  it('loads a script’s web font in its subsets, and a CJK one for the characters shown', () => {
    const translation = (language: string, text: Record<string, string>): AyahTranslation => ({
      kind: 'ayah',
      meta: meta(language),
      text,
    });
    const spec = (font: string) =>
      translationLayerSpecs({...defaultMushafRecitationProps.text, translations: [layer('x.json', font)]})[0]!;
    expect(planTranslationLayer(spec('auto'), translation('ar', {'1:1': 'بسم'})).request).toEqual({
      family: 'Noto Naskh Arabic',
      subsets: ['arabic', 'latin', 'latin-ext'],
    });
    expect(planTranslationLayer(spec('auto'), translation('zh', {'1:1': '奉', '1:2': '一切'})).request).toEqual({
      family: 'Noto Sans SC',
      text: '奉一切',
    });
    // A family the scripts list is loaded the same way; any other is a CSS family as it is.
    expect(planTranslationLayer(spec('Amiri'), translation('en', {})).request).toMatchObject({family: 'Amiri'});
    expect(planTranslationLayer(spec('Georgia, serif'), translation('en', {})).request).toBeNull();
  });

  it('refuses a word-by-word file in a layer, naming the layer', async () => {
    FILES['words.json'] = {'1:1:1': 'In'};
    await expect(
      loadTranslationLayers(
        translationLayerSpecs({
          ...defaultMushafRecitationProps.text,
          translations: [layer('en.json'), layer('words.json')],
        }),
        new Set(['1:2']),
        {fetch: globalThis.fetch, staticFile: (p) => `https://studio.test/${p}`},
      ),
    ).rejects.toThrow(/text\.translations\.1\.file "words\.json" is a word-by-word file/);
    expect(pickAyahs({kind: 'ayah', meta: meta('en'), text: {'1:1': 'a', '1:2': 'b'}}, ['1:2', '9:9']).text).toEqual({
      '1:2': 'b',
    });
  });

  it('stacks the translations of an ayah text and of a page too', async () => {
    const translations = [layer('en.json'), layer('ur.json')];
    const ayahProps: MushafAyahTextProps = {
      ...defaultMushafAyahTextProps,
      timingsFile: 'timings.json',
      textFile: 'text.json',
      text: {...defaultMushafAyahTextProps.text, translations},
    };
    const ayahText = (await calculateMushafAyahTextMetadata(metadataArgs(ayahProps))).props!.resolved;
    remotion.state.frame = 100;
    const c = mount(<MushafAyahText {...ayahProps} resolved={ayahText} />);
    expect(c.querySelectorAll('[data-sequence="Ayah 1:3"] .mushaf-translation')).toHaveLength(2);
    cleanup();
    const pageProps: MushafPageProps = {
      ...defaultMushafPageProps,
      timingsFile: 'timings.json',
      text: {...defaultMushafPageProps.text, translations},
    };
    const page = (await calculateMushafPageMetadata(metadataArgs(pageProps))).props!.resolved;
    const p = mount(<MushafPage {...pageProps} resolved={page} />);
    const block = p.querySelector<HTMLElement>('[data-mushaf-block="Translation"]')!;
    // A 16:9 frame has its room beside the page.
    expect(block.dataset.place).toBe('beside');
    expect(block.querySelectorAll('.mushaf-translation')).toHaveLength(2);
  });
});

describe('tajweed legend', () => {
  const legend = {...defaultLegend, show: true, position: 'top-left' as const};

  it('is drawn only when asked and the theme tells the rules apart', async () => {
    const props = recitationProps({legend});
    const resolved = await resolvedOf(props);
    const of = (changes: Partial<MushafRecitationProps>) =>
      mount(<MushafRecitation {...props} {...changes} resolved={resolved} />).querySelector(
        '[data-mushaf-block="Tajweed legend"]',
      );
    expect(of({theme: 'plain'})).toBeNull();
    cleanup();
    expect(of({theme: 'normal'})).toBeNull();
    cleanup();
    expect(of({theme: 'light', legend: defaultLegend})).toBeNull();
    cleanup();
    const shown = of({theme: 'light'}) as HTMLElement;
    expect(shown.style.top).toBe('38px');
    expect(shown.style.left).toBe('38px');
    expect(shown.querySelectorAll('[data-rule]')).toHaveLength(7);
    expect(shown.querySelector('[data-mushaf-legend-part="arabic"]')).not.toBeNull();
    cleanup();
    expect(
      (of({theme: 'light', legend: {...legend, names: 'en'}}) as HTMLElement).querySelector(
        '[data-mushaf-legend-part="arabic"]',
      ),
    ).toBeNull();
  });

  it('is drawn on the page as well', async () => {
    const pageProps: MushafPageProps = {...defaultMushafPageProps, timingsFile: 'surah2.json', theme: 'dark', legend};
    const page = await resolvePage(pageProps);
    expect(mount(<MushafPage {...pageProps} resolved={page} />).querySelector('.mushaf-tajweed-legend')).not.toBeNull();
  });
});

describe('end card', () => {
  const endCard = (changes: Partial<MushafRecitationProps['endCard']>) => ({...defaultEndCard, ...changes});

  it('adds its seconds after the last ayah', async () => {
    const plain = await calculateMushafRecitationMetadata(metadataArgs(recitationProps()));
    const card = await calculateMushafRecitationMetadata(
      metadataArgs(recitationProps({endCard: endCard({show: 'credits', seconds: 4})})),
    );
    expect(card.durationInFrames).toBe(plain.durationInFrames! + 120);
    const ayahProps = {...defaultMushafAyahTextProps, timingsFile: 'timings.json', textFile: 'text.json'};
    const ayahPlain = await calculateMushafAyahTextMetadata(metadataArgs(ayahProps));
    const ayahCard = await calculateMushafAyahTextMetadata(
      metadataArgs({...ayahProps, endCard: endCard({show: 'credits', seconds: 2})}),
    );
    expect(ayahCard.durationInFrames).toBe(ayahPlain.durationInFrames! + 60);
  });

  it('shows the surah, the range, the reciter and the credits of every translation over its frames', async () => {
    const props = recitationProps({
      endCard: endCard({show: 'credits', seconds: 5}),
      overlay: {...defaultMushafRecitationProps.overlay, reciter: 'Abdul Hamid Ghraio'},
      text: text({translationFile: 'en.json'}),
    });
    const resolved = await resolvedOf(props);
    remotion.state.durationInFrames = 900;
    remotion.state.frame = 800;
    const c = mount(<MushafRecitation {...props} resolved={resolved} />);
    const sequence = c.querySelector<HTMLElement>('[data-sequence="End card"]')!;
    expect(sequence.dataset).toMatchObject({from: '750', duration: '150'});
    const card = sequence.querySelector<HTMLElement>('[data-mushaf-end-card]')!;
    expect(card.querySelector('[data-mushaf-end-card-part="range"]')!.textContent).toContain('1:2');
    expect(card.querySelector('[data-mushaf-end-card-part="reciter"]')!.textContent).toBe('Abdul Hamid Ghraio');
    const credits = Array.from(card.querySelector('[data-mushaf-end-card-part="credits"]')!.children).map(
      (line) => line.textContent,
    );
    expect(credits).toEqual([FONTS_ATTRIBUTION, 'Translation: Saheeh International (quran.com)']);
  });

  it('reads the tafsir of the last ayah recited, or the surah’s introduction, in calculateMetadata', async () => {
    const tafsir = await resolvedOf(recitationProps({endCard: endCard({show: 'tafsir', tafsirFile: 'tafsir.json'})}));
    expect(tafsir.endCard!.tafsir!.entries).toEqual([{from: '1:6', to: '1:7', paragraphs: ['On the straight path.']}]);
    expect(tafsir.endCard!.chapterInfo).toBeNull();
    const info = await resolvedOf(
      recitationProps({endCard: endCard({show: 'chapter-info', chapterInfoFile: 'info-1.json'})}),
    );
    expect(info.endCard!.chapterInfo!.translatedName).toBe('The Opener');
    remotion.state.durationInFrames = 900;
    remotion.state.frame = 850;
    const props = recitationProps({endCard: endCard({show: 'tafsir', tafsirFile: 'tafsir.json'})});
    expect(mount(<MushafRecitation {...props} resolved={tafsir} />).textContent).toContain('On the straight path.');
    cleanup();
    const infoProps = recitationProps({endCard: endCard({show: 'chapter-info', chapterInfoFile: 'info-1.json'})});
    expect(mount(<MushafRecitation {...infoProps} resolved={info} />).textContent).toContain(
      'The opening of the Book.',
    );
  });

  it('refuses a missing file and another surah’s introduction, naming the prop', async () => {
    await expect(resolvedOf(recitationProps({endCard: endCard({show: 'tafsir'})}))).rejects.toThrow(
      /endCard\.tafsirFile is empty/,
    );
    await expect(
      resolvedOf(recitationProps({endCard: endCard({show: 'chapter-info', chapterInfoFile: 'info-2.json'})})),
    ).rejects.toThrow(/introduces surah 2, but surah 1 is recited/);
  });

  it('ends a page the same way', async () => {
    const pageProps: MushafPageProps = {
      ...defaultMushafPageProps,
      timingsFile: 'surah2.json',
      endCard: endCard({show: 'credits', seconds: 3}),
    };
    const metadata = await calculateMushafPageMetadata(metadataArgs(pageProps));
    expect(metadata.durationInFrames).toBe(330 + 90);
    remotion.state.durationInFrames = 420;
    remotion.state.frame = 400;
    const c = mount(<MushafPage {...pageProps} resolved={metadata.props!.resolved} />);
    expect(c.querySelector<HTMLElement>('[data-sequence="End card"]')!.dataset.from).toBe('330');
  });
});

describe('skipRecitationStart', () => {
  it('is the same object for no trim, and never moves a slot before 0', async () => {
    const resolved = await resolvedOf(recitationProps());
    expect(skipRecitationStart(resolved, 0, defaultMushafRecitationProps.memorize)).toBe(resolved);
    const moved = skipRecitationStart(resolved, 1, defaultMushafRecitationProps.memorize);
    expect(moved.schedule[0]!.start).toBe(0);
    expect(moved.audioOffsetSeconds).toBe(1);
    expect(moved.clips[1]!.audioFrom).toBeCloseTo(3.533 - 1, 6);
  });
});

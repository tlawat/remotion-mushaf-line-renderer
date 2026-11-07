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
  MushafRecitation,
  mushafRecitationSchema,
  recitationContentFrames,
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
const {backgroundFor, defaultBackground} = await import('../../../src/background');
const {clipTimeline} = await import('../../../src/memorize');
const {MushafStudioError} = await import('../../../src/errors');
const {FONTS_ATTRIBUTION} = await import('../../../src/export');
const {defaultEndCard, defaultLegend, endCardSchema, legendSchema, mixColors, tempoSeconds, textSchema} = await import(
  '../../../src/schema'
);
const {cappedTranslationSize, drawnTranslationLayers, LegendBand, legendBand, legendReserve, planTranslationLayer} =
  await import('../../../src/compositions/parts');
const {BOOK_SERIF_REQUEST, STUDIO_FONT_REQUESTS} = await import('../../../src/compositions/fonts');
const {loadTranslationLayers, pickAyahs, translationLayerSpecs} = await import('../../../src/compositions/extras');
const {assertNoHostRepeats, defaultHostAudio, hostAudioOf, OWN_AUDIO_NAME} = await import('../../../src/audio');
const {surah2Timings, syntheticMushafLines} = await import('../page/helpers');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;
type ResolvedRecitationWithClips = import('../../../src/compositions/recitation').ResolvedRecitationWithClips;
type MushafAyahTextProps = import('../../../src/unicode').MushafAyahTextProps;
type MushafPageProps = import('../../../src/page').MushafPageProps;
type StudioTimings = import('../../../src/types').StudioTimings;
type StudioTimingsV1 = import('../../../src/types').StudioTimingsV1;
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
  const timings = fatiha as unknown as StudioTimingsV1;
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

/** The catalogue clip a timings file was made of (`alignment.recitation.audioUrl`). */
const CLIP = 'https://cdn.test/fatiha.mp3?start_ms=2909&end_ms=30695';
const withClip = {
  ...fatiha,
  alignment: {
    version: 1,
    source: 'qud-catalogue',
    recitation: {slug: 'r', chapter: 1, verseFrom: 1, verseTo: 7, clipStart: 2.909, audioUrl: CLIP},
    segments: [],
    words: [],
    edits: [],
  },
};

const FILES: Record<string, unknown> = {
  'timings.json': fatiha,
  'clip.json': withClip,
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

  it('paints the background in every composition, and no glow: a saved one becomes a vignette', async () => {
    const saved = {
      ...recitationProps(),
      background: {...defaultBackground, glow: {enabled: true, color: '#c8a45c', strength: 0.8}},
    } as unknown as MushafRecitationProps;
    const metadata = await calculateMushafRecitationMetadata(metadataArgs(saved));
    const props = metadata.props as MushafRecitationProps;
    expect(props.background).not.toHaveProperty('glow');
    expect(props.background.vignette).toBe(0.15);
    const resolved = props.resolved as ResolvedRecitationWithClips;
    expect(resolved.audio!.levels).toEqual([]);
    remotion.state.frame = 13;
    const c = mount(<MushafRecitation {...props} resolved={resolved} />);
    expect(c.querySelector('[data-mushaf-background-part="glow"]')).toBeNull();
    // The vignette the glow became, with its noise; no jadwal unless asked.
    expect(c.querySelector('[data-mushaf-background-part="noise"]')).not.toBeNull();
    expect(c.querySelector('[data-mushaf-jadwal]')).toBeNull();
    cleanup();
    // layout.frame 'hairline': the jadwal in the metal, over the background.
    const framed = mount(
      <MushafRecitation {...props} layout={{...props.layout, frame: 'hairline'}} resolved={resolved} />,
    );
    const jadwal = framed.querySelector<HTMLElement>('[data-mushaf-jadwal]')!;
    expect(jadwal.style.opacity).toBe('0.55');
    expect(jadwal.querySelector<HTMLElement>('[data-mushaf-jadwal-rule="outer"]')!.style.left).toBe('54px');
    cleanup();
    // The layout's image of a saved file is still painted.
    const image = mount(
      <MushafRecitation {...props} layout={{...props.layout, backgroundImage: 'bg.jpg'}} resolved={resolved} />,
    );
    expect(image.querySelector<HTMLElement>('img[data-src]')!.dataset.src).toBe('https://studio.test/bg.jpg');
  });
});

describe('audio', () => {
  it('analyses the recording in calculateMetadata and keeps its gain, never its levels', async () => {
    const resolved = await resolvedOf(recitationProps());
    expect(mocks.analyzeAudio).toHaveBeenCalledWith(
      'https://studio.test/audio.mp3',
      expect.objectContaining({fps: 30}),
    );
    expect(resolved.audio).toEqual({gain: 1.7825, trimSeconds: 0, levels: []});
    expect(resolved.audioWarning).toBeNull();
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

  it('warns in the Studio preview about the splits it left out, and refuses them anywhere else', async () => {
    const props = recitationProps();
    const resolved = {...(await resolvedOf(props)), droppedSplits: [{page: 1, line: 8, atWordId: 26}]};
    const refusal = (): unknown => {
      try {
        mount(<MushafRecitation {...props} resolved={resolved} />);
      } catch (error) {
        return error;
      }
      return null;
    };
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // Outside the Studio, and in the Studio's in-browser render: calculateMetadata() saw that
      // page as the preview's, so the composition refuses what it left out.
      expect(refusal()).toMatchObject({
        name: 'MushafStudioError',
        code: 'BAD_LINE_SPLIT',
        details: {splits: [{page: 1, line: 8, atWordId: 26}]},
      });
      cleanup();
      Object.assign(remotion.state.env, {isStudio: true, isRendering: false, isClientSideRendering: true});
      const error = refusal() as InstanceType<typeof MushafStudioError>;
      expect(error).toBeInstanceOf(MushafStudioError);
      expect(error.code).toBe('BAD_LINE_SPLIT');
      expect(error.message).toBe(
        "A line split does not fit the passage (page 1 line 8 at word 26), and a render does not leave it out. Remove it in the Mushaf panel's Lines tab (or from `splits`), or widen the ayah range or the slice back to its line.",
      );
    } finally {
      silence.mockRestore();
    }
    cleanup();
    // Nothing left out: nothing to refuse.
    expect(() => mount(<MushafRecitation {...props} resolved={{...resolved, droppedSplits: []}} />)).not.toThrow();
    cleanup();
    remotion.state.env.isClientSideRendering = false;
    const studio = mount(<MushafRecitation {...props} resolved={resolved} />);
    const lines = Array.from(studio.querySelector('[data-mushaf-warnings]')!.children).map((line) => line.textContent);
    expect(lines).toContain(
      "Mushaf Studio: A line split does not fit the passage and is not applied (page 1 line 8 at word 26): the ayah range or slice changed since. Remove it in the Mushaf panel's Lines tab; a render refuses it.",
    );
  });

  it('lets any other failure through', async () => {
    mocks.analyzeAudio.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(resolvedOf(recitationProps())).rejects.toThrow('Aborted');
  });

  it('skips the leading silence, never past the first line’s entrance, and moves the timings by it', async () => {
    const props = recitationProps({timingsFile: 'late.json', audio: audio({trimSilence: true})});
    const resolved = await resolvedOf(props);
    // The first word at 3.331 s: its line comes in leadInSeconds and the window's 0.8 s entrance before it.
    const latest = 3.331 - props.animation.leadInSeconds - tempoSeconds('windowIn', 'calm');
    const trim = Math.round(Math.min(3.2 - 0.15, latest) * 1e6) / 1e6;
    expect(resolved.audio!.trimSeconds).toBe(trim);
    expect(resolved.audioOffsetSeconds).toBe(trim);
    expect(resolved.timings.ayat[0]!.start).toBeCloseTo(3.331 - trim, 6);
    expect(resolved.timings.ayat[0]!.words![0]!.start).toBeCloseTo(3.331 - trim, 6);
    expect(resolved.schedule[0]!.start).toBeCloseTo(3.331 - trim, 6);
    const metadata = await calculateMushafRecitationMetadata(metadataArgs(props));
    expect(metadata.durationInFrames).toBe(recitationContentFrames(resolved, 'calm', 30));
    // The audio starts that much later in the file.
    mount(<MushafRecitation {...props} resolved={resolved} />);
    expect(remotion.audios[0]!.trimBefore).toBe(Math.round(trim * 30));
  });

  it('moves a page and an ayah text by the trim too', async () => {
    const page = await resolvePage({...defaultMushafPageProps, timingsFile: 'surah2.json'});
    const turn = defaultMushafPageProps.pageView.turnSeconds;
    const moved = skipPageStart(page, 0.3, turn);
    expect(moved.audioOffsetSeconds).toBe(page.audioOffsetSeconds + 0.3);
    expect(moved.timings.ayat[0]!.start).toBeCloseTo(0.2, 6);
    expect(moved.lines[0]!.start).toBeCloseTo(page.lines[0]!.start - 0.3, 6);
    expect(moved.pages.map((p) => p.page)).toEqual(page.pages.map((p) => p.page));
    expect(moved.pages[1]!.start).toBeCloseTo(page.pages[1]!.start - 0.3, 6);
    expect(skipPageStart(page, 0, turn)).toBe(page);
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

  it('plays the clip the timings name when audioFile is not in public/, in every composition and every clip', async () => {
    const missing = {audioFile: 'missing.mp3', timingsFile: 'clip.json'};
    const props = recitationProps(missing);
    const resolved = await resolvedOf(props);
    expect(resolved.audioSrc).toBe(CLIP);
    expect(resolved.audioWarning).toContain('"missing.mp3" is not in public/');
    expect(mocks.analyzeAudio).toHaveBeenCalledWith(CLIP, expect.objectContaining({fps: 30}));
    mount(<MushafRecitation {...props} resolved={resolved} />);
    expect(remotion.audios.map((a) => a.src)).toEqual([CLIP]);
    cleanup();
    remotion.audios.length = 0;
    const memorize = {...defaultMushafRecitationProps.memorize, mode: 'repeat' as const, repeat: 2};
    const repeated = recitationProps({...missing, memorize});
    remotion.state.durationInFrames = 1800;
    mount(<MushafRecitation {...repeated} resolved={await resolvedOf(repeated)} />);
    expect(remotion.audios.length).toBeGreaterThan(1);
    expect(new Set(remotion.audios.map((a) => a.src))).toEqual(new Set([CLIP]));
    cleanup();
    remotion.audios.length = 0;
    const ayahProps: MushafAyahTextProps = {...defaultMushafAyahTextProps, ...missing, textFile: 'text.json'};
    const ayahText = (await calculateMushafAyahTextMetadata(metadataArgs(ayahProps))).props!.resolved;
    expect(ayahText.audioSrc).toBe(CLIP);
    mount(<MushafAyahText {...ayahProps} resolved={ayahText} />);
    expect(remotion.audios.map((a) => a.src)).toEqual([CLIP]);
    cleanup();
    remotion.audios.length = 0;
    const pageProps: MushafPageProps = {...defaultMushafPageProps, ...missing};
    const page = (await calculateMushafPageMetadata(metadataArgs(pageProps))).props!.resolved;
    expect(page.audioSrc).toBe(CLIP);
    mount(<MushafPage {...pageProps} resolved={page} />);
    expect(remotion.audios.map((a) => a.src)).toEqual([CLIP]);
  });

  it('plays audioFile itself when the timings name no clip', async () => {
    const resolved = await resolvedOf(recitationProps({audioFile: 'missing.mp3'}));
    expect(resolved.audioSrc).toBeNull();
    mount(<MushafRecitation {...recitationProps({audioFile: 'missing.mp3'})} resolved={resolved} />);
    expect(remotion.audios.map((a) => a.src)).toEqual(['https://studio.test/missing.mp3']);
  });
});

describe('translation size', () => {
  it('never draws a translation larger than half the Arabic', () => {
    expect(cappedTranslationSize(36, 90)).toBe(36);
    expect(cappedTranslationSize(60, 90)).toBe(45);
    expect(cappedTranslationSize(36, 52)).toBe(26);
    const layer = {
      translation: {kind: 'ayah' as const, meta: meta('en'), text: {}},
      fontFamily: 'serif',
      fontSize: 36,
      color: '#5a554c',
      direction: 'ltr' as const,
    };
    const same = [layer];
    expect(drawnTranslationLayers(same, {ink: '#1c1a16', ground: '#f8f3e6', glyphSize: 90})).toBe(same);
    expect(drawnTranslationLayers(same, {ink: '#1c1a16', ground: '#f8f3e6', glyphSize: 52})[0]!.fontSize).toBe(26);
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
    // 3.83 s: ayah 3, its translation settled (the change ran from 3.391 s, ayah 2's end, over 10 frames).
    remotion.state.frame = 115;
    const [block, ...rest] = blocks(mount(<MushafRecitation {...props} resolved={resolved} />));
    expect(rest).toHaveLength(0);
    expect(block!.textContent).toBe('Merciful');
    // `auto`: the web font of the file's language, EB Garamond 500 for English, centred.
    expect(props.text.translationFont).toBe('auto');
    expect(block!.style.fontFamily).toBe('"EB Garamond", serif');
    expect(block!.style.fontWeight).toBe('500');
    expect(block!.style.textAlign).toBe('center');
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
    expect(en!.style.fontFamily).toBe('"EB Garamond", serif');
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
    // EB Garamond (English) shares the Studio's own request, 500 included: one load for both.
    expect(planTranslationLayer(spec('auto'), translation('en', {'1:1': 'In'})).request).toBe(BOOK_SERIF_REQUEST);
    expect(BOOK_SERIF_REQUEST).toEqual({
      family: 'EB Garamond',
      weights: [400, 500],
      italics: [400],
      subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'vietnamese'],
    });
    expect(STUDIO_FONT_REQUESTS[1]).toMatchObject({family: 'Amiri', weights: [400]});
    expect(planTranslationLayer(spec('auto'), translation('en', {})).layer.fontWeight).toBe(500);
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

describe('readable text colours', () => {
  const blocks = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.mushaf-translation'));
  const rgb = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
  };
  // The default ink mixed a third into the ivory page: 68 % ink.
  const muted = mixColors('#1c1a16', '#f8f3e6', 0.32);

  it('draws a translation colour under 4.5:1 on the page as the muted ink, and keeps a readable one', async () => {
    const pale = recitationProps({
      text: text({translations: [{file: 'en.json', font: 'auto', fontSize: 36, color: '#d9d2c2'}]}),
    });
    remotion.state.frame = 110;
    const [block] = blocks(mount(<MushafRecitation {...pale} resolved={await resolvedOf(pale)} />));
    expect(block!.style.color).toBe(rgb(muted));
    // The saved colour is the user's: only what is drawn changes.
    expect(pale.text.translations[0]!.color).toBe('#d9d2c2');
    cleanup();
    const fine = recitationProps({
      text: text({translations: [{file: 'en.json', font: 'auto', fontSize: 36, color: '#5a554c'}]}),
    });
    const [kept] = blocks(mount(<MushafRecitation {...fine} resolved={await resolvedOf(fine)} />));
    expect(kept!.style.color).toBe(rgb('#5a554c'));
  });

  it('reads the colour against what is painted: light ink over a legacy backgroundImage is on a dark ground', async () => {
    const props = recitationProps({
      layout: {...defaultMushafRecitationProps.layout, color: '#f1eadb', backgroundImage: 'bg.jpg'},
      text: text({translations: [{file: 'en.json', font: 'auto', fontSize: 36, color: '#b9b1a2'}]}),
    });
    remotion.state.frame = 110;
    // #b9b1a2 is 8.7:1 on charcoal, the ground that image stands for, though 2.1:1 on the ivory under it.
    const [block] = blocks(mount(<MushafRecitation {...props} resolved={await resolvedOf(props)} />));
    expect(block!.style.color).toBe(rgb('#b9b1a2'));
    cleanup();
    // The same colours on the bare ivory page give way.
    const bare = {...props, layout: {...props.layout, backgroundImage: ''}};
    const [onPage] = blocks(mount(<MushafRecitation {...bare} resolved={await resolvedOf(bare)} />));
    expect(onPage!.style.color).toBe(rgb(mixColors('#f1eadb', '#f8f3e6', 0.32)));
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
    // A band across the safe area (54 px in), with no card behind it.
    expect(shown.style.top).toBe('54px');
    expect(shown.style.left).toBe('54px');
    expect(shown.style.right).toBe('54px');
    expect(shown.style.background).toBe('');
    // The lines are fitted under it: their block starts below the band and half a line box more.
    const lines = shown.ownerDocument.querySelector<HTMLElement>('[data-mushaf-block="Mushaf lines"]')!;
    expect(Number.parseFloat(lines.style.top)).toBeGreaterThan(54 + Number.parseFloat(shown.style.height));
    expect(shown.querySelectorAll('[data-rule]')).toHaveLength(7);
    expect(shown.querySelector('[data-mushaf-legend-part="arabic"]')).not.toBeNull();
    cleanup();
    expect(
      (of({theme: 'light', legend: {...legend, names: 'en'}}) as HTMLElement).querySelector(
        '[data-mushaf-legend-part="arabic"]',
      ),
    ).toBeNull();
  });

  it('reserves its band: rows measured in the safe area’s width, 1.6 × 0.8 L each, and half a line box', () => {
    const shown = {...legend, position: 'bottom-right' as const};
    expect(legendBand(defaultLegend, 'light', {width: 1920, height: 1080, lineHeight: 198})).toBeNull();
    expect(legendBand(shown, 'plain', {width: 1920, height: 1080, lineHeight: 198})).toBeNull();
    const wide = legendBand(shown, 'light', {width: 1920, height: 1080, lineHeight: 198})!;
    expect(wide).toMatchObject({edge: 'bottom', inset: 54, fontSize: 21});
    expect(wide.height).toBe(Math.round(wide.rows * 1.6 * 21));
    expect(wide.reserve).toBe(wide.height + 99);
    expect(legendReserve(shown, 'light', {width: 1920, height: 1080, lineHeight: 198})).toEqual({
      top: 0,
      bottom: wide.reserve,
    });
    // At 9:16 the band sits above the bottom 18 %, and wraps to more rows in the narrower frame.
    const tall = legendBand(shown, 'light', {width: 1080, height: 1920, lineHeight: 114})!;
    expect(tall.inset).toBe(346);
    expect(tall.rows).toBeGreaterThan(wide.rows);
    expect(tall.reserve).toBe(346 - 54 + tall.height + 57);
    expect(
      legendReserve({...legend, position: 'top-left'}, 'light', {width: 1920, height: 1080, lineHeight: 198}).top,
    ).toBe(wide.reserve);
  });

  it('sits inside the jadwal’s inner rule when the jadwal is drawn, and keeps the lines that much further away', () => {
    const shown = {...legend, position: 'bottom-right' as const};
    const frame = {width: 1920, height: 1080, lineHeight: 198};
    const plain = legendBand(shown, 'light', frame)!;
    const ruled = legendBand(shown, 'light', {...frame, jadwal: true})!;
    expect(ruled.inset).toBe(76);
    expect(ruled.reserve).toBe(plain.reserve + 76 - 54);
    for (const row of ruled.rowWidths) expect(row).toBeLessThanOrEqual(1920 - 2 * 76);
    // At 9:16 the platform band is further in than the jadwal already.
    const tall = {width: 1080, height: 1920, lineHeight: 114};
    expect(legendBand(shown, 'light', {...tall, jadwal: true})!.inset).toBe(346);
    const c = mount(
      <LegendBand
        legend={shown}
        theme="light"
        fontFamily="serif"
        color="#1c1a16"
        width={1920}
        height={1080}
        lineHeight={198}
        jadwal
      />,
    );
    expect(c.querySelector<HTMLElement>('[data-mushaf-block="Tajweed legend"]')!.style).toMatchObject({
      left: '76px',
      right: '76px',
      bottom: '76px',
    });
  });

  it('fits every row inside the safe area at 9:16 with both names, drawing the names smaller when an entry is too wide', () => {
    const both = {...legend, names: 'both' as const};
    const tall = legendBand(both, 'light', {width: 1080, height: 1920, lineHeight: 114})!;
    const room = 1080 - 2 * 54;
    expect(tall.rowWidths).toHaveLength(tall.rows);
    for (const row of tall.rowWidths) expect(row).toBeLessThanOrEqual(room);
    // The estimate (0.5 em a character, plus the names' 0.08 em letter-spacing) makes the
    // "Connected or separated prolongation: 4 or 5 counts" entry about 1380 px at 0.8 L (30 px):
    // it is drawn at floor(30 × 972 / 1380) px.
    const english = 'Connected or separated prolongation: 4 or 5 counts';
    const arabic = 'مد متصل أو منفصل ٤ أو ٥ حركات';
    const widest = 30 * (0.5 + 0.4 + english.length * (0.5 + 0.08) + 0.4 + arabic.length * 0.5);
    expect(tall.fontSize).toBe(Math.floor((30 * room) / widest));
    expect(tall.fontSize).toBeLessThan(30);
    expect(tall.height).toBe(Math.round(tall.rows * 1.6 * tall.fontSize));
    // English names alone fit at 0.8 L: nothing is drawn smaller.
    expect(legendBand({...both, names: 'en'}, 'light', {width: 1080, height: 1920, lineHeight: 114})!.fontSize).toBe(
      30,
    );
    // At 16:9 every entry fits at 0.8 L as well.
    const wide = legendBand(both, 'light', {width: 1920, height: 1080, lineHeight: 198})!;
    expect(wide.fontSize).toBe(21);
    for (const row of wide.rowWidths) expect(row).toBeLessThanOrEqual(1920 - 2 * 54);
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
    expect(card.querySelector('[data-mushaf-end-card-part="range"]')!.textContent).toBe('Al-Fatihah · Ayat 2–7');
    // The framed surah name is the title, once.
    expect(card.querySelectorAll('[data-mushaf-end-card-part="title"]')).toHaveLength(1);
    expect(card.querySelector('[data-mushaf-end-card-part="reciter"]')!.textContent).toBe('Abdul Hamid Ghraio');
    const credits = Array.from(card.querySelector('[data-mushaf-end-card-part="credits"]')!.children).map(
      (line) => line.textContent,
    );
    // No intro card credited the translation: the end card does.
    expect(credits).toEqual([FONTS_ATTRIBUTION, 'Translation of the meanings · Saheeh International']);
    cleanup();
    const introduced = {...props, overlay: {...props.overlay, title: 'intro' as const}};
    const withCard = mount(<MushafRecitation {...introduced} resolved={resolved} />);
    const once = Array.from(withCard.querySelector('[data-mushaf-end-card-part="credits"]')!.children).map(
      (line) => line.textContent,
    );
    expect(once).toEqual([FONTS_ATTRIBUTION]);
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

  it('lets the loaders’ content errors through, coded as content', async () => {
    const missing = resolvedOf(recitationProps({endCard: endCard({show: 'tafsir', tafsirFile: 'none.json'})}));
    await expect(missing).rejects.toMatchObject({code: 'CONTENT_FETCH_FAILED'});
    const notTafsir = resolvedOf(recitationProps({endCard: endCard({show: 'tafsir', tafsirFile: 'en.json'})}));
    await expect(notTafsir).rejects.toMatchObject({code: 'BAD_CONTENT_FILE'});
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

describe('hostAudio: the template plays the audio', () => {
  const host = (offsetSeconds: number) => ({enabled: true, offsetSeconds, track: 'Template audio'});
  const nameOf = (record: unknown) => (record as {name?: string}).name;

  it('names its own <Audio> so the panel can leave it out of the template’s tracks, and plays it while off', async () => {
    const props = recitationProps();
    mount(<MushafRecitation {...props} resolved={await resolvedOf(props)} />);
    expect(remotion.audios.map(nameOf)).toEqual(['Mushaf recitation audio']);
    expect(OWN_AUDIO_NAME).toBe('Mushaf recitation audio');
    // Props saved before the group existed read as off.
    const {hostAudio: _, ...older} = props;
    expect(hostAudioOf(older)).toEqual(defaultHostAudio);
    expect(mushafRecitationSchema.safeParse(older).success).toBe(true);
    cleanup();
    remotion.audios.length = 0;
    mount(
      <MushafRecitation
        {...(older as MushafRecitationProps)}
        resolved={await resolvedOf(older as MushafRecitationProps)}
      />,
    );
    expect(remotion.audios).toHaveLength(1);
  });

  it('plays no audio of its own, and moves the timings to the second of the track heard at frame 0', async () => {
    const props = recitationProps({hostAudio: host(1.5), audio: audio({normalize: true, trimSilence: true})});
    const resolved = await resolvedOf(props);
    expect(resolved.audioOffsetSeconds).toBe(1.5);
    expect(resolved.timings.ayat[0]!.start).toBeCloseTo(0.331 - 1.5, 6);
    expect(resolved.timings.ayat[0]!.words![0]!.start).toBeCloseTo(0.331 - 1.5, 6);
    // The cleanup is the template's: no gain, no trim, nothing analysed for them.
    expect(resolved.audio).toEqual({gain: 1, trimSeconds: 0, levels: []});
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    mount(<MushafRecitation {...props} resolved={resolved} />);
    expect(remotion.audios).toHaveLength(0);
    // A track that starts later than the recitation: the timings move later.
    const late = await resolvedOf(recitationProps({hostAudio: host(-2)}));
    expect(late.audioOffsetSeconds).toBe(-2);
    expect(late.timings.ayat[0]!.start).toBeCloseTo(2.331, 6);
  });

  it('never streams the catalogue clip in place of a missing file: the template’s track is what plays', async () => {
    const props = recitationProps({audioFile: 'missing.mp3', timingsFile: 'clip.json', hostAudio: host(0)});
    const resolved = await resolvedOf(props);
    expect(resolved.audioSrc).toBeNull();
    expect(resolved.audioWarning).toBeNull();
  });

  it('measures nothing for a track the template plays: no gain, no trim, no levels', async () => {
    const resolved = await resolvedOf(recitationProps({hostAudio: host(-2)}));
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    expect(resolved.audio).toEqual({gain: 1, trimSeconds: 0, levels: []});
  });

  it('refuses memorisation repeats, which cannot replay a track the template plays straight through', async () => {
    const memorize = {...defaultMushafRecitationProps.memorize, mode: 'repeat' as const, repeat: 3};
    const refused = resolvedOf(recitationProps({hostAudio: host(0), memorize}));
    await expect(refused).rejects.toMatchObject({code: 'BAD_STUDIO_PROP'});
    await expect(refused).rejects.toThrow(
      /memorize\.repeat is 3 \(mode "repeat"\), but hostAudio\.enabled is true.*Set memorize\.repeat to 1 or memorize\.mode to "off"/,
    );
    // One play of each ayah, words hidden, is fine.
    const once = await resolvedOf(
      recitationProps({hostAudio: host(0), memorize: {...memorize, mode: 'blank-upcoming', repeat: 1}}),
    );
    expect(once.clips.every((clip) => clip.repetition === 1)).toBe(true);
    expect(() => assertNoHostRepeats({hostAudio: {enabled: false}}, memorize)).not.toThrow();
  });

  it('works the same in an ayah text and a page', async () => {
    const ayahProps: MushafAyahTextProps = {
      ...defaultMushafAyahTextProps,
      audioFile: 'audio.mp3',
      timingsFile: 'timings.json',
      textFile: 'text.json',
      hostAudio: host(0.5),
    };
    const ayahText = (await calculateMushafAyahTextMetadata(metadataArgs(ayahProps))).props!.resolved;
    expect(ayahText.audioOffsetSeconds).toBe(0.5);
    expect(ayahText.ayahs[0]!.start).toBeCloseTo(0.331 - 0.5, 6);
    mount(<MushafAyahText {...ayahProps} resolved={ayahText} />);
    expect(remotion.audios).toHaveLength(0);
    const repeat = {...defaultMushafAyahTextProps.memorize, mode: 'repeat' as const, repeat: 2};
    await expect(resolveAyahText({...ayahProps, memorize: repeat})).rejects.toMatchObject({code: 'BAD_STUDIO_PROP'});
    cleanup();
    const pageProps: MushafPageProps = {
      ...defaultMushafPageProps,
      audioFile: 'audio.mp3',
      timingsFile: 'surah2.json',
      hostAudio: host(-1),
    };
    const page = (await calculateMushafPageMetadata(metadataArgs(pageProps))).props!.resolved;
    expect(page.audioOffsetSeconds).toBe(-1);
    expect(page.timings.ayat[0]!.start).toBeCloseTo(1.5, 6);
    mount(<MushafPage {...pageProps} resolved={page} />);
    expect(remotion.audios).toHaveLength(0);
  });
});

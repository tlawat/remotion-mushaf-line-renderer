import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';

// calculateMetadata resolves through remotion's staticFile(); a stand-in keeps the URLs readable.
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  staticFile: (path: string) => `https://studio.test/static/${path}`,
}));

const {MushafStudioError} = await import('../../../src/errors');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation');
const {QUL_FONTS} = await import('../../../src/fonts');
const {
  ayahPresentationStyle,
  calculateMushafAyahTextMetadata,
  defaultMushafAyahTextProps,
  mushafAyahTextSchema,
  resolveAyahText,
  UNICODE_FONTS,
} = await import('../../../src/unicode');
const {fakeFetch} = await import('../translations/helpers');
type MushafAyahTextProps = import('../../../src/unicode').MushafAyahTextProps;

const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8'));

const TRANSLATION = {
  version: 1,
  kind: 'ayah',
  meta: {id: 'quran.com:20', name: 'Saheeh International', language: 'en', source: 'quran.com'},
  text: {'1:2': '[All] praise is [due] to Allāh, Lord of the worlds -', '1:3': 'The Entirely Merciful'},
};

/** `public/` as the Studio serves it: the Fatiha timings and text fixtures, a translation, and 404 for anything else. */
const studio = (files: Record<string, unknown> = {}) =>
  fakeFetch((url) => {
    const all: Record<string, unknown> = {
      'mushaf-studio/fatiha/timings.json': read('timings/fatiha.json'),
      'mushaf-studio/fatiha/text-uthmani.json': read('unicode/fatiha-text.json'),
      'mushaf-studio/fatiha/translation.json': TRANSLATION,
      ...files,
    };
    const body = all[url.pathname.replace(/^\/static\//, '')];
    return body === undefined ? {status: 404, body: {}} : {body};
  });

const io = (fetch: typeof globalThis.fetch) => ({
  fetch,
  staticFile: (path: string) => `https://studio.test/static/${path}`,
});

const props = (overrides: Partial<MushafAyahTextProps> = {}): MushafAyahTextProps => ({
  ...defaultMushafAyahTextProps,
  ...overrides,
});

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof MushafStudioError) return error;
    throw error;
  }
  throw new Error('expected a rejection');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveAyahText', () => {
  it('pairs every timed ayah with its words from the text file, the marker last', async () => {
    const {fetch, urls} = studio();
    const resolved = await resolveAyahText(props(), io(fetch));
    expect(urls.map((u) => u.pathname).sort()).toEqual([
      '/static/mushaf-studio/fatiha/text-uthmani.json',
      '/static/mushaf-studio/fatiha/timings.json',
    ]);
    expect(resolved.translation).toBeNull();
    expect(resolved.text.script).toBe('uthmani');
    expect(resolved.ayahs.map((a) => [a.ayah, a.start, a.end, a.words.length])).toEqual([
      [2, 0.331, 3.391, 5],
      [3, 3.533, 5.693, 3],
      [4, 6.145, 8.615, 4],
      [5, 8.729, 12.989, 5],
      [6, 13.166, 16.106, 4],
      [7, 16.499, 27.559, 10],
    ]);
    const seventh = resolved.ayahs[5]!;
    expect(seventh.surah).toBe(1);
    expect(seventh.words.at(-1)).toEqual({id: '1:7:10', position: 10, text: '٧', kind: 'end'});
    // The words are the text's, ready for the timings' ids.
    expect(seventh.words.slice(0, -1).map((w) => w.id)).toEqual(resolved.timings.ayat.at(-1)!.words!.map((w) => w.id));
  });

  it('trims to fromAyah/toAyah and drops the ayahs the recording does not carry whole', async () => {
    const timings = read('timings/fatiha.json') as {ayat: {complete?: boolean}[]};
    timings.ayat[2]!.complete = false;
    const {fetch} = studio({'mushaf-studio/fatiha/timings.json': timings});
    const resolved = await resolveAyahText(props({fromAyah: 3, toAyah: 6}), io(fetch));
    expect(resolved.ayahs.map((a) => a.ayah)).toEqual([3, 5, 6]);
    expect(resolved.timings.ayat.map((a) => a.ayah)).toEqual([3, 5, 6]);
  });

  it('loads the ayah translation when translationFile is set', async () => {
    const {fetch} = studio();
    const resolved = await resolveAyahText(
      props({text: {...defaultMushafAyahTextProps.text, translationFile: 'mushaf-studio/fatiha/translation.json'}}),
      io(fetch),
    );
    expect(resolved.translation?.kind).toBe('ayah');
    expect(resolved.translation?.text['1:3']).toBe('The Entirely Merciful');
  });

  it('refuses a word-by-word file as the translation', async () => {
    const {fetch} = studio({'gloss.json': {'1:2:1': 'All praises'}});
    const error = await rejection(
      resolveAyahText(props({text: {...defaultMushafAyahTextProps.text, translationFile: 'gloss.json'}}), io(fetch)),
    );
    expect(error.code).toBe('BAD_STUDIO_PROP');
    expect(error.message).toContain('text.translationFile');
  });

  it('refuses an empty textFile without fetching it, pointing at the Text tab and the fetch', async () => {
    const {fetch, urls} = studio();
    const error = await rejection(resolveAyahText(props({textFile: ''}), io(fetch)));
    expect(error.code).toBe('BAD_STUDIO_PROP');
    expect(error.details.prop).toBe('textFile');
    expect(error.message).toContain('Text tab');
    expect(error.message).toContain('fetchQuranComText');
    expect(urls).toHaveLength(0);
  });

  it('names the ayah and the text file when the text lacks a timed ayah', async () => {
    const text = read('unicode/fatiha-text.json') as {words: Record<string, string>};
    for (const key of Object.keys(text.words)) if (key.startsWith('1:5:')) delete text.words[key];
    const {fetch} = studio({'short.json': text});
    const error = await rejection(resolveAyahText(props({textFile: 'short.json'}), io(fetch)));
    expect(error.code).toBe('BAD_STUDIO_PROP');
    expect(error.message).toContain('ayah 1:5');
    expect(error.message).toContain('"short.json"');
    expect(error.details).toMatchObject({prop: 'textFile', surah: 1, ayah: 5});
  });

  it('refuses a text in a script the font does not set', async () => {
    const text = {...(read('unicode/fatiha-text.json') as object), script: 'indopak'};
    const {fetch} = studio({'indopak.json': text});
    const error = await rejection(resolveAyahText(props({textFile: 'indopak.json'}), io(fetch)));
    expect(error.code).toBe('BAD_STUDIO_PROP');
    expect(error.message).toContain('indopak');
    expect(error.message).toContain('uthmani-hafs');
  });

  it('passes a missing or bad text file on with its URL', async () => {
    const {fetch} = studio({'bad.json': {version: 1, kind: 'quran-text', script: 'uthmani', meta: {}, words: {}}});
    const missing = await rejection(resolveAyahText(props({textFile: 'nope.json'}), io(fetch)));
    expect(missing.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(missing.message).toContain('https://studio.test/static/nope.json');
    const bad = await rejection(resolveAyahText(props({textFile: 'bad.json'}), io(fetch)));
    expect(bad.code).toBe('BAD_STUDIO_PROP');
    expect(bad.message).toContain('https://studio.test/static/bad.json: Quran text file:');
  });
});

describe('calculateMushafAyahTextMetadata', () => {
  it('resolves the props, sizes the frame from the aspect and lasts until a second after the last ayah', async () => {
    const {fetch} = studio();
    vi.stubGlobal('fetch', fetch);
    const metadata = await calculateMushafAyahTextMetadata({
      props: props(),
      defaultProps: props(),
      abortSignal: new AbortController().signal,
      compositionId: 'MushafAyahText',
      isRendering: false,
    });
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1920);
    expect(metadata.fps).toBe(30);
    expect(metadata.durationInFrames).toBe(Math.ceil((27.559 + 1) * 30));
    expect((metadata.props as MushafAyahTextProps).resolved.ayahs).toHaveLength(6);
  });
});

describe('the schema and its defaults', () => {
  it('accepts the defaults, and they play the same sample as MushafRecitation', () => {
    expect(mushafAyahTextSchema.parse(defaultMushafAyahTextProps)).toEqual(defaultMushafAyahTextProps);
    expect(defaultMushafAyahTextProps.audioFile).toBe(defaultMushafRecitationProps.audioFile);
    expect(defaultMushafAyahTextProps.timingsFile).toBe(defaultMushafRecitationProps.timingsFile);
    expect(defaultMushafAyahTextProps.layout).toMatchObject({aspect: '9:16', background: '#101418', color: '#f4efe6'});
    expect(defaultMushafAyahTextProps.highlight.color).toBe('#c8a45c');
    expect(defaultMushafAyahTextProps).toMatchObject({font: 'uthmani-hafs', fontSize: 96, lineHeight: 1.9});
  });

  it('bounds the type size and line height, and knows one font', () => {
    expect(() => mushafAyahTextSchema.parse(props({fontSize: 39}))).toThrow();
    expect(() => mushafAyahTextSchema.parse(props({fontSize: 201}))).toThrow();
    expect(() => mushafAyahTextSchema.parse(props({lineHeight: 2.6}))).toThrow();
    expect(() => mushafAyahTextSchema.parse({...props(), font: 'indopak'})).toThrow();
  });

  it('describes every field for the Props sidebar', () => {
    for (const [key, field] of Object.entries(mushafAyahTextSchema.shape)) {
      expect([key, field.description]).toEqual([key, expect.any(String)]);
    }
    for (const [key, field] of Object.entries(mushafAyahTextSchema.shape.animation.shape)) {
      expect([key, field.description]).toEqual([key, expect.any(String)]);
    }
  });

  it('loads the Uthmani Hafs font from the URL the QUL catalogue records', () => {
    const entry = QUL_FONTS.find((f) => f.id === UNICODE_FONTS['uthmani-hafs'].qulFont);
    expect(entry?.cdnUrl).toBe(UNICODE_FONTS['uthmani-hafs'].url);
    expect(UNICODE_FONTS['uthmani-hafs']).toMatchObject({family: 'mushaf-uthmanic-hafs', format: 'truetype'});
    expect(UNICODE_FONTS['uthmani-hafs'].unicodeRange).toBeUndefined();
  });
});

describe('ayahPresentationStyle', () => {
  const fps = 30;
  const slide = {enter: 'slide-fade', exit: 'slide-fade'} as const;

  it('slides and fades in over the entrance, rests, then leaves over the exit', () => {
    const first = ayahPresentationStyle(slide, 0, 120, fps, 100);
    expect(first.opacity).toBe(0);
    expect(first.transform).toBe('translateY(28.0000px)');
    expect(ayahPresentationStyle(slide, 60, 120, fps, 100)).toEqual({opacity: 1, transform: 'translateY(0.0000px)'});
    const leaving = ayahPresentationStyle(slide, 119, 120, fps, 100);
    expect(leaving.opacity).toBeLessThan(0.2);
    expect(leaving.transform).toMatch(/^translateY\(-1[0-9]\.\d{4}px\)$/);
  });

  it('fades, reveals right to left, or does nothing', () => {
    expect(ayahPresentationStyle({enter: 'fade', exit: 'fade'}, 0, 120, fps, 100)).toEqual({opacity: 0});
    expect(ayahPresentationStyle({enter: 'fade', exit: 'fade'}, 60, 120, fps, 100)).toEqual({opacity: 1});
    expect(ayahPresentationStyle({enter: 'reveal-rtl', exit: 'none'}, 0, 120, fps, 100).clipPath).toBe(
      'inset(-100% 0 -100% 100.0000%)',
    );
    expect(ayahPresentationStyle({enter: 'none', exit: 'none'}, 0, 120, fps, 100)).toEqual({});
    expect(ayahPresentationStyle({enter: 'none', exit: 'fade'}, 0, 120, fps, 100)).toEqual({});
  });

  it('is a pure function of the frame', () => {
    expect(ayahPresentationStyle(slide, 7, 120, fps, 182.4)).toEqual(ayahPresentationStyle(slide, 7, 120, fps, 182.4));
  });
});

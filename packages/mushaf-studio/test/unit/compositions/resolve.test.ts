// resolveRecitation() and calculateMushafRecitationMetadata() against the Fatiha timings fixture,
// with the package's line resolver and the translation loader mocked.
import type {GetMushafLinesOptions} from '@tlawat/remotion-mushaf-line';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import fatiha from '../../fixtures/timings/fatiha.json';
import {fatihaLines} from './helpers/fatiha-lines';

const mocks = vi.hoisted(() => ({getMushafLines: vi.fn(), loadTranslation: vi.fn(), staticFile: vi.fn()}));

vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  getMushafLines: (options: unknown) => mocks.getMushafLines(options),
}));
vi.mock('../../../src/translations', () => ({
  loadTranslation: (...args: unknown[]) => mocks.loadTranslation(...args),
  ayahKeyOf: () => null,
  TranslationBlock: () => null,
  GlossStrip: () => null,
}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  staticFile: (path: string) => mocks.staticFile(path),
}));

const {calculateMushafRecitationMetadata, defaultMushafRecitationProps, resolveRecitation} = await import(
  '../../../src/compositions/recitation'
);
const {isMushafStudioError} = await import('../../../src/errors');
const {isMushafError} = await import('@tlawat/remotion-mushaf-line');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;
type StudioTimings = import('../../../src/types').StudioTimings;

const staticFile = (path: string) => `/static/${path}`;
const fetchJson = (body: unknown, status = 200) =>
  vi.fn(async () => ({ok: status < 400, status, json: async () => body})) as unknown as typeof fetch;
const props = (changes: Partial<MushafRecitationProps> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  ...changes,
});
const linesArg = (call = 0) => mocks.getMushafLines.mock.calls[call]![0] as GetMushafLinesOptions;
const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as Error & {code: string};
  }
  throw new Error('expected a rejection');
};
const ayahText = {
  kind: 'ayah',
  meta: {id: 'test', name: 'Test', language: 'en', source: 'file'},
  text: {'1:2': 'Praise'},
};
const wordText = {
  kind: 'word',
  meta: {id: 'test', name: 'Test', language: 'en', source: 'file'},
  words: {'1:2:1': 'praise'},
};

beforeEach(() => {
  mocks.getMushafLines.mockReset();
  mocks.getMushafLines.mockImplementation(async (options: GetMushafLinesOptions) =>
    fatihaLines(options.fromAyah ?? 1, options.toAyah ?? 7),
  );
  mocks.loadTranslation.mockReset();
  mocks.staticFile.mockReset();
  mocks.staticFile.mockImplementation(staticFile);
});

describe('resolveRecitation', () => {
  it('fetches the timings through staticFile(), resolves the sliced lines from the mirror and schedules them', async () => {
    const fetch = fetchJson(fatiha);
    const resolved = await resolveRecitation(props(), {fetch, staticFile});
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/fatiha/timings.json', {cache: 'no-store'});
    expect(linesArg()).toEqual({
      surah: 1,
      fromAyah: 2,
      toAyah: 7,
      theme: 'plain',
      slice: true,
      data: {words: '/static/data/qpc-v4/words.json.zip', layout: '/static/data/qpc-v4/layout.db.zip'},
    });
    expect(resolved.timings.ayat.map((a) => a.ayah)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(resolved.lines).toHaveLength(6);
    expect(resolved.schedule).toEqual([
      {index: 0, start: 0.331, end: 3.533},
      {index: 1, start: 3.533, end: 6.145},
      {index: 2, start: 6.145, end: 8.729},
      {index: 3, start: 8.729, end: 13.166},
      {index: 4, start: 13.166, end: 16.499},
      {index: 5, start: 16.499, end: 27.559},
    ]);
    expect(resolved.translation).toBeNull();
    expect(resolved.gloss).toBeNull();
    expect(resolved.transliteration).toBeNull();
    expect(resolved.doubtful).toEqual({});
    expect(mocks.loadTranslation).not.toHaveBeenCalled();
  });

  it('passes the theme, the data source and the occurrence through', async () => {
    await resolveRecitation(props({theme: 'custom', data: 'cdn', slice: false}), {
      fetch: fetchJson(fatiha),
      staticFile,
    });
    expect(linesArg().theme).toEqual({base: 'normal', colors: {accent: '#c8a45c', detail: '#c8a45c'}});
    expect(linesArg().data).toBeUndefined();
    expect(linesArg().slice).toBe(false);
    // 1:3:1 recited twice: the line of ayah 3 starts at its first or its last recitation.
    const repeated = {
      ...fatiha,
      ayat: fatiha.ayat.map((a) =>
        a.ayah === 3 ? {...a, words: [a.words[0]!, {id: '1:3:1', start: 4.1, end: 4.5}, a.words[1]!]} : a,
      ),
    };
    const first = await resolveRecitation(props(), {fetch: fetchJson(repeated), staticFile});
    const last = await resolveRecitation(
      props({highlight: {...defaultMushafRecitationProps.highlight, occurrence: 'last'}}),
      {
        fetch: fetchJson(repeated),
        staticFile,
      },
    );
    expect(first.schedule[1]!.start).toBe(3.533);
    expect(last.schedule[1]!.start).toBe(4.1);
  });

  it('trims to fromAyah / toAyah, 0 keeping the bound of the file', async () => {
    const both = await resolveRecitation(props({fromAyah: 3, toAyah: 4}), {fetch: fetchJson(fatiha), staticFile});
    expect(both.timings.ayat.map((a) => a.ayah)).toEqual([3, 4]);
    expect(linesArg()).toMatchObject({fromAyah: 3, toAyah: 4});
    expect(both.lines).toHaveLength(2);
    expect(both.schedule).toEqual([
      {index: 0, start: 3.533, end: 6.145},
      {index: 1, start: 6.145, end: 8.615},
    ]);
    const to = await resolveRecitation(props({toAyah: 3}), {fetch: fetchJson(fatiha), staticFile});
    expect(to.timings.ayat.map((a) => a.ayah)).toEqual([2, 3]);
    const from = await resolveRecitation(props({fromAyah: 7}), {fetch: fetchJson(fatiha), staticFile});
    expect(from.timings.ayat.map((a) => a.ayah)).toEqual([7]);
  });

  it('drops the ayahs the recording does not carry whole', async () => {
    const cut = {...fatiha, ayat: fatiha.ayat.map((a) => (a.ayah === 7 ? {...a, complete: false} : a))};
    const resolved = await resolveRecitation(props(), {fetch: fetchJson(cut), staticFile});
    expect(resolved.timings.ayat.map((a) => a.ayah)).toEqual([2, 3, 4, 5, 6]);
    expect(linesArg()).toMatchObject({fromAyah: 2, toAyah: 6});
    expect(resolved.lines).toHaveLength(5);
  });

  it('refuses a range that leaves nothing, naming what the file carries', async () => {
    const outside = await rejection(resolveRecitation(props({fromAyah: 8}), {fetch: fetchJson(fatiha), staticFile}));
    expect(isMushafStudioError(outside)).toBe(true);
    expect(outside.code).toBe('BAD_STUDIO_PROP');
    expect(outside.message).toContain('8-7');
    expect(outside.message).toContain('ayahs 2-7 of surah 1');
    const cut = {...fatiha, ayat: fatiha.ayat.map((a) => ({...a, complete: false}))};
    const incomplete = await rejection(resolveRecitation(props(), {fetch: fetchJson(cut), staticFile}));
    expect(incomplete.code).toBe('BAD_STUDIO_PROP');
    expect(incomplete.message).toContain('complete: false');
    const reversed = await rejection(
      resolveRecitation(props({fromAyah: 4, toAyah: 3}), {fetch: fetchJson(fatiha), staticFile}),
    );
    expect(reversed.code).toBe('BAD_STUDIO_PROP');
    expect(reversed.message).toContain('toAyah (3) is before fromAyah (4)');
  });

  it('applies the splits before scheduling, so each half is a slot of its own', async () => {
    // Line 8 (ayah 7, words 22-31) split before 1:7:5 (word 26), heard at 19.669.
    const resolved = await resolveRecitation(props({splits: [{page: 1, line: 8, atWordId: 26}]}), {
      fetch: fetchJson(fatiha),
      staticFile,
    });
    expect(resolved.lines).toHaveLength(7);
    expect(resolved.lines[5]!.slice).toEqual({fromWordId: 22, toWordId: 25});
    expect(resolved.lines[6]!.slice).toEqual({fromWordId: 26, toWordId: 31});
    expect(resolved.schedule.slice(4)).toEqual([
      {index: 4, start: 13.166, end: 16.499},
      {index: 5, start: 16.499, end: 19.669},
      {index: 6, start: 19.669, end: 27.559},
    ]);
    const missing = await rejection(
      resolveRecitation(props({splits: [{page: 2, line: 1, atWordId: 3}]}), {fetch: fetchJson(fatiha), staticFile}),
    );
    expect(missing.code).toBe('BAD_LINE_SPLIT');
  });

  it('loads the translation, gloss and transliteration files of the right kinds', async () => {
    mocks.loadTranslation.mockImplementation(async (url: string) => (url.includes('ayah') ? ayahText : wordText));
    const text = {
      ...defaultMushafRecitationProps.text,
      translationFile: 'mushaf-studio/fatiha/ayah-en.json',
      glossFile: 'mushaf-studio/fatiha/word-en.json',
      transliterationFile: 'https://example.test/word-translit.json',
    };
    const fetch = fetchJson(fatiha);
    const resolved = await resolveRecitation(props({text}), {fetch, staticFile});
    expect(resolved.translation).toBe(ayahText);
    expect(resolved.gloss).toBe(wordText);
    expect(resolved.transliteration).toBe(wordText);
    expect(mocks.loadTranslation.mock.calls.map((call) => call[0])).toEqual([
      '/static/mushaf-studio/fatiha/ayah-en.json',
      '/static/mushaf-studio/fatiha/word-en.json',
      'https://example.test/word-translit.json',
    ]);
    expect(mocks.loadTranslation.mock.calls[0]![1]).toEqual({fetch});
  });

  it('refuses a translation file of the other kind, naming the prop', async () => {
    mocks.loadTranslation.mockResolvedValue(ayahText);
    const gloss = await rejection(
      resolveRecitation(props({text: {...defaultMushafRecitationProps.text, glossFile: 'g.json'}}), {
        fetch: fetchJson(fatiha),
        staticFile,
      }),
    );
    expect(gloss.code).toBe('BAD_STUDIO_PROP');
    expect(gloss.message).toContain('text.glossFile "g.json" is an ayah-by-ayah translation');
    mocks.loadTranslation.mockResolvedValue(wordText);
    const translation = await rejection(
      resolveRecitation(props({text: {...defaultMushafRecitationProps.text, translationFile: 't.json'}}), {
        fetch: fetchJson(fatiha),
        staticFile,
      }),
    );
    expect(translation.message).toContain('text.translationFile "t.json" is a word-by-word file');
  });

  it('marks the doubtful words with the review threshold', async () => {
    const withSidecar: StudioTimings = {
      ...(fatiha as unknown as StudioTimings),
      alignment: {
        version: 1,
        source: 'qud',
        segments: [
          {
            segment: 1,
            timeFrom: 0,
            timeTo: 3,
            refFrom: '1:2:1',
            refTo: '1:2:4',
            confidence: 0.7,
            hasMissingWords: false,
            hasRepeatedWords: false,
            error: null,
            matchedText: null,
          },
        ],
        words: [{id: '1:2:1', text: 'x', segment: 1, start: 0.331, end: 0.901}],
        edits: [],
      },
    };
    const marked = await resolveRecitation(props(), {fetch: fetchJson(withSidecar), staticFile});
    expect(marked.doubtful).toEqual({'1:2:1': ['low-confidence']});
    expect(marked.timings.alignment).toBe(withSidecar.alignment);
    const lenient = await resolveRecitation(
      props({review: {...defaultMushafRecitationProps.review, confidenceThreshold: 0.5}}),
      {
        fetch: fetchJson(withSidecar),
        staticFile,
      },
    );
    expect(lenient.doubtful).toEqual({});
  });

  it('names the timings file in every failure to read it', async () => {
    const http = await rejection(resolveRecitation(props(), {fetch: fetchJson({}, 404), staticFile}));
    expect(http.code).toBe('BAD_STUDIO_PROP');
    expect(http.message).toContain('HTTP 404');
    expect(http.message).toContain('/static/mushaf-studio/fatiha/timings.json');
    const network = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect((await rejection(resolveRecitation(props(), {fetch: network, staticFile}))).message).toContain('offline');
    const text = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('x');
      },
    })) as unknown as typeof fetch;
    expect((await rejection(resolveRecitation(props(), {fetch: text, staticFile}))).message).toContain('not JSON');
    expect(
      (await rejection(resolveRecitation(props({timingsFile: ''}), {fetch: fetchJson(fatiha), staticFile}))).message,
    ).toContain('timingsFile is empty');
    // The package's own validation passes through with its code.
    const wrong = await rejection(resolveRecitation(props(), {fetch: fetchJson({...fatiha, version: 2}), staticFile}));
    expect(isMushafError(wrong)).toBe(true);
    expect(wrong.code).toBe('BAD_RECITATION_TIMINGS');
    const sidecar = await rejection(
      resolveRecitation(props(), {fetch: fetchJson({...fatiha, alignment: {version: 2}}), staticFile}),
    );
    expect(sidecar.code).toBe('BAD_STUDIO_PROP');
    expect(sidecar.message).toContain('"alignment" sidecar');
    // A URL is fetched as it is.
    const fetch = fetchJson(fatiha);
    await resolveRecitation(props({timingsFile: 'https://example.test/t.json'}), {fetch, staticFile});
    expect(fetch).toHaveBeenCalledWith('https://example.test/t.json', {cache: 'no-store'});
  });
});

describe('calculateMushafRecitationMetadata', () => {
  it('fills resolved, sizes the frame by the aspect and counts the frames from the timings', async () => {
    vi.stubGlobal('fetch', fetchJson(fatiha));
    try {
      const metadata = await calculateMushafRecitationMetadata({
        props: props(),
        defaultProps: props(),
        abortSignal: new AbortController().signal,
        compositionId: 'MushafRecitation',
        isRendering: false,
      });
      expect(metadata).toMatchObject({width: 1920, height: 1080, fps: 30, durationInFrames: 857});
      const resolved = (metadata.props as MushafRecitationProps).resolved as {lines: unknown[]; schedule: unknown[]};
      expect(resolved.lines).toHaveLength(6);
      expect(resolved.schedule).toHaveLength(6);
      expect(mocks.staticFile).toHaveBeenCalledWith('mushaf-studio/fatiha/timings.json');
      const portrait = await calculateMushafRecitationMetadata({
        props: props({layout: {...defaultMushafRecitationProps.layout, aspect: '9:16'}}),
        defaultProps: props(),
        abortSignal: new AbortController().signal,
        compositionId: 'MushafRecitation',
        isRendering: true,
      });
      expect(portrait).toMatchObject({width: 1080, height: 1920});
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

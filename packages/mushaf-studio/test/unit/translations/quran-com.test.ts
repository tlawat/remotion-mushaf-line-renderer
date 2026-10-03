import {describe, expect, it} from 'vitest';
import {MushafStudioError} from '../../../src/errors';
import {
  DEFAULT_QURAN_COM_API,
  fetchQuranComTranslation,
  fetchQuranComWordGloss,
  listQuranComTranslations,
} from '../../../src/translations';
import {fetchQuranComVerseWords} from '../../../src/translations/quran-com';
import {type FakeAnswer, fakeFetch, fixture} from './helpers';

const API = 'https://api.quran.com/api/v4';

const RESOURCES = {
  translations: [
    {id: 20, name: 'Saheeh International', author_name: 'Saheeh International', slug: 'x', language_name: 'english'},
    {id: 97, name: 'Tafheem e Qur’an', author_name: 'Syed Abu Ali Maududi', language_name: 'urdu'},
    {id: 149, name: 'Bridges’ translation', author_name: 'Fadel Soliman', language_name: 'english'},
    {id: 50, name: 'Jan Trust Foundation', author_name: 'Jan Trust', language_name: 'tamil'},
    {id: 7, name: 'Ali Quli Qarai', author_name: 'Qarai', language_name: 'Dutch'},
    {id: 300, name: 'Some', author_name: 'One', language_name: 'tajik'},
  ],
};

/** Routes quran.com's paths to answers; anything else is a 404. */
const quranCom = (answers: Record<string, FakeAnswer | Error | ((url: URL) => FakeAnswer)>) =>
  fakeFetch((url) => {
    const answer = answers[url.pathname.replace('/api/v4', '')];
    if (answer === undefined) return {status: 404, body: {message: 'not found'}};
    return typeof answer === 'function' ? answer(url) : answer;
  });

const rejection = async (promise: Promise<unknown>): Promise<MushafStudioError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof MushafStudioError) return error;
    throw error;
  }
  throw new Error('expected a rejection');
};

describe('listQuranComTranslations', () => {
  it('asks /resources/translations for the language and maps the resources', async () => {
    const {fetch, urls} = quranCom({'/resources/translations': {body: RESOURCES}});
    const list = await listQuranComTranslations({language: 'en'}, {fetch});
    expect(urls).toHaveLength(1);
    expect(urls[0]!.href).toBe(`${API}/resources/translations?language=en`);
    expect(list).toEqual([
      {
        id: 20,
        name: 'Saheeh International',
        authorName: 'Saheeh International',
        language: 'en',
        languageName: 'english',
      },
      {id: 149, name: 'Bridges’ translation', authorName: 'Fadel Soliman', language: 'en', languageName: 'english'},
    ]);
  });

  it('lists every language without a query, ISO codes for the known ones, else the lowercase name', async () => {
    const {fetch, urls} = quranCom({'/resources/translations': {body: RESOURCES}});
    const list = await listQuranComTranslations({}, {fetch});
    expect(urls[0]!.href).toBe(`${API}/resources/translations`);
    expect(list.map((r) => [r.id, r.language])).toEqual([
      [20, 'en'],
      [97, 'ur'],
      [149, 'en'],
      [50, 'ta'],
      [7, 'nl'],
      [300, 'tajik'],
    ]);
  });

  it("filters by quran.com's own language name too", async () => {
    const {fetch} = quranCom({'/resources/translations': {body: RESOURCES}});
    expect((await listQuranComTranslations({language: 'Urdu'}, {fetch})).map((r) => r.id)).toEqual([97]);
    expect((await listQuranComTranslations({language: 'tajik'}, {fetch})).map((r) => r.id)).toEqual([300]);
  });

  it('skips rows without an id and fills missing names', async () => {
    const {fetch} = quranCom({'/resources/translations': {body: {translations: [{name: 'x'}, {id: 5}, 'junk']}}});
    expect(await listQuranComTranslations({}, {fetch})).toEqual([
      {id: 5, name: 'Translation 5', authorName: '', language: 'und', languageName: ''},
    ]);
  });

  it('uses the given API base, without its trailing slash', async () => {
    const {fetch, urls} = fakeFetch(() => ({body: RESOURCES}));
    await listQuranComTranslations({}, {fetch, api: 'https://mirror.test/v4/'});
    expect(urls[0]!.href).toBe('https://mirror.test/v4/resources/translations');
    expect(DEFAULT_QURAN_COM_API).toBe(API);
  });

  it('fails with TRANSLATION_FETCH_FAILED on a 500, naming the URL and the status', async () => {
    const {fetch} = quranCom({'/resources/translations': {status: 500, body: {}}});
    const error = await rejection(listQuranComTranslations({language: 'en'}, {fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain(`${API}/resources/translations?language=en`);
    expect(error.message).toContain('HTTP 500');
    expect(error.details).toMatchObject({status: 500});
  });

  it('fails with TRANSLATION_FETCH_FAILED on a network error', async () => {
    const {fetch} = quranCom({'/resources/translations': new TypeError('Failed to fetch')});
    const error = await rejection(listQuranComTranslations({}, {fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain('Failed to fetch');
    expect(error.message).toContain(`${API}/resources/translations`);
  });

  it('fails on an answer that is not JSON or not in the expected shape', async () => {
    const notJson = quranCom({'/resources/translations': {text: '<html>'}});
    expect((await rejection(listQuranComTranslations({}, {fetch: notJson.fetch}))).message).toContain('not with JSON');
    const wrong = quranCom({'/resources/translations': {body: {resources: []}}});
    const error = await rejection(listQuranComTranslations({}, {fetch: wrong.fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain('expected {translations: [...]}');
  });

  it('passes the signal and rethrows an abort as it came', async () => {
    const controller = new AbortController();
    const abort = new DOMException('aborted', 'AbortError');
    const {fetch, mock} = fakeFetch(() => {
      controller.abort();
      return abort;
    });
    await expect(listQuranComTranslations({}, {fetch, signal: controller.signal})).rejects.toBe(abort);
    expect(mock.mock.calls[0]![1]).toEqual({signal: controller.signal});
  });

  it('rethrows an abort that lands while the body is read, not as TRANSLATION_FETCH_FAILED', async () => {
    const controller = new AbortController();
    const abort = new DOMException('aborted', 'AbortError');
    /** Answers 200, then the body read fails: `abortFirst` aborts the caller's signal first. */
    const answering = (abortFirst: boolean) =>
      (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => {
            if (abortFirst) controller.abort();
            throw abort;
          },
        }) as unknown as Response) as typeof globalThis.fetch;
    await expect(listQuranComTranslations({}, {fetch: answering(true), signal: controller.signal})).rejects.toBe(abort);
    // An AbortError is an abort even when this call's signal did not raise it.
    await expect(listQuranComTranslations({}, {fetch: answering(false)})).rejects.toBe(abort);
  });
});

describe('fetchQuranComTranslation', () => {
  it('asks for the chapter with verse keys, strips footnotes and names the resource', async () => {
    const {fetch, urls} = quranCom({
      '/quran/translations/20': {body: fixture('quran-com-translation.json')},
      '/resources/translations': {body: RESOURCES},
    });
    const t = await fetchQuranComTranslation({resourceId: 20, chapter: 1}, {fetch});
    const asked = urls.find((u) => u.pathname.endsWith('/quran/translations/20'))!;
    expect(asked.origin + asked.pathname).toBe(`${API}/quran/translations/20`);
    expect(Object.fromEntries(asked.searchParams)).toEqual({chapter_number: '1', fields: 'verse_key'});
    expect(t).toEqual({
      kind: 'ayah',
      meta: {id: 'quran.com:20', name: 'Saheeh International', language: 'en', source: 'quran.com'},
      text: {
        '1:1': 'In the name of Allāh, the Entirely Merciful, the Especially Merciful.',
        '1:2': '[All] praise is [due] to Allāh, Lord of the worlds -',
      },
    });
  });

  it('keeps only the ayah range', async () => {
    const {fetch} = quranCom({
      '/quran/translations/20': {body: fixture('quran-com-translation.json')},
      '/resources/translations': {body: RESOURCES},
    });
    expect(
      Object.keys((await fetchQuranComTranslation({resourceId: 20, chapter: 1, fromAyah: 2}, {fetch})).text),
    ).toEqual(['1:2']);
    expect(
      Object.keys((await fetchQuranComTranslation({resourceId: 20, chapter: 1, fromAyah: 1, toAyah: 1}, {fetch})).text),
    ).toEqual(['1:1']);
  });

  it("falls back to 'und' when the resource list fails, and keys rows by order when verse_key is missing", async () => {
    const {fetch} = quranCom({
      '/quran/translations/20': {
        body: {
          translations: [
            {resource_id: 20, text: 'a'},
            {resource_id: 20, text: 'b'},
          ],
          meta: {},
        },
      },
      '/resources/translations': {status: 503, body: {}},
    });
    const t = await fetchQuranComTranslation({resourceId: 20, chapter: 3}, {fetch});
    expect(t.meta).toEqual({id: 'quran.com:20', name: 'quran.com 20', language: 'und', source: 'quran.com'});
    expect(t.text).toEqual({'3:1': 'a', '3:2': 'b'});
  });

  it('fails when quran.com answers no ayah (an unknown resource id answers 200 with nothing)', async () => {
    const {fetch} = quranCom({
      '/quran/translations/999': {body: {translations: [], meta: {translation_name: null}}},
      '/resources/translations': {body: RESOURCES},
    });
    const error = await rejection(fetchQuranComTranslation({resourceId: 999, chapter: 1}, {fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain('translation 999');
    expect(error.message).toContain(`${API}/quran/translations/999?chapter_number=1&fields=verse_key`);
  });

  it('fails when the range holds no ayah of the answer', async () => {
    const {fetch} = quranCom({
      '/quran/translations/20': {body: fixture('quran-com-translation.json')},
      '/resources/translations': {body: RESOURCES},
    });
    const error = await rejection(fetchQuranComTranslation({resourceId: 20, chapter: 1, fromAyah: 5}, {fetch}));
    expect(error.message).toContain('1:5-end');
  });

  it('fails with TRANSLATION_FETCH_FAILED on a 500', async () => {
    const {fetch} = quranCom({
      '/quran/translations/20': {status: 500, body: {}},
      '/resources/translations': {body: RESOURCES},
    });
    const error = await rejection(fetchQuranComTranslation({resourceId: 20, chapter: 1}, {fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain('/quran/translations/20?chapter_number=1');
    expect(error.details).toMatchObject({status: 500});
  });

  it('fails on a row without text', async () => {
    const {fetch} = quranCom({
      '/quran/translations/20': {body: {translations: [{verse_key: '1:1'}]}},
      '/resources/translations': {body: RESOURCES},
    });
    expect((await rejection(fetchQuranComTranslation({resourceId: 20, chapter: 1}, {fetch}))).code).toBe(
      'TRANSLATION_FETCH_FAILED',
    );
  });

  it('refuses a bad id, chapter or range before asking anything', async () => {
    const {fetch, urls} = quranCom({});
    for (const query of [
      {resourceId: 0, chapter: 1},
      {resourceId: 20, chapter: 115},
      {resourceId: 20, chapter: 1.5},
      {resourceId: 20, chapter: 1, fromAyah: 0},
      {resourceId: 20, chapter: 1, fromAyah: 3, toAyah: 2},
    ]) {
      expect((await rejection(fetchQuranComTranslation(query, {fetch}))).code).toBe('BAD_STUDIO_PROP');
    }
    expect(urls).toHaveLength(0);
  });
});

/** The fixture's single verse 1:1, and a second page with 1:2, to page through. */
const versePages = () => {
  const first = fixture('quran-com-verses-words.json') as {verses: unknown[]; pagination: Record<string, unknown>};
  const page1 = {...first, pagination: {...first.pagination, next_page: 2, total_pages: 2}};
  const page2 = {
    verses: [
      {
        verse_number: 2,
        verse_key: '1:2',
        words: [
          {
            char_type_name: 'word',
            location: '1:2:1',
            translation: {text: 'All praises and thanks', language_name: 'english'},
            transliteration: {text: 'al-ḥamdu', language_name: 'english'},
          },
          {char_type_name: 'end', location: '1:2:5', translation: {text: '(2)'}, transliteration: {text: null}},
        ],
      },
    ],
    pagination: {per_page: 50, current_page: 2, next_page: null, total_pages: 2, total_records: 2},
  };
  return {page1, page2};
};

/** Pages of chapter 2, one ayah each, that name a next page up to `last` (a number, or never null). */
const endlessPages = (last: number) =>
  quranCom({
    '/verses/by_chapter/2': (url) => {
      const page = Number(url.searchParams.get('page'));
      const word = (position: number, type: string) => ({
        char_type_name: type,
        location: `2:${page}:${position}`,
        translation: {text: `word ${page}`},
      });
      return {
        body: {
          verses: [{verse_number: page, words: [word(1, 'word'), word(2, 'end')]}],
          pagination: {current_page: page, next_page: page < last ? page + 1 : null},
        },
      };
    },
  });

describe('fetchQuranComVerseWords', () => {
  it('reads up to 12 pages, markers included, and passes the language when given', async () => {
    const {fetch, urls} = endlessPages(12);
    const words = await fetchQuranComVerseWords({chapter: 2, wordFields: ['text_uthmani'], language: 'ur'}, {fetch});
    expect(urls).toHaveLength(12);
    expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({
      words: 'true',
      language: 'ur',
      word_fields: 'text_uthmani,location,char_type_name',
      per_page: '50',
      page: '1',
    });
    expect(words).toHaveLength(24);
    expect(words.slice(0, 2).map((w) => [w.location, w.char_type_name])).toEqual([
      ['2:1:1', 'word'],
      ['2:1:2', 'end'],
    ]);
  });

  it('fails with TRANSLATION_FETCH_FAILED naming the page limit when a 13th page is still named', async () => {
    const {fetch, urls} = endlessPages(13);
    const error = await rejection(fetchQuranComVerseWords({chapter: 2, wordFields: []}, {fetch}));
    expect(urls).toHaveLength(12);
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toMatch(/still names a next page \(13\) after 12 pages, the page limit/);
    // Stopping at the range's last ayah is not the limit.
    const ranged = endlessPages(13);
    await expect(fetchQuranComVerseWords({chapter: 2, wordFields: [], toAyah: 12}, ranged)).resolves.toHaveLength(24);
  });
});

describe('fetchQuranComWordGloss', () => {
  it('asks for the words of the chapter and keeps the words, keyed by location, without end markers', async () => {
    const {fetch, urls} = quranCom({'/verses/by_chapter/1': {body: fixture('quran-com-verses-words.json')}});
    const gloss = await fetchQuranComWordGloss({chapter: 1, field: 'translation'}, {fetch});
    expect(urls).toHaveLength(1);
    expect(urls[0]!.origin + urls[0]!.pathname).toBe(`${API}/verses/by_chapter/1`);
    expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({
      words: 'true',
      language: 'en',
      word_fields: 'location,char_type_name',
      per_page: '50',
      page: '1',
    });
    expect(gloss).toEqual({
      kind: 'word',
      meta: {
        id: 'quran.com:wbw-translation-en',
        name: 'quran.com word by word (en)',
        language: 'en',
        source: 'quran.com',
      },
      words: {'1:1:1': 'In (the) name', '1:1:2': '(of) Allah'},
    });
  });

  it('reads the transliteration in the language asked for', async () => {
    const {fetch, urls} = quranCom({'/verses/by_chapter/1': {body: fixture('quran-com-verses-words.json')}});
    const gloss = await fetchQuranComWordGloss({chapter: 1, field: 'transliteration', language: 'ur'}, {fetch});
    expect(urls[0]!.searchParams.get('language')).toBe('ur');
    expect(gloss.meta.id).toBe('quran.com:wbw-transliteration-ur');
    expect(gloss.meta.language).toBe('ur');
    expect(gloss.words).toEqual({'1:1:1': "bis'mi", '1:1:2': 'l-lahi'});
  });

  it('follows pagination until next_page is null', async () => {
    const {page1, page2} = versePages();
    const {fetch, urls} = quranCom({
      '/verses/by_chapter/1': (url) => ({body: url.searchParams.get('page') === '1' ? page1 : page2}),
    });
    const gloss = await fetchQuranComWordGloss({chapter: 1, field: 'translation'}, {fetch});
    expect(urls.map((u) => u.searchParams.get('page'))).toEqual(['1', '2']);
    expect(gloss.words).toEqual({
      '1:1:1': 'In (the) name',
      '1:1:2': '(of) Allah',
      '1:2:1': 'All praises and thanks',
    });
  });

  it('passes the range as from/to, filters it, and stops paging at its last ayah', async () => {
    const {page1, page2} = versePages();
    const {fetch, urls} = quranCom({
      '/verses/by_chapter/1': (url) => ({body: url.searchParams.get('page') === '1' ? page1 : page2}),
    });
    const gloss = await fetchQuranComWordGloss({chapter: 1, field: 'translation', fromAyah: 1, toAyah: 1}, {fetch});
    expect(urls).toHaveLength(1);
    expect(urls[0]!.searchParams.get('from')).toBe('1');
    expect(urls[0]!.searchParams.get('to')).toBe('1');
    expect(Object.keys(gloss.words)).toEqual(['1:1:1', '1:1:2']);
  });

  it('stops at an empty page even when quran.com names a next one', async () => {
    const {page1} = versePages();
    const {fetch, urls} = quranCom({
      '/verses/by_chapter/1': (url) =>
        url.searchParams.get('page') === '1' ? {body: page1} : {body: {verses: [], pagination: {next_page: 3}}},
    });
    await fetchQuranComWordGloss({chapter: 1, field: 'translation', fromAyah: 1}, {fetch});
    expect(urls.map((u) => u.searchParams.get('page'))).toEqual(['1', '2']);
  });

  it('fails with TRANSLATION_FETCH_FAILED on a 500 of a later page, naming its URL', async () => {
    const {page1} = versePages();
    const {fetch} = quranCom({
      '/verses/by_chapter/1': (url) => (url.searchParams.get('page') === '1' ? {body: page1} : {status: 500, body: {}}),
    });
    const error = await rejection(fetchQuranComWordGloss({chapter: 1, field: 'translation'}, {fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain('page=2');
    expect(error.message).toContain('HTTP 500');
  });

  it('fails when no word has a gloss, and on a verse without words', async () => {
    const empty = quranCom({'/verses/by_chapter/1': {body: {verses: [], pagination: {next_page: null}}}});
    const error = await rejection(fetchQuranComWordGloss({chapter: 1, field: 'translation'}, {fetch: empty.fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain('chapter 1');
    const broken = quranCom({'/verses/by_chapter/1': {body: {verses: [{verse_number: 1}]}}});
    expect(
      (await rejection(fetchQuranComWordGloss({chapter: 1, field: 'translation'}, {fetch: broken.fetch}))).code,
    ).toBe('TRANSLATION_FETCH_FAILED');
  });

  it('fails naming the page limit when quran.com still names a next page after 12, never cutting the words short', async () => {
    const {fetch, urls} = endlessPages(Number.POSITIVE_INFINITY);
    const error = await rejection(fetchQuranComWordGloss({chapter: 2, field: 'translation'}, {fetch}));
    expect(urls.map((u) => u.searchParams.get('page'))).toEqual(Array.from({length: 12}, (_, i) => String(i + 1)));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain('still names a next page (13) after 12 pages, the page limit for one chapter');
    expect(error.message).toContain('page=12');
    expect(error.details).toMatchObject({chapter: 2, pageLimit: 12});
  });

  it('refuses a bad chapter or range before asking anything', async () => {
    const {fetch, urls} = quranCom({});
    expect((await rejection(fetchQuranComWordGloss({chapter: 0, field: 'translation'}, {fetch}))).code).toBe(
      'BAD_STUDIO_PROP',
    );
    expect(
      (await rejection(fetchQuranComWordGloss({chapter: 1, field: 'translation', fromAyah: 4, toAyah: 1}, {fetch})))
        .code,
    ).toBe('BAD_STUDIO_PROP');
    expect(urls).toHaveLength(0);
  });
});

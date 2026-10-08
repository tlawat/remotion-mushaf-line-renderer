import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import type {MushafStudioError} from '../../../src/errors';
import {
  type AyahWords,
  ayahWordsOf,
  fetchQuranComText,
  loadAyahWords,
  parseAyahWords,
  serialiseAyahWords,
} from '../../../src/unicode';
import {type FakeAnswer, fakeFetch, thrown} from '../translations/helpers';

const API = 'https://api.quran.com/api/v4';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../fixtures/unicode/${name}`, import.meta.url), 'utf8'));

/** The two recorded pages of `GET /verses/by_chapter/1` (ayahs 1-2, then 3-4). */
const pages = () => (fixture('quran-com-verses-text.json') as {pages: [unknown, unknown]}).pages;

const rejection = async (promise: Promise<unknown>): Promise<MushafStudioError> => {
  try {
    await promise;
  } catch (error) {
    return error as MushafStudioError;
  }
  throw new Error('expected a rejection');
};

const sample: AyahWords = {
  version: 1,
  kind: 'quran-text',
  script: 'uthmani',
  meta: {source: 'quran.com'},
  words: {'1:1:2': 'ٱللَّهِ', '1:1:10': 'x', '1:1:1': 'بِسْمِ', '1:1:11': '١', '1:2:1': 'ٱلْحَمْدُ'},
};

describe('parseAyahWords / serialiseAyahWords', () => {
  it('round-trips: the words in surah, ayah, position order (10 after 9), the same bytes every time', () => {
    const text = serialiseAyahWords(sample);
    expect(Object.keys(JSON.parse(text).words)).toEqual(['1:1:1', '1:1:2', '1:1:10', '1:1:11', '1:2:1']);
    expect(Object.keys(JSON.parse(text))).toEqual(['version', 'kind', 'script', 'meta', 'words']);
    expect(text.endsWith('}\n')).toBe(true);
    const parsed = parseAyahWords(JSON.parse(text));
    expect(parsed).toEqual(sample);
    expect(serialiseAyahWords(parsed)).toBe(text);
  });

  it('reads the committed Al-Fatihah text: 29 words and 7 markers', () => {
    const text = parseAyahWords(fixture('fatiha-text.json'));
    expect(text.script).toBe('uthmani');
    expect(Object.keys(text.words)).toHaveLength(36);
    expect(text.words['1:1:5']).toBe('١');
    expect(text.words['1:7:10']).toBe('٧');
    expect(parseAyahWords(JSON.parse(serialiseAyahWords(text)))).toEqual(text);
  });

  it('keeps only meta.source', () => {
    expect(parseAyahWords({...sample, meta: {source: 'qul', extra: 1}}).meta).toEqual({source: 'qul'});
  });

  it.each([
    ['a non-object', [], 'expected an object'],
    ['another version', {...sample, version: 2}, 'version is 2'],
    ['a translation file', {...sample, kind: 'ayah'}, 'goes in text.translationFile'],
    ['another kind', {...sample, kind: 'text'}, 'kind is "text"'],
    ['an unknown script', {...sample, script: 'naskh'}, 'script is "naskh"'],
    ['meta without a source', {...sample, meta: {}}, 'meta should be an object {source: string}'],
    ['words not an object', {...sample, words: ['a']}, 'words should be an object'],
    ['no words', {...sample, words: {}}, 'words is empty'],
    ['an ayah key', {...sample, words: {'1:1': 'x'}}, '"1:1" is not a word key'],
    ['a zero position', {...sample, words: {'1:1:0': 'x'}}, '"1:1:0" is not a word key'],
    ['surah 115', {...sample, words: {'115:1:1': 'x'}}, 'names surah 115'],
    ['an empty text', {...sample, words: {'1:1:1': ' '}}, 'the text of "1:1:1"'],
    ['a number as text', {...sample, words: {'1:1:1': 1}}, 'the text of "1:1:1"'],
  ])('refuses %s with BAD_STUDIO_PROP, naming the problem and the format', (_, value, message) => {
    const error = thrown(() => parseAyahWords(value));
    expect(error.code).toBe('BAD_STUDIO_PROP');
    expect(error.message).toContain('Quran text file:');
    expect(error.message).toContain(message);
    expect(error.message).toContain('kind: "quran-text"');
  });
});

describe('ayahWordsOf', () => {
  const text = parseAyahWords(fixture('fatiha-text.json'));

  it('gives an ayah in position order, the marker last as kind end with its digits', () => {
    const words = ayahWordsOf(text, 1, 3);
    expect(words).toEqual([
      {id: '1:3:1', position: 1, text: text.words['1:3:1'], kind: 'word'},
      {id: '1:3:2', position: 2, text: text.words['1:3:2'], kind: 'word'},
      {id: '1:3:3', position: 3, text: '٣', kind: 'end'},
    ]);
    expect(ayahWordsOf(text, 1, 7).map((w) => w.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('does not mix 1:1 with 1:10, and gives [] for an ayah the file does not hold', () => {
    const data: AyahWords = {...sample, words: {'1:1:1': 'a', '1:10:1': 'b', '1:10:2': '١٠'}};
    expect(ayahWordsOf(data, 1, 1).map((w) => w.id)).toEqual(['1:1:1']);
    expect(ayahWordsOf(data, 1, 10).map((w) => [w.text, w.kind])).toEqual([
      ['b', 'word'],
      ['١٠', 'end'],
    ]);
    expect(ayahWordsOf(text, 1, 8)).toEqual([]);
    expect(ayahWordsOf(text, 2, 1)).toEqual([]);
  });

  it('drops a leading U+06DD from the marker, and reads Extended Arabic-Indic digits', () => {
    const data: AyahWords = {...sample, words: {'2:5:1': 'a', '2:5:2': '۝٥', '2:6:1': 'b', '2:6:2': '۶'}};
    expect(ayahWordsOf(data, 2, 5)[1]).toEqual({id: '2:5:2', position: 2, text: '٥', kind: 'end'});
    expect(ayahWordsOf(data, 2, 6)[1]!.kind).toBe('end');
  });

  it('only the last position is a marker, and only when it is a number', () => {
    const data: AyahWords = {...sample, words: {'3:1:1': '١', '3:1:2': 'الٓمٓ'}};
    expect(ayahWordsOf(data, 3, 1).map((w) => w.kind)).toEqual(['word', 'word']);
  });
});

/** quran.com's verses endpoint, answering page 1 and page 2 of the fixture. */
const versesFetch = (answer?: (url: URL) => FakeAnswer | Error) =>
  fakeFetch((url) => {
    if (url.pathname !== '/api/v4/verses/by_chapter/1') return {status: 404, body: {}};
    if (answer) return answer(url);
    const [page1, page2] = pages();
    return {body: url.searchParams.get('page') === '1' ? page1 : page2};
  });

describe('fetchQuranComText', () => {
  it('asks for the words with their Unicode text, follows the pages and keeps the end markers', async () => {
    const {fetch, urls} = versesFetch();
    const text = await fetchQuranComText({chapter: 1, script: 'uthmani'}, {fetch});
    expect(urls.map((u) => u.searchParams.get('page'))).toEqual(['1', '2']);
    expect(urls[0]!.origin + urls[0]!.pathname).toBe(`${API}/verses/by_chapter/1`);
    expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({
      words: 'true',
      word_fields: 'text_uthmani,text_indopak,location,char_type_name',
      per_page: '50',
      page: '1',
    });
    expect(text.version).toBe(1);
    expect(text.kind).toBe('quran-text');
    expect(text.script).toBe('uthmani');
    expect(text.meta).toEqual({source: 'quran.com'});
    expect(Object.keys(text.words)).toHaveLength(17);
    expect(text.words['1:1:1']).toBe('بِسْمِ');
    expect(text.words['1:1:5']).toBe('١');
    expect(text.words['1:4:4']).toBe('٤');
    expect(ayahWordsOf(text, 1, 2).map((w) => w.kind)).toEqual(['word', 'word', 'word', 'word', 'end']);
    expect(parseAyahWords(JSON.parse(serialiseAyahWords(text)))).toEqual(text);
  });

  it('reads text_indopak for the indopak script', async () => {
    const {fetch} = versesFetch();
    const text = await fetchQuranComText({chapter: 1, script: 'indopak'}, {fetch});
    expect(text.script).toBe('indopak');
    expect(text.words['1:1:1']).toBe('بِسۡمِ');
    expect(text.words['1:3:3']).toBe('٣');
  });

  it('passes the range as from/to, keeps only its words and stops paging at its last ayah', async () => {
    const {fetch, urls} = versesFetch();
    const text = await fetchQuranComText({chapter: 1, fromAyah: 2, toAyah: 2, script: 'uthmani'}, {fetch});
    expect(urls).toHaveLength(1);
    expect(urls[0]!.searchParams.get('from')).toBe('2');
    expect(urls[0]!.searchParams.get('to')).toBe('2');
    expect(Object.keys(text.words)).toEqual(['1:2:1', '1:2:2', '1:2:3', '1:2:4', '1:2:5']);
  });

  it('skips characters that are neither words nor markers', async () => {
    const {fetch} = versesFetch(() => ({
      body: {
        verses: [
          {
            verse_number: 1,
            words: [
              {char_type_name: 'word', location: '1:1:1', text_uthmani: 'بِسْمِ'},
              {char_type_name: 'pause', location: '1:1:2', text_uthmani: 'ۖ'},
              {char_type_name: 'end', location: '1:1:3', text_uthmani: '١'},
            ],
          },
        ],
        pagination: {next_page: null},
      },
    }));
    const text = await fetchQuranComText({chapter: 1, script: 'uthmani'}, {fetch});
    expect(text.words).toEqual({'1:1:1': 'بِسْمِ', '1:1:3': '١'});
  });

  it('fails with TRANSLATION_FETCH_FAILED for a word without its text, naming the word and the field', async () => {
    const {fetch} = versesFetch(() => ({
      body: {verses: [{verse_number: 1, words: [{char_type_name: 'word', location: '1:1:1'}]}]},
    }));
    const error = await rejection(fetchQuranComText({chapter: 1, script: 'uthmani'}, {fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain('1:1:1');
    expect(error.message).toContain('text_uthmani');
  });

  it('fails with TRANSLATION_FETCH_FAILED on an empty range, an HTTP error and a malformed answer', async () => {
    const empty = versesFetch(() => ({body: {verses: [], pagination: {next_page: null}}}));
    const none = await rejection(fetchQuranComText({chapter: 1, fromAyah: 3, script: 'uthmani'}, empty));
    expect(none.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(none.message).toContain('no uthmani text for 1:3-end');
    const down = versesFetch(() => ({status: 500, body: {}}));
    const http = await rejection(fetchQuranComText({chapter: 1, script: 'uthmani'}, down));
    expect(http.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(http.message).toContain('HTTP 500');
    const broken = versesFetch(() => ({body: {verses: [{verse_number: 1}]}}));
    expect((await rejection(fetchQuranComText({chapter: 1, script: 'uthmani'}, broken))).code).toBe(
      'TRANSLATION_FETCH_FAILED',
    );
  });

  it('refuses a bad chapter, range or script before asking anything', async () => {
    const {fetch, urls} = versesFetch();
    for (const query of [
      {chapter: 0, script: 'uthmani'},
      {chapter: 115, script: 'uthmani'},
      {chapter: 1, fromAyah: 3, toAyah: 2, script: 'uthmani'},
      {chapter: 1, script: 'naskh'},
    ] as const) {
      expect((await rejection(fetchQuranComText(query as never, {fetch}))).code).toBe('BAD_STUDIO_PROP');
    }
    expect(urls).toHaveLength(0);
  });
});

describe('loadAyahWords', () => {
  it('fetches and parses a text file', async () => {
    const {fetch, urls} = fakeFetch(() => ({body: fixture('fatiha-text.json')}));
    const text = await loadAyahWords('https://studio.test/static/mushaf-studio/fatiha/text-uthmani.json', {fetch});
    expect(urls[0]!.pathname).toBe('/static/mushaf-studio/fatiha/text-uthmani.json');
    expect(Object.keys(text.words)).toHaveLength(36);
  });

  it('prefixes a bad file with its URL (BAD_STUDIO_PROP), and a missing one is TRANSLATION_FETCH_FAILED', async () => {
    const bad = fakeFetch(() => ({body: {version: 1, kind: 'ayah'}}));
    const error = await rejection(loadAyahWords('https://example.test/t.json', {fetch: bad.fetch}));
    expect(error.code).toBe('BAD_STUDIO_PROP');
    expect(error.message.startsWith('https://example.test/t.json: Quran text file:')).toBe(true);
    expect(error.details.url).toBe('https://example.test/t.json');
    const missing = fakeFetch(() => ({status: 404, body: {}}));
    const notFound = await rejection(loadAyahWords('https://example.test/t.json', {fetch: missing.fetch}));
    expect(notFound.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(notFound.message).toContain('Text tab');
  });
});

import {describe, expect, it} from 'vitest';
import {
  type ChapterInfo,
  fetchChapterInfo,
  loadChapterInfo,
  parseChapterInfoFile,
  serialiseChapterInfo,
} from '../../../src/content';
import {API, fakeFetch, fixture, quranCom, rejection, thrown} from './helpers';

const CHAPTER = fixture('quran-com-chapter-1.json');
const INFO = fixture('quran-com-chapter-1-info.json');

const routes = () => quranCom({'/chapters/1': {body: CHAPTER}, '/chapters/1/info': {body: INFO}});

describe('fetchChapterInfo', () => {
  it('reads the chapter and its info in the language asked for, the HTML reduced to paragraphs', async () => {
    const {fetch, urls} = routes();
    const info = await fetchChapterInfo({surah: 1}, {fetch});
    expect(urls.map((u) => u.href).sort()).toEqual([
      `${API}/chapters/1/info?language=en`,
      `${API}/chapters/1?language=en`,
    ]);
    expect(info).toEqual({
      kind: 'chapter-info',
      meta: {
        id: 'quran.com-chapter-info:1',
        name: "Sayyid Abul Ala Maududi - Tafhim al-Qur'an - The Meaning of the Quran",
        language: 'en',
        source: 'quran.com',
      },
      surah: 1,
      nameSimple: 'Al-Fatihah',
      nameArabic: 'الفاتحة',
      translatedName: 'The Opener',
      revelationPlace: 'makkah',
      revelationOrder: 5,
      ayahCount: 7,
      shortText: INFO.chapter_info.short_text,
      paragraphs: [
        'Name',
        'This Surah is named Al-Fatihah because of its subject matter. Fatihah is that which opens a subject or a book or any other thing. In other words, Al-Fatihah is a sort of preface.',
        'Period of Revelation',
        expect.stringMatching(/^Surah Al-Fatihah is one of the very earliest Revelations/),
      ],
    });
  });

  it('passes the language and records the one quran.com answered in', async () => {
    const {fetch, urls} = quranCom({
      '/chapters/1': {body: CHAPTER},
      '/chapters/1/info': {body: {chapter_info: {...INFO.chapter_info, language_name: 'urdu'}}},
    });
    const info = await fetchChapterInfo({surah: 1, language: 'ur'}, {fetch});
    expect(urls.every((u) => u.searchParams.get('language') === 'ur')).toBe(true);
    expect(info.meta.language).toBe('ur');
  });

  it('refuses a surah outside 1-114 before asking anything', async () => {
    const {fetch, urls} = routes();
    for (const surah of [0, 115, 1.5]) {
      expect((await rejection(fetchChapterInfo({surah}, {fetch}))).code).toBe('BAD_STUDIO_PROP');
    }
    expect(urls).toHaveLength(0);
  });

  it('fails with TRANSLATION_FETCH_FAILED for a failed request or an answer without the fields', async () => {
    const down = quranCom({'/chapters/1': {body: CHAPTER}});
    expect((await rejection(fetchChapterInfo({surah: 1}, {fetch: down.fetch}))).details).toMatchObject({status: 404});
    const noChapter = quranCom({'/chapters/1': {body: {chapter: {id: 1}}}, '/chapters/1/info': {body: INFO}});
    const error = await rejection(fetchChapterInfo({surah: 1}, {fetch: noChapter.fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain('name_simple, name_arabic, revelation_place');
    const noInfo = quranCom({'/chapters/1': {body: CHAPTER}, '/chapters/1/info': {body: {chapter_info: {}}}});
    expect((await rejection(fetchChapterInfo({surah: 1}, {fetch: noInfo.fetch}))).message).toContain(
      '{chapter_info: {short_text, text, source}}',
    );
  });
});

const SAMPLE: ChapterInfo = {
  kind: 'chapter-info',
  meta: {id: 'quran.com-chapter-info:1', name: 'Maududi', language: 'en', source: 'quran.com'},
  surah: 1,
  nameSimple: 'Al-Fatihah',
  nameArabic: 'الفاتحة',
  translatedName: 'The Opener',
  revelationPlace: 'makkah',
  revelationOrder: 5,
  ayahCount: 7,
  shortText: 'This Surah is named Al-Fatihah.',
  paragraphs: ['Name', 'This Surah is named Al-Fatihah.'],
};

describe('chapter-info files', () => {
  it('serialises to stable bytes that parse back equal', () => {
    const text = serialiseChapterInfo(SAMPLE);
    expect(
      serialiseChapterInfo({
        ...SAMPLE,
        meta: {source: 'quran.com', language: 'en', name: 'Maududi', id: SAMPLE.meta.id},
      }),
    ).toBe(text);
    expect(Object.keys(JSON.parse(text))).toEqual([
      'version',
      'kind',
      'meta',
      'surah',
      'nameSimple',
      'nameArabic',
      'translatedName',
      'revelationPlace',
      'revelationOrder',
      'ayahCount',
      'shortText',
      'paragraphs',
    ]);
    expect(text.endsWith('\n')).toBe(true);
    expect(parseChapterInfoFile(JSON.parse(text))).toEqual(SAMPLE);
  });

  it('refuses anything but the envelope, naming the field', () => {
    const good = JSON.parse(serialiseChapterInfo(SAMPLE));
    const cases: [unknown, string][] = [
      ['x', 'expected {version: 1, kind: "chapter-info"'],
      [{...good, version: 0}, 'version is 0'],
      [{...good, kind: 'tafsir'}, 'kind should be "chapter-info"'],
      [{...good, surah: 115}, 'surah should be a surah number from 1 to 114'],
      [{...good, revelationPlace: 'mecca'}, 'revelationPlace should be "makkah" or "madinah"'],
      [{...good, ayahCount: 0}, 'ayahCount should be a positive integer'],
      [{...good, paragraphs: 'x'}, 'paragraphs should be an array of strings'],
      [{...good, nameArabic: undefined}, 'nameArabic should be a string'],
      [{...good, meta: {...good.meta, id: undefined}}, 'meta.id should be a string'],
    ];
    for (const [value, message] of cases) {
      const error = thrown(() => parseChapterInfoFile(value));
      expect(error.code).toBe('BAD_TRANSLATION_FILE');
      expect(error.message).toContain(message);
    }
  });

  it('loads a file by URL, prefixing a bad file with the URL', async () => {
    const {fetch} = fakeFetch((url) =>
      url.pathname === '/good.json' ? {text: serialiseChapterInfo(SAMPLE)} : {body: {version: 1}},
    );
    await expect(loadChapterInfo('https://x.test/good.json', {fetch})).resolves.toEqual(SAMPLE);
    const error = await rejection(loadChapterInfo('https://x.test/bad.json', {fetch}));
    expect(error.message).toMatch(/^https:\/\/x\.test\/bad\.json: Chapter info file: kind should be/);
  });
});

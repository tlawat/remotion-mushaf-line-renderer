import {describe, expect, it} from 'vitest';
import {
  fetchQuranComTafsir,
  htmlToParagraphs,
  listQuranComTafsirs,
  loadTafsir,
  parseTafsirFile,
  serialiseTafsir,
  type Tafsir,
  tafsirEntryFor,
  tafsirEntryLabel,
} from '../../../src/content';
import {API, type FakeAnswer, fakeFetch, fixture, quranCom, rejection, thrown} from './helpers';

const RESOURCES = fixture('quran-com-tafsirs.json');
const CHAPTER_2 = fixture('quran-com-tafsir-169-chapter-2.json');
const ROWS: unknown[] = CHAPTER_2.tafsirs;

/** quran.com's chapter-2 rows of tafsir 169 served `size` per page, `next_page` until the rows run out. */
const paged =
  (size: number) =>
  (url: URL): FakeAnswer => {
    const page = Number(url.searchParams.get('page'));
    const rows = ROWS.slice((page - 1) * size, page * size);
    const more = page * size < ROWS.length;
    return {body: {tafsirs: rows, pagination: {per_page: size, current_page: page, next_page: more ? page + 1 : null}}};
  };

const routes = (chapter: FakeAnswer | ((url: URL) => FakeAnswer)) =>
  quranCom({'/resources/tafsirs': {body: RESOURCES}, '/tafsirs/169/by_chapter/2': chapter});

const tafsirUrls = (urls: readonly URL[]) => urls.filter((u) => u.pathname.includes('/tafsirs/169'));

describe('htmlToParagraphs', () => {
  it("splits quran.com's HTML at block ends and keeps headings and Arabic as paragraphs", () => {
    const row = ROWS[4] as {text: string};
    expect(htmlToParagraphs(row.text)).toEqual([
      'Guidance and Success are awarded to the Believers',
      'Allah said,',
      'أُوْلَـئِكَ',
    ]);
  });

  it('drops footnote references, splits at <br>, decodes entities, leaves out empty pieces', () => {
    expect(
      htmlToParagraphs(
        '<p>Lord<sup foot_note="9">1</sup> of all &amp; <b>every</b><br>world</p><p> </p><ul><li>a</li></ul>',
      ),
    ).toEqual(['Lord of all & every', 'world', 'a']);
    expect(htmlToParagraphs('')).toEqual([]);
    expect(htmlToParagraphs('plain text')).toEqual(['plain text']);
  });
});

describe('listQuranComTafsirs', () => {
  it('asks /resources/tafsirs and keeps the language asked for', async () => {
    const {fetch, urls} = routes({status: 500});
    const list = await listQuranComTafsirs({language: 'en'}, {fetch});
    expect(urls.map((u) => u.href)).toEqual([`${API}/resources/tafsirs?language=en`]);
    expect(list).toEqual([
      {
        id: 169,
        name: 'Ibn Kathir (Abridged)',
        authorName: 'Hafiz Ibn Kathir',
        language: 'en',
        languageName: 'english',
      },
      {id: 168, name: "Ma'arif al-Qur'an", authorName: 'Mufti Muhammad Shafi', language: 'en', languageName: 'english'},
    ]);
    expect((await listQuranComTafsirs({language: 'urdu'}, {fetch})).map((t) => t.id)).toEqual([160]);
    expect(await listQuranComTafsirs({}, {fetch})).toHaveLength(7);
  });
});

describe('fetchQuranComTafsir', () => {
  it('reads one page, rebuilds the groups of empty rows and keeps those overlapping the range', async () => {
    const {fetch, urls} = routes({body: CHAPTER_2});
    const tafsir = await fetchQuranComTafsir({tafsirId: 169, surah: 2, fromAyah: 9, toAyah: 12}, {fetch});
    expect(tafsirUrls(urls).map((u) => u.href)).toEqual([`${API}/tafsirs/169/by_chapter/2?per_page=50&page=1`]);
    expect(tafsir.meta).toEqual({
      id: 'quran.com-tafsir:169',
      name: 'Ibn Kathir (Abridged)',
      language: 'en',
      source: 'quran.com',
    });
    expect(tafsir.entries.map((e) => [e.from, e.to])).toEqual([
      ['2:8', '2:9'],
      ['2:10', '2:10'],
      ['2:11', '2:12'],
    ]);
    expect(tafsir.entries[0]!.paragraphs[0]).toBe('Meaning of Nifaq');
    expect(tafsir.entries[2]!.paragraphs).toEqual([
      'Meaning of Mischief',
      'In his Tafsir, As-Suddi said that Ibn `Abbas and Ibn Mas`ud commented,',
      expect.stringContaining('وَإِذَا قِيلَ لَهُمْ'),
    ]);
    for (const entry of tafsir.entries) for (const p of entry.paragraphs) expect(p).not.toMatch(/[<>]/);
  });

  it('follows next_page and stops once the group holding toAyah is closed', async () => {
    const {fetch, urls} = routes(paged(5));
    const tafsir = await fetchQuranComTafsir({tafsirId: 169, surah: 2, fromAyah: 1, toAyah: 11}, {fetch});
    expect(tafsirUrls(urls).map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3']);
    expect(tafsir.entries.map(tafsirEntryLabel)).toEqual([
      '2:1',
      '2:2',
      '2:3',
      '2:4',
      '2:5',
      '2:6',
      '2:7',
      '2:8–9',
      '2:10',
      '2:11–12',
    ]);
  });

  it('reads the whole surah without a range, to the last page', async () => {
    const {fetch, urls} = routes(paged(4));
    const tafsir = await fetchQuranComTafsir({tafsirId: 169, surah: 2}, {fetch});
    expect(tafsirUrls(urls)).toHaveLength(4);
    expect(tafsir.entries).toHaveLength(12);
    expect(tafsir.entries.at(-1)).toMatchObject({from: '2:14', to: '2:14'});
  });

  it('names the tafsir by its id and the language "und" when the resource list fails', async () => {
    const {fetch} = quranCom({
      '/resources/tafsirs': new Error('offline'),
      '/tafsirs/169/by_chapter/2': {body: CHAPTER_2},
    });
    const tafsir = await fetchQuranComTafsir({tafsirId: 169, surah: 2, fromAyah: 13, toAyah: 13}, {fetch});
    expect(tafsir.meta).toMatchObject({name: 'quran.com tafsir 169', language: 'und'});
    expect(tafsir.entries.map(tafsirEntryLabel)).toEqual(['2:13']);
  });

  it('refuses a bad id or range before asking anything', async () => {
    const {fetch, urls} = routes({body: CHAPTER_2});
    for (const query of [
      {tafsirId: 0, surah: 2},
      {tafsirId: 1.5, surah: 2},
      {tafsirId: 169, surah: 115},
      {tafsirId: 169, surah: 2, fromAyah: 5, toAyah: 4},
    ]) {
      const error = await rejection(fetchQuranComTafsir(query, {fetch}));
      expect(error.code).toBe('BAD_STUDIO_PROP');
    }
    expect((await rejection(fetchQuranComTafsir({tafsirId: 0, surah: 2}, {fetch}))).message).toContain(
      'listQuranComTafsirs()',
    );
    expect(urls).toHaveLength(0);
  });

  it('fails with CONTENT_FETCH_FAILED for an unknown tafsir, a range without commentary or a bad shape', async () => {
    const unknown = quranCom({'/resources/tafsirs': {body: RESOURCES}});
    const missing = await rejection(fetchQuranComTafsir({tafsirId: 169, surah: 2}, {fetch: unknown.fetch}));
    expect(missing.code).toBe('CONTENT_FETCH_FAILED');
    expect(missing.details).toMatchObject({status: 404});

    const {fetch} = routes({body: {...CHAPTER_2, pagination: {next_page: null}}});
    const empty = await rejection(fetchQuranComTafsir({tafsirId: 169, surah: 2, fromAyah: 20, toAyah: 25}, {fetch}));
    expect(empty.code).toBe('CONTENT_FETCH_FAILED');
    expect(empty.message).toContain('no commentary of 2:20-25 in tafsir 169');

    const broken = routes({body: {tafsirs: [{verse_key: '2:1'}]}});
    const shape = await rejection(fetchQuranComTafsir({tafsirId: 169, surah: 2}, {fetch: broken.fetch}));
    expect(shape.code).toBe('CONTENT_FETCH_FAILED');
    expect(shape.message).toContain('{tafsirs: [{verse_key, text}]}');
  });

  it('fails naming the page limit rather than cutting the commentary short', async () => {
    const endless = fakeFetch((url) =>
      url.pathname.endsWith('/resources/tafsirs')
        ? {body: RESOURCES}
        : {
            body: {
              tafsirs: [{verse_key: '2:1', text: '<p>x</p>'}],
              pagination: {next_page: Number(url.searchParams.get('page')) + 1},
            },
          },
    );
    const error = await rejection(fetchQuranComTafsir({tafsirId: 169, surah: 2}, {fetch: endless.fetch}));
    expect(error.code).toBe('CONTENT_FETCH_FAILED');
    expect(error.message).toContain('the commentary would be cut short');
    expect(error.details).toMatchObject({chapter: 2, pageLimit: 12});
  });
});

const SAMPLE: Tafsir = {
  kind: 'tafsir',
  meta: {id: 'quran.com-tafsir:169', name: 'Ibn Kathir (Abridged)', language: 'en', source: 'quran.com'},
  entries: [
    {from: '2:11', to: '2:12', paragraphs: ['Meaning of Mischief', 'In his Tafsir...']},
    {from: '2:13', to: '2:13', paragraphs: ['Allah said']},
  ],
};

describe('tafsirEntryFor', () => {
  it('finds the commentary that covers an ayah, or null', () => {
    expect(tafsirEntryFor(SAMPLE, '2:12')).toBe(SAMPLE.entries[0]);
    expect(tafsirEntryFor(SAMPLE, '2:11')).toBe(SAMPLE.entries[0]);
    expect(tafsirEntryFor(SAMPLE, '2:13')).toBe(SAMPLE.entries[1]);
    expect(tafsirEntryFor(SAMPLE, '2:14')).toBeNull();
    expect(tafsirEntryFor(SAMPLE, '3:12')).toBeNull();
    expect(tafsirEntryFor(SAMPLE, null)).toBeNull();
    expect(tafsirEntryFor(SAMPLE, '2:12:1')).toBeNull();
  });
});

describe('tafsir files', () => {
  it('serialises to stable bytes that parse back equal', () => {
    const text = serialiseTafsir({
      ...SAMPLE,
      meta: {source: 'quran.com', language: 'en', name: 'Ibn Kathir (Abridged)', id: 'quran.com-tafsir:169'},
    });
    expect(text).toBe(serialiseTafsir(SAMPLE));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.indexOf('"version"')).toBeLessThan(text.indexOf('"kind"'));
    expect(text.indexOf('"meta"')).toBeLessThan(text.indexOf('"entries"'));
    expect(parseTafsirFile(JSON.parse(text))).toEqual(SAMPLE);
    const licensed = {...SAMPLE, meta: {...SAMPLE.meta, license: 'CC-BY'}};
    expect(parseTafsirFile(JSON.parse(serialiseTafsir(licensed)))).toEqual(licensed);
  });

  it('refuses anything but the envelope, naming what is wrong', () => {
    const good = JSON.parse(serialiseTafsir(SAMPLE));
    const cases: [unknown, string][] = [
      [[], 'expected {version: 1, kind: "tafsir"'],
      [{...good, version: 2}, 'version is 2'],
      [{...good, kind: 'ayah'}, 'kind should be "tafsir"'],
      [{...good, entries: {}}, 'entries should be an array'],
      [{...good, meta: {...good.meta, name: 3}}, 'meta.name should be a string'],
      [{...good, meta: 'x'}, 'meta should be an object'],
      [{...good, entries: ['x']}, 'entries[0] should be an object'],
      [{...good, entries: [{from: '2', to: '2:1', paragraphs: []}]}, 'entries[0].from should be an ayah key'],
      [{...good, entries: [{from: '2:1', to: null, paragraphs: []}]}, 'entries[0].to should be an ayah key'],
      [{...good, entries: [{from: '2:3', to: '2:1', paragraphs: []}]}, 'runs from 2:3 to 2:1'],
      [{...good, entries: [{from: '2:3', to: '3:4', paragraphs: []}]}, 'runs from 2:3 to 3:4'],
      [{...good, entries: [{from: '2:3', to: '2:4', paragraphs: [1]}]}, 'paragraphs should be an array of strings'],
    ];
    for (const [value, message] of cases) {
      const error = thrown(() => parseTafsirFile(value));
      expect(error.code).toBe('BAD_CONTENT_FILE');
      expect(error.message).toContain(message);
    }
  });

  it('loads a file by URL, prefixing a bad file with the URL', async () => {
    const {fetch} = fakeFetch((url) =>
      url.pathname === '/good.json' ? {text: serialiseTafsir(SAMPLE)} : {body: {version: 1, kind: 'x'}},
    );
    await expect(loadTafsir('https://x.test/good.json', {fetch})).resolves.toEqual(SAMPLE);
    const error = await rejection(loadTafsir('https://x.test/bad.json', {fetch}));
    expect(error.code).toBe('BAD_CONTENT_FILE');
    expect(error.message).toMatch(/^https:\/\/x\.test\/bad\.json: Tafsir file: kind should be "tafsir"/);
    expect(error.details).toMatchObject({url: 'https://x.test/bad.json'});
    const missing = fakeFetch(() => ({status: 404, body: {}}));
    const failed = await rejection(loadTafsir('https://x.test/none.json', {fetch: missing.fetch}));
    expect(failed.code).toBe('CONTENT_FETCH_FAILED');
    expect(failed.details).toMatchObject({url: 'https://x.test/none.json', status: 404});
  });
});

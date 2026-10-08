import {describeValue, MushafStudioError} from '../errors';
import type {AyahTranslation, WordGloss} from '../types';
import {fetchJson} from './http';
import {stripFootnotes} from './parse';

/** The open quran.com API, v4 (CORS `*`, no key). */
export const DEFAULT_QURAN_COM_API = 'https://api.quran.com/api/v4';

/** One of quran.com's translation resources (`GET /resources/translations`). */
export type QuranComResource = {
  readonly id: number;
  readonly name: string;
  readonly authorName: string;
  /** ISO 639-1 where quran.com gives one. */
  readonly language: string;
  readonly languageName: string;
};

export type QuranComOptions = {
  readonly api?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly signal?: AbortSignal | undefined;
};

/** What a quran.com failure tells the user to do. */
export const QURAN_COM_HINT =
  'quran.com may be down or the request malformed; try again, or load a translation file from public/.';

/** quran.com names languages in English (`'english'`); the ones its translations come in most, as ISO 639-1. */
const ISO_639_1: Readonly<Record<string, string>> = {
  arabic: 'ar',
  bengali: 'bn',
  chinese: 'zh',
  dutch: 'nl',
  english: 'en',
  french: 'fr',
  german: 'de',
  hindi: 'hi',
  indonesian: 'id',
  italian: 'it',
  japanese: 'ja',
  korean: 'ko',
  malay: 'ms',
  persian: 'fa',
  portuguese: 'pt',
  russian: 'ru',
  spanish: 'es',
  tamil: 'ta',
  turkish: 'tr',
  urdu: 'ur',
};

/** quran.com's English language name (`'english'`) as ISO 639-1 (`'en'`) for the common ones, else the name in lower case (`'und'` for none). */
export const quranComLanguageCode = (languageName: string): string => {
  const name = languageName.trim().toLowerCase();
  return ISO_639_1[name] ?? (name || 'und');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** A quran.com API URL: `options.api` (default `DEFAULT_QURAN_COM_API`), the path, and the defined params. */
export const quranComUrl = (
  options: QuranComOptions,
  path: string,
  params: Record<string, string | number | undefined>,
): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const query = search.toString();
  return `${(options.api ?? DEFAULT_QURAN_COM_API).replace(/\/+$/, '')}${path}${query ? `?${query}` : ''}`;
};

/** Throws the `TRANSLATION_FETCH_FAILED` for an answer in a shape the client does not know. */
export const badQuranComResponse = (url: string, expected: string, found: unknown): never => {
  throw new MushafStudioError(
    'TRANSLATION_FETCH_FAILED',
    `${url} answered in a shape this client does not know: expected ${expected}, found ${describeValue(found)}. ${QURAN_COM_HINT}`,
    {url},
  );
};

/** `body[field]` when it is an array, else a `TRANSLATION_FETCH_FAILED` naming what was found. */
export const quranComArrayField = (body: unknown, field: string, url: string): readonly unknown[] => {
  const value = isRecord(body) ? body[field] : undefined;
  return Array.isArray(value) ? value : badQuranComResponse(url, `{${field}: [...]}`, isRecord(body) ? value : body);
};

/** Checks the chapter and the ayah range a fetcher is asked for, before any request goes out (`BAD_STUDIO_PROP`). */
export const assertQuranComRange = (
  chapter: number,
  fromAyah: number | undefined,
  toAyah: number | undefined,
): void => {
  const bad = (problem: string, value: unknown): never => {
    throw new MushafStudioError('BAD_STUDIO_PROP', `${problem} (got ${describeValue(value)}).`, {
      chapter,
      fromAyah,
      toAyah,
    });
  };
  if (!isPositiveInteger(chapter) || chapter > 114) bad('chapter must be an integer from 1 to 114', chapter);
  if (fromAyah !== undefined && !isPositiveInteger(fromAyah)) bad('fromAyah must be a positive integer', fromAyah);
  if (toAyah !== undefined && !isPositiveInteger(toAyah)) bad('toAyah must be a positive integer', toAyah);
  if (fromAyah !== undefined && toAyah !== undefined && toAyah < fromAyah) {
    bad(`toAyah must not be before fromAyah (${fromAyah})`, toAyah);
  }
};

/** Whether `ayah` is inside `fromAyah`..`toAyah` (an open end is the chapter's). */
export const ayahInRange = (ayah: number, fromAyah: number | undefined, toAyah: number | undefined): boolean =>
  ayah >= (fromAyah ?? 1) && ayah <= (toAyah ?? Number.POSITIVE_INFINITY);

const rangeLabel = (chapter: number, fromAyah: number | undefined, toAyah: number | undefined): string =>
  fromAyah === undefined && toAyah === undefined
    ? `chapter ${chapter}`
    : `${chapter}:${fromAyah ?? 1}-${toAyah ?? 'end'}`;

/**
 * `GET /resources/{kind}` (`'translations'`, `'tafsirs'`), optionally for one language: the rows as
 * `QuranComResource`s, filtered here by `language` (ISO 639-1 for the common languages, or
 * quran.com's own name, `'english'`), since quran.com's `language` parameter only translates the
 * names. What `listQuranComTranslations()` and `listQuranComTafsirs()` share.
 */
export const listQuranComResources = async (
  kind: 'translations' | 'tafsirs',
  query: {readonly language?: string | undefined} = {},
  options: QuranComOptions = {},
): Promise<readonly QuranComResource[]> => {
  const url = quranComUrl(options, `/resources/${kind}`, {language: query.language});
  const rows = quranComArrayField(await fetchJson(url, QURAN_COM_HINT, options), kind, url);
  const fallback = kind === 'translations' ? 'Translation' : 'Tafsir';
  const resources: QuranComResource[] = [];
  for (const row of rows) {
    if (!isRecord(row) || !isPositiveInteger(row.id)) continue;
    const languageName = typeof row.language_name === 'string' ? row.language_name : '';
    resources.push({
      id: row.id,
      name: typeof row.name === 'string' ? row.name : `${fallback} ${row.id}`,
      authorName: typeof row.author_name === 'string' ? row.author_name : '',
      language: quranComLanguageCode(languageName),
      languageName,
    });
  }
  const wanted = query.language?.trim().toLowerCase();
  return wanted ? resources.filter((r) => r.language === wanted || r.languageName.toLowerCase() === wanted) : resources;
};

/**
 * `GET /resources/translations`, optionally for one language (`'en'`, or quran.com's own name,
 * `'english'`). quran.com's `language` parameter only translates the names, so the list is also
 * filtered here. `language` is the ISO 639-1 code for the common languages, else quran.com's name
 * in lower case.
 */
export const listQuranComTranslations = (
  query: {readonly language?: string | undefined} = {},
  options: QuranComOptions = {},
): Promise<readonly QuranComResource[]> => listQuranComResources('translations', query, options);

/**
 * `GET /quran/translations/{resourceId}?chapter_number=...`: an ayah translation for a chapter (or
 * the given ayah range), footnotes stripped, as an `AyahTranslation` with `meta.id` `quran.com:<id>`.
 * The resource list is read alongside for the language (`'und'` when it cannot be). Throws
 * `TRANSLATION_FETCH_FAILED` when the request fails or quran.com has no ayah of the range in that
 * resource (an unknown id answers 200 with nothing).
 */
export const fetchQuranComTranslation = async (
  query: {
    readonly resourceId: number;
    readonly chapter: number;
    readonly fromAyah?: number | undefined;
    readonly toAyah?: number | undefined;
  },
  options: QuranComOptions = {},
): Promise<AyahTranslation> => {
  const {resourceId, chapter, fromAyah, toAyah} = query;
  if (!isPositiveInteger(resourceId)) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `resourceId must be a quran.com translation id, a positive integer (got ${describeValue(resourceId)}); listQuranComTranslations() lists them.`,
      {resourceId},
    );
  }
  assertQuranComRange(chapter, fromAyah, toAyah);
  // verse_key is only in the answer when asked for.
  const url = quranComUrl(options, `/quran/translations/${resourceId}`, {chapter_number: chapter, fields: 'verse_key'});
  const [body, resource] = await Promise.all([
    fetchJson(url, QURAN_COM_HINT, options),
    listQuranComTranslations({}, options).then(
      (list) => list.find((r) => r.id === resourceId),
      () => undefined,
    ),
  ]);
  const rows = quranComArrayField(body, 'translations', url);
  const text: Record<string, string> = {};
  rows.forEach((row, i) => {
    if (!isRecord(row) || typeof row.text !== 'string') {
      badQuranComResponse(url, '{translations: [{text, verse_key}]}', row);
      return;
    }
    // Rows come in ayah order for a chapter, which is the key when verse_key is missing.
    const key = typeof row.verse_key === 'string' ? row.verse_key : `${chapter}:${i + 1}`;
    const [surah, ayah] = key.split(':').map(Number);
    if (surah === chapter && ayah !== undefined && Number.isInteger(ayah) && ayahInRange(ayah, fromAyah, toAyah)) {
      text[`${chapter}:${ayah}`] = stripFootnotes(row.text);
    }
  });
  if (Object.keys(text).length === 0) {
    throw new MushafStudioError(
      'TRANSLATION_FETCH_FAILED',
      `${url} has no ayah of ${rangeLabel(chapter, fromAyah, toAyah)} in translation ${resourceId}: check the resource id (listQuranComTranslations() lists them) and the ayah range.`,
      {url, resourceId, chapter},
    );
  }
  const answered = isRecord(body) && isRecord(body.meta) ? body.meta : {};
  const name =
    typeof answered.translation_name === 'string'
      ? answered.translation_name
      : (resource?.name ?? `quran.com ${resourceId}`);
  return {
    kind: 'ayah',
    meta: {id: `quran.com:${resourceId}`, name, language: resource?.language ?? 'und', source: 'quran.com'},
    text,
  };
};

/** The page size the paginated fetchers ask quran.com for (its maximum). */
export const QURAN_COM_PER_PAGE = 50;
// The longest surah is 286 ayahs, six pages; an API still naming a next page past this never says "last page".
const MAX_PAGES = 12;

/**
 * Reads a paginated quran.com endpoint of one chapter page by page: `url(page)` builds each
 * request, `onPage(rows, url)` receives the page's `field` array and returns `true` once it has
 * read enough. Follows `pagination.next_page`, and stops at an empty page or when none is named. A
 * next page still named after 12 pages (twice the longest surah) is `TRANSLATION_FETCH_FAILED`
 * naming `what` would be cut short, never a partial result; a failed request or a missing `field`
 * is `TRANSLATION_FETCH_FAILED` too. The paging behind `fetchQuranComVerseWords()` and
 * `fetchQuranComTafsir()`.
 */
export const fetchQuranComPages = async (
  query: {
    readonly chapter: number;
    /** What the pages hold, for the page-limit message (`'the words'`). */
    readonly what: string;
    readonly field: string;
    readonly url: (page: number) => string;
  },
  onPage: (rows: readonly unknown[], url: string) => boolean,
  options: QuranComOptions = {},
): Promise<void> => {
  let page = 1;
  for (let read = 1; ; read++) {
    const url = query.url(page);
    const body = await fetchJson(url, QURAN_COM_HINT, options);
    const rows = quranComArrayField(body, query.field, url);
    const enough = onPage(rows, url);
    const next = isRecord(body) && isRecord(body.pagination) ? body.pagination.next_page : null;
    if (enough || rows.length === 0 || typeof next !== 'number' || next <= page) return;
    if (read === MAX_PAGES) {
      throw new MushafStudioError(
        'TRANSLATION_FETCH_FAILED',
        `${url} still names a next page (${next}) after ${MAX_PAGES} pages, the page limit for one chapter (the longest takes ${Math.ceil(286 / QURAN_COM_PER_PAGE)}): ${query.what} would be cut short. ${QURAN_COM_HINT}`,
        {url, chapter: query.chapter, pageLimit: MAX_PAGES},
      );
    }
    page = next;
  }
};

/**
 * `GET /verses/by_chapter/{chapter}?words=true` for a chapter or an ayah range, every page, as the
 * raw word records quran.com answers with (in reading order, ayah-end markers included), keeping
 * only the words of the range: the paging behind `fetchQuranComWordGloss()`, for fetchers that read
 * other word fields (`fetchQuranComText()` reads `text_uthmani` / `text_indopak`). Asks for
 * `wordFields` plus `location` and `char_type_name`, which the paging needs, and passes `language`
 * (the language of the words' `translation` and `transliteration`) when given. Follows
 * `pagination.next_page`; quran.com's `from`/`to` narrow the verses but not its page count, so
 * paging also stops at the range's last ayah or an empty page. Checks the chapter and the range
 * first (`BAD_STUDIO_PROP`); a failed request, a verse without `words`, or a next page still named
 * after 12 pages (twice the longest surah) is `TRANSLATION_FETCH_FAILED`, never a result cut
 * short. An empty result is not an error here: the caller names what it missed.
 */
export const fetchQuranComVerseWords = async (
  query: {
    readonly chapter: number;
    /** quran.com's `word_fields`, e.g. `['text_uthmani']`. */
    readonly wordFields: readonly string[];
    readonly fromAyah?: number | undefined;
    readonly toAyah?: number | undefined;
    /** quran.com's language code for the words' `translation` and `transliteration`; default quran.com's own. */
    readonly language?: string | undefined;
  },
  options: QuranComOptions = {},
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
  const {chapter, fromAyah, toAyah, language} = query;
  assertQuranComRange(chapter, fromAyah, toAyah);
  const fields = [...new Set([...query.wordFields, 'location', 'char_type_name'])].join(',');
  const words: Readonly<Record<string, unknown>>[] = [];
  await fetchQuranComPages(
    {
      chapter,
      what: 'the words',
      field: 'verses',
      url: (page) =>
        quranComUrl(options, `/verses/by_chapter/${chapter}`, {
          words: 'true',
          language,
          word_fields: fields,
          per_page: QURAN_COM_PER_PAGE,
          page,
          from: fromAyah,
          to: toAyah,
        }),
    },
    (verses, url) => {
      let lastAyah = 0;
      for (const verse of verses) {
        if (!isRecord(verse) || !Array.isArray(verse.words)) {
          badQuranComResponse(url, '{verses: [{verse_number, words: [...]}]}', verse);
          continue;
        }
        for (const word of verse.words as unknown[]) {
          if (!isRecord(word) || typeof word.location !== 'string') continue;
          const [surah, ayah] = word.location.split(':').map(Number);
          if (surah !== chapter || ayah === undefined) continue;
          lastAyah = Math.max(lastAyah, ayah);
          if (ayahInRange(ayah, fromAyah, toAyah)) words.push(word);
        }
      }
      return toAyah !== undefined && lastAyah >= toAyah;
    },
    options,
  );
  return words;
};

/**
 * `GET /verses/by_chapter/{chapter}?words=true&language=...`: the per-word translation or
 * transliteration of a chapter (or an ayah range) as a `WordGloss`, keyed by `location`, with the
 * ayah-end markers left out. Built on `fetchQuranComVerseWords()`: the same paging, range and
 * errors, and `TRANSLATION_FETCH_FAILED` when no word of the range has a gloss.
 */
export const fetchQuranComWordGloss = async (
  query: {
    readonly chapter: number;
    readonly field: 'translation' | 'transliteration';
    /** quran.com's language code, default `'en'`. */
    readonly language?: string | undefined;
    readonly fromAyah?: number | undefined;
    readonly toAyah?: number | undefined;
  },
  options: QuranComOptions = {},
): Promise<WordGloss> => {
  const {chapter, field, fromAyah, toAyah} = query;
  const language = query.language ?? 'en';
  const records = await fetchQuranComVerseWords({chapter, fromAyah, toAyah, language, wordFields: []}, options);
  const words: Record<string, string> = {};
  for (const word of records) {
    if (word.char_type_name !== 'word') continue;
    const gloss = word[field];
    const text = isRecord(gloss) && typeof gloss.text === 'string' ? stripFootnotes(gloss.text) : '';
    if (text) words[word.location as string] = text;
  }
  if (Object.keys(words).length === 0) {
    throw new MushafStudioError(
      'TRANSLATION_FETCH_FAILED',
      `quran.com has no word ${field} in "${language}" for ${rangeLabel(chapter, fromAyah, toAyah)}: check the language code and the ayah range.`,
      {chapter, field, language},
    );
  }
  return {
    kind: 'word',
    meta: {
      id: `quran.com:wbw-${field}-${language}`,
      name: field === 'translation' ? `quran.com word by word (${language})` : 'quran.com transliteration',
      language,
      source: 'quran.com',
    },
    words,
  };
};

/** "1:2-7", or "chapter 1" for a whole chapter: how the fetchers name a range in their messages. */
export const quranComRangeLabel = (chapter: number, fromAyah: number | undefined, toAyah: number | undefined): string =>
  rangeLabel(chapter, fromAyah, toAyah);

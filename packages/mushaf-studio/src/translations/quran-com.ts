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

const HINT = 'quran.com may be down or the request malformed; try again, or load a translation file from public/.';

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

const languageCode = (languageName: string): string => {
  const name = languageName.trim().toLowerCase();
  return ISO_639_1[name] ?? (name || 'und');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const endpoint = (
  options: QuranComOptions,
  path: string,
  params: Record<string, string | number | undefined>,
): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const query = search.toString();
  return `${(options.api ?? DEFAULT_QURAN_COM_API).replace(/\/+$/, '')}${path}${query ? `?${query}` : ''}`;
};

const badResponse = (url: string, expected: string, found: unknown): never => {
  throw new MushafStudioError(
    'TRANSLATION_FETCH_FAILED',
    `${url} answered in a shape this client does not know: expected ${expected}, found ${describeValue(found)}. ${HINT}`,
    {url},
  );
};

const arrayField = (body: unknown, field: string, url: string): readonly unknown[] => {
  const value = isRecord(body) ? body[field] : undefined;
  return Array.isArray(value) ? value : badResponse(url, `{${field}: [...]}`, isRecord(body) ? value : body);
};

/** Checks the chapter and the ayah range a fetcher is asked for, before any request goes out. */
const assertRange = (chapter: number, fromAyah: number | undefined, toAyah: number | undefined): void => {
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

const inRange = (ayah: number, fromAyah: number | undefined, toAyah: number | undefined): boolean =>
  ayah >= (fromAyah ?? 1) && ayah <= (toAyah ?? Number.POSITIVE_INFINITY);

const rangeLabel = (chapter: number, fromAyah: number | undefined, toAyah: number | undefined): string =>
  fromAyah === undefined && toAyah === undefined
    ? `chapter ${chapter}`
    : `${chapter}:${fromAyah ?? 1}-${toAyah ?? 'end'}`;

/**
 * `GET /resources/translations`, optionally for one language (`'en'`, or quran.com's own name,
 * `'english'`). quran.com's `language` parameter only translates the names, so the list is also
 * filtered here. `language` is the ISO 639-1 code for the common languages, else quran.com's name
 * in lower case.
 */
export const listQuranComTranslations = async (
  query: {readonly language?: string | undefined} = {},
  options: QuranComOptions = {},
): Promise<readonly QuranComResource[]> => {
  const url = endpoint(options, '/resources/translations', {language: query.language});
  const rows = arrayField(await fetchJson(url, HINT, options), 'translations', url);
  const resources: QuranComResource[] = [];
  for (const row of rows) {
    if (!isRecord(row) || !isPositiveInteger(row.id)) continue;
    const languageName = typeof row.language_name === 'string' ? row.language_name : '';
    resources.push({
      id: row.id,
      name: typeof row.name === 'string' ? row.name : `Translation ${row.id}`,
      authorName: typeof row.author_name === 'string' ? row.author_name : '',
      language: languageCode(languageName),
      languageName,
    });
  }
  const wanted = query.language?.trim().toLowerCase();
  return wanted ? resources.filter((r) => r.language === wanted || r.languageName.toLowerCase() === wanted) : resources;
};

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
  assertRange(chapter, fromAyah, toAyah);
  // verse_key is only in the answer when asked for.
  const url = endpoint(options, `/quran/translations/${resourceId}`, {chapter_number: chapter, fields: 'verse_key'});
  const [body, resource] = await Promise.all([
    fetchJson(url, HINT, options),
    listQuranComTranslations({}, options).then(
      (list) => list.find((r) => r.id === resourceId),
      () => undefined,
    ),
  ]);
  const rows = arrayField(body, 'translations', url);
  const text: Record<string, string> = {};
  rows.forEach((row, i) => {
    if (!isRecord(row) || typeof row.text !== 'string') {
      badResponse(url, '{translations: [{text, verse_key}]}', row);
      return;
    }
    // Rows come in ayah order for a chapter, which is the key when verse_key is missing.
    const key = typeof row.verse_key === 'string' ? row.verse_key : `${chapter}:${i + 1}`;
    const [surah, ayah] = key.split(':').map(Number);
    if (surah === chapter && ayah !== undefined && Number.isInteger(ayah) && inRange(ayah, fromAyah, toAyah)) {
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

const PER_PAGE = 50;
// The longest surah is 286 ayahs, six pages; anything past this is an API that never says "last page".
const MAX_PAGES = 12;

/**
 * `GET /verses/by_chapter/{chapter}?words=true&language=...`: the per-word translation or
 * transliteration of a chapter (or an ayah range) as a `WordGloss`, keyed by `location`, with the
 * ayah-end markers left out. Follows `pagination.next_page`; quran.com's `from`/`to` narrow the
 * verses but not its page count, so paging also stops at the range's last ayah or an empty page.
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
  assertRange(chapter, fromAyah, toAyah);
  const words: Record<string, string> = {};
  for (let page = 1; page <= MAX_PAGES; ) {
    const url = endpoint(options, `/verses/by_chapter/${chapter}`, {
      words: 'true',
      language,
      word_fields: 'location',
      per_page: PER_PAGE,
      page,
      from: fromAyah,
      to: toAyah,
    });
    const body = await fetchJson(url, HINT, options);
    const verses = arrayField(body, 'verses', url);
    let lastAyah = 0;
    for (const verse of verses) {
      if (!isRecord(verse) || !Array.isArray(verse.words)) {
        badResponse(url, '{verses: [{verse_number, words: [...]}]}', verse);
        continue;
      }
      for (const word of verse.words as unknown[]) {
        if (!isRecord(word) || word.char_type_name !== 'word' || typeof word.location !== 'string') continue;
        const [surah, ayah] = word.location.split(':').map(Number);
        if (surah !== chapter || ayah === undefined) continue;
        lastAyah = Math.max(lastAyah, ayah);
        const gloss = word[field];
        const text = isRecord(gloss) && typeof gloss.text === 'string' ? stripFootnotes(gloss.text) : '';
        if (text && inRange(ayah, fromAyah, toAyah)) words[word.location] = text;
      }
    }
    const next = isRecord(body) && isRecord(body.pagination) ? body.pagination.next_page : null;
    const done = verses.length === 0 || (toAyah !== undefined && lastAyah >= toAyah);
    if (done || typeof next !== 'number' || next <= page) break;
    page = next;
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

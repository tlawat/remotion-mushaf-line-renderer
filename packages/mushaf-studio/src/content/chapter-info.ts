import {describeValue, isMushafStudioError, MushafStudioError} from '../errors';
import {fetchJson} from '../translations/http';
import {stripFootnotes} from '../translations/parse';
import {
  assertQuranComRange,
  badQuranComResponse,
  QURAN_COM_HINT,
  type QuranComOptions,
  quranComLanguageCode,
  quranComUrl,
} from '../translations/quran-com';
import type {TranslationMeta} from '../types';
import {htmlToParagraphs} from './html';
import {orderedMeta, parseContentMeta} from './tafsir';

/** Where a surah was revealed, as quran.com spells it. */
export type RevelationPlace = 'makkah' | 'madinah';

/**
 * A surah's card data: its names, where and in which order it was revealed, its length, and an
 * introduction (quran.com's chapter info) as plain text. `meta.name` is the introduction's source.
 */
export type ChapterInfo = {
  readonly kind: 'chapter-info';
  readonly meta: TranslationMeta;
  readonly surah: number;
  /** "Al-Fatihah". */
  readonly nameSimple: string;
  /** "الفاتحة". */
  readonly nameArabic: string;
  /** "The Opener", in the language asked for. */
  readonly translatedName: string;
  readonly revelationPlace: RevelationPlace;
  /** 1 for the first surah revealed (Al-'Alaq), 114 for the last. */
  readonly revelationOrder: number;
  readonly ayahCount: number;
  /** A few sentences: quran.com's `short_text`. */
  readonly shortText: string;
  /** The whole introduction, one string per paragraph (its headings included). */
  readonly paragraphs: readonly string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const isPlace = (value: unknown): value is RevelationPlace => value === 'makkah' || value === 'madinah';

/**
 * `GET /chapters/{surah}` and `GET /chapters/{surah}/info?language=...` (default `'en'`): the
 * surah's names, revelation place and order, ayah count and introduction, the introduction's HTML
 * reduced to plain paragraphs, as a `ChapterInfo` with `meta.id` `quran.com-chapter-info:<surah>`.
 * quran.com answers a language it has no introduction in with its English one; `meta.language`
 * says which came. Checks the surah first (`BAD_STUDIO_PROP`); a failed request or an answer
 * without these fields is `TRANSLATION_FETCH_FAILED`.
 */
export const fetchChapterInfo = async (
  query: {readonly surah: number; readonly language?: string | undefined},
  options: QuranComOptions = {},
): Promise<ChapterInfo> => {
  const {surah} = query;
  assertQuranComRange(surah, undefined, undefined);
  const language = query.language ?? 'en';
  const chapterUrl = quranComUrl(options, `/chapters/${surah}`, {language});
  const infoUrl = quranComUrl(options, `/chapters/${surah}/info`, {language});
  const [chapterBody, infoBody] = await Promise.all([
    fetchJson(chapterUrl, QURAN_COM_HINT, options),
    fetchJson(infoUrl, QURAN_COM_HINT, options),
  ]);
  const chapter = isRecord(chapterBody) ? chapterBody.chapter : undefined;
  if (
    !isRecord(chapter) ||
    typeof chapter.name_simple !== 'string' ||
    typeof chapter.name_arabic !== 'string' ||
    !isPlace(chapter.revelation_place) ||
    !isPositiveInteger(chapter.revelation_order) ||
    !isPositiveInteger(chapter.verses_count)
  ) {
    return badQuranComResponse(
      chapterUrl,
      '{chapter: {name_simple, name_arabic, revelation_place, revelation_order, verses_count}}',
      chapter ?? chapterBody,
    );
  }
  const info = isRecord(infoBody) ? infoBody.chapter_info : undefined;
  if (!isRecord(info) || typeof info.short_text !== 'string' || typeof info.text !== 'string') {
    return badQuranComResponse(infoUrl, '{chapter_info: {short_text, text, source}}', info ?? infoBody);
  }
  const translated = isRecord(chapter.translated_name) ? chapter.translated_name.name : undefined;
  return {
    kind: 'chapter-info',
    meta: {
      id: `quran.com-chapter-info:${surah}`,
      name: typeof info.source === 'string' && info.source.trim() ? info.source.trim() : 'quran.com',
      language: typeof info.language_name === 'string' ? quranComLanguageCode(info.language_name) : language,
      source: 'quran.com',
    },
    surah,
    nameSimple: chapter.name_simple,
    nameArabic: chapter.name_arabic,
    translatedName: typeof translated === 'string' ? translated : chapter.name_simple,
    revelationPlace: chapter.revelation_place,
    revelationOrder: chapter.revelation_order,
    ayahCount: chapter.verses_count,
    shortText: stripFootnotes(info.short_text),
    paragraphs: htmlToParagraphs(info.text),
  };
};

// ---------------------------------------------------------------------------------------------
// Files

const fail = (problem: string, details: Readonly<Record<string, unknown>> = {}): never => {
  throw new MushafStudioError('BAD_TRANSLATION_FILE', `Chapter info file: ${problem}`, details);
};

const field = <T>(value: Record<string, unknown>, name: string, test: (v: unknown) => v is T, what: string): T => {
  const v = value[name];
  return test(v) ? v : fail(`${name} should be ${what}; found ${describeValue(v)}.`, {field: name});
};

const isString = (v: unknown): v is string => typeof v === 'string';
const isSurah = (v: unknown): v is number => isPositiveInteger(v) && v <= 114;
const isOrder = isSurah;
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/**
 * Reads the chapter-info envelope `serialiseChapterInfo()` writes (`{version: 1, kind:
 * 'chapter-info', meta, surah, ...}`). Throws `BAD_TRANSLATION_FILE` naming the field that is
 * missing or wrong.
 */
export const parseChapterInfoFile = (value: unknown): ChapterInfo => {
  if (!isRecord(value)) {
    return fail(`expected {version: 1, kind: "chapter-info", meta, surah, ...}; found ${describeValue(value)}.`);
  }
  if (value.version !== 1) {
    return fail(
      `version is ${describeValue(value.version)} but this version of @tlawat/mushaf-studio reads version 1. Fetch the chapter info again, or upgrade the package.`,
    );
  }
  if (value.kind !== 'chapter-info') return fail(`kind should be "chapter-info"; found ${describeValue(value.kind)}.`);
  return {
    kind: 'chapter-info',
    meta: parseContentMeta(value.meta, 'Chapter info file'),
    surah: field(value, 'surah', isSurah, 'a surah number from 1 to 114'),
    nameSimple: field(value, 'nameSimple', isString, 'a string'),
    nameArabic: field(value, 'nameArabic', isString, 'a string'),
    translatedName: field(value, 'translatedName', isString, 'a string'),
    revelationPlace: field(value, 'revelationPlace', isPlace, '"makkah" or "madinah"'),
    revelationOrder: field(value, 'revelationOrder', isOrder, 'an integer from 1 to 114'),
    ayahCount: field(value, 'ayahCount', isPositiveInteger, 'a positive integer'),
    shortText: field(value, 'shortText', isString, 'a string'),
    paragraphs: field(value, 'paragraphs', isStrings, 'an array of strings'),
  };
};

/**
 * The chapter-info envelope as JSON text, for `writeStaticFile()`: a fixed key order, a final
 * newline. Stable: the same info always gives the same bytes, and `parseChapterInfoFile()` reads it
 * back equal.
 */
export const serialiseChapterInfo = (info: ChapterInfo): string => {
  const envelope = {
    version: 1,
    kind: 'chapter-info',
    meta: orderedMeta(info.meta),
    surah: info.surah,
    nameSimple: info.nameSimple,
    nameArabic: info.nameArabic,
    translatedName: info.translatedName,
    revelationPlace: info.revelationPlace,
    revelationOrder: info.revelationOrder,
    ayahCount: info.ayahCount,
    shortText: info.shortText,
    paragraphs: info.paragraphs,
  };
  return `${JSON.stringify(envelope, null, 1)}\n`;
};

/**
 * Fetches and parses a chapter-info file (a `staticFile()` URL or any URL). For
 * `calculateMetadata()`. A failed request is `TRANSLATION_FETCH_FAILED`; a file that is not the
 * envelope is `BAD_TRANSLATION_FILE`, its message prefixed with the URL.
 */
export const loadChapterInfo = async (
  url: string,
  options: {readonly fetch?: typeof fetch | undefined} = {},
): Promise<ChapterInfo> => {
  const body = await fetchJson(
    url,
    'Check that the file exists (in public/ for a staticFile() path) and that the path in the props is right.',
    options,
  );
  try {
    return parseChapterInfoFile(body);
  } catch (error) {
    if (isMushafStudioError(error) && error.code === 'BAD_TRANSLATION_FILE') {
      throw new MushafStudioError('BAD_TRANSLATION_FILE', `${url}: ${error.message}`, {...error.details, url});
    }
    throw error;
  }
};

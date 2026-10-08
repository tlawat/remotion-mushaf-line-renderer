import {describeValue, isMushafStudioError, MushafStudioError} from '../errors';
import {fetchJson} from '../translations/http';
import {
  assertQuranComRange,
  badQuranComResponse,
  fetchQuranComPages,
  listQuranComResources,
  QURAN_COM_PER_PAGE,
  type QuranComOptions,
  type QuranComResource,
  quranComRangeLabel,
  quranComUrl,
} from '../translations/quran-com';
import type {TranslationMeta} from '../types';
import {withContentErrors} from './content-errors';
import {htmlToParagraphs} from './html';

/**
 * One commentary of a tafsir: the ayahs it covers (`from` and `to` are equal for one ayah; a
 * tafsir often explains a few ayahs together) and its plain text, one string per paragraph.
 */
export type TafsirEntry = {
  /** `"surah:ayah"` of the first ayah covered. */
  readonly from: string;
  /** `"surah:ayah"` of the last ayah covered, in the same surah. */
  readonly to: string;
  readonly paragraphs: readonly string[];
};

/** A tafsir for a range of ayahs: who wrote it (`meta`, as for a translation) and its commentaries in order. */
export type Tafsir = {
  readonly kind: 'tafsir';
  readonly meta: TranslationMeta;
  readonly entries: readonly TafsirEntry[];
};

const AYAH_KEY = /^([1-9]\d*):([1-9]\d*)$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ayahOf = (key: string): readonly [surah: number, ayah: number] | null => {
  const match = AYAH_KEY.exec(key);
  return match ? [Number(match[1]), Number(match[2])] : null;
};

/**
 * The commentary that covers an ayah (`"2:12"` finds the entry `2:11`-`2:12`), or `null` when the
 * tafsir has none for it. Pure.
 */
export const tafsirEntryFor = (tafsir: Tafsir, ayahKey: string | null): TafsirEntry | null => {
  const key = ayahKey === null ? null : ayahOf(ayahKey);
  if (!key) return null;
  const [surah, ayah] = key;
  for (const entry of tafsir.entries) {
    const from = ayahOf(entry.from);
    const to = ayahOf(entry.to);
    if (from && to && from[0] === surah && ayah >= from[1] && ayah <= to[1]) return entry;
  }
  return null;
};

/** "2:11–12" for an entry covering several ayahs, "2:11" for one. */
export const tafsirEntryLabel = (entry: TafsirEntry): string =>
  entry.from === entry.to ? entry.from : `${entry.from}–${entry.to.split(':')[1]}`;

// ---------------------------------------------------------------------------------------------
// quran.com

/**
 * `GET /resources/tafsirs`, optionally for one language (`'en'`, or quran.com's own name,
 * `'english'`): the tafsirs quran.com serves, as `QuranComResource`s (the same shape as its
 * translations; filtered here, since quran.com's `language` only translates the names).
 */
export const listQuranComTafsirs = (
  query: {readonly language?: string | undefined} = {},
  options: QuranComOptions = {},
): Promise<readonly QuranComResource[]> => withContentErrors(() => listQuranComResources('tafsirs', query, options));

/**
 * `GET /tafsirs/{tafsirId}/by_chapter/{surah}`, page by page: the tafsir's commentaries of the
 * ayahs `fromAyah`..`toAyah` (default the whole surah), their HTML reduced to plain paragraphs
 * (`htmlToParagraphs()`), as a `Tafsir` with `meta.id` `quran.com-tafsir:<id>`.
 *
 * quran.com lists every ayah, and an ayah whose text is empty is explained together with the ayah
 * before it (its `by_ayah` route answers `2:12` with the text of `2:11` and `verses: {2:11, 2:12}`),
 * so the entries are rebuilt as such groups: an entry is kept when it overlaps the range, whole,
 * and paging stops once the group holding `toAyah` is closed. The resource list is read alongside
 * for the language (`'und'` when it cannot be). Checks the id and the range first
 * (`BAD_STUDIO_PROP`); a failed request or an unknown tafsir is `CONTENT_FETCH_FAILED`, and so
 * is a range with no commentary.
 */
export const fetchQuranComTafsir = async (
  query: {
    readonly tafsirId: number;
    readonly surah: number;
    readonly fromAyah?: number | undefined;
    readonly toAyah?: number | undefined;
  },
  options: QuranComOptions = {},
): Promise<Tafsir> => {
  const {tafsirId, surah, fromAyah, toAyah} = query;
  if (typeof tafsirId !== 'number' || !Number.isInteger(tafsirId) || tafsirId < 1) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `tafsirId must be a quran.com tafsir id, a positive integer (got ${describeValue(tafsirId)}); listQuranComTafsirs() lists them.`,
      {tafsirId},
    );
  }
  assertQuranComRange(surah, fromAyah, toAyah);
  const first = fromAyah ?? 1;
  const last = toAyah ?? Number.POSITIVE_INFINITY;

  // Groups in reading order; the last is open: it takes the empty rows that follow it.
  const groups: {from: number; to: number; paragraphs: readonly string[]}[] = [];
  const resource = listQuranComTafsirs({}, options).then(
    (list) => list.find((r) => r.id === tafsirId),
    () => undefined,
  );
  // A failed page, or a row in a shape the client does not know, is CONTENT_FETCH_FAILED.
  await withContentErrors(() =>
    fetchQuranComPages(
      {
        chapter: surah,
        what: 'the commentary',
        field: 'tafsirs',
        url: (page) =>
          quranComUrl(options, `/tafsirs/${tafsirId}/by_chapter/${surah}`, {per_page: QURAN_COM_PER_PAGE, page}),
      },
      (rows, url) => {
        for (const row of rows) {
          if (!isRecord(row) || typeof row.verse_key !== 'string' || typeof row.text !== 'string') {
            badQuranComResponse(url, '{tafsirs: [{verse_key, text}]}', row);
            continue;
          }
          const key = ayahOf(row.verse_key);
          if (!key || key[0] !== surah) continue;
          const ayah = key[1];
          const paragraphs = htmlToParagraphs(row.text);
          const open = groups[groups.length - 1];
          if (paragraphs.length === 0) {
            if (open) open.to = ayah;
            continue;
          }
          // A new commentary closes the open group: once that group ends at or after `toAyah`, the range is read.
          if (open && open.to >= last) return true;
          groups.push({from: ayah, to: ayah, paragraphs});
        }
        return false;
      },
      options,
    ),
  );
  const entries: TafsirEntry[] = groups
    .filter((group) => group.to >= first && group.from <= last)
    .map((group) => ({from: `${surah}:${group.from}`, to: `${surah}:${group.to}`, paragraphs: group.paragraphs}));
  if (entries.length === 0) {
    throw new MushafStudioError(
      'CONTENT_FETCH_FAILED',
      `quran.com has no commentary of ${quranComRangeLabel(surah, fromAyah, toAyah)} in tafsir ${tafsirId}: check the tafsir id (listQuranComTafsirs() lists them) and the ayah range.`,
      {tafsirId, surah, fromAyah, toAyah},
    );
  }
  const listed = await resource;
  return {
    kind: 'tafsir',
    meta: {
      id: `quran.com-tafsir:${tafsirId}`,
      name: listed?.name ?? `quran.com tafsir ${tafsirId}`,
      language: listed?.language ?? 'und',
      source: 'quran.com',
    },
    entries,
  };
};

// ---------------------------------------------------------------------------------------------
// Files

const fail = (problem: string, details: Readonly<Record<string, unknown>> = {}): never => {
  throw new MushafStudioError('BAD_CONTENT_FILE', `Tafsir file: ${problem}`, details);
};

const META_FIELDS = ['id', 'name', 'language', 'source', 'license'] as const;

/** The envelope's `meta`, checked: `id`, `name`, `language` and `source` strings, `license` optional. */
export const parseContentMeta = (value: unknown, where: string): TranslationMeta => {
  if (!isRecord(value)) {
    throw new MushafStudioError(
      'BAD_CONTENT_FILE',
      `${where}: meta should be an object {id, name, language, source}; found ${describeValue(value)}.`,
    );
  }
  const meta: Record<string, string> = {};
  for (const field of META_FIELDS) {
    const v = value[field];
    if (v === undefined && field === 'license') continue;
    if (typeof v !== 'string') {
      throw new MushafStudioError(
        'BAD_CONTENT_FILE',
        `${where}: meta.${field} should be a string; found ${describeValue(v)}.`,
        {field},
      );
    }
    meta[field] = v;
  }
  const {id, name, language, source, license} = meta as TranslationMeta;
  return license === undefined ? {id, name, language, source} : {id, name, language, source, license};
};

/** `meta` with its keys in the fixed order, `license` only when set: for stable files. */
export const orderedMeta = (meta: TranslationMeta): TranslationMeta => {
  const {id, name, language, source, license} = meta;
  return license === undefined ? {id, name, language, source} : {id, name, language, source, license};
};

const parseEntry = (value: unknown, index: number): TafsirEntry => {
  const at = `entries[${index}]`;
  if (!isRecord(value)) return fail(`${at} should be an object {from, to, paragraphs}; found ${describeValue(value)}.`);
  const {from, to, paragraphs} = value;
  const start = typeof from === 'string' ? ayahOf(from) : null;
  const end = typeof to === 'string' ? ayahOf(to) : null;
  if (!start) return fail(`${at}.from should be an ayah key like "2:11"; found ${describeValue(from)}.`, {index});
  if (!end) return fail(`${at}.to should be an ayah key like "2:12"; found ${describeValue(to)}.`, {index});
  if (start[0] !== end[0] || end[1] < start[1]) {
    return fail(`${at} runs from ${from as string} to ${to as string}; an entry covers ayahs of one surah, in order.`, {
      index,
    });
  }
  if (!Array.isArray(paragraphs) || paragraphs.some((p) => typeof p !== 'string')) {
    return fail(`${at}.paragraphs should be an array of strings; found ${describeValue(paragraphs)}.`, {index});
  }
  return {from: from as string, to: to as string, paragraphs: paragraphs as string[]};
};

/**
 * Reads the tafsir envelope `serialiseTafsir()` writes (`{version: 1, kind: 'tafsir', meta,
 * entries: [{from, to, paragraphs}]}`). Throws `BAD_CONTENT_FILE` naming what is wrong: another
 * version or kind, a meta field that is not a string, an entry that is not an ayah range of one
 * surah, paragraphs that are not strings.
 */
export const parseTafsirFile = (value: unknown): Tafsir => {
  if (!isRecord(value))
    return fail(`expected {version: 1, kind: "tafsir", meta, entries}; found ${describeValue(value)}.`);
  if (value.version !== 1) {
    return fail(
      `version is ${describeValue(value.version)} but this version of @tlawat/mushaf-studio reads version 1. Fetch the tafsir again, or upgrade the package.`,
    );
  }
  if (value.kind !== 'tafsir') return fail(`kind should be "tafsir"; found ${describeValue(value.kind)}.`);
  if (!Array.isArray(value.entries)) return fail(`entries should be an array; found ${describeValue(value.entries)}.`);
  return {
    kind: 'tafsir',
    meta: parseContentMeta(value.meta, 'Tafsir file'),
    entries: value.entries.map(parseEntry),
  };
};

/**
 * The tafsir envelope as JSON text, for `writeStaticFile()`: a fixed key order (version, kind,
 * meta, entries), the entries in the order given, a final newline. Stable: the same tafsir always
 * gives the same bytes, and `parseTafsirFile()` reads it back equal.
 */
export const serialiseTafsir = (tafsir: Tafsir): string => {
  const envelope = {
    version: 1,
    kind: 'tafsir',
    meta: orderedMeta(tafsir.meta),
    entries: tafsir.entries.map(({from, to, paragraphs}) => ({from, to, paragraphs})),
  };
  return `${JSON.stringify(envelope, null, 1)}\n`;
};

/**
 * Fetches and parses a tafsir file (a `staticFile()` URL or any URL). For `calculateMetadata()`.
 * A failed request is `CONTENT_FETCH_FAILED`; a file that is not the envelope is
 * `BAD_CONTENT_FILE`, its message prefixed with the URL.
 */
export const loadTafsir = async (
  url: string,
  options: {readonly fetch?: typeof fetch | undefined} = {},
): Promise<Tafsir> => {
  const body = await withContentErrors(() =>
    fetchJson(
      url,
      'Check that the file exists (in public/ for a staticFile() path) and that the path in the props is right.',
      options,
    ),
  );
  try {
    return parseTafsirFile(body);
  } catch (error) {
    if (isMushafStudioError(error) && error.code === 'BAD_CONTENT_FILE') {
      throw new MushafStudioError('BAD_CONTENT_FILE', `${url}: ${error.message}`, {...error.details, url});
    }
    throw error;
  }
};

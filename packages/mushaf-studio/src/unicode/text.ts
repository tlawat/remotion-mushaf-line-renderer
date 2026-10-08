import {describeValue, isMushafStudioError, MushafStudioError} from '../errors';
import {fetchJson} from '../translations/http';
import {fetchQuranComVerseWords, type QuranComOptions, quranComRangeLabel} from '../translations/quran-com';

/** The Unicode scripts a Quran text file can hold, as quran.com names its word fields (`text_<script>`). */
export const QURAN_TEXT_SCRIPTS = ['uthmani', 'indopak'] as const;

export type QuranTextScript = (typeof QURAN_TEXT_SCRIPTS)[number];

/**
 * The Unicode text of a passage, word by word, as `<MushafAyahText>` reads it from `public/`:
 * keyed by `"surah:ayah:position"` (`MushafWord.id`'s form), the ayah-end marker included as the
 * ayah's last position, its value the ayah number in Arabic-Indic digits (`"١"`), as quran.com
 * gives it. `serialiseAyahWords()` writes it, `parseAyahWords()` reads it back.
 */
export type AyahWords = {
  readonly version: 1;
  readonly kind: 'quran-text';
  readonly script: QuranTextScript;
  /** Where the text came from: `'quran.com'`, `'qul'`, `'file'`. */
  readonly meta: {readonly source: string};
  readonly words: Readonly<Record<string, string>>;
};

/** One word of an ayah as `<AyahText>` paints it; `text` of the `'end'` marker is its digits alone. */
export type AyahWord = {
  readonly id: string;
  readonly position: number;
  readonly text: string;
  readonly kind: 'word' | 'end';
};

const WORD_KEY = /^([1-9]\d*):([1-9]\d*):([1-9]\d*)$/;
/** An ayah number: Arabic-Indic or Extended Arabic-Indic digits, after an optional U+06DD (END OF AYAH). */
const MARKER = /^۝?\s*([٠-٩۰-۹]+)$/;

const SHAPE =
  '{version: 1, kind: "quran-text", script: "uthmani" | "indopak", meta: {source}, words: {"1:1:1": "بِسْمِ", ..., "1:1:5": "١"}}';

const FETCH_HINT =
  'Fetch the text once from the Mushaf panel’s Text tab, or with fetchQuranComText() and serialiseAyahWords(), into public/.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (problem: string, details: Readonly<Record<string, unknown>> = {}): never => {
  throw new MushafStudioError('BAD_STUDIO_PROP', `Quran text file: ${problem} The format is ${SHAPE}.`, details);
};

const isScript = (value: unknown): value is QuranTextScript =>
  typeof value === 'string' && (QURAN_TEXT_SCRIPTS as readonly string[]).includes(value);

/** Surah, then ayah, then position, as numbers ("1:2:10" after "1:2:9"). */
const compareKeys = (a: string, b: string): number => {
  const x = a.split(':').map(Number);
  const y = b.split(':').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/**
 * Validates a Quran text file read from JSON and returns it typed, the words in surah, ayah,
 * position order and `meta` reduced to `{source}`. Throws `BAD_STUDIO_PROP` naming the field and
 * the value for anything else: another version or kind, an unknown script, a key that is not
 * `"surah:ayah:position"`, an empty text.
 */
export const parseAyahWords = (value: unknown): AyahWords => {
  if (!isRecord(value)) return fail(`expected an object, found ${describeValue(value)}.`);
  if (value.version !== 1) {
    return fail(
      `version is ${describeValue(value.version)} but this version of @tlawat/mushaf-studio reads version 1. Fetch the text again, or upgrade the package.`,
      {field: 'version'},
    );
  }
  if (value.kind !== 'quran-text') {
    return fail(
      `kind is ${describeValue(value.kind)}, not "quran-text"${value.kind === 'ayah' || value.kind === 'word' ? ': this is a translation file, which goes in text.translationFile' : ''}.`,
      {field: 'kind'},
    );
  }
  if (!isScript(value.script)) {
    return fail(`script is ${describeValue(value.script)}; expected one of ${QURAN_TEXT_SCRIPTS.join(', ')}.`, {
      field: 'script',
    });
  }
  if (!isRecord(value.meta) || typeof value.meta.source !== 'string') {
    return fail(`meta should be an object {source: string}; found ${describeValue(value.meta)}.`, {field: 'meta'});
  }
  if (!isRecord(value.words)) return fail(`words should be an object; found ${describeValue(value.words)}.`);
  const keys = Object.keys(value.words);
  if (keys.length === 0) return fail('words is empty; expected at least one word.', {field: 'words'});
  for (const key of keys) {
    const match = WORD_KEY.exec(key);
    if (!match) {
      return fail(`${describeValue(key)} is not a word key "surah:ayah:position" (like "1:2:3").`, {
        field: 'words',
        key,
      });
    }
    if (Number(match[1]) > 114) {
      return fail(`${describeValue(key)} names surah ${match[1]}; surahs run from 1 to 114.`, {field: 'words', key});
    }
    const text = value.words[key];
    if (typeof text !== 'string' || text.trim() === '') {
      return fail(`the text of ${describeValue(key)} should be a non-empty string; found ${describeValue(text)}.`, {
        field: 'words',
        key,
      });
    }
  }
  const words = value.words as Record<string, string>;
  return {
    version: 1,
    kind: 'quran-text',
    script: value.script,
    meta: {source: value.meta.source},
    words: Object.fromEntries(keys.sort(compareKeys).map((key) => [key, words[key]!])),
  };
};

/**
 * The file as JSON text, for `writeStaticFile()`: a fixed key order (version, kind, script, meta,
 * then the words in surah, ayah, position order), one entry per line, a final newline. Stable: the
 * same text always gives the same bytes, and `parseAyahWords()` reads it back equal.
 */
export const serialiseAyahWords = (data: AyahWords): string => {
  const words = Object.fromEntries(
    Object.keys(data.words)
      .sort(compareKeys)
      .map((key) => [key, data.words[key]!]),
  );
  const envelope = {version: 1, kind: 'quran-text', script: data.script, meta: {source: data.meta.source}, words};
  return `${JSON.stringify(envelope, null, 1)}\n`;
};

/**
 * Fetches and validates a Quran text file (a `staticFile()` URL or any URL), for
 * `calculateMetadata()`. A failed request is `TRANSLATION_FETCH_FAILED` naming the URL; a file
 * that is not one is `BAD_STUDIO_PROP`, its message prefixed with the URL.
 */
export const loadAyahWords = async (
  url: string,
  options: {readonly fetch?: typeof fetch | undefined} = {},
): Promise<AyahWords> => {
  const body = await fetchJson(url, `Check the path (under public/) or the URL. ${FETCH_HINT}`, options);
  try {
    return parseAyahWords(body);
  } catch (error) {
    if (isMushafStudioError(error) && error.code === 'BAD_STUDIO_PROP') {
      throw new MushafStudioError('BAD_STUDIO_PROP', `${url}: ${error.message}`, {...error.details, url});
    }
    throw error;
  }
};

/**
 * The words of one ayah in position order, the ayah-end marker last as `kind: 'end'` with its
 * digits as `text` (a leading U+06DD is dropped: the font draws the rosette around the digits). The marker is the ayah's
 * highest position when that entry is an ayah number; an ayah the file does not hold gives `[]`.
 */
export const ayahWordsOf = (data: AyahWords, surah: number, ayah: number): readonly AyahWord[] => {
  const prefix = `${surah}:${ayah}:`;
  const found: {id: string; position: number; text: string}[] = [];
  for (const [id, text] of Object.entries(data.words)) {
    if (!id.startsWith(prefix)) continue;
    const position = Number(id.slice(prefix.length));
    if (Number.isInteger(position) && position >= 1) found.push({id, position, text: text.trim()});
  }
  found.sort((a, b) => a.position - b.position);
  return found.map((word, i): AyahWord => {
    const marker = i === found.length - 1 ? MARKER.exec(word.text) : null;
    return marker ? {...word, text: marker[1]!, kind: 'end'} : {...word, kind: 'word'};
  });
};

/**
 * `GET /verses/by_chapter/{chapter}?words=true&word_fields=text_uthmani,text_indopak,location,char_type_name`,
 * every page: the Unicode text of a chapter (or an ayah range) in one script, word by word, the
 * ayah-end markers (`char_type_name: 'end'`) kept with their digits, as an `AyahWords` with
 * `meta.source` `'quran.com'`. For the panel's Text tab and scripts, never a render: write the
 * result to `public/` with `serialiseAyahWords()`. Throws `BAD_STUDIO_PROP` for a bad chapter,
 * range or script before any request, `TRANSLATION_FETCH_FAILED` when a request fails, quran.com
 * gives a word without its text, or the range has no word.
 */
export const fetchQuranComText = async (
  query: {
    readonly chapter: number;
    readonly fromAyah?: number | undefined;
    readonly toAyah?: number | undefined;
    readonly script: QuranTextScript;
  },
  options: QuranComOptions = {},
): Promise<AyahWords> => {
  const {chapter, fromAyah, toAyah, script} = query;
  if (!isScript(script)) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `script must be one of ${QURAN_TEXT_SCRIPTS.join(', ')} (got ${describeValue(script)}).`,
      {script},
    );
  }
  const field = `text_${script}`;
  const records = await fetchQuranComVerseWords(
    {chapter, fromAyah, toAyah, wordFields: QURAN_TEXT_SCRIPTS.map((s) => `text_${s}`)},
    options,
  );
  const words: Record<string, string> = {};
  for (const record of records) {
    if (record.char_type_name !== 'word' && record.char_type_name !== 'end') continue;
    const location = record.location as string;
    const text = record[field];
    if (typeof text !== 'string' || text.trim() === '') {
      throw new MushafStudioError(
        'TRANSLATION_FETCH_FAILED',
        `quran.com gave word ${location} without its ${field} (found ${describeValue(text)}); try again later, or load a Quran text file from public/.`,
        {chapter, location, field},
      );
    }
    words[location] = text.trim();
  }
  if (Object.keys(words).length === 0) {
    throw new MushafStudioError(
      'TRANSLATION_FETCH_FAILED',
      `quran.com has no ${script} text for ${quranComRangeLabel(chapter, fromAyah, toAyah)}: check the chapter and the ayah range.`,
      {chapter, fromAyah, toAyah, script},
    );
  }
  return {version: 1, kind: 'quran-text', script, meta: {source: 'quran.com'}, words};
};

import {describeValue, MushafStudioError} from '../errors';
import type {Translation, TranslationMeta} from '../types';

const AYAH_KEY = /^([1-9]\d*):([1-9]\d*)$/;
const WORD_KEY = /^([1-9]\d*):([1-9]\d*):([1-9]\d*)$/;

const SHAPES =
  'QUL key/value {"1:1": "..."}, nested arrays [["1:1", "1:2"], ["2:1"]], footnotes as tags {"1:1": {t, f}}, inline footnotes {"1:1": "... [[...]]"}, text chunks {"1:1": ["...", {type, text}]}, word by word {"1:1:1": "..."}, or the studio envelope {version: 1, kind, meta, text | words}';

const fail = (problem: string, details: Readonly<Record<string, unknown>> = {}): never => {
  throw new MushafStudioError('BAD_TRANSLATION_FILE', `Translation file: ${problem}`, details);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------------------------------------
// Footnotes

// Removed markup leaves this private-use mark behind until the spaces around it are settled: QUL's
// sources glue markup to words (`beings<sup ...>1</sup>and`), so dropping it must sometimes add a
// space and sometimes not (`Allah<sup ...>1</sup>, the`).
const CUT = '';
const CUTS = /+/g;
const SUP = /<sup\b[^>]*>[\s\S]*?<\/sup\s*>/gi;
const INLINE_NOTE = /\[\[[\s\S]*?\]\]/g;
const TAG = /<\/?[a-z][^<>]*>/gi;
/** A character a word or a sentence ends with: a space goes after it when the next word starts glued to it. */
const ENDS_WORD = /[\p{L}\p{N}\p{M}\p{Pe}\p{Pf}.,;:!?˺]$/u;
/** A character a word starts with: a letter, a digit or an opening bracket or quote (˹ included). */
const STARTS_WORD = /^[\p{L}\p{N}\p{Ps}\p{Pi}˹]/u;
/** Scripts written without spaces between words. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

const settleCuts = (text: string): string =>
  text.replace(CUTS, (cut: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - 2), offset);
    const after = text.slice(offset + cut.length, offset + cut.length + 2);
    const glued = ENDS_WORD.test(before) && STARTS_WORD.test(after);
    return glued && !UNSPACED.test(before.slice(-1)) && !UNSPACED.test(after.charAt(0)) ? ' ' : '';
  });

/**
 * Removes footnote markup from a translation's text: `<sup foot_note="...">1</sup>` with its
 * content, inline `[[...]]` footnotes with theirs, and any other tag without its content, leaving
 * plain text with single spaces. Where markup sat between two words with no space around it, one
 * space takes its place (`beings<sup>1</sup>and` → `beings and`). Pure.
 */
export const stripFootnotes = (text: string): string =>
  settleCuts(text.replace(SUP, CUT).replace(INLINE_NOTE, CUT).replace(TAG, CUT)).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------------------------
// Keys

type KeyKind = 'ayah' | 'word';

const kindOfKey = (key: string): KeyKind => {
  const match = WORD_KEY.exec(key) ?? AYAH_KEY.exec(key);
  if (!match) {
    return fail(
      `${describeValue(key)} is neither an ayah key ("surah:ayah", like "2:255") nor a word key ("surah:ayah:word", like "1:1:2").`,
      {key},
    );
  }
  if (Number(match[1]) > 114)
    return fail(`${describeValue(key)} names surah ${match[1]}; surahs run from 1 to 114.`, {key});
  return match.length === 4 ? 'word' : 'ayah';
};

/** The ayah an `activeWordId` ("9:1:3") belongs to, as a translation key ("9:1"); `null` for no word. */
export const ayahKeyOf = (wordId: string | number | null | undefined): string | null => {
  if (typeof wordId !== 'string') return null;
  const match = WORD_KEY.exec(wordId);
  return match ? `${match[1]}:${match[2]}` : null;
};

const compareKeys = (a: string, b: string): number => {
  const x = a.split(':').map(Number);
  const y = b.split(':').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

// ---------------------------------------------------------------------------------------------
// Entries

/** One text chunk of QUL's text-chunks shape: kept text, or `null` for a footnote reference. */
const chunkText = (key: string, index: number, chunk: unknown): string | null => {
  if (typeof chunk === 'string') return chunk;
  if (isRecord(chunk) && typeof chunk.type === 'string') {
    if (chunk.type === 'f') return null;
    if (typeof chunk.text === 'string') return chunk.text;
  }
  return fail(
    `chunk ${index} of ${describeValue(key)} should be a string, a formatting chunk {type, text} or a footnote {type: "f", f}; found ${describeValue(chunk)}.`,
    {key, index},
  );
};

/** The plain text of one ayah entry, whichever of QUL's ayah shapes it comes in. */
const ayahText = (key: string, value: unknown): string => {
  // Key/value and inline footnotes.
  if (typeof value === 'string') return stripFootnotes(value);
  // Footnotes as tags: the bodies under `f` are dropped with their references.
  if (isRecord(value) && typeof value.t === 'string') return stripFootnotes(value.t);
  // Text chunks: joined with a cut so neighbours glued to a dropped footnote get their space back.
  if (Array.isArray(value)) {
    const pieces = value.map((chunk, i) => chunkText(key, i, chunk)).filter((piece) => piece !== null);
    return stripFootnotes(pieces.join(CUT));
  }
  return fail(
    `the value of ${describeValue(key)} should be a string (key/value, inline footnotes), {t, f} (footnotes as tags) or an array of text chunks; found ${describeValue(value)}.`,
    {key},
  );
};

const wordText = (key: string, value: unknown): string =>
  typeof value === 'string'
    ? stripFootnotes(value)
    : fail(
        `the value of word ${describeValue(key)} should be a string (word by word); found ${describeValue(value)}.`,
        {
          key,
        },
      );

/** Parses `{key: value}` entries, all ayah keys or all word keys (`expected` when the envelope says which). */
const parseEntries = (
  data: Readonly<Record<string, unknown>>,
  where: string,
  expected?: KeyKind,
): {kind: KeyKind; entries: Record<string, string>} => {
  const keys = Object.keys(data);
  const first = keys[0];
  if (first === undefined) {
    return fail(`${where} is an empty object; expected at least one entry like {"1:1": "..."} or {"1:1:1": "..."}.`);
  }
  const kind = expected ?? kindOfKey(first);
  const entries: Record<string, string> = {};
  for (const key of keys) {
    const keyKind = kindOfKey(key);
    if (keyKind !== kind) {
      return fail(
        expected
          ? `${where} holds ${expected} entries, but ${describeValue(key)} is ${keyKind === 'word' ? 'a word key ("surah:ayah:word")' : 'an ayah key ("surah:ayah")'}.`
          : `${where} mixes ayah keys (${describeValue(kind === 'ayah' ? first : key)}) and word keys (${describeValue(kind === 'word' ? first : key)}); an ayah translation and a word-by-word gloss go in separate files.`,
        {key},
      );
    }
    entries[key] = kind === 'ayah' ? ayahText(key, data[key]) : wordText(key, data[key]);
  }
  return {kind, entries};
};

const parseNestedArrays = (data: readonly unknown[]): Record<string, string> => {
  if (data.length > 114) {
    fail(`QUL nested arrays hold one array per surah, at most 114; found an array of ${data.length}.`);
  }
  const entries: Record<string, string> = {};
  data.forEach((ayat, i) => {
    if (!Array.isArray(ayat)) {
      fail(
        `QUL nested arrays: item [${i}] should be the array of surah ${i + 1}'s ayahs; found ${describeValue(ayat)}.`,
        {index: i},
      );
    }
    (ayat as unknown[]).forEach((text, j) => {
      if (typeof text !== 'string') {
        fail(
          `QUL nested arrays: item [${i}][${j}] (${i + 1}:${j + 1}) should be a string; found ${describeValue(text)}.`,
          {
            key: `${i + 1}:${j + 1}`,
          },
        );
      }
      entries[`${i + 1}:${j + 1}`] = stripFootnotes(text as string);
    });
  });
  if (Object.keys(entries).length === 0) fail('QUL nested arrays: every surah array is empty; found no ayah.');
  return entries;
};

// ---------------------------------------------------------------------------------------------
// Meta

const META_FIELDS = ['id', 'name', 'language', 'source', 'license'] as const;

const DEFAULT_META: TranslationMeta = {id: 'file', name: 'Translation', language: 'und', source: 'file'};

/** Later layers win; fields a layer leaves out or sets to `undefined` fall through. */
const mergeMeta = (...layers: ReadonlyArray<Partial<TranslationMeta> | undefined>): TranslationMeta => {
  const merged: Record<string, string> = {};
  for (const layer of [DEFAULT_META, ...layers]) {
    if (!layer) continue;
    for (const field of META_FIELDS) {
      const value = layer[field];
      if (value !== undefined) merged[field] = value;
    }
  }
  const {id, name, language, source, license} = merged as TranslationMeta;
  return license === undefined ? {id, name, language, source} : {id, name, language, source, license};
};

const envelopeMeta = (value: unknown): Partial<TranslationMeta> => {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    return fail(
      `the studio envelope's meta should be an object {id, name, language, source}; found ${describeValue(value)}.`,
    );
  }
  const meta: Partial<Record<(typeof META_FIELDS)[number], string>> = {};
  for (const field of META_FIELDS) {
    const v = value[field];
    if (v === undefined) continue;
    if (typeof v !== 'string')
      fail(`the studio envelope's meta.${field} should be a string; found ${describeValue(v)}.`);
    meta[field] = v as string;
  }
  return meta;
};

// ---------------------------------------------------------------------------------------------
// Files

const parseEnvelope = (
  data: Readonly<Record<string, unknown>>,
  meta: Partial<TranslationMeta> | undefined,
): Translation => {
  if (data.version !== 1) {
    fail(
      `the studio envelope's version is ${describeValue(data.version)} but this version of @tlawat/mushaf-studio reads version 1. Write the file again with serialiseTranslation(), or upgrade the package.`,
    );
  }
  if (data.kind !== 'ayah' && data.kind !== 'word') {
    fail(`the studio envelope's kind should be "ayah" or "word"; found ${describeValue(data.kind)}.`);
  }
  const kind = data.kind as KeyKind;
  const field = kind === 'ayah' ? 'text' : 'words';
  const body = data[field];
  if (!isRecord(body)) {
    fail(
      `a studio envelope of kind "${kind}" keeps its entries under "${field}", an object {"${kind === 'ayah' ? '1:1' : '1:1:1'}": "..."}; found ${describeValue(body)}.`,
    );
  }
  const {entries} = parseEntries(body as Record<string, unknown>, `the envelope's "${field}"`, kind);
  const merged = mergeMeta(meta, envelopeMeta(data.meta));
  return kind === 'ayah' ? {kind, meta: merged, text: entries} : {kind, meta: merged, words: entries};
};

/**
 * Parses a translation file into the studio's shape, detecting which of these it is (by shape, not
 * by file name): the studio envelope (`{version: 1, kind: 'ayah' | 'word', meta, text | words}`),
 * QUL's key/value (`{"1:1": "..."}`), nested arrays (`[["1:1", "1:2"], ["2:1"]]`, outer index the
 * surah), footnotes as tags (`{"88:17": {t, f}}`), inline footnotes (`[[...]]` in the text), text
 * chunks (`{"114:6": ["...", {type, text}]}`) and word by word (`{"1:1:1": "..."}`). Footnotes are
 * stripped. `meta` fills what the file does not say (defaults: id `'file'`, name `'Translation'`,
 * language `'und'`, source `'file'`); the envelope's own meta wins over both. Throws
 * `BAD_TRANSLATION_FILE` for anything else, naming what was found.
 */
export const parseTranslationFile = (value: unknown, meta?: Partial<TranslationMeta> | undefined): Translation => {
  if (Array.isArray(value)) {
    if (value.length === 0) return fail(`expected one of ${SHAPES}; found an empty array.`);
    return {kind: 'ayah', meta: mergeMeta(meta), text: parseNestedArrays(value)};
  }
  if (!isRecord(value)) return fail(`expected one of ${SHAPES}; found ${describeValue(value)}.`);
  if ('version' in value && 'kind' in value) return parseEnvelope(value, meta);
  const {kind, entries} = parseEntries(value, 'the file');
  return kind === 'ayah' ? {kind, meta: mergeMeta(meta), text: entries} : {kind, meta: mergeMeta(meta), words: entries};
};

const sortedEntries = (entries: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(entries).sort(([a], [b]) => compareKeys(a, b)));

/**
 * The studio envelope as JSON text, for `writeStaticFile()`: a fixed key order (version, kind,
 * meta, then the entries in surah, ayah, word order), one entry per line, a final newline. Stable:
 * the same translation always gives the same bytes, and `parseTranslationFile()` reads it back equal.
 */
export const serialiseTranslation = (translation: Translation): string => {
  const {id, name, language, source, license} = translation.meta;
  const meta = license === undefined ? {id, name, language, source} : {id, name, language, source, license};
  const envelope =
    translation.kind === 'ayah'
      ? {version: 1, kind: 'ayah', meta, text: sortedEntries(translation.text)}
      : {version: 1, kind: 'word', meta, words: sortedEntries(translation.words)};
  return `${JSON.stringify(envelope, null, 1)}\n`;
};

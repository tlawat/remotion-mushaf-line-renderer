// Contract of the translations module (workstream 3). Implement in parse.ts (QUL shapes and the
// studio envelope), quran-com.ts (the open quran.com v4 API), load.ts and the two components;
// keep these exports and signatures.
import type {AyahTranslation, Translation, TranslationMeta, WordGloss} from '../types';

export {GlossStrip} from './GlossStrip';
export {TranslationBlock} from './TranslationBlock';

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet (workstream 3).`);
};

/** The open quran.com API, v4 (CORS `*`, no key). */
export const DEFAULT_QURAN_COM_API = 'https://api.quran.com/api/v4';

/**
 * Removes footnote markup from a translation's text: `<sup foot_note="...">1</sup>`, inline
 * `[[...]]` footnotes, and any other tag, leaving plain text with single spaces. Pure.
 */
export const stripFootnotes = (_text: string): string => notImplemented('stripFootnotes');

/**
 * Parses a translation file into the studio's shape, detecting which of these it is:
 * the studio envelope (`{version: 1, kind: 'ayah' | 'word', meta, text | words}`), QUL's key/value
 * (`{"1:1": "..."}`), nested arrays (`[["1:1", "1:2"], ["2:1"]]`), footnotes as tags
 * (`{"88:17": {t, f}}`), inline footnotes (`[[...]]` in the text), text chunks (`{"114:6": [...]}`)
 * and word by word (`{"1:1:1": "..."}`). Footnotes are stripped. `meta` fills what the file does
 * not say. Throws `BAD_TRANSLATION_FILE` for anything else, naming what was found.
 */
export const parseTranslationFile = (_value: unknown, _meta?: Partial<TranslationMeta> | undefined): Translation =>
  notImplemented('parseTranslationFile');

/** The studio envelope as JSON text, for `writeStaticFile()`: stable key order, one entry per line. */
export const serialiseTranslation = (_translation: Translation): string => notImplemented('serialiseTranslation');

/** Fetches and parses a translation file (a `staticFile()` URL or any URL). For `calculateMetadata()`. */
export const loadTranslation = (
  _url: string,
  _options: {readonly fetch?: typeof fetch | undefined; readonly meta?: Partial<TranslationMeta> | undefined} = {},
): Promise<Translation> => notImplemented('loadTranslation');

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

/** `GET /resources/translations`, optionally for one language (`'en'`). */
export const listQuranComTranslations = (
  _query: {readonly language?: string | undefined} = {},
  _options: QuranComOptions = {},
): Promise<readonly QuranComResource[]> => notImplemented('listQuranComTranslations');

/**
 * `GET /quran/translations/{resourceId}?chapter_number=...`: an ayah translation for a chapter (or
 * the given ayah range), footnotes stripped, as an `AyahTranslation` with `meta.id` `quran.com:<id>`.
 */
export const fetchQuranComTranslation = (
  _query: {
    readonly resourceId: number;
    readonly chapter: number;
    readonly fromAyah?: number | undefined;
    readonly toAyah?: number | undefined;
  },
  _options: QuranComOptions = {},
): Promise<AyahTranslation> => notImplemented('fetchQuranComTranslation');

/**
 * `GET /verses/by_chapter/{chapter}?words=true&language=...`: the per-word translation or
 * transliteration of a chapter (or an ayah range) as a `WordGloss`, keyed by `location`, with the
 * ayah-end markers left out.
 */
export const fetchQuranComWordGloss = (
  _query: {
    readonly chapter: number;
    readonly field: 'translation' | 'transliteration';
    /** quran.com's language code, default `'en'`. */
    readonly language?: string | undefined;
    readonly fromAyah?: number | undefined;
    readonly toAyah?: number | undefined;
  },
  _options: QuranComOptions = {},
): Promise<WordGloss> => notImplemented('fetchQuranComWordGloss');

/** The ayah an `activeWordId` ("9:1:3") belongs to, as a translation key ("9:1"); `null` for no word. */
export const ayahKeyOf = (_wordId: string | number | null | undefined): string | null => notImplemented('ayahKeyOf');

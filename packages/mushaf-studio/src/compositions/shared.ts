// What both compositions share: turning a content prop into a URL, loading a translation file of
// the expected kind, and naming the ayah a line starts with.
import {type MushafLineData, sliceWords} from '@tlawat/remotion-mushaf-line';
import {describeValue, MushafStudioError} from '../errors';
import {loadTranslation} from '../translations';
import type {Translation} from '../types';

/** A `public/` path through `staticFile()`; an http(s) URL as it is (`staticFile()` refuses those). */
export const fileUrl = (path: string, staticFile: (path: string) => string): string =>
  /^https?:\/\//i.test(path) ? path : staticFile(path);

export type TextFileProp = 'translationFile' | 'glossFile' | 'transliterationFile';

const SHAPES: Readonly<Record<Translation['kind'], string>> = {
  ayah: 'an ayah-by-ayah translation ({"1:1": "..."}, or any QUL shape)',
  word: 'a word-by-word file ({"1:1:1": "..."})',
};

/**
 * Loads the translation file a `text.*File` prop names, or `null` for an empty prop, and checks it
 * is of the kind the prop takes: an ayah file where a word file is expected (or the reverse) is
 * `BAD_STUDIO_PROP`, named after the prop so the Props sidebar shows where to look.
 */
export const loadTextFile = async <K extends Translation['kind']>(
  kind: K,
  prop: TextFileProp,
  file: string,
  options: {readonly fetch: typeof fetch; readonly staticFile: (path: string) => string},
): Promise<Extract<Translation, {kind: K}> | null> => {
  if (file === '') return null;
  const translation = await loadTranslation(fileUrl(file, options.staticFile), {fetch: options.fetch});
  if (translation.kind !== kind) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `text.${prop} ${describeValue(file)} is ${SHAPES[translation.kind]}, but ${prop} takes ${SHAPES[kind]}. Point ${prop} at ${SHAPES[kind]}${kind === 'ayah' ? ', or move this file to glossFile / transliterationFile' : ', or move this file to translationFile'}.`,
      {prop, file, kind: translation.kind},
    );
  }
  return translation as Extract<Translation, {kind: K}>;
};

/** The translation key ("surah:ayah") of the first word a line shows, or `null` for a line without words. */
export const firstAyahKey = (line: MushafLineData | undefined): string | null => {
  const word = line ? sliceWords(line)[0] : undefined;
  return word ? `${word.surah}:${word.ayah}` : null;
};

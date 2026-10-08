import {isMushafStudioError, MushafStudioError} from '../errors';
import type {Translation, TranslationMeta} from '../types';
import {fetchJson} from './http';
import {parseTranslationFile} from './parse';

/**
 * Fetches and parses a translation file (a `staticFile()` URL or any URL). For `calculateMetadata()`.
 * A failed request is `TRANSLATION_FETCH_FAILED`; a file in none of the known shapes is
 * `BAD_TRANSLATION_FILE`, its message prefixed with the URL.
 */
export const loadTranslation = async (
  url: string,
  options: {readonly fetch?: typeof fetch | undefined; readonly meta?: Partial<TranslationMeta> | undefined} = {},
): Promise<Translation> => {
  const body = await fetchJson(
    url,
    'Check that the file exists (in public/ for a staticFile() path) and that the path in the props is right.',
    options,
  );
  try {
    return parseTranslationFile(body, options.meta);
  } catch (error) {
    if (isMushafStudioError(error) && error.code === 'BAD_TRANSLATION_FILE') {
      throw new MushafStudioError('BAD_TRANSLATION_FILE', `${url}: ${error.message}`, {...error.details, url});
    }
    throw error;
  }
};

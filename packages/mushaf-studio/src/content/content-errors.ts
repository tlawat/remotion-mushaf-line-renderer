import {isMushafStudioError, MushafStudioError} from '../errors';

/**
 * An error of the translation helpers the content fetchers share (`fetchJson()`, the quran.com
 * paging), re-coded for content: `TRANSLATION_FETCH_FAILED` becomes `CONTENT_FETCH_FAILED` and
 * `BAD_TRANSLATION_FILE` becomes `BAD_CONTENT_FILE`, message and details kept. Anything else (an
 * abort, `BAD_STUDIO_PROP`) is returned as it came.
 */
export const asContentError = (error: unknown): unknown => {
  if (!isMushafStudioError(error)) return error;
  if (error.code === 'TRANSLATION_FETCH_FAILED')
    return new MushafStudioError('CONTENT_FETCH_FAILED', error.message, error.details);
  if (error.code === 'BAD_TRANSLATION_FILE')
    return new MushafStudioError('BAD_CONTENT_FILE', error.message, error.details);
  return error;
};

/** Runs `work`, its translation-coded failures re-coded by `asContentError()`. */
export const withContentErrors = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    throw asContentError(error);
  }
};

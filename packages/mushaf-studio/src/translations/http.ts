import {MushafStudioError} from '../errors';

/** What the translation fetchers share: an injectable `fetch` (tests, a proxy) and an abort signal. */
export type FetchJsonOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly signal?: AbortSignal | undefined;
};

const isAbort = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as {name?: unknown}).name === 'AbortError';

/**
 * GETs `url` and returns its JSON body. A network failure, a non-2xx answer or a body that is not
 * JSON is a `TRANSLATION_FETCH_FAILED` naming the URL (and the status); `hint` says what to do about
 * it. An abort the caller asked for is rethrown as it came, so callers can tell it from a failure.
 */
export const fetchJson = async (url: string, hint: string, options: FetchJsonOptions = {}): Promise<unknown> => {
  // Called unbound on purpose: `window.fetch` throws "Illegal invocation" when called as a method of another object.
  const request = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await request(url, options.signal ? {signal: options.signal} : {});
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new MushafStudioError(
      'TRANSLATION_FETCH_FAILED',
      `Could not fetch ${url} (${error instanceof Error ? error.message : String(error)}): a network error or a server without Access-Control-Allow-Origin. ${hint}`,
      {url},
    );
  }
  if (!response.ok) {
    throw new MushafStudioError(
      'TRANSLATION_FETCH_FAILED',
      `${url} answered HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}. ${hint}`,
      {url, status: response.status},
    );
  }
  try {
    return await response.json();
  } catch (error) {
    // The body is still streaming while it is read: an abort can land here too.
    if (options.signal?.aborted || isAbort(error)) throw error;
    throw new MushafStudioError(
      'TRANSLATION_FETCH_FAILED',
      `${url} answered HTTP ${response.status} but not with JSON (${error instanceof Error ? error.message : String(error)}). ${hint}`,
      {url, status: response.status},
    );
  }
};

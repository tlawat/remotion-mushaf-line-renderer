import {readFileSync} from 'node:fs';
import {vi} from 'vitest';
import {isMushafStudioError, type MushafStudioError} from '../../../src/errors';

/** A translation fixture as raw JSON, the way a loader receives it. */
export const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../fixtures/translations/${name}`, import.meta.url), 'utf8'));

/** The `MushafStudioError` `fn` throws; fails the test when it throws nothing or something else. */
export const thrown = (fn: () => unknown): MushafStudioError => {
  try {
    fn();
  } catch (error) {
    if (isMushafStudioError(error)) return error;
    throw error;
  }
  throw new Error('expected a MushafStudioError, nothing was thrown');
};

export type FakeAnswer = {readonly status?: number; readonly body?: unknown; readonly text?: string};

/**
 * A `fetch` that answers from `route(url)` and records every URL it was asked for. A route that
 * returns an `Error` rejects, like a network failure.
 */
export const fakeFetch = (route: (url: URL) => FakeAnswer | Error) => {
  const urls: URL[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    urls.push(url);
    const answer = route(url);
    if (answer instanceof Error) throw answer;
    return new Response(answer.text ?? JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: {'content-type': 'application/json'},
    });
  });
  return {fetch: fetch as unknown as typeof globalThis.fetch, mock: fetch, urls};
};

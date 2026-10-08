import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isMushafStudioError, type MushafStudioError} from '../../../src/errors';
import {type FakeAnswer, fakeFetch} from '../translations/helpers';

export {type FakeAnswer, fakeFetch, thrown} from '../translations/helpers';

// A path, not `new URL(..., import.meta.url)`: under jsdom Vite rewrites that pattern into an asset import.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/content');

/** A content fixture as text (a CSS answer). */
export const fixtureText = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

/** A content fixture as raw JSON, the way a fetcher receives it. */
export const fixture = (name: string): any => JSON.parse(fixtureText(name));

export const API = 'https://api.quran.com/api/v4';

/** Routes quran.com's paths to answers; anything else is a 404 like quran.com's. */
export const quranCom = (answers: Record<string, FakeAnswer | Error | ((url: URL) => FakeAnswer)>) =>
  fakeFetch((url) => {
    const answer = answers[url.pathname.replace('/api/v4', '')];
    if (answer === undefined) return {status: 404, body: {status: 404, error: 'not found'}};
    return typeof answer === 'function' ? answer(url) : answer;
  });

/** The `MushafStudioError` a promise rejects with; fails the test when it resolves or rejects with something else. */
export const rejection = async (promise: Promise<unknown>): Promise<MushafStudioError> => {
  try {
    await promise;
  } catch (error) {
    if (isMushafStudioError(error)) return error;
    throw error;
  }
  throw new Error('expected a rejection');
};

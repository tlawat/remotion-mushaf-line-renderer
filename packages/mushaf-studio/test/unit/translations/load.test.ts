import {describe, expect, it} from 'vitest';
import {MushafStudioError} from '../../../src/errors';
import {loadTranslation} from '../../../src/translations';
import {fakeFetch, fixture} from './helpers';

const URL_ = 'http://localhost:3000/public/mushaf-studio/demo/translation.json';

const rejection = async (promise: Promise<unknown>): Promise<MushafStudioError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof MushafStudioError) return error;
    throw error;
  }
  throw new Error('expected a rejection');
};

describe('loadTranslation', () => {
  it('fetches the URL and parses what it finds, with the given meta', async () => {
    const {fetch, urls} = fakeFetch(() => ({body: fixture('qul-footnote-tags.json')}));
    const t = await loadTranslation(URL_, {fetch, meta: {id: 'qul:131', language: 'en'}});
    expect(urls.map((u) => u.href)).toEqual([URL_]);
    expect(t).toEqual({
      kind: 'ayah',
      meta: {id: 'qul:131', name: 'Translation', language: 'en', source: 'file'},
      text: {
        '88:17': 'Do the disbelievers not see how rain clouds are formed',
        '88:18': 'and how the sky is raised ˹high˺,',
      },
    });
  });

  it('reads a word-by-word file', async () => {
    const {fetch} = fakeFetch(() => ({body: fixture('qul-word-by-word.json')}));
    expect((await loadTranslation(URL_, {fetch})).kind).toBe('word');
  });

  it('fails with TRANSLATION_FETCH_FAILED on a 404, naming the URL and the status', async () => {
    const {fetch} = fakeFetch(() => ({status: 404, body: {}}));
    const error = await rejection(loadTranslation(URL_, {fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain(URL_);
    expect(error.message).toContain('HTTP 404');
    expect(error.details).toEqual({url: URL_, status: 404});
  });

  it('fails with TRANSLATION_FETCH_FAILED on a network error', async () => {
    const {fetch} = fakeFetch(() => new TypeError('Failed to fetch'));
    const error = await rejection(loadTranslation(URL_, {fetch}));
    expect(error.code).toBe('TRANSLATION_FETCH_FAILED');
    expect(error.message).toContain(URL_);
  });

  it('fails with BAD_TRANSLATION_FILE, prefixed with the URL, for a file in no known shape', async () => {
    const {fetch} = fakeFetch(() => ({body: {hello: 'world'}}));
    const error = await rejection(loadTranslation(URL_, {fetch}));
    expect(error.code).toBe('BAD_TRANSLATION_FILE');
    expect(error.message.startsWith(`${URL_}: Translation file:`)).toBe(true);
    expect(error.details).toMatchObject({url: URL_, key: 'hello'});
  });
});

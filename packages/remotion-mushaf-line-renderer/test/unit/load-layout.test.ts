import {readFileSync} from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
// @ts-expect-error — plain JS modules from scripts/
import {compileLayout as compileLayoutJs} from '../../../../scripts/lib/compile.mjs';
// @ts-expect-error — plain JS modules from scripts/
import {SYNTH, SYNTH_PAGES} from '../../../../scripts/test/synthetic.mjs';
import type {DatasetDescriptor, DatasetId} from '../../src/mushaf/registry';
import {makeZip} from '../fixtures/make-zip';

// The loader reads the dataset registry; the tests point it at the synthetic mushaf instead.
const SYNTHETIC: DatasetDescriptor = {
  id: 'synth' as DatasetId,
  layoutId: 0,
  pages: 3,
  linesOnPage: (page: number) => (page === 1 ? 3 : 4),
  centeredPages: [1],
  urls: {words: 'https://cdn.test/exports/words.json.zip', layout: 'https://cdn.test/exports/layout.db.zip'},
};
let dataset = SYNTHETIC;
vi.mock('../../src/mushaf/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/mushaf/registry')>('../../src/mushaf/registry');
  return {...actual, getDataset: () => dataset};
});

const {loadLayout, resetLayoutCache, resolveDataUrls} = await import('../../src/data/load-layout');
const {loadMushafData} = await import('../../src/data/load-mushaf-data');
const {getMushafLine} = await import('../../src/resolve/get-mushaf-line');
const {MushafError} = await import('../../src/errors');

const fixtures = path.resolve(__dirname, '../fixtures/data/synthetic');
const wordsJson = new Uint8Array(readFileSync(path.join(fixtures, 'words.json')));
const layoutDb = new Uint8Array(readFileSync(path.join(fixtures, 'layout.db')));
const wordsZip = makeZip([{name: 'qpc-v4.json', data: wordsJson}]);
const layoutZip = makeZip([{name: 'qpc-v4-tajweed-15-lines.db', data: layoutDb}]);
const text = (s: string) => new TextEncoder().encode(s);

/** What the scripts compiler makes of the same export (regular words only). */
const expected = () => {
  const regular = (SYNTH_PAGES as {page: number; lines: {words: {kind: string}[]}[]}[]).map((p) => ({
    ...p,
    lines: p.lines.map((l) => ({...l, words: l.words.filter((w) => w.kind === 'word' || w.kind === 'end')})),
  }));
  return compileLayoutJs(regular, SYNTH, {source: 'x', generatedAt: 'x'});
};
const stripMeta = (layout: {source: string; generatedAt: string}) => ({...layout, source: 'x', generatedAt: 'x'});

type Route = (url: string, init: RequestInit) => Response | Promise<Response>;
const fetchMock = vi.fn<Route>();
/** Answers each URL by its file name; anything else is a 404. */
const serve = (bodies: Record<string, Uint8Array<ArrayBuffer> | (() => Response | Promise<Response>)>): void => {
  fetchMock.mockImplementation(async (url) => {
    const name = url.split('/').pop() ?? '';
    const body = bodies[name];
    if (body === undefined) return new Response('not found', {status: 404});
    return typeof body === 'function' ? body() : new Response(body);
  });
};

beforeEach(() => {
  dataset = SYNTHETIC;
  resetLayoutCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('resolveDataUrls', () => {
  it('takes the dataset defaults, absolute URLs and, in a browser, root-relative paths', () => {
    expect(resolveDataUrls(SYNTHETIC, undefined)).toEqual(SYNTHETIC.urls);
    expect(resolveDataUrls(SYNTHETIC, {})).toEqual(SYNTHETIC.urls);
    expect(resolveDataUrls(SYNTHETIC, {layout: 'https://mirror.example/layout.db'})).toEqual({
      words: SYNTHETIC.urls.words,
      layout: 'https://mirror.example/layout.db',
    });
    expect(
      resolveDataUrls(SYNTHETIC, {
        words: 'http://127.0.0.1:4173/w.zip',
        layout: 'data:application/octet-stream;base64,AA==',
      }),
    ).toEqual({words: 'http://127.0.0.1:4173/w.zip', layout: 'data:application/octet-stream;base64,AA=='});
    // Node has no `location`: a staticFile() path cannot be fetched from here, and the message says so.
    expect(() => resolveDataUrls(SYNTHETIC, {words: '/data/qpc-v4/words.json.zip'})).toThrow(
      /only a browser can resolve; from Node pass an absolute URL/,
    );
    vi.stubGlobal('location', {origin: 'http://localhost:4173'});
    expect(resolveDataUrls(SYNTHETIC, {words: '/data/qpc-v4/words.json.zip'})).toEqual({
      words: '/data/qpc-v4/words.json.zip',
      layout: SYNTHETIC.urls.layout,
    });
  });

  it('refuses anything that is not a URL, by name', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e instanceof MushafError ? `${e.code}: ${e.message}` : String(e);
      }
      return 'no error';
    };
    expect(code(() => resolveDataUrls(SYNTHETIC, {words: ''}))).toMatch(
      /^BAD_DATA_URL: data\.words must be an absolute URL/,
    );
    expect(code(() => resolveDataUrls(SYNTHETIC, {layout: 42 as never}))).toMatch(
      /^BAD_DATA_URL: data\.layout must be .* got 42/,
    );
    expect(code(() => resolveDataUrls(SYNTHETIC, {words: 'data/qpc-v4/words.json.zip'}))).toMatch(
      /^BAD_DATA_URL: .*relative to the bundle is ambiguous/,
    );
    expect(code(() => resolveDataUrls(SYNTHETIC, 'https://x' as never))).toMatch(
      /^BAD_DATA_URL: data must be an object/,
    );
    expect(code(() => resolveDataUrls(SYNTHETIC, null as never))).toMatch(/^BAD_DATA_URL/);
    expect(code(() => resolveDataUrls(SYNTHETIC, ['a'] as never))).toMatch(/^BAD_DATA_URL/);
  });
});

describe('loadLayout', () => {
  it('fetches both exports in parallel, cross-origin without credentials, and compiles them', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    serve({
      'words.json.zip': () => gate.then(() => new Response(wordsZip)),
      'layout.db.zip': () => gate.then(() => new Response(layoutZip)),
    });
    const pending = loadLayout('qpc-v4');
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2); // both requested before either answered
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([SYNTHETIC.urls.words, SYNTHETIC.urls.layout]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({mode: 'cors', credentials: 'omit'});
    release();
    const layout = await pending;
    expect(stripMeta(layout)).toEqual(expected());
    expect(layout.source).toBe('qul-export:layout.db.zip');
    expect(layout.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Through the public API too.
    const line = await getMushafLine({page: 1, line: 2});
    expect(line.words.map((w) => w.id)).toEqual(['1:1:1', '1:1:2', '1:1:3']);
  });

  it('reads the exports unzipped as well: raw JSON, a raw SQLite file, or the pages as a JSON array', async () => {
    serve({'words.json': wordsJson, 'layout.db': layoutDb});
    expect(
      stripMeta(await loadLayout('qpc-v4', {words: 'https://m.test/words.json', layout: 'https://m.test/layout.db'})),
    ).toEqual(expected());
    const rows = JSON.stringify([
      ...['surah_name', 'ayah', 'ayah'].map((type, i) => ({
        page_number: 1,
        line_number: i + 1,
        line_type: type,
        is_centered: 1,
        first_word_id: type === 'ayah' ? (i === 1 ? 1 : 4) : '',
        last_word_id: type === 'ayah' ? (i === 1 ? 3 : 5) : '',
        surah_number: type === 'ayah' ? '' : 1,
      })),
      {
        page_number: 2,
        line_number: 1,
        line_type: 'surah_name',
        is_centered: 1,
        first_word_id: '',
        last_word_id: '',
        surah_number: 2,
      },
      {
        page_number: 2,
        line_number: 2,
        line_type: 'basmallah',
        is_centered: 1,
        first_word_id: '',
        last_word_id: '',
        surah_number: '',
      },
      {
        page_number: 2,
        line_number: 3,
        line_type: 'ayah',
        is_centered: 0,
        first_word_id: 6,
        last_word_id: 9,
        surah_number: '',
      },
      {
        page_number: 2,
        line_number: 4,
        line_type: 'ayah',
        is_centered: 0,
        first_word_id: 10,
        last_word_id: 12,
        surah_number: '',
      },
      {
        page_number: 3,
        line_number: 1,
        line_type: 'ayah',
        is_centered: 0,
        first_word_id: 13,
        last_word_id: 15,
        surah_number: '',
      },
      {
        page_number: 3,
        line_number: 2,
        line_type: 'ayah',
        is_centered: 0,
        first_word_id: 16,
        last_word_id: 19,
        surah_number: '',
      },
      {
        page_number: 3,
        line_number: 3,
        line_type: 'surah_name',
        is_centered: 1,
        first_word_id: '',
        last_word_id: '',
        surah_number: 3,
      },
      {
        page_number: 3,
        line_number: 4,
        line_type: 'ayah',
        is_centered: 1,
        first_word_id: 20,
        last_word_id: 23,
        surah_number: '',
      },
    ]);
    serve({'words.json': wordsJson, 'pages.json': text(rows)});
    expect(
      stripMeta(await loadLayout('qpc-v4', {words: 'https://m.test/words.json', layout: 'https://m.test/pages.json'})),
    ).toEqual(expected());
  });

  it('says what is wrong with a response that is not the export', async () => {
    const html = text('<!DOCTYPE html><html><body>Not Found</body></html>');
    serve({'words.json.zip': html, 'layout.db.zip': layoutZip});
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({
      code: 'DATA_INVALID',
      message: expect.stringMatching(/words\.json\.zip is not JSON \(\d+ bytes, starts with "<!DOCTYPE html><"\)/),
    });
    serve({'words.json.zip': wordsZip, 'layout.db.zip': html});
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({
      code: 'DATA_INVALID',
      message: expect.stringMatching(/layout\.db\.zip is not a SQLite file or a JSON array/),
    });
    // A zip that is not the export: the entry is named.
    serve({
      'words.json.zip': makeZip([
        {name: 'readme.txt', data: 'hello'},
        {name: 'other.txt', data: 'x'},
      ]),
      'layout.db.zip': layoutZip,
    });
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({
      code: 'DATA_INVALID',
      message: expect.stringMatching(/2 files and none is named \*\.json/),
    });
    // Truncated zip: named as such.
    serve({'words.json.zip': wordsZip.subarray(0, wordsZip.length - 10), 'layout.db.zip': layoutZip});
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({
      code: 'DATA_INVALID',
      message: expect.stringMatching(/could not be read: .*(central directory|no end-of-central-directory)/),
    });
    // Valid files that do not describe the mushaf: the words the layout references are missing…
    serve({
      'words.json.zip': makeZip([
        {
          name: 'w.json',
          data: JSON.stringify({'1:1:1': {id: 1, surah: 1, ayah: 1, word: 1, location: '1:1:1', text: 'ﱁ'}}),
        },
      ]),
      'layout.db.zip': layoutZip,
    });
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({
      code: 'DATA_INVALID',
      message: expect.stringMatching(/references word 2, missing from the words export/),
    });
    // … or the reading order is broken (positions shuffled).
    const shuffled = JSON.parse(new TextDecoder().decode(wordsJson)) as Record<string, {word: number}>;
    shuffled['2:1:2']!.word = 7;
    serve({'words.json.zip': makeZip([{name: 'w.json', data: JSON.stringify(shuffled)}]), 'layout.db.zip': layoutZip});
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({
      code: 'DATA_INVALID',
      message: expect.stringMatching(/word 2:1:7 follows 2:1:1/),
    });
    // … or the layout describes another mushaf (the export's own `info` table says how many pages).
    serve({'words.json.zip': wordsZip, 'layout.db.zip': layoutZip});
    dataset = {...SYNTHETIC, pages: 4, linesOnPage: () => 4};
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({
      code: 'DATA_INVALID',
      message: expect.stringMatching(
        /describes a mushaf of 3 pages \(synthetic\); "synth" has 4\. Check the url: it should be QUL's layout 0/,
      ),
    });
    // A problem found while reading names both sources and the way out.
    dataset = SYNTHETIC;
    serve({'words.json.zip': makeZip([{name: 'w.json', data: JSON.stringify(shuffled)}]), 'layout.db.zip': layoutZip});
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({
      message: expect.stringMatching(
        /Sources: words https:\/\/cdn\.test\/exports\/words\.json\.zip, layout https:\/\/cdn\.test\/exports\/layout\.db\.zip\. Mirror QUL's two exports/,
      ),
    });
  });

  it('maps HTTP, network and timeout failures to their codes, retrying only what a retry can fix', async () => {
    serve({'layout.db.zip': layoutZip});
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({
      code: 'DATA_HTTP',
      details: {status: 404, final: true},
      message: expect.stringMatching(
        /HTTP 404 for the mushaf words export of "synth" at https:\/\/cdn\.test\/exports\/words\.json\.zip\. Check the url/,
      ),
    });
    expect(fetchMock.mock.calls.filter((c) => c[0].endsWith('words.json.zip'))).toHaveLength(1); // final: no retry

    vi.useFakeTimers();
    let calls = 0;
    serve({
      'words.json.zip': () => (++calls === 1 ? new Response('busy', {status: 503}) : new Response(wordsZip)),
      'layout.db.zip': layoutZip,
    });
    const retried = loadLayout('qpc-v4');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(stripMeta(await retried)).toEqual(expected());
    expect(calls).toBe(2);

    resetLayoutCache();
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('fetch failed')));
    const network = loadLayout('qpc-v4').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    const networkError = (await network) as InstanceType<typeof MushafError>;
    expect(networkError).toMatchObject({
      code: 'DATA_NETWORK',
      message: expect.stringMatching(/fetch failed; attempt 3\/3.*Access-Control-Allow-Origin/s),
    });

    resetLayoutCache();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    );
    const hanging = loadLayout('qpc-v4').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await hanging).toMatchObject({
      code: 'DATA_TIMEOUT',
      message: expect.stringMatching(/timed out after 15000 ms \(attempt 3\/3\)/),
    });

    // Inside a rendering tab the budget is the renderer's: two attempts that fit inside --timeout.
    resetLayoutCache();
    vi.stubGlobal('window', {remotion_puppeteerTimeout: 8_000});
    const rendering = loadLayout('qpc-v4').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await rendering).toMatchObject({
      code: 'DATA_TIMEOUT',
      message: expect.stringMatching(/timed out after 4000 ms \(attempt 2\/2\)/),
    });
  });

  it('loads once per dataset and source pair, forgets a failure, and warms up through loadMushafData()', async () => {
    // Every look resolves to the one dataset, so the key is the dataset id plus the two URLs.
    serve({'words.json.zip': wordsZip, 'layout.db.zip': layoutZip, 'w2.zip': wordsZip});
    const a = loadLayout('qpc-v4');
    const b = loadLayout('qpc-v4', {});
    expect(b).toBe(a); // same promise, no second pair of requests
    await a;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await loadLayout('qpc-v4', {words: 'https://other.test/w2.zip'});
    expect(fetchMock).toHaveBeenCalledTimes(4); // another source is another load
    await loadMushafData({mushaf: 'qpc-v4', data: {words: 'https://other.test/w2.zip'}});
    expect(fetchMock).toHaveBeenCalledTimes(4); // already loaded
    resetLayoutCache();
    await loadMushafData();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await getMushafLine({page: 2, line: 3, look: 'tajweed'});
    expect(fetchMock).toHaveBeenCalledTimes(6); // the warm-up served the line, for any look

    resetLayoutCache();
    fetchMock.mockClear();
    serve({'layout.db.zip': layoutZip});
    await expect(loadLayout('qpc-v4')).rejects.toMatchObject({code: 'DATA_HTTP'});
    serve({'words.json.zip': wordsZip, 'layout.db.zip': layoutZip});
    expect(stripMeta(await loadLayout('qpc-v4'))).toEqual(expected()); // the failure was not cached
  });
});

/**
 * Loads a dataset at runtime from QUL's two raw exports — the words of the script (JSON) and the
 * line layout (SQLite), each as the CDN's zip or unzipped — and compiles them in memory into the
 * `CompiledLayout` the resolvers read. Nothing of the mushaf ships in the package.
 *
 * Both files are fetched in parallel, decoded by their magic bytes (zip → the one entry inside;
 * SQLite; JSON), joined, compiled and checked structurally. A source that does not answer or does
 * not hold the mushaf fails with a `DATA_*` `MushafError` naming the URL and the first problem.
 *
 * One layout per dataset and source pair, cached on `globalThis` so Studio fast refresh and
 * duplicate package copies share it; a failed load is forgotten so the next call retries.
 * Remotion-free: the budget is sized from `window.remotion_puppeteerTimeout` alone.
 */

import {MushafError, describeValue} from '../errors';
import {getLoadBudget, isFinalStatus, looksLikeRendering, readPuppeteerTimeout, sleep, type LoadBudget} from '../fetch-budget';
import {getDataset, type DatasetDescriptor, type DatasetId} from '../mushafs';
import type {MushafDataSource} from '../types';
import {LayoutProblemsError, checkLayout, compileLayout, type CompileDef} from './compile';
import type {CompiledLayout} from './format';
import {DataShapeError, joinExport, parseLayoutRows, parseWordsExport} from './qul-export';
import {SqliteError, isSqlite, readSqliteTable, type SqliteRow} from './sqlite';
import {ZipError, isZip, listZipEntries, pickZipEntry, readZipEntry} from './zip';

export type DataUrls = {readonly words: string; readonly layout: string};
type Part = keyof DataUrls;

const PARTS: readonly Part[] = ['words', 'layout'];
const ZIP_PREFERENCE: Readonly<Record<Part, readonly string[]>> = {words: ['.json'], layout: ['.db', '.sqlite', '.sqlite3', '.json']};
const HINT = 'Mirror QUL\'s two exports into public/ and pass them as `data` through staticFile() for renders that must not depend on the CDN.';

const STORE_KEY = Symbol.for('remotion-mushaf-line-renderer/layout-store@1');

const getStore = (): Map<string, Promise<CompiledLayout>> => {
  const g = globalThis as unknown as Record<symbol, Map<string, Promise<CompiledLayout>> | undefined>;
  let store = g[STORE_KEY];
  if (!store) {
    store = new Map();
    g[STORE_KEY] = store;
  }
  return store;
};

const isAbsoluteUrl = (value: string): boolean => /^(https?|data|blob|file):/i.test(value);

/** The two URLs to fetch: the source given, else the dataset's pinned exports on QUL's CDN. */
export const resolveDataUrls = (dataset: DatasetDescriptor, data: MushafDataSource | undefined): DataUrls => {
  if (data !== undefined && (data === null || typeof data !== 'object' || Array.isArray(data))) {
    throw new MushafError('BAD_DATA_URL', `data must be an object {words?, layout?} of URLs when given, got ${describeValue(data)}.`, {data});
  }
  const resolve = (part: Part): string => {
    const value = data?.[part];
    if (value === undefined) return dataset.urls[part];
    if (typeof value !== 'string' || value === '') {
      throw new MushafError('BAD_DATA_URL', `data.${part} must be an absolute URL, a staticFile() path or a root-relative path, got ${describeValue(value)}.`, {part, value});
    }
    if (isAbsoluteUrl(value)) return value;
    if (value.startsWith('/')) {
      if (typeof location === 'undefined') {
        throw new MushafError('BAD_DATA_URL', `data.${part} is the root-relative path ${JSON.stringify(value)}, which only a browser can resolve; from Node pass an absolute URL (serve public/ and use its origin).`, {part, value});
      }
      return value;
    }
    throw new MushafError('BAD_DATA_URL', `data.${part} must be an absolute URL, a staticFile() path or a root-relative path, got ${JSON.stringify(value)}; a path relative to the bundle is ambiguous.`, {part, value});
  };
  return {words: resolve('words'), layout: resolve('layout')};
};

const keyOf = (id: DatasetId, urls: DataUrls): string => `${id}\n${urls.words}\n${urls.layout}`;

/** The dataset's compiled layout, loaded once per source pair. */
export const loadLayout = (id: DatasetId, data?: MushafDataSource): Promise<CompiledLayout> => {
  const dataset = getDataset(id);
  const urls = resolveDataUrls(dataset, data);
  const store = getStore();
  const key = keyOf(id, urls);
  let pending = store.get(key);
  if (!pending) {
    const started: Promise<CompiledLayout> = build(dataset, urls).catch((e: unknown) => {
      if (store.get(key) === started) store.delete(key); // a retry may have replaced it already
      throw e;
    });
    pending = started;
    store.set(key, pending);
  }
  return pending;
};

/** Test hook: forget every loaded dataset. */
export const resetLayoutCache = (): void => {
  getStore().clear();
};

const build = async (dataset: DatasetDescriptor, urls: DataUrls): Promise<CompiledLayout> => {
  const budget = getLoadBudget(looksLikeRendering(), readPuppeteerTimeout());
  const def: CompileDef = {id: dataset.id, layoutId: dataset.layoutId, pages: dataset.pages, linesOnPage: dataset.linesOnPage};
  try {
    const [wordsBytes, layoutBytes] = await Promise.all(PARTS.map((part) => fetchDataBytes(urls[part], part, budget, dataset)));
    const words = parseWordsExport(await decodeJson(wordsBytes as Uint8Array, urls.words, 'words'));
    const rows = parseLayoutRows(await decodeLayoutRows(layoutBytes as Uint8Array, urls.layout, dataset));
    const layout = compileLayout(joinExport(rows, words, def), def, {source: `qul-export:${basename(urls.layout)}`, generatedAt: new Date().toISOString()});
    const problems = checkLayout(layout, def);
    if (problems.length) throw new LayoutProblemsError(problems);
    return layout;
  } catch (e) {
    throw toMushafError(e, dataset, urls);
  }
};

const basename = (url: string): string => url.replace(/[?#].*$/, '').split('/').pop() || url;

const toMushafError = (e: unknown, dataset: DatasetDescriptor, urls: DataUrls): MushafError => {
  if (e instanceof MushafError) return e;
  if (e instanceof ZipError || e instanceof SqliteError || e instanceof DataShapeError || e instanceof LayoutProblemsError) {
    return new MushafError('DATA_INVALID', `The mushaf data for "${dataset.id}" could not be read: ${e.message}\nSources: words ${urls.words}, layout ${urls.layout}. ${HINT}`, {dataset: dataset.id, urls, cause: e});
  }
  return new MushafError('DATA_LOAD_FAILED', `Could not load the mushaf data for "${dataset.id}" (words ${urls.words}, layout ${urls.layout}): ${e instanceof Error ? e.message : String(e)}`, {dataset: dataset.id, urls, cause: e});
};

const previewOf = (bytes: Uint8Array): string => new TextDecoder('utf-8', {fatal: false}).decode(bytes.slice(0, 16)).replace(/[^\x20-\x7e]/g, '.');

const notData = (name: string, bytes: Uint8Array, expected: string): MushafError =>
  new MushafError('DATA_INVALID', `The response for ${name} is not ${expected} (${bytes.length} bytes, starts with "${previewOf(bytes)}"). Check the url. ${HINT}`, {url: name, bytes: bytes.length});

/** The bytes of the export inside a zip, or the bytes as they are. */
const unwrap = async (bytes: Uint8Array, url: string, part: Part): Promise<{readonly bytes: Uint8Array; readonly name: string}> => {
  if (!isZip(bytes)) return {bytes, name: url};
  const entry = pickZipEntry(listZipEntries(bytes), ZIP_PREFERENCE[part]);
  const inner = await readZipEntry(bytes, entry);
  const name = `${url} (${entry.name})`;
  if (isZip(inner)) throw notData(name, inner, `the ${part} export (it is another zip)`);
  return {bytes: inner, name};
};

const decodeText = (bytes: Uint8Array, name: string): string => {
  try {
    return new TextDecoder('utf-8', {fatal: true, ignoreBOM: false}).decode(bytes);
  } catch {
    throw notData(name, bytes, 'UTF-8 text');
  }
};

const decodeJson = async (raw: Uint8Array, url: string, part: Part): Promise<unknown> => {
  const {bytes, name} = await unwrap(raw, url, part);
  const text = decodeText(bytes, name);
  const first = text.trimStart()[0];
  if (first !== '{' && first !== '[') throw notData(name, bytes, 'JSON');
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new MushafError('DATA_INVALID', `The response for ${name} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`, {url: name});
  }
};

/** The `pages` rows of the layout export: a SQLite file, or a JSON array of the same rows. */
const decodeLayoutRows = async (raw: Uint8Array, url: string, dataset: DatasetDescriptor): Promise<SqliteRow[]> => {
  const {bytes, name} = await unwrap(raw, url, 'layout');
  if (isSqlite(bytes)) {
    const rows = readSqliteTable(bytes, 'pages');
    if (rows === null) throw new MushafError('DATA_INVALID', `The layout export at ${name} has no "pages" table. Is it QUL's mushaf-layout export? ${HINT}`, {url: name});
    const info = readSqliteTable(bytes, 'info')?.[0];
    const pages = info?.number_of_pages;
    if (typeof pages === 'number' && pages !== dataset.pages) {
      throw new MushafError('DATA_INVALID', `The layout export at ${name} describes a mushaf of ${pages} pages (${String(info?.name ?? 'unnamed')}); "${dataset.id}" has ${dataset.pages}. Check the url: it should be QUL's layout ${dataset.layoutId}.`, {url: name, pages});
    }
    return rows;
  }
  const text = decodeText(bytes, name);
  if (text.trimStart()[0] !== '[') throw notData(name, bytes, 'a SQLite file or a JSON array of its "pages" rows');
  let rows: unknown;
  try {
    rows = JSON.parse(text);
  } catch (e) {
    throw new MushafError('DATA_INVALID', `The response for ${name} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`, {url: name});
  }
  if (!Array.isArray(rows) || rows.some((r) => r === null || typeof r !== 'object')) throw notData(name, bytes, 'a JSON array of "pages" rows');
  return rows as SqliteRow[];
};

const fetchDataBytes = async (url: string, part: Part, budget: LoadBudget, dataset: DatasetDescriptor): Promise<Uint8Array> => {
  const what = `the mushaf ${part} export of "${dataset.id}"`;
  let last: MushafError | null = null;
  for (let attempt = 1; attempt <= budget.attempts; attempt++) {
    if (attempt > 1) await sleep(budget.backoffMs);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), budget.perAttemptMs);
    try {
      const res = await fetch(url, {mode: 'cors', credentials: 'omit', signal: ctrl.signal});
      if (!res.ok) {
        const final = isFinalStatus(res.status);
        last = new MushafError(
          'DATA_HTTP',
          `HTTP ${res.status} for ${what} at ${url}${final ? `. Check the url — QUL publishes each export under a new prefix; the package pins ${dataset.urls[part]} — or your mirror.` : ` (attempt ${attempt}/${budget.attempts}).`}`,
          {url, part, status: res.status, final},
        );
        if (final) throw last;
        continue;
      }
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if (e instanceof MushafError) {
        if (e.code === 'DATA_HTTP' && e.details?.final) throw e;
        last = e;
      } else if (ctrl.signal.aborted) {
        last = new MushafError('DATA_TIMEOUT', `Fetching ${what} from ${url} timed out after ${budget.perAttemptMs} ms (attempt ${attempt}/${budget.attempts}). ${HINT} Or raise --timeout.`, {url, part, attempt});
      } else {
        last = new MushafError(
          'DATA_NETWORK',
          `Could not fetch ${what} from ${url} (${e instanceof Error ? e.message : String(e)}; attempt ${attempt}/${budget.attempts}). Network error or missing Access-Control-Allow-Origin: a mirror must send CORS headers, or live in public/ and be passed as \`data\` through staticFile().`,
          {url, part, attempt, cause: e},
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw last ?? new MushafError('DATA_NETWORK', `Could not fetch ${what} from ${url}.`, {url, part});
};

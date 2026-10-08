// The page has no public/ folder: the files the Studio would write there (the timings, the
// translation, the Quran text) live in memory instead, under `mem://` URLs. The props point at
// those URLs, and the resolvers read them through `memoryFetch`, a `fetch` that answers `mem://`
// from the store and hands every other URL to the real one. Nothing here touches the network.

/** The scheme of the page's in-memory files: `mem://timings/1.json`. */
export const MEMORY_SCHEME = 'mem://';

/** What a memory file holds: text (JSON), a Blob, or bytes. */
export type MemoryFileData = string | Blob | ArrayBuffer | Uint8Array;

export type MemoryFiles = {
  /** Stores `data` under `path` (with or without `mem://`, leading slashes ignored) and returns its `mem://` URL. Replaces what was there. */
  readonly put: (path: string, data: MemoryFileData) => string;
  /** The data under a path or `mem://` URL, or `undefined`. */
  readonly get: (pathOrUrl: string) => MemoryFileData | undefined;
  readonly has: (pathOrUrl: string) => boolean;
  /** Removes a file; `true` when there was one. */
  readonly delete: (pathOrUrl: string) => boolean;
  readonly clear: () => void;
  /** The stored paths, in the order they were first put. */
  readonly paths: () => readonly string[];
};

/** `true` for a `mem://` URL. */
export const isMemoryUrl = (url: string): boolean => url.startsWith(MEMORY_SCHEME);

/** The store's key for a path or URL: no scheme, no leading slash, no query or fragment. */
export const memoryPath = (pathOrUrl: string): string => {
  const bare = isMemoryUrl(pathOrUrl) ? pathOrUrl.slice(MEMORY_SCHEME.length) : pathOrUrl;
  const withoutSuffix = bare.split(/[?#]/, 1)[0] ?? '';
  const path = withoutSuffix.replace(/^\/+/, '');
  if (path === '') throw new Error(`"${pathOrUrl}" names no memory file: give a path such as "timings/1.json".`);
  return path;
};

/** The `mem://` URL of a path. */
export const memoryUrl = (path: string): string => `${MEMORY_SCHEME}${memoryPath(path)}`;

/** A new, empty store. The page uses one (`memoryFiles`); tests make their own. */
export const createMemoryFiles = (): MemoryFiles => {
  const files = new Map<string, MemoryFileData>();
  return {
    put: (path, data) => {
      const key = memoryPath(path);
      files.set(key, data);
      return `${MEMORY_SCHEME}${key}`;
    },
    get: (pathOrUrl) => files.get(memoryPath(pathOrUrl)),
    has: (pathOrUrl) => files.has(memoryPath(pathOrUrl)),
    delete: (pathOrUrl) => files.delete(memoryPath(pathOrUrl)),
    clear: () => files.clear(),
    paths: () => [...files.keys()],
  };
};

/** The page's files. */
export const memoryFiles: MemoryFiles = createMemoryFiles();

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  json: 'application/json',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  txt: 'text/plain',
};

const contentTypeOf = (path: string, data: MemoryFileData): string => {
  if (typeof Blob !== 'undefined' && data instanceof Blob && data.type !== '') return data.type;
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? (typeof data === 'string' ? 'text/plain' : 'application/octet-stream');
};

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/**
 * A `fetch` that serves `mem://` URLs from `store` (200 with the file, 404 naming the missing path)
 * and passes every other request to `base` (default: the global `fetch`, looked up at call time and
 * called unbound, since a browser's `fetch` throws "Illegal invocation" when called as a method of
 * another object). `blob:` and `data:` URLs go to `base`, which serves them.
 *
 * ```ts
 * const url = memoryFiles.put('timings/1.json', JSON.stringify(timings));
 * await resolveRecitation({...props, timingsFile: url}, {fetch: createMemoryFetch(memoryFiles), staticFile: memoryStaticFile});
 * ```
 */
export const createMemoryFetch =
  (store: MemoryFiles, base?: typeof fetch): typeof fetch =>
  async (input, init) => {
    const url = urlOf(input);
    if (!isMemoryUrl(url)) return base ? base(input, init) : globalThis.fetch(input, init);
    if (init?.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
    const path = memoryPath(url);
    const data = store.get(path);
    if (data === undefined) {
      return new Response(`No file "${path}" in this page's memory: pick the recitation again.`, {
        status: 404,
        statusText: 'Not Found',
        headers: {'content-type': 'text/plain'},
      });
    }
    return new Response(data as BodyInit, {status: 200, headers: {'content-type': contentTypeOf(path, data)}});
  };

/** The page's `fetch`: `mem://` from `memoryFiles`, the rest from the network. */
export const memoryFetch: typeof fetch = createMemoryFetch(memoryFiles);

/**
 * The resolvers' `staticFile`: there is no public/ folder in the browser, so a public path is a
 * memory file (`'timings/1.json'` is `'mem://timings/1.json'`), and a `mem://`, `blob:`, `data:` or
 * http(s) URL is kept as it is.
 */
export const memoryStaticFile = (path: string): string =>
  /^(mem|blob|data|https?):/i.test(path) ? path : memoryUrl(path);

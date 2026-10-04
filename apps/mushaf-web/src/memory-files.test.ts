// The page's in-memory public/ folder: the store, the `mem://` URLs, the fetch wrapper the
// resolvers read through, and the staticFile that maps public paths onto the store.
import {describe, expect, it, vi} from 'vitest';
import {
  createMemoryFetch,
  createMemoryFiles,
  isMemoryUrl,
  MEMORY_SCHEME,
  memoryPath,
  memoryStaticFile,
  memoryUrl,
} from './memory-files';

describe('memoryPath / memoryUrl', () => {
  it('strips the scheme, leading slashes, a query and a fragment', () => {
    expect(memoryPath('mem://timings/1.json')).toBe('timings/1.json');
    expect(memoryPath('/timings/1.json')).toBe('timings/1.json');
    expect(memoryPath('mem:///timings/1.json?v=2#x')).toBe('timings/1.json');
    expect(memoryUrl('timings/1.json')).toBe('mem://timings/1.json');
    expect(memoryUrl('mem://timings/1.json')).toBe('mem://timings/1.json');
  });

  it('refuses a path that names nothing', () => {
    expect(() => memoryPath('')).toThrow(/names no memory file/);
    expect(() => memoryPath(MEMORY_SCHEME)).toThrow(/names no memory file/);
    expect(() => memoryPath('mem://?x')).toThrow(/names no memory file/);
  });

  it('tells mem:// URLs from the rest', () => {
    expect(isMemoryUrl('mem://a.json')).toBe(true);
    expect(isMemoryUrl('https://example.com/a.json')).toBe(false);
    expect(isMemoryUrl('a.json')).toBe(false);
  });
});

describe('createMemoryFiles', () => {
  it('starts empty', () => {
    const store = createMemoryFiles();
    expect(store.paths()).toEqual([]);
    expect(store.get('a.json')).toBeUndefined();
    expect(store.has('a.json')).toBe(false);
  });

  it('puts a file and returns its URL; the path and the URL name the same file', () => {
    const store = createMemoryFiles();
    const url = store.put('/timings/1.json', '{"a":1}');
    expect(url).toBe('mem://timings/1.json');
    expect(store.get(url)).toBe('{"a":1}');
    expect(store.get('timings/1.json')).toBe('{"a":1}');
    expect(store.has('mem://timings/1.json')).toBe(true);
  });

  it('replaces a file put again, keeping its place in paths()', () => {
    const store = createMemoryFiles();
    store.put('a.json', '1');
    store.put('b.json', '2');
    store.put('mem://a.json', '3');
    expect(store.get('a.json')).toBe('3');
    expect(store.paths()).toEqual(['a.json', 'b.json']);
  });

  it('deletes one file and clears them all', () => {
    const store = createMemoryFiles();
    store.put('a.json', '1');
    store.put('b.json', '2');
    expect(store.delete('a.json')).toBe(true);
    expect(store.delete('a.json')).toBe(false);
    expect(store.paths()).toEqual(['b.json']);
    store.clear();
    expect(store.paths()).toEqual([]);
  });

  it('keeps stores apart', () => {
    const one = createMemoryFiles();
    const two = createMemoryFiles();
    one.put('a.json', '1');
    expect(two.has('a.json')).toBe(false);
  });
});

describe('createMemoryFetch', () => {
  it('serves a stored JSON file as a 200 with a JSON content type', async () => {
    const store = createMemoryFiles();
    const url = store.put('timings/1.json', JSON.stringify({surah: 1}));
    const response = await createMemoryFetch(store)(url, {cache: 'no-store'});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({surah: 1});
  });

  it('serves bytes and Blobs, with the Blob’s own type', async () => {
    const store = createMemoryFiles();
    store.put('a.bin', new Uint8Array([1, 2, 3]));
    store.put('b.txt', new Blob(['hello'], {type: 'text/x-custom'}));
    const memFetch = createMemoryFetch(store);
    const bytes = await memFetch('mem://a.bin');
    expect(bytes.headers.get('content-type')).toBe('application/octet-stream');
    expect([...new Uint8Array(await bytes.arrayBuffer())]).toEqual([1, 2, 3]);
    const blob = await memFetch(new URL('mem://b.txt'));
    expect(blob.headers.get('content-type')).toBe('text/x-custom');
    await expect(blob.text()).resolves.toBe('hello');
  });

  it('answers a missing file with a 404 that names it', async () => {
    const response = await createMemoryFetch(createMemoryFiles())('mem://timings/9.json');
    expect(response.status).toBe(404);
    expect(response.ok).toBe(false);
    await expect(response.text()).resolves.toMatch(/"timings\/9\.json"/);
  });

  it('reads the URL of a Request', async () => {
    const store = createMemoryFiles();
    store.put('a.json', '[]');
    const response = await createMemoryFetch(store)({url: 'mem://a.json'} as Request);
    await expect(response.json()).resolves.toEqual([]);
  });

  it('passes every other URL to the base fetch, untouched', async () => {
    const base = vi.fn(async () => new Response('net'));
    const memFetch = createMemoryFetch(createMemoryFiles(), base as unknown as typeof fetch);
    const init = {headers: {accept: 'application/json'}};
    const response = await memFetch('https://api.quran.com/api/v4/x', init);
    await expect(response.text()).resolves.toBe('net');
    expect(base).toHaveBeenCalledWith('https://api.quran.com/api/v4/x', init);
    await memFetch('blob:https://example.com/1234');
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('falls back to the global fetch, looked up at call time', async () => {
    const global = vi.fn(async () => new Response('global'));
    vi.stubGlobal('fetch', global);
    try {
      const response = await createMemoryFetch(createMemoryFiles())('https://example.com/');
      await expect(response.text()).resolves.toBe('global');
      expect(global).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects an aborted request as an AbortError', async () => {
    const store = createMemoryFiles();
    store.put('a.json', '{}');
    const controller = new AbortController();
    controller.abort();
    await expect(createMemoryFetch(store)('mem://a.json', {signal: controller.signal})).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('memoryStaticFile', () => {
  it('maps a public path onto the store', () => {
    expect(memoryStaticFile('timings/1.json')).toBe('mem://timings/1.json');
    expect(memoryStaticFile('/timings/1.json')).toBe('mem://timings/1.json');
  });

  it('keeps mem:, blob:, data: and http(s) URLs', () => {
    for (const url of [
      'mem://timings/1.json',
      'blob:https://example.com/1',
      'data:application/json,{}',
      'https://example.com/a.mp3',
      'http://localhost/a.json',
    ]) {
      expect(memoryStaticFile(url)).toBe(url);
    }
  });
});

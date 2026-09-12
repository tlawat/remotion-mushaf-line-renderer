import {afterEach, describe, expect, it, vi} from 'vitest';
import {ZipError, crc32, inflateRaw, isZip, listZipEntries, pickZipEntry, readZipEntry} from '../../src/data/zip';
import {makeZip} from '../fixtures/make-zip';

const text = (s: string) => new TextEncoder().encode(s);
const big = (n: number) => Uint8Array.from({length: n}, (_, i) => (i * 7 + (i >> 5)) & 0xff);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('zip reader', () => {
  it('lists the central directory and reads stored, deflated and data-descriptor entries', async () => {
    const zip = makeZip([
      {name: 'qpc-v4.json', data: '{"1:1:1":{"id":1}}', method: 8},
      {name: 'notes.txt', data: 'stored as is', method: 0},
      {name: 'streamed.bin', data: big(70_000), method: 8, dataDescriptor: true},
      {name: 'folder/', data: '', method: 0},
    ], {comment: 'made by the test'});
    expect(isZip(zip)).toBe(true);
    const entries = listZipEntries(zip);
    expect(entries.map((e) => [e.name, e.method, e.isDirectory])).toEqual([['qpc-v4.json', 8, false], ['notes.txt', 0, false], ['streamed.bin', 8, false], ['folder/', 0, true]]);
    expect(entries[2]!.uncompressedSize).toBe(70_000);
    expect(new TextDecoder().decode(await readZipEntry(zip, entries[0]!))).toBe('{"1:1:1":{"id":1}}');
    expect(new TextDecoder().decode(await readZipEntry(zip, entries[1]!))).toBe('stored as is');
    expect(await readZipEntry(zip, entries[2]!)).toEqual(big(70_000));
  });

  it('picks the export by extension, else the only file, skipping folders, dotfiles and __MACOSX', () => {
    const entries = listZipEntries(makeZip([
      {name: '__MACOSX/._qpc-v4.json', data: 'resource fork'},
      {name: 'export/', data: ''},
      {name: 'export/.DS_Store', data: 'junk'},
      {name: 'export/qpc-v4.json', data: '{}'},
      {name: 'export/README.txt', data: 'hi'},
    ]));
    expect(pickZipEntry(entries, ['.json']).name).toBe('export/qpc-v4.json');
    expect(pickZipEntry(entries, ['.txt', '.json']).name).toBe('export/README.txt'); // the first extension wins
    // Two real files and neither has the wanted extension: no guessing.
    expect(() => pickZipEntry(entries, ['.db', '.sqlite'])).toThrow(/2 files and none is named \*\.db \/ \*\.sqlite: export\/qpc-v4\.json, export\/README\.txt/);
    expect(pickZipEntry(listZipEntries(makeZip([{name: 'only.bin', data: 'x'}])), ['.db']).name).toBe('only.bin');
  });

  it('is loud about what it does not read', async () => {
    expect(isZip(text('PK\x01\x02'))).toBe(false);
    expect(() => listZipEntries(text('<!DOCTYPE html>'))).toThrow(ZipError);
    expect(() => listZipEntries(text('<!DOCTYPE html>'))).toThrow(/too short|no end-of-central-directory/);
    expect(() => listZipEntries(big(100))).toThrow(/no end-of-central-directory/);
    const zip = makeZip([{name: 'a.json', data: '{"a":1}'}, {name: 'b.json', data: '{"b":2}'}]);
    expect(() => pickZipEntry(listZipEntries(zip), ['.db'])).toThrow(/2 files and none is named \*\.db: a\.json, b\.json/);
    expect(() => pickZipEntry(listZipEntries(makeZip([{name: 'dir/', data: ''}])), ['.json'])).toThrow(/holds no file/);
    // Truncated download: the directory is intact (it is at the end) but the data is not.
    const cut = new Uint8Array(zip.length);
    cut.set(zip.subarray(zip.length - 200), zip.length - 200);
    expect(() => listZipEntries(cut)).not.toThrow();
    await expect(readZipEntry(cut, listZipEntries(cut)[0]!)).rejects.toThrow(/no local header|corrupt|CRC-32/);
    // A flipped byte in the compressed data: the CRC catches it.
    const flipped = makeZip([{name: 'a.json', data: JSON.stringify({x: 'y'.repeat(300)})}]);
    flipped[45] = (flipped[45] as number) ^ 0xff;
    await expect(readZipEntry(flipped, listZipEntries(flipped)[0]!)).rejects.toThrow(/CRC-32|corrupt|bytes after inflating/);
    // Unsupported features are named.
    const method12 = makeZip([{name: 'a.json', data: '{}', method: 0}]);
    method12[8] = 12; // local header method
    const cd = method12.length - 22 - 46 - 6;
    method12[cd + 10] = 12; // central directory method
    expect(() => listZipEntries(method12)).toThrow(/compression method 12/);
    const encrypted = makeZip([{name: 'a.json', data: '{}', method: 0}]);
    encrypted[cd + 8] = 1;
    expect(() => listZipEntries(encrypted)).toThrow(/encrypted/);
    const zip64 = makeZip([{name: 'a.json', data: '{}', method: 0}]);
    zip64.set([0xff, 0xff, 0xff, 0xff], zip64.length - 22 + 16);
    expect(() => listZipEntries(zip64)).toThrow(/ZIP64/);
  });

  it('inflates with DecompressionStream and says so when the runtime has none', async () => {
    const zip = makeZip([{name: 'a.bin', data: big(5000)}]);
    expect(await readZipEntry(zip, listZipEntries(zip)[0]!)).toEqual(big(5000));
    vi.stubGlobal('DecompressionStream', undefined);
    await expect(inflateRaw(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({name: 'ZipError', reason: 'inflate-unsupported', message: expect.stringMatching(/Node needs 20\.12|unzipped files/)});
    vi.unstubAllGlobals();
    await expect(inflateRaw(text('this is not a deflate stream at all'))).rejects.toMatchObject({name: 'ZipError', reason: 'inflate-failed'});
  });

  it('computes CRC-32 the standard way', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

/**
 * A read-only zip reader, enough for QUL's exports (one file, deflated, made by an ordinary tool):
 * the central directory names the entries, the local header leads to the bytes, and
 * `DecompressionStream('deflate-raw')` — every Chromium, Node ≥ 20.12 — inflates them. Anything
 * beyond that (ZIP64, encryption, other methods) is refused by name rather than misread.
 */

export type ZipEntry = {
  readonly name: string;
  /** 0 = stored, 8 = deflated. */
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly crc32: number;
  readonly localHeaderOffset: number;
  readonly isDirectory: boolean;
};

export class ZipError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'ZipError';
    this.reason = reason;
  }
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const EOCD_SIZE = 22;
const MAX_COMMENT = 0xffff;

const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export const isZip = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/** The entries the central directory lists, in directory order. */
export const listZipEntries = (bytes: Uint8Array): ZipEntry[] => {
  if (bytes.length < EOCD_SIZE) throw new ZipError('truncated', `${bytes.length} bytes is too short to be a zip`);
  const dv = view(bytes);
  // The end-of-central-directory record sits in the last 22 bytes, or before a comment of up to 64 KB.
  let eocd = -1;
  for (let i = bytes.length - EOCD_SIZE, min = Math.max(0, i - MAX_COMMENT); i >= min; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('no-eocd', 'no end-of-central-directory record: not a zip, or truncated');
  const entriesTotal = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (
    entriesTotal === 0xffff ||
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff ||
    (eocd >= 20 && dv.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIG)
  ) {
    throw new ZipError('zip64', 'ZIP64 archives are not supported');
  }
  if (cdOffset + cdSize > eocd)
    throw new ZipError('truncated', 'the central directory extends past the end of the file');

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < entriesTotal; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== CENTRAL_SIG)
      throw new ZipError('bad-central-directory', `central directory entry ${n} is malformed`);
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc32 = dv.getUint32(p + 16, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const uncompressedSize = dv.getUint32(p + 24, true);
    const nameLength = dv.getUint16(p + 28, true);
    const extraLength = dv.getUint16(p + 30, true);
    const commentLength = dv.getUint16(p + 32, true);
    const localHeaderOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nameLength));
    if (flags & 0x1) throw new ZipError('encrypted', `"${name}" is encrypted`);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff)
      throw new ZipError('zip64', `"${name}" needs ZIP64, which is not supported`);
    if (method !== 0 && method !== 8)
      throw new ZipError(
        'method',
        `"${name}" uses compression method ${method}; only stored (0) and deflated (8) are supported`,
      );
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      crc32,
      localHeaderOffset,
      isDirectory: name.endsWith('/'),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

/**
 * The one file to read: the first whose name ends with a preferred extension (in the order given),
 * else the only file. Directories, macOS resource forks and dotfiles never count.
 */
export const pickZipEntry = (entries: readonly ZipEntry[], preferredExtensions: readonly string[]): ZipEntry => {
  const files = entries.filter(
    (e) => !e.isDirectory && !e.name.startsWith('__MACOSX/') && !(e.name.split('/').pop() ?? '').startsWith('.'),
  );
  if (files.length === 0) throw new ZipError('empty', 'the zip holds no file');
  for (const extension of preferredExtensions) {
    const hit = files.find((e) => e.name.toLowerCase().endsWith(extension));
    if (hit) return hit;
  }
  if (files.length === 1) return files[0] as ZipEntry;
  throw new ZipError(
    'ambiguous',
    `the zip holds ${files.length} files and none is named *${preferredExtensions.join(' / *')}: ${files.map((e) => e.name).join(', ')}`,
  );
};

/** The entry's bytes, inflated when deflated, checked against the recorded size and CRC-32. */
export const readZipEntry = async (bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> => {
  const dv = view(bytes);
  const h = entry.localHeaderOffset;
  if (h + 30 > bytes.length || dv.getUint32(h, true) !== LOCAL_SIG)
    throw new ZipError('bad-local-header', `"${entry.name}": no local header at offset ${h}`);
  const start = h + 30 + dv.getUint16(h + 26, true) + dv.getUint16(h + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.length)
    throw new ZipError(
      'truncated',
      `"${entry.name}": ${entry.compressedSize} bytes expected at offset ${start}, the file ends at ${bytes.length}`,
    );
  const raw = bytes.subarray(start, end);
  const out = entry.method === 0 ? raw : await inflateRaw(raw);
  if (out.length !== entry.uncompressedSize)
    throw new ZipError(
      'size-mismatch',
      `"${entry.name}": ${out.length} bytes after inflating, the directory says ${entry.uncompressedSize}`,
    );
  const crc = crc32(out);
  if (crc !== entry.crc32)
    throw new ZipError(
      'crc-mismatch',
      `"${entry.name}": CRC-32 ${crc.toString(16)} does not match the recorded ${entry.crc32.toString(16)}; the download is corrupt`,
    );
  return out;
};

/** Raw deflate through the platform's `DecompressionStream`. */
export const inflateRaw = async (bytes: Uint8Array): Promise<Uint8Array> => {
  let stream: DecompressionStream;
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream is undefined');
    stream = new DecompressionStream('deflate-raw');
  } catch (e) {
    throw new ZipError(
      'inflate-unsupported',
      `this runtime cannot inflate a zip (${e instanceof Error ? e.message : String(e)}; Node needs 20.12 or newer). Point \`data\` at the unzipped files instead.`,
    );
  }
  const copy = bytes.slice();
  const body = new Blob([copy.buffer as ArrayBuffer]).stream().pipeThrough(stream);
  try {
    return new Uint8Array(await new Response(body).arrayBuffer());
  } catch (e) {
    throw new ZipError(
      'inflate-failed',
      `the deflate stream is corrupt: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
};

let crcTable: Uint32Array | null = null;

export const crc32 = (bytes: Uint8Array): number => {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = (crcTable[(crc ^ (bytes[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

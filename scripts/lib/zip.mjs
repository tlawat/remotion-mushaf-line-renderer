// Node-side unzip for the dev tools (zlib, no dependencies) — deliberately not the package's own
// reader, so the real export files get checked by two implementations.
import {inflateRawSync} from 'node:zlib';

/** Every file entry of a zip as `{name, data}` (directories skipped). Stored and deflated only. */
export const unzip = (buf) => {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');
  const count = bytes.readUInt16LE(eocd + 10);
  let p = bytes.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (bytes.readUInt32LE(p) !== 0x02014b50) throw new Error(`zip: bad central directory entry ${n}`);
    const method = bytes.readUInt16LE(p + 10);
    const compressedSize = bytes.readUInt32LE(p + 20);
    const nameLength = bytes.readUInt16LE(p + 28);
    const extraLength = bytes.readUInt16LE(p + 30);
    const commentLength = bytes.readUInt16LE(p + 32);
    const local = bytes.readUInt32LE(p + 42);
    const name = bytes.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    p += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error(`zip: "${name}" has no local header at ${local}`);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const raw = bytes.subarray(start, start + compressedSize);
    if (method !== 0 && method !== 8) throw new Error(`zip: "${name}" uses compression method ${method}`);
    entries.push({name, method, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw)});
  }
  return entries;
};

/** The one file of an export zip: the first whose name ends with one of the extensions, else the only file. */
export const unzipExport = (buf, extensions) => {
  const entries = unzip(buf).filter((e) => !e.name.startsWith('__MACOSX/') && !e.name.split('/').pop().startsWith('.'));
  const hit =
    extensions.map((ext) => entries.find((e) => e.name.toLowerCase().endsWith(ext))).find(Boolean) ??
    (entries.length === 1 ? entries[0] : null);
  if (!hit)
    throw new Error(
      `zip: no entry named *${extensions.join(' / *')} among ${entries.map((e) => e.name).join(', ') || 'none'}`,
    );
  return hit;
};

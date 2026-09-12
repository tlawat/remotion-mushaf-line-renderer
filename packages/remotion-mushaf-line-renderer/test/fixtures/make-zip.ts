// A small zip writer for the tests (Node only): stored or deflated entries, optional data
// descriptors and archive comment, the way ordinary tools write them.
import {crc32, deflateRawSync} from 'node:zlib';

export type ZipInput = {
  readonly name: string;
  readonly data: Uint8Array | string;
  /** 0 = stored, 8 = deflated (default). */
  readonly method?: 0 | 8;
  /** Write the sizes and CRC after the data (flag bit 3), as streaming writers do. */
  readonly dataDescriptor?: boolean;
};

const le16 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff];
const le32 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

export const makeZip = (entries: readonly ZipInput[], options: {readonly comment?: string} = {}): Uint8Array => {
  const encoder = new TextEncoder();
  const parts: number[] = [];
  const central: number[] = [];
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const method = entry.method ?? 8;
    const packed = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
    const crc = crc32(data);
    const flags = entry.dataDescriptor ? 0x8 : 0;
    const offset = parts.length;
    parts.push(...le32(0x04034b50), ...le16(20), ...le16(flags), ...le16(method), ...le16(0), ...le16(0));
    parts.push(...le32(entry.dataDescriptor ? 0 : crc), ...le32(entry.dataDescriptor ? 0 : packed.length), ...le32(entry.dataDescriptor ? 0 : data.length));
    parts.push(...le16(name.length), ...le16(0), ...name, ...packed);
    if (entry.dataDescriptor) parts.push(...le32(0x08074b50), ...le32(crc), ...le32(packed.length), ...le32(data.length));
    central.push(...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(flags), ...le16(method), ...le16(0), ...le16(0));
    central.push(...le32(crc), ...le32(packed.length), ...le32(data.length), ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(offset), ...name);
  }
  const comment = encoder.encode(options.comment ?? '');
  const cdOffset = parts.length;
  parts.push(...central);
  parts.push(...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(entries.length), ...le16(entries.length), ...le32(central.length), ...le32(cdOffset), ...le16(comment.length), ...comment);
  return Uint8Array.from(parts);
};

import {MushafError} from '../errors';

const MAGIC: ReadonlyArray<readonly [string, string]> = [
  ['wOF2', 'woff2'],
  ['wOFF', 'woff'],
  ['OTTO', 'otf'],
  ['true', 'ttf'],
];

/** The font format the bytes start with, or `null` when they are not a font. */
export const sniffFont = (bytes: ArrayBuffer): string | null => {
  const b = new Uint8Array(bytes);
  if (b.length < 4) return null;
  if (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) return 'ttf';
  const head = String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!);
  return MAGIC.find(([tag]) => tag === head)?.[1] ?? null;
};

/** Throws FONT_INVALID when a response is not a font file (an HTML error page, an empty body). */
export const assertFontMagic = (bytes: ArrayBuffer, url: string, fontSet: string, page: number): void => {
  if (sniffFont(bytes) !== null) return;
  const b = new Uint8Array(bytes);
  const preview = new TextDecoder('utf-8', {fatal: false}).decode(b.slice(0, 16)).replace(/[^\x20-\x7e]/g, '.');
  const html = preview.trimStart().startsWith('<')
    ? ' It looks like an HTML page: the server answered a missing file with a web page.'
    : '';
  throw new MushafError(
    'FONT_INVALID',
    `The response for mushaf font ${fontSet} page ${page} at ${url} is not a font file (${b.length} bytes, starts with "${preview}").${html}`,
    {url, page, bytes: b.length},
  );
};

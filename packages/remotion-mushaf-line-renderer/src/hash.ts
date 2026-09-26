/** 32-bit FNV-1a over UTF-16 code units: stable short names for idents and families. Not cryptographic. */
export const fnv1a32 = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

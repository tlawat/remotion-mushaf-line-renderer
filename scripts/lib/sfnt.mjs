// Minimal TrueType/OpenType (sfnt) reader: table directory, unitsPerEm, cmap (formats 4 and 12),
// hmtx advances and the family name. Enough to check that the plain and tajweed page fonts agree
// and that no standalone word has zero advance. WOFF2 is not handled (Node has no WOFF2 decoder);
// use the `ttf` variant from the CDN for these checks.

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const i16 = (b, o) => {
  const v = u16(b, o);
  return v & 0x8000 ? v - 0x10000 : v;
};

export const detectFontMagic = (bytes) => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'true' || u32(b, 0) === 0x00010000) return 'ttf';
  return null;
};

export const parseSfnt = (bytes) => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const magic = detectFontMagic(b);
  if (magic !== 'ttf' && magic !== 'otf') throw new Error(`parseSfnt: not an sfnt font (magic ${magic ?? 'unknown'})`);
  const numTables = u16(b, 4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables.set(String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]), {
      offset: u32(b, o + 8),
      length: u32(b, o + 12),
    });
  }
  const need = (tag) => {
    const t = tables.get(tag);
    if (!t) throw new Error(`parseSfnt: missing ${tag} table`);
    return t;
  };

  const head = need('head');
  const unitsPerEm = u16(b, head.offset + 18);
  const hhea = need('hhea');
  const ascender = i16(b, hhea.offset + 4);
  const descender = i16(b, hhea.offset + 6);
  const lineGap = i16(b, hhea.offset + 8);
  const numberOfHMetrics = u16(b, hhea.offset + 34);
  const maxp = need('maxp');
  const numGlyphs = u16(b, maxp.offset + 4);
  const hmtx = need('hmtx');
  const advanceOf = (gid) => {
    const idx = Math.min(gid, numberOfHMetrics - 1);
    return u16(b, hmtx.offset + idx * 4);
  };

  // cmap: prefer (3,10) format 12, then (3,1)/(0,x) format 4.
  const cmap = need('cmap');
  const n = u16(b, cmap.offset + 2);
  const subtables = [];
  for (let i = 0; i < n; i++) {
    const o = cmap.offset + 4 + i * 8;
    subtables.push({platform: u16(b, o), encoding: u16(b, o + 2), offset: cmap.offset + u32(b, o + 4)});
  }
  const glyphByCodePoint = new Map();
  const readFormat4 = (st) => {
    const segX2 = u16(b, st + 6);
    const seg = segX2 / 2;
    const ends = st + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffsets = deltas + segX2;
    for (let s = 0; s < seg; s++) {
      const end = u16(b, ends + s * 2);
      const start = u16(b, starts + s * 2);
      const delta = u16(b, deltas + s * 2);
      const ro = u16(b, rangeOffsets + s * 2);
      if (start === 0xffff) continue;
      for (let cp = start; cp <= end; cp++) {
        let gid;
        if (ro === 0) {
          gid = (cp + delta) & 0xffff;
        } else {
          const addr = rangeOffsets + s * 2 + ro + (cp - start) * 2;
          gid = u16(b, addr);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid !== 0) glyphByCodePoint.set(cp, gid);
      }
    }
  };
  const readFormat12 = (st) => {
    const groups = u32(b, st + 12);
    for (let g = 0; g < groups; g++) {
      const o = st + 16 + g * 12;
      const start = u32(b, o);
      const end = u32(b, o + 4);
      const gid0 = u32(b, o + 8);
      for (let cp = start; cp <= end; cp++) glyphByCodePoint.set(cp, gid0 + (cp - start));
    }
  };
  const preferred =
    subtables.find((s) => s.platform === 3 && s.encoding === 10) ??
    subtables.find((s) => s.platform === 3 && s.encoding === 1) ??
    subtables[0];
  if (!preferred) throw new Error('parseSfnt: cmap has no subtables');
  const format = u16(b, preferred.offset);
  if (format === 4) readFormat4(preferred.offset);
  else if (format === 12) readFormat12(preferred.offset);
  else throw new Error(`parseSfnt: unsupported cmap format ${format}`);

  let family = null;
  const name = tables.get('name');
  if (name) {
    const count = u16(b, name.offset + 2);
    const strOff = u16(b, name.offset + 4);
    for (let i = 0; i < count; i++) {
      const r = name.offset + 6 + i * 12;
      const platform = u16(b, r);
      const nameId = u16(b, r + 6);
      const len = u16(b, r + 8);
      const off = u16(b, r + 10);
      if (nameId === 1 && (platform === 3 || platform === 0)) {
        const start = name.offset + strOff + off;
        let s = '';
        for (let j = 0; j < len; j += 2) s += String.fromCharCode(u16(b, start + j));
        family = s;
        break;
      }
    }
  }

  const advances = new Map();
  for (const [cp, gid] of glyphByCodePoint) advances.set(cp, advanceOf(gid));

  return {
    unitsPerEm,
    ascender,
    descender,
    lineGap,
    numGlyphs,
    family,
    hasTable: (tag) => tables.has(tag),
    glyphByCodePoint,
    advances,
    advanceOfText: (text) => {
      let total = 0;
      for (const ch of text) {
        const adv = advances.get(ch.codePointAt(0));
        if (adv === undefined) return null;
        total += adv;
      }
      return total;
    },
  };
};

/** Compares two page fonts: identical mapped code points and identical advances. */
export const compareFonts = (a, b) => {
  const problems = [];
  if (a.unitsPerEm !== b.unitsPerEm) problems.push(`unitsPerEm ${a.unitsPerEm} vs ${b.unitsPerEm}`);
  const cpsA = [...a.advances.keys()].filter((cp) => cp >= 0xfc41 && cp <= 0xfcfc).sort((x, y) => x - y);
  const cpsB = [...b.advances.keys()].filter((cp) => cp >= 0xfc41 && cp <= 0xfcfc).sort((x, y) => x - y);
  if (cpsA.join(',') !== cpsB.join(',')) problems.push(`mapped code points differ (${cpsA.length} vs ${cpsB.length})`);
  for (const cp of cpsA) {
    if (a.advances.get(cp) !== b.advances.get(cp))
      problems.push(`advance of U+${cp.toString(16).toUpperCase()}: ${a.advances.get(cp)} vs ${b.advances.get(cp)}`);
  }
  return problems;
};

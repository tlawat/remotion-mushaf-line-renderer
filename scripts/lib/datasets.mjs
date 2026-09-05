// Dataset descriptors shared by the compiler, its tests and the package's data tests.
// The TypeScript registry in packages/remotion-mushaf-line-renderer/src/mushafs.ts mirrors the
// numbers below; a unit test asserts they agree.

export const CDN_BASE = 'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts';

/** KFGQPC V4 (1441H print) — QUL mushaf layout id 19. */
export const QPC_V4 = {
  dataset: 'qpc-v4',
  layoutId: 19,
  pages: 604,
  linesPerPage: 15,
  /** Pages 1 and 2 (Al-Fatihah and the opening of Al-Baqarah) carry 8 lines, all centred. */
  linesOnPage: (page) => (page <= 2 ? 8 : 15),
  previewUrl: (page) => `https://qul.tarteel.ai/mushaf_layouts/19?page_number=${page}`,
  fontSets: {
    'qpc-v4': {dir: 'v4', query: ''},
    'qpc-v4-tajweed': {dir: 'v4-tajweed', query: '?v=3.1'},
  },
  fontUrl: (set, page, format) => {
    const spec = QPC_V4.fontSets[set];
    if (!spec) throw new Error(`Unknown font set ${set}`);
    return `${CDN_BASE}/${spec.dir}/${format}/p${page}.${format}${spec.query}`;
  },
  invariants: {
    lines: 9046,
    ayahLines: 8820,
    surahNameLines: 114,
    basmallahLines: 112,
    centeredAyahLines: 29,
    words: 83668,
    ayahs: 6236,
    codePointMin: 0xfc41,
    codePointMax: 0xfcfc,
  },
  /** Structural spot checks, evaluated by validateLayout(). */
  expectations: [
    {page: 1, line: 1, type: 'surah_name', surah: 1},
    {page: 1, line: 2, type: 'ayah', firstLocation: '1:1:1', lastLocation: '1:1:5', lastKind: 'end', centered: true},
    {page: 1, lines: 8, allCentered: true},
    {page: 2, lines: 8, allCentered: true},
    {page: 187, line: 1, type: 'surah_name', surah: 9},
    {page: 187, noBasmallah: true},
    {page: 255, line: 3, type: 'surah_name', surah: 14},
    {page: 255, line: 4, type: 'basmallah', surah: 14},
    {page: 603, surahNameLines: 3},
    {page: 604, surahNameLines: 3},
  ],
};

export const KNOWN_KINDS = {
  word: 'w',
  end: 'e',
  pause: 'p',
  sajdah: 's',
  'rub-el-hizb': 'h',
};

// Dataset descriptors shared by the compiler, its tests and the package's data tests.
// The TypeScript registry in packages/remotion-mushaf-line-renderer/src/mushafs.ts mirrors the
// numbers below; a unit test asserts they agree.

export const QUL_FONTS = 'https://static-cdn.tarteel.ai/qul/fonts';
export const CDN_BASE = `${QUL_FONTS}/quran_fonts`;

/** QUL's raw exports on Tarteel's CDN; the path prefix changes on every re-export, so a URL pins one publication. */
export const QUL_EXPORTS = 'https://s3.us-east-1.wasabisys.com/static-cdn.tarteel.ai/qul-exports';

/** KFGQPC V4 (1441H print) — QUL mushaf layout id 19. */
export const QPC_V4 = {
  dataset: 'qpc-v4',
  layoutId: 19,
  pages: 604,
  linesPerPage: 15,
  /** Pages 1 and 2 (Al-Fatihah and the opening of Al-Baqarah) carry 8 lines, all centred. */
  linesOnPage: (page) => (page <= 2 ? 8 : 15),
  /**
   * Every line of these pages is centred as printed (the framed opening pages; QUL's preview shows
   * them so), whatever the layout export's is_centered says: the export flags page 2 line 5 (2:3:6)
   * as justified. Applied by the export readers, the package's and the dev tools' alike; with it
   * the exports compile to the very layout the preview pages compile to.
   */
  centeredPages: [1, 2],
  previewUrl: (page) => `https://qul.tarteel.ai/mushaf_layouts/19?page_number=${page}`,
  /**
   * The two exports the package fetches at runtime (src/mushafs.ts pins the same URLs; a unit test
   * keeps them equal): the words of the QPC V4 script as JSON, and the 15-line layout as SQLite.
   */
  exports: {
    words: `${QUL_EXPORTS}/quran-script/1748433334-i11ov-qpc-v4.json.zip`,
    layout: `${QUL_EXPORTS}/mushaf-layout/1748288079-a96tc-qpc-v4-tajweed-15-lines.db.zip`,
  },
  fontSets: {
    'qpc-v4': {dir: 'v4', query: ''},
    'qpc-v4-tajweed': {dir: 'v4-tajweed', query: '?v=3.1'},
  },
  fontUrl: (set, page, format) => {
    const spec = QPC_V4.fontSets[set];
    if (!spec) throw new Error(`Unknown font set ${set}`);
    return `${CDN_BASE}/${spec.dir}/${format}/p${page}.${format}${spec.query}`;
  },
  /**
   * The two fonts that are not per page, as QUL publishes them (the package's registry pins the
   * same URLs): the surah-name font (QUL resource 237, the 114 names and the basmalah) and
   * quran-common (QUL resource 459, the juz names and the surah-header frame). Mirrored by
   * `qul fonts` into example/public/fonts/<id>/<file>, the layout a `fontSrc` resolver serves.
   */
  sharedFonts: {
    'surah-names-v4': {dir: 'surah_names_v4', file: 'surah_names', fileName: 'surah_names.woff2', resource: 237},
    'quran-common': {dir: 'common', file: 'quran-common', fileName: 'quran-common.woff2', resource: 459},
  },
  sharedFontUrl: (id, format) => {
    const spec = QPC_V4.sharedFonts[id];
    if (!spec) throw new Error(`Unknown shared font ${id}`);
    return `${QUL_FONTS}/${spec.dir}/${spec.file}.${format}`;
  },
  invariants: {
    lines: 9046,
    ayahLines: 8820,
    surahNameLines: 114,
    basmallahLines: 112,
    // Pages 1-2 (13 lines) plus the short last line of a surah elsewhere. The uploaded notes count
    // 29 from an older SQLite export; QUL's current layout marks 30 (every one at the end of a
    // surah, which validateLayout checks structurally).
    centeredAyahLines: 30,
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

import {describeValue, MushafError} from '../errors';
import type {
  MushafColorPart,
  MushafFontSet,
  MushafId,
  MushafMetrics,
  MushafSelection,
  MushafSharedFont,
  MushafThemeSelection,
} from '../types';
import {type ResolvedTheme, resolveTheme} from './themes';

export type DatasetId = 'qpc-v4';

/**
 * A dataset is what a mushaf's lines are built from at runtime: QUL's two raw exports, the words
 * of the script (JSON) and the line layout (SQLite), fetched, joined and compiled in memory. The
 * package ships none of it.
 */
export type DatasetDescriptor = {
  readonly id: DatasetId;
  /** QUL mushaf layout id. */
  readonly layoutId: number;
  readonly pages: number;
  readonly linesOnPage: (page: number) => number;
  /**
   * Pages whose every line is printed centred, whatever the layout export says of them. The two
   * opening pages of the V4 print sit in an ornamental frame with every line centred (QUL's own
   * preview shows them so); QUL's layout export flags page 2 line 5 (2:3:6, eight words) as
   * justified, which `fit="line"` would stretch across the measure. With this rule the layout
   * built from the exports equals the one compiled from QUL's preview pages, page for page.
   */
  readonly centeredPages: readonly number[];
  /**
   * Default sources: QUL's exports on Tarteel's CDN. The path prefix changes on every re-export,
   * so a pinned URL names one publication; `bun run qul data` mirrors and checks it.
   */
  readonly urls: {readonly words: string; readonly layout: string};
};

const QUL_EXPORTS = 'https://s3.us-east-1.wasabisys.com/static-cdn.tarteel.ai/qul-exports';

export const DATASETS: Readonly<Record<DatasetId, DatasetDescriptor>> = {
  'qpc-v4': {
    id: 'qpc-v4',
    layoutId: 19,
    pages: 604,
    linesOnPage: (page) => (page <= 2 ? 8 : 15),
    centeredPages: [1, 2],
    urls: {
      words: `${QUL_EXPORTS}/quran-script/1748433334-i11ov-qpc-v4.json.zip`,
      layout: `${QUL_EXPORTS}/mushaf-layout/1748288079-a96tc-qpc-v4-tajweed-15-lines.db.zip`,
    },
  },
};

export const getDataset = (id: DatasetId): DatasetDescriptor => DATASETS[id];

/** One of the font file sets a mushaf is published in (QUL publishes a plain and a colour set). */
export type FontSetDefinition = {
  readonly id: MushafFontSet;
  /** COLR/CPAL colour font: CSS `color` does not apply to its glyphs. */
  readonly colr: boolean;
  /** CPAL base palettes the font carries, in index order. Empty for a monochrome set. */
  readonly palettes: readonly number[];
  /** Number of CPAL entries per palette (the entries `override-colors` can address). 0 for a monochrome set. */
  readonly entries: number;
  /** Which CPAL entries paint which part of the glyphs; all empty for a monochrome set. */
  readonly colorParts: Readonly<Record<MushafColorPart, readonly number[]>>;
  /** The family under the default source (`fontSrc: 'cdn'`); other sources add a suffix. */
  readonly fontFamily: (page: number) => string;
  /** The file format QUL publishes for this page: woff2, or woff where the CDN has no woff2. */
  readonly format: (page: number) => 'woff2' | 'woff';
  /** QUL's CDN URL of the page font. */
  readonly cdnUrl: (page: number) => string;
};

/** Vertical metrics a font face is registered with (`ascentOverride` / `descentOverride`). */
export type FontMetrics = {
  readonly unitsPerEm: number;
  readonly ascent: number;
  /** Negative, as in the font's hhea table. */
  readonly descent: number;
};

/**
 * A font that is not per page: one file for the whole mushaf. QUL publishes two for the V4 print,
 * the surah-name font (QUL resource 237: the 114 names and the basmalah) and `quran-common` (QUL
 * resource 459: the 30 juz names, the ornamental surah-header frame and a few icons). Neither ships
 * in the fonts packages; they are fetched from QUL's CDN, or from the URLs a `fontSrc` resolver gives.
 */
export type SharedFontDefinition = {
  readonly id: MushafSharedFont;
  /** QUL's title for the font, for messages. */
  readonly name: string;
  /** The QUL resource page the font is published on. */
  readonly qulResource: string;
  /** The family under the default source (`fontSrc: 'cdn'`); other sources add a suffix. */
  readonly fontFamily: string;
  readonly format: 'woff2';
  /** The file's name on QUL's CDN (`surah_names.woff2`, `quran-common.woff2`). */
  readonly fileName: string;
  readonly cdnUrl: string;
  /** The face is registered with these pinned, so a glyph sits at the same place on every platform. */
  readonly metrics: FontMetrics;
};

/**
 * One thing drawn from a shared font: the text to set, the font it lives in, and where its ink sits
 * relative to the baseline, so the renderer can centre it in a box. `bandCenter` is the middle of
 * the glyph's vertical extent in font units above the baseline (the median over a family of glyphs,
 * so every surah name, or every juz name, shares one baseline).
 */
export type MushafGlyph = {
  readonly font: 'surahNames' | 'common';
  readonly text: string;
  readonly bandCenter: number;
  /** For messages and DOM hooks: `surah-name`, `basmalah`, `juz-name`, `frame`. */
  readonly kind: 'surah-name' | 'basmalah' | 'juz-name' | 'frame';
};

export type MushafGlyphs = {
  /** The name of surah 1-114, as printed above its first ayah. */
  readonly surahName: (surah: number) => MushafGlyph;
  /** The basmalah as printed under a surah header (set on the page baseline like a line of text). */
  readonly basmalah: MushafGlyph;
  /** The name of juz 1-30, written out ("the first juz"). */
  readonly juzName: (juz: number) => MushafGlyph;
  /** The ornamental frame a surah name is printed in; `advance` is its width in font units. */
  readonly headerFrame: MushafGlyph & {readonly advance: number};
};

export type MushafDefinition = {
  readonly id: MushafId;
  readonly name: string;
  /** QUL mushaf layout id. */
  readonly layoutId: number;
  readonly pages: number;
  readonly linesPerPage: number;
  readonly linesOnPage: (page: number) => number;
  readonly dataset: DatasetId;
  readonly fontSets: {
    /** Monochrome outlines that follow CSS `color`: the `'plain'` theme. */
    readonly plain: FontSetDefinition;
    /** The COLR/CPAL colour font: every other theme. */
    readonly color: FontSetDefinition;
  };
  readonly sharedFonts: {
    /** QUL's V4 surah-name font: the 114 surah names and the basmalah. */
    readonly surahNames: SharedFontDefinition;
    /** QUL's `quran-common` font: the juz names and the surah-header frame. */
    readonly common: SharedFontDefinition;
  };
  readonly glyphs: MushafGlyphs;
  readonly metrics: MushafMetrics;
  readonly invariants: {
    readonly lines: number;
    readonly ayahLines: number;
    readonly surahNameLines: number;
    readonly basmallahLines: number;
    readonly centeredAyahLines: number;
    readonly words: number;
  };
};

const QUL_FONTS = 'https://static-cdn.tarteel.ai/qul/fonts';
const CDN = `${QUL_FONTS}/quran_fonts`;

/**
 * Gaps on QUL's CDN found by `scripts/qul.mjs etags` (recorded in scripts/cdn-etags.json):
 * page → the format that is served instead of woff2. A unit test keeps this in sync with the file.
 */
export const CDN_FORMAT_EXCEPTIONS: Readonly<Record<string, Readonly<Record<number, 'woff'>>>> = {
  'qpc-v4-tajweed': {328: 'woff'},
};

/**
 * The V4 colour font's sixteen CPAL entries (read from its CPAL table; the COLR layer counts of the
 * fixture fonts and QUL's own palette rules say what each paints): 0 the letters, 1, 2 and 15 the
 * greys of silent letters, 3-9 the seven tajweed rule colours, 10-13 the ayah rosette (10 the
 * jewel, 11 the petals, 12 the disc, 13 the frame, curls and the number inside it), and 14 the thin
 * rings drawn around the small connective letters and their vowel: over all 604 page fonts, its
 * 3,065 layers are every one a stroked ring and never a letter, so it is its own part.
 *
 * 13 is its own part because the font paints it in the letter colour (black in palettes 0 and 3,
 * white in 4) yet QUL's black theme needs it apart from the letters.
 */
const V4_COLOR_PARTS: Readonly<Record<MushafColorPart, readonly number[]>> = {
  ink: [0],
  silent: [1, 2, 15],
  outline: [14],
  rules: [3, 4, 5, 6, 7, 8, 9],
  frame: [13],
  accent: [11],
  detail: [10],
  background: [12],
};

const NO_COLOR_PARTS: Readonly<Record<MushafColorPart, readonly number[]>> = {
  ink: [],
  silent: [],
  outline: [],
  rules: [],
  frame: [],
  accent: [],
  detail: [],
  background: [],
};

const v4FontSet = (id: MushafFontSet, dir: 'v4' | 'v4-tajweed', colr: boolean): FontSetDefinition => ({
  id,
  colr,
  // The V4 colour font ships six CPAL palettes (see docs/kfgqpc-v4-rendering-notes.md): 0-2 tajweed,
  // 3-5 black/white text with coloured ayah markers. The plain set has none.
  palettes: colr ? [0, 1, 2, 3, 4, 5] : [],
  entries: colr ? 16 : 0,
  colorParts: colr ? V4_COLOR_PARTS : NO_COLOR_PARTS,
  fontFamily: (page) => `mushaf-${id}-p${page}`,
  // QUL's own pages request the tajweed set with `?v=3.1`, so that cache key is the warm one on
  // Cloudflare; the plain set is never requested by QUL, so it stays a bare path.
  format: (page) => CDN_FORMAT_EXCEPTIONS[id]?.[page] ?? 'woff2',
  cdnUrl: (page) => {
    const format = CDN_FORMAT_EXCEPTIONS[id]?.[page] ?? 'woff2';
    return `${CDN}/${dir}/${format}/p${page}.${format}${colr ? '?v=3.1' : ''}`;
  },
});

/**
 * The two shared fonts of the V4 print, as QUL publishes them. The surah-name font carries the page
 * fonts' own vertical metrics (2500 units per em, ascent 3940, descent -2520), so a glyph of it set
 * at the page's type size sits on the page's baseline; `quran-common` is a 1024-unit font with its
 * own metrics. It is an OpenType-SVG font with a CPAL table and no COLR table: Chromium (and so every
 * Remotion render) draws its outlines in the CSS `color`; Firefox and Safari paint the SVG colours.
 */
const V4_SHARED_FONTS: MushafDefinition['sharedFonts'] = {
  surahNames: {
    id: 'surah-names-v4',
    name: 'V4 Surah Name Color Font',
    qulResource: 'https://qul.tarteel.ai/resources/font/237',
    fontFamily: 'mushaf-surah-names-v4',
    format: 'woff2',
    fileName: 'surah_names.woff2',
    cdnUrl: `${QUL_FONTS}/surah_names_v4/surah_names.woff2`,
    metrics: {unitsPerEm: 2500, ascent: 3940, descent: -2520},
  },
  common: {
    id: 'quran-common',
    name: 'Juz name font (quran-common)',
    qulResource: 'https://qul.tarteel.ai/resources/font/459',
    fontFamily: 'mushaf-quran-common',
    format: 'woff2',
    fileName: 'quran-common.woff2',
    cdnUrl: `${QUL_FONTS}/common/quran-common.woff2`,
    metrics: {unitsPerEm: 1024, ascent: 819, descent: -205},
  },
};

/**
 * The surah-name font maps the 114 names to code points in the Arabic Presentation Forms-A block,
 * with gaps: U+FC45-U+FC64 for surahs 1-21 and U+FB51-U+FBEB for 22-114, in surah order within each
 * range (read from the font's cmap; a unit test checks the mirrored file against this table).
 */
const V4_SURAH_NAME_GLYPHS =
  '\uFC45\uFC46\uFC47\uFC4A\uFC4B\uFC4E\uFC4F\uFC51\uFC52\uFC53\uFC55\uFC56\uFC58\uFC5A\uFC5B\uFC5C\uFC5D\uFC5E\uFC61\uFC62\uFC64' +
  '\uFB51\uFB52\uFB54\uFB55\uFB57\uFB58\uFB5A\uFB5B\uFB5D\uFB5E\uFB60\uFB61\uFB63\uFB64\uFB66\uFB67\uFB69\uFB6A\uFB6C\uFB6D' +
  '\uFB6F\uFB70\uFB72\uFB73\uFB75\uFB76\uFB78\uFB79\uFB7B\uFB7C\uFB7E\uFB7F\uFB81\uFB82\uFB84\uFB85\uFB87\uFB88\uFB8A\uFB8B' +
  '\uFB8D\uFB8E\uFB90\uFB91\uFB93\uFB94\uFB96\uFB97\uFB99\uFB9A\uFB9C\uFB9D\uFB9F\uFBA0\uFBA2\uFBA3\uFBA5\uFBA6\uFBA8\uFBA9' +
  '\uFBAB\uFBAC\uFBAE\uFBAF\uFBB1\uFBB2\uFBB4\uFBB5\uFBB7\uFBB8\uFBBA\uFBBB\uFBBD\uFBBE\uFBC0\uFBC1\uFBD3\uFBD4\uFBD6\uFBD7' +
  '\uFBD9\uFBDA\uFBDC\uFBDD\uFBDF\uFBE0\uFBE2\uFBE3\uFBE5\uFBE6\uFBE8\uFBE9\uFBEB';

export const SURAH_COUNT = 114;
export const JUZ_COUNT = 30;

export const assertSurahNumber = (surah: unknown): number => {
  if (typeof surah !== 'number' || !Number.isInteger(surah) || surah < 1 || surah > SURAH_COUNT) {
    throw new MushafError(
      'SURAH_OUT_OF_RANGE',
      `surah must be an integer from 1 to ${SURAH_COUNT}, got ${describeValue(surah)}.`,
      {surah},
    );
  }
  return surah;
};

export const assertJuzNumber = (juz: unknown): number => {
  if (typeof juz !== 'number' || !Number.isInteger(juz) || juz < 1 || juz > JUZ_COUNT) {
    throw new MushafError(
      'JUZ_OUT_OF_RANGE',
      `juz must be an integer from 1 to ${JUZ_COUNT}, got ${describeValue(juz)}.`,
      {
        juz,
      },
    );
  }
  return juz;
};

/**
 * Where each kind of glyph sits: the middle of its vertical extent, in font units above the baseline,
 * as the median over its family of glyphs in the fonts as published (surah names -987..1843, juz
 * names -334..725, the frame -188..828). The basmalah is set on the
 * page baseline like a line of text, so its band is not used.
 */
const V4_GLYPHS: MushafGlyphs = {
  surahName: (surah) => ({
    font: 'surahNames',
    kind: 'surah-name',
    text: V4_SURAH_NAME_GLYPHS[assertSurahNumber(surah) - 1] as string,
    bandCenter: 449,
  }),
  // The four glyphs QUL sets the basmalah with (bismi llahi r-rahmani r-rahim with its long kashida), in visual order.
  basmalah: {font: 'surahNames', kind: 'basmalah', text: '\uFCAA\uFCAB\uFCAE\uFCB4', bandCenter: 1418},
  // quran-common reaches them through `liga` ("juz001"); the ligature glyphs are addressed directly
  // so the text never depends on a shaping feature being on.
  juzName: (juz) => ({
    font: 'common',
    kind: 'juz-name',
    text: String.fromCodePoint(0xe000 + assertJuzNumber(juz)),
    bandCenter: 192,
  }),
  // The `header` ligature: an ornamental frame 8,240 units wide with the name's box in the middle.
  headerFrame: {font: 'common', kind: 'frame', text: '\uE000', bandCenter: 320, advance: 8240},
};

/** Internal registry. Adding a mushaf is one row here plus one dataset descriptor. */
export const MUSHAFS = {
  'qpc-v4': {
    id: 'qpc-v4',
    name: 'KFGQPC V4 1441H',
    layoutId: DATASETS['qpc-v4'].layoutId,
    pages: DATASETS['qpc-v4'].pages,
    linesPerPage: 15,
    linesOnPage: DATASETS['qpc-v4'].linesOnPage,
    dataset: 'qpc-v4',
    fontSets: {
      plain: v4FontSet('qpc-v4', 'v4', false),
      color: v4FontSet('qpc-v4-tajweed', 'v4-tajweed', true),
    },
    sharedFonts: V4_SHARED_FONTS,
    glyphs: V4_GLYPHS,
    metrics: {unitsPerEm: 2500, ascent: 3940, descent: -2520, referenceLineWidth: 42501},
    invariants: {
      lines: 9046,
      ayahLines: 8820,
      surahNameLines: 114,
      basmallahLines: 112,
      centeredAyahLines: 30,
      words: 83668,
    },
  },
} as const satisfies Record<string, Omit<MushafDefinition, 'id'> & {id: string}>;

export const MUSHAF_IDS = Object.keys(MUSHAFS) as ReadonlyArray<MushafId>;

/** What you get when nothing is said: the V4 mushaf, plain glyphs that follow CSS `color`. */
export const DEFAULT_MUSHAF: MushafId = 'qpc-v4';
export const DEFAULT_THEME: MushafThemeSelection = 'plain';

export const isMushafId = (id: unknown): id is MushafId => typeof id === 'string' && Object.hasOwn(MUSHAFS, id);

export const getMushafDefinition = (id: unknown): MushafDefinition => {
  if (!isMushafId(id)) {
    throw new MushafError(
      'UNKNOWN_MUSHAF',
      `Unknown mushaf ${describeValue(id)}. Known mushafs: ${MUSHAF_IDS.join(', ')}.`,
      {
        mushaf: id,
      },
    );
  }
  return MUSHAFS[id];
};

/** The mushaf's font metrics  -  what `fontSizeForWidth()` divides by. */
export const getMushafMetrics = (mushaf?: MushafId): MushafMetrics =>
  getMushafDefinition(mushaf ?? DEFAULT_MUSHAF).metrics;

/** The font set by its id, for data that names one. */
export const fontSetById = (def: MushafDefinition, id: unknown): FontSetDefinition | undefined =>
  [def.fontSets.plain, def.fontSets.color].find((set) => set.id === id);

export const SHARED_FONT_IDS: readonly MushafSharedFont[] = ['surah-names-v4', 'quran-common'];

/** A shared font by its public id, or a loud error naming the two there are. */
export const getSharedFont = (def: MushafDefinition, id: unknown): SharedFontDefinition => {
  const font = [def.sharedFonts.surahNames, def.sharedFonts.common].find((f) => f.id === id);
  if (!font) {
    throw new MushafError(
      'UNKNOWN_FONT',
      `font must be one of ${SHARED_FONT_IDS.map((f) => `'${f}'`).join(', ')} for "${def.id}", got ${describeValue(id)}.`,
      {mushaf: def.id, font: id},
    );
  }
  return font;
};

/** The shared font a glyph is drawn from. */
export const fontOfGlyph = (def: MushafDefinition, glyph: MushafGlyph): SharedFontDefinition =>
  def.sharedFonts[glyph.font];

/** A selection with every default filled in and every value checked. */
export type ResolvedSelection = {
  readonly def: MushafDefinition;
  readonly fontSet: FontSetDefinition;
  /** `null` for the plain theme: the monochrome font has no palettes. */
  readonly theme: ResolvedTheme | null;
};

/**
 * Turns `{mushaf?, theme?}` into the mushaf definition, the font set to paint with and the resolved
 * theme. `'plain'` uses the monochrome set and needs no palette; every other theme uses the colour
 * font with the palette rule `resolveTheme()` works out (see `usePaletteRule`).
 */
export const resolveSelection = ({mushaf, theme = DEFAULT_THEME}: MushafSelection): ResolvedSelection => {
  const def = getMushafDefinition(mushaf ?? DEFAULT_MUSHAF);
  if (theme === 'plain') return {def, fontSet: def.fontSets.plain, theme: null};
  const fontSet = def.fontSets.color;
  return {def, fontSet, theme: resolveTheme(fontSet, theme)};
};

export const assertPage = (def: MushafDefinition, page: unknown): number => {
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > def.pages) {
    throw new MushafError(
      'PAGE_OUT_OF_RANGE',
      `page must be an integer from 1 to ${def.pages} for "${def.id}", got ${describeValue(page)}.`,
      {mushaf: def.id, page},
    );
  }
  return page;
};

export const assertLine = (def: MushafDefinition, page: number, line: unknown): number => {
  const max = def.linesOnPage(page);
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1 || line > max) {
    throw new MushafError(
      'LINE_OUT_OF_RANGE',
      `line must be an integer from 1 to ${max} on page ${page} of "${def.id}" (this page has ${max} lines), got ${describeValue(line)}.`,
      {mushaf: def.id, page, line},
    );
  }
  return line;
};

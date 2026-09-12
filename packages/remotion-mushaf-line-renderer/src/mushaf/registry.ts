import {describeValue, MushafError} from '../errors';
import type {
  MushafColorPart,
  MushafFontSet,
  MushafId,
  MushafMetrics,
  MushafSelection,
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
  readonly fontFamily: (page: number) => string;
  readonly fontUrl: (page: number) => string;
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

const CDN = 'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts';

/**
 * Gaps on QUL's CDN found by `scripts/qul.mjs etags` (recorded in scripts/cdn-etags.json):
 * page → the format that is served instead of woff2. A unit test keeps this in sync with the file.
 */
const CDN_FORMAT_EXCEPTIONS: Readonly<Record<string, Readonly<Record<number, 'woff' | 'ttf'>>>> = {
  'qpc-v4-tajweed': {328: 'woff'},
};

/**
 * The V4 colour font's sixteen CPAL entries (read from its CPAL table; the COLR layer counts of the
 * fixture fonts and QUL's own palette rules say what each paints): 0 and 14 the letters, 1, 2 and 15
 * the greys of silent letters, 3–9 the seven tajweed rule colours, and 10–13 the ayah rosette: 10
 * the jewel, 11 the petals, 12 the disc, 13 the frame, curls and the number inside it.
 *
 * 13 is its own part because the font paints it in the letter colour (black in palettes 0 and 3,
 * white in 4) yet QUL's black theme needs it apart from the letters.
 */
const V4_COLOR_PARTS: Readonly<Record<MushafColorPart, readonly number[]>> = {
  ink: [0, 14],
  silent: [1, 2, 15],
  rules: [3, 4, 5, 6, 7, 8, 9],
  frame: [13],
  accent: [11],
  detail: [10],
  background: [12],
};

const NO_COLOR_PARTS: Readonly<Record<MushafColorPart, readonly number[]>> = {
  ink: [],
  silent: [],
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
  fontUrl: (page) => {
    const format = CDN_FORMAT_EXCEPTIONS[id]?.[page] ?? 'woff2';
    return `${CDN}/${dir}/${format}/p${page}.${format}${colr ? '?v=3.1' : ''}`;
  },
});

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

/** The mushaf's font metrics — what `fontSizeForWidth()` divides by. */
export const getMushafMetrics = (mushaf?: MushafId): MushafMetrics =>
  getMushafDefinition(mushaf ?? DEFAULT_MUSHAF).metrics;

/** The font set by its id, for data that names one. */
export const fontSetById = (def: MushafDefinition, id: unknown): FontSetDefinition | undefined =>
  [def.fontSets.plain, def.fontSets.color].find((set) => set.id === id);

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

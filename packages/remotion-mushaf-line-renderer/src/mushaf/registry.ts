import {describeValue, MushafError} from '../errors';
import type {MushafColors, MushafFontSet, MushafId, MushafLook, MushafMetrics, MushafSelection} from '../types';
import {assertMushafColors, CURRENT_COLOR} from './colors';

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

/** CPAL entries by what they paint — the parts of `MushafColors`. Every entry belongs to one part. */
export type PaletteRoles = {
  /** Everything drawn in the writing colour: the letters, the rosette's frame and the ayah number. */
  readonly ink: readonly number[];
  /** The petal flourishes above and below the rosette. */
  readonly accent: readonly number[];
  /** The small jewel at the top of the rosette. */
  readonly detail: readonly number[];
  /** The disc behind the ayah number. */
  readonly background: readonly number[];
};

/** One of the font file sets a mushaf is published in (QUL publishes a plain and a colour set). */
export type FontSetDefinition = {
  readonly id: MushafFontSet;
  /** COLR/CPAL colour font: CSS `color` does not apply to its glyphs. */
  readonly colr: boolean;
  /** CPAL base palettes the font carries, in index order. Empty for a monochrome set. */
  readonly palettes: readonly number[];
  /** Which CPAL entries paint which part of the glyphs; all empty for a monochrome set. */
  readonly paletteRoles: PaletteRoles;
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
    /** Monochrome outlines that follow CSS `color` — the `'plain'` look. */
    readonly plain: FontSetDefinition;
    /** The COLR/CPAL colour font — the `'tajweed'` and `'mandala'` looks. */
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
 * The V4 colour font's sixteen CPAL entries, read from its CPAL table and confirmed by overriding
 * one entry at a time in Chromium: 0-9, 14 and 15 colour letters (1, 2 and 15 are the greys of the
 * silent letters), and 10-13 the ayah rosette — 13 its frame, curls and the number inside it, 11 the
 * petals, 10 the jewel, 12 the disc.
 *
 * 13 sits with the letters because the font paints it in the letter colour: black in palettes 0 and
 * 3, white in palette 4. Frame and text move together, which is what keeps a mandala line readable
 * when the text colour changes.
 */
const V4_PALETTE_ROLES: PaletteRoles = {
  ink: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15],
  accent: [11],
  detail: [10],
  background: [12],
};

const NO_PALETTE_ROLES: PaletteRoles = {ink: [], accent: [], detail: [], background: []};

const v4FontSet = (id: MushafFontSet, dir: 'v4' | 'v4-tajweed', colr: boolean): FontSetDefinition => ({
  id,
  colr,
  // The V4 colour font ships six CPAL palettes (see docs/kfgqpc-v4-rendering-notes.md): 0-2 tajweed,
  // 3-5 black/white text with coloured ayah markers. The plain set has none.
  palettes: colr ? [0, 1, 2, 3, 4, 5] : [],
  paletteRoles: colr ? V4_PALETTE_ROLES : NO_PALETTE_ROLES,
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
export const DEFAULT_LOOK: MushafLook = 'plain';

/** Every look, for Studio schemas and validation. */
export const MUSHAF_LOOKS: readonly MushafLook[] = ['plain', 'tajweed', 'mandala'];

/**
 * The CPAL palette that leaves the ayah-end rosette in its colours and the letters plain —
 * the mandala look, how most printed mushafs read outside a tajweed edition.
 */
export const MANDALA_PALETTE = 3;

export const isMushafId = (id: unknown): id is MushafId => typeof id === 'string' && Object.hasOwn(MUSHAFS, id);

export const getMushafDefinition = (id: unknown): MushafDefinition => {
  if (!isMushafId(id)) {
    throw new MushafError(
      'UNKNOWN_MUSHAF',
      `Unknown mushaf ${describeValue(id)}. Known mushafs: ${MUSHAF_IDS.join(', ')}.`,
      {mushaf: id},
    );
  }
  return MUSHAFS[id];
};

/** The mushaf's font metrics — what `fontSizeForWidth()` divides by. */
export const getMushafMetrics = (mushaf?: MushafId): MushafMetrics =>
  getMushafDefinition(mushaf ?? DEFAULT_MUSHAF).metrics;

export const assertLook = (value: unknown): MushafLook => {
  if (value === undefined) return DEFAULT_LOOK;
  if (typeof value === 'string' && (MUSHAF_LOOKS as readonly string[]).includes(value)) return value as MushafLook;
  throw new MushafError(
    'BAD_LOOK',
    `look must be one of ${MUSHAF_LOOKS.map((l) => `'${l}'`).join(', ')} when given, got ${describeValue(value)}.`,
    {look: value},
  );
};

/** The font set a look is painted with. */
export const fontSetForLook = (def: MushafDefinition, look: MushafLook): FontSetDefinition =>
  look === 'plain' ? def.fontSets.plain : def.fontSets.color;

/** The font set by its id, for data that names one. */
export const fontSetById = (def: MushafDefinition, id: unknown): FontSetDefinition | undefined =>
  [def.fontSets.plain, def.fontSets.color].find((set) => set.id === id);

/** A selection with every default filled in and every value checked. */
export type ResolvedSelection = {
  readonly def: MushafDefinition;
  readonly look: MushafLook;
  readonly fontSet: FontSetDefinition;
  /** Mandala only: `{ink: 'currentColor', ...colors}`. */
  readonly colors?: MushafColors;
};

/**
 * Turns `{mushaf?, look?, colors?}` into the mushaf definition, the look and the font set to paint
 * it with. The plain look uses the monochrome set; tajweed and mandala both use the colour font,
 * mandala at its own palette with the ink following the inherited CSS `color` (see
 * `usePaletteRule`). `colors` belong to the mandala look alone: on any other look they would either
 * do nothing (plain) or paint over the tajweed colours, so they are refused.
 */
export const resolveSelection = ({mushaf, look: lookValue, colors}: MushafSelection): ResolvedSelection => {
  const def = getMushafDefinition(mushaf ?? DEFAULT_MUSHAF);
  const look = assertLook(lookValue);
  if (colors !== undefined && look !== 'mandala') {
    throw new MushafError(
      'BAD_COLOR',
      `colors can only be given with look: 'mandala' (got look: '${look}'). The plain look follows CSS color; the tajweed look carries its own colours.`,
      {look, colors},
    );
  }
  const fontSet = fontSetForLook(def, look);
  if (look !== 'mandala') return {def, look, fontSet};
  return {
    def,
    look,
    fontSet,
    colors: {ink: CURRENT_COLOR, ...(colors === undefined ? {} : assertMushafColors('colors', colors))},
  };
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

import {CURRENT_COLOR, assertMushafColors} from './colors';
import {MushafError, describeValue} from './errors';
import type {MushafColors} from './types';

export type DatasetId = 'qpc-v4';

/**
 * A dataset is what a mushaf's lines are built from at runtime: QUL's two raw exports, the words
 * of the script (JSON) and the line layout (SQLite), fetched, joined and compiled in memory. Both
 * V4 ids share one dataset; only the glyph fonts differ.
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
   * preview shows them so); QUL's layout export flags one line of page 2 as justified, which
   * `fit="line"` would stretch across the measure.
   */
  readonly centeredPages: readonly number[];
  /**
   * Default sources: QUL's exports on Tarteel's CDN. The path prefix changes on every re-export,
   * so a pinned URL names one publication; `scripts/fetch-qul.mjs --data` mirrors and checks it.
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

/** CPAL entries by what they paint — the colours of `MushafColors`. Every entry belongs to one. */
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
const V4_PALETTE_ROLES: PaletteRoles = {ink: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15], accent: [11], detail: [10], background: [12]};

const NO_PALETTE_ROLES: PaletteRoles = {ink: [], accent: [], detail: [], background: []};

export type MushafDefinition = {
  readonly id: string;
  readonly name: string;
  /** QUL mushaf layout id. */
  readonly layoutId: number;
  readonly pages: number;
  readonly linesPerPage: number;
  readonly linesOnPage: (page: number) => number;
  /** Both V4 ids share one compiled layout. */
  readonly dataset: DatasetId;
  readonly fontFamily: (page: number) => string;
  readonly fontUrl: (page: number) => string;
  /** COLR/CPAL colour font (tajweed); CSS `color` does not apply to its glyphs. */
  readonly colr: boolean;
  /** CPAL base palettes the font carries, in index order. Empty for a monochrome set. */
  readonly palettes: readonly number[];
  /** Which CPAL entries paint which part of the glyphs; all empty for a monochrome set. */
  readonly paletteRoles: PaletteRoles;
  readonly metrics: {
    readonly unitsPerEm: number;
    readonly ascent: number;
    readonly descent: number;
    /** Line width the base type size is derived from, in font units. Real lines vary around it; `fit` settles the difference. */
    readonly referenceLineWidth: number;
  };
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
 * Gaps on QUL's CDN found by `scripts/fetch-qul.mjs --etags` (recorded in scripts/cdn-etags.json):
 * page → the format that is served instead of woff2. A unit test keeps this in sync with the file.
 */
const CDN_FORMAT_EXCEPTIONS: Readonly<Record<string, Readonly<Record<number, 'woff' | 'ttf'>>>> = {
  'qpc-v4-tajweed': {328: 'woff'},
};

const v4 = (id: string, dir: 'v4' | 'v4-tajweed', colr: boolean): MushafDefinition => ({
  id,
  name: colr ? 'KFGQPC V4 1441H (tajweed)' : 'KFGQPC V4 1441H',
  layoutId: DATASETS['qpc-v4'].layoutId,
  pages: DATASETS['qpc-v4'].pages,
  linesPerPage: 15,
  linesOnPage: DATASETS['qpc-v4'].linesOnPage,
  dataset: 'qpc-v4',
  fontFamily: (page) => `mushaf-${id}-p${page}`,
  // QUL's own pages request the tajweed set with `?v=3.1`, so that cache key is the warm one on
  // Cloudflare; the plain set is never requested by QUL, so it stays a bare path.
  fontUrl: (page) => {
    const format = CDN_FORMAT_EXCEPTIONS[id]?.[page] ?? 'woff2';
    return `${CDN}/${dir}/${format}/p${page}.${format}${colr ? '?v=3.1' : ''}`;
  },
  colr,
  // The V4 colour font ships six CPAL palettes (see docs/kfgqpc-v4-rendering-notes.md): 0-2 tajweed,
  // 3-5 black/white text with coloured ayah markers. The plain set has none.
  palettes: colr ? [0, 1, 2, 3, 4, 5] : [],
  paletteRoles: colr ? V4_PALETTE_ROLES : NO_PALETTE_ROLES,
  metrics: {unitsPerEm: 2500, ascent: 3940, descent: -2520, referenceLineWidth: 42501},
  invariants: {lines: 9046, ayahLines: 8820, surahNameLines: 114, basmallahLines: 112, centeredAyahLines: 30, words: 83668},
});

/** Internal registry. Adding a mushaf is one row here plus one compiled dataset. */
export const MUSHAFS = {
  'qpc-v4': v4('qpc-v4', 'v4', false),
  'qpc-v4-tajweed': v4('qpc-v4-tajweed', 'v4-tajweed', true),
} as const satisfies Record<string, MushafDefinition>;

export const MUSHAF_IDS = Object.keys(MUSHAFS) as ReadonlyArray<keyof typeof MUSHAFS>;

/** What you get when neither `mushaf` nor `tajweed` is given: plain glyphs that follow CSS `color`. */
export const DEFAULT_MUSHAF = 'qpc-v4' as const satisfies keyof typeof MUSHAFS;

const TAJWEED_OF: Readonly<Record<keyof typeof MUSHAFS, keyof typeof MUSHAFS>> = {'qpc-v4': 'qpc-v4-tajweed', 'qpc-v4-tajweed': 'qpc-v4-tajweed'};
const PLAIN_OF: Readonly<Record<keyof typeof MUSHAFS, keyof typeof MUSHAFS>> = {'qpc-v4': 'qpc-v4', 'qpc-v4-tajweed': 'qpc-v4'};

/**
 * The CPAL palette that leaves the ayah-end rosette in its colours and the letters plain —
 * "mandala" mode, how most printed mushafs read outside a tajweed edition. Palette 4 is its
 * white-text counterpart; both live in the same colour font, so mandala needs no extra download.
 */
export const MANDALA_PALETTE = 3;

const assertTajweed = (value: unknown): boolean | undefined => {
  if (value === undefined || typeof value === 'boolean') return value;
  throw new MushafError('BAD_TAJWEED', `tajweed must be true or false when given, got ${describeValue(value)}.`, {tajweed: value});
};

/** `mandala` is a switch that also carries colours: `true`, `false`, or the parts to recolour. */
const assertMandala = (value: unknown): boolean | MushafColors | undefined => {
  if (value === undefined || typeof value === 'boolean') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MushafError('BAD_MANDALA', `mandala must be true, false or an object of CSS colours when given, got ${describeValue(value)}.`, {mandala: value});
  }
  return assertMushafColors('mandala', value);
};

/**
 * The font set to render with. `mushaf` names the mushaf (layout + glyphs), `tajweed` and `mandala`
 * its colouring; the registry keys the colouring together with the glyphs because the plain and the
 * colour set are two different files on QUL's CDN. Omitting all three gives plain black glyphs.
 *
 * `tajweed` (full colour) and `mandala` (plain text, coloured ayah rosettes) both live in the colour
 * font, so either one resolves to it — `{tajweed: false, mandala: true}` included; which palette of
 * it is painted is `paletteFor()`'s answer. A `mushaf` id that says otherwise loses to the flags
 * (they are the newer, more specific API): `{mushaf: 'qpc-v4-tajweed', tajweed: false}` resolves to
 * the plain set.
 */
export const resolveMushafId = (mushaf: unknown, tajweed: unknown, mandala?: unknown): keyof typeof MUSHAFS => {
  const id = getMushafDefinition(mushaf ?? DEFAULT_MUSHAF).id as keyof typeof MUSHAFS;
  const wantsTajweed = assertTajweed(tajweed);
  const wantsMandala = assertMandala(mandala);
  const colr = wantsTajweed === true || (wantsMandala !== undefined && wantsMandala !== false);
  if (!colr && wantsTajweed === undefined) return id;
  return colr ? TAJWEED_OF[id] : PLAIN_OF[id];
};

/** What a colouring choice paints with: a CPAL base palette, and the colours put over it. */
export type ResolvedPalette = {
  readonly palette: number;
  readonly paletteColors: MushafColors;
};

/**
 * The palette a line is painted from, or `undefined` for the font's own colours — the tajweed
 * palette, and nothing at all for the plain glyph set (it has no palettes).
 *
 * `mandala` resolves to palette 3 with the ink — the letters, the rosette's frame and the ayah
 * number — following the inherited CSS `color`, so a mandala line is written like plain text and
 * keeps its coloured rosette. Any part named in `mandala` is layered on top of that. `tajweed` wins
 * when both are given: it is the more specific ask.
 */
export const paletteFor = ({tajweed, mandala}: {readonly tajweed?: unknown; readonly mandala?: unknown}): ResolvedPalette | undefined => {
  const wantsTajweed = assertTajweed(tajweed);
  const wantsMandala = assertMandala(mandala);
  if (wantsTajweed === true || wantsMandala === undefined || wantsMandala === false) return undefined;
  const colors = wantsMandala === true ? {} : wantsMandala;
  return {palette: MANDALA_PALETTE, paletteColors: {ink: CURRENT_COLOR, ...colors}};
};

/** True when the id names the COLR/CPAL (coloured) font set. */
export const isTajweedId = (id: keyof typeof MUSHAFS): boolean => MUSHAFS[id].colr;

/** The mushaf's font metrics — what `fontSizeForWidth()` divides by. Defaults to the plain V4 set. */
export const getMushafMetrics = (mushaf?: keyof typeof MUSHAFS): MushafDefinition['metrics'] => getMushafDefinition(mushaf ?? DEFAULT_MUSHAF).metrics;

export const isMushafId = (id: unknown): id is keyof typeof MUSHAFS => typeof id === 'string' && Object.prototype.hasOwnProperty.call(MUSHAFS, id);

export const getMushafDefinition = (id: unknown): MushafDefinition => {
  if (!isMushafId(id)) {
    throw new MushafError('UNKNOWN_MUSHAF', `Unknown mushaf ${describeValue(id)}. Known mushafs: ${MUSHAF_IDS.join(', ')}.`, {mushaf: id});
  }
  return MUSHAFS[id];
};

export const assertPage = (def: MushafDefinition, page: unknown): number => {
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > def.pages) {
    throw new MushafError('PAGE_OUT_OF_RANGE', `page must be an integer from 1 to ${def.pages} for "${def.id}", got ${describeValue(page)}.`, {mushaf: def.id, page});
  }
  return page;
};

export const assertLine = (def: MushafDefinition, page: number, line: unknown): number => {
  const max = def.linesOnPage(page);
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1 || line > max) {
    throw new MushafError('LINE_OUT_OF_RANGE', `line must be an integer from 1 to ${max} on page ${page} of "${def.id}" (this page has ${max} lines), got ${describeValue(line)}.`, {mushaf: def.id, page, line});
  }
  return line;
};

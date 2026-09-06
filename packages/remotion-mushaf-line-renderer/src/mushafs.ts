import {MushafError, describeValue} from './errors';

export type DatasetId = 'qpc-v4';

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
  layoutId: 19,
  pages: 604,
  linesPerPage: 15,
  linesOnPage: (page) => (page <= 2 ? 8 : 15),
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
 * The CPAL palette that paints the letters black and leaves the ayah-end rosette in its colours —
 * "mandala" mode, how most printed mushafs read outside a tajweed edition. Palette 4 is its
 * white-text counterpart; both live in the same colour font, so mandala needs no extra download.
 */
export const MANDALA_PALETTE = 3;

const assertFlag = (name: 'tajweed' | 'mandala', value: unknown): boolean | undefined => {
  if (value === undefined || typeof value === 'boolean') return value;
  throw new MushafError(name === 'tajweed' ? 'BAD_TAJWEED' : 'BAD_MANDALA', `${name} must be true or false when given, got ${describeValue(value)}.`, {[name]: value});
};

/**
 * The font set to render with. `mushaf` names the mushaf (layout + glyphs), `tajweed` and `mandala`
 * its colouring; the registry keys the colouring together with the glyphs because the plain and the
 * colour set are two different files on QUL's CDN. Omitting all three gives plain black glyphs.
 *
 * `tajweed` (full colour) and `mandala` (black text, coloured ayah rosettes) both live in the colour
 * font, so either one resolves to it — `{tajweed: false, mandala: true}` included; which palette of
 * it is painted is `paletteFor()`'s answer. A `mushaf` id that says otherwise loses to the flags
 * (they are the newer, more specific API): `{mushaf: 'qpc-v4-tajweed', tajweed: false}` resolves to
 * the plain set.
 */
export const resolveMushafId = (mushaf: unknown, tajweed: unknown, mandala?: unknown): keyof typeof MUSHAFS => {
  const id = getMushafDefinition(mushaf ?? DEFAULT_MUSHAF).id as keyof typeof MUSHAFS;
  const wantsTajweed = assertFlag('tajweed', tajweed);
  const wantsMandala = assertFlag('mandala', mandala);
  const colr = wantsTajweed === true || wantsMandala === true;
  if (!colr && wantsTajweed === undefined) return id;
  return colr ? TAJWEED_OF[id] : PLAIN_OF[id];
};

/**
 * The CPAL base palette to paint a line with, or `undefined` for the font's own default (palette 0,
 * the full tajweed colours). Only the colour font has palettes; asking for `mandala` on the plain
 * set resolves to the colour font first (see `resolveMushafId()`), so the two always agree.
 *
 * `tajweed` wins when both are given: it is the more specific ask.
 */
export const paletteFor = ({tajweed, mandala}: {readonly tajweed?: unknown; readonly mandala?: unknown}): number | undefined => {
  const wantsTajweed = assertFlag('tajweed', tajweed);
  const wantsMandala = assertFlag('mandala', mandala);
  return wantsMandala === true && wantsTajweed !== true ? MANDALA_PALETTE : undefined;
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

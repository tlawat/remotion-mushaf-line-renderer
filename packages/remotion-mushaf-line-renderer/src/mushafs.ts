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
 * The font set to render with. `mushaf` names the mushaf (layout + glyphs), `tajweed` its colouring;
 * the registry keys them together because the two sets are two different files on QUL's CDN.
 * Omitting both gives plain black glyphs. When both are given, `tajweed` decides (it is the newer,
 * more specific API): `{mushaf: 'qpc-v4-tajweed', tajweed: false}` resolves to the plain set.
 */
export const resolveMushafId = (mushaf: unknown, tajweed: unknown): keyof typeof MUSHAFS => {
  const id = getMushafDefinition(mushaf ?? DEFAULT_MUSHAF).id as keyof typeof MUSHAFS;
  if (tajweed === undefined) return id;
  if (typeof tajweed !== 'boolean') {
    throw new MushafError('BAD_TAJWEED', `tajweed must be true or false when given, got ${describeValue(tajweed)}.`, {tajweed});
  }
  return tajweed ? TAJWEED_OF[id] : PLAIN_OF[id];
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

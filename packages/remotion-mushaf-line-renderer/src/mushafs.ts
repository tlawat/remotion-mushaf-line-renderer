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
    /** Advance sum of the widest line in the mushaf, in font units. Drives the default font size. */
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
  fontUrl: (page) => `${CDN}/${dir}/woff2/p${page}.woff2${colr ? '?v=3.1' : ''}`,
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

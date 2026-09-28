import {describeValue, MushafError} from '../errors';
import {
  assertPage,
  type FontMetrics,
  type FontSetDefinition,
  getMushafDefinition,
  getSharedFont,
  type MushafDefinition,
  resolveSelection,
  type SharedFontDefinition,
} from '../mushaf/registry';
import type {
  GetMushafFontFileOptions,
  MushafFontFile,
  MushafPageFontFile,
  MushafSharedFont,
  MushafSharedFontFile,
} from '../types';

/** The one place that turns a page into a file: the format (page 328 of the colour set is woff) lives in the registry. */
export const fontFileFor = (def: MushafDefinition, fontSet: FontSetDefinition, page: number): MushafPageFontFile => {
  const format = fontSet.format(page);
  return {
    kind: 'page',
    mushaf: def.id,
    fontSet: fontSet.id,
    page,
    format,
    id: `p${page}`,
    fileName: `p${page}.${format}`,
    cdnUrl: fontSet.cdnUrl(page),
  };
};

/** A shared font (surah names, quran-common) as a file: one per mushaf, named after the font. */
export const sharedFontFileFor = (def: MushafDefinition, font: SharedFontDefinition): MushafSharedFontFile => ({
  kind: 'shared',
  mushaf: def.id,
  font: font.id,
  format: font.format,
  id: font.id,
  fileName: font.fileName,
  cdnUrl: font.cdnUrl,
});

/**
 * What the loader needs to know about one font, page font or shared font alike: the file a
 * resolver receives, how to name it in messages, the family and store key under the default
 * source, the metrics to pin, and, for a page font, the set a fonts package must hold.
 */
export type FontTarget = {
  readonly file: MushafFontFile;
  /** For messages, after "mushaf font": `qpc-v4 page 10`, `surah-names-v4`. */
  readonly label: string;
  /** For error details. */
  readonly details: Readonly<Record<string, unknown>>;
  /** The family under the default source (`fontSrc: 'cdn'`); other sources add a suffix. */
  readonly baseFamily: string;
  /** The store key without the source part: `qpc-v4/10`, `surah-names-v4`. */
  readonly storePrefix: string;
  /** The font set (page fonts) or the font id (shared fonts): one fallback warning per group. */
  readonly group: string;
  readonly metrics: FontMetrics;
  /** Page fonts only: what a fonts package has to hold. `null` for a shared font, which no package carries. */
  readonly page: {readonly fontSet: FontSetDefinition; readonly page: number} | null;
};

export const pageFontTarget = (def: MushafDefinition, fontSet: FontSetDefinition, page: number): FontTarget => ({
  file: fontFileFor(def, fontSet, page),
  label: `${fontSet.id} page ${page}`,
  details: {fontSet: fontSet.id, page},
  baseFamily: fontSet.fontFamily(page),
  storePrefix: `${fontSet.id}/${page}`,
  group: fontSet.id,
  metrics: def.metrics,
  page: {fontSet, page},
});

export const sharedFontTarget = (def: MushafDefinition, font: SharedFontDefinition): FontTarget => ({
  file: sharedFontFileFor(def, font),
  label: font.id,
  details: {font: font.id},
  baseFamily: font.fontFamily,
  storePrefix: font.id,
  group: font.id,
  metrics: font.metrics,
  page: null,
});

/**
 * Describes a font file of the mushaf: the page font a line of this mushaf, theme and page is drawn
 * with (`{page, theme?, mushaf?}`), or one of the shared fonts (`{font, mushaf?}`), with its file
 * name, format and CDN URL. Pure and Remotion-free; what a `fontSrc` resolver receives.
 */
export const getMushafFontFile = (options: GetMushafFontFileOptions): MushafFontFile => {
  if (options.font !== undefined) {
    const {mushaf, font, ...rest} = options;
    if (rest.page !== undefined) {
      throw new MushafError(
        'BAD_FONT_SRC',
        `getMushafFontFile(): pass either {page, theme?} for a page font or {font} for a shared font, not both (got page ${describeValue(rest.page)} and font ${describeValue(font)}).`,
        {page: rest.page, font},
      );
    }
    const def = getMushafDefinition(mushaf ?? 'qpc-v4');
    return sharedFontFileFor(def, getSharedFont(def, font as MushafSharedFont));
  }
  const {page, ...selection} = options;
  const {def, fontSet} = resolveSelection(selection);
  assertPage(def, page);
  return fontFileFor(def, fontSet, page);
};

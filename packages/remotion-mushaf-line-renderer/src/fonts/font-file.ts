import {assertPage, type FontSetDefinition, type MushafDefinition, resolveSelection} from '../mushaf/registry';
import type {GetMushafFontFileOptions, MushafFontFile} from '../types';

/** The one place that turns a page into a file: the format (page 328 of the colour set is woff) lives in the registry. */
export const fontFileFor = (def: MushafDefinition, fontSet: FontSetDefinition, page: number): MushafFontFile => {
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

/**
 * Describes the page font a line of this mushaf, theme and page is drawn with: its font set, file
 * name, format and CDN URL. Pure and Remotion-free; what a `fontSrc` resolver receives.
 */
export const getMushafFontFile = ({page, ...selection}: GetMushafFontFileOptions): MushafFontFile => {
  const {def, fontSet} = resolveSelection(selection);
  assertPage(def, page);
  return fontFileFor(def, fontSet, page);
};

import {staticFile} from 'remotion';
import type {MushafDataSource, MushafFontUrl} from 'remotion-mushaf-line-renderer';

/**
 * Turns a public-folder pattern such as `'fonts/{fontSet}/p{page}.woff2'` into the `fontUrl`
 * callback `getMushafLines()` takes, so every resolved line carries the mirrored font's URL as plain
 * JSON. `null` means no pin: the fonts come from QUL's CDN.
 */
export const fontUrlFromPattern = (pattern: string | null): MushafFontUrl | undefined =>
  pattern
    ? (page, fontSet) => staticFile(pattern.replace('{fontSet}', fontSet).replace('{page}', String(page)))
    : undefined;

/** Files of a mirror of QUL's two exports in the public folder ({words, layout}); `null` uses Tarteel's CDN. */
export type DataFiles = {words: string; layout: string};

/**
 * Turns the mirror's public-folder paths into the `data` source `getMushafLines()` takes, pinned
 * through `staticFile()` so a Lambda site finds them under its own publicPath too.
 */
export const dataFromFiles = (files: DataFiles | null): MushafDataSource | undefined =>
  files ? {words: staticFile(files.words), layout: staticFile(files.layout)} : undefined;

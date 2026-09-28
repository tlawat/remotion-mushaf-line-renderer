// The fonts packages: importing them is what puts their files in the bundle (as assets); nothing is
// downloaded unless a line needs a page from them.
import plainFonts from '@tlawat/mushaf-fonts-qpc-v4';
import tajweedFonts from '@tlawat/mushaf-fonts-qpc-v4-tajweed';
import type {MushafDataSource, MushafFontFallback, MushafFontSet, MushafFontSrc} from '@tlawat/remotion-mushaf-line';
import {staticFile} from 'remotion';

/**
 * Where the compositions' page fonts come from:
 * - 'fallback': QUL's CDN, and the fonts packages when it fails (the recommended setup);
 * - 'cdn': QUL's CDN only (the package's default);
 * - 'package': the fonts packages only, never the CDN (offline, reproducible renders).
 */
export type FontMode = 'fallback' | 'cdn' | 'package';

/** Both sets: `<MushafLine>` picks the one the line's theme uses. */
export const fontFallback: MushafFontFallback = [plainFonts, tajweedFonts];

/**
 * The `<MushafLine>` font props for a mode and the line's font set. The packages hold page fonts
 * only: in 'package' mode the shared fonts (surah names, juz names) come from the example's mirror
 * of them in the public folder (`bun run qul fonts` puts them there), through the resolver form.
 */
export const fontProps = (
  mode: FontMode,
  fontSet: MushafFontSet,
): {fontSrc?: MushafFontSrc; fontFallback?: MushafFontFallback} => {
  if (mode === 'cdn') return {};
  if (mode === 'package') {
    const pkg = fontSet === 'qpc-v4' ? plainFonts : tajweedFonts;
    return {fontSrc: (f) => (f.kind === 'page' ? pkg : staticFile(`fonts/${f.font}/${f.fileName}`))};
  }
  return {fontFallback};
};

/** Files of a mirror of QUL's two exports in the public folder ({words, layout}); `null` uses Tarteel's CDN. */
export type DataFiles = {words: string; layout: string};

/**
 * Turns the mirror's public-folder paths into the `data` source `getMushafLines()` takes, pinned
 * through `staticFile()` so a Lambda site finds them under its own publicPath too.
 */
export const dataFromFiles = (files: DataFiles | null): MushafDataSource | undefined =>
  files ? {words: staticFile(files.words), layout: staticFile(files.layout)} : undefined;

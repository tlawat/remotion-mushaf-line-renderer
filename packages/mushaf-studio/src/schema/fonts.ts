import type {MushafFontFallback, MushafFontPackage, MushafFontSet, MushafFontSrc} from '@tlawat/remotion-mushaf-line';
import {getRegisteredMushafFonts, type RegisteredMushafFonts} from '../fonts/registry';
import type {Fonts} from './index';

/** The `fontSrc` / `fontFallback` props of a line, keys omitted when unused so they spread cleanly. */
export type FontProps = {
  readonly fontSrc?: MushafFontSrc;
  readonly fontFallback?: MushafFontFallback;
};

export type FontSetup = {
  readonly props: FontProps;
  /**
   * Set when the mode needs a fonts package that `registerMushafFonts()` did not register: the
   * line is then rendered from QUL's CDN and the composition shows this line in the Studio.
   */
  readonly warning: string | null;
};

const PACKAGE_NAMES: Readonly<Record<MushafFontSet, string>> = {
  'qpc-v4': '@tlawat/mushaf-fonts-qpc-v4',
  'qpc-v4-tajweed': '@tlawat/mushaf-fonts-qpc-v4-tajweed',
};

const packageFor = (registered: RegisteredMushafFonts, fontSet: MushafFontSet): MushafFontPackage | undefined =>
  [registered.plain, registered.tajweed].find((pkg) => pkg?.fontSet === fontSet);

const missing = (fonts: Fonts, fontSet: MushafFontSet): string =>
  `fonts is "${fonts}" but no fonts package for ${fontSet} is registered, so the page fonts come from QUL's CDN. Call registerMushafFonts({plain, tajweed}) once in your Root, with the default exports of ${PACKAGE_NAMES['qpc-v4']} and ${PACKAGE_NAMES['qpc-v4-tajweed']}.`;

/**
 * The font props of a line for the schema's `fonts` and the line's font set (its theme decides it):
 * `'cdn'` is the package's default; `'fallback'` adds the registered package of that set as
 * `fontFallback`; `'package'` loads the page fonts from it alone and the shared fonts (surah
 * names, juz names, which the packages do not hold) from `public/fonts/<font>/<file>` through the
 * resolver form, as the example project does. The packages come from `registerMushafFonts()`; a
 * mode that needs one that is not registered degrades to the CDN and says so in `warning`.
 */
export const fontPropsFrom = (
  fonts: Fonts,
  fontSet: MushafFontSet,
  staticFile: (path: string) => string,
  registered: RegisteredMushafFonts = getRegisteredMushafFonts(),
): FontSetup => {
  if (fonts === 'cdn') return {props: {}, warning: null};
  const pkg = packageFor(registered, fontSet);
  if (!pkg) return {props: {}, warning: missing(fonts, fontSet)};
  if (fonts === 'package') {
    return {
      props: {fontSrc: (file) => (file.kind === 'page' ? pkg : staticFile(`fonts/${file.font}/${file.fileName}`))},
      warning: null,
    };
  }
  return {props: {fontFallback: pkg}, warning: null};
};

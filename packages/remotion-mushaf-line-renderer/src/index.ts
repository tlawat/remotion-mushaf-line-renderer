// Component

export type {RevealRtlProps} from './animation/presentations/reveal-rtl';
export {revealRtl, revealRtlStyle} from './animation/presentations/reveal-rtl';
export type {SlideFadeProps} from './animation/presentations/slide-fade';
export {slideFade, slideFadeStyle} from './animation/presentations/slide-fade';
export type {MushafSpringTimingOptions, MushafTimingOptions} from './animation/timings';
// Animation
export {ENTER_EASING, EXIT_EASING, enterTiming, exitTiming, springyTiming} from './animation/timings';
export {MushafLine} from './component/MushafLine';
// Sizing
export {fontSizeForWidth, lineHeightForFontSize} from './component/styles';
// Data
export {loadMushafData} from './data/load-mushaf-data';
export type {MushafErrorCode} from './errors';
// Errors
export {isMushafError, MushafError} from './errors';
// Fonts
export {getMushafFontFile} from './fonts/font-file';
export {loadPageFont} from './fonts/load-page-font';
export {getMushafMetrics, MUSHAF_IDS} from './mushaf/registry';
// Themes
export {MUSHAF_THEME_NAMES, MUSHAF_THEMES} from './mushaf/themes';
// Line data
export {getMushafLine} from './resolve/get-mushaf-line';
export {getMushafLines, getMushafLocation, lineAyahs} from './resolve/get-mushaf-lines';
export {sliceWords} from './resolve/slice';
// Types
export type {
  GetMushafFontFileOptions,
  GetMushafLineOptions,
  GetMushafLinesOptions,
  GetMushafLocationOptions,
  LoadedPageFont,
  LoadMushafDataOptions,
  LoadPageFontOptions,
  MushafColorPart,
  MushafDataSource,
  MushafFontFallback,
  MushafFontFile,
  MushafFontFormat,
  MushafFontOrigin,
  MushafFontPackage,
  MushafFontResolver,
  MushafFontSet,
  MushafFontSrc,
  MushafId,
  MushafLineAnimation,
  MushafLineAnimationProp,
  MushafLineCommonProps,
  MushafLineData,
  MushafLineProps,
  MushafLineType,
  MushafLocation,
  MushafMetrics,
  MushafSelection,
  MushafSlice,
  MushafTheme,
  MushafThemeColors,
  MushafThemeName,
  MushafThemeSelection,
  MushafWord,
  MushafWordKind,
  WordContext,
} from './types';

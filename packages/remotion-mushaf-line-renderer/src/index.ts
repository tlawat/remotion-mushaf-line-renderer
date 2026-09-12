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
export {loadPageFont} from './fonts/load-page-font';
export {getMushafMetrics, MUSHAF_IDS, MUSHAF_LOOKS} from './mushaf/registry';
// Line data
export {getMushafLine} from './resolve/get-mushaf-line';
export {getMushafLines, getMushafLocation, lineAyahs} from './resolve/get-mushaf-lines';
export {sliceWords} from './resolve/slice';
// Types
export type {
  GetMushafLineOptions,
  GetMushafLinesOptions,
  GetMushafLocationOptions,
  LoadedPageFont,
  LoadMushafDataOptions,
  LoadPageFontOptions,
  MushafColors,
  MushafDataSource,
  MushafFontSet,
  MushafFontUrl,
  MushafId,
  MushafLineAnimation,
  MushafLineAnimationProp,
  MushafLineCommonProps,
  MushafLineData,
  MushafLineProps,
  MushafLineType,
  MushafLocation,
  MushafLook,
  MushafMetrics,
  MushafSelection,
  MushafSlice,
  MushafWord,
  MushafWordKind,
  WordContext,
} from './types';

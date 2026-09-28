// Component

export type {RevealRtlProps} from './animation/presentations/reveal-rtl';
export {revealRtl, revealRtlStyle} from './animation/presentations/reveal-rtl';
export type {SlideFadeProps} from './animation/presentations/slide-fade';
export {slideFade, slideFadeStyle} from './animation/presentations/slide-fade';
export {scrollPosition} from './animation/scroll-position';
export type {MushafSpringTimingOptions, MushafTimingOptions} from './animation/timings';
// Animation
export {ENTER_EASING, EXIT_EASING, enterTiming, exitTiming, springyTiming} from './animation/timings';
export {MushafJuzName} from './component/JuzName';
export {MushafLine} from './component/MushafLine';
export {MushafLineWindow} from './component/MushafLineWindow';
export {MushafSurahName} from './component/SurahName';
// Sizing
export {fontSizeForWidth, lineHeightForFontSize, windowLineOpacity} from './component/styles';
// Data
export {loadMushafData} from './data/load-mushaf-data';
export type {MushafErrorCode} from './errors';
// Errors
export {isMushafError, MushafError} from './errors';
// Fonts
export {getMushafFontFile} from './fonts/font-file';
export {loadPageFont, loadSharedFont} from './fonts/load-page-font';
export {getMushafMetrics, MUSHAF_IDS} from './mushaf/registry';
// Themes
export {MUSHAF_THEME_NAMES, MUSHAF_THEMES} from './mushaf/themes';
// Recitation timings
export {parseRecitationTimings, recitedRange, wordAt, wordTiming} from './recitation/recitation-timings';
export {scheduleLines} from './recitation/schedule';
// Line data
export {getMushafLine} from './resolve/get-mushaf-line';
export {getMushafLines, getMushafLocation, lineAyahs} from './resolve/get-mushaf-lines';
export {sliceWords} from './resolve/slice';
// Types
export type {
  AyahTiming,
  GetMushafFontFileOptions,
  GetMushafLineOptions,
  GetMushafLinesOptions,
  GetMushafLocationOptions,
  LineSchedule,
  LineWindowContext,
  LoadedMushafFont,
  LoadedPageFont,
  LoadMushafDataOptions,
  LoadPageFontOptions,
  LoadSharedFontOptions,
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
  MushafGlyphCommonProps,
  MushafId,
  MushafJuzNameProps,
  MushafLineAnimation,
  MushafLineAnimationProp,
  MushafLineCommonProps,
  MushafLineData,
  MushafLineProps,
  MushafLineType,
  MushafLineWindowCommonProps,
  MushafLineWindowProps,
  MushafLocation,
  MushafMetrics,
  MushafPageFontFile,
  MushafScrollAnchor,
  MushafSelection,
  MushafSharedFont,
  MushafSharedFontFile,
  MushafSlice,
  MushafSurahNameProps,
  MushafTheme,
  MushafThemeColors,
  MushafThemeName,
  MushafThemeSelection,
  MushafWord,
  MushafWordKind,
  RecitationTimings,
  RecitedRange,
  ScheduleLinesOptions,
  ScrollPositionOptions,
  WordContext,
  WordOccurrence,
  WordTiming,
} from './types';

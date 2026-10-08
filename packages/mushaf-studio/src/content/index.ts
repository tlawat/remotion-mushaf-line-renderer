// The content module: what goes around the recitation. Tafsir and chapter info from quran.com with
// their files (tafsir.ts, chapter-info.ts), web fonts for the scripts translations are written in
// (script-fonts.ts), the tajweed colours' legend (tajweed.ts) and the cards that show them.

export {ChapterInfoCard, type ChapterInfoCardProps, chapterFactsText, ordinal} from './ChapterInfoCard';
export {
  type ChapterInfo,
  fetchChapterInfo,
  loadChapterInfo,
  parseChapterInfoFile,
  type RevelationPlace,
  serialiseChapterInfo,
} from './chapter-info';
export {
  DEFAULT_TEXT_CREDIT,
  EndCard,
  type EndCardCredits,
  type EndCardProps,
  endCardCreditLine,
  endCardOpacity,
} from './EndCard';
export {htmlToParagraphs} from './html';
export {
  directionOfLanguage,
  fontFamilyForLanguage,
  GOOGLE_FONTS_CSS_API,
  googleFontsCssUrl,
  loadWebFont,
  parseGoogleFontsCss,
  SCRIPT_FONTS,
  type ScriptFonts,
  type ScriptId,
  scriptOfLanguage,
  useWebFont,
  useWebFonts,
  type WebFontFace,
  type WebFontOptions,
  type WebFontRequest,
  type WebFontState,
  type WebFontsState,
} from './script-fonts';
export {CARD_LINE_HEIGHT, clampStyle, TafsirCard, type TafsirCardProps} from './TafsirCard';
export {TajweedLegend, type TajweedLegendProps} from './TajweedLegend';
export {
  fetchQuranComTafsir,
  listQuranComTafsirs,
  loadTafsir,
  parseTafsirFile,
  serialiseTafsir,
  type Tafsir,
  type TafsirEntry,
  tafsirEntryFor,
  tafsirEntryLabel,
} from './tafsir';
export {
  TAJWEED_RULES,
  type TajweedLegendItem,
  type TajweedRule,
  type TajweedRuleId,
  tajweedLegend,
  themeHasTajweedColors,
} from './tajweed';

// Unicode-text layouts (roadmap item 1): `<MushafAyahText>`, one ayah at a time as Unicode text in a
// QUL font, for reels framing; the Quran text files it reads (text.ts), the font hook (font.ts),
// the ayah component (AyahText.tsx), the schema, the resolver and `calculateMetadata`.
export {AyahText, type AyahTextProps} from './AyahText';
export {calculateMushafAyahTextMetadata, withAyahTextAudio} from './calculate-metadata';
export {
  UNICODE_FONT_IDS,
  UNICODE_FONTS,
  type UnicodeFontDefinition,
  type UnicodeFontId,
  type UnicodeFontState,
  useUnicodeFont,
} from './font';
export {ayahPresentationStyle, MushafAyahText} from './MushafAyahText';
export {
  type ResolveAyahTextOptions,
  type ResolvedAyah,
  type ResolvedAyahText,
  resolveAyahText,
  skipAyahTextStart,
} from './resolve';
export {
  type AyahAnimation,
  ayahAnimationSchema,
  defaultMushafAyahTextProps,
  type MushafAyahTextProps,
  mushafAyahTextSchema,
} from './schema';
export {
  type AyahWord,
  type AyahWords,
  ayahWordsOf,
  fetchQuranComText,
  loadAyahWords,
  parseAyahWords,
  QURAN_TEXT_SCRIPTS,
  type QuranTextScript,
  serialiseAyahWords,
} from './text';

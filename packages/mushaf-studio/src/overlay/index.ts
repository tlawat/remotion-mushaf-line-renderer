// The title overlay every composition can show (the `overlay` props group): an intro card with the
// surah name in its printed frame, the ayah range and the reciter, and a corner label that follows
// the ayah being heard. Pure in props and frame, like the lines.
export {SURAH_NAMES, surahEnglishName} from './surah-names';
export {
  arabicIndicDigits,
  ayahRangeText,
  ayahSpanText,
  INTRO_CLEARANCE_SECONDS,
  INTRO_FADE_SECONDS,
  introEndSeconds,
  introOpacity,
  MushafCornerLabel,
  type MushafCornerLabelProps,
  MushafTitleCard,
  type MushafTitleCardProps,
  MushafTitleOverlay,
  type MushafTitleOverlayProps,
  showsCorner,
  showsIntro,
  surahSpanName,
} from './TitleOverlay';

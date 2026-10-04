import {z} from 'zod';
import {
  animationSchema,
  customThemeSchema,
  dataSchema,
  defaultAnimation,
  defaultCustomTheme,
  defaultHighlight,
  defaultLayout,
  defaultOverlay,
  defaultReview,
  defaultText,
  fontsSchema,
  headerSchema,
  highlightSchema,
  layoutSchema,
  lineSplitSchema,
  overlaySchema,
  reviewSchema,
  textSchema,
  themeNameSchema,
} from '../../schema';

/**
 * The props of `<MushafRecitation>`: content (set by the Mushaf panel) and style (set in the
 * Props sidebar). `resolved` is filled by `calculateMetadata()` and is not meant to be edited.
 */
export const mushafRecitationSchema = z.object({
  /** A `public/` path (`mushaf-studio/fatiha/audio.mp3`) or an https URL. */
  audioFile: z.string().describe('Audio: a path in public/ or a URL'),
  /** A `public/` path to a `RecitationTimings` JSON (with or without the studio's `alignment` sidecar). */
  timingsFile: z.string().describe('Timings JSON in public/'),
  /** 0 keeps the file's range. */
  fromAyah: z.number().int().min(0).max(286).describe('First ayah to show (0: as the timings say)'),
  toAyah: z.number().int().min(0).max(286).describe('Last ayah to show (0: as the timings say)'),
  /** Show only the recited ayahs on the first and last lines. */
  slice: z.boolean().describe('Hide the neighbours’ words on the first and last lines'),
  splits: z.array(lineSplitSchema).describe('Printed lines split into two timed segments'),
  /** Only when the recitation starts at ayah 1: the surah's printed header lines before it. */
  header: headerSchema,
  theme: themeNameSchema,
  customTheme: customThemeSchema,
  fonts: fontsSchema,
  data: dataSchema,
  layout: layoutSchema,
  animation: animationSchema,
  highlight: highlightSchema,
  text: textSchema,
  overlay: overlaySchema.describe('Title card at the start and a label in a corner'),
  review: reviewSchema,
  /** Filled by calculateMetadata; see `ResolvedRecitation`. */
  resolved: z.any().nullable().describe('Filled by calculateMetadata'),
});

export type MushafRecitationProps = z.infer<typeof mushafRecitationSchema>;

/**
 * Defaults that work out of the box: Al-Fatihah (ayahs 2-7) by Abdul Hamid Ghraio from the
 * aligner's catalogue, the audio streamed from the catalogue's clip URL and the timings committed
 * in the app's `public/`; the mushaf data from the mirror the app ships; plain theme, a three-line
 * window.
 */
export const defaultMushafRecitationProps: MushafRecitationProps = {
  audioFile:
    'https://hetchyy-quranic-universal-aligner.hf.space/preload-audio/abdul_hamid_ghraio_2025_yt/1.mp3?start_ms=2909&end_ms=30695',
  timingsFile: 'mushaf-studio/fatiha/timings.json',
  fromAyah: 0,
  toAyah: 0,
  slice: true,
  splits: [],
  header: 'none',
  theme: 'plain',
  customTheme: defaultCustomTheme,
  fonts: 'fallback',
  data: 'mirror',
  layout: defaultLayout,
  animation: defaultAnimation,
  highlight: defaultHighlight,
  text: defaultText,
  overlay: defaultOverlay,
  review: defaultReview,
  resolved: null,
};

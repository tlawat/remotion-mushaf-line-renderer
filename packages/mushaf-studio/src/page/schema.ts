import {z} from 'zod';
import {defaultHostAudio, hostAudioSchema} from '../audio/host';
import {audioSchema, defaultAudio} from '../audio/schema';
import {backgroundSchema, defaultBackground} from '../background/schema';
import {
  customThemeSchema,
  dataSchema,
  defaultCustomTheme,
  defaultEndCard,
  defaultHighlight,
  defaultLayout,
  defaultLegend,
  defaultReview,
  defaultText,
  endCardSchema,
  fontsSchema,
  highlightSchema,
  layoutSchema,
  legendSchema,
  reviewSchema,
  textSchema,
  themeNameSchema,
} from '../schema';
import {defaultPageView, pageViewSchema} from './view';

export {
  defaultPageView,
  LINE_HIGHLIGHTS,
  PAGE_FRAMES,
  PAGE_TURNS,
  type PageView,
  pageViewSchema,
} from './view';

/** Where the page's translations go: beside the page (the gutter left of it), under it, or wherever there is more room. */
export const PAGE_TRANSLATION_POSITIONS = ['auto', 'beside', 'below', 'none'] as const;

/**
 * The page's translations: `textSchema` (one file with its type, or a stack of up to three in
 * `translations`), placed beside or under the page. The word-by-word fields do not apply (the page
 * is printed whole), as under `<MushafAyahText>`; `translationOffsetY` moves the block up or down.
 */
export const pageTextSchema = textSchema.extend({
  translationPosition: z
    .enum(PAGE_TRANSLATION_POSITIONS)
    .describe(
      'Where the translation goes: beside the page, under it, wherever there is more room (auto), or none (hidden; still read)',
    ),
});

export type PageText = z.infer<typeof pageTextSchema>;

/** No translation; when one is set, wherever the frame has more room, in `defaultText`'s type. */
export const defaultPageText: PageText = {...defaultText, translationPosition: 'auto'};

/**
 * The props of `<MushafPage>`: the whole printed page a recitation is on, followed line by line.
 * Content as `<MushafRecitation>`'s (audio, timings, range, theme, fonts, data); style in the Props
 * sidebar. `resolved` is filled by `calculateMetadata()` and is not meant to be edited.
 */
export const mushafPageSchema = z.object({
  /** A `public/` path (`mushaf-studio/fatiha/audio.mp3`) or an https URL. */
  audioFile: z
    .string()
    .describe(
      "Audio: a path in public/ or a URL (when the path is missing, the catalogue clip its timings name streams instead; under hostAudio, the file of the template's track)",
    ),
  /** A `public/` path to a `RecitationTimings` JSON (with or without the studio's `alignment` sidecar). */
  timingsFile: z.string().describe('Timings JSON in public/'),
  /** 0 keeps the file's range. A range of one surah's timings: timings across surahs (version 2) are used whole. */
  fromAyah: z
    .number()
    .int()
    .min(0)
    .max(286)
    .describe('First ayah to follow (0: as the timings say; timings across surahs are used whole)'),
  toAyah: z
    .number()
    .int()
    .min(0)
    .max(286)
    .describe('Last ayah to follow (0: as the timings say; timings across surahs are used whole)'),
  theme: themeNameSchema,
  customTheme: customThemeSchema,
  fonts: fontsSchema,
  data: dataSchema,
  /** The page is centred and scaled to fit; `visibleLines`, `neighbourOpacity`, `verticalAlign` and `offsetY` do not apply. */
  layout: layoutSchema.describe(
    'Frame, page colour (painted when background.kind is color) and margins. The page is centred: lines on screen, their opacity and position do not apply',
  ),
  background: backgroundSchema.describe(
    'Around the page: a colour, a gradient, an image or a looping video, a vignette and a slow zoom. background.color fills only behind an image, video or gradient',
  ),
  highlight: highlightSchema.describe(
    'What follows the recitation inside the line and how it is marked (pageView marks the line)',
  ),
  review: reviewSchema.describe('Studio only: the doubtful words of the alignment'),
  pageView: pageViewSchema.describe('The page: the current line’s mark, the border, the page number and the turn'),
  text: pageTextSchema.describe(
    'The ayah translations, beside or under the page (the word-by-word fields do not apply)',
  ),
  legend: legendSchema.describe('Legend of the tajweed colours (colour themes only)'),
  endCard: endCardSchema.describe('A closing card after the last ayah'),
  audio: audioSchema.describe(
    'The recitation’s loudness, fades and leading silence (does nothing under hostAudio: the template’s <Audio> owns them)',
  ),
  /** Optional: props saved before it existed read as off (`hostAudioOf()`). */
  hostAudio: hostAudioSchema
    .optional()
    .describe('Follow an audio track of the template instead of playing audioFile (wins over the audio cleanup)'),
  /** Filled by calculateMetadata; see `ResolvedPage`. */
  resolved: z.any().nullable().describe('Filled by calculateMetadata'),
});

export type MushafPageProps = z.infer<typeof mushafPageSchema>;

/**
 * Defaults that work out of the box: the same Al-Fatihah sample as `<MushafRecitation>` (ayahs 2-7
 * by Abdul Hamid Ghraio from the aligner's catalogue, the audio in the app's `public/` beside the
 * timings committed there), the mushaf data from the app's mirror, the Mushaf palette,
 * a 16:9 frame with page 1 centred in it.
 */
export const defaultMushafPageProps: MushafPageProps = {
  audioFile: 'mushaf-studio/fatiha/audio.mp3',
  timingsFile: 'mushaf-studio/fatiha/timings.json',
  fromAyah: 0,
  toAyah: 0,
  theme: 'custom',
  customTheme: defaultCustomTheme,
  fonts: 'fallback',
  data: 'mirror',
  layout: defaultLayout,
  background: defaultBackground,
  highlight: defaultHighlight,
  review: defaultReview,
  pageView: defaultPageView,
  text: defaultPageText,
  legend: defaultLegend,
  endCard: defaultEndCard,
  audio: defaultAudio,
  hostAudio: defaultHostAudio,
  resolved: null,
};

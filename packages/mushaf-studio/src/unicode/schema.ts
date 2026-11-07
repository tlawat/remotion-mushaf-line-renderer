import {z} from 'zod';
import {defaultHostAudio, hostAudioSchema} from '../audio/host';
import {audioSchema, defaultAudio} from '../audio/schema';
import {backgroundSchema, defaultBackground} from '../background/schema';
import {
  animationSchema,
  defaultAnimation,
  defaultEndCard,
  defaultHighlight,
  defaultLayout,
  defaultMemorize,
  defaultOverlay,
  defaultText,
  endCardSchema,
  highlightSchema,
  layoutSchema,
  memorizeSchema,
  overlaySchema,
  textSchema,
} from '../schema';
import {UNICODE_FONT_IDS} from './font';

/** How one ayah gives way to the next: `animationSchema` itself (the same three fields). */
export const ayahAnimationSchema = animationSchema;

/**
 * The props of `<MushafAyahText>`: one ayah at a time as Unicode text, for reels and short clips.
 * Content as `<MushafRecitation>`'s (audio, timings, range) plus the text file; style in the Props
 * sidebar. `resolved` is filled by `calculateMetadata()` and is not meant to be edited.
 */
export const mushafAyahTextSchema = z.object({
  /** A `public/` path (`mushaf-studio/fatiha/audio.mp3`) or an https URL. */
  audioFile: z
    .string()
    .describe(
      "Audio: a path in public/ or a URL (when the path is missing, the catalogue clip its timings name streams instead; under hostAudio, the file of the template's track)",
    ),
  /** A `public/` path to a `RecitationTimings` JSON (with or without the studio's `alignment` sidecar). */
  timingsFile: z.string().describe('Timings JSON in public/'),
  /** 0 keeps the file's range. */
  fromAyah: z.number().int().min(0).max(286).describe('First ayah to show (0: as the timings say)'),
  toAyah: z.number().int().min(0).max(286).describe('Last ayah to show (0: as the timings say)'),
  /**
   * A `public/` path to an `AyahWords` file (`serialiseAyahWords()`). Never fetched during a render:
   * the panel's Text tab, or `fetchQuranComText()` once, writes it.
   */
  textFile: z.string().describe('Quran text JSON in public/ (fetch it once in the Mushaf panel’s Text tab)'),
  font: z.enum(UNICODE_FONT_IDS).describe('Unicode Quran font from QUL'),
  /** px, at the composition's width. */
  fontSize: z.number().int().min(40).max(200).describe('Size of the Arabic text in px'),
  lineHeight: z
    .number()
    .min(1)
    .max(2.5)
    .step(0.05)
    .describe('Line height of the Arabic text, in multiples of its size'),
  /** The shared layout; `visibleLines` and `neighbourOpacity` do not apply (one ayah is on screen at a time). */
  layout: layoutSchema.describe(
    'Frame, page colour (painted when background.kind is color), margins and position. Lines on screen and their opacity do not apply',
  ),
  background: backgroundSchema.describe(
    'Behind the ayah: a colour, a gradient, an image or a looping video, and a glow. background.color fills only behind an image, video or gradient',
  ),
  animation: ayahAnimationSchema.describe('How each ayah comes in and goes out'),
  highlight: highlightSchema.describe('What follows the recitation and how it is marked'),
  /** `'first-letters'` shows the first letter of each word to come, with a tatweel. */
  memorize: memorizeSchema.describe(
    'Memorisation: repeat each ayah, hide the words to come or show their first letters (no repeats under hostAudio)',
  ),
  /** The ayah translation goes under (or over) the ayah; the gloss fields do not apply. */
  text: textSchema.describe('The ayah translations (the word-by-word fields do not apply)'),
  overlay: overlaySchema.describe('Title card at the start and a label in a corner'),
  endCard: endCardSchema.describe('A closing card after the last ayah'),
  audio: audioSchema.describe(
    'The recitation’s loudness, fades and leading silence (does nothing under hostAudio: the template’s <Audio> owns them)',
  ),
  /** Optional: props saved before it existed read as off (`hostAudioOf()`). */
  hostAudio: hostAudioSchema
    .optional()
    .describe('Follow an audio track of the template instead of playing audioFile (wins over the audio cleanup)'),
  /** Filled by calculateMetadata; see `ResolvedAyahText`. */
  resolved: z.any().nullable().describe('Filled by calculateMetadata'),
});

export type MushafAyahTextProps = z.infer<typeof mushafAyahTextSchema>;
export type AyahAnimation = z.infer<typeof ayahAnimationSchema>;

/**
 * Defaults that work out of the box: the same Al-Fatihah sample as `<MushafRecitation>` (ayahs 2-7
 * by Abdul Hamid Ghraio from the aligner's catalogue, the audio in the app's `public/` beside the
 * timings committed there) with its Uthmani text beside them; a 9:16 reel, warm ivory
 * text on charcoal, the words still to come resting lighter.
 */
export const defaultMushafAyahTextProps: MushafAyahTextProps = {
  audioFile: 'mushaf-studio/fatiha/audio.mp3',
  timingsFile: 'mushaf-studio/fatiha/timings.json',
  fromAyah: 0,
  toAyah: 0,
  textFile: 'mushaf-studio/fatiha/text-uthmani.json',
  font: 'uthmani-hafs',
  fontSize: 96,
  lineHeight: 1.9,
  layout: {...defaultLayout, aspect: '9:16', marginX: 90, background: '#121416', color: '#f1eadb'},
  // The colour behind an image or a video: the dark page's.
  background: {...defaultBackground, color: '#121416'},
  animation: defaultAnimation,
  highlight: defaultHighlight,
  memorize: defaultMemorize,
  // The shared default translation colour is a dark grey for a light page; this one reads on the dark page.
  text: {...defaultText, translationColor: '#c9c1b2'},
  // The shared default title ink is the light page's; this one reads on the dark page.
  overlay: {...defaultOverlay, color: '#f4efe6'},
  endCard: defaultEndCard,
  audio: defaultAudio,
  hostAudio: defaultHostAudio,
  resolved: null,
};

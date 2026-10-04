// The Zod fragments every composition's schema is built from, and the converters that turn their
// values into the package's own vocabulary. The Studio's Props sidebar renders these as controls
// (enums, numbers with min/max/step, `zColor()` pickers, nested objects), so the shape here is the
// user interface: names, order and descriptions are part of the contract.
import {zColor} from '@remotion/zod-types';
import type {MushafThemeSelection} from '@tlawat/remotion-mushaf-line';
import {z} from 'zod';

// The converters, one file per concern; the fragments stay here because they are the contract.
export {animationFrom, type LineAnimationProps, scrollTimingFrom} from './animation';
export {type DataSource, dataSchema, dataSourceFrom, MIRROR_FILES} from './data';
export {type FontProps, type FontSetup, fontPropsFrom} from './fonts';
export {activeWordStyleFrom, type WordStartIndex, type WordStyleOptions, wordStyleFrom} from './highlight';

/** The ten presets of the colour font plus `plain` (the monochrome font) and `custom` (see `customThemeSchema`). */
export const THEME_NAMES = [
  'plain',
  'light',
  'dark',
  'sepia',
  'black',
  'normal',
  'p1',
  'p2',
  'p3',
  'p4',
  'p5',
] as const;

export const themeNameSchema = z.enum([...THEME_NAMES, 'custom']).describe('Colour theme of the mushaf line');

/** A custom palette: a preset to start from and a colour per part. Used when `theme` is `custom`. */
export const customThemeSchema = z.object({
  base: z
    .enum(['light', 'dark', 'sepia', 'black', 'normal', 'p1', 'p2', 'p3', 'p4', 'p5'])
    .describe('Preset to start from'),
  ink: zColor().describe('The letters'),
  silent: zColor().describe('Letters written but not pronounced'),
  rules: zColor().describe('The seven tajweed rule colours (one colour for all)'),
  frame: zColor().describe('The ayah-end rosette and its number'),
  accent: zColor().describe('The rosette’s petals'),
  detail: zColor().describe('The jewel at the top of the rosette'),
  background: zColor().describe('The disc behind the ayah number'),
  /** Which parts the colours above override; the others keep the preset's colours. */
  override: z.object({
    ink: z.boolean(),
    silent: z.boolean(),
    rules: z.boolean(),
    frame: z.boolean(),
    accent: z.boolean(),
    detail: z.boolean(),
    background: z.boolean(),
  }),
});

export const fontsSchema = z
  .enum(['fallback', 'cdn', 'package'])
  .describe(
    'Where the page fonts come from: QUL’s CDN with the fonts packages as fallback, the CDN only, or the packages only (offline)',
  );

export const ASPECTS = ['16:9', '9:16', '1:1', '4:5'] as const;

export const layoutSchema = z.object({
  aspect: z.enum(ASPECTS).describe('Frame shape: 16:9 landscape, 9:16 reels, 1:1 square, 4:5 portrait'),
  /** 0 shows one line at a time, replaced in place; 1-7 shows a window of that many line slots. */
  visibleLines: z.number().int().min(0).max(7).describe('Lines on screen at once (0: one line, replaced in place)'),
  neighbourOpacity: z.number().min(0).max(1).step(0.05).describe('Opacity of the lines around the current one'),
  /** px, at the composition's width. */
  marginX: z.number().int().min(0).max(400).step(10).describe('Side margins in px'),
  background: zColor().describe('Page colour'),
  color: zColor().describe('Ink colour (plain theme, and every part a theme paints in currentColor)'),
  /** A `public/` path of an image behind everything, or empty for none. */
  backgroundImage: z.string().describe('Background image in public/ (empty: none)'),
  /** Vertical position of the lines' block, 0 top, 0.5 middle, 1 bottom. */
  verticalAlign: z.number().min(0).max(1).step(0.05).describe('Vertical position of the lines (0 top, 1 bottom)'),
  /** px, added to the block's position from `verticalAlign`: a nudge the canvas cannot write into the props itself. */
  offsetY: z.number().int().min(-800).max(800).step(10).describe('Move the lines up (negative) or down, in px'),
});

export const ENTRANCES = ['slide-fade', 'fade', 'reveal-rtl', 'none'] as const;

export const animationSchema = z.object({
  enter: z.enum(ENTRANCES).describe('How a line comes in'),
  exit: z.enum(ENTRANCES).describe('How a line goes out'),
  /** Seconds a line is in place before its first word is heard. */
  leadInSeconds: z.number().min(0).max(3).step(0.1).describe('Seconds a line is on screen before its first word'),
  scroll: z.enum(['ease', 'spring']).describe('Curve of the window’s scroll between lines'),
});

export const HIGHLIGHT_STYLES = ['color', 'glow', 'marker', 'none'] as const;

export const highlightSchema = z.object({
  mode: z.enum(['word', 'ayah', 'none']).describe('What follows the recitation: the word, the whole ayah, or nothing'),
  style: z.enum(HIGHLIGHT_STYLES).describe('How the current word is marked: ink colour, a glow, a marker behind it'),
  color: zColor().describe('Colour of the mark'),
  /** Opacity of the words that are not current: 1 for no dimming. */
  dimOthers: z.number().min(0).max(1).step(0.05).describe('Opacity of the other words (1: none)'),
  /** Dim only the words not yet recited; the ones already heard stay at full opacity. */
  dimUpcomingOnly: z.boolean().describe('Dim only the words still to come'),
  /** Which recitation of a repeated word moves the highlight. */
  occurrence: z.enum(['first', 'last']).describe('For a repeated word: follow its first or its last recitation'),
});

export const textSchema = z.object({
  /** A `public/` path to a translation file (QUL shape or the studio envelope), or empty. */
  translationFile: z.string().describe('Ayah translation file in public/ (empty: none)'),
  translationPosition: z.enum(['below', 'above', 'none']).describe('Where the ayah translation goes'),
  translationFont: z.string().describe('CSS font family of the translation'),
  translationSize: z.number().int().min(12).max(120).describe('Translation size in px'),
  translationColor: zColor().describe('Translation colour'),
  translationDirection: z.enum(['ltr', 'rtl']).describe('Writing direction of the translation'),
  /** px, added to the translation block's position under or over the lines. */
  translationOffsetY: z
    .number()
    .int()
    .min(-800)
    .max(800)
    .step(10)
    .describe('Move the translation up (negative) or down, in px'),
  /** A `public/` path to a word-by-word translation, or empty. */
  glossFile: z.string().describe('Word-by-word translation file in public/ (empty: none)'),
  /** A `public/` path to a word-by-word transliteration, or empty. */
  transliterationFile: z.string().describe('Word-by-word transliteration file in public/ (empty: none)'),
  glossFont: z.string().describe('CSS font family of the gloss strip'),
  glossSize: z.number().int().min(12).max(120).describe('Gloss size in px'),
  glossColor: zColor().describe('Gloss colour'),
});

/** Where the word-by-word gloss goes: the strip at the bottom, under each printed word, or nowhere. */
export const GLOSS_POSITIONS = ['strip', 'interlinear', 'none'] as const;

/**
 * `<MushafRecitation>`'s text settings: `textSchema` and where the gloss goes. Under
 * `'interlinear'` each word's gloss (and transliteration) sits under that word of the printed line,
 * at `glossSize` capped to 0.3 of the line's type size, shrunk to fit its word (to 70 %) and cut
 * with an ellipsis past that; the line slots grow by the gloss rows.
 */
export const recitationTextSchema = textSchema.extend({
  glossPosition: z
    .enum(GLOSS_POSITIONS)
    .describe('Where the word-by-word gloss goes: a strip at the bottom, under each printed word, or nowhere'),
});

export const MEMORIZE_MODES = ['off', 'first-letters', 'blank-upcoming', 'blank-all', 'repeat'] as const;

/**
 * Memorisation (hifz) modes. Every mode but `'off'` plays each ayah `repeat` times before the next,
 * `pauseSeconds` apart, with a "2/3" counter in a corner (the duration grows to match). The blank
 * modes hide words on the first `revealAfterRepeats` plays: `'blank-upcoming'` the words not yet
 * recited, `'blank-all'` every word but the active one and those already recited in this play.
 * `'first-letters'` shows an upcoming word's first letter and a tatweel in Unicode text
 * (`<MushafAyahText>`); the printed lines' glyph fonts cannot be cut into letters, so there it is
 * `'blank-upcoming'` with a faint outline (opacity 0.12). `'repeat'` repeats without hiding.
 */
export const memorizeSchema = z.object({
  mode: z
    .enum(MEMORIZE_MODES)
    .describe(
      'Memorisation: off, first letters of the words to come, blank the words to come, blank all but the recited words, or repeat only',
    ),
  repeat: z.number().int().min(1).max(10).describe('Plays of each ayah before the next (every mode but off)'),
  pauseSeconds: z.number().min(0).max(5).step(0.1).describe('Seconds of silence between two plays of an ayah'),
  revealAfterRepeats: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe('Blank and first-letter modes: plays of each ayah that hide the text; the later ones show it'),
});

export const reviewSchema = z.object({
  /** In the Studio only (never in a render): paint the words whose alignment is doubtful. */
  showDoubtful: z.boolean().describe('Studio only: mark words whose alignment is doubtful'),
  confidenceThreshold: z.number().min(0).max(1).step(0.05).describe('Segments under this confidence are doubtful'),
  doubtColor: zColor().describe('Colour of the doubt mark'),
});

export const OVERLAY_TITLES = ['none', 'intro', 'corner', 'both'] as const;
export const OVERLAY_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

/**
 * The title overlay: an intro card over the first seconds (the surah name in its printed frame, the
 * ayah range, the reciter) and a small label in a corner for the whole video (the surah, the ayah
 * being heard, the reciter). Nothing is shifted for the card: it covers the start and fades out.
 */
export const overlaySchema = z.object({
  title: z
    .enum(OVERLAY_TITLES)
    .describe('Title: none, an intro card, a corner label, or both (intro card, then the corner label)'),
  /** The card fades out 0.3 s before the first word when the recitation starts earlier than this. */
  introSeconds: z.number().min(1).max(8).step(0.5).describe('Seconds the intro card stays'),
  /** Free text: the Mushaf panel does not fill it. */
  reciter: z.string().describe('Reciter’s name, under the title and in the corner (empty: none)'),
  color: zColor().describe('Colour of the title texts'),
  font: z.string().describe('CSS font family of the title texts'),
  corner: z.enum(OVERLAY_CORNERS).describe('Corner of the label'),
  /** px, at the composition's width. */
  cornerSize: z.number().int().min(12).max(60).describe('Size of the corner label in px'),
});

/** The surah's printed header before its first ayah: nothing, its name, or its name and basmalah (when it has one). */
export const headerSchema = z
  .enum(['none', 'name', 'name-basmalah'])
  .describe('When the passage starts at ayah 1: show the surah’s name (and basmalah) before it');

export const lineSplitSchema = z.object({
  page: z.number().int().min(1).max(604),
  line: z.number().int().min(1).max(15),
  /** `MushafWord.wordId` of the first word of the second segment. */
  atWordId: z.number().int().min(1),
});

export type ThemeName = z.infer<typeof themeNameSchema>;
export type CustomTheme = z.infer<typeof customThemeSchema>;
export type Fonts = z.infer<typeof fontsSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type Animation = z.infer<typeof animationSchema>;
export type Highlight = z.infer<typeof highlightSchema>;
export type Text = z.infer<typeof textSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type GlossPosition = (typeof GLOSS_POSITIONS)[number];
export type RecitationText = z.infer<typeof recitationTextSchema>;
export type MemorizeMode = (typeof MEMORIZE_MODES)[number];
export type Memorize = z.infer<typeof memorizeSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type HeaderMode = z.infer<typeof headerSchema>;

export const defaultCustomTheme: CustomTheme = {
  base: 'normal',
  ink: '#1b1b1b',
  silent: '#8a8a8a',
  rules: '#1b6f3f',
  frame: '#1b1b1b',
  accent: '#c8a45c',
  detail: '#c8a45c',
  background: 'transparent',
  override: {ink: false, silent: false, rules: false, frame: false, accent: true, detail: true, background: false},
};

export const defaultLayout: Layout = {
  aspect: '16:9',
  visibleLines: 3,
  neighbourOpacity: 0.45,
  marginX: 120,
  background: '#fbf7ee',
  color: '#1b1b1b',
  backgroundImage: '',
  verticalAlign: 0.5,
  offsetY: 0,
};

export const defaultAnimation: Animation = {
  enter: 'slide-fade',
  exit: 'slide-fade',
  leadInSeconds: 0.4,
  scroll: 'ease',
};

export const defaultHighlight: Highlight = {
  mode: 'word',
  style: 'color',
  color: '#c8a45c',
  dimOthers: 1,
  dimUpcomingOnly: false,
  occurrence: 'first',
};

export const defaultText: Text = {
  translationFile: '',
  translationPosition: 'below',
  translationFont: 'Georgia, "Noto Serif", serif',
  translationSize: 40,
  translationColor: '#4a4a4a',
  translationDirection: 'ltr',
  translationOffsetY: 0,
  glossFile: '',
  transliterationFile: '',
  glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
  glossSize: 34,
  glossColor: '#6a6a6a',
};

/** `defaultText` with the gloss in its strip at the bottom. */
export const defaultRecitationText: RecitationText = {...defaultText, glossPosition: 'strip'};

/** Off; when a mode is picked: three plays of each ayah, half a second apart, the text revealed from the second. */
export const defaultMemorize: Memorize = {mode: 'off', repeat: 3, pauseSeconds: 0.5, revealAfterRepeats: 1};

/** No title; when one is turned on: a three-second card, dark ink in the translation's serif, the label top right. */
export const defaultOverlay: Overlay = {
  title: 'none',
  introSeconds: 3,
  reciter: '',
  color: '#1b1b1b',
  font: 'Georgia, "Noto Serif", serif',
  corner: 'top-right',
  cornerSize: 28,
};

export const defaultReview: Review = {showDoubtful: true, confidenceThreshold: 0.8, doubtColor: '#d94848'};

/** The package's `MushafThemeSelection` for a theme name and, when `custom`, the custom palette. */
export const themeSelectionFrom = (theme: ThemeName, custom: CustomTheme): MushafThemeSelection => {
  if (theme !== 'custom') return theme;
  const colors: Record<string, string> = {};
  for (const part of ['ink', 'silent', 'rules', 'frame', 'accent', 'detail', 'background'] as const) {
    if (custom.override[part]) colors[part] = custom[part];
  }
  return {base: custom.base, colors};
};

/** Composition width and height for an aspect, at 1080p-class sizes the renderer handles well. */
export const sizeForAspect = (aspect: Layout['aspect']): {readonly width: number; readonly height: number} => {
  switch (aspect) {
    case '16:9':
      return {width: 1920, height: 1080};
    case '9:16':
      return {width: 1080, height: 1920};
    case '1:1':
      return {width: 1080, height: 1080};
    case '4:5':
      return {width: 1080, height: 1350};
  }
};

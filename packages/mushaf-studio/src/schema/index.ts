// The Zod fragments every composition's schema is built from, and the converters that turn their
// values into the package's own vocabulary. The Studio's Props sidebar renders these as controls
// (enums, numbers with min/max/step, `zColor()` pickers, nested objects), so the shape here is the
// user interface: names, order and descriptions are part of the contract.
import {zColor} from '@remotion/zod-types';
import type {MushafThemeSelection} from '@tlawat/remotion-mushaf-line';
import {z} from 'zod';

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
  /** A `public/` path to a word-by-word translation, or empty. */
  glossFile: z.string().describe('Word-by-word translation file in public/ (empty: none)'),
  /** A `public/` path to a word-by-word transliteration, or empty. */
  transliterationFile: z.string().describe('Word-by-word transliteration file in public/ (empty: none)'),
  glossFont: z.string().describe('CSS font family of the gloss strip'),
  glossSize: z.number().int().min(12).max(120).describe('Gloss size in px'),
  glossColor: zColor().describe('Gloss colour'),
});

export const reviewSchema = z.object({
  /** In the Studio only (never in a render): paint the words whose alignment is doubtful. */
  showDoubtful: z.boolean().describe('Studio only: mark words whose alignment is doubtful'),
  confidenceThreshold: z.number().min(0).max(1).step(0.05).describe('Segments under this confidence are doubtful'),
  doubtColor: zColor().describe('Colour of the doubt mark'),
});

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
  glossFile: '',
  transliterationFile: '',
  glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
  glossSize: 34,
  glossColor: '#6a6a6a',
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

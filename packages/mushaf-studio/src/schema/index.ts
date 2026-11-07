// The Zod fragments every composition's schema is built from, and the converters that turn their
// values into the package's own vocabulary. The Studio's Props sidebar renders these as controls
// (enums, numbers with min/max/step, `zColor()` pickers, nested objects), so the shape here is the
// user interface: names, order and descriptions are part of the contract. A description shows in
// the info bubble beside its field's name; where two options overlap, it starts with the rule that
// decides which one wins. A colour field has none: Remotion 4.0.539 draws its picker only while the
// description is still `zColor()`'s own marker, so what a colour does goes in its doc comment and,
// where a rule decides it, in its group's description.
import {zColor} from '@remotion/zod-types';
import type {MushafThemeSelection} from '@tlawat/remotion-mushaf-line';
import {z} from 'zod';
import {TEMPOS} from './tokens';

// The converters, one file per concern; the fragments stay here because they are the contract.
export {animationFrom, type LineAnimationProps, riseDistance, scrollTimingFrom} from './animation';
export {
  ACCENT_CHROMA,
  ACCENT_CONTRAST,
  capChroma,
  contrast,
  fromOklch,
  groundOf,
  isLightGround,
  legibleAccent,
  mixColors,
  type Oklch,
  parseColor,
  type Rgba,
  readableInk,
  relativeLuminance,
  TEXT_CONTRAST,
  toHex,
  toOklch,
  WASH_ALPHA_CAP,
  washAlpha,
  washColor,
} from './color';
export {type DataSource, dataSchema, dataSourceFrom, MIRROR_FILES} from './data';
export {type FontProps, type FontSetup, fontPropsFrom, type StudioFontRole, studioFontFamily} from './fonts';
export {
  activeWordStyleFrom,
  effectiveNeighbourOpacity,
  effectiveRestOpacity,
  inkTintFor,
  type TintPath,
  tintPath,
  type WordStartIndex,
  type WordStyleOptions,
  wordStyleFrom,
} from './highlight';
export {
  type AyahSpan,
  ayahEmphasis,
  ayahSpanIndex,
  ayahSpans,
  type Boundary,
  type BoundaryKind,
  type BoundaryOptions,
  boundaryStart,
  hasWordTimes,
  inkFill,
  MIN_SPAN_FRAMES,
  type OutgoingEndOptions,
  outgoingEnd,
  RELEASE_SECONDS,
  type WordSpan,
  type WordSpanOptions,
  wordEmphasis,
  wordSpanIndex,
  wordSpans,
  wordStartIndex,
} from './marks';
export {
  describeMushafMigration,
  type MigrateOptions,
  type MigrationNote,
  migrateMushafProps,
  mushafPropsNeedMigration,
} from './migrate';
export {
  ACCENT_GOLD,
  ARRIVE,
  type DissolveOpacities,
  DURATIONS,
  type DurationToken,
  dissolve,
  GROUNDS,
  type GroundTokens,
  INOUT,
  METAL,
  metalOf,
  SINE,
  SOFT,
  TEMPOS,
  type Tempo,
  tempoFrames,
  tempoSeconds,
} from './tokens';
export {type WashCap, type WashStyleOptions, washStyle} from './wash';

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

export const themeNameSchema = z
  .enum([...THEME_NAMES, 'custom'])
  .describe('Colour theme of the mushaf line (custom: the customTheme palette)');

/** A custom palette: a preset to start from and a colour per part. Used when `theme` is `custom`. */
export const customThemeSchema = z
  .object({
    base: z
      .enum(['light', 'dark', 'sepia', 'black', 'normal', 'p1', 'p2', 'p3', 'p4', 'p5'])
      .describe('Preset to start from'),
    /** The letters. */
    ink: zColor(),
    /** Letters written but not pronounced. */
    silent: zColor(),
    /** The seven tajweed rule colours (one colour for all). */
    rules: zColor(),
    /** The ayah-end rosette and its number. */
    frame: zColor(),
    /** The rosette's petals. */
    accent: zColor(),
    /** The jewel at the top of the rosette. */
    detail: zColor(),
    /** The disc behind the ayah number. */
    background: zColor(),
    /** Which parts the colours above override; the others keep the preset's colours. */
    override: z
      .object({
        ink: z.boolean(),
        silent: z.boolean(),
        rules: z.boolean(),
        frame: z.boolean(),
        accent: z.boolean(),
        detail: z.boolean(),
        background: z.boolean(),
      })
      .describe('The parts the colours above repaint; the others keep the base preset’s'),
  })
  .describe(
    'Used only when theme is custom: a base preset and a colour per part (ink, silent letters, rules, rosette frame, accent, detail, number disc)',
  );

export const fontsSchema = z
  .enum(['fallback', 'cdn', 'package'])
  .describe(
    'Page fonts: fallback = QUL’s CDN, then the registered fonts packages; cdn = CDN only; package = the packages (name fonts from public/fonts). Without registerMushafFonts() every mode uses the CDN',
  );

export const ASPECTS = ['16:9', '9:16', '1:1', '4:5'] as const;

/** The border of the frame: none, or a thin gold double rule inside the safe area (the jadwal of a printed page). */
export const LAYOUT_FRAMES = ['none', 'hairline'] as const;

/**
 * The frame and the lines in it. `background` is the page colour: the `'color'` kind of the
 * `background` group paints it (`background.color` only fills behind an image, a video or a
 * gradient), and the title card, the counter and the end card use it whatever the kind.
 * `backgroundImage` is kept for props saved before the `background` group (`backgroundFor()`).
 */
export const layoutSchema = z.object({
  aspect: z.enum(ASPECTS).describe('Frame shape: 16:9 landscape, 9:16 reels, 1:1 square, 4:5 portrait'),
  /** 0 shows one line at a time, replaced in place; 1-7 shows a window of that many line slots. */
  visibleLines: z.number().int().min(0).max(7).describe('Lines on screen at once (0: one line, replaced in place)'),
  neighbourOpacity: z
    .number()
    .min(0.15)
    .max(0.5)
    .step(0.05)
    .describe('Opacity of the lines around the current one (under ink, kept 0.2 below restOpacity)'),
  /** px, at the composition's width. */
  marginX: z
    .number()
    .int()
    .min(0)
    .max(400)
    .step(10)
    .describe('Side margins in px (about 10 % of the width reads best at 16:9)'),
  /** Page colour: painted when `background.kind` is `color`; the title card, counter and end card use it always. */
  background: zColor(),
  /** Ink colour: the plain theme's, and every part a theme paints in `currentColor`. */
  color: zColor(),
  frame: z
    .enum(LAYOUT_FRAMES)
    .describe('A thin gold double rule inside the safe area, as on a printed page (none: no border)'),
  /** A `public/` path of an image behind everything, or empty for none: superseded by `background.src`. */
  backgroundImage: z
    .string()
    .describe(
      'Legacy image in public/: shown when background.kind is color, or image with an empty src (background.src wins; empty: none)',
    ),
  /** Vertical position of the lines' block, 0 top, 0.5 middle, 1 bottom. */
  verticalAlign: z.number().min(0).max(1).step(0.05).describe('Vertical position of the lines (0 top, 1 bottom)'),
  /** px, added to the block's position from `verticalAlign`: a nudge the canvas cannot write into the props itself. */
  offsetY: z.number().int().min(-800).max(800).step(10).describe('Move the lines up (negative) or down, in px'),
});

/** How a line or an ayah gives way to the next: a dissolve, a dissolve with a slight rise, or a cut. */
export const LINE_MOTIONS = ['fade', 'rise', 'cut'] as const;
/** @deprecated The `enter` / `exit` values saved before this design; `migrateMushafProps()` maps them to `lines`. */
export const ENTRANCES = ['slide-fade', 'fade', 'reveal-rtl', 'none'] as const;

/**
 * How lines give way (the panel's "Motion"): always after the outgoing line's last word, by a
 * staggered dissolve (`dissolve()`), with a rise of at most 0.12 em, or by a cut (the reduce-motion
 * path; the marks still ease). `tempo: 'slow'` lengthens every change of line, ayah, page and card
 * 1.4×; the word marks keep their pace, in sync with the voice.
 */
export const animationSchema = z.object({
  lines: z
    .enum(LINE_MOTIONS)
    .describe(
      'How a line or ayah gives way to the next, always after its last word: a dissolve, a dissolve with a slight rise, or a cut',
    ),
  tempo: z.enum(TEMPOS).describe('Pace of every change: calm, or slow (1.4× longer). The word mark keeps its pace'),
  /** Seconds the incoming line waits, settled, before its first word, when the pause allows it. */
  leadInSeconds: z
    .number()
    .min(0)
    .max(2)
    .step(0.1)
    .describe('Longest a new line waits, settled, before its first word (it never comes before the last line ends)'),
});

/** One mark at a time: ink (the words still to come rest lighter), tint (the word's ink in the accent), or wash (a faint band). */
export const HIGHLIGHT_STYLES = ['ink', 'tint', 'wash'] as const;
/** The `style` values saved before this design; `migrateMushafProps()` maps them. */
export const LEGACY_HIGHLIGHT_STYLES = ['color', 'glow', 'marker', 'none'] as const;

/**
 * What follows the recitation and how it is marked: exactly one device, eased in and out, never a
 * box, a halo or two marks together. `ink` dims only what is still to come on the current line and
 * fills it in as it is heard; `tint` turns the word's (or ayah's) ink into the accent, read at 5:1 on
 * the page (`legibleAccent()`); `wash` paints a faint, soft-ended band behind it. On a theme with
 * tajweed colours a tint is shown as a wash, so the rules' colours are never repainted.
 */
export const highlightSchema = z.object({
  mode: z
    .enum(['word', 'ayah', 'none'])
    .describe(
      'What follows the recitation: each word, the whole ayah, or nothing. Word falls back to ayah when the timings have no word times',
    ),
  style: z
    .enum(HIGHLIGHT_STYLES)
    .describe(
      'One mark: ink (text still to come rests lighter), tint (the ink turns the accent; a wash on tajweed themes) or wash (a faint band behind). Ignored when mode is none',
    ),
  /**
   * The accent of tint and wash. A tint is darkened or lightened until it reads at 5:1 on the page
   * (`legibleAccent()`), and its chroma is capped so a bright colour becomes antique gold; a wash
   * paints it at a fixed faint strength. Ignored by ink.
   */
  color: zColor(),
  restOpacity: z
    .number()
    .min(0.5)
    .max(0.85)
    .step(0.05)
    .describe('Ink only: opacity of the words not yet marked on the current line (at least 0.65 on tajweed themes)'),
  /** Which recitation of a repeated word moves the mark. */
  occurrence: z.enum(['first', 'last']).describe('For a repeated word: follow its first or its last recitation'),
});

/** A translation layer's `font` that picks the web font of the translation's own language. */
export const AUTO_FONT = 'auto';

/**
 * One translation of a stack (`text.translations`): its file and its type. `font` is `'auto'` (the
 * web font of the file's language, `fontFamilyForLanguage(meta.language)`, loaded from Google Fonts:
 * Noto Naskh Arabic for Arabic, Noto Nastaliq Urdu for Urdu, Noto Sans JP for Japanese, ...) or a
 * CSS font family used as it is. The direction always follows the language (`directionOfLanguage()`).
 */
export const translationLayerSchema = z.object({
  /** A `public/` path or an http(s) URL to an ayah-by-ayah translation; an empty one is skipped. */
  file: z.string().describe('Ayah translation file in public/ or a URL (empty: this layer is skipped)'),
  font: z
    .string()
    .describe(
      '“auto” for the web font of the translation’s language (Arabic, Urdu, Bengali, Chinese, ...), or a CSS font family',
    ),
  fontSize: z.number().int().min(12).max(120).describe('Size in px'),
  /** The layer's colour. */
  color: zColor(),
});

/** At most this many stacked translations (`TranslationStack`'s limit). */
export const MAX_TRANSLATIONS = 3;

export const translationsSchema = z
  .array(translationLayerSchema)
  .max(MAX_TRANSLATIONS)
  .describe(
    'Up to three stacked translations. Once one is added, translationFile and the translation font, size, colour and direction are ignored',
  );

export const textSchema = z.object({
  /**
   * A `public/` path to a translation file (QUL shape or the studio envelope), or empty. Kept for
   * the files written before `translations`: it is the one translation, set with the
   * `translation*` fields below, while `translations` is empty, and ignored once it is not.
   */
  translationFile: z
    .string()
    .describe('Single ayah translation file in public/ (empty: none; ignored once translations has a layer)'),
  translationPosition: z
    .enum(['below', 'above', 'none'])
    .describe('Where the ayah translation goes (none hides it; its files are still read)'),
  translationFont: z
    .string()
    .describe(
      'Single translation: “auto” (EB Garamond for Latin scripts, the language’s own font otherwise) or a CSS font family (ignored once translations has a layer)',
    ),
  translationSize: z
    .number()
    .int()
    .min(12)
    .max(120)
    .describe('Single translation: size in px (ignored once translations has a layer)'),
  /** The single translation's colour, ignored once `translations` has a layer. */
  translationColor: zColor(),
  translationDirection: z
    .enum(['ltr', 'rtl'])
    .describe('Single translation: writing direction (layers follow their language)'),
  /** px, added to the translation block's position under or over the lines. */
  translationOffsetY: z
    .number()
    .int()
    .min(-800)
    .max(800)
    .step(10)
    .describe('Move the translation up (negative) or down, in px'),
  /** A `public/` path to a word-by-word translation, or empty. Only `<MushafRecitation>` shows it. */
  glossFile: z
    .string()
    .describe('MushafRecitation only: word-by-word translation in public/ (empty: none; glossPosition none hides it)'),
  /** A `public/` path to a word-by-word transliteration, or empty. Only `<MushafRecitation>` shows it. */
  transliterationFile: z
    .string()
    .describe(
      'MushafRecitation only: word-by-word transliteration in public/ (empty: none; glossPosition none hides it)',
    ),
  glossFont: z
    .string()
    .describe('MushafRecitation only: “auto” (EB Garamond italic) or a CSS font family of the gloss'),
  glossSize: z.number().int().min(12).max(120).describe('MushafRecitation only: gloss size in px'),
  /** The gloss's colour (`<MushafRecitation>` only). */
  glossColor: zColor(),
  /** 1-3 translations, each with its file, font, size and colour; when set, `translationFile` and its type are not used. */
  translations: translationsSchema,
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
    .describe(
      'Where glossFile and transliterationFile go: a strip at the bottom, under each printed word, or none (hidden; still read)',
    ),
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
      'Memorisation: off, first letters of the words to come (a faint outline on printed lines), blank the words to come, blank all but the recited, or repeat only. Its hiding wins over highlight.restOpacity',
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
  /** Colour of the doubt mark. */
  doubtColor: zColor(),
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
    .describe(
      'Title: none, an intro card, a corner label, or both. The intro card shows the surah name: with header on, it is shown twice',
    ),
  /** The card fades out 0.3 s before the first word when the recitation starts earlier than this. */
  introSeconds: z.number().min(2).max(6).step(0.5).describe('Seconds the intro card stays'),
  /** Free text: the Mushaf panel does not fill it. */
  reciter: z.string().describe('Reciter’s name, under the title and in the corner (empty: none)'),
  /** Colour of the title texts. */
  color: zColor(),
  font: z
    .string()
    .describe('“auto”: EB Garamond small caps, Amiri for Arabic; or a CSS font family for the title texts'),
  corner: z.enum(OVERLAY_CORNERS).describe('Corner of the label'),
  /** px, at the composition's width. */
  cornerSize: z.number().int().min(12).max(60).describe('Size of the corner label in px'),
});

export const LEGEND_NAMES = ['en', 'ar', 'both'] as const;

/**
 * The tajweed colours' legend in a corner (`<TajweedLegend>`): drawn only when `show` is on and the
 * theme tells the rules apart (`themeHasTajweedColors()`); under `plain`, `normal`, `black` and
 * `p3`-`p5`, or a custom palette built on them or repainting every rule one colour, there is nothing
 * to explain.
 */
export const legendSchema = z.object({
  show: z
    .boolean()
    .describe(
      'Show the tajweed colours’ legend: only when the theme gives the rules different colours (not plain, normal, black, p3-p5, nor a customTheme on those or overriding rules)',
    ),
  position: z.enum(OVERLAY_CORNERS).describe('Corner of the legend'),
  orientation: z.enum(['row', 'column']).describe('Swatches side by side (row) or one under the other (column)'),
  names: z.enum(LEGEND_NAMES).describe('Names of the rules: English, Arabic or both'),
});

export const END_CARD_KINDS = ['none', 'credits', 'tafsir', 'chapter-info'] as const;

/**
 * A closing card after the last ayah (`<EndCard>`), `seconds` long, added to the duration: the
 * surah, the range, the reciter and the credits the sources ask for (`attributionLines()`), with the
 * commentary of the last ayah recited (`'tafsir'`, from `tafsirFile`) or the surah's introduction
 * (`'chapter-info'`, from `chapterInfoFile`). Both files are written by the panel or by
 * `serialiseTafsir()` / `serialiseChapterInfo()`; they are read in `calculateMetadata()` only.
 */
export const endCardSchema = z.object({
  show: z
    .enum(END_CARD_KINDS)
    .describe(
      'A closing card: none, the credits, the tafsir of the last ayah (needs tafsirFile), or the surah’s introduction (needs chapterInfoFile)',
    ),
  seconds: z.number().min(2).max(15).step(0.5).describe('Seconds the end card stays (added to the video)'),
  /** A `public/` path or a URL to a tafsir file (`serialiseTafsir()`). */
  tafsirFile: z.string().describe('Tafsir file in public/: read only when show is tafsir (the Text tab fetches it)'),
  /** A `public/` path or a URL to a chapter-info file (`serialiseChapterInfo()`). */
  chapterInfoFile: z
    .string()
    .describe('Surah introduction file in public/: read only when show is chapter-info (the Text tab fetches it)'),
});

/** The surah's printed header before its first ayah: nothing, its name, or its name and basmalah (when it has one). */
export const headerSchema = z
  .enum(['none', 'name', 'name-basmalah'])
  .describe(
    'When the passage starts at ayah 1: the surah’s printed name (and basmalah) as lines before it. overlay.title’s intro card names it too: use one',
  );

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
export type LineMotion = (typeof LINE_MOTIONS)[number];
export type LayoutFrame = (typeof LAYOUT_FRAMES)[number];
export type HighlightStyle = (typeof HIGHLIGHT_STYLES)[number];
export type Highlight = z.infer<typeof highlightSchema>;
export type Text = z.infer<typeof textSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type GlossPosition = (typeof GLOSS_POSITIONS)[number];
export type RecitationText = z.infer<typeof recitationTextSchema>;
export type MemorizeMode = (typeof MEMORIZE_MODES)[number];
export type Memorize = z.infer<typeof memorizeSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type HeaderMode = z.infer<typeof headerSchema>;
export type TranslationLayerSettings = z.infer<typeof translationLayerSchema>;
export type Legend = z.infer<typeof legendSchema>;
export type LegendNames = (typeof LEGEND_NAMES)[number];
export type EndCardKind = (typeof END_CARD_KINDS)[number];
export type EndCardSettings = z.infer<typeof endCardSchema>;

/**
 * The Mushaf look's palette: the ink follows `layout.color`, and every rosette is a gold line
 * drawing (`frame`, `detail`) on vellum (`accent`) around a disc of the ground (`background`):
 * never a solid coin, never the pink and mint fills of `normal`.
 */
export const defaultCustomTheme: CustomTheme = {
  base: 'normal',
  ink: '#1c1a16',
  silent: '#8a8478',
  rules: '#1b6f3f',
  frame: '#8c6c26',
  accent: '#efe3c4',
  detail: '#8c6c26',
  background: '#f8f3e6',
  override: {ink: false, silent: false, rules: false, frame: true, accent: true, detail: true, background: true},
};

/** Ivory page, warm black ink, three lines with their neighbours at 0.3, the side margins of 16:9, no border. */
export const defaultLayout: Layout = {
  aspect: '16:9',
  visibleLines: 3,
  neighbourOpacity: 0.3,
  marginX: 190,
  background: '#f8f3e6',
  color: '#1c1a16',
  backgroundImage: '',
  verticalAlign: 0.5,
  offsetY: 0,
  frame: 'none',
};

/** Calm dissolves, a new line settled 0.4 s before its first word when the pause allows it. */
export const defaultAnimation: Animation = {lines: 'fade', tempo: 'calm', leadInSeconds: 0.4};

/** Each word followed in ink: the words still to come on the current line rest at 0.6 and fill in as they are heard. */
export const defaultHighlight: Highlight = {
  mode: 'word',
  style: 'ink',
  color: '#b8913a',
  restOpacity: 0.6,
  occurrence: 'first',
};

export const defaultText: Text = {
  translationFile: '',
  translationPosition: 'below',
  translationFont: AUTO_FONT,
  translationSize: 40,
  translationColor: '#4a4a4a',
  translationDirection: 'ltr',
  translationOffsetY: 0,
  glossFile: '',
  transliterationFile: '',
  glossFont: AUTO_FONT,
  glossSize: 34,
  glossColor: '#6a6a6a',
  translations: [],
};

/** `defaultText` with the gloss in its strip at the bottom. */
export const defaultRecitationText: RecitationText = {...defaultText, glossPosition: 'strip'};

/** Off; when a mode is picked: three plays of each ayah, half a second apart, the text revealed from the second. */
export const defaultMemorize: Memorize = {mode: 'off', repeat: 3, pauseSeconds: 0.5, revealAfterRepeats: 1};

/** No title; when one is turned on: a three-second card, dark ink in the label font, the label top right. */
export const defaultOverlay: Overlay = {
  title: 'none',
  introSeconds: 3,
  reciter: '',
  color: '#1b1b1b',
  font: AUTO_FONT,
  corner: 'top-right',
  cornerSize: 28,
};

/** Off; when turned on: bottom left, one rule under the other, named in English and Arabic. */
export const defaultLegend: Legend = {show: false, position: 'bottom-left', orientation: 'column', names: 'both'};

/** No end card; when one is picked: five seconds. */
export const defaultEndCard: EndCardSettings = {show: 'none', seconds: 5, tafsirFile: '', chapterInfoFile: ''};

/** A new layer of `text.translations`: the language's own web font, at the translation's default size and colour. */
export const defaultTranslationLayer: TranslationLayerSettings = {
  file: '',
  font: AUTO_FONT,
  fontSize: 40,
  color: '#4a4a4a',
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

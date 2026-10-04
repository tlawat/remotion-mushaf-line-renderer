import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {
  customThemeSchema,
  dataSchema,
  defaultCustomTheme,
  defaultHighlight,
  defaultLayout,
  defaultReview,
  fontsSchema,
  highlightSchema,
  layoutSchema,
  reviewSchema,
  themeNameSchema,
} from '../schema';

/** How the page shows the line being recited: nothing, a soft band behind it, or a rule under it. */
export const LINE_HIGHLIGHTS = ['none', 'band', 'underline'] as const;
/** The page's border: none, a thin double rule, or a double rule with corner ornaments. */
export const PAGE_FRAMES = ['none', 'simple', 'ornate'] as const;
/** How one page gives way to the next: at once, a cross-fade, or a slide the way a mushaf's leaf turns. */
export const PAGE_TURNS = ['cut', 'fade', 'slide'] as const;

/** What the page itself looks like and how it turns; the lines' highlight is `highlight`'s. */
export const pageViewSchema = z.object({
  lineHighlight: z
    .enum(LINE_HIGHLIGHTS)
    .describe('How the line being recited is marked: a band behind it, a rule under it'),
  lineHighlightColor: zColor().describe('Colour of the band or the rule'),
  /** Opacity of the lines that are not being recited: 1 for no dimming. */
  dimOtherLines: z.number().min(0).max(1).step(0.05).describe('Opacity of the other lines (1: none)'),
  frame: z.enum(PAGE_FRAMES).describe('Page border: a thin double rule, or one with corner ornaments'),
  /** In Arabic-Indic digits, under the page. */
  pageNumber: z.boolean().describe('Show the page number under the page'),
  /** `slide` moves the leaf the way a right-to-left book turns: the next page comes in from the left. */
  turn: z.enum(PAGE_TURNS).describe('How the page changes: at once, a fade, or a slide like a turning leaf'),
  /** The next page is in place this long before its first word is heard. */
  turnSeconds: z.number().min(0.2).max(2).step(0.1).describe('Seconds a page turn takes'),
});

export type PageView = z.infer<typeof pageViewSchema>;

/**
 * The props of `<MushafPage>`: the whole printed page a recitation is on, followed line by line.
 * Content as `<MushafRecitation>`'s (audio, timings, range, theme, fonts, data); style in the Props
 * sidebar. `resolved` is filled by `calculateMetadata()` and is not meant to be edited.
 */
export const mushafPageSchema = z.object({
  /** A `public/` path (`mushaf-studio/fatiha/audio.mp3`) or an https URL. */
  audioFile: z.string().describe('Audio: a path in public/ or a URL'),
  /** A `public/` path to a `RecitationTimings` JSON (with or without the studio's `alignment` sidecar). */
  timingsFile: z.string().describe('Timings JSON in public/'),
  /** 0 keeps the file's range. */
  fromAyah: z.number().int().min(0).max(286).describe('First ayah to follow (0: as the timings say)'),
  toAyah: z.number().int().min(0).max(286).describe('Last ayah to follow (0: as the timings say)'),
  theme: themeNameSchema,
  customTheme: customThemeSchema.describe('The palette used when theme is custom'),
  fonts: fontsSchema,
  data: dataSchema,
  /** The page is centred and scaled to fit; `visibleLines`, `neighbourOpacity`, `verticalAlign` and `offsetY` do not apply. */
  layout: layoutSchema.describe(
    'Frame, colours and side margins (the page is centred: lines on screen, their opacity and position do not apply)',
  ),
  highlight: highlightSchema.describe('What follows the recitation inside the line and how it is marked'),
  review: reviewSchema.describe('Studio only: the doubtful words of the alignment'),
  pageView: pageViewSchema.describe('The page: the current line’s mark, the border, the page number and the turn'),
  /** Filled by calculateMetadata; see `ResolvedPage`. */
  resolved: z.any().nullable().describe('Filled by calculateMetadata'),
});

export type MushafPageProps = z.infer<typeof mushafPageSchema>;

/** A soft gold band behind the current line, a thin double rule, the page number, and a leaf-like slide. */
export const defaultPageView: PageView = {
  lineHighlight: 'band',
  lineHighlightColor: 'rgba(200,164,92,0.18)',
  dimOtherLines: 1,
  frame: 'simple',
  pageNumber: true,
  turn: 'slide',
  turnSeconds: 0.6,
};

/**
 * Defaults that work out of the box: the same Al-Fatihah sample as `<MushafRecitation>` (ayahs 2-7
 * by Abdul Hamid Ghraio from the aligner's catalogue, audio from the catalogue's clip URL, the
 * timings committed in the app's `public/`), the mushaf data from the app's mirror, the plain theme,
 * a 16:9 frame with page 1 centred in it.
 */
export const defaultMushafPageProps: MushafPageProps = {
  audioFile:
    'https://hetchyy-quranic-universal-aligner.hf.space/preload-audio/abdul_hamid_ghraio_2025_yt/1.mp3?start_ms=2909&end_ms=30695',
  timingsFile: 'mushaf-studio/fatiha/timings.json',
  fromAyah: 0,
  toAyah: 0,
  theme: 'plain',
  customTheme: defaultCustomTheme,
  fonts: 'fallback',
  data: 'mirror',
  layout: defaultLayout,
  highlight: defaultHighlight,
  review: defaultReview,
  pageView: defaultPageView,
  resolved: null,
};

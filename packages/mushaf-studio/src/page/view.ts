// The page's own look (the `pageView` group of `<MushafPage>`): its line band, border, number and
// turn. Apart from the rest of the page schema so the props migration can read its defaults without
// loading the compositions' schemas.
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';

/** How the page shows the line being recited: nothing, or a faint band behind it. */
export const LINE_HIGHLIGHTS = ['none', 'band'] as const;
/** The page's border: none, or a thin double rule in the rosettes' gold. */
export const PAGE_FRAMES = ['none', 'simple'] as const;
/** How one page gives way to the next, after its last word: at once, or a dissolve. */
export const PAGE_TURNS = ['cut', 'fade'] as const;

/** What the page itself looks like and how it turns; the words' mark is `highlight`'s unless the band is on. */
export const pageViewSchema = z.object({
  lineHighlight: z
    .enum(LINE_HIGHLIGHTS)
    .describe(
      'How the line being recited is marked: a faint band behind it (it wins over highlight.style on the page), or none',
    ),
  /** The band's colour; it is painted at a fixed faint strength (its own alpha is ignored). */
  lineHighlightColor: zColor(),
  /** Opacity of the lines that are not being recited: 1 for no dimming, never under 0.5. */
  dimOtherLines: z.number().min(0.5).max(1).step(0.05).describe('Opacity of the other lines (1: none; at least 0.5)'),
  frame: z.enum(PAGE_FRAMES).describe('Page border: a thin double rule in the rosettes’ gold, or none'),
  /** In Arabic-Indic digits, under the page. */
  pageNumber: z.boolean().describe('Show the page number under the page'),
  turn: z.enum(PAGE_TURNS).describe('How the page changes, after its last word: a dissolve or a cut'),
  turnSeconds: z.number().min(0.6).max(1.5).step(0.1).describe('Seconds a page dissolve takes'),
});

export type PageView = z.infer<typeof pageViewSchema>;

/** A faint gold band behind the current line, a thin double rule, the page number, and a dissolve to the next page. */
export const defaultPageView: PageView = {
  lineHighlight: 'band',
  lineHighlightColor: '#b8913a',
  dimOtherLines: 1,
  frame: 'simple',
  pageNumber: true,
  turn: 'fade',
  turnSeconds: 0.9,
};

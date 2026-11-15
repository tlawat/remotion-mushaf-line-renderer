// What the Look tab says of a composition's look: the colours of its four chips (page, ink, metal,
// mark) and its mark in one line, with the notes the render's guards call for (a tint drawn darker
// or lighter than chosen, a tint shown as a wash on the tajweed colours). Pure, from the props: the
// same functions the render uses (`groundFor()`, `legibleAccent()`, `metalOf()`), so the panel shows
// what the video paints and never rewrites the saved colour.
import {groundFor} from '../background/compat';
import type {Background} from '../background/schema';
import {themeHasTajweedColors} from '../content/tajweed';
import {type CustomTheme, type Highlight, type Layout, type ThemeName, themeSelectionFrom} from '../schema';
import {capChroma, legibleAccent, mixColors, parseColor, toHex} from '../schema/color';
import {metalOf} from '../schema/tokens';

/** The groups a summary reads; `theme` and `customTheme` are absent on an ayah text. */
export type LookSummaryProps = {
  readonly layout: Layout;
  readonly background: Background;
  readonly highlight?: Highlight | undefined;
  readonly theme?: ThemeName | undefined;
  readonly customTheme?: CustomTheme | undefined;
};

/** The four colours of a look card: what the video would paint with these props. */
export type LookChips = {
  readonly page: string;
  readonly ink: string;
  readonly metal: string;
  readonly mark: string;
};

/** A note under the mark summary. */
export type MarkNote = {readonly kind: 'adjusted'; readonly color: string} | {readonly kind: 'washOnTajweed'} | null;

/** The mark in one line: what it follows, the device, and the note the render's guards call for. */
export type MarkSummary = {
  readonly follows: Highlight['mode'];
  readonly style: Highlight['style'];
  readonly note: MarkNote;
};

/** Whether the props' theme draws the tajweed colours (an ayah text has none). */
const onTajweed = (props: LookSummaryProps): boolean =>
  props.theme !== undefined &&
  props.customTheme !== undefined &&
  themeHasTajweedColors(themeSelectionFrom(props.theme, props.customTheme));

/** `#rrggbb` of a colour, or the colour as it is when it cannot be read. */
const hexOf = (color: string): string => {
  const rgb = parseColor(color);
  return rgb === null ? color : toHex(rgb);
};

/**
 * The colours of a look card for these props: the page (`layout.background`), the ink, the metal
 * (`metalOf()`) and the mark as drawn: a tint's `legibleAccent()` (on a tajweed theme, where it is a
 * wash, the capped colour), a wash's colour with its chroma capped, the ink at its rest opacity for
 * the ink mark, the ink itself for no mark.
 */
export const lookChips = (props: LookSummaryProps): LookChips => {
  const {layout, highlight} = props;
  const ground = groundFor(props.background, layout);
  const metal = metalOf({theme: props.theme, customTheme: props.customTheme, ground});
  let mark = layout.color;
  if (highlight !== undefined && highlight.mode !== 'none') {
    const tajweed = onTajweed(props);
    if (highlight.style === 'tint' && !tajweed) mark = legibleAccent(highlight.color, ground);
    else if (highlight.style === 'ink') {
      const rest = tajweed ? Math.max(0.65, highlight.restOpacity) : highlight.restOpacity;
      mark = mixColors(layout.color, ground, 1 - rest);
    } else mark = capChroma(highlight.color);
  }
  return {page: layout.background, ink: layout.color, metal, mark};
};

/**
 * The mark of these props in one line (`"Follows each word · Ink"`), with a note: `adjusted` when a
 * tint is drawn in another shade than the one saved, so it reads at 5:1 on the page; `washOnTajweed`
 * when a tint is shown as a wash because the theme draws the tajweed colours. `null` without a
 * `highlight` group (a passage has none).
 */
export const markSummary = (props: LookSummaryProps): MarkSummary | null => {
  const {highlight} = props;
  if (highlight === undefined) return null;
  let note: MarkNote = null;
  if (highlight.mode !== 'none' && highlight.style === 'tint') {
    if (onTajweed(props)) note = {kind: 'washOnTajweed'};
    else {
      const drawn = legibleAccent(highlight.color, groundFor(props.background, props.layout));
      if (drawn.toLowerCase() !== hexOf(highlight.color).toLowerCase()) note = {kind: 'adjusted', color: drawn};
    }
  }
  return {follows: highlight.mode, style: highlight.style, note};
};

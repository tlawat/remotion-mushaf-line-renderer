import {
  type AyahTiming,
  type MushafThemeSelection,
  type MushafWord,
  normalizeTimings,
  type RecitationTimings,
  type WordBand,
  type WordContext,
} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {interpolateColors} from 'remotion';
import {themeHasTajweedColors} from '../content/tajweed';
import {clipAt, type MemorizeClip} from '../memorize/timeline';
import {memorizeOpacity} from '../memorize/visibility';
import type {DoubtReason} from '../types';
import {groundOf, legibleAccent, washAlpha, washColor} from './color';
import type {Highlight, Memorize, Review} from './index';
import {
  type AyahSpan,
  ayahEmphasis,
  ayahSpanIndex,
  ayahSpans,
  hasWordTimes,
  inkFill,
  type WordSpan,
  wordEmphasis,
  wordSpanIndex,
  wordSpans,
  wordStartIndex,
} from './marks';
import {migrateMushafProps} from './migrate';
import {INOUT, SINE, type Tempo, tempoSeconds} from './tokens';
import {washStyle} from './wash';

/** Four decimals: enough for any alpha, free of float noise. */
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * `color` at `alpha` (0-1) of its own opacity, as `rgba()`. Remotion's `interpolateColors()`
 * normalises every colour `zColor()` accepts (hex with or without alpha, `rgb()` / `rgba()`,
 * names) to `rgba(r, g, b, a)`, so a colour is painted the same way on every frame. Anything it
 * cannot read is left to CSS `color-mix()`. Internal to the schema module (not in its index).
 */
export const withAlpha = (color: string, alpha: number): string => {
  let normalised: string;
  try {
    normalised = interpolateColors(0, [0, 1], [color, color]);
  } catch {
    return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  }
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(normalised);
  if (!match) return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${round4(Number(match[4]) * alpha)})`;
};

/**
 * How a tint is painted on a theme: `'css'` under `plain`, the monochrome font, whose ink is CSS
 * `color`; `'wash'` on a theme with tajweed colours (a tint would repaint the rules' colours, so it
 * is shown as a wash); `'palette'` under every other colour-font theme, through the line's
 * `inkTint` palettes. `normal` and a custom palette on it follow the text colour, but only as the
 * row's palette rule resolves it once: a word's own CSS `color` does not reach their glyphs.
 */
export type TintPath = 'css' | 'wash' | 'palette';

/** The `TintPath` of a theme selection (`themeSelectionFrom()`). */
export const tintPath = (theme: MushafThemeSelection): TintPath => {
  if (theme === 'plain') return 'css';
  if (themeHasTajweedColors(theme)) return 'wash';
  return 'palette';
};

/** `restOpacity` as drawn: raised to 0.65 on a theme with tajweed colours, so the rules' pastels stay legible. */
export const effectiveRestOpacity = (highlight: Pick<Highlight, 'restOpacity'>, theme: MushafThemeSelection): number =>
  themeHasTajweedColors(theme) ? Math.max(0.65, highlight.restOpacity) : highlight.restOpacity;

/**
 * The window's neighbour opacity as drawn: under the ink mark, 0.2 below the current line's resting
 * words (`min(neighbourOpacity, restOpacity − 0.2)`), so a neighbour line never reads stronger than
 * the words still to come; the setting itself otherwise.
 */
export const effectiveNeighbourOpacity = (
  neighbourOpacity: number,
  highlight: Pick<Highlight, 'mode' | 'style' | 'restOpacity'>,
  theme: MushafThemeSelection,
): number =>
  highlight.mode !== 'none' && highlight.style === 'ink'
    ? round4(Math.min(neighbourOpacity, effectiveRestOpacity(highlight, theme) - 0.2))
    : neighbourOpacity;

/**
 * The style of the current word at full emphasis, for code written before the render design:
 * `undefined` for ink (it dims what is still to come instead), the tint read on `ground` for tint,
 * a lone wash for wash. Its argument is migrated first, so the old `{style: 'marker'}` gives a wash.
 *
 * @deprecated Use `wordStyleFrom()`, which eases the mark in and out and follows the theme.
 */
export const activeWordStyleFrom = (
  highlight: Readonly<Record<string, unknown>>,
  ground = '#f8f3e6',
): React.CSSProperties | undefined => {
  const migrated = migrateMushafProps<{highlight: Highlight}>({highlight}).highlight;
  if (migrated.mode === 'none') return undefined;
  switch (migrated.style) {
    case 'ink':
      return undefined;
    case 'tint':
      return {color: legibleAccent(migrated.color, ground)};
    case 'wash':
      return washStyle({color: washColor(migrated.color, washAlpha(ground)), cap: 'both'});
  }
};

/** First-occurrence start of every timed word, by `MushafWord.id`; see `wordStarts()`. */
export type WordStartIndex = Readonly<Record<string, number>>;

export type WordStyleOptions = {
  readonly highlight: Highlight;
  readonly review: Pick<Review, 'showDoubtful' | 'doubtColor'>;
  /** What `doubtfulWords()` found; only the keys matter here. */
  readonly doubtful: Readonly<Record<string, readonly DoubtReason[]>>;
  /**
   * `wordStarts(timings)`: when each word is first heard, for the ink of a word the timings do not
   * reach (`timings` absent). With `timings`, the starts of `highlight.occurrence` are used.
   */
  readonly timingsIndex: WordStartIndex;
  /**
   * The timings themselves: the word and ayah spans of the marks, and the start of a word they do
   * not time (a file without per-word times, a word the aligner missed, the ayah-end marker): its
   * ayah's start, the marker its ayah's end. Without them a word `timingsIndex` does not know is
   * never dimmed, and nothing is tinted or washed. Either version: an ayah is found by its own surah.
   */
  readonly timings?: RecitationTimings | undefined;
  /**
   * `useInStudio()`: the doubt marks are for the Studio's preview only, never a render (the Render
   * button's, or the Studio's own in-browser one).
   */
  readonly isStudio: boolean;
  /**
   * `from` of the `<Sequence>` the line sits in: `WordContext.frame` is local to it, and adding
   * `from` back gives the composition frame, which is the audio time. Default 0.
   */
  readonly sequenceFrom?: number | undefined;
  /**
   * The second of the recording heard at a second of the composition (`audioClock(clips)`), for
   * the marks and the memorisation rules when ayahs repeat. Default: the same second.
   */
  readonly audioTime?: ((seconds: number) => number) | undefined;
  /**
   * The memorisation mode and its clip timeline: a word the mode hides gets `opacity` 0 (the ghost for
   * `'first-letters'`, see `memorizeOpacity()`), over the marks. Default: off.
   */
  readonly memorize?:
    | {
        readonly settings: Pick<Memorize, 'mode' | 'revealAfterRepeats'>;
        readonly clips: readonly MemorizeClip[];
      }
    | undefined;
  /**
   * The theme the lines are painted in (`themeSelectionFrom()`): it decides how a tint is painted
   * (`tintPath()`) and raises `restOpacity` on tajweed themes. Default `'plain'`.
   */
  readonly theme?: MushafThemeSelection | undefined;
  /** The ink (`layout.color`): where a CSS tint starts from. Default `#1c1a16`. */
  readonly ink?: string | undefined;
  /** What the text sits on (`groundOf()`): the tint is read at 5:1 on it, the wash's strength depends on it. Default ivory. */
  readonly ground?: string | undefined;
  /** `animation.tempo`: the length of an ayah's mark. Default `'calm'`. */
  readonly tempo?: Tempo | undefined;
  /**
   * The ayah-end markers of the lines (`markerIds(lines)`): a rosette the timings time as a word
   * gets no span, so the last word of the ayah holds its mark to the release. Default: none.
   */
  readonly markers?: ReadonlySet<string> | undefined;
};

/** The thickness of the dotted doubt underline, in em of the line's type size. */
const DOUBT_THICKNESS = '0.08em';

const ayahKey = (word: Pick<MushafWord, 'surah' | 'ayah'>): string => `${word.surah}:${word.ayah}`;

/** What the marks read of a timings file, worked out once per file and occurrence (a juz has thousands of words). */
type TimingIndex = {
  readonly spans: ReadonlyMap<string, WordSpan>;
  readonly ayat: ReadonlyMap<string, AyahSpan>;
  readonly ayahTimings: ReadonlyMap<string, AyahTiming>;
  readonly starts: Readonly<Record<string, number>>;
  readonly hasWords: boolean;
};

const indexCache = new WeakMap<RecitationTimings, Map<string, WeakMap<ReadonlySet<string>, TimingIndex>>>();
/** The `markers` of a caller that names none. */
const NO_MARKERS: ReadonlySet<string> = new Set();

const timingIndex = (
  timings: RecitationTimings,
  occurrence: Highlight['occurrence'],
  markers: ReadonlySet<string> = NO_MARKERS,
): TimingIndex => {
  let byOccurrence = indexCache.get(timings);
  if (byOccurrence === undefined) {
    byOccurrence = new Map();
    indexCache.set(timings, byOccurrence);
  }
  let byMarkers = byOccurrence.get(occurrence);
  if (byMarkers === undefined) {
    byMarkers = new WeakMap();
    byOccurrence.set(occurrence, byMarkers);
  }
  const cached = byMarkers.get(markers);
  if (cached !== undefined) return cached;
  const ayahTimings = new Map<string, AyahTiming>();
  for (const ayah of normalizeTimings(timings).ayat) ayahTimings.set(`${ayah.surah}:${ayah.ayah}`, ayah);
  const index: TimingIndex = {
    spans: wordSpanIndex(wordSpans(timings, {occurrence, markers})),
    ayat: ayahSpanIndex(ayahSpans(timings)),
    ayahTimings,
    starts: wordStartIndex(timings, occurrence),
    hasWords: hasWordTimes(timings),
  };
  byMarkers.set(markers, index);
  return index;
};

/**
 * The `wordStyle` of a line for the schema's highlight and review settings: a pure function of its
 * arguments and of the options captured here, so a frame always paints the same.
 *
 * - `ink`: on the current line, a word not yet heard rests at `restOpacity` and fills to full ink
 *   over `inkFill` as it is recited (`mode: 'ayah'`: every ayah but the one being recited rests).
 *   The current line is the one in the window's centre slot (`WordContext.linePosition`): a line
 *   away from it shows every word at full ink and only the window's neighbour opacity, so the two
 *   dimmings never multiply and nothing jumps during a scroll.
 * - `tint`: the word's (or ayah's) ink eases into `legibleAccent(color, ground)` and back out with
 *   its emphasis (`wordEmphasis()` / `ayahEmphasis()`), by the theme's `tintPath()`: CSS `color`,
 *   the line's `inkTint` palettes (`WordContext.inkPalette`), or a wash on a tajweed theme. The
 *   ayah-end rosette keeps its own palette.
 * - `wash`: nothing here. The band is the line's own (`wordBandFrom()`, its `wordBand` prop), drawn
 *   from where the ink is, so the word's style only carries memorisation and the doubt marks.
 * - A line leaving the centre slot upward takes no tint with it (it fades with the line's
 *   position); an incoming line's first word is marked at full strength while it scrolls in.
 * - Without per-word times `mode: 'word'` follows the ayahs. Memorisation's hiding wins over the marks.
 * - Under repeats, nothing changes in one frame as a play starts and the recording goes back to
 *   the ayah's start: the ink goes from the previous play's over `rehide` on `SINE`, and the mark
 *   the previous play ended on lets go over `markOut`.
 * - In the Studio, with `review.showDoubtful`, a doubtful word gets a dotted underline in
 *   `doubtColor`. `text-decoration` is not pinned on a word (only on the row, where it is not
 *   inherited), so the underline paints without touching the line's metrics.
 */
export const wordStyleFrom = (
  options: WordStyleOptions,
): ((word: MushafWord, context: WordContext) => React.CSSProperties | undefined) => marksFrom(options).wordStyle;

/**
 * The `wordBand` of a line for the schema's highlight: the wash (`style: 'wash'`, or a tint shown as
 * a wash on a tajweed theme) behind the word, or behind the ayah's run of words on its line (the
 * rosette included), at `washAlpha(ground)` times the emphasis, in `washColor()`. The line draws it
 * from where the ink is, one shape per run, so the band covers the whole word (an overhanging
 * hamza-wasl alif included) and shows no seam between words. A line leaving the centre slot upward
 * lets it go as it leaves; memorisation's hiding wins over it. Takes the options of `wordStyleFrom()`,
 * and goes with it on the same line.
 */
export const wordBandFrom = (
  options: WordStyleOptions,
): ((word: MushafWord, context: WordContext) => WordBand | undefined) => marksFrom(options).wordBand;

/** The two per-word functions of a line's marks, from one reading of the options. */
const marksFrom = (
  options: WordStyleOptions,
): {
  readonly wordStyle: (word: MushafWord, context: WordContext) => React.CSSProperties | undefined;
  readonly wordBand: (word: MushafWord, context: WordContext) => WordBand | undefined;
} => {
  const {highlight, review, doubtful, timingsIndex, timings, isStudio, sequenceFrom = 0} = options;
  const audioTime = options.audioTime ?? ((seconds: number) => seconds);
  const memorize = options.memorize?.settings.mode === 'off' ? undefined : options.memorize;
  const theme = options.theme ?? 'plain';
  const ink = options.ink ?? '#1c1a16';
  const ground = options.ground ?? groundOf({background: '#f8f3e6', color: ink});
  const tempo = options.tempo ?? 'calm';
  const index = timings ? timingIndex(timings, highlight.occurrence, options.markers) : null;
  const mode = highlight.mode === 'word' && index !== null && !index.hasWords ? 'ayah' : highlight.mode;
  const rest = effectiveRestOpacity(highlight, theme);
  const path = tintPath(theme);
  const style = highlight.style === 'tint' && path === 'wash' ? 'wash' : highlight.style;
  const accent = style === 'tint' ? legibleAccent(highlight.color, ground) : highlight.color;
  const washStrength = washAlpha(ground);
  /** When a word is first heard: its own time, else its ayah's start (the marker: its ayah's end), else unknown. */
  const startOf = (word: MushafWord): number | undefined => {
    const own = index ? index.starts[word.id] : timingsIndex[word.id];
    if (own !== undefined) return own;
    const ayah = index?.ayahTimings.get(ayahKey(word));
    if (ayah === undefined) return undefined;
    return word.kind === 'end' ? ayah.end : ayah.start;
  };
  /** The emphasis of a word's tint or wash: its span's in word mode, its ayah's in ayah mode. */
  const emphasisOf = (word: MushafWord, now: number): number => {
    if (mode === 'ayah') {
      const ayah = index?.ayat.get(ayahKey(word));
      return ayah === undefined ? 0 : ayahEmphasis(ayah, now, tempo);
    }
    if (word.kind === 'end') return 0;
    const span = index?.spans.get(word.id);
    return span === undefined ? 0 : wordEmphasis(span, now);
  };
  /** The ink of a word on the current line, before the line's position is taken into account. */
  const inkOf = (word: MushafWord, now: number): number => {
    if (mode === 'ayah') {
      const ayah = index?.ayat.get(ayahKey(word));
      return ayah === undefined ? rest : rest + (1 - rest) * ayahEmphasis(ayah, now, tempo);
    }
    const start = startOf(word);
    return start === undefined ? 1 : rest + (1 - rest) * inkFill(start, now);
  };
  /**
   * Under repeats the recording's clock jumps back to the ayah's start as each play starts, so
   * what it reads would change in one frame (the line's heard words back to resting ink, the last
   * word's mark gone). From a play's start, the value at the end of the previous play goes over to
   * this play's: `null` outside that change, else the previous play's value and how far it has gone (0-1).
   */
  const playChange = (seconds: number, read: (now: number) => number, frames: 'rehide' | 'markOut') => {
    if (!memorize) return null;
    const clip = clipAt(memorize.clips, seconds);
    const index = clip === null ? -1 : memorize.clips.indexOf(clip);
    const previous = index > 0 ? memorize.clips[index - 1] : undefined;
    if (clip === null || previous === undefined) return null;
    const since = seconds - clip.compositionFrom;
    const length = tempoSeconds(frames, tempo);
    if (since >= length) return null;
    return {was: read(previous.audioTo), progress: clamp01(since / length)};
  };
  /** The ink of a word on the current line: from the previous play's over `rehide` on `SINE` as a play starts. */
  const inkAt = (word: MushafWord, seconds: number, now: number): number => {
    const value = inkOf(word, now);
    const change = playChange(seconds, (t) => inkOf(word, t), 'rehide');
    return change === null ? value : value + (change.was - value) * (1 - SINE(change.progress));
  };
  /** The emphasis of a tint or wash: a mark the previous play ended on lets go over `markOut` as the next play starts. */
  const emphasisAt = (word: MushafWord, seconds: number, now: number): number => {
    const value = emphasisOf(word, now);
    const change = playChange(seconds, (t) => emphasisOf(word, t), 'markOut');
    return change === null ? value : Math.max(value, change.was * (1 - INOUT(change.progress)));
  };
  const marks = isStudio && review.showDoubtful;
  const doubtStyle: React.CSSProperties = {
    textDecoration: `underline dotted ${review.doubtColor}`,
    textDecorationThickness: DOUBT_THICKNESS,
  };
  /** What memorisation lets a word show (1 without it): a word it hides (or ghosts) shows no more, its ink and marks included. */
  const shownOf = (word: MushafWord, context: WordContext, seconds: number, now: number): number =>
    memorize
      ? memorizeOpacity({
          mode: memorize.settings.mode,
          revealAfterRepeats: memorize.settings.revealAfterRepeats,
          start: startOf(word),
          now,
          seconds,
          active: context.active,
          clips: memorize.clips,
          script: 'glyph',
          ground,
        })
      : 1;
  /** The tint or wash of a word: its emphasis, let go as a line leaves the centre slot upward. */
  const markAmount = (word: MushafWord, context: WordContext, seconds: number, now: number): number => {
    const position = context.linePosition ?? 0;
    const neighbour = position < 0 ? clamp01(1 + position) : 1;
    return round4(emphasisAt(word, seconds, now) * neighbour);
  };
  const clockOf = (context: WordContext): {seconds: number; now: number} => {
    const seconds = (context.frame + sequenceFrom) / context.fps;
    return {seconds, now: audioTime(seconds)};
  };
  const wordStyle = (word: MushafWord, context: WordContext): React.CSSProperties | undefined => {
    let css: React.CSSProperties | undefined;
    const {seconds, now} = clockOf(context);
    const position = context.linePosition ?? 0;
    if (mode !== 'none') {
      if (style === 'ink') {
        const opacity = round4(1 - (1 - inkAt(word, seconds, now)) * (1 - clamp01(Math.abs(position))));
        if (opacity < 1) css = {opacity};
      } else if (style === 'tint' && word.kind !== 'end') {
        const amount = markAmount(word, context, seconds, now);
        if (amount > 0) {
          const palette = path === 'palette' ? context.inkPalette : undefined;
          css =
            palette === undefined
              ? {color: interpolateColors(amount, [0, 1], [ink, accent])}
              : {fontPalette: palette(amount)};
        }
      }
    }
    const shown = shownOf(word, context, seconds, now);
    if (shown < 1) css = {...css, opacity: Math.min(Number(css?.opacity ?? 1), shown)};
    if (marks && (doubtful[word.id]?.length ?? 0) > 0) css = {...css, ...doubtStyle};
    return css;
  };
  const wordBand = (word: MushafWord, context: WordContext): WordBand | undefined => {
    if (mode === 'none' || style !== 'wash') return undefined;
    const {seconds, now} = clockOf(context);
    const amount = round4(markAmount(word, context, seconds, now) * shownOf(word, context, seconds, now));
    return amount > 0 ? {color: washColor(highlight.color, washStrength * amount)} : undefined;
  };
  return {wordStyle, wordBand};
};

/**
 * The `inkTint` a line needs for the highlight on its theme: the tint colour when a tint is painted
 * through the line's palettes (`tintPath()` is `'palette'`), else `undefined`.
 */
export const inkTintFor = (
  highlight: Pick<Highlight, 'mode' | 'style' | 'color'>,
  theme: MushafThemeSelection,
  ground: string,
): string | undefined =>
  highlight.mode !== 'none' && highlight.style === 'tint' && tintPath(theme) === 'palette'
    ? legibleAccent(highlight.color, ground)
    : undefined;

/**
 * Whether the highlight paints a wash on this theme (`style: 'wash'`, or a tint shown as one on a
 * tajweed theme): the lines then need `wordBand={wordBandFrom(...)}`, and measure where their ink is.
 */
export const drawsWordBand = (highlight: Pick<Highlight, 'mode' | 'style'>, theme: MushafThemeSelection): boolean =>
  highlight.mode !== 'none' &&
  (highlight.style === 'wash' || (highlight.style === 'tint' && tintPath(theme) === 'wash'));

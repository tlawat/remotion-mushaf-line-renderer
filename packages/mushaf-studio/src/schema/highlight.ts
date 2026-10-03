import type {AyahTiming, MushafWord, RecitationTimings, WordContext} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {interpolateColors} from 'remotion';
import type {DoubtReason} from '../types';
import type {Highlight, Review} from './index';

/** Four decimals: enough for any alpha, free of float noise. */
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/**
 * `color` at `alpha` (0-1) of its own opacity, as `rgba()`. Remotion's `interpolateColors()`
 * normalises every colour `zColor()` accepts (hex with or without alpha, `rgb()` / `rgba()`,
 * names) to `rgba(r, g, b, a)`, so the marker behind a word is a plain colour the renderer paints
 * the same way on every frame. Anything it cannot read is left to CSS `color-mix()`. Internal to
 * the schema module (not in its index): the compositions see colours through `activeWordStyleFrom()`.
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

/** The marker's opacity behind the current word. */
const MARKER_ALPHA = 0.35;

/**
 * The `activeWordStyle` of a line for the schema's highlight: the ink colour, a glow around it, or
 * a marker behind it. Paint-only properties, as `wordStyle` documents: nothing here changes a
 * glyph's metrics. `'none'` marks nothing (the word still gets `data-active` for your own CSS).
 */
export const activeWordStyleFrom = (highlight: Pick<Highlight, 'style' | 'color'>): React.CSSProperties | undefined => {
  switch (highlight.style) {
    case 'color':
      return {color: highlight.color};
    case 'glow':
      return {color: highlight.color, textShadow: `0 0 0.25em ${highlight.color}`};
    case 'marker':
      return {background: withAlpha(highlight.color, MARKER_ALPHA)};
    case 'none':
      return undefined;
  }
};

/** First-occurrence start of every timed word, by `MushafWord.id`; see `wordStarts()`. */
export type WordStartIndex = Readonly<Record<string, number>>;

export type WordStyleOptions = {
  readonly highlight: Highlight;
  readonly review: Pick<Review, 'showDoubtful' | 'doubtColor'>;
  /** What `doubtfulWords()` found; only the keys matter here. */
  readonly doubtful: Readonly<Record<string, readonly DoubtReason[]>>;
  /** `wordStarts(timings)`, for `dimUpcomingOnly`. */
  readonly timingsIndex: WordStartIndex;
  /**
   * The timings themselves, for `dimUpcomingOnly` on a word `timingsIndex` does not know (a file
   * without per-word times, a word the aligner missed, the ayah-end marker): such a word is upcoming
   * until its ayah starts, the marker until its ayah ends. Without them an unknown word is never dimmed.
   */
  readonly timings?: RecitationTimings | undefined;
  /** The word `wordAt()` names on this frame, for `mode: 'ayah'`; `null` between words. */
  readonly activeWordId: string | null;
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
};

/** The thickness of the dotted doubt underline, in em of the line's type size. */
const DOUBT_THICKNESS = '0.08em';

const ayahKey = (word: Pick<MushafWord, 'surah' | 'ayah'>): string => `${word.surah}:${word.ayah}`;

/** "1:2:3" → "1:2"; `null` for no word. Local on purpose: the translations module has its own. */
const ayahOf = (wordId: string | null): string | null => {
  if (wordId === null) return null;
  const parts = wordId.split(':');
  return parts.length === 3 ? `${parts[0]}:${parts[1]}` : null;
};

/**
 * The `wordStyle` of a line for the schema's highlight and review settings: a pure function of its
 * arguments and of the options captured here, so a frame always paints the same.
 *
 * - `dimOthers` under 1 dims every word that is not current (the active word, or under
 *   `mode: 'ayah'` every word of its ayah); with `dimUpcomingOnly` only the words whose first
 *   recitation starts after the current time (a word without a time of its own: its ayah's start,
 *   the marker its ayah's end), so what was heard stays readable.
 * - `mode: 'ayah'` paints the active style on every word of the active word's ayah (the composition
 *   then passes no `activeWordStyle`, so one word is not painted twice).
 * - In the Studio, with `review.showDoubtful`, a doubtful word gets a dotted underline in
 *   `doubtColor`. `text-decoration` is not pinned on a word (only on the row, where it is not
 *   inherited), so the underline paints without touching the line's metrics.
 */
export const wordStyleFrom = (
  options: WordStyleOptions,
): ((word: MushafWord, context: WordContext) => React.CSSProperties | undefined) => {
  const {highlight, review, doubtful, timingsIndex, timings, activeWordId, isStudio, sequenceFrom = 0} = options;
  const ayahTimings = new Map<string, AyahTiming>();
  for (const ayah of timings?.ayat ?? []) ayahTimings.set(`${timings!.surah}:${ayah.ayah}`, ayah);
  /** When a word is first heard: its own time, else its ayah's start (the marker: its ayah's end), else unknown. */
  const startOf = (word: MushafWord): number | undefined => {
    const own = timingsIndex[word.id];
    if (own !== undefined) return own;
    const ayah = ayahTimings.get(ayahKey(word));
    if (ayah === undefined) return undefined;
    return word.kind === 'end' ? ayah.end : ayah.start;
  };
  const ayahStyle = highlight.mode === 'ayah' ? activeWordStyleFrom(highlight) : undefined;
  const activeAyah = highlight.mode === 'ayah' ? ayahOf(activeWordId) : null;
  const dims = highlight.mode !== 'none' && highlight.dimOthers < 1;
  const marks = isStudio && review.showDoubtful;
  const doubtStyle: React.CSSProperties = {
    textDecoration: `underline dotted ${review.doubtColor}`,
    textDecorationThickness: DOUBT_THICKNESS,
  };
  return (word, context) => {
    let style: React.CSSProperties | undefined;
    const inActiveAyah = activeAyah !== null && ayahKey(word) === activeAyah;
    if (inActiveAyah && ayahStyle) style = {...ayahStyle};
    if (dims && !context.active && !inActiveAyah) {
      const start = startOf(word);
      const now = (context.frame + sequenceFrom) / context.fps;
      const dim = !highlight.dimUpcomingOnly || (start !== undefined && start > now);
      if (dim) style = {...style, opacity: highlight.dimOthers};
    }
    if (marks && (doubtful[word.id]?.length ?? 0) > 0) style = {...style, ...doubtStyle};
    return style;
  };
};

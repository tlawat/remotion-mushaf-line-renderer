// The design tokens of the render: the grounds and inks the looks are built from, the four motion
// curves, every duration, and the one staggered dissolve every text change uses. One module, so a
// composition, a test and a code user read the same numbers (docs/mushaf-studio/render-design.md,
// section 3).
import {CALM_EASINGS} from '@tlawat/remotion-mushaf-line';
import {isLightGround} from './color';

/** A ground with its inks, as the looks use them. Contrasts are WCAG ratios on the ground. */
export type GroundTokens = {
  readonly ground: string;
  readonly ink: string;
  /** The translation's muted ink. */
  readonly secondary: string;
  /** The gloss's ink. */
  readonly gloss: string;
  /** The gold of the rosette line work and the accent. */
  readonly metal: string;
};

/**
 * The grounds of the looks. Never `#ffffff` or `#000000`: ivory, warm paper (under the tajweed
 * colours), charcoal and Madinah green, each with an ink at 13:1 or better, a translation ink at
 * 6.5:1 or better and a gloss ink at 5:1 or better.
 */
export const GROUNDS = {
  ivory: {ground: '#f8f3e6', ink: '#1c1a16', secondary: '#5a554c', gloss: '#6b6458', metal: '#8c6c26'},
  paper: {ground: '#fbf7ee', ink: '#1c1a16', secondary: '#5a554c', gloss: '#6b6458', metal: '#8c6c26'},
  charcoal: {ground: '#121416', ink: '#f1eadb', secondary: '#b9b1a2', gloss: '#8f897d', metal: '#d8b56a'},
  green: {ground: '#10241b', ink: '#eee7d6', secondary: '#b5ae9c', gloss: '#8e978c', metal: '#cfae63'},
} as const satisfies Readonly<Record<string, GroundTokens>>;

/** The default accent of tint and wash: antique gold, drawn `#806321` on ivory by `legibleAccent()`. */
export const ACCENT_GOLD = '#b8913a';

/** The metal on a light and on a dark ground, when a custom theme does not set its own (`metalOf()`). */
export const METAL = {light: '#b8913a', dark: '#d4b46a'} as const;

/**
 * The four curves (the renderer's `CALM_EASINGS`): `SOFT` for arrivals (a mark in, an ink fill, a
 * fade-in), `INOUT` for a mark out, an ayah mark, the window scroll and the page band, `SINE` for
 * fade-outs, cards and the background zoom, `ARRIVE` for the rise of an entering line.
 */
export const SOFT = CALM_EASINGS.soft;
export const INOUT = CALM_EASINGS.inOut;
export const SINE = CALM_EASINGS.sine;
export const ARRIVE = CALM_EASINGS.arrive;

/** `tempo`: calm, or slow (the changes of a line, an ayah, a card 1.4× longer; the word marks keep their pace). */
export const TEMPOS = ['calm', 'slow'] as const;
export type Tempo = (typeof TEMPOS)[number];

/**
 * Every duration, in frames at 30 fps, at each tempo. The word marks (`markIn`, `markOut`,
 * `inkFill`) never scale with the tempo: they stay in sync with the voice.
 */
export const DURATIONS = {
  /** A word's tint or wash coming in. */
  markIn: {calm: 5, slow: 5},
  /** A word's tint or wash letting go: the soft trail. */
  markOut: {calm: 10, slow: 10},
  /** A word's ink from rest to full. */
  inkFill: {calm: 6, slow: 6},
  /** An ayah's mark coming in or letting go. */
  ayahMark: {calm: 14, slow: 20},
  /** The dissolve between two lines in one-line mode. */
  lineDissolve: {calm: 20, slow: 28},
  /** The dissolve between two ayahs of MushafAyahText. */
  ayahDissolve: {calm: 27, slow: 38},
  /** The dissolve between two ayahs' translations. */
  translationDissolve: {calm: 18, slow: 25},
  /** One step of the line window's scroll. */
  scroll: {calm: 24, slow: 34},
  /** The window's first appearance. */
  windowIn: {calm: 24, slow: 34},
  /** How long the last line holds after the last word, before it fades. */
  endHold: {calm: 45, slow: 45},
  /** The last line fading to the ground. */
  endFade: {calm: 30, slow: 42},
  /** The intro card's content coming in. */
  cardIn: {calm: 24, slow: 34},
  /** The intro card's content going. */
  cardOut: {calm: 21, slow: 30},
  /** The corner number or the repeat counter changing. */
  labelChange: {calm: 12, slow: 12},
  /** The gloss strip's text going, at a word change. */
  glossOut: {calm: 3, slow: 3},
  /** The gloss strip's text coming, from 2 frames after the change. */
  glossIn: {calm: 6, slow: 6},
  /** A word memorisation hid, revealed at its own start. */
  reveal: {calm: 7, slow: 7},
  /** A word heard in the previous play hidden again (blank-all). */
  rehide: {calm: 12, slow: 12},
  /** The shortest a compressed dissolve may be (continuous recitation). */
  Dmin: {calm: 10, slow: 10},
} as const satisfies Readonly<Record<string, Readonly<Record<Tempo, number>>>>;

export type DurationToken = keyof typeof DURATIONS;

/** The frame rate the `DURATIONS` are written at. */
const TOKEN_FPS = 30;

/**
 * A duration in frames at `fps` and `tempo`: the table's frames at 30 fps, `round(seconds × fps)`
 * at another rate, never under 1. `tempoFrames('scroll', 'slow', 30)` is 34; at 60 fps 68.
 */
export const tempoFrames = (token: DurationToken, tempo: Tempo = 'calm', fps: number = TOKEN_FPS): number => {
  const frames = DURATIONS[token][tempo];
  return fps === TOKEN_FPS ? frames : Math.max(1, Math.round((frames / TOKEN_FPS) * fps));
};

/** A duration in seconds at `tempo` (fps-free): `tempoSeconds('cardIn', 'slow')` is 1.133. */
export const tempoSeconds = (token: DurationToken, tempo: Tempo = 'calm'): number =>
  DURATIONS[token][tempo] / TOKEN_FPS;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** The two sides of a staggered dissolve at one frame: the outgoing text's opacity and the incoming text's. */
export type DissolveOpacities = {readonly out: number; readonly in: number};

/** The frames of a staggered dissolve's two sides: the outgoing text goes over `out`, the incoming one comes in from `in`. */
export type DissolveShares = {readonly out: number; readonly in: number};

/**
 * Where the two sides of a `duration`-frame dissolve fall: the outgoing text is gone after
 * `round(0.48 · D)` frames (at least 1), the incoming one starts at `round(0.30 · D)`. One source for
 * `dissolve()` and for the Sequences a composition overlaps around it, so the two cannot drift.
 * `dissolveShares(20)` is `{out: 10, in: 6}`.
 */
export const dissolveShares = (duration: number): DissolveShares => {
  const d = Math.max(1, duration);
  // 48 %, not the 45 % first designed: at 12 and 25 frames the 45 % share left a frame with under 0.1 of ink.
  return {out: Math.max(1, Math.round(0.48 * d)), in: Math.round(0.3 * d)};
};

/**
 * The staggered dissolve, the one shape of every text change (lines, ayah text, translation, end
 * card, page turn), at frame `f` of a transition `duration` frames long: the outgoing text goes
 * over the first 48 % on `SINE`, the incoming one comes from 30 % to the end on `SOFT`. At no frame
 * are both above 0.2, the outgoing text is under 0.25 when the incoming one starts, and every frame
 * shows at least 0.15 of ink between them (a soft dip, never empty). For 20 frames: out over
 * f0-f10, in over f6-f20.
 */
export const dissolve = (f: number, duration: number): DissolveOpacities => {
  const d = Math.max(1, duration);
  const {out: o, in: i} = dissolveShares(d);
  return {
    out: 1 - SINE(clamp01(f / o)),
    in: SOFT(clamp01((f - i) / Math.max(1, d - i))),
  };
};

/**
 * The metal of a video: a custom theme's own `frame` colour when it repaints the rosette frame,
 * else gold, `#b8913a` on a light ground and `#d4b46a` on a dark one. The jadwal, the intro's
 * hairline and lozenge, the end card's hairline and the page's double rule are drawn in it.
 */
export const metalOf = (props: {
  readonly theme?: string | undefined;
  readonly customTheme?: {readonly frame: string; readonly override: {readonly frame: boolean}} | undefined;
  /** The ground the metal sits on (`groundOf()`). */
  readonly ground: string;
}): string => {
  if (props.theme === 'custom' && props.customTheme?.override.frame) return props.customTheme.frame;
  return isLightGround(props.ground) ? METAL.light : METAL.dark;
};

import type * as React from 'react';
// Type-only import: erased at runtime, so @remotion/transitions stays a peer without runtime coupling.
import type {TransitionPresentation, TransitionTiming} from '@remotion/transitions';
import type {MUSHAFS} from './mushafs';

/**
 * A mushaf id is a key of the internal registry; adding a mushaf is one registry row + one dataset.
 *
 * `'qpc-v4'` (the default everywhere) is the plain glyph set: monochrome outlines that follow CSS
 * `color`. `'qpc-v4-tajweed'` is the same mushaf in QUL's COLR/CPAL colour font; prefer selecting it
 * with `tajweed: true` — the id is kept for data produced by earlier versions.
 */
export type MushafId = keyof typeof MUSHAFS;

/** QUL's line vocabulary (see lib/exporter/export_mushaf_layout.rb in QUL). */
export type MushafLineType = 'ayah' | 'surah_name' | 'basmallah';

/**
 * QUL's char_type names. The V4 data is expected to contain only `word` and `end`
 * (pause marks are merged into two-code-point words); the others exist so a future mushaf
 * with standalone marks needs no type change.
 */
export type MushafWordKind = 'word' | 'end' | 'pause' | 'sajdah' | 'rub-el-hizb';

export type MushafWord = {
  /** "surah:ayah:position" — QUL's `location`. Stable across mushafs; the join key for word timestamps. */
  readonly id: string;
  /**
   * Sequential index of the glyph in mushaf reading order (1-based, marker glyphs included); the
   * ordering key. Regular words follow QUL's global word order; standalone markers (pause, sajdah,
   * rub-el-hizb) are numbered where they appear.
   */
  readonly wordId: number;
  readonly surah: number;
  readonly ayah: number;
  /** Position inside the ayah (1-based). Never used for ordering. */
  readonly position: number;
  /** `end` is the ayah-number marker glyph — a real word that carries width. */
  readonly kind: MushafWordKind;
  /** 1–4 code points in U+FC41–U+FCFC. Opaque: only meaningful together with `fontFamily`. Never normalise. */
  readonly text: string;
};

export type MushafLineData = {
  /** Data-shape version. `<MushafLine>` throws BAD_LINE_DATA on a mismatch. */
  readonly version: 1;
  readonly mushaf: MushafId;
  /** 1..604 */
  readonly page: number;
  /** 1..15 (1..8 on pages 1–2) */
  readonly line: number;
  readonly type: MushafLineType;
  /** QUL `is_centered`: centred lines are centred, all others fill the measure. */
  readonly centered: boolean;
  /** "mushaf-<mushaf>-p<page>" — identical to `loadPageFont({mushaf, page}).fontFamily`. */
  readonly fontFamily: string;
  /**
   * Optional font source pin (e.g. `staticFile('fonts/qpc-v4/p10.woff2')` or a mirror URL).
   * Never set by `getMushafLine()`; consumers may set it in `calculateMetadata()` so every render
   * tab receives it as plain JSON. Passed to `loadPageFont({url})` as an explicit source.
   */
  readonly fontUrl?: string;
  /**
   * CPAL base palette to paint the colour font with; absent means the font's own default (palette 0,
   * the full tajweed colours). Set to 3 by `mandala` — black letters, coloured ayah rosettes.
   * Meaningless for the plain glyph set, which has no palettes.
   */
  readonly palette?: number;
  /**
   * CSS colours for the parts of that palette, `'currentColor'` included (see `MushafColors`).
   * `mandala` records `{text: 'currentColor'}` here plus whatever you asked for.
   */
  readonly paletteColors?: MushafColors;
  /** Present on surah_name lines (the header's surah) and basmallah lines (carried forward). */
  readonly surahNumber?: number;
  /** Ordered by wordId. Empty for surah_name / basmallah lines. */
  readonly words: readonly MushafWord[];
};

export type MushafLineAnimation = {
  /**
   * `component` is contravariant in its props, so `TransitionPresentation<FadeProps>` is not assignable
   * to `TransitionPresentation<Record<string, unknown>>`; `any` lets `fade()`, `slide()`, `wipe()` and
   * custom presentations pass unchanged (TransitionSeries casts internally too).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly presentation: TransitionPresentation<any>;
  /** Defaults to `enterTiming()` for `enter` and `exitTiming()` for `exit`. */
  readonly timing?: TransitionTiming;
};

/**
 * What `enter` / `exit` accept: `{presentation, timing?}`, or a presentation on its own — which uses
 * the package's default timing (`enterTiming()` / `exitTiming()`), i.e. `enter={slideFade()}`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MushafLineAnimationProp = MushafLineAnimation | TransitionPresentation<any>;

export type MushafLineCommonProps = {
  /**
   * Entrance animation, in `@remotion/transitions` vocabulary. Progress runs over the local frame of
   * the enclosing `<Sequence>`. A bare presentation (`enter={slideFade()}`) uses `enterTiming()`.
   */
  readonly enter?: MushafLineAnimationProp;
  /**
   * Exit animation, same vocabulary: the presentation's exiting side runs over the last
   * `timing.getDurationInFrames()` frames of the enclosing `<Sequence>` (its `durationInFrames`), so a
   * line leaves because its Sequence ends. To replace lines in place, start the next line's
   * `<Sequence from>` at the beginning of this window. Note `fade()` keeps the exiting side fully
   * visible unless `fade({shouldFadeOutExitingScene: true})`. A bare presentation uses `exitTiming()`.
   */
  readonly exit?: MushafLineAnimationProp;
  /**
   * How the line is sized to its box.
   *
   * - `'line'` (default): the line fills the measure at its own natural width, with the word gaps the
   *   page font defines. Printed lines are not all equally wide, so this is what matches the page.
   * - `'mushaf'`: one type size for the whole mushaf (`fontSizeForWidth()`, or your `fontSize`), and a
   *   line that is narrower than the widest one stops short of the margin.
   *
   * Centred lines (the last line of a surah, pages 1–2) are never stretched: they keep the base size
   * under either value, as printed.
   */
  readonly fit?: 'line' | 'mushaf';
  /**
   * px. The base size: `fontSizeForWidth(useVideoConfig().width)` by default. Under `fit="line"` it
   * is the starting point the line is scaled from (so the box, not this number, decides the final
   * size of a justified line); under `fit="mushaf"` it is used as it is.
   */
  readonly fontSize?: number;
  /** px. Default: `round(2.2 × fontSize)` — the 15-line grid unit; keeps the +1.37 / −0.73 em glyph extremes inside the box. */
  readonly lineHeight?: number;
  /** Applied to the root element (same meaning as `<Sequence style>`). Colour is inherited from here for plain fonts. */
  readonly style?: React.CSSProperties;
  readonly className?: string;
  /**
   * The word to mark as current — `word.id` ("9:1:3") or `word.wordId` (the sequential index). It
   * gets `data-active="true"` and `.mushaf-word--active`, plus `activeWordStyle` when given. Drive it
   * from your own word timings for a karaoke-style follow.
   */
  readonly activeWordId?: string | number | null;
  /** Applied to the word named by `activeWordId`. Paint only — see `wordStyle`. */
  readonly activeWordStyle?: React.CSSProperties;
  /**
   * Per-word style, called for every word on every frame. Must be a pure function of its arguments
   * so renders stay deterministic.
   *
   * Paint-only: `color`, `opacity`, `filter`, `background`, `textShadow` are safe. Anything that
   * changes glyph metrics (font size/family/weight, letter spacing, padding, margins, borders,
   * display) breaks the printed line breaks and is ignored by the layout's pinned row style.
   */
  readonly wordStyle?: (word: MushafWord, context: WordContext) => React.CSSProperties | undefined;
  /** Per-word class name, appended to `mushaf-word mushaf-word--<kind>`. Same purity rule. */
  readonly wordClassName?: (word: MushafWord, context: WordContext) => string | undefined;
  /** Wraps the line in `<Sequence layout="none" name>` so it gets a label in the Studio timeline. */
  readonly name?: string;
};

export type MushafLineProps = MushafLineCommonProps &
  (
    // Resolved data decides its own mushaf and colouring (pass `tajweed` to getMushafLine() instead).
    | {readonly line: MushafLineData; readonly mushaf?: never; readonly page?: never; readonly tajweed?: never; readonly mandala?: never}
    | (MushafSelection & {readonly page: number; readonly line: number})
  );

/** Chooses the mushaf and its colouring. All optional: the default is plain `'qpc-v4'`. */
export type MushafSelection = {
  /** Default `'qpc-v4'`. */
  readonly mushaf?: MushafId;
  /**
   * `true` renders QUL's tajweed colour font (COLR/CPAL, colours baked in, CSS `color` ignored);
   * the default `false` renders the plain glyphs in the inherited CSS `color`. Decides on its own
   * when combined with a `mushaf` id that says otherwise.
   */
  readonly tajweed?: boolean;
  /**
   * Renders the text in the inherited CSS `color` with the ayah-end rosette in its own colours —
   * the same colour font as `tajweed`, at CPAL palette 3. `true` takes the defaults; an object
   * recolours any part (see `MushafColors`). `tajweed: true` wins when both are given.
   */
  readonly mandala?: boolean | MushafColors;
};

/**
 * CSS colours for the parts of a colour-font palette. Every value is an ordinary CSS colour
 * (`'#1b6f3f'`, `'rgb(27 111 63)'`, `'crimson'`, `'transparent'`), plus `'currentColor'` — the
 * inherited CSS `color`, which the package resolves at render time because COLR glyphs ignore
 * `color` themselves. It is resolved per line, so `wordStyle`/`activeWordStyle` colours still do not
 * reach these glyphs; use the plain set to colour words individually.
 *
 * Anything left out keeps the palette's own colour, which is what makes `mandala` a coloured rosette
 * on plain text.
 */
export type MushafColors = {
  /** The letters. `mandala` defaults this to `'currentColor'`. */
  readonly text?: string;
  /** Shorthand for `outline` + `petals` + `jewel` — the whole rosette except the disc behind the number. */
  readonly rosette?: string;
  /** The rosette's frame and curls, and the ayah number inside it. */
  readonly outline?: string;
  /** The petal flourishes above and below the rosette. */
  readonly petals?: string;
  /** The small jewel at the top of the rosette. */
  readonly jewel?: string;
  /** The disc behind the ayah number. */
  readonly fill?: string;
};

export type GetMushafLineOptions = MushafSelection & {
  readonly page: number;
  readonly line: number;
};

/** A place in the mushaf: which line of which page. */
export type MushafLocation = {
  readonly page: number;
  readonly line: number;
};

export type GetMushafLocationOptions = {
  readonly mushaf?: MushafId;
  readonly surah: number;
  /** Default 1 — the start of the surah. */
  readonly ayah?: number;
};

/** Pins the font source of every resolved line, so `calculateMetadata()` need not map over them. */
export type MushafFontUrl = (page: number, mushaf: MushafId) => string;

export type GetMushafLinesOptions = MushafSelection & {
  readonly fontUrl?: MushafFontUrl;
} & (
    | {
        /** Every line of this page, `surah_name` and `basmallah` lines included. */
        readonly page: number;
        readonly surah?: never;
        readonly fromAyah?: never;
        readonly toAyah?: never;
      }
    | {
        /** Every line that carries a word of ayahs `fromAyah`..`toAyah` of this surah, in reading order. */
        readonly surah: number;
        /** Default 1. */
        readonly fromAyah?: number;
        /** Default: the last ayah of the surah. */
        readonly toAyah?: number;
        readonly page?: never;
      }
  );

export type LoadPageFontOptions = MushafSelection & {
  readonly page: number;
  /** Explicit font source: a mirror URL or `staticFile('fonts/<mushaf>/p<N>.woff2')`. */
  readonly url?: string;
};

export type LoadedPageFont = {
  readonly fontFamily: string;
  readonly waitUntilDone: () => Promise<void>;
};

/** The mushaf's font metrics; `referenceLineWidth` is what `fontSizeForWidth()` divides by. */
export type MushafMetrics = {
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  /** Line width the base type size is derived from, in font units (42,501 for KFGQPC V4). */
  readonly referenceLineWidth: number;
};

/** Passed to `wordStyle` / `wordClassName` alongside the word. */
export type WordContext = {
  readonly line: MushafLineData;
  /** Local frame of the enclosing `<Sequence>`. */
  readonly frame: number;
  readonly fps: number;
  /** `true` when this word is the one named by `activeWordId`. */
  readonly active: boolean;
};

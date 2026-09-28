// Type-only import: erased at runtime, so @remotion/transitions stays a peer without runtime coupling.
import type {TransitionPresentation, TransitionTiming} from '@remotion/transitions';
import type * as React from 'react';
import type {MUSHAFS} from './mushaf/registry';

/**
 * A mushaf id names a printed layout (page and line breaks) and the fonts that go with it. There is
 * one today, the KFGQPC V4 (1441H) print, and it is the default everywhere.
 */
export type MushafId = keyof typeof MUSHAFS;

/** The colour presets, the ten themes QUL offers on its preview page minus `p6` (the font has no palette 6). */
export type MushafThemeName = 'light' | 'dark' | 'sepia' | 'black' | 'normal' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5';

/**
 * The parts of a colour-font line that can be recoloured, each a group of CPAL entries:
 *
 * - `ink`: the letters (entries 0 and 14).
 * - `silent`: the greyed letters that are written but not pronounced (1, 2, 15).
 * - `rules`: the seven tajweed rule colours (3-9: prolongations, ghunnah, qalqalah, ...).
 * - `frame`: the ayah-end rosette's frame, curls and the ayah number inside it (13).
 * - `accent`: the petal flourishes above and below the rosette (11).
 * - `detail`: the small jewel at the top of the rosette (10).
 * - `background`: the disc behind the ayah number (12).
 */
export type MushafColorPart = 'ink' | 'silent' | 'rules' | 'frame' | 'accent' | 'detail' | 'background';

/**
 * Colours by part name or by CPAL entry index (`'0'`-`'15'`). Every value is an ordinary CSS colour
 * (`'#1b6f3f'`, `'rgb(27 111 63)'`, `'crimson'`, `'transparent'`), plus `'currentColor'`: the
 * inherited CSS `color`, which the package resolves at render time because COLR glyphs ignore
 * `color` themselves. A numeric key wins over a part that contains that entry.
 */
export type MushafThemeColors = {readonly [key in MushafColorPart | `${number}`]?: string};

/**
 * A colour scheme for the colour font: exactly what QUL writes into an `@font-palette-values` rule.
 *
 * ```ts
 * {base: 'normal', colors: {accent: '#c8a45c', background: 'transparent'}}  // gold petals on a plain disc
 * {base: 'light', colors: {rules: 'currentColor'}}                          // tajweed switched off
 * {base: 4}                                                                  // the font's own white-text palette
 * ```
 */
export type MushafTheme = {
  /** A CPAL base palette of the font (0-5), or a preset to start from (its colours come first). */
  readonly base: number | MushafThemeName;
  /** Colours over that base. */
  readonly colors?: MushafThemeColors;
  /**
   * Colours that apply to the ayah-number marker glyph only, over `colors`. QUL's `black` theme
   * uses this to paint the number black on an otherwise all-white line.
   */
  readonly marker?: MushafThemeColors;
};

/**
 * How a line is coloured: `'plain'` (the default) is the monochrome font, whose glyphs follow the
 * CSS `color` they inherit; anything else selects the colour font with a preset or a custom theme.
 *
 * | Preset   | QUL's button | What you get                                                                    |
 * | -------- | ------------ | ------------------------------------------------------------------------------- |
 * | `light`  | Light        | the tajweed colours on a light background                                       |
 * | `dark`   | Dark         | the tajweed colours for a dark background                                       |
 * | `sepia`  | Sepia        | the tajweed colours in sepia tones                                              |
 * | `black`  | Black        | everything white, the ayah number black: for a dark background, no tajweed      |
 * | `normal` | (default)    | the writing in the inherited CSS `color`, the ayah rosette in its own colours   |
 * | `p1`-`p5`| P1-P5        | the font's own CPAL palettes 1-5, untouched                                     |
 */
export type MushafThemeSelection = 'plain' | MushafThemeName | MushafTheme;

/**
 * The two font file sets QUL publishes for the V4 mushaf: `'qpc-v4'` (monochrome outlines) and
 * `'qpc-v4-tajweed'` (COLR/CPAL colour font). Derived from the theme; each ships as its own fonts
 * package (`@tlawat/mushaf-fonts-<fontSet>`), and CDN paths are organised the same way.
 */
export type MushafFontSet = 'qpc-v4' | 'qpc-v4-tajweed';

/**
 * The two fonts QUL publishes for the V4 mushaf that are not per page: `'surah-names-v4'`
 * (QUL resource 237: the 114 surah names and the basmalah) and `'quran-common'` (QUL resource 459:
 * the 30 juz names, the ornamental surah-header frame). Both are fetched from QUL's CDN by default;
 * neither ships in the fonts packages.
 */
export type MushafSharedFont = 'surah-names-v4' | 'quran-common';

/** How a juz is named: `'ordinal'` is "the first juz" written out, `'opening'` its first words ("Alif Lam Mim" for juz 1). */
export type MushafJuzNameVariant = 'ordinal' | 'opening';

/** QUL's line vocabulary (see lib/exporter/export_mushaf_layout.rb in QUL). */
export type MushafLineType = 'ayah' | 'surah_name' | 'basmallah';

/**
 * QUL's char_type names. The V4 data is expected to contain only `word` and `end`
 * (pause marks are merged into two-code-point words); the others exist so a future mushaf
 * with standalone marks needs no type change.
 */
export type MushafWordKind = 'word' | 'end' | 'pause' | 'sajdah' | 'rub-el-hizb';

export type MushafWord = {
  /** "surah:ayah:position"  -  QUL's `location`. Stable across mushafs; the join key for word timestamps. */
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
  /** `end` is the ayah-number marker glyph  -  a real word that carries width. */
  readonly kind: MushafWordKind;
  /** 1-4 code points in U+FC41-U+FCFC. Opaque: only meaningful together with `fontFamily`. Never normalise. */
  readonly text: string;
};

/** Chooses the mushaf and how it is coloured. Everything is optional: the default is the plain V4. */
export type MushafSelection = {
  /** Default `'qpc-v4'`. */
  readonly mushaf?: MushafId | undefined;
  /** Default `'plain'`. See `MushafThemeSelection`. */
  readonly theme?: MushafThemeSelection | undefined;
};

export type MushafLineData = {
  /** Data-shape version. `<MushafLine>` throws BAD_LINE_DATA on a mismatch. */
  readonly version: 3;
  readonly mushaf: MushafId;
  /**
   * How the line is coloured, decided where the data was resolved: `'plain'`, a preset name, or a
   * custom theme recorded with a numeric `base` and its colours by entry, so the data is
   * self-contained.
   */
  readonly theme: MushafThemeSelection;
  /** The font files the theme needs; what `fontUrl(page, fontSet)` receives when pinning a mirror. */
  readonly fontSet: MushafFontSet;
  /** 1..604 */
  readonly page: number;
  /** 1..15 (1..8 on pages 1-2) */
  readonly line: number;
  readonly type: MushafLineType;
  /** QUL `is_centered`: centred lines are centred, all others fill the measure. */
  readonly centered: boolean;
  /**
   * "mushaf-<fontSet>-p<page>": the family under the default font source (`fontSrc: 'cdn'` with no
   * fallback), identical to `loadPageFont({...}).fontFamily` for it. Other sources load their own
   * face under a suffixed family; `<MushafLine>` always paints with the one its source loaded.
   */
  readonly fontFamily: string;
  /**
   * Which ayahs of the line to show (see `MushafSlice`). Recorded by `getMushafLines({slice: true})`;
   * the words are never trimmed, so the printed line is still all there for the layout.
   */
  readonly slice?: MushafSlice;
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
  readonly presentation: TransitionPresentation<any>;
  /** Defaults to `enterTiming()` for `enter` and `exitTiming()` for `exit`. */
  readonly timing?: TransitionTiming;
};

/**
 * What `enter` / `exit` accept: `{presentation, timing?}`, or a presentation on its own  -  which uses
 * the package's default timing (`enterTiming()` / `exitTiming()`), i.e. `enter={slideFade()}`.
 */
export type MushafLineAnimationProp = MushafLineAnimation | TransitionPresentation<any>;

/** Passed to `wordStyle` / `wordClassName` alongside the word. */
export type WordContext = {
  readonly line: MushafLineData;
  /** Local frame of the enclosing `<Sequence>`. */
  readonly frame: number;
  readonly fps: number;
  /** `true` when this word is the one named by `activeWordId`. */
  readonly active: boolean;
  /** `false` for the words a `slice` hides; `true` for every word when no slice is in effect. */
  readonly inSlice: boolean;
};

/**
 * Which ayahs of a line to show: `{ayah}` for one, `{fromAyah, toAyah}` for a range  -  open-ended
 * after `fromAyah` when `toAyah` is omitted, so one selector means the same thing on every line of
 * a passage. The rest of the line is hidden and the words that remain are centred in the measure at
 * the line's own type size. The ayah-end rosette belongs to the ayah it closes. A slice that keeps
 * every word of a line changes nothing; one that keeps none paints nothing and throws nothing.
 */
export type MushafSlice =
  | {readonly ayah: number; readonly fromAyah?: never; readonly toAyah?: never}
  | {readonly fromAyah: number; readonly toAyah?: number; readonly ayah?: never};

/**
 * Where the mushaf data comes from: QUL's two raw exports  -  the words of the script (JSON) and the
 * line layout (SQLite)  -  each as the CDN's zip or unzipped. Absolute URLs, `staticFile()` results
 * or root-relative paths (in a browser); anything left out is fetched from QUL's exports on
 * Tarteel's CDN. Point both at a mirror in `public/` through `staticFile()` for offline, faster or
 * reproducible renders.
 */
export type MushafDataSource = {
  readonly words?: string | undefined;
  readonly layout?: string | undefined;
};

export type MushafDataOptions = {
  /** Data source override, see `MushafDataSource`. Default: QUL's exports on Tarteel's CDN. */
  readonly data?: MushafDataSource | undefined;
};

export type LoadMushafDataOptions = MushafDataOptions & {
  /** Default `'qpc-v4'`. */
  readonly mushaf?: MushafId | undefined;
};

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
   * Centred lines (the last line of a surah, pages 1-2) are never stretched: they keep the base size
   * under either value, as printed.
   */
  readonly fit?: 'line' | 'mushaf';
  /**
   * Show only these ayahs of the line, collapsed and centred in the measure (see `MushafSlice`).
   * Wins over `line.slice`; `null` cancels a slice the data carries. The words that remain keep the
   * line's own type size and their printed advances  -  nothing is zoomed or re-spaced.
   */
  readonly slice?: MushafSlice | null;
  /**
   * px. The base size: `fontSizeForWidth(useVideoConfig().width)` by default. Under `fit="line"` it
   * is the starting point the line is scaled from (so the box, not this number, decides the final
   * size of a justified line); under `fit="mushaf"` it is used as it is.
   */
  readonly fontSize?: number;
  /** px. Default: `round(2.2 × fontSize)`  -  the 15-line grid unit; keeps the +1.37 / -0.73 em glyph extremes inside the box. */
  readonly lineHeight?: number;
  /** Applied to the root element (same meaning as `<Sequence style>`). Colour is inherited from here. */
  readonly style?: React.CSSProperties;
  readonly className?: string;
  /**
   * The word to mark as current  -  `word.id` ("9:1:3") or `word.wordId` (the sequential index). It
   * gets `data-active="true"` and `.mushaf-word--active`, plus `activeWordStyle` when given. Drive it
   * from your own word timings for a karaoke-style follow.
   */
  readonly activeWordId?: string | number | null;
  /** Applied to the word named by `activeWordId`. Paint only  -  see `wordStyle`. */
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
  /**
   * Whether a `surah_name` line sets the name inside the ornamental frame it is printed in (QUL's
   * `quran-common` font). Default `true`; `false` sets the name alone. Ignored by other line types.
   */
  readonly framed?: boolean;
  /** Where the fonts come from; default `'cdn'` (QUL's CDN). See `MushafFontSrc`. */
  readonly fontSrc?: MushafFontSrc;
  /**
   * A fonts package to load the page font from when `fontSrc` fails, e.g.
   * `import fonts from '@tlawat/mushaf-fonts-qpc-v4-tajweed'`. See README → When the CDN fails.
   * The packages hold page fonts only; the surah-name and juz fonts have no fallback.
   */
  readonly fontFallback?: MushafFontFallback;
};

/** Props shared by `<MushafSurahName>` and `<MushafJuzName>`. */
export type MushafGlyphCommonProps = Pick<
  MushafLineCommonProps,
  'enter' | 'exit' | 'fontSize' | 'lineHeight' | 'style' | 'className' | 'name' | 'fontSrc' | 'fontFallback'
> & {
  /** Default `'qpc-v4'`. */
  readonly mushaf?: MushafId | undefined;
};

export type MushafSurahNameProps = MushafGlyphCommonProps & {
  /** 1-114. */
  readonly surah: number;
  /**
   * `true` (default) sets the name inside the ornamental frame it is printed in, which spans the
   * width of the widest line of the mushaf at `fontSize` (the composition width by default);
   * `false` sets the name alone.
   */
  readonly framed?: boolean;
};

export type MushafJuzNameProps = MushafGlyphCommonProps & {
  /** 1-30. */
  readonly juz: number;
  /** Default `'ordinal'`. See `MushafJuzNameVariant`. */
  readonly variant?: MushafJuzNameVariant;
};

export type MushafLineProps = MushafLineCommonProps &
  // Resolved data decides its own mushaf and theme, and is already loaded (pass `theme` / `data` to
  // getMushafLine() instead).
  (
    | {
        readonly line: MushafLineData;
        readonly page?: never;
        readonly mushaf?: never;
        readonly theme?: never;
        readonly data?: never;
      }
    // Convenience form: resolved at render time behind delayRender().
    | (MushafSelection & MushafDataOptions & {readonly page: number; readonly line: number})
  );

export type GetMushafLineOptions = MushafSelection &
  MushafDataOptions & {
    readonly page: number;
    readonly line: number;
  };

/** A place in the mushaf: which line of which page. */
export type MushafLocation = {
  readonly page: number;
  readonly line: number;
};

export type GetMushafLocationOptions = MushafDataOptions & {
  readonly mushaf?: MushafId | undefined;
  readonly surah: number;
  /** Default 1  -  the start of the surah. */
  readonly ayah?: number;
};

export type GetMushafLinesOptions = MushafSelection &
  MushafDataOptions &
  (
    | {
        /** Every line of this page, `surah_name` and `basmallah` lines included. */
        readonly page: number;
        readonly surah?: never;
        readonly fromAyah?: never;
        readonly toAyah?: never;
        readonly slice?: never;
      }
    | {
        /** Every line that carries a word of ayahs `fromAyah`..`toAyah` of this surah, in reading order. */
        readonly surah: number;
        /** Default 1. */
        readonly fromAyah?: number;
        /** Default: the last ayah of the surah. */
        readonly toAyah?: number;
        readonly page?: never;
        /**
         * Record the range as `line.slice` on the lines it cuts  -  the first and/or last of the passage,
         * when they carry words of other ayahs  -  so `<MushafLine>` collapses them to the words that
         * belong to it. The lines in between carry no slice and render exactly as printed.
         */
        readonly slice?: boolean;
      }
  );

export type LoadPageFontOptions = {
  readonly mushaf?: MushafId | undefined;
  /** Decides the font set: `'plain'` loads the monochrome font, any theme the colour font. */
  readonly theme?: MushafThemeSelection | undefined;
  readonly page: number;
  /** Where the font comes from; default `'cdn'`. Pass the same value as the `<MushafLine fontSrc>` you warm up. */
  readonly fontSrc?: MushafFontSrc | undefined;
  /** Used when `fontSrc` fails; pass the same value as the `<MushafLine fontFallback>` you warm up. */
  readonly fallback?: MushafFontFallback | undefined;
};

export type LoadSharedFontOptions = {
  readonly mushaf?: MushafId | undefined;
  /** `'surah-names-v4'` (surah names, the basmalah) or `'quran-common'` (juz names, the header frame). */
  readonly font: MushafSharedFont;
  /** Where the font comes from; default `'cdn'`. Pass the same value as the component you warm up. */
  readonly fontSrc?: MushafFontSrc | undefined;
  /** Accepted for symmetry with `loadPageFont()`; the fonts packages hold page fonts only, so it is never used. */
  readonly fallback?: MushafFontFallback | undefined;
};

/** Which kind of source a loaded font came from. */
export type MushafFontOrigin = 'cdn' | 'package' | 'custom';

export type LoadedMushafFont = {
  /** The family the font is registered under for this source (see `MushafLineData.fontFamily`). */
  readonly fontFamily: string;
  readonly waitUntilDone: () => Promise<void>;
  /** Where the font was loaded from: `null` until it has loaded, and always on the server. */
  readonly origin: () => MushafFontOrigin | null;
};

/** What `loadPageFont()` returns; the same shape as `loadSharedFont()`'s. */
export type LoadedPageFont = LoadedMushafFont;

export type MushafFontFormat = 'woff2' | 'woff';

/** One page font file of a mushaf. */
export type MushafPageFontFile = {
  readonly kind: 'page';
  readonly mushaf: MushafId;
  readonly fontSet: MushafFontSet;
  readonly page: number;
  readonly font?: never;
  /** `'woff2'`, or `'woff'` where QUL publishes no woff2 (qpc-v4-tajweed page 328). */
  readonly format: MushafFontFormat;
  /** `'p328'`. */
  readonly id: string;
  /** `'p328.woff'`: the file's name on the CDN and in the fonts packages. */
  readonly fileName: string;
  /** QUL's CDN URL for the file. */
  readonly cdnUrl: string;
};

/** One of the shared fonts (see `MushafSharedFont`): one file for the whole mushaf. */
export type MushafSharedFontFile = {
  readonly kind: 'shared';
  readonly mushaf: MushafId;
  readonly font: MushafSharedFont;
  readonly fontSet?: never;
  readonly page?: never;
  readonly format: 'woff2';
  /** The font's id, `'surah-names-v4'` or `'quran-common'`. */
  readonly id: MushafSharedFont;
  /** `'surah_names.woff2'` or `'quran-common.woff2'`: the file's name on QUL's CDN. */
  readonly fileName: string;
  /** QUL's CDN URL for the file. */
  readonly cdnUrl: string;
};

/** A font file of a mushaf: what a `MushafFontResolver` receives. `kind` says which. */
export type MushafFontFile = MushafPageFontFile | MushafSharedFontFile;

export type GetMushafFontFileOptions =
  | (MushafSelection & {readonly page: number; readonly font?: never})
  | {
      readonly mushaf?: MushafId | undefined;
      readonly font: MushafSharedFont;
      readonly page?: never;
      readonly theme?: never;
    };

/**
 * What a fonts package (`@tlawat/mushaf-fonts-qpc-v4`, `@tlawat/mushaf-fonts-qpc-v4-tajweed`)
 * exports by default: the page fonts of one font set, as URLs your bundler serves. Importing it is
 * what puts the files in your bundle; nothing is downloaded unless a line needs it.
 */
export type MushafFontPackage = {
  readonly kind: 'remotion-mushaf-fonts';
  readonly schema: 1;
  /** The npm package name, for messages. */
  readonly name: string;
  readonly version: string;
  readonly mushaf: MushafId;
  readonly fontSet: MushafFontSet;
  /** The date of QUL's fonts this package holds (YYYY-MM-DD). */
  readonly snapshot: string;
  /** By page: the URL the bundler gave the file, its size and its SHA-256 (hex). */
  readonly files: Readonly<Record<number, {readonly url: string; readonly bytes: number; readonly sha256: string}>>;
};

/**
 * Your own URL(s) for a font file. One URL is used as it is; an array is tried in order, each
 * failure falling through to the next (then to `fontFallback`). For a page font (`file.kind ===
 * 'page'`) a fonts package may be returned instead: the page is then loaded from the package and
 * checked against it, which lets one resolver serve pages from a package and the shared fonts
 * (surah names, juz names) from your own files. Called while rendering: must be pure. Build the URL
 * from `file.fileName` (page 328 of the colour set is `.woff`), e.g.
 * `(f) => staticFile('fonts/' + (f.kind === 'page' ? f.fontSet : f.font) + '/' + f.fileName)`.
 */
export type MushafFontResolver = (file: MushafFontFile) => string | readonly string[] | MushafFontPackage;

/**
 * Where fonts come from.
 *
 * - `'cdn'` (default): QUL's CDN.
 * - a fonts package (`import fonts from '@tlawat/mushaf-fonts-qpc-v4-tajweed'`): the package only;
 *   the CDN is never contacted. For offline and byte-reproducible renders. Page fonts only: a line
 *   or component that needs a shared font (a surah name, a juz name) refuses it with `BAD_FONT_SRC`;
 *   use a resolver that returns the package for page files and your own URL for the shared ones.
 * - a `MushafFontResolver`: your own URLs.
 */
export type MushafFontSrc = 'cdn' | MushafFontPackage | MushafFontResolver;

/**
 * Used when `fontSrc` fails (an outage, a firewall, a timeout): one fonts package, or both  -  the one
 * whose `fontSet` matches the line's theme is used.
 */
export type MushafFontFallback = MushafFontPackage | readonly MushafFontPackage[];

/** The mushaf's font metrics; `referenceLineWidth` is what `fontSizeForWidth()` divides by. */
export type MushafMetrics = {
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  /** Line width the base type size is derived from, in font units (42,501 for KFGQPC V4). */
  readonly referenceLineWidth: number;
};

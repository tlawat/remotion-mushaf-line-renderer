import type React from 'react';
// Type-only import: erased at runtime, so @remotion/transitions stays a peer without runtime coupling.
import type {TransitionPresentation, TransitionTiming} from '@remotion/transitions';
import type {MUSHAFS} from './mushafs';

/** A mushaf id is a key of the internal registry; adding a mushaf is one registry row + one dataset. */
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
  /** QUL global word index (1..83668 for V4), shared by QUL layouts; the ordering key. */
  readonly wordId: number;
  readonly surah: number;
  readonly ayah: number;
  /** Position inside the ayah (1-based). Never used for ordering. */
  readonly position: number;
  /** `end` is the ayah-number marker glyph — a real word that carries width. */
  readonly kind: MushafWordKind;
  /** 1–2 code points in U+FC41–U+FCFC. Opaque: only meaningful together with `fontFamily`. Never normalise. */
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
  readonly timing: TransitionTiming;
};

export type MushafLineCommonProps = {
  /** Entrance animation, in `@remotion/transitions` vocabulary. Progress runs over the local frame of the enclosing `<Sequence>`. */
  readonly enter?: MushafLineAnimation;
  /** px. Default: `floor(useVideoConfig().width × 2500 / 42501)` — one type size for every page (the widest line is 42,501 font units). */
  readonly fontSize?: number;
  /** px. Default: `round(2.2 × fontSize)` — the 15-line grid unit; keeps the +1.37 / −0.73 em glyph extremes inside the box. */
  readonly lineHeight?: number;
  /** Applied to the root element (same meaning as `<Sequence style>`). Colour is inherited from here for plain fonts. */
  readonly style?: React.CSSProperties;
  readonly className?: string;
  /** Wraps the line in `<Sequence layout="none" name>` so it gets a label in the Studio timeline. */
  readonly name?: string;
};

export type MushafLineProps = MushafLineCommonProps &
  (
    | {readonly line: MushafLineData; readonly mushaf?: never; readonly page?: never}
    | {readonly mushaf: MushafId; readonly page: number; readonly line: number}
  );

export type GetMushafLineOptions = {
  readonly mushaf: MushafId;
  readonly page: number;
  readonly line: number;
};

export type LoadPageFontOptions = {
  readonly mushaf: MushafId;
  readonly page: number;
  /** Explicit font source: a mirror URL or `staticFile('fonts/<mushaf>/p<N>.woff2')`. */
  readonly url?: string;
};

export type LoadedPageFont = {
  readonly fontFamily: string;
  readonly waitUntilDone: () => Promise<void>;
};

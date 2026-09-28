import type * as React from 'react';
import {useRef} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {getEnterState, getExitState, normaliseAnimation} from '../animation/animation-state';
import {fontOfGlyph, type MushafDefinition, type MushafGlyph, type SharedFontDefinition} from '../mushaf/registry';
import type {MushafFontFallback, MushafFontSrc, MushafLineAnimationProp} from '../types';
import {useCanvasGuard} from './hooks/use-canvas-guard';
import {useSharedFontGate} from './hooks/use-shared-font-gate';
import {Presented} from './Presented';
import {assertSize, buildGlyphRowStyle, buildGlyphStyle, buildRootStyle} from './styles';

/** One glyph to set: which, at what size, and whether its ink is centred in the box or left on the baseline. */
export type GlyphItem = {
  readonly glyph: MushafGlyph;
  /** px */
  readonly fontSize: number;
  /**
   * `'center'` shifts the glyph so the middle of its ink band sits in the middle of the box (names,
   * frames); `'baseline'` leaves it on the baseline the font's metrics give, as a line of text.
   */
  readonly align: 'center' | 'baseline';
};

export type GlyphRendererProps = {
  readonly def: MushafDefinition;
  readonly items: readonly GlyphItem[];
  /** px: the height of the root element. */
  readonly lineHeight: number;
  readonly enter: MushafLineAnimationProp | undefined;
  readonly exit: MushafLineAnimationProp | undefined;
  readonly style: React.CSSProperties | undefined;
  readonly className: string | undefined;
  /** `mushaf-line`, `mushaf-surah-name`, `mushaf-juz-name`: the root's class, and the row's prefix. */
  readonly rootClassName: string;
  /** `data-*` attributes of the root (values as strings; `undefined` leaves one out). */
  readonly rootData: Readonly<Record<string, string | undefined>>;
  /** For delayRender labels: `<MushafLine> page 187 line 1`. */
  readonly label: string;
  readonly fontSrc: MushafFontSrc | undefined;
  readonly fontFallback: MushafFontFallback | undefined;
};

/** The vertical correction that centres a glyph's ink band in its line box (see `buildGlyphStyle`). */
export const glyphShiftEm = (font: SharedFontDefinition, glyph: MushafGlyph): number => {
  const m = font.metrics;
  // With the ascent and descent pinned, the baseline sits (ascent + descent) / 2 units below the
  // middle of the box (descent is negative); the ink's middle is `bandCenter` units above the baseline.
  return (glyph.bandCenter - (m.ascent + m.descent) / 2) / m.unitsPerEm;
};

/**
 * Sets one or more glyphs of the shared fonts in a box: a surah name (in its frame), a basmalah, a
 * juz name. Everything `<LineRenderer>` does for a line of words, minus the words: the fonts are
 * gated behind `delayRender()`, presentations wrap the row as `<TransitionSeries>` would, canvas
 * presentations are refused, and nothing is painted before the fonts are in `document.fonts`.
 */
export const GlyphRenderer: React.FC<GlyphRendererProps> = ({
  def,
  items,
  lineHeight,
  enter: enterProp,
  exit: exitProp,
  style,
  className,
  rootClassName,
  rootData,
  label,
  fontSrc,
  fontFallback,
}) => {
  const enter = normaliseAnimation('enter', enterProp);
  const exit = normaliseAnimation('exit', exitProp);
  const {fps, durationInFrames} = useVideoConfig();
  const frame = useCurrentFrame();
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // One face per font, whatever the number of glyphs, the surah-name font first: it names the
  // origin of a header, and it is the one a header cannot do without.
  const fonts: SharedFontDefinition[] = [def.sharedFonts.surahNames, def.sharedFonts.common].filter((font) =>
    items.some((item) => fontOfGlyph(def, item.glyph) === font),
  );
  const gate = useSharedFontGate({def, fonts, fontSrc, fontFallback, label});
  const canvas = useCanvasGuard({hasPresentation: Boolean(enter || exit), rootRef, rowRef});

  // ---- hooks done; validation and throws below ----
  if (canvas.error) throw canvas.error;
  if (gate.error) throw gate.error;
  assertSize('lineHeight', lineHeight);
  for (const item of items) assertSize('fontSize', item.fontSize);
  const enterState = enter ? getEnterState({enter, frame, fps}) : null;
  const exitState = exit ? getExitState({exit, frame, fps, durationInFrames}) : null;

  const row = (
    <div ref={rowRef} className={`${rootClassName}__row`} style={buildGlyphRowStyle(gate.loaded)}>
      {items.map((item, i) => {
        const font = fontOfGlyph(def, item.glyph);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the items of an element never reorder
            key={i}
            className={`mushaf-glyph mushaf-glyph--${item.glyph.kind}`}
            data-glyph={item.glyph.kind}
            data-font={font.id}
            style={buildGlyphStyle({
              fontFamily: gate.families[font.id] as string,
              fontSize: item.fontSize,
              lineHeight,
              shiftEm: item.align === 'center' ? glyphShiftEm(font, item.glyph) : 0,
            })}
          >
            {item.glyph.text}
          </span>
        );
      })}
    </div>
  );
  let presented: React.ReactNode = row;
  if (enter && enterState) {
    presented = (
      <Presented
        presentation={enter.presentation}
        direction="entering"
        progress={enterState.progress}
        durationInFrames={enterState.durationInFrames}
        onElementImage={canvas.onElementImage}
        bothEnteringAndExiting={Boolean(exit)}
      >
        {presented}
      </Presented>
    );
  }
  if (exit && exitState) {
    presented = (
      <Presented
        presentation={exit.presentation}
        direction="exiting"
        progress={exitState.progress}
        durationInFrames={exitState.durationInFrames}
        onElementImage={canvas.onElementImage}
        bothEnteringAndExiting={Boolean(enter)}
      >
        {presented}
      </Presented>
    );
  }
  const data: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(rootData)) data[`data-${key}`] = value;
  return (
    <div
      ref={rootRef}
      className={className ? `${rootClassName} ${className}` : rootClassName}
      {...data}
      data-font-origin={gate.origin ?? undefined}
      style={buildRootStyle(lineHeight, style)}
    >
      {presented}
    </div>
  );
};

/** The frame's type size: the frame spans the widest line of the mushaf at the page's type size. */
export const frameFontSize = (def: MushafDefinition, fontSize: number): number => {
  const frame = def.glyphs.headerFrame;
  const frameEm = frame.advance / def.sharedFonts.common.metrics.unitsPerEm;
  const measureEm = def.metrics.referenceLineWidth / def.metrics.unitsPerEm;
  return (fontSize * measureEm) / frameEm;
};

/** The glyphs of a surah header: the frame (unless `framed` is false) with the name over it. */
export const surahHeaderItems = (
  def: MushafDefinition,
  surah: number,
  fontSize: number,
  framed: boolean,
): GlyphItem[] => [
  ...(framed
    ? [{glyph: def.glyphs.headerFrame, fontSize: frameFontSize(def, fontSize), align: 'center' as const}]
    : []),
  {glyph: def.glyphs.surahName(surah), fontSize, align: 'center'},
];

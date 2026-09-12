import type * as React from 'react';
import {useMemo, useRef} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {getEnterState, getExitState, normaliseAnimation} from '../animation/animation-state';
import {MushafError} from '../errors';
import {resolveSelection} from '../mushaf/registry';
import {resolveSlice} from '../resolve/slice';
import type {MushafLineCommonProps, MushafLineData} from '../types';
import {useCanvasGuard} from './hooks/use-canvas-guard';
import {useFontGate} from './hooks/use-font-gate';
import {useLineFit} from './hooks/use-line-fit';
import {usePaletteRule} from './hooks/use-palette-rule';
import {LineContext, type LineContextValue} from './LineContext';
import {Presented} from './Presented';
import {assertSize, buildRootStyle, buildRowStyle, fontSizeForWidth, lineHeightForFontSize} from './styles';
import {Word} from './Word';

/** The common props with `undefined` allowed, so `<MushafLine>` can forward them as they are. */
export type LineRendererProps = {
  readonly [K in keyof Omit<MushafLineCommonProps, 'name'>]: MushafLineCommonProps[K] | undefined;
} & {
  readonly line: MushafLineData;
};

/**
 * Renders a resolved line. The hooks own the four things that must be true before the first paint
 * (font loaded, line fitted to its box, palette rules in the document, no canvas presentation);
 * this component assembles the row, the presentations and the root. Hooks are all above the early
 * throws so the hook order is stable; the parent keys this component by mushaf/font set/page/line.
 */
export const LineRenderer: React.FC<LineRendererProps> = ({
  line,
  enter: enterProp,
  exit: exitProp,
  fit = 'line',
  slice,
  fontSize,
  lineHeight,
  style,
  className,
  activeWordId,
  activeWordStyle,
  wordStyle,
  wordClassName,
}) => {
  const enter = normaliseAnimation('enter', enterProp);
  const exit = normaliseAnimation('exit', exitProp);
  // The data was validated by <MushafLine>; this only rebuilds the resolved theme, once per line.
  const {fontSet, theme} = useMemo(
    () => resolveSelection({mushaf: line.mushaf, theme: line.theme}),
    [line.mushaf, line.theme],
  );
  const {width, fps, durationInFrames} = useVideoConfig(); // honours <Sequence width>; durationInFrames is the Sequence's
  const frame = useCurrentFrame(); // local to the enclosing <Sequence from>; 0 while premounted
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const font = useFontGate(line, fontSet);
  const canvas = useCanvasGuard({hasPresentation: Boolean(enter || exit), rootRef, rowRef});
  const baseFontSize = fontSize ?? fontSizeForWidth(width, line.mushaf);
  const resolvedLineHeight = lineHeight ?? lineHeightForFontSize(baseFontSize);
  // Centred lines are short as printed and never fitted.
  const fitScale = useLineFit({
    enabled: fit === 'line' && !line.centered,
    fontLoaded: font.loaded,
    fitKey: `${line.fontFamily}/${baseFontSize}/${Math.round(width)}`,
    rowRef,
  });
  const palettes = usePaletteRule(line.fontFamily, theme, rowRef);

  const resolvedFontSize = fitScale === null ? baseFontSize : baseFontSize * fitScale;

  // The slice: which words are painted. It is applied exactly on the commits where the fit is already
  // known — which are exactly the commits the fit effect does not measure on — so the measured width
  // is always the whole line's, a slice never changes the type size, and `fitKey` needs no slice
  // term: a slice can change on every frame without a re-measure. The hidden words take no space
  // and the row centres the ones that remain (see buildRowStyle).
  const requested = useMemo(() => resolveSlice(line, slice === undefined ? line.slice : slice), [line, slice]);
  const resolvedSlice = fitScale === null ? null : requested;

  // Nothing is painted before the line is in its page font, at its final size and in its palette.
  const ready = font.loaded && fitScale !== null && palettes !== null;
  const ctx = useMemo<LineContextValue>(
    () => ({
      line,
      fontSize: resolvedFontSize,
      lineHeight: resolvedLineHeight,
      ready,
      frame,
      fps,
      markerPalette: palettes?.marker,
      activeWordId,
      activeWordStyle,
      wordStyle,
      wordClassName,
      slice: resolvedSlice,
    }),
    [
      line,
      resolvedFontSize,
      resolvedLineHeight,
      ready,
      frame,
      fps,
      palettes,
      activeWordId,
      activeWordStyle,
      wordStyle,
      wordClassName,
      resolvedSlice,
    ],
  );

  // ---- hooks done; validation and throws below ----
  if (canvas.error) throw canvas.error;
  if (font.error) throw font.error;
  if (line.type !== 'ayah') {
    throw new MushafError(
      'UNSUPPORTED_LINE_TYPE',
      `Page ${line.page} line ${line.line} of "${line.mushaf}" is a "${line.type}" line; this version renders "ayah" lines only. Skip lines where line.type !== 'ayah' or draw your own header.`,
      {mushaf: line.mushaf, page: line.page, line: line.line, type: line.type},
    );
  }
  assertSize('fontSize', resolvedFontSize);
  assertSize('lineHeight', resolvedLineHeight);
  const enterState = enter ? getEnterState({enter, frame, fps}) : null;
  const exitState = exit ? getExitState({exit, frame, fps, durationInFrames}) : null;

  const row = (
    <div
      ref={rowRef}
      className="mushaf-line__row"
      style={buildRowStyle({
        fontFamily: line.fontFamily,
        fontSize: resolvedFontSize,
        lineHeight: resolvedLineHeight,
        centered: line.centered,
        visible: ready,
        sliced: resolvedSlice !== null,
        ...(palettes ? {fontPalette: palettes.row} : {}),
      })}
    >
      {line.words.map((word) => (
        <Word key={word.wordId} word={word} /> // a marker glyph can share the location (`id`) of its word
      ))}
    </div>
  );
  // Nested exactly as <TransitionSeries> nests a scene that both enters and exits: the exiting
  // presentation wraps the entering one.
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

  return (
    <LineContext.Provider value={ctx}>
      <div
        ref={rootRef}
        className={className ? `mushaf-line ${className}` : 'mushaf-line'}
        data-mushaf={line.mushaf}
        data-theme={typeof line.theme === 'string' ? line.theme : 'custom'}
        data-page={line.page}
        data-line={line.line}
        data-line-type={line.type}
        data-centered={line.centered ? 'true' : 'false'}
        data-sliced={
          resolvedSlice === null
            ? undefined
            : resolvedSlice === 'empty'
              ? 'empty'
              : `${resolvedSlice.first}-${resolvedSlice.last}`
        }
        style={buildRootStyle(resolvedLineHeight, style)}
      >
        {presented}
      </div>
    </LineContext.Provider>
  );
};

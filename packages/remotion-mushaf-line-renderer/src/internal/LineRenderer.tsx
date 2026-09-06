import * as React from 'react';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {useCurrentFrame, useDelayRender, useRemotionEnvironment, useVideoConfig} from 'remotion';
import {getEnterState, getExitState, normaliseAnimation} from '../enter-state';
import {MushafError} from '../errors';
import {fontKey, getFontEntry, getFontStatus, subscribeFontStore, type FontStatus} from '../font-store';
import {assertSize, buildRootStyle, buildRowStyle, fontSizeForWidth, lineHeightForFontSize} from '../layout';
import {loadPageFont} from '../load-page-font';
import {getMushafDefinition} from '../mushafs';
import {CURRENT_COLOR, entryColors} from '../colors';
import {registerPalette} from '../palette-store';
import type {MushafLineAnimationProp, MushafLineCommonProps, MushafLineData} from '../types';
import {LineContext, type LineContextValue} from './LineContext';
import {Presented, type OnElementImage} from './Presented';
import {Word} from './Word';

export type LineRendererProps = {
  readonly line: MushafLineData;
  readonly enter: MushafLineAnimationProp | undefined;
  readonly exit: MushafLineAnimationProp | undefined;
  readonly fit: MushafLineCommonProps['fit'];
  readonly fontSize: number | undefined;
  readonly lineHeight: number | undefined;
  readonly style: React.CSSProperties | undefined;
  readonly className: string | undefined;
  readonly activeWordId: MushafLineCommonProps['activeWordId'];
  readonly activeWordStyle: MushafLineCommonProps['activeWordStyle'];
  readonly wordStyle: MushafLineCommonProps['wordStyle'];
  readonly wordClassName: MushafLineCommonProps['wordClassName'];
};

const serverSnapshot = (): FontStatus => 'idle';
// useLayoutEffect warns during server rendering; nothing here has a DOM to inspect there anyway.
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

const CANVAS_PRESENTATIONS = 'dissolve, ripple, crosswarp, crossZoom, swap, bookFlip, zoomBlur, dreamyZoom, filmBurn, linearBlur, zoomInOut';
const DOM_PRESENTATIONS = 'fade(), slide(), wipe(), flip(), clockWipe({width, height}), iris({width, height}), pushCut(), none() or revealRtl()';

const canvasPresentationError = () =>
  new MushafError(
    'CANVAS_PRESENTATION',
    `This presentation captures the scene to a canvas (${CANVAS_PRESENTATIONS}) and needs an exiting scene, so it cannot animate a single entrance. Use ${DOM_PRESENTATIONS}.`,
  );

/**
 * Renders a resolved line: owns font gating (nothing is painted before the page font is in
 * document.fonts) and the entrance animation. Hooks are all above the early returns so the hook
 * order is stable; the parent keys this component by mushaf/page/line.
 */
export const LineRenderer: React.FC<LineRendererProps> = ({
  line,
  enter: enterProp,
  exit: exitProp,
  fit = 'line',
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
  const def = getMushafDefinition(line.mushaf);
  const {width, fps, durationInFrames} = useVideoConfig(); // honours <Sequence width>; durationInFrames is the Sequence's
  const frame = useCurrentFrame(); // local to the enclosing <Sequence from>; 0 while premounted
  const env = useRemotionEnvironment();
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const key = fontKey(line.mushaf, line.page);
  const status = useSyncExternalStore(subscribeFontStore, () => getFontStatus(key), serverSnapshot);

  // The handle is created during render (the documented `useState(() => delayRender())` timing) so it
  // is registered before Remotion releases its own frame handle; it is released in an effect only
  // after the visible row has committed, and on unmount.
  const fontHandle = useRef<number | null>(null);
  if (status !== 'loaded' && status !== 'error' && fontHandle.current === null) {
    fontHandle.current = delayRender(`<MushafLine> page ${line.page} line ${line.line}: waiting for font ${line.fontFamily} (${line.fontUrl ?? def.fontUrl(line.page)})`, {retries: 1});
  }
  useEffect(() => {
    if (status === 'loaded' && fontHandle.current !== null) {
      continueRender(fontHandle.current);
      fontHandle.current = null;
    }
  }, [status, continueRender]);
  useEffect(
    () => () => {
      if (fontHandle.current !== null) {
        continueRender(fontHandle.current);
        fontHandle.current = null;
      }
    },
    [continueRender],
  );
  useEffect(() => {
    // Render stays pure: the (idempotent) load starts in an effect. `line.fontUrl` is an explicit source.
    loadPageFont(line.fontUrl === undefined ? {mushaf: line.mushaf, page: line.page} : {mushaf: line.mushaf, page: line.page, url: line.fontUrl});
  }, [key, line.mushaf, line.page, line.fontUrl]);

  const [presentationError, setPresentationError] = useState<MushafError | null>(null);
  const isRendering = env.isRendering;
  const rejectCanvasPresentation = useCallback(() => {
    // Record the error and throw it from the next render; when rendering, cancel right away.
    const err = canvasPresentationError();
    setPresentationError((current) => current ?? err);
    if (isRendering) {
      try {
        cancelRender(err);
      } catch {
        // cancelRender throws by design; the cancellation flag is set.
      }
    }
  }, [isRendering, cancelRender]);
  // HTML-in-canvas presentations call this from a DOM paint listener, where a throw would never
  // reach React.
  const onElementImage = useCallback<OnElementImage>(() => rejectCanvasPresentation(), [rejectCanvasPresentation]);
  // ... and, whether or not the browser fires paint events for them, they mount the line inside a
  // <canvas>. Checked before the first paint so no frame is ever captured with a blank canvas.
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const enterComponent = enter?.presentation.component;
  const exitComponent = exit?.presentation.component;
  useIsomorphicLayoutEffect(() => {
    if ((!enterComponent && !exitComponent) || presentationError) return;
    const root = rootRef.current;
    for (let node = rowRef.current?.parentElement ?? null; node && node !== root; node = node.parentElement) {
      if (node.tagName === 'CANVAS') {
        rejectCanvasPresentation();
        return;
      }
    }
  }, [enterComponent, exitComponent, presentationError, rejectCanvasPresentation]);

  const baseFontSize = fontSize ?? fontSizeForWidth(width, line.mushaf);
  const resolvedLineHeight = lineHeight ?? lineHeightForFontSize(baseFontSize);
  const fontLoaded = status === 'loaded';

  // Fitting a justified line to its box. The lines of the mushaf are not all equally wide, so a
  // single type size cannot make each one reach the margin; the page font's own advances must not be
  // stretched either (that is what inflates the word gaps). So the row is laid out at the base size
  // and then scaled by (box width / natural width), measured once per font+size from the word
  // elements themselves. Centred lines are exempt: they are short as printed.
  const fits = fit === 'line' && !line.centered;
  const fitKey = `${line.fontFamily}/${baseFontSize}/${Math.round(width)}`;
  const [fitted, setFitted] = useState<{key: string; scale: number} | null>(null);
  const fitScale = fits ? (fitted?.key === fitKey ? fitted.scale : null) : 1;
  useIsomorphicLayoutEffect(() => {
    if (!fits || !fontLoaded || fitted?.key === fitKey) return;
    const row = rowRef.current;
    if (!row) return;
    // Each word element is shrink-to-fit around its glyphs, so the sum of their widths is the line's
    // advance width. (`scrollWidth` cannot be used: it never reports less than the box.)
    let natural = 0;
    for (const child of Array.from(row.children)) natural += child.getBoundingClientRect().width;
    const box = row.getBoundingClientRect().width;
    // Where there is no layout to measure (jsdom, a zero-width box), the base size stands: the line
    // is still painted, just not fitted. The clamp is a guard against a pathological measurement,
    // not a design tolerance — real lines land within a few per cent of the base size.
    const scale = natural > 0 && box > 0 ? Math.min(2, Math.max(0.5, box / natural)) : 1;
    setFitted({key: fitKey, scale});
  }, [fits, fontLoaded, fitKey, fitted]);

  // The colour font's palette. The rule that names it has to be in the document before the row is
  // painted, and `currentColor` has to be resolved from the row's computed colour first (COLR glyphs
  // ignore CSS `color`, and Chromium drops `currentColor` inside `override-colors`), so both happen
  // in a layout effect — before the browser paints, with the row still hidden.
  const paletteKey = line.palette === undefined && line.paletteColors === undefined ? null : `${line.fontFamily}/${line.palette ?? 0}/${JSON.stringify(line.paletteColors ?? {})}`;
  const [registered, setRegistered] = useState<{key: string; ident: string} | null>(null);
  const paletteIdent = paletteKey === null ? undefined : registered?.key === paletteKey ? registered.ident : null;
  useIsomorphicLayoutEffect(() => {
    if (paletteKey === null || registered?.key === paletteKey) return;
    const row = rowRef.current;
    const inherited = row && typeof getComputedStyle === 'function' ? getComputedStyle(row).color : '';
    const entries = entryColors(def, line.paletteColors ?? {})
      // Where the inherited colour cannot be read, the entry is left out and the palette's own
      // colour stands, rather than guessing one.
      .map(([entry, color]) => [entry, color === CURRENT_COLOR ? inherited : color] as const)
      .filter((pair): pair is readonly [number, string] => pair[1] !== '');
    setRegistered({key: paletteKey, ident: registerPalette(line.fontFamily, line.palette ?? 0, entries)});
  }, [paletteKey, registered, def, line.fontFamily, line.palette, line.paletteColors]);

  const resolvedFontSize = fitScale === null ? baseFontSize : baseFontSize * fitScale;
  // Nothing is painted before the line is in its page font, at its final size and in its palette.
  const ready = fontLoaded && fitScale !== null && paletteIdent !== null;
  const ctx = useMemo<LineContextValue>(
    () => ({line, fontSize: resolvedFontSize, lineHeight: resolvedLineHeight, ready, frame, fps, activeWordId, activeWordStyle, wordStyle, wordClassName}),
    [line, resolvedFontSize, resolvedLineHeight, ready, frame, fps, activeWordId, activeWordStyle, wordStyle, wordClassName],
  );

  // ---- hooks done; validation and throws below ----
  if (presentationError) throw presentationError;
  if (status === 'error') {
    throw getFontEntry(key)?.error ?? new MushafError('FONT_NETWORK', `Font ${line.fontFamily} failed to load.`);
  }
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
        ...(paletteIdent ? {fontPalette: paletteIdent} : {}),
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
      <Presented presentation={enter.presentation} direction="entering" progress={enterState.progress} durationInFrames={enterState.durationInFrames} onElementImage={onElementImage} bothEnteringAndExiting={Boolean(exit)}>
        {presented}
      </Presented>
    );
  }
  if (exit && exitState) {
    presented = (
      <Presented presentation={exit.presentation} direction="exiting" progress={exitState.progress} durationInFrames={exitState.durationInFrames} onElementImage={onElementImage} bothEnteringAndExiting={Boolean(enter)}>
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
        data-page={line.page}
        data-line={line.line}
        data-line-type={line.type}
        data-centered={line.centered ? 'true' : 'false'}
        style={buildRootStyle(resolvedLineHeight, style)}
      >
        {presented}
      </div>
    </LineContext.Provider>
  );
};

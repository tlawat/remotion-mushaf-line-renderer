import * as React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {useCurrentFrame, useDelayRender, useRemotionEnvironment, useVideoConfig} from 'remotion';
import {getEnterState} from '../enter-state';
import {MushafError} from '../errors';
import {fontKey, getFontEntry, getFontStatus, subscribeFontStore, type FontStatus} from '../font-store';
import {assertSize, buildRootStyle, buildRowStyle, defaultLineHeight, fontSizeForWidth} from '../layout';
import {loadPageFont} from '../load-page-font';
import {getMushafDefinition} from '../mushafs';
import type {MushafLineAnimation, MushafLineData} from '../types';
import {LineContext, type LineContextValue} from './LineContext';
import {Presented, type OnElementImage} from './Presented';
import {Word} from './Word';

export type LineRendererProps = {
  readonly line: MushafLineData;
  readonly enter: MushafLineAnimation | undefined;
  readonly fontSize: number | undefined;
  readonly lineHeight: number | undefined;
  readonly style: React.CSSProperties | undefined;
  readonly className: string | undefined;
};

const serverSnapshot = (): FontStatus => 'idle';

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
export const LineRenderer: React.FC<LineRendererProps> = ({line, enter, fontSize, lineHeight, style, className}) => {
  const def = getMushafDefinition(line.mushaf);
  const {width, fps} = useVideoConfig(); // honours <Sequence width>
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
  const onElementImage = useCallback<OnElementImage>(() => {
    // Only HTML-in-canvas presentations call this, from a DOM paint listener where a throw would
    // never reach React. Record it and throw from the next render; cancel the render right away.
    const err = canvasPresentationError();
    setPresentationError(err);
    if (isRendering) {
      try {
        cancelRender(err);
      } catch {
        // cancelRender throws by design; the cancellation flag is set.
      }
    }
  }, [isRendering, cancelRender]);

  const resolvedFontSize = fontSize ?? fontSizeForWidth(width, def);
  const resolvedLineHeight = lineHeight ?? defaultLineHeight(resolvedFontSize);
  const ready = status === 'loaded';
  const ctx = useMemo<LineContextValue>(() => ({line, fontSize: resolvedFontSize, lineHeight: resolvedLineHeight, ready, frame, fps}), [line, resolvedFontSize, resolvedLineHeight, ready, frame, fps]);

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

  const row = (
    <div className="mushaf-line__row" style={buildRowStyle({fontFamily: line.fontFamily, fontSize: resolvedFontSize, lineHeight: resolvedLineHeight, centered: line.centered, visible: ready})}>
      {line.words.map((word) => (
        <Word key={word.id} word={word} />
      ))}
    </div>
  );

  return (
    <LineContext.Provider value={ctx}>
      <div
        className={className ? `mushaf-line ${className}` : 'mushaf-line'}
        data-mushaf={line.mushaf}
        data-page={line.page}
        data-line={line.line}
        data-line-type={line.type}
        data-centered={line.centered ? 'true' : 'false'}
        style={buildRootStyle(resolvedLineHeight, style)}
      >
        {enterState && enter ? (
          <Presented presentation={enter.presentation} direction="entering" progress={enterState.progress} durationInFrames={enterState.durationInFrames} onElementImage={onElementImage}>
            {row}
          </Presented>
        ) : (
          row
        )}
      </div>
    </LineContext.Provider>
  );
};

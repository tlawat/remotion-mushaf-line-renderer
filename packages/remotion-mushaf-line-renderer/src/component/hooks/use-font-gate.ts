import {useEffect, useRef, useSyncExternalStore} from 'react';
import {useDelayRender} from 'remotion';
import type {MushafError} from '../../errors';
import {planFontSource} from '../../fonts/font-source';
import {type FontStatus, getFontEntry, getFontStatus, subscribeFontStore} from '../../fonts/font-store';
import {loadPageFont} from '../../fonts/load-page-font';
import {type FontSetDefinition, getMushafDefinition} from '../../mushaf/registry';
import type {MushafFontFallback, MushafFontOrigin, MushafFontSrc, MushafLineData} from '../../types';

const serverSnapshot = (): FontStatus => 'idle';

export type FontGate = {
  /** `true` once the page font is in `document.fonts`; the row stays hidden until then. */
  readonly loaded: boolean;
  /** The loader's error, to be thrown from render. */
  readonly error: MushafError | null;
  /** The family the face is registered under for this line's source: paint with this one. */
  readonly fontFamily: string;
  /** Where the loaded face came from; `null` until loaded. */
  readonly origin: MushafFontOrigin | null;
};

export type FontGateOptions = {
  readonly line: MushafLineData;
  readonly fontSet: FontSetDefinition;
  readonly fontSrc: MushafFontSrc | undefined;
  readonly fontFallback: MushafFontFallback | undefined;
};

/**
 * Keeps the line from painting before its page font is loaded, and keeps the render waiting for it.
 *
 * The source is planned during render, so a bad `fontSrc` / `fontFallback` throws where the caller
 * sees it; the store key, not the identity of the props, decides when a new load starts, so an
 * inline resolver or array does not reload the font. The `delayRender()` handle is created during
 * render (the documented `useState(() => delayRender())` timing) so it is registered before
 * Remotion releases its own frame handle; it is released in an effect only after the visible row
 * has committed, and on unmount. The (idempotent) font load starts in an effect so render stays pure.
 */
export const useFontGate = ({line, fontSet, fontSrc, fontFallback}: FontGateOptions): FontGate => {
  const {delayRender, continueRender} = useDelayRender();
  const plan = planFontSource(getMushafDefinition(line.mushaf), fontSet, line.page, fontSrc, fontFallback);
  const {key} = plan;
  const status = useSyncExternalStore(subscribeFontStore, () => getFontStatus(key), serverSnapshot);

  const handle = useRef<number | null>(null);
  if (status !== 'loaded' && status !== 'error' && handle.current === null) {
    handle.current = delayRender(
      `<MushafLine> page ${line.page} line ${line.line}: waiting for font ${plan.fontFamily} (${plan.describe})`,
      {retries: 1},
    );
  }
  useEffect(() => {
    if (status === 'loaded' && handle.current !== null) {
      continueRender(handle.current);
      handle.current = null;
    }
  }, [status, continueRender]);
  useEffect(
    () => () => {
      if (handle.current !== null) {
        continueRender(handle.current);
        handle.current = null;
      }
    },
    [continueRender],
  );
  // The latest props, read by the effect that runs when the key changes.
  const sources = useRef({fontSrc, fontFallback});
  sources.current = {fontSrc, fontFallback};
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the sources it was planned from.
  useEffect(() => {
    loadPageFont({
      mushaf: line.mushaf,
      theme: line.theme,
      page: line.page,
      fontSrc: sources.current.fontSrc,
      fallback: sources.current.fontFallback,
    });
  }, [key, line.mushaf, line.theme, line.page]);

  const entry = getFontEntry(key);
  return {
    loaded: status === 'loaded',
    error: status === 'error' ? (entry?.error ?? null) : null,
    fontFamily: plan.fontFamily,
    origin: status === 'loaded' ? (entry?.origin ?? null) : null,
  };
};

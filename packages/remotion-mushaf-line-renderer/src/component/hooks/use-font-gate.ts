import {useEffect, useRef, useSyncExternalStore} from 'react';
import {useDelayRender} from 'remotion';
import type {MushafError} from '../../errors';
import {type FontStatus, fontKey, getFontEntry, getFontStatus, subscribeFontStore} from '../../fonts/font-store';
import {loadPageFont} from '../../fonts/load-page-font';
import type {FontSetDefinition} from '../../mushaf/registry';
import type {MushafLineData} from '../../types';

const serverSnapshot = (): FontStatus => 'idle';

export type FontGate = {
  /** `true` once the page font is in `document.fonts`; the row stays hidden until then. */
  readonly loaded: boolean;
  /** The loader's error, to be thrown from render. */
  readonly error: MushafError | null;
};

/**
 * Keeps the line from painting before its page font is loaded, and keeps the render waiting for it.
 *
 * The `delayRender()` handle is created during render (the documented `useState(() => delayRender())`
 * timing) so it is registered before Remotion releases its own frame handle; it is released in an
 * effect only after the visible row has committed, and on unmount. The (idempotent) font load
 * starts in an effect so render stays pure; `line.fontUrl` is an explicit source.
 */
export const useFontGate = (line: MushafLineData, fontSet: FontSetDefinition): FontGate => {
  const {delayRender, continueRender} = useDelayRender();
  const key = fontKey(line.fontSet, line.page);
  const status = useSyncExternalStore(subscribeFontStore, () => getFontStatus(key), serverSnapshot);

  const handle = useRef<number | null>(null);
  if (status !== 'loaded' && status !== 'error' && handle.current === null) {
    handle.current = delayRender(
      `<MushafLine> page ${line.page} line ${line.line}: waiting for font ${line.fontFamily} (${line.fontUrl ?? fontSet.fontUrl(line.page)})`,
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
  useEffect(() => {
    loadPageFont({
      mushaf: line.mushaf,
      theme: line.theme,
      page: line.page,
      ...(line.fontUrl === undefined ? {} : {url: line.fontUrl}),
    });
  }, [line.mushaf, line.theme, line.page, line.fontUrl]);

  return {loaded: status === 'loaded', error: status === 'error' ? (getFontEntry(key)?.error ?? null) : null};
};

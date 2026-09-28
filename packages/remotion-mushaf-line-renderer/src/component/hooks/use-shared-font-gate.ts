import {useEffect, useRef, useSyncExternalStore} from 'react';
import {useDelayRender} from 'remotion';
import type {MushafError} from '../../errors';
import {sharedFontTarget} from '../../fonts/font-file';
import {planFontSource} from '../../fonts/font-source';
import {getFontEntry, getFontStatus, subscribeFontStore} from '../../fonts/font-store';
import {loadSharedFont} from '../../fonts/load-page-font';
import type {MushafDefinition, SharedFontDefinition} from '../../mushaf/registry';
import type {MushafFontFallback, MushafFontOrigin, MushafFontSrc, MushafSharedFont} from '../../types';

const serverSnapshot = (): string => '';

export type SharedFontGate = {
  /** `true` once every font asked for is in `document.fonts`; the glyphs stay hidden until then. */
  readonly loaded: boolean;
  /** The first loader error, to be thrown from render. */
  readonly error: MushafError | null;
  /** By font id, the family each face is registered under for this source: paint with these. */
  readonly families: Readonly<Record<string, string>>;
  /** Where the first font came from; `null` until every font has loaded. */
  readonly origin: MushafFontOrigin | null;
};

export type SharedFontGateOptions = {
  readonly def: MushafDefinition;
  /** The shared fonts the glyphs need, first the one that names the element in `data-font-origin`. */
  readonly fonts: readonly SharedFontDefinition[];
  readonly fontSrc: MushafFontSrc | undefined;
  readonly fontFallback: MushafFontFallback | undefined;
  /** For the delayRender label: `<MushafLine> page 187 line 1`. */
  readonly label: string;
};

/**
 * `useFontGate` for the shared fonts: keeps a surah name, a basmalah or a juz name from painting
 * before its font (or fonts: the framed header needs two) is loaded, and keeps the render waiting
 * for it. Same shape and timing as the page-font gate: sources are planned during render so a bad
 * `fontSrc` throws where the caller sees it, the `delayRender()` handle is taken during render and
 * released after the visible commit, and the idempotent loads start in an effect.
 */
export const useSharedFontGate = ({
  def,
  fonts,
  fontSrc,
  fontFallback,
  label,
}: SharedFontGateOptions): SharedFontGate => {
  const {delayRender, continueRender} = useDelayRender();
  const plans = fonts.map((font) => planFontSource(def, sharedFontTarget(def, font), fontSrc, fontFallback));
  const keys = plans.map((p) => p.key).join('\n');
  const statusText = useSyncExternalStore(
    subscribeFontStore,
    () => plans.map((p) => getFontStatus(p.key)).join(','),
    serverSnapshot,
  );
  const statuses = statusText === '' ? [] : statusText.split(',');
  const loaded = statuses.length === plans.length && statuses.every((s) => s === 'loaded');
  const failedAt = statuses.indexOf('error');

  const handle = useRef<number | null>(null);
  if (!loaded && failedAt < 0 && handle.current === null) {
    handle.current = delayRender(
      `${label}: waiting for font${fonts.length > 1 ? 's' : ''} ${plans.map((p) => `${p.fontFamily} (${p.describe})`).join(', ')}`,
      {retries: 1},
    );
  }
  useEffect(() => {
    if (loaded && handle.current !== null) {
      continueRender(handle.current);
      handle.current = null;
    }
  }, [loaded, continueRender]);
  useEffect(
    () => () => {
      if (handle.current !== null) {
        continueRender(handle.current);
        handle.current = null;
      }
    },
    [continueRender],
  );
  // The latest props, read by the effect that runs when the keys change.
  const sources = useRef({fontSrc, fontFallback});
  sources.current = {fontSrc, fontFallback};
  const ids = fonts.map((f) => f.id).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `keys` stands for the sources the plans were made from.
  useEffect(() => {
    for (const font of ids.split(',') as MushafSharedFont[]) {
      loadSharedFont({
        mushaf: def.id,
        font,
        fontSrc: sources.current.fontSrc,
        fallback: sources.current.fontFallback,
      });
    }
  }, [keys, ids, def.id]);

  const first = plans[0] ? getFontEntry(plans[0].key) : null;
  return {
    loaded,
    error: failedAt < 0 ? null : (getFontEntry(plans[failedAt]!.key)?.error ?? null),
    families: Object.fromEntries(fonts.map((font, i) => [font.id, plans[i]!.fontFamily])),
    origin: loaded ? (first?.origin ?? null) : null,
  };
};

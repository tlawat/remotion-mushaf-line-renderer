import {MushafError} from '@tlawat/remotion-mushaf-line';
import {useEffect, useRef, useSyncExternalStore} from 'react';
import {useDelayRender} from 'remotion';
import {describeValue, MushafStudioError} from '../errors';
import type {QuranTextScript} from './text';

/** The Unicode Quran fonts `<MushafAyahText>` sets its text in. */
export const UNICODE_FONT_IDS = ['uthmani-hafs'] as const;

export type UnicodeFontId = (typeof UNICODE_FONT_IDS)[number];

export type UnicodeFontDefinition = {
  readonly id: UnicodeFontId;
  /** Its entry in `QUL_FONTS` (resource page, formats, notes). */
  readonly qulFont: string;
  /** The script its glyphs are drawn for: a text file in another script is refused. */
  readonly script: QuranTextScript;
  /** The CSS family the face is registered under when loaded from `url`. */
  readonly family: string;
  /** QUL's public CDN URL (CORS-open). */
  readonly url: string;
  /** The `format()` hint of the face's `src`. */
  readonly format: 'truetype' | 'opentype' | 'woff' | 'woff2';
  /** The face's `unicode-range`; unset: every code point the font has. */
  readonly unicodeRange?: string;
};

/**
 * QUL's Unicode Quran fonts, by id. `uthmani-hafs` is the KFGQPC Uthmanic Hafs font (QUL resource
 * 245), the one quran.com sets `text_uthmani` in; its URL is `QUL_FONTS`' `uthmanic-hafs` entry.
 */
export const UNICODE_FONTS: Readonly<Record<UnicodeFontId, UnicodeFontDefinition>> = {
  'uthmani-hafs': {
    id: 'uthmani-hafs',
    qulFont: 'uthmanic-hafs',
    script: 'uthmani',
    family: 'mushaf-uthmanic-hafs',
    url: 'https://static-cdn.tarteel.ai/qul/fonts/UthmanicHafs_V22.ttf',
    format: 'truetype',
  },
};

/** The font for an id; `BAD_STUDIO_PROP` naming the ids for anything else. */
export const unicodeFontOf = (id: UnicodeFontId): UnicodeFontDefinition => {
  const font = (UNICODE_FONTS as Readonly<Record<string, UnicodeFontDefinition>>)[id];
  if (!font) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `font is ${describeValue(id)}; expected one of ${UNICODE_FONT_IDS.join(', ')}.`,
      {prop: 'font', font: id},
    );
  }
  return font;
};

type FontStatus = 'idle' | 'loading' | 'loaded' | 'error';

type FontLoad = {status: Exclude<FontStatus, 'idle'>; readonly done: Promise<void>};

type Store = {readonly loads: Map<string, FontLoad>; readonly listeners: Set<() => void>};

// On globalThis so Studio fast-refresh, several instances and duplicate package copies share one
// load per family: a family must map to exactly one FontFace in document.fonts.
const STORE_KEY = Symbol.for('@tlawat/mushaf-studio/unicode-fonts@1');

const getStore = (): Store => {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  let store = g[STORE_KEY];
  if (!store) {
    store = {loads: new Map(), listeners: new Set()};
    g[STORE_KEY] = store;
  }
  return store;
};

const subscribe = (listener: () => void): (() => void) => {
  const {listeners} = getStore();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notify = (): void => {
  for (const listener of getStore().listeners) listener();
};

const statusOf = (family: string): FontStatus => getStore().loads.get(family)?.status ?? 'idle';

/** Test hook: forget every load and listener. */
export const resetUnicodeFonts = (): void => {
  const store = getStore();
  store.loads.clear();
  store.listeners.clear();
};

/** FNV-1a, base 36: a short, stable suffix that tells two sources of one font apart. */
const hash = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};

/**
 * The family a source of a font is registered under: the font's own for QUL's URL, the same with a
 * hash of the URL for any other, so a `fontSrc` never competes with the CDN face for one name.
 */
export const unicodeFontFamily = (font: UnicodeFontDefinition, url: string): string =>
  url === font.url ? font.family : `${font.family}-${hash(url)}`;

const canRegisterFonts = (): boolean =>
  typeof document !== 'undefined' && typeof FontFace !== 'undefined' && document.fonts !== undefined;

/**
 * Registers the face once per family and settles when it is in `document.fonts`; a failed load is
 * a `FONT_NETWORK` naming the URL, and the next call tries again.
 */
const loadFont = (font: UnicodeFontDefinition, url: string, family: string): Promise<void> => {
  const {loads} = getStore();
  const existing = loads.get(family);
  if (existing && existing.status !== 'error') return existing.done;
  const load = async (): Promise<void> => {
    const descriptors: FontFaceDescriptors = font.unicodeRange === undefined ? {} : {unicodeRange: font.unicodeRange};
    const face = new FontFace(
      family,
      `url(${JSON.stringify(url)}) format(${JSON.stringify(font.format)})`,
      descriptors,
    );
    try {
      await face.load();
    } catch (cause) {
      throw new MushafError(
        'FONT_NETWORK',
        `Could not load the Unicode Quran font ${family} from ${url}: ${cause instanceof Error ? cause.message : String(cause)}. Check the URL and the network${url === font.url ? '' : `; QUL's CDN serves the font at ${font.url}`}.`,
        {font: font.id, family, url, cause},
      );
    }
    document.fonts.add(face);
  };
  const entry: FontLoad = {
    status: 'loading',
    done: load().then(
      () => {
        entry.status = 'loaded';
        notify();
      },
      (error: unknown) => {
        entry.status = 'error';
        notify();
        throw error;
      },
    ),
  };
  // Waited on by the hooks that started or joined the load; never an unhandled rejection.
  entry.done.catch(() => undefined);
  loads.set(family, entry);
  notify();
  return entry.done;
};

export type UnicodeFontState = {
  /** The CSS family to paint with. */
  readonly fontFamily: string;
  /** `true` once the face is in `document.fonts` (always on the server). */
  readonly ready: boolean;
};

const serverStatus = (): FontStatus => 'loaded';

/**
 * Loads a Unicode Quran font for a component and keeps the render waiting for it: the face is
 * registered once per family (shared through `globalThis` by every instance and across Studio
 * fast-refresh), from QUL's CDN or from `fontSrc` (e.g. `staticFile('fonts/UthmanicHafs_V22.ttf')`
 * for offline renders). A `delayRender('Loading <family>')` handle is taken during the first render
 * that finds the face missing and released once it is in `document.fonts`, or on unmount. A failed
 * load is `cancelRender()` with a `FONT_NETWORK` naming the URL, and the handle is kept: the renderer
 * checks for readiness before cancellation, so releasing it would let a frame through in a fallback
 * font. On the server, or without `document.fonts`, it reports ready with the family and waits for
 * nothing. Hooks run in the same order on every call.
 */
export const useUnicodeFont = (id: UnicodeFontId, fontSrc?: string | undefined): UnicodeFontState => {
  const font = unicodeFontOf(id);
  const url = fontSrc ?? font.url;
  const fontFamily = unicodeFontFamily(font, url);
  const client = canRegisterFonts();
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const status = useSyncExternalStore(subscribe, () => (client ? statusOf(fontFamily) : 'loaded'), serverStatus);

  // Taken during render, so it is registered before Remotion releases its own frame handle.
  const handle = useRef<number | null>(null);
  if (status !== 'loaded' && handle.current === null) handle.current = delayRender(`Loading ${fontFamily}`);

  useEffect(() => {
    if (!client) return;
    let current = true;
    loadFont(font, url, fontFamily)
      .catch((error: unknown) => {
        if (current) cancelRender(error);
      })
      // cancelRender() throws by design; the render is cancelled, nothing else to do here.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [client, font, url, fontFamily, cancelRender]);
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

  return {fontFamily, ready: status === 'loaded'};
};

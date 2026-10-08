import {MushafError} from '@tlawat/remotion-mushaf-line';
import {useEffect, useMemo, useRef, useSyncExternalStore} from 'react';
import {useDelayRender} from 'remotion';
import {describeValue, MushafStudioError} from '../errors';

/**
 * The writing systems the translations quran.com offers are set in, each with the web fonts that
 * cover it. `latin` covers Latin, Cyrillic, Greek and Vietnamese (both its families do); `arabic` is
 * Naskh for Arabic and the languages written like it (Sindhi, Pashto, Kurdish, Uyghur, ...);
 * `urdu` is Nastaliq; `persian` is Persian and Dari.
 */
export type ScriptId =
  | 'latin'
  | 'arabic'
  | 'urdu'
  | 'persian'
  | 'bengali'
  | 'devanagari'
  | 'tamil'
  | 'malayalam'
  | 'gujarati'
  | 'kannada'
  | 'telugu'
  | 'sinhala'
  | 'thai'
  | 'khmer'
  | 'ethiopic'
  | 'hebrew'
  | 'thaana'
  | 'georgian'
  | 'tifinagh'
  | 'cjk';

/** A script's web fonts: Google Fonts families, the first the default, and how text in it runs. */
export type ScriptFonts = {
  readonly script: ScriptId;
  readonly families: readonly string[];
  readonly direction: 'ltr' | 'rtl';
  /**
   * The Google Fonts subsets (named by the comment before each rule of its CSS: `arabic`, `latin`)
   * to pass to `useWebFont()` for this script; unset for `cjk`, whose CSS splits every weight into
   * about a hundred numbered faces: pass `text` there instead.
   */
  readonly subsets?: readonly string[];
};

const LATIN_SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'vietnamese'] as const;
const withLatin = (subset: string): readonly string[] => [subset, 'latin', 'latin-ext'];

/**
 * The web fonts per script. Every family is on Google Fonts (checked against its CSS2 API,
 * 2026-10): `Noto Serif` and `Lora` for Latin, `Noto Naskh Arabic` and `Amiri` for Arabic, `Noto
 * Nastaliq Urdu`, `Vazirmatn` for Persian, the Noto Sans family of each Indic, South-East Asian and
 * African script, and `Noto Sans SC` (Chinese), `Noto Sans JP` and `Noto Sans KR` for CJK.
 */
export const SCRIPT_FONTS: Readonly<Record<ScriptId, ScriptFonts>> = {
  latin: {script: 'latin', families: ['Noto Serif', 'Lora'], direction: 'ltr', subsets: LATIN_SUBSETS},
  arabic: {script: 'arabic', families: ['Noto Naskh Arabic', 'Amiri'], direction: 'rtl', subsets: withLatin('arabic')},
  urdu: {script: 'urdu', families: ['Noto Nastaliq Urdu'], direction: 'rtl', subsets: withLatin('arabic')},
  persian: {script: 'persian', families: ['Vazirmatn'], direction: 'rtl', subsets: withLatin('arabic')},
  bengali: {script: 'bengali', families: ['Noto Sans Bengali'], direction: 'ltr', subsets: withLatin('bengali')},
  devanagari: {
    script: 'devanagari',
    families: ['Noto Sans Devanagari'],
    direction: 'ltr',
    subsets: withLatin('devanagari'),
  },
  tamil: {script: 'tamil', families: ['Noto Sans Tamil'], direction: 'ltr', subsets: withLatin('tamil')},
  malayalam: {
    script: 'malayalam',
    families: ['Noto Sans Malayalam'],
    direction: 'ltr',
    subsets: withLatin('malayalam'),
  },
  gujarati: {script: 'gujarati', families: ['Noto Sans Gujarati'], direction: 'ltr', subsets: withLatin('gujarati')},
  kannada: {script: 'kannada', families: ['Noto Sans Kannada'], direction: 'ltr', subsets: withLatin('kannada')},
  telugu: {script: 'telugu', families: ['Noto Sans Telugu'], direction: 'ltr', subsets: withLatin('telugu')},
  sinhala: {script: 'sinhala', families: ['Noto Sans Sinhala'], direction: 'ltr', subsets: withLatin('sinhala')},
  thai: {script: 'thai', families: ['Noto Sans Thai'], direction: 'ltr', subsets: withLatin('thai')},
  khmer: {script: 'khmer', families: ['Noto Sans Khmer'], direction: 'ltr', subsets: withLatin('khmer')},
  ethiopic: {script: 'ethiopic', families: ['Noto Sans Ethiopic'], direction: 'ltr', subsets: withLatin('ethiopic')},
  hebrew: {script: 'hebrew', families: ['Noto Sans Hebrew'], direction: 'rtl', subsets: withLatin('hebrew')},
  thaana: {script: 'thaana', families: ['Noto Sans Thaana'], direction: 'rtl', subsets: withLatin('thaana')},
  georgian: {script: 'georgian', families: ['Noto Sans Georgian'], direction: 'ltr', subsets: withLatin('georgian')},
  tifinagh: {script: 'tifinagh', families: ['Noto Sans Tifinagh'], direction: 'ltr', subsets: withLatin('tifinagh')},
  cjk: {script: 'cjk', families: ['Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR'], direction: 'ltr'},
};

// The ISO codes of quran.com's languages (`GET /resources/languages`) that are not set in Latin or
// Cyrillic. quran.com's own `direction` says `ltr` for Kurdish and Divehi; their scripts (Sorani
// Arabic, Thaana) run right to left, and the script decides here.
const NON_LATIN: Readonly<Record<string, ScriptId>> = {
  ar: 'arabic',
  sd: 'arabic',
  ps: 'arabic',
  ku: 'arabic',
  ug: 'arabic',
  ks: 'arabic',
  ur: 'urdu',
  fa: 'persian',
  prs: 'persian',
  bn: 'bengali',
  as: 'bengali',
  hi: 'devanagari',
  mr: 'devanagari',
  ne: 'devanagari',
  ta: 'tamil',
  ml: 'malayalam',
  gu: 'gujarati',
  kn: 'kannada',
  te: 'telugu',
  si: 'sinhala',
  th: 'thai',
  km: 'khmer',
  am: 'ethiopic',
  he: 'hebrew',
  dv: 'thaana',
  ka: 'georgian',
  zgh: 'tifinagh',
  zh: 'cjk',
  ja: 'cjk',
  ko: 'cjk',
};

/**
 * The script a language is written in, by ISO 639 code (`'ur'` → `'urdu'`, `'zh-Hant'` →
 * `'cjk'`; the subtag after a `-` is ignored): every language quran.com offers translations in maps
 * to its script, and any other code, `'und'` included, to `'latin'`.
 */
export const scriptOfLanguage = (iso: string): ScriptId =>
  NON_LATIN[iso.trim().toLowerCase().split(/[-_]/)[0]!] ?? 'latin';

/** Which way a language's text runs, from its script: `'rtl'` for Arabic, Urdu, Persian, Hebrew, Thaana. */
export const directionOfLanguage = (iso: string): 'ltr' | 'rtl' => SCRIPT_FONTS[scriptOfLanguage(iso)].direction;

/** The default web font for a language: its script's first family, or the CJK family of the language (`'ja'` → Noto Sans JP). */
export const fontFamilyForLanguage = (iso: string): string => {
  const code = iso.trim().toLowerCase().split(/[-_]/)[0];
  if (code === 'ja') return 'Noto Sans JP';
  if (code === 'ko') return 'Noto Sans KR';
  return SCRIPT_FONTS[scriptOfLanguage(iso)].families[0]!;
};

// ---------------------------------------------------------------------------------------------
// Google Fonts CSS2

/** The Google Fonts CSS2 API. */
export const GOOGLE_FONTS_CSS_API = 'https://fonts.googleapis.com/css2';

export type WebFontOptions = {
  /** The weights to load, 100-900 (default `[400]`). */
  readonly weights?: readonly number[] | undefined;
  /**
   * Only these characters: Google answers with one small face per weight holding just them
   * (`&text=`), the way to load a CJK family. Order and repeats do not matter.
   */
  readonly text?: string | undefined;
  /** Only the faces of these subsets (`['arabic', 'latin']`); ignored with `text`. Default every face. */
  readonly subsets?: readonly string[] | undefined;
  /** For tests and proxies: the `fetch` that reads the CSS. */
  readonly fetch?: typeof fetch | undefined;
};

/** One `@font-face` of a Google Fonts CSS2 answer. */
export type WebFontFace = {
  readonly family: string;
  readonly style: string;
  readonly weight: string;
  /** The font file (woff2 for a modern browser). */
  readonly url: string;
  readonly format?: string;
  readonly unicodeRange?: string;
  /** The subset the comment before the rule names (`'arabic'`, `'[12]'`); unset for a `text` answer. */
  readonly subset?: string;
};

const normaliseWeights = (family: string, weights: readonly number[] | undefined): readonly number[] => {
  const list = weights ?? [400];
  for (const weight of list) {
    if (!Number.isInteger(weight) || weight < 100 || weight > 900) {
      throw new MushafStudioError(
        'BAD_STUDIO_PROP',
        `useWebFont(${JSON.stringify(family)}): weight ${describeValue(weight)} is not a font weight; use integers from 100 to 900, like [400, 700].`,
        {family, weight},
      );
    }
  }
  if (list.length === 0) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `useWebFont(${JSON.stringify(family)}): weights is empty; give at least one, like [400].`,
      {family},
    );
  }
  return [...new Set(list)].sort((a, b) => a - b);
};

/** The characters of `text` once each, in code point order: the same set always gives the same request. */
const textKey = (text: string): string => [...new Set(Array.from(text))].sort().join('');

/**
 * The CSS2 URL of a family: `https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=block`,
 * weights sorted and once each, `&text=` with the characters of `text` once each. Throws
 * `BAD_STUDIO_PROP` for an empty family or a weight outside 100-900.
 */
export const googleFontsCssUrl = (family: string, options: Pick<WebFontOptions, 'weights' | 'text'> = {}): string => {
  const name = family.trim();
  if (!name) {
    throw new MushafStudioError('BAD_STUDIO_PROP', 'useWebFont(): the family is empty; name a Google Fonts family.', {
      family,
    });
  }
  const weights = normaliseWeights(name, options.weights);
  const text = options.text === undefined ? '' : textKey(options.text);
  const familyParam = `${encodeURIComponent(name).replace(/%20/g, '+')}:wght@${weights.join(';')}`;
  return `${GOOGLE_FONTS_CSS_API}?family=${familyParam}&display=block${text ? `&text=${encodeURIComponent(text)}` : ''}`;
};

const FACE = /(?:\/\*\s*([^*]*?)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
const unquote = (value: string): string => value.trim().replace(/^(['"])(.*)\1$/, '$2');
const descriptor = (body: string, name: string): string | undefined => {
  const match = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`, 'i').exec(body);
  return match ? match[1]!.trim() : undefined;
};

/**
 * The `@font-face` rules of a Google Fonts CSS2 answer: family, style, weight, the `src: url(...)`
 * and its `format()`, the `unicode-range`, and the subset named by the comment before each rule.
 * Throws `FONT_PARSE` when the text holds no rule with a family and a `url()`.
 */
export const parseGoogleFontsCss = (css: string, source = 'the Google Fonts CSS'): readonly WebFontFace[] => {
  const faces: WebFontFace[] = [];
  for (const match of css.matchAll(FACE)) {
    const body = match[2]!;
    const family = descriptor(body, 'font-family');
    const src = descriptor(body, 'src');
    const url = src ? /url\(\s*(['"]?)([^'")]+)\1\s*\)/.exec(src)?.[2] : undefined;
    if (!family || !url) continue;
    const format = src ? /format\(\s*(['"]?)([^'")]+)\1\s*\)/.exec(src)?.[2] : undefined;
    const unicodeRange = descriptor(body, 'unicode-range');
    const subset = match[1];
    faces.push({
      family: unquote(family),
      style: descriptor(body, 'font-style') ?? 'normal',
      weight: descriptor(body, 'font-weight') ?? '400',
      url,
      ...(format === undefined ? {} : {format}),
      ...(unicodeRange === undefined ? {} : {unicodeRange}),
      ...(subset === undefined || subset === '' ? {} : {subset}),
    });
  }
  if (faces.length === 0) {
    throw new MushafError(
      'FONT_PARSE',
      `${source} has no @font-face rule with a font-family and a src url(): Google Fonts answered with something else. Check the family name on fonts.google.com.`,
      {source},
    );
  }
  return faces;
};

// ---------------------------------------------------------------------------------------------
// Loading

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

type Load = {status: Exclude<LoadStatus, 'idle'>; readonly done: Promise<void>};

type Store = {readonly loads: Map<string, Load>; readonly listeners: Set<() => void>};

// On globalThis so Studio fast-refresh, several instances and duplicate package copies share one
// load per request: each face is added to document.fonts once.
const STORE_KEY = Symbol.for('@tlawat/mushaf-studio/web-fonts@1');

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

/** Test hook: forget every load and listener. */
export const resetWebFonts = (): void => {
  const store = getStore();
  store.loads.clear();
  store.listeners.clear();
};

const canRegisterFonts = (): boolean =>
  typeof document !== 'undefined' && typeof FontFace !== 'undefined' && document.fonts !== undefined;

/** A request as the cache knows it: the CSS URL, and the subsets kept from its answer. */
const requestKey = (url: string, subsets: readonly string[] | undefined, text: string | undefined): string =>
  text === undefined && subsets !== undefined ? `${url}#${[...subsets].sort().join(',')}` : url;

const fetchCss = async (family: string, url: string, request: typeof fetch): Promise<string> => {
  let response: Response;
  try {
    response = await request(url);
  } catch (cause) {
    throw new MushafError(
      'FONT_NETWORK',
      `Could not fetch the Google Fonts CSS of ${JSON.stringify(family)} from ${url}: ${cause instanceof Error ? cause.message : String(cause)}. Check the network.`,
      {family, url, cause},
    );
  }
  if (!response.ok) {
    throw new MushafError(
      'FONT_HTTP',
      `Google Fonts answered HTTP ${response.status} for ${JSON.stringify(family)} (${url}): the family does not exist under that name, or not in those weights. Check the name and the weights on fonts.google.com.`,
      {family, url, status: response.status},
    );
  }
  return response.text();
};

/**
 * Loads a Google Fonts family into `document.fonts`: reads its CSS2 answer, keeps the faces of
 * `subsets` (all of them with `text`), creates one `FontFace` per rule (its weight, style and
 * `unicode-range`), waits for every file and adds them. Once per request (family, weights, text,
 * subsets), shared through `globalThis`; a failed load is forgotten so the next call tries again.
 * Rejects with a `MushafError`: `FONT_NETWORK` for an unreachable CSS or font file, `FONT_HTTP`
 * for an unknown family or weight, `FONT_PARSE` for CSS without faces or subsets that select none.
 * Without `document.fonts` (the server) it resolves at once.
 */
export const loadWebFont = (family: string, options: WebFontOptions = {}): Promise<void> => {
  const url = googleFontsCssUrl(family, options);
  if (!canRegisterFonts()) return Promise.resolve();
  const key = requestKey(url, options.subsets, options.text);
  const {loads} = getStore();
  const existing = loads.get(key);
  if (existing && existing.status !== 'error') return existing.done;
  const load = async (): Promise<void> => {
    const css = await fetchCss(family, url, options.fetch ?? fetch);
    let faces = parseGoogleFontsCss(css, url);
    if (options.text === undefined && options.subsets !== undefined) {
      const wanted = new Set(options.subsets);
      const all = faces;
      faces = faces.filter((face) => face.subset !== undefined && wanted.has(face.subset));
      if (faces.length === 0) {
        const named = [...new Set(all.map((face) => face.subset).filter((s) => s !== undefined))];
        throw new MushafError(
          'FONT_PARSE',
          `${JSON.stringify(family)} has no face in the subsets ${options.subsets.join(', ')}; its CSS names ${named.join(', ') || 'none'}.`,
          {family, url, subsets: options.subsets},
        );
      }
    }
    const created = faces.map((face) => {
      const descriptors: FontFaceDescriptors = {style: face.style, weight: face.weight, display: 'block'};
      if (face.unicodeRange !== undefined) descriptors.unicodeRange = face.unicodeRange;
      const source = `url(${JSON.stringify(face.url)})${face.format ? ` format(${JSON.stringify(face.format)})` : ''}`;
      return {face: new FontFace(face.family, source, descriptors), url: face.url};
    });
    await Promise.all(
      created.map(async ({face, url: file}) => {
        try {
          await face.load();
        } catch (cause) {
          throw new MushafError(
            'FONT_NETWORK',
            `Could not load ${JSON.stringify(family)} from ${file}: ${cause instanceof Error ? cause.message : String(cause)}. Check the network.`,
            {family, url: file, cause},
          );
        }
      }),
    );
    for (const {face} of created) document.fonts.add(face);
  };
  const entry: Load = {
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
  loads.set(key, entry);
  notify();
  return entry.done;
};

/** One family for `useWebFonts()`. */
export type WebFontRequest = WebFontOptions & {readonly family: string};

export type WebFontsState = {
  /** CSS `font-family` values, one per request, in order: the family quoted (`'"Noto Naskh Arabic"'`). */
  readonly fontFamilies: readonly string[];
  /** `true` once every request is in `document.fonts` (always on the server). */
  readonly ready: boolean;
};

const serverSnapshot = (): string => 'loaded';

/**
 * Loads several Google Fonts families for a component and keeps the render waiting for them (the
 * hook behind `useWebFont()`, for a component with one font per translation): one
 * `delayRender('Loading web fonts <families>')` handle is taken during the first render that finds a
 * request missing and released once all are in `document.fonts`, or on unmount. A failed load is
 * `cancelRender()` with its `MushafError` (`FONT_HTTP`, `FONT_NETWORK`, `FONT_PARSE`), the handle
 * kept so no frame is taken in a fallback font. On the server, or without `document.fonts`, it
 * reports ready and waits for nothing. The requests are compared by value, so an inline array does
 * not reload.
 */
export const useWebFonts = (requests: readonly WebFontRequest[]): WebFontsState => {
  const client = canRegisterFonts();
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const keyed = requests.map((r) => ({
    request: r,
    key: requestKey(googleFontsCssUrl(r.family, r), r.subsets, r.text),
  }));
  const signature = keyed.map((k) => k.key).join('\n');
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature is the requests' value.
  const stable = useMemo(() => keyed, [signature]);
  const snapshot = (): string => {
    if (!client) return 'loaded';
    const {loads} = getStore();
    const statuses = stable.map((k) => loads.get(k.key)?.status ?? 'idle');
    if (statuses.includes('error')) return 'error';
    return statuses.every((s) => s === 'loaded') ? 'loaded' : 'loading';
  };
  const status = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const handle = useRef<number | null>(null);
  if (status !== 'loaded' && handle.current === null) {
    handle.current = delayRender(`Loading web fonts ${requests.map((r) => r.family).join(', ')}`);
  }

  useEffect(() => {
    if (!client) return;
    let current = true;
    Promise.all(stable.map(({request}) => loadWebFont(request.family, request)))
      .catch((error: unknown) => {
        if (current) cancelRender(error);
      })
      // cancelRender() throws by design; the render is cancelled, nothing else to do here.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [client, stable, cancelRender]);
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

  return {fontFamilies: requests.map((r) => JSON.stringify(r.family.trim())), ready: status === 'loaded'};
};

export type WebFontState = {
  /** The CSS `font-family` value: the family quoted (`'"Noto Naskh Arabic"'`); add a generic fallback after it. */
  readonly fontFamily: string;
  readonly ready: boolean;
};

/**
 * Loads a Google Fonts family through the CSS2 API (`googleFontsCssUrl()`, `display=block`) and
 * keeps the render waiting until its faces are in `document.fonts`, like the package's own font
 * loaders: `delayRender()` while loading, `cancelRender()` with a `MushafError` naming the family
 * and the URL on failure, nothing on the server. Loaded once per family, weights, text and subsets,
 * shared through `globalThis`. For a script's default subsets, pass its `SCRIPT_FONTS` entry's:
 *
 * ```tsx
 * const {fontFamily} = useWebFont('Noto Nastaliq Urdu', {weights: [400, 700], subsets: SCRIPT_FONTS.urdu.subsets});
 * ```
 */
export const useWebFont = (family: string, options: WebFontOptions = {}): WebFontState => {
  const state = useWebFonts([{...options, family}]);
  return {fontFamily: state.fontFamilies[0]!, ready: state.ready};
};

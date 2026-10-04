// @vitest-environment jsdom
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fakeFetch, fixtureText} from './helpers';

const handles = {
  next: 1,
  delayRender: vi.fn((_label?: string) => handles.next++),
  continueRender: vi.fn(),
  cancelRender: vi.fn((error: unknown) => {
    throw error;
  }),
};
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  useDelayRender: () => handles,
}));

const {
  directionOfLanguage,
  fontFamilyForLanguage,
  googleFontsCssUrl,
  loadWebFont,
  parseGoogleFontsCss,
  SCRIPT_FONTS,
  scriptOfLanguage,
  useWebFont,
  useWebFonts,
} = await import('../../../src/content');
const {resetWebFonts} = await import('../../../src/content/script-fonts');

const NASKH_CSS = fixtureText('google-fonts-noto-naskh-arabic.css');
const AMIRI_TEXT_CSS = fixtureText('google-fonts-amiri-text.css');
const NASKH_URL = 'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=block';

/** A fake FontFace and document.fonts: loads wait for `release()`, and fail when `fail` is set. */
const installFonts = () => {
  const faces: {family: string; source: string; descriptors: Record<string, string>}[] = [];
  const added: unknown[] = [];
  const state: {fail: boolean; release: () => void} = {fail: false, release: () => undefined};
  const gate = new Promise<void>((resolve) => {
    state.release = resolve;
  });
  class FakeFontFace {
    constructor(
      readonly family: string,
      readonly source: string,
      readonly descriptors: Record<string, string>,
    ) {
      faces.push({family, source, descriptors});
    }
    async load() {
      await gate;
      if (state.fail) throw new Error('HTTP 404');
      return this;
    }
  }
  vi.stubGlobal('FontFace', FakeFontFace);
  Object.defineProperty(document, 'fonts', {configurable: true, value: {add: (face: unknown) => added.push(face)}});
  return {faces, added, state};
};

const css = (body: string) => fakeFetch(() => ({text: body}));

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let fonts: ReturnType<typeof installFonts>;

beforeEach(() => {
  resetWebFonts();
  handles.next = 1;
  handles.delayRender.mockClear();
  handles.continueRender.mockClear();
  handles.cancelRender.mockClear();
  fonts = installFonts();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'fonts', {configurable: true, value: undefined});
});

describe('scripts', () => {
  it("maps quran.com's languages to their scripts, Latin for the rest", () => {
    expect(scriptOfLanguage('ur')).toBe('urdu');
    expect(scriptOfLanguage('fa')).toBe('persian');
    expect(scriptOfLanguage('prs')).toBe('persian');
    expect(scriptOfLanguage('ar')).toBe('arabic');
    expect(scriptOfLanguage('ps')).toBe('arabic');
    expect(scriptOfLanguage('bn')).toBe('bengali');
    expect(scriptOfLanguage('hi')).toBe('devanagari');
    expect(scriptOfLanguage('ta')).toBe('tamil');
    expect(scriptOfLanguage('zh-Hant')).toBe('cjk');
    expect(scriptOfLanguage('JA')).toBe('cjk');
    expect(scriptOfLanguage('en')).toBe('latin');
    expect(scriptOfLanguage('ru')).toBe('latin');
    expect(scriptOfLanguage('und')).toBe('latin');
    expect(scriptOfLanguage('')).toBe('latin');
  });

  it('gives the direction and default family of a language', () => {
    expect(directionOfLanguage('ur')).toBe('rtl');
    expect(directionOfLanguage('dv')).toBe('rtl');
    expect(directionOfLanguage('bn')).toBe('ltr');
    expect(fontFamilyForLanguage('ur')).toBe('Noto Nastaliq Urdu');
    expect(fontFamilyForLanguage('ar')).toBe('Noto Naskh Arabic');
    expect(fontFamilyForLanguage('zh')).toBe('Noto Sans SC');
    expect(fontFamilyForLanguage('ja')).toBe('Noto Sans JP');
    expect(fontFamilyForLanguage('ko-KR')).toBe('Noto Sans KR');
    expect(fontFamilyForLanguage('en')).toBe('Noto Serif');
    expect(SCRIPT_FONTS.latin.families).toEqual(['Noto Serif', 'Lora']);
    expect(SCRIPT_FONTS.arabic.families).toEqual(['Noto Naskh Arabic', 'Amiri']);
    expect(SCRIPT_FONTS.cjk.subsets).toBeUndefined();
    for (const [id, fonts] of Object.entries(SCRIPT_FONTS)) expect(fonts.script).toBe(id);
  });
});

describe('googleFontsCssUrl', () => {
  it('builds the CSS2 URL with the weights sorted once each and display=block', () => {
    expect(googleFontsCssUrl('Noto Naskh Arabic', {weights: [700, 400, 700]})).toBe(NASKH_URL);
    expect(googleFontsCssUrl(' Lora ')).toBe('https://fonts.googleapis.com/css2?family=Lora:wght@400&display=block');
    expect(googleFontsCssUrl('Amiri', {text: 'مسب بسم'})).toBe(
      `https://fonts.googleapis.com/css2?family=Amiri:wght@400&display=block&text=${encodeURIComponent(' بسم')}`,
    );
  });

  it('refuses an empty family or a weight that is not one', () => {
    for (const call of [
      () => googleFontsCssUrl(''),
      () => googleFontsCssUrl('Lora', {weights: []}),
      () => googleFontsCssUrl('Lora', {weights: [450.5]}),
      () => googleFontsCssUrl('Lora', {weights: [1000]}),
    ]) {
      expect(call).toThrow(expect.objectContaining({code: 'BAD_STUDIO_PROP'}));
    }
  });
});

describe('parseGoogleFontsCss', () => {
  it("reads every @font-face of Google's answer with its subset, weight, src and unicode-range", () => {
    const faces = parseGoogleFontsCss(NASKH_CSS);
    expect(faces.map((f) => [f.subset, f.weight])).toEqual([
      ['arabic', '400'],
      ['latin', '400'],
      ['arabic', '700'],
      ['latin', '700'],
    ]);
    expect(faces[0]).toEqual({
      family: 'Noto Naskh Arabic',
      style: 'normal',
      weight: '400',
      url: 'https://fonts.gstatic.com/s/notonaskharabic/v44/RrQKbpV-9Dd1b1OAGA6M9PkyDuVBeN2DHV20Lg.woff2',
      format: 'woff2',
      unicodeRange: expect.stringMatching(/^U\+0600-06FF, U\+0750-077F, .*U\+1EEF0-1EEF1$/),
      subset: 'arabic',
    });
  });

  it('reads a text subset, which has no subset comment', () => {
    expect(parseGoogleFontsCss(AMIRI_TEXT_CSS)).toEqual([
      {
        family: 'Amiri',
        style: 'normal',
        weight: '400',
        url: 'https://fonts.gstatic.com/l/font?kit=J7aRnpd8CGxBHqUsprDgRkP5w70&skey=159039cc026b7e65&v=v30',
        format: 'woff2',
        unicodeRange: 'U+628, U+633, U+645',
      },
    ]);
  });

  it('throws FONT_PARSE for an answer without a usable rule', () => {
    for (const text of ['', '<!DOCTYPE html><html></html>', '@font-face { font-family: X; }']) {
      expect(() => parseGoogleFontsCss(text, 'the answer')).toThrow(
        expect.objectContaining({code: 'FONT_PARSE', message: expect.stringContaining('the answer has no @font-face')}),
      );
    }
  });
});

describe('loadWebFont', () => {
  it('registers one FontFace per rule of the chosen subsets, waits for all, then adds them', async () => {
    const {fetch, urls} = css(NASKH_CSS);
    const done = loadWebFont('Noto Naskh Arabic', {weights: [400, 700], subsets: ['arabic'], fetch});
    await settle();
    expect(urls.map((u) => u.href)).toEqual([NASKH_URL]);
    expect(fonts.faces).toEqual([
      {
        family: 'Noto Naskh Arabic',
        source:
          'url("https://fonts.gstatic.com/s/notonaskharabic/v44/RrQKbpV-9Dd1b1OAGA6M9PkyDuVBeN2DHV20Lg.woff2") format("woff2")',
        descriptors: {style: 'normal', weight: '400', display: 'block', unicodeRange: expect.any(String)},
      },
      expect.objectContaining({descriptors: expect.objectContaining({weight: '700'})}),
    ]);
    expect(fonts.added).toHaveLength(0);
    fonts.state.release();
    await done;
    expect(fonts.added).toHaveLength(2);
    // Once per request: a second call joins the first.
    await loadWebFont('Noto Naskh Arabic', {weights: [700, 400], subsets: ['arabic'], fetch});
    expect(urls).toHaveLength(1);
  });

  it('loads every face without subsets, and only the text subset with text', async () => {
    fonts.state.release();
    await loadWebFont('Noto Naskh Arabic', {weights: [400, 700], fetch: css(NASKH_CSS).fetch});
    expect(fonts.faces).toHaveLength(4);
    const amiri = css(AMIRI_TEXT_CSS);
    await loadWebFont('Amiri', {text: 'بسم', subsets: ['latin'], fetch: amiri.fetch});
    expect(amiri.urls[0]!.searchParams.get('text')).toBe('بسم');
    expect(fonts.faces).toHaveLength(5);
  });

  it('fails with FONT_HTTP for an unknown family, FONT_PARSE for subsets that select nothing, FONT_NETWORK for a file', async () => {
    fonts.state.release();
    const missing = fakeFetch(() => ({status: 400, text: '<!DOCTYPE html>'}));
    await expect(loadWebFont('Nope Font', {fetch: missing.fetch})).rejects.toMatchObject({
      code: 'FONT_HTTP',
      message: expect.stringContaining('HTTP 400 for "Nope Font"'),
    });
    await expect(
      loadWebFont('Noto Naskh Arabic', {subsets: ['cyrillic'], fetch: css(NASKH_CSS).fetch}),
    ).rejects.toMatchObject({
      code: 'FONT_PARSE',
      message: expect.stringContaining('its CSS names arabic, latin'),
    });
    const offline = fakeFetch(() => new Error('offline'));
    await expect(loadWebFont('Lora', {fetch: offline.fetch})).rejects.toMatchObject({code: 'FONT_NETWORK'});
    fonts.state.fail = true;
    await expect(loadWebFont('Noto Naskh Arabic', {fetch: css(NASKH_CSS).fetch})).rejects.toMatchObject({
      code: 'FONT_NETWORK',
      message: expect.stringContaining('fonts.gstatic.com'),
    });
    expect(fonts.added).toHaveLength(0);
    // A failed load is tried again.
    fonts.state.fail = false;
    await expect(loadWebFont('Noto Naskh Arabic', {fetch: css(NASKH_CSS).fetch})).resolves.toBeUndefined();
  });

  it('does nothing without document.fonts (the server)', async () => {
    Object.defineProperty(document, 'fonts', {configurable: true, value: undefined});
    const {fetch, urls} = css(NASKH_CSS);
    await expect(loadWebFont('Noto Naskh Arabic', {fetch})).resolves.toBeUndefined();
    expect(urls).toHaveLength(0);
  });
});

describe('useWebFont', () => {
  const Probe: React.FC<{readonly fetch: typeof fetch}> = ({fetch}) => {
    const font = useWebFont('Noto Naskh Arabic', {weights: [400, 700], subsets: ['arabic'], fetch});
    return <span data-family={font.fontFamily} data-ready={String(font.ready)} />;
  };

  it('holds a delayRender handle until the faces are in document.fonts', async () => {
    const {fetch} = css(NASKH_CSS);
    const {container} = render(<Probe fetch={fetch} />);
    const probe = container.firstElementChild as HTMLElement;
    expect(handles.delayRender).toHaveBeenCalledExactlyOnceWith('Loading web fonts Noto Naskh Arabic');
    expect(probe.dataset.family).toBe('"Noto Naskh Arabic"');
    expect(probe.dataset.ready).toBe('false');
    await settle();
    expect(handles.continueRender).not.toHaveBeenCalled();
    fonts.state.release();
    await settle();
    expect(probe.dataset.ready).toBe('true');
    expect(handles.continueRender).toHaveBeenCalledExactlyOnceWith(1);
    // Loaded: a new instance waits for nothing.
    handles.delayRender.mockClear();
    render(<Probe fetch={fetch} />);
    expect(handles.delayRender).not.toHaveBeenCalled();
  });

  it('cancels the render with the MushafError and keeps the handle', async () => {
    const missing = fakeFetch(() => ({status: 400, text: 'no'}));
    render(<Probe fetch={missing.fetch} />);
    await settle();
    expect(handles.cancelRender).toHaveBeenCalledTimes(1);
    expect(handles.cancelRender.mock.calls[0]![0]).toMatchObject({code: 'FONT_HTTP'});
    expect(handles.continueRender).not.toHaveBeenCalled();
  });

  it('loads several families under one handle with useWebFonts', async () => {
    const fetch = fakeFetch((url) => ({
      text: url.searchParams.get('family')!.startsWith('Amiri') ? AMIRI_TEXT_CSS : NASKH_CSS,
    })).fetch;
    const Two: React.FC = () => {
      const state = useWebFonts([
        {family: 'Noto Naskh Arabic', fetch},
        {family: 'Amiri', text: 'بسم', fetch},
      ]);
      return <span data-families={state.fontFamilies.join('|')} data-ready={String(state.ready)} />;
    };
    const {container} = render(<Two />);
    expect(handles.delayRender).toHaveBeenCalledExactlyOnceWith('Loading web fonts Noto Naskh Arabic, Amiri');
    fonts.state.release();
    await settle();
    const el = container.firstElementChild as HTMLElement;
    expect(el.dataset.families).toBe('"Noto Naskh Arabic"|"Amiri"');
    expect(el.dataset.ready).toBe('true');
    expect(handles.continueRender).toHaveBeenCalledTimes(1);
  });

  it('is ready at once and fetches nothing without document.fonts', () => {
    Object.defineProperty(document, 'fonts', {configurable: true, value: undefined});
    const {fetch, urls} = css(NASKH_CSS);
    const {container} = render(<Probe fetch={fetch} />);
    expect((container.firstElementChild as HTMLElement).dataset.ready).toBe('true');
    expect(handles.delayRender).not.toHaveBeenCalled();
    expect(urls).toHaveLength(0);
  });
});

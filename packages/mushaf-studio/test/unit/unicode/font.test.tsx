// @vitest-environment jsdom
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

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

const {resetUnicodeFonts, unicodeFontFamily, useUnicodeFont, UNICODE_FONTS} = await import('../../../src/unicode/font');

const CDN = 'https://static-cdn.tarteel.ai/qul/fonts/UthmanicHafs_V22.ttf';

/** A fake FontFace and document.fonts: loads wait for `release()`, and fail when `fail` is set. */
const installFonts = () => {
  const faces: {family: string; source: string; descriptors: unknown}[] = [];
  const added = new Set<unknown>();
  const state: {fail: boolean; release: () => void} = {fail: false, release: () => undefined};
  let gate = new Promise<void>((resolve) => {
    state.release = resolve;
  });
  class FakeFontFace {
    constructor(
      readonly family: string,
      readonly source: string,
      readonly descriptors: unknown,
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
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {add: (face: unknown) => added.add(face), has: (face: unknown) => added.has(face)},
  });
  return {
    faces,
    added,
    state,
    reopen: () => {
      gate = new Promise<void>((resolve) => {
        state.release = resolve;
      });
    },
  };
};

const seen: {fontFamily: string; ready: boolean}[] = [];
const Probe: React.FC<{readonly fontSrc?: string}> = ({fontSrc}) => {
  const font = useUnicodeFont('uthmani-hafs', fontSrc);
  seen.push(font);
  return <span data-family={font.fontFamily} data-ready={String(font.ready)} />;
};

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let fonts: ReturnType<typeof installFonts>;

beforeEach(() => {
  resetUnicodeFonts();
  handles.next = 1;
  handles.delayRender.mockClear();
  handles.continueRender.mockClear();
  handles.cancelRender.mockClear();
  seen.length = 0;
  fonts = installFonts();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'fonts', {configurable: true, value: undefined});
});

describe('useUnicodeFont', () => {
  it('holds a delayRender handle from the first render until the face is in document.fonts', async () => {
    const {container} = render(<Probe />);
    const probe = container.firstElementChild as HTMLElement;
    expect(handles.delayRender).toHaveBeenCalledTimes(1);
    expect(handles.delayRender.mock.calls[0]![0]).toBe('Loading mushaf-uthmanic-hafs');
    expect(probe.dataset.ready).toBe('false');
    expect(probe.dataset.family).toBe('mushaf-uthmanic-hafs');
    expect(fonts.faces).toEqual([
      {family: 'mushaf-uthmanic-hafs', source: `url("${CDN}") format("truetype")`, descriptors: {}},
    ]);
    expect(handles.continueRender).not.toHaveBeenCalled();
    fonts.state.release();
    await settle();
    expect(fonts.added.size).toBe(1);
    expect(probe.dataset.ready).toBe('true');
    expect(handles.continueRender).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('registers one face per family for every instance, and waits for nothing once it is loaded', async () => {
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    expect(handles.delayRender).toHaveBeenCalledTimes(2);
    fonts.state.release();
    await settle();
    expect(fonts.faces).toHaveLength(1);
    expect(handles.continueRender.mock.calls.map(([h]) => h).sort()).toEqual([1, 2]);
    cleanup();
    handles.delayRender.mockClear();
    const {container} = render(<Probe />);
    expect(handles.delayRender).not.toHaveBeenCalled();
    expect((container.firstElementChild as HTMLElement).dataset.ready).toBe('true');
    expect(fonts.faces).toHaveLength(1);
  });

  it('loads fontSrc under a family of its own, so it never competes with the CDN face', async () => {
    const url = '/static/fonts/UthmanicHafs_V22.ttf';
    const {container} = render(<Probe fontSrc={url} />);
    const family = unicodeFontFamily(UNICODE_FONTS['uthmani-hafs'], url);
    expect(family).toMatch(/^mushaf-uthmanic-hafs-[0-9a-z]+$/);
    expect((container.firstElementChild as HTMLElement).dataset.family).toBe(family);
    expect(fonts.faces[0]!.source).toBe(`url("${url}") format("truetype")`);
    expect(handles.delayRender.mock.calls[0]![0]).toBe(`Loading ${family}`);
    expect(unicodeFontFamily(UNICODE_FONTS['uthmani-hafs'], CDN)).toBe('mushaf-uthmanic-hafs');
  });

  it('cancels the render with a FONT_NETWORK naming the URL, and keeps the handle', async () => {
    fonts.state.fail = true;
    render(<Probe />);
    fonts.state.release();
    await settle();
    expect(handles.cancelRender).toHaveBeenCalledTimes(1);
    const error = handles.cancelRender.mock.calls[0]![0] as {code: string; message: string};
    expect(error.code).toBe('FONT_NETWORK');
    expect(error.message).toContain(CDN);
    expect(error.message).toContain('HTTP 404');
    expect(handles.continueRender).not.toHaveBeenCalled();
    expect(fonts.added.size).toBe(0);
  });

  it('tries again after a failure', async () => {
    fonts.state.fail = true;
    render(<Probe />);
    fonts.state.release();
    await settle();
    cleanup();
    fonts.state.fail = false;
    fonts.reopen();
    const {container} = render(<Probe />);
    fonts.state.release();
    await settle();
    expect(fonts.faces).toHaveLength(2);
    expect((container.firstElementChild as HTMLElement).dataset.ready).toBe('true');
  });

  it('without document.fonts (the server), reports ready with the family and waits for nothing', () => {
    Object.defineProperty(document, 'fonts', {configurable: true, value: undefined});
    const {container} = render(<Probe />);
    expect((container.firstElementChild as HTMLElement).dataset.ready).toBe('true');
    expect((container.firstElementChild as HTMLElement).dataset.family).toBe('mushaf-uthmanic-hafs');
    expect(handles.delayRender).not.toHaveBeenCalled();
    expect(fonts.faces).toHaveLength(0);
  });

  it('refuses an unknown font id with BAD_STUDIO_PROP', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Bad = () => {
      useUnicodeFont('naskh' as never);
      return null;
    };
    expect(() => render(<Bad />)).toThrow(/font is "naskh"; expected one of uthmani-hafs/);
  });
});

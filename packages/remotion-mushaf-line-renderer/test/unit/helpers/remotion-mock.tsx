// A controllable stand-in for `remotion` used by the component tests. `vi.mock('remotion', ...)`
// must be called in the test file itself (it is hoisted); this module just provides the pieces.
import React from 'react';
import {vi} from 'vitest';

export type MockEnv = {
  isRendering: boolean;
  isStudio: boolean;
  isPlayer: boolean;
  isClientSideRendering: boolean;
  isReadOnlyStudio: boolean;
};

export const createRemotionMock = () => {
  const state = {
    frame: 0,
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 120,
    env: {
      isRendering: false,
      isStudio: true,
      isPlayer: false,
      isClientSideRendering: false,
      isReadOnlyStudio: false,
    } as MockEnv,
    nextHandle: 1,
  };
  const hook = {
    delayRender: vi.fn((_label?: string, _options?: unknown) => state.nextHandle++),
    continueRender: vi.fn(),
    cancelRender: vi.fn((e: unknown) => {
      throw e;
    }),
  };
  const global = {
    delayRender: vi.fn((_label?: string, _options?: unknown) => state.nextHandle++),
    continueRender: vi.fn(),
    cancelRender: vi.fn((e: unknown) => {
      throw e;
    }),
  };
  const AbsoluteFill = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
    ({style, children, ...rest}, ref) => (
      <div
        ref={ref}
        data-absolute-fill=""
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    ),
  );
  AbsoluteFill.displayName = 'AbsoluteFill';
  const Sequence: React.FC<{name?: string; layout?: string; children?: React.ReactNode}> = ({name, children}) => (
    <div data-sequence={name}>{children}</div>
  );
  const module = {
    useCurrentFrame: () => state.frame,
    useVideoConfig: () => ({
      width: state.width,
      height: state.height,
      fps: state.fps,
      durationInFrames: state.durationInFrames,
      id: 'test',
      defaultProps: {},
      props: {},
      defaultCodec: null,
      defaultOutName: null,
      defaultVideoImageFormat: null,
      defaultPixelFormat: null,
    }),
    useRemotionEnvironment: () => state.env,
    getRemotionEnvironment: () => state.env,
    useDelayRender: () => hook,
    delayRender: global.delayRender,
    continueRender: global.continueRender,
    cancelRender: global.cancelRender,
    AbsoluteFill,
    Sequence,
  };
  const reset = () => {
    state.frame = 0;
    state.width = 1920;
    state.height = 1080;
    state.fps = 30;
    state.durationInFrames = 120;
    state.env = {
      isRendering: false,
      isStudio: true,
      isPlayer: false,
      isClientSideRendering: false,
      isReadOnlyStudio: false,
    };
    state.nextHandle = 1;
    for (const fn of [
      hook.delayRender,
      hook.continueRender,
      hook.cancelRender,
      global.delayRender,
      global.continueRender,
      global.cancelRender,
    ])
      fn.mockClear();
  };
  return {state, hook, global, module, reset};
};

/** Fake FontFace / document.fonts / fetch, matching the loader's expectations. */
export const installFontFakes = () => {
  const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4, 5, 6, 7, 8]).buffer;
  const faces: Array<{family: string; status: string}> = [];
  const fontSet = new Set<unknown>();
  let gate: Promise<void> = Promise.resolve();
  let release: () => void = () => undefined;
  const holdLoads = () => {
    gate = new Promise<void>((r) => {
      release = r;
    });
  };
  const releaseLoads = () => release();
  class FontFaceMock {
    family: string;
    status = 'unloaded';
    constructor(family: string) {
      this.family = family;
      faces.push(this);
    }
    async load() {
      await gate;
      this.status = 'loaded';
      return this;
    }
  }
  const fetchMock = vi.fn(async () => ({ok: true, status: 200, arrayBuffer: async () => WOFF2}));
  vi.stubGlobal('FontFace', FontFaceMock);
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add: (f: unknown) => fontSet.add(f),
      delete: (f: unknown) => fontSet.delete(f),
      has: (f: unknown) => fontSet.has(f),
    },
  });
  return {faces, fontSet, fetchMock, holdLoads, releaseLoads};
};

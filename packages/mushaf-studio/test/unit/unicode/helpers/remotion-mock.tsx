// A controllable stand-in for the parts of `remotion` `<MushafAyahText>` uses, after the main
// package's helper: `vi.mock('remotion', ...)` must be called in the test file itself (it is
// hoisted); this module provides the pieces. Each element renders as a plain one that carries its
// props as data attributes, so a test reads the tree the composition built. The environment flags
// reach both `getRemotionEnvironment()` and `useRemotionEnvironment()`, as the panel's guard reads them.
import type React from 'react';

const initialState = () => ({
  frame: 0,
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 900,
  isStudio: false,
  isRendering: false,
  isClientSideRendering: false,
});

export const createRemotionMock = () => {
  const state = initialState();
  const environment = () => ({
    isRendering: state.isRendering,
    isStudio: state.isStudio,
    isPlayer: false,
    isClientSideRendering: state.isClientSideRendering,
    isReadOnlyStudio: false,
  });
  const AbsoluteFill: React.FC<{style?: React.CSSProperties; children?: React.ReactNode}> = ({style, children}) => (
    <div data-absolute-fill="" style={style}>
      {children}
    </div>
  );
  const Sequence: React.FC<{
    from?: number;
    durationInFrames?: number;
    name?: string;
    premountFor?: number;
    children?: React.ReactNode;
  }> = ({from, durationInFrames, name, premountFor, children}) => (
    <div data-sequence={name} data-from={from} data-duration={durationInFrames} data-premount={premountFor}>
      {children}
    </div>
  );
  const Audio: React.FC<{src: string}> = ({src}) => <div data-audio={src} />;
  const Img: React.FC<{src: string; style?: React.CSSProperties}> = ({src, style}) => (
    <img data-src={src} style={style} alt="" />
  );
  const module = {
    useCurrentFrame: () => state.frame,
    useVideoConfig: () => ({
      width: state.width,
      height: state.height,
      fps: state.fps,
      durationInFrames: state.durationInFrames,
      id: 'MushafAyahText',
      defaultProps: {},
      props: {},
      defaultCodec: null,
      defaultOutName: null,
      defaultVideoImageFormat: null,
      defaultPixelFormat: null,
    }),
    getRemotionEnvironment: environment,
    useRemotionEnvironment: environment,
    staticFile: (path: string) => `/static/${path}`,
    AbsoluteFill,
    Sequence,
    Audio,
    Img,
  };
  const reset = () => {
    Object.assign(state, initialState());
  };
  return {state, module, reset};
};

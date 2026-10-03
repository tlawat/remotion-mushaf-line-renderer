// A controllable stand-in for `remotion` for the composition tests, after the main package's own
// helper: `vi.mock('remotion', ...)` must be called in the test file itself (it is hoisted); this
// module provides the pieces. Every element the compositions use renders as a plain element that
// carries its props as data attributes, so a test reads the tree the composition built.
import type React from 'react';

export type MockEnv = {
  isRendering: boolean;
  isStudio: boolean;
  isPlayer: boolean;
  isClientSideRendering: boolean;
  isReadOnlyStudio: boolean;
};

const freshEnv = (): MockEnv => ({
  isRendering: false,
  isStudio: false,
  isPlayer: false,
  isClientSideRendering: false,
  isReadOnlyStudio: false,
});

export const createRemotionMock = () => {
  const state = {
    frame: 0,
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 900,
    id: 'MushafRecitation',
    env: freshEnv(),
  };
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
  }> = ({from, durationInFrames, name, children}) => (
    <div data-sequence={name} data-from={from} data-duration={durationInFrames}>
      {children}
    </div>
  );
  const Audio: React.FC<{src: string}> = ({src}) => <div data-audio={src} />;
  const Img: React.FC<{src: string; style?: React.CSSProperties}> = ({src, style}) => (
    <img data-src={src} style={style} alt="" />
  );
  const Div: React.FC<{name?: string; style?: React.CSSProperties; children?: React.ReactNode}> = ({
    name,
    style,
    children,
  }) => (
    <div data-interactive={name} style={style}>
      {children}
    </div>
  );
  const module = {
    useCurrentFrame: () => state.frame,
    useVideoConfig: () => ({
      width: state.width,
      height: state.height,
      fps: state.fps,
      durationInFrames: state.durationInFrames,
      id: state.id,
      defaultProps: {},
      props: {},
      defaultCodec: null,
      defaultOutName: null,
      defaultVideoImageFormat: null,
      defaultPixelFormat: null,
    }),
    getRemotionEnvironment: () => state.env,
    staticFile: (path: string) => `/static/${path}`,
    AbsoluteFill,
    Sequence,
    Audio,
    Img,
    Interactive: {Div},
  };
  const reset = () => {
    state.frame = 0;
    state.width = 1920;
    state.height = 1080;
    state.fps = 30;
    state.durationInFrames = 900;
    state.env = freshEnv();
  };
  return {state, module, reset};
};

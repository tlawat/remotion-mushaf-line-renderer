// A controllable stand-in for `remotion` for the composition tests, after the main package's own
// helper: `vi.mock('remotion', ...)` must be called in the test file itself (it is hoisted); this
// module provides the pieces. Every element the compositions use renders as a plain element that
// carries its props as data attributes, so a test reads the tree the composition built, and a
// `<Sequence>` tells its children where it starts (`SequenceFrom`), so a mocked line can give
// `wordStyle` the local frame a real one would.
import type React from 'react';
import {createContext, useContext} from 'react';

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

/** `from` of the nearest mocked `<Sequence>`: 0 outside one. */
export const SequenceFrom = createContext(0);

/** An `<Audio>` as the mock saw it: its props, the volume callback included. */
export type AudioRecord = {
  readonly src: string;
  readonly trimBefore?: number | undefined;
  readonly trimAfter?: number | undefined;
  readonly volume?: ((frame: number) => number) | number | undefined;
};

export const createRemotionMock = () => {
  /** Every `<Audio>` rendered since the last `reset()`, in render order. */
  const audios: AudioRecord[] = [];
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
      <SequenceFrom.Provider value={from ?? 0}>{children}</SequenceFrom.Provider>
    </div>
  );
  const Audio: React.FC<AudioRecord> = (props) => {
    audios.push(props);
    return <div data-audio={props.src} data-trim-before={props.trimBefore} data-trim-after={props.trimAfter} />;
  };
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
      id: state.id,
      defaultProps: {},
      props: {},
      defaultCodec: null,
      defaultOutName: null,
      defaultVideoImageFormat: null,
      defaultPixelFormat: null,
    }),
    getRemotionEnvironment: () => state.env,
    useRemotionEnvironment: () => state.env,
    staticFile: (path: string) => `/static/${path}`,
    AbsoluteFill,
    Sequence,
    Audio,
    Img,
  };
  /** The local frame of the enclosing mocked `<Sequence>` at the mock's current frame. */
  const useLocalFrame = (): number => state.frame - useContext(SequenceFrom);
  const reset = () => {
    state.frame = 0;
    state.width = 1920;
    state.height = 1080;
    state.fps = 30;
    state.durationInFrames = 900;
    state.env = freshEnv();
    audios.length = 0;
  };
  return {state, module, reset, useLocalFrame, audios};
};

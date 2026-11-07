import type * as React from 'react';
import {
  AbsoluteFill,
  Html5Video,
  Img,
  interpolate,
  Loop,
  OffthreadVideo,
  staticFile as remotionStaticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {OWN_BACKGROUND_NAME} from '../audio/host';
import {fileUrl} from '../compositions/shared';
import type {Background, KenBurns} from './schema';

/** Four decimals: stable strings in a transform or an opacity, free of float noise. */
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/**
 * The layer under everything: the colour, and for `gradient` the CSS gradient over it. The colour
 * also fills the bars around a `contain` image or video, and shows while an image loads.
 */
export const backgroundBaseStyle = (
  background: Pick<Background, 'kind' | 'color' | 'gradient'>,
): React.CSSProperties =>
  background.kind === 'gradient'
    ? {
        backgroundColor: background.color,
        backgroundImage: `linear-gradient(${background.gradient.angle}deg, ${background.gradient.from}, ${background.gradient.to})`,
      }
    : {backgroundColor: background.color};

/** Whether the background paints an image or a video: the kind says so and `src` is set. */
export const showsMedia = (background: Pick<Background, 'kind' | 'src'>): boolean =>
  (background.kind === 'image' || background.kind === 'video') && background.src !== '';

/**
 * The slow zoom at `frame`, over the whole composition (frame 0 to `durationInFrames - 1`, linear,
 * clamped): `slow-zoom` scales from 1 to `scale`. `undefined` for `none`. Pure in its arguments.
 *
 * `kenBurnsTransform('slow-zoom', 1.04, 0, 300)` is `"scale(1)"`, at frame 299 `"scale(1.04)"`.
 */
export const kenBurnsTransform = (
  kind: KenBurns,
  scale: number,
  frame: number,
  durationInFrames: number,
): string | undefined => {
  if (kind === 'none') return undefined;
  const last = durationInFrames - 1;
  const progress =
    last <= 0 ? 0 : interpolate(frame, [0, last], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return `scale(${round4(1 + (scale - 1) * progress)})`;
};

/**
 * The box the image or video sits in: the Ken Burns transform and the blur. A blurred picture
 * fades to transparent at its edges, so the box overhangs the frame by twice the blur on each side.
 */
export const mediaBoxStyle = (
  background: Pick<Background, 'blur' | 'kenBurns' | 'kenBurnsScale'>,
  frame: number,
  durationInFrames: number,
): React.CSSProperties => {
  const bleed = background.blur * 2;
  const transform = kenBurnsTransform(background.kenBurns, background.kenBurnsScale, frame, durationInFrames);
  return {
    position: 'absolute',
    left: -bleed,
    top: -bleed,
    width: bleed === 0 ? '100%' : `calc(100% + ${bleed * 2}px)`,
    height: bleed === 0 ? '100%' : `calc(100% + ${bleed * 2}px)`,
    ...(background.blur > 0 ? {filter: `blur(${background.blur}px)`} : {}),
    ...(transform === undefined ? {} : {transform}),
  };
};

/** The image or video itself: it fills its box, cropped (`cover`) or whole (`contain`). */
export const mediaStyle = (background: Pick<Background, 'fit'>): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: background.fit,
});

export type MushafBackgroundProps = {
  readonly background: Background;
  /** For tests and other hosts; default Remotion's. */
  readonly staticFile?: ((path: string) => string) | undefined;
};

/**
 * Everything behind the lines, as an `<AbsoluteFill>` to put first in a composition: the colour or
 * the gradient, then the image (`<Img>`) or the video, then the dim layer. Nothing follows the audio. The video
 * is always muted. With `videoSeconds` it is an `<OffthreadVideo>` in a `<Loop>` of that length,
 * frame-exact in a render; without it, `<Html5Video loop>`, which finds the length itself. Pure in
 * its props and the frame.
 */
export const MushafBackground: React.FC<MushafBackgroundProps> = ({background, staticFile = remotionStaticFile}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  let media: React.ReactNode = null;
  if (showsMedia(background)) {
    const src = fileUrl(background.src, staticFile);
    const style = mediaStyle(background);
    if (background.kind === 'image') media = <Img src={src} style={style} />;
    else if (background.videoSeconds > 0)
      media = (
        <Loop
          durationInFrames={Math.max(1, Math.round(background.videoSeconds * fps))}
          layout="none"
          name={OWN_BACKGROUND_NAME}
        >
          <OffthreadVideo src={src} muted style={style} />
        </Loop>
      );
    else media = <Html5Video src={src} muted loop style={style} name={OWN_BACKGROUND_NAME} />;
  }
  return (
    <AbsoluteFill data-mushaf-background={background.kind} style={backgroundBaseStyle(background)}>
      {media !== null && (
        <div data-mushaf-background-part="media" style={mediaBoxStyle(background, frame, durationInFrames)}>
          {media}
        </div>
      )}
      {background.dim > 0 && (
        <AbsoluteFill data-mushaf-background-part="dim" style={{backgroundColor: '#000', opacity: background.dim}} />
      )}
    </AbsoluteFill>
  );
};

/**
 * A video's length in seconds, read from its metadata by a `<video>` element: for
 * `calculateMetadata()`, to fill `videoSeconds` without a media parser. Browser only (the Studio and
 * the renderer's Chrome); `null` when the browser cannot read it or there is no DOM.
 */
export const probeVideoSeconds = (url: string): Promise<number | null> => {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;
    const done = (seconds: number | null) => {
      if (settled) return;
      settled = true;
      video.removeAttribute('src');
      video.load();
      resolve(seconds);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 100) / 100 : null);
    video.onerror = () => done(null);
    video.src = url;
  });
};

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
import {fileUrl} from '../compositions/shared';
import type {Background, Glow, KenBurns} from './schema';

/** Four decimals: stable strings in a transform or an opacity, free of float noise. */
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

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
 * The Ken Burns transform at `frame`, over the whole composition (frame 0 to `durationInFrames - 1`,
 * linear, clamped): `slow-zoom` scales from 1 to `scale`; the pans hold `scale` and travel the
 * margin it gives, edge to edge, so no border ever shows: `pan-left` drifts the picture leftward,
 * `pan-right` rightward. `undefined` for `none`. Pure in its arguments.
 *
 * `kenBurnsTransform('slow-zoom', 1.2, 0, 300)` is `"scale(1)"`, at frame 299 `"scale(1.2)"`.
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
  if (kind === 'slow-zoom') return `scale(${round4(1 + (scale - 1) * progress)})`;
  // `translateX()` acts before `scale()` (right to left) in the element's own width: at `scale` the
  // picture overflows the frame by (scale - 1) / 2 on each side, which is (scale - 1) / (2 scale)
  // of the unscaled width.
  const margin = ((scale - 1) / (2 * scale)) * 100;
  const offset = kind === 'pan-left' ? margin * (1 - 2 * progress) : margin * (2 * progress - 1);
  return `scale(${round4(scale)}) translateX(${round4(offset)}%)`;
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

/** The share of `strength` a silent frame keeps, so the glow breathes rather than blinks. */
export const GLOW_REST = 0.35;

/**
 * The glow's opacity for an audio level (0-1, clamped; anything not finite reads as silence):
 * `GLOW_REST × strength` at silence, rising linearly to `strength` at the loudest frame.
 * `glowOpacity(0.5, 0.8)` is 0.54.
 */
export const glowOpacity = (level: number, strength: number): number =>
  round4(clamp01(strength) * (GLOW_REST + (1 - GLOW_REST) * clamp01(level)));

/**
 * The glow layer: a soft ellipse of `glow.color` centred at `centerY` (0 top, 1 bottom: where the
 * lines are), its opacity from `glowOpacity()` and swelling by up to 8% with the level.
 */
export const glowStyle = (
  glow: Pick<Glow, 'color' | 'strength'>,
  level: number,
  centerY = 0.5,
): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  backgroundImage: `radial-gradient(ellipse 60% 40% at 50% ${round4(clamp01(centerY) * 100)}%, ${glow.color}, transparent 70%)`,
  opacity: glowOpacity(level, glow.strength),
  transform: `scale(${round4(1 + 0.08 * clamp01(level))})`,
});

export type MushafBackgroundProps = {
  readonly background: Background;
  /**
   * The recitation's level on this frame, 0-1, for the glow: `levelAt(analysis.levels, frame)` from
   * `src/audio`. 0 (the default) holds the glow at rest.
   */
  readonly audioLevel?: number | undefined;
  /** Where the lines are, 0 top to 1 bottom (`layout.verticalAlign`): the glow's centre. Default 0.5. */
  readonly glowY?: number | undefined;
  /** For tests and other hosts; default Remotion's. */
  readonly staticFile?: ((path: string) => string) | undefined;
};

/**
 * Everything behind the lines, as an `<AbsoluteFill>` to put first in a composition: the colour or
 * the gradient, then the image (`<Img>`) or the video, then the dim layer, then the glow. The video
 * is always muted. With `videoSeconds` it is an `<OffthreadVideo>` in a `<Loop>` of that length,
 * frame-exact in a render; without it, `<Html5Video loop>`, which finds the length itself. Pure in
 * its props and the frame.
 */
export const MushafBackground: React.FC<MushafBackgroundProps> = ({
  background,
  audioLevel = 0,
  glowY = 0.5,
  staticFile = remotionStaticFile,
}) => {
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
          name="Background video"
        >
          <OffthreadVideo src={src} muted style={style} />
        </Loop>
      );
    else media = <Html5Video src={src} muted loop style={style} />;
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
      {background.glow.enabled && background.glow.strength > 0 && (
        <div data-mushaf-background-part="glow" style={glowStyle(background.glow, audioLevel, glowY)} />
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

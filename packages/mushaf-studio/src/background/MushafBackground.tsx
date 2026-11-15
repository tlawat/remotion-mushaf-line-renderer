import type * as React from 'react';
import {useId} from 'react';
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
import type {Layout} from '../schema';
import {fromOklch, groundOf, isLightGround, relativeLuminance, toOklch} from '../schema/color';
import {SINE} from '../schema/tokens';
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
 * The slow zoom at `frame`, over the whole composition (frame 0 to `durationInFrames - 1`, eased on
 * `SINE`, clamped): `slow-zoom` scales from 1 to `scale`, centred. `undefined` for `none`. Pure in
 * its arguments.
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
    last <= 0
      ? 0
      : interpolate(frame, [0, last], [0, 1], {easing: SINE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
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

/** The darkest an image or a video is veiled: black under light ink, the page colour under dark ink. */
export const MEDIA_DIM_FLOOR = {black: 0.45, page: 0.55} as const;

/** The dim layer: its colour and opacity. */
export type DimLayer = {readonly color: string; readonly opacity: number};

/**
 * The layer that darkens the background, or `null` for none. An image or a video keeps a floor so
 * the text always reads on it: under light ink (`relativeLuminance(layout.color) > 0.5`) black at
 * `max(dim, 0.45)`, under dark ink a veil of the page colour at `max(dim, 0.55)`. A colour or a
 * gradient takes `dim` as set, in black. Without `layout`, `dim` as set for every kind.
 *
 * `dimLayer({...defaultBackground, kind: 'image', src: 'sky.jpg'}, {background: '#121416', color: '#f1eadb'})` is black at 0.45.
 */
export const dimLayer = (
  background: Pick<Background, 'kind' | 'src' | 'dim'>,
  layout?: Pick<Layout, 'background' | 'color'> | undefined,
): DimLayer | null => {
  if (layout !== undefined && showsMedia(background)) {
    return relativeLuminance(layout.color) > 0.5
      ? {color: '#000', opacity: Math.max(background.dim, MEDIA_DIM_FLOOR.black)}
      : {color: layout.background, opacity: Math.max(background.dim, MEDIA_DIM_FLOOR.page)};
  }
  return background.dim > 0 ? {color: '#000', opacity: background.dim} : null;
};

/**
 * The vignette's edge colour on `ground`, as `r, g, b`: black on a dark ground, the ground itself
 * 0.12 darker in OKLCH lightness on a light one (a warm page edge, not a grey one).
 */
export const vignetteRgb = (ground: string): string => {
  if (!isLightGround(ground)) return '0, 0, 0';
  const oklch = toOklch(ground);
  if (oklch === null) return '0, 0, 0';
  const {r, g, b} = fromOklch({...oklch, l: Math.max(0, oklch.l - 0.12)});
  return `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;
};

/**
 * The vignette at strength `vignette` (0-0.4) on `ground`: a radial gradient over an ellipse 120 % of
 * the frame wide and 100 % high (radii of 60 % and 50 %), clear over its middle 55 %, darkening
 * toward the edges like the fall-off of a page: about 0.6 of `vignette` at the middle of the sides,
 * 0.9 at the top, all of it at the corners. `null` for 0.
 *
 * `vignetteStyle(0.22, '#121416').backgroundImage` is
 * `"radial-gradient(ellipse 60% 50% at 50% 48%, transparent 55%, rgba(0, 0, 0, 0.22) 100%)"`.
 */
export const vignetteStyle = (vignette: number, ground: string): React.CSSProperties | null =>
  vignette > 0
    ? {
        backgroundImage: `radial-gradient(ellipse 60% 50% at 50% 48%, transparent 55%, rgba(${vignetteRgb(ground)}, ${round4(vignette)}) 100%)`,
      }
    : null;

/** Opacity of the noise that dithers the vignette against banding at video bitrates. */
export const NOISE_OPACITY = 0.015;

/** The noise's colour matrix: the three channels' mean in each (a grey around 50 %), alpha 1. */
const NOISE_MATRIX = '0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0 0 0 0 1';

/**
 * A fine grey noise over the whole frame (`feTurbulence`, base frequency 0.9, one octave, seed 7: the
 * same grain on every frame and every machine), at `NOISE_OPACITY`, so a smooth gradient does not
 * band once a video is encoded. The grain is centred on 50 % grey (the turbulence taken in sRGB) and
 * laid on with `mix-blend-mode: overlay`, where that grey changes nothing: it dithers the ground
 * around its own colour and never lifts or darkens it.
 */
const Noise: React.FC = () => {
  // A filter id per instance (two compositions on one page), without the colons useId() puts in.
  const id = `mushaf-noise-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg
      data-mushaf-background-part="noise"
      width="100%"
      height="100%"
      style={{position: 'absolute', left: 0, top: 0, opacity: NOISE_OPACITY, mixBlendMode: 'overlay'}}
      aria-hidden="true"
    >
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={7} stitchTiles="stitch" />
        {/* Grey around 50 % and opaque: the grain shifts lightness only, at the layer's own opacity. */}
        <feColorMatrix type="matrix" values={NOISE_MATRIX} />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
};

export type MushafBackgroundProps = {
  readonly background: Background;
  /**
   * The page colour and the ink (`layout.background`, `layout.color`): the floor an image or a video
   * is dimmed to (`dimLayer()`) and the ground the vignette darkens (`groundOf()`) depend on them.
   * Without them `dim` is drawn as set and the vignette darkens toward `background.color`.
   */
  readonly layout?: Pick<Layout, 'background' | 'color'> | undefined;
  /** For tests and other hosts; default Remotion's. */
  readonly staticFile?: ((path: string) => string) | undefined;
};

/**
 * Everything behind the lines, as an `<AbsoluteFill>` to put first in a composition: the colour or
 * the gradient, then the image (`<Img>`) or the video (zoomed very slowly when asked), then the dim
 * layer (`dimLayer()`), then the vignette and its noise. Nothing follows the audio. The video
 * is always muted. With `videoSeconds` it is an `<OffthreadVideo>` in a `<Loop>` of that length,
 * frame-exact in a render; without it, `<Html5Video loop>`, which finds the length itself. Pure in
 * its props and the frame.
 */
export const MushafBackground: React.FC<MushafBackgroundProps> = ({
  background,
  layout,
  staticFile = remotionStaticFile,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const dim = dimLayer(background, layout);
  const ground = layout === undefined ? background.color : groundOf(layout, background.kind);
  const vignette = vignetteStyle(background.vignette, ground);
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
      {dim !== null && (
        <AbsoluteFill data-mushaf-background-part="dim" style={{backgroundColor: dim.color, opacity: dim.opacity}} />
      )}
      {vignette !== null && (
        <>
          <AbsoluteFill data-mushaf-background-part="vignette" style={vignette} />
          <Noise />
        </>
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

// What is painted behind the lines (the `background` props group): a colour, a gradient, an image or
// a looping video, with blur, dim (a floor under an image or a video), a vignette dithered by a fixed
// noise and a very slow zoom over the whole video; and the jadwal, the thin gold double rule of
// `layout.frame`. Nothing follows the audio. Pure in props and frame, like the lines.

export {backgroundFor, groundFor} from './compat';
export {Jadwal, type JadwalProps, type JadwalRule, jadwalOpacity, jadwalRules} from './Jadwal';
export {
  backgroundBaseStyle,
  type DimLayer,
  dimLayer,
  kenBurnsTransform,
  MEDIA_DIM_FLOOR,
  MushafBackground,
  type MushafBackgroundProps,
  mediaBoxStyle,
  mediaStyle,
  NOISE_OPACITY,
  probeVideoSeconds,
  showsMedia,
  vignetteRgb,
  vignetteStyle,
} from './MushafBackground';
export {
  BACKGROUND_FITS,
  BACKGROUND_KINDS,
  type Background,
  type BackgroundFit,
  type BackgroundKind,
  backgroundSchema,
  defaultBackground,
  type Glow,
  type Gradient,
  glowSchema,
  gradientSchema,
  KEN_BURNS,
  type KenBurns,
  LEGACY_KEN_BURNS,
} from './schema';

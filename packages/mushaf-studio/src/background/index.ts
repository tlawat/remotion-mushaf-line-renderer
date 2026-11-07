// What is painted behind the lines (the `background` props group): a colour, a gradient, an image or
// a looping video, with blur, dim, a vignette and a very slow zoom over the whole video. Nothing
// follows the audio. Pure in props and frame, like the lines.

export {backgroundFor} from './compat';
export {
  backgroundBaseStyle,
  kenBurnsTransform,
  MushafBackground,
  type MushafBackgroundProps,
  mediaBoxStyle,
  mediaStyle,
  probeVideoSeconds,
  showsMedia,
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

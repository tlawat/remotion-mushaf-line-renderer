// What is painted behind the lines (the `background` props group): a colour, a gradient, an image or
// a looping video, with blur, dim and a Ken Burns move over the whole video, and a glow behind the
// lines that pulses with the recitation. Pure in props and frame, like the lines.

export {backgroundFor} from './compat';
export {
  backgroundBaseStyle,
  GLOW_REST,
  glowOpacity,
  glowStyle,
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
} from './schema';

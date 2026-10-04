// The `background` props group: what is painted behind the lines. A Zod fragment like the ones in
// `src/schema`, so the Props sidebar renders it as controls; the order and descriptions are the UI.
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';

export const BACKGROUND_KINDS = ['color', 'image', 'video', 'gradient'] as const;
export const BACKGROUND_FITS = ['cover', 'contain'] as const;
export const KEN_BURNS = ['none', 'slow-zoom', 'pan-left', 'pan-right'] as const;

/** The glow behind the lines that breathes with the recitation (the `audioLevel` the composition passes). */
export const glowSchema = z.object({
  enabled: z.boolean().describe('A soft glow behind the lines that pulses with the recitation'),
  color: zColor().describe('Colour of the glow'),
  /** Opacity at the loudest frame; a silent frame keeps 35% of it, so the glow never blinks out. */
  strength: z.number().min(0).max(1).step(0.05).describe('Opacity of the glow at the loudest moment'),
});

export const gradientSchema = z.object({
  from: zColor().describe('First colour of the gradient'),
  to: zColor().describe('Second colour of the gradient'),
  /** CSS `linear-gradient()` angle: 0 runs bottom to top, 90 left to right, 180 top to bottom. */
  angle: z.number().int().min(0).max(360).step(5).describe('Direction of the gradient in degrees (180: top to bottom)'),
});

export const backgroundSchema = z.object({
  kind: z.enum(BACKGROUND_KINDS).describe('Background: a colour, an image, a looping video or a gradient'),
  /**
   * Painted under an image, a video or a gradient, so it also fills the bars a `contain` image or
   * video leaves. The `'color'` kind paints `layout.background` instead: the page colour stays there.
   */
  color: zColor().describe('Colour behind an image, a video or a gradient (the color kind paints layout.background)'),
  /** A `public/` path or an http(s) URL; read for `image` and `video` only. */
  src: z.string().describe('Image or video: a path in public/ or a URL (empty: the colour only)'),
  fit: z.enum(BACKGROUND_FITS).describe('Image or video: fill the frame (cover, cropped) or fit inside it (contain)'),
  /**
   * The video's own length, for a frame-exact loop in renders (`<OffthreadVideo>` in a `<Loop>`).
   * 0 lets the browser find it (`<Html5Video loop>`): fine in the Studio, less exact in a render.
   * `probeVideoSeconds()` reads it in `calculateMetadata()`.
   */
  videoSeconds: z
    .number()
    .min(0)
    .max(3600)
    .step(0.01)
    .describe('Video: its length in seconds, for an exact loop (0: detect in the browser)'),
  /** px, at the composition's width. */
  blur: z.number().min(0).max(40).step(1).describe('Image or video: blur in px'),
  /** Opacity of a black layer over the background (any kind), so light text stays readable. */
  dim: z.number().min(0).max(1).step(0.05).describe('Darken the background (0: not at all, 1: black)'),
  kenBurns: z.enum(KEN_BURNS).describe('Image or video: a slow zoom or pan over the whole video (none: still)'),
  /** The zoom at the end of `slow-zoom` (from 1), and the constant zoom a pan moves inside. */
  kenBurnsScale: z.number().min(1).max(1.3).step(0.01).describe('Image or video: how far the Ken Burns zooms in'),
  gradient: gradientSchema.describe('Gradient: its two colours and direction'),
  glow: glowSchema.describe('Glow behind the lines'),
});

export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];
export type BackgroundFit = (typeof BACKGROUND_FITS)[number];
export type KenBurns = (typeof KEN_BURNS)[number];
export type Glow = z.infer<typeof glowSchema>;
export type Gradient = z.infer<typeof gradientSchema>;
export type Background = z.infer<typeof backgroundSchema>;

/** The page colour of `defaultLayout`, nothing moving, no glow: the compositions' look before this group existed. */
export const defaultBackground: Background = {
  kind: 'color',
  color: '#fbf7ee',
  src: '',
  fit: 'cover',
  videoSeconds: 0,
  blur: 0,
  dim: 0,
  kenBurns: 'none',
  kenBurnsScale: 1.1,
  gradient: {from: '#0f2027', to: '#2c5364', angle: 180},
  glow: {enabled: false, color: '#c8a45c', strength: 0.5},
};

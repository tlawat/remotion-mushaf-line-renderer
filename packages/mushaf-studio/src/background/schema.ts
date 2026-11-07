// The `background` props group: what is painted behind the lines. A Zod fragment like the ones in
// `src/schema`, so the Props sidebar renders it as controls; the order and descriptions are the UI.
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';

export const BACKGROUND_KINDS = ['color', 'image', 'video', 'gradient'] as const;
export const BACKGROUND_FITS = ['cover', 'contain'] as const;
export const KEN_BURNS = ['none', 'slow-zoom'] as const;
/** @deprecated The values saved before this design; `migrateMushafProps()` maps them to slow-zoom. */
export const LEGACY_KEN_BURNS = ['pan-left', 'pan-right'] as const;

/**
 * The glow behind the lines that breathed with the recitation.
 *
 * @deprecated No longer part of `backgroundSchema`: nothing reacts to the audio level any more.
 * `migrateMushafProps()` turns an enabled glow into a vignette. Kept exported, unused, until the
 * next breaking release.
 */
export const glowSchema = z.object({
  enabled: z
    .boolean()
    .describe('A soft glow behind the lines that pulses with the recitation (analyses the whole recording)'),
  /** Colour of the glow. */
  color: zColor(),
  /** Opacity at the loudest frame; a silent frame keeps 35% of it, so the glow never blinks out. */
  strength: z.number().min(0).max(1).step(0.05).describe('Opacity of the glow at the loudest moment'),
});

export const gradientSchema = z.object({
  /** First colour of the gradient. */
  from: zColor(),
  /** Second colour of the gradient. */
  to: zColor(),
  /** CSS `linear-gradient()` angle: 0 runs bottom to top, 90 left to right, 180 top to bottom. */
  angle: z.number().int().min(0).max(360).step(5).describe('Direction of the gradient in degrees (180: top to bottom)'),
});

export const backgroundSchema = z.object({
  kind: z
    .enum(BACKGROUND_KINDS)
    .describe('Background: a colour (color paints layout.background), an image, a looping video or a gradient'),
  /**
   * Painted under an image, a video or a gradient, so it also fills the bars a `contain` image or
   * video leaves. The `'color'` kind paints `layout.background` instead: the page colour stays there.
   */
  color: zColor(),
  /** A `public/` path or an http(s) URL; read for `image` and `video` only. */
  src: z
    .string()
    .describe(
      'Image or video: a path in public/ or a URL (wins over layout.backgroundImage; empty: an image falls back to it, else the colour only)',
    ),
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
  /**
   * Opacity of a darkening layer over the background. An image or a video keeps a floor: black at
   * 0.45 or more under light ink, a veil of the page colour at 0.55 or more under dark ink.
   */
  dim: z
    .number()
    .min(0)
    .max(1)
    .step(0.05)
    .describe(
      'Darken the background (image and video keep at least 0.45 under light ink, a 0.55 page veil under dark ink)',
    ),
  /** The darkening toward the edges, 0-0.4: black on a dark ground, a darker shade of the page on a light one. */
  vignette: z
    .number()
    .min(0)
    .max(0.4)
    .step(0.02)
    .describe('Soft darkening toward the edges, like the fall-off of a page (0: none)'),
  kenBurns: z.enum(KEN_BURNS).describe('Image or video: a very slow zoom over the whole video (none: still)'),
  /** The zoom at the end of `slow-zoom`, from 1, eased over the whole video. */
  kenBurnsScale: z
    .number()
    .min(1)
    .max(1.05)
    .step(0.01)
    .describe('Image or video: the zoom at the end of slow-zoom (at most 1.05)'),
  gradient: gradientSchema.describe('Gradient: its two colours and direction'),
});

export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];
export type BackgroundFit = (typeof BACKGROUND_FITS)[number];
export type KenBurns = (typeof KEN_BURNS)[number];
export type Glow = z.infer<typeof glowSchema>;
export type Gradient = z.infer<typeof gradientSchema>;
export type Background = z.infer<typeof backgroundSchema>;

/** The page colour of `defaultLayout`, nothing moving, no vignette; when a gradient is picked, the ground darkening downward. */
export const defaultBackground: Background = {
  kind: 'color',
  color: '#f8f3e6',
  src: '',
  fit: 'cover',
  videoSeconds: 0,
  blur: 0,
  dim: 0,
  vignette: 0,
  kenBurns: 'none',
  kenBurnsScale: 1.04,
  gradient: {from: '#14191d', to: '#0b0e10', angle: 180},
};

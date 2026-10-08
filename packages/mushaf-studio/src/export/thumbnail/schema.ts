import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {
  customThemeSchema,
  dataSchema,
  defaultCustomTheme,
  defaultLayout,
  defaultOverlay,
  fontsSchema,
  themeNameSchema,
} from '../../schema';

/** The thumbnail's size: YouTube's recommended 1280×720. */
export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;

/**
 * The props of `<MushafThumbnail>`, a still for the video's thumbnail: the surah's name in its
 * printed frame, the first printed line of the passage, a title and a subtitle over a colour or an
 * image. `resolved` is filled by `calculateMushafThumbnailMetadata()` and is not meant to be edited.
 */
export const mushafThumbnailSchema = z.object({
  surah: z.number().int().min(1).max(114).describe('Surah'),
  fromAyah: z.number().int().min(1).max(286).describe('First ayah: its first printed line is the one shown'),
  /** 0: to the end of the surah. Only the subtitle reads it. */
  toAyah: z.number().int().min(0).max(286).describe('Last ayah, for the subtitle (0: end of the surah)'),
  title: z.string().describe('Title line, such as the reciter’s name (empty: none)'),
  /** Empty: the surah and the range, "Al-Fatihah · 1:2–7". */
  subtitle: z.string().describe('Subtitle (empty: the surah and the ayah range)'),
  theme: themeNameSchema,
  customTheme: customThemeSchema,
  fonts: fontsSchema,
  data: dataSchema,
  background: zColor().describe('Background colour'),
  /** A `public/` path or an https URL, drawn over the colour and cropped to the frame. */
  backgroundImage: z.string().describe('Background image in public/ (empty: none)'),
  color: zColor().describe('Colour of the texts and the surah name (and the line under the plain theme)'),
  font: z.string().describe('CSS font family of the title and subtitle'),
  /** px. */
  titleSize: z.number().int().min(16).max(160).describe('Title size in px'),
  /** px. */
  subtitleSize: z.number().int().min(12).max(120).describe('Subtitle size in px'),
  /** px: the line and the surah name's frame span the width between them. */
  marginX: z.number().int().min(0).max(400).step(10).describe('Side margins in px'),
  resolved: z.any().nullable().describe('Filled by calculateMetadata'),
});

export type MushafThumbnailProps = z.infer<typeof mushafThumbnailSchema>;

/** Al-Fatihah on the page colour, its opening line under the framed name, the range as the subtitle. */
export const defaultMushafThumbnailProps: MushafThumbnailProps = {
  surah: 1,
  fromAyah: 1,
  toAyah: 7,
  title: '',
  subtitle: '',
  theme: 'normal',
  customTheme: defaultCustomTheme,
  fonts: 'fallback',
  data: 'mirror',
  background: defaultLayout.background,
  backgroundImage: '',
  color: defaultLayout.color,
  font: defaultOverlay.font,
  titleSize: 56,
  subtitleSize: 34,
  marginX: 80,
  resolved: null,
};

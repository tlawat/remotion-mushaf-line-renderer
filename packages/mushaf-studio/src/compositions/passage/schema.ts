import {z} from 'zod';
import {
  animationSchema,
  customThemeSchema,
  dataSchema,
  defaultAnimation,
  defaultCustomTheme,
  defaultLayout,
  defaultText,
  fontsSchema,
  layoutSchema,
  textSchema,
  themeNameSchema,
} from '../../schema';

/**
 * The props of `<MushafPassage>`: a text-only passage, no audio. Each line holds `holdSeconds`,
 * entering and leaving with the chosen animation, in a window or one at a time. `resolved` is
 * filled by `calculateMetadata()` and is not meant to be edited.
 */
export const mushafPassageSchema = z.object({
  surah: z.number().int().min(1).max(114).describe('Surah'),
  fromAyah: z.number().int().min(1).max(286).describe('First ayah'),
  /** 0: to the end of the surah. */
  toAyah: z.number().int().min(0).max(286).describe('Last ayah (0: end of the surah)'),
  slice: z.boolean().describe('Hide the neighbours’ words on the first and last lines'),
  holdSeconds: z.number().min(0.5).max(30).step(0.5).describe('Seconds each line stays'),
  theme: themeNameSchema,
  customTheme: customThemeSchema,
  fonts: fontsSchema,
  data: dataSchema,
  layout: layoutSchema,
  animation: animationSchema,
  text: textSchema,
  resolved: z.any().nullable().describe('Filled by calculateMetadata'),
});

export type MushafPassageProps = z.infer<typeof mushafPassageSchema>;

/** Defaults that work out of the box: the opening of At-Tawbah (no basmalah), four seconds a line. */
export const defaultMushafPassageProps: MushafPassageProps = {
  surah: 9,
  fromAyah: 1,
  toAyah: 5,
  slice: true,
  holdSeconds: 4,
  theme: 'normal',
  customTheme: defaultCustomTheme,
  fonts: 'fallback',
  data: 'mirror',
  layout: defaultLayout,
  animation: defaultAnimation,
  text: defaultText,
  resolved: null,
};

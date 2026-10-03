// Contract of the passage composition (workstream 4): a text-only passage, no audio. Each line
// holds `holdSeconds`, entering and leaving with the chosen animation, in a window or one at a time.

import type * as React from 'react';
import type {CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {
  animationSchema,
  customThemeSchema,
  defaultAnimation,
  defaultCustomTheme,
  defaultLayout,
  defaultText,
  fontsSchema,
  layoutSchema,
  textSchema,
  themeNameSchema,
} from '../../schema';

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
  layout: layoutSchema,
  animation: animationSchema,
  text: textSchema,
  resolved: z.any().nullable().describe('Filled by calculateMetadata'),
});

export type MushafPassageProps = z.infer<typeof mushafPassageSchema>;

export const defaultMushafPassageProps: MushafPassageProps = {
  surah: 9,
  fromAyah: 1,
  toAyah: 5,
  slice: true,
  holdSeconds: 4,
  theme: 'normal',
  customTheme: defaultCustomTheme,
  fonts: 'fallback',
  layout: defaultLayout,
  animation: defaultAnimation,
  text: defaultText,
  resolved: null,
};

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet (workstream 4).`);
};

export const calculateMushafPassageMetadata: CalculateMetadataFunction<MushafPassageProps> = () =>
  notImplemented('calculateMushafPassageMetadata');

export const MushafPassage: React.FC<MushafPassageProps> = () => notImplemented('MushafPassage');

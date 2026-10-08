// The `audio` props group: how the recitation is cleaned up on its way out. A Zod fragment like the
// ones in `src/schema`, so the Props sidebar renders it as controls; the order and descriptions are the UI.
import {z} from 'zod';

export const audioSchema = z.object({
  /** Measured in `calculateMetadata()` (`analyzeAudio()`), applied as a gain that keeps the true peak under -1 dBFS. */
  normalize: z.boolean().describe('Bring the recitation to the target loudness'),
  /** -14 is what YouTube and most social platforms play at; -23 is EBU R 128 broadcast. */
  targetLufs: z
    .number()
    .min(-23)
    .max(-9)
    .step(1)
    .describe('Target loudness in LUFS (-14: YouTube and social media, -23: broadcast)'),
  fadeInSeconds: z.number().min(0).max(5).step(0.1).describe('Fade the audio in over this many seconds'),
  fadeOutSeconds: z.number().min(0).max(5).step(0.1).describe('Fade the audio out over this many seconds at the end'),
  /** Starts the audio later in the file, never past the first word's entrance; the timings move with it. */
  trimSilence: z.boolean().describe('Skip the silence before the first word'),
  /** On top of the normalisation gain. */
  volume: z.number().min(0).max(2).step(0.05).describe('Volume (1: as normalised, 2: twice as loud)'),
});

export type AudioSettings = z.infer<typeof audioSchema>;

/** Normalised to -14 LUFS, a short fade in and a one-second fade out, the file's own lead-in kept. */
export const defaultAudio: AudioSettings = {
  normalize: true,
  targetLufs: -14,
  fadeInSeconds: 0.3,
  fadeOutSeconds: 1,
  trimSilence: false,
  volume: 1,
};

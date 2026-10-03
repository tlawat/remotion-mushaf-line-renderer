// Contract of the recitation composition (workstream 4). Implement calculate-metadata.ts,
// resolve.ts and MushafRecitation.tsx; keep these exports and signatures.

import type * as React from 'react';
import type {CalculateMetadataFunction} from 'remotion';
import type {ResolvedRecitation} from '../../types';
import type {MushafRecitationProps} from './schema';

export type {MushafRecitationProps} from './schema';
export {defaultMushafRecitationProps, mushafRecitationSchema} from './schema';

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet (workstream 4).`);
};

/**
 * Resolves the content props once: fetches and validates the timings, trims them to the ayah
 * range, finds the lines (`getMushafLines(recitedRange(...))`, sliced), applies the splits,
 * schedules the lines, loads the translation and gloss files, and marks the doubtful words.
 * Pure given `fetch`; `calculateMetadata()` is this plus the size and duration.
 */
export const resolveRecitation = (
  _props: MushafRecitationProps,
  _options: {
    readonly fetch?: typeof fetch | undefined;
    readonly staticFile?: ((path: string) => string) | undefined;
  } = {},
): Promise<ResolvedRecitation> => notImplemented('resolveRecitation');

/** `calculateMetadata` for `<Composition id="MushafRecitation">`: `resolved`, width and height from the aspect, duration from the timings. */
export const calculateMushafRecitationMetadata: CalculateMetadataFunction<MushafRecitationProps> = () =>
  notImplemented('calculateMushafRecitationMetadata');

/**
 * The flagship composition: the printed lines of a recited passage follow the audio, one line at a
 * time or through a line window, with the current word highlighted, an ayah translation and a
 * word gloss, and (in the Studio) the doubtful words marked and the Mushaf panel docked.
 */
export const MushafRecitation: React.FC<MushafRecitationProps> = () => notImplemented('MushafRecitation');

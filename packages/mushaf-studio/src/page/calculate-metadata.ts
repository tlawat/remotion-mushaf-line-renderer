import type {CalculateMetadataFunction} from 'remotion';
import {recitationDuration} from '../compositions/recitation/calculate-metadata';
import {STUDIO_FPS} from '../compositions/shared';
import {sizeForAspect} from '../schema';
import {resolvePage} from './resolve';
import type {MushafPageProps} from './schema';

/**
 * `calculateMetadata` for `<Composition id="MushafPage">`: `resolved`, width and height from the
 * aspect, duration from the timings (the last ayah's end plus a second). `abortSignal` reaches
 * every fetch.
 */
export const calculateMushafPageMetadata: CalculateMetadataFunction<MushafPageProps> = async ({props, abortSignal}) => {
  const resolved = await resolvePage(props, {signal: abortSignal});
  return {
    props: {...props, resolved},
    ...sizeForAspect(props.layout.aspect),
    fps: STUDIO_FPS,
    durationInFrames: recitationDuration(resolved.timings, STUDIO_FPS),
  };
};

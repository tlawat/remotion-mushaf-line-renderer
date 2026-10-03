import type {RecitationTimings} from '@tlawat/remotion-mushaf-line';
import type {CalculateMetadataFunction} from 'remotion';
import {sizeForAspect} from '../../schema';
import {resolveRecitation} from './resolve';
import type {MushafRecitationProps} from './schema';

/** The compositions' frame rate: what the Root declares, and what `durationInFrames` is counted in. */
export const STUDIO_FPS = 30;

/** Frames for a recitation: the last ayah's end plus one second, for the last line to leave. */
export const recitationDuration = (timings: RecitationTimings, fps: number): number =>
  Math.max(1, Math.ceil((timings.ayat[timings.ayat.length - 1]!.end + 1) * fps));

/** `calculateMetadata` for `<Composition id="MushafRecitation">`: `resolved`, width and height from the aspect, duration from the timings. */
export const calculateMushafRecitationMetadata: CalculateMetadataFunction<MushafRecitationProps> = async ({props}) => {
  const resolved = await resolveRecitation(props);
  return {
    props: {...props, resolved},
    ...sizeForAspect(props.layout.aspect),
    fps: STUDIO_FPS,
    durationInFrames: recitationDuration(resolved.timings, STUDIO_FPS),
  };
};

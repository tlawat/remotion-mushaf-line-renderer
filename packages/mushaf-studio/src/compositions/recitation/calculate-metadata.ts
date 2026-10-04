import type {RecitationTimings} from '@tlawat/remotion-mushaf-line';
import type {CalculateMetadataFunction} from 'remotion';
import {isIdentityTimeline, timelineDuration} from '../../memorize/timeline';
import {sizeForAspect} from '../../schema';
import {STUDIO_FPS} from '../shared';
import {resolveRecitation} from './resolve';
import type {MushafRecitationProps} from './schema';

// The frame rate lives in `../shared`; it stays importable from here for the modules that found it here.
export {STUDIO_FPS};

/** Frames for a recitation: the last ayah's end plus one second, for the last line to leave. */
export const recitationDuration = (timings: RecitationTimings, fps: number): number =>
  Math.max(1, Math.ceil((timings.ayat[timings.ayat.length - 1]!.end + 1) * fps));

/**
 * `calculateMetadata` for `<Composition id="MushafRecitation">`: `resolved`, width and height from
 * the aspect, duration from the timings (moved `audioOffsetSeconds` earlier, so it is the audio's
 * from the trim on), or from the clip timeline when `memorize` repeats the ayahs. `abortSignal`
 * reaches every fetch.
 */
export const calculateMushafRecitationMetadata: CalculateMetadataFunction<MushafRecitationProps> = async ({
  props,
  abortSignal,
}) => {
  const resolved = await resolveRecitation(props, {signal: abortSignal});
  return {
    props: {...props, resolved},
    ...sizeForAspect(props.layout.aspect),
    fps: STUDIO_FPS,
    durationInFrames: isIdentityTimeline(resolved.clips)
      ? recitationDuration(resolved.timings, STUDIO_FPS)
      : timelineDuration(resolved.clips, STUDIO_FPS),
  };
};

import type {CalculateMetadataFunction} from 'remotion';
import {recitationDuration, STUDIO_FPS} from '../compositions/recitation/calculate-metadata';
import {isIdentityTimeline, timelineDuration} from '../memorize/timeline';
import {sizeForAspect} from '../schema';
import {resolveAyahText} from './resolve';
import type {MushafAyahTextProps} from './schema';

/**
 * `calculateMetadata` for `<Composition id="MushafAyahText">`: `resolved`, width and height from
 * the aspect, 30 fps, and the duration from the timings (the last ayah's end plus one second, for
 * it to leave), or from the clip timeline when `memorize` repeats the ayahs.
 */
export const calculateMushafAyahTextMetadata: CalculateMetadataFunction<MushafAyahTextProps> = async ({props}) => {
  const resolved = await resolveAyahText(props);
  return {
    props: {...props, resolved},
    ...sizeForAspect(props.layout.aspect),
    fps: STUDIO_FPS,
    durationInFrames: isIdentityTimeline(resolved.clips)
      ? recitationDuration(resolved.timings, STUDIO_FPS)
      : timelineDuration(resolved.clips, STUDIO_FPS),
  };
};

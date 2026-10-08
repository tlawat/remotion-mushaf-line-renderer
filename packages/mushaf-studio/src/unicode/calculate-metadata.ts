import {type CalculateMetadataFunction, staticFile} from 'remotion';
import {backgroundVideoSecondsFor, endCardFrames, resolveAudioCleanup} from '../compositions/extras';
import {recitationDuration, STUDIO_FPS} from '../compositions/recitation/calculate-metadata';
import {isIdentityTimeline, timelineDuration} from '../memorize/timeline';
import {sizeForAspect} from '../schema';
import {type ResolvedAyahText, resolveAyahText, skipAyahTextStart} from './resolve';
import type {MushafAyahTextProps} from './schema';

/**
 * The audio cleanup of a resolved ayah text (`resolveAudioCleanup()`): its gain, levels and the
 * silence skipped (never past the first ayah's lead-in), the timings moved by that silence
 * (`skipAyahTextStart()`). With the reason in `audioWarning` when the audio could not be analysed,
 * and in `audioSrc` the clip the timings name when `audioFile` is missing from `public/`
 * (`resolveAudioSource()`).
 */
export const withAyahTextAudio = async (
  props: MushafAyahTextProps,
  resolved: ResolvedAyahText,
  options: {readonly fps: number; readonly signal?: AbortSignal | undefined},
): Promise<ResolvedAyahText> => {
  const {timings} = resolved;
  const {audio, warning, src} = await resolveAudioCleanup({
    audioFile: props.audioFile,
    audio: props.audio,
    background: props.background,
    offsetSeconds: resolved.audioOffsetSeconds ?? 0,
    latestSeconds: timings.ayat[0]!.start - props.animation.leadInSeconds,
    endSeconds: timings.ayat[timings.ayat.length - 1]!.end,
    fps: options.fps,
    staticFile,
    signal: options.signal,
    sidecar: timings.alignment,
  });
  return {
    ...skipAyahTextStart(resolved, audio.trimSeconds, props.memorize),
    audio,
    audioWarning: warning,
    audioSrc: src,
  };
};

/**
 * `calculateMetadata` for `<Composition id="MushafAyahText">`: `resolved` (the content, the audio's
 * analysis when `audio` or the background's glow needs it, a background video's length), width and
 * height from the aspect, 30 fps, and the duration from the timings (the last ayah's end plus one
 * second, for it to leave), or from the clip timeline when `memorize` repeats the ayahs, plus the
 * end card's seconds.
 */
export const calculateMushafAyahTextMetadata: CalculateMetadataFunction<MushafAyahTextProps> = async ({
  props,
  abortSignal,
}) => {
  const content = await resolveAyahText(props);
  const [resolved, backgroundVideoSeconds] = await Promise.all([
    withAyahTextAudio(props, content, {fps: STUDIO_FPS, signal: abortSignal}),
    backgroundVideoSecondsFor(props.background, staticFile),
  ]);
  const recitation = isIdentityTimeline(resolved.clips)
    ? recitationDuration(resolved.timings, STUDIO_FPS)
    : timelineDuration(resolved.clips, STUDIO_FPS);
  return {
    props: {...props, resolved: {...resolved, backgroundVideoSeconds}},
    ...sizeForAspect(props.layout.aspect),
    fps: STUDIO_FPS,
    durationInFrames: recitation + endCardFrames(props.endCard, STUDIO_FPS),
  };
};

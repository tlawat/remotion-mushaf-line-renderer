import {enterTiming, type RecitationTimings} from '@tlawat/remotion-mushaf-line';
import {type CalculateMetadataFunction, staticFile} from 'remotion';
import {isIdentityTimeline, timelineDuration} from '../../memorize/timeline';
import {sizeForAspect} from '../../schema';
import {backgroundVideoSecondsFor, endCardFrames, resolveAudioCleanup} from '../extras';
import {STUDIO_FPS} from '../shared';
import {type ResolvedRecitationWithClips, resolveRecitation, skipRecitationStart} from './resolve';
import type {MushafRecitationProps} from './schema';

// The frame rate lives in `../shared`; it stays importable from here for the modules that found it here.
export {STUDIO_FPS};

/** Frames for a recitation: the last ayah's end plus one second, for the last line to leave. */
export const recitationDuration = (timings: RecitationTimings, fps: number): number =>
  Math.max(1, Math.ceil((timings.ayat[timings.ayat.length - 1]!.end + 1) * fps));

/** Seconds the package's default entrance takes: a line starts to come in this long before it is in place. */
export const enterSeconds = (fps: number): number => enterTiming().getDurationInFrames({fps}) / fps;

/**
 * The audio cleanup of a resolved recitation (`resolveAudioCleanup()`): its gain, levels and the
 * silence skipped, the timings moved by that silence (`skipRecitationStart()`), never past the
 * first line's entrance. With the reason in `audioWarning` when the audio could not be analysed,
 * and in `audioSrc` the clip the timings name when `audioFile` is missing from `public/`
 * (`resolveAudioSource()`).
 */
export const withRecitationAudio = async (
  props: MushafRecitationProps,
  resolved: ResolvedRecitationWithClips,
  options: {readonly fps: number; readonly signal?: AbortSignal | undefined},
): Promise<ResolvedRecitationWithClips> => {
  const {timings, schedule} = resolved;
  const {audio, warning, src} = await resolveAudioCleanup({
    audioFile: props.audioFile,
    audio: props.audio,
    background: props.background,
    offsetSeconds: resolved.audioOffsetSeconds,
    latestSeconds: (schedule[0]?.start ?? 0) - props.animation.leadInSeconds - enterSeconds(options.fps),
    endSeconds: timings.ayat[timings.ayat.length - 1]!.end,
    fps: options.fps,
    staticFile,
    signal: options.signal,
    sidecar: timings.alignment,
  });
  return {
    ...skipRecitationStart(resolved, audio.trimSeconds, props.memorize),
    audio,
    audioWarning: warning,
    audioSrc: src,
  };
};

/**
 * `calculateMetadata` for `<Composition id="MushafRecitation">`: `resolved` (the content, the
 * audio's analysis when `audio` or the background's glow needs it, a background video's length),
 * width and height from the aspect, duration from the timings (moved `audioOffsetSeconds` earlier,
 * so it is the audio's from the trim on), or from the clip timeline when `memorize` repeats the
 * ayahs, plus the end card's seconds. `abortSignal` reaches every fetch.
 */
export const calculateMushafRecitationMetadata: CalculateMetadataFunction<MushafRecitationProps> = async ({
  props,
  abortSignal,
}) => {
  const content = await resolveRecitation(props, {signal: abortSignal});
  const [resolved, backgroundVideoSeconds] = await Promise.all([
    withRecitationAudio(props, content, {fps: STUDIO_FPS, signal: abortSignal}),
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

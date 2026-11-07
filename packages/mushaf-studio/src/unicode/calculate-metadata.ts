import {type CalculateMetadataFunction, staticFile} from 'remotion';
import {followsHostAudio} from '../audio/host';
import {backgroundVideoSecondsFor, endCardFrames, resolveAudioCleanup} from '../compositions/extras';
import {type ResolvedProps, type ResolvePropsOptions, STUDIO_FPS} from '../compositions/recitation/calculate-metadata';
import {linesEndFrame, recitationEndSeconds} from '../compositions/recitation/transitions';
import {clipTimeline} from '../memorize/timeline';
import {markerIds, migrateMushafProps, sizeForAspect} from '../schema';
import {type ResolvedAyahText, resolveAyahText, skipAyahTextStart} from './resolve';
import {defaultMushafAyahTextProps, type MushafAyahTextProps} from './schema';

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
    offsetSeconds: resolved.audioOffsetSeconds ?? 0,
    latestSeconds: timings.ayat[0]!.start - props.animation.leadInSeconds,
    endSeconds: timings.ayat[timings.ayat.length - 1]!.end,
    fps: options.fps,
    staticFile,
    signal: options.signal,
    sidecar: timings.alignment,
    hostAudio: followsHostAudio(props),
  });
  return {
    ...skipAyahTextStart(resolved, audio.trimSeconds, props.memorize),
    audio,
    audioWarning: warning,
    audioSrc: src,
  };
};

/**
 * Frames of an ayah text before its end card: the last word's end (`recitationEndSeconds()`, the
 * ayah-end rosette left out; the last clip's when ayahs repeat), the end hold and the ayah's fade
 * (`linesEndFrame()`), as `ayahTextPlan()` ends the last ayah.
 */
export const ayahTextContentFrames = (
  resolved: Pick<ResolvedAyahText, 'timings' | 'clips' | 'ayahs'>,
  props: Pick<MushafAyahTextProps, 'animation' | 'memorize'>,
  fps: number,
): number =>
  Math.max(
    1,
    linesEndFrame(
      recitationEndSeconds(
        resolved.timings,
        resolved.clips ?? clipTimeline(resolved.timings, props.memorize),
        markerIds(resolved.ayahs),
      ),
      props.animation.tempo,
      fps,
    ),
  );

/**
 * `resolved` of `<MushafAyahText>` and its length at `fps`, the props migrated first (`migrateMushafProps()`): the content, the audio's analysis when
 * `audio` needs it, a background video's length; the duration to the last ayah's end hold and
 * fade (`ayahTextContentFrames()`), on the clip timeline when `memorize` repeats the ayahs, plus
 * the end card's seconds. No size.
 */
export const resolveAyahTextProps = async (
  saved: MushafAyahTextProps,
  options: ResolvePropsOptions,
): Promise<ResolvedProps<MushafAyahTextProps>> => {
  // First: props saved by an earlier Mushaf Studio (or sent by a host) render the current design.
  const props = migrateMushafProps<MushafAyahTextProps>(saved, {defaults: defaultMushafAyahTextProps});
  const {fps, signal} = options;
  const content = await resolveAyahText(props);
  const [resolved, backgroundVideoSeconds] = await Promise.all([
    withAyahTextAudio(props, content, {fps, signal}),
    backgroundVideoSecondsFor(props.background, staticFile),
  ]);
  return {
    props: {...props, resolved: {...resolved, backgroundVideoSeconds}},
    durationInFrames: ayahTextContentFrames(resolved, props, fps) + endCardFrames(props.endCard, fps),
  };
};

/**
 * `calculateMetadata` for `<Composition id="MushafAyahText">`: `resolveAyahTextProps()` at 30 fps
 * (`resolved`: the content, the audio's analysis when `audio` needs it, a
 * background video's length; the duration from the timings, or from the clip timeline when
 * `memorize` repeats the ayahs, plus the end card's seconds), width and height from the aspect.
 */
export const calculateMushafAyahTextMetadata: CalculateMetadataFunction<MushafAyahTextProps> = async ({
  props,
  abortSignal,
}) => {
  const resolved = await resolveAyahTextProps(props, {fps: STUDIO_FPS, signal: abortSignal});
  return {...resolved, ...sizeForAspect(resolved.props.layout.aspect), fps: STUDIO_FPS};
};

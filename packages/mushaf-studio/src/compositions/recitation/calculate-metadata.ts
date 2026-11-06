import {enterTiming, type RecitationTimings} from '@tlawat/remotion-mushaf-line';
import {type CalculateMetadataFunction, staticFile} from 'remotion';
import {isIdentityTimeline, timelineDuration} from '../../memorize/timeline';
import {sizeForAspect} from '../../schema';
import {isInStudio} from '../../studio/environment';
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
 * Whether `calculateMetadata()` leaves out the splits that no longer fit rather than refusing them:
 * on the Studio's page (`isInStudio()`) and not for a server render (`isRendering`). That includes
 * the Studio's in-browser render (`@remotion/web-renderer`), which runs `calculateMetadata()` on the
 * Studio's page with `isRendering` false and reports itself only through `useRemotionEnvironment()`;
 * `<MushafRecitation>` refuses the splits there (`droppedSplitsError()`).
 */
export const previewsLeniently = (isRendering: boolean): boolean => !isRendering && isInStudio();

/** Options of the resolvers that `calculateMetadata()` and the drop-in slots share. */
export type ResolvePropsOptions = {
  /** The frame rate the durations, the audio's trim and the glow's levels are computed at. */
  readonly fps: number;
  /** `calculateMetadata()`'s `abortSignal`: reaches every fetch. */
  readonly signal?: AbortSignal | undefined;
  /** Leave out the splits that no longer fit (`resolved.droppedSplits`) instead of refusing them. */
  readonly lenientSplits?: boolean | undefined;
};

/** The props with `resolved` filled, and the composition's length in frames at the fps asked for. */
export type ResolvedProps<P> = {readonly props: P; readonly durationInFrames: number};

/**
 * `resolved` of `<MushafRecitation>` and its length at `fps`: the content, the audio's analysis
 * when `audio` or the background's glow needs it, a background video's length; the duration from
 * the timings (moved `audioOffsetSeconds` earlier), or from the clip timeline when `memorize`
 * repeats the ayahs, plus the end card's seconds. No size: `calculateMetadata()` adds it, a slot's
 * box decides it.
 */
export const resolveRecitationProps = async (
  props: MushafRecitationProps,
  options: ResolvePropsOptions,
): Promise<ResolvedProps<MushafRecitationProps>> => {
  const {fps, signal} = options;
  const content = await resolveRecitation(props, {signal, lenientSplits: options.lenientSplits});
  const [resolved, backgroundVideoSeconds] = await Promise.all([
    withRecitationAudio(props, content, {fps, signal}),
    backgroundVideoSecondsFor(props.background, staticFile),
  ]);
  const recitation = isIdentityTimeline(resolved.clips)
    ? recitationDuration(resolved.timings, fps)
    : timelineDuration(resolved.clips, fps);
  return {
    props: {...props, resolved: {...resolved, backgroundVideoSeconds}},
    durationInFrames: recitation + endCardFrames(props.endCard, fps),
  };
};

/**
 * `calculateMetadata` for `<Composition id="MushafRecitation">`: `resolveRecitationProps()` at 30
 * fps (`resolved`: the content, the audio's analysis when `audio` or the background's glow needs
 * it, a background video's length; the duration from the timings, or from the clip timeline when
 * `memorize` repeats the ayahs, plus the end card's seconds), width and height from the aspect.
 * `abortSignal` reaches every fetch. On the Studio's page a split that no longer fits is left out
 * (`resolved.droppedSplits`, `previewsLeniently()`); a server render refuses it here, the Studio's
 * in-browser render when `<MushafRecitation>` renders.
 */
export const calculateMushafRecitationMetadata: CalculateMetadataFunction<MushafRecitationProps> = async ({
  props,
  abortSignal,
  isRendering,
}) => {
  const resolved = await resolveRecitationProps(props, {
    fps: STUDIO_FPS,
    signal: abortSignal,
    lenientSplits: previewsLeniently(isRendering),
  });
  return {...resolved, ...sizeForAspect(props.layout.aspect), fps: STUDIO_FPS};
};

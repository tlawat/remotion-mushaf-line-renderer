import {type CalculateMetadataFunction, staticFile} from 'remotion';
import {backgroundVideoSecondsFor, endCardFrames, resolveAudioCleanup} from '../compositions/extras';
import {
  type ResolvedProps,
  type ResolvePropsOptions,
  recitationDuration,
} from '../compositions/recitation/calculate-metadata';
import {STUDIO_FPS} from '../compositions/shared';
import {sizeForAspect} from '../schema';
import {PAGE_LEAD_IN_SECONDS, type ResolvedPage, resolvePage, skipPageStart} from './resolve';
import type {MushafPageProps} from './schema';

/**
 * The audio cleanup of a resolved page (`resolveAudioCleanup()`): its gain, levels and the silence
 * skipped (never past the first line's lead-in), the timings and pages moved by that silence
 * (`skipPageStart()`). With the reason in `audioWarning` when the audio could not be analysed, and
 * in `audioSrc` the clip the timings name when `audioFile` is missing from `public/`
 * (`resolveAudioSource()`).
 */
export const withPageAudio = async (
  props: MushafPageProps,
  resolved: ResolvedPage,
  options: {readonly fps: number; readonly signal?: AbortSignal | undefined},
): Promise<ResolvedPage> => {
  const {timings} = resolved;
  const {audio, warning, src} = await resolveAudioCleanup({
    audioFile: props.audioFile,
    audio: props.audio,
    background: props.background,
    offsetSeconds: resolved.audioOffsetSeconds,
    latestSeconds: (resolved.lines[0]?.start ?? 0) - PAGE_LEAD_IN_SECONDS,
    endSeconds: timings.ayat[timings.ayat.length - 1]!.end,
    fps: options.fps,
    staticFile,
    signal: options.signal,
    sidecar: timings.alignment,
  });
  return {
    ...skipPageStart(resolved, audio.trimSeconds, props.pageView.turnSeconds),
    audio,
    audioWarning: warning,
    audioSrc: src,
  };
};

/**
 * `resolved` of `<MushafPage>` and its length at `fps`: the pages, the translations, the audio's
 * analysis when `audio` or the background's glow needs it, the end card's content, a background
 * video's length; the duration from the timings (the last ayah's end plus a second) plus the end
 * card's seconds. No size.
 */
export const resolvePageProps = async (
  props: MushafPageProps,
  options: ResolvePropsOptions,
): Promise<ResolvedProps<MushafPageProps>> => {
  const {fps, signal} = options;
  const content = await resolvePage(props, {signal});
  const [resolved, backgroundVideoSeconds] = await Promise.all([
    withPageAudio(props, content, {fps, signal}),
    backgroundVideoSecondsFor(props.background, staticFile),
  ]);
  return {
    props: {...props, resolved: {...resolved, backgroundVideoSeconds}},
    durationInFrames: recitationDuration(resolved.timings, fps) + endCardFrames(props.endCard, fps),
  };
};

/**
 * `calculateMetadata` for `<Composition id="MushafPage">`: `resolvePageProps()` at 30 fps
 * (`resolved`: the pages, the translations, the audio's analysis when `audio` or the background's
 * glow needs it, the end card's content, a background video's length; the duration from the
 * timings plus the end card's seconds), width and height from the aspect. `abortSignal` reaches
 * every fetch.
 */
export const calculateMushafPageMetadata: CalculateMetadataFunction<MushafPageProps> = async ({props, abortSignal}) => {
  const resolved = await resolvePageProps(props, {fps: STUDIO_FPS, signal: abortSignal});
  return {...resolved, ...sizeForAspect(props.layout.aspect), fps: STUDIO_FPS};
};

import {enterTiming, normalizeTimings, type RecitationTimings} from '@tlawat/remotion-mushaf-line';
import {type CalculateMetadataFunction, staticFile} from 'remotion';
import {followsHostAudio} from '../../audio/host';
import {showsIntro} from '../../overlay/TitleOverlay';
import {type Animation, migrateMushafProps, type Overlay, sizeForAspect} from '../../schema';
import {tempoSeconds} from '../../schema/tokens';
import {isInStudio} from '../../studio/environment';
import {backgroundVideoSecondsFor, endCardFrames, resolveAudioCleanup} from '../extras';
import {STUDIO_FPS} from '../shared';
import {
  delayRecitationStart,
  type ResolvedRecitationWithClips,
  resolveRecitation,
  skipRecitationStart,
} from './resolve';
import {defaultMushafRecitationProps, type MushafRecitationProps} from './schema';
import {linesEndFrame, recitationEndSeconds} from './transitions';

// The frame rate lives in `../shared`; it stays importable from here for the modules that found it here.
export {STUDIO_FPS};

/** Frames for a recitation: the last ayah's end plus one second, for the last line to leave. */
export const recitationDuration = (timings: RecitationTimings, fps: number): number =>
  Math.max(1, Math.ceil((timings.ayat[timings.ayat.length - 1]!.end + 1) * fps));

/** Float noise from a sum rounded off at the microsecond, finer than any aligner. */
const roundTime = (seconds: number): number => Math.round(seconds * 1e6) / 1e6;

/**
 * Seconds the recording starts later in the video so the intro card has its time (render-design.md
 * 5.6): with the card on (`title` `intro` or `both`), `introSeconds + cardIn + leadInSeconds −
 * firstWordSeconds`, never negative, `cardIn` at the tempo (0.8 s calm, 1.13 s slow). So the card
 * stays its whole `introSeconds`, and the lines come in after it, settled `leadInSeconds` before the
 * first word. 0 without the card.
 *
 * `introDelaySeconds({title: 'intro', introSeconds: 3}, {tempo: 'calm', leadInSeconds: 0.4}, 0.331)` is 3.869.
 */
export const introDelaySeconds = (
  overlay: Pick<Overlay, 'title' | 'introSeconds'>,
  animation: Pick<Animation, 'tempo' | 'leadInSeconds'>,
  firstWordSeconds: number,
): number =>
  showsIntro(overlay.title)
    ? Math.max(
        0,
        roundTime(
          overlay.introSeconds + tempoSeconds('cardIn', animation.tempo) + animation.leadInSeconds - firstWordSeconds,
        ),
      )
    : 0;

/** When the first word of timings is heard: the first ayah's first timed word, else the ayah's start. */
export const firstWordSeconds = (timings: RecitationTimings): number => {
  const first = normalizeTimings(timings).ayat[0];
  return first?.words?.[0]?.start ?? first?.start ?? 0;
};

/**
 * `resolved` with the intro card's time put before the recording (`delayRecitationStart()` by
 * `introDelaySeconds()`), once, after every skip of the recording's start: the timings, the
 * schedule and the clip timeline move later, and the audio starts there. Not under `hostAudio`:
 * the template's track decides when the recording is heard, so nothing can wait for the card.
 */
export const withIntroDelay = (
  props: MushafRecitationProps,
  resolved: ResolvedRecitationWithClips,
): ResolvedRecitationWithClips =>
  followsHostAudio(props)
    ? resolved
    : delayRecitationStart(
        resolved,
        introDelaySeconds(props.overlay, props.animation, firstWordSeconds(resolved.timings)),
        props.memorize,
      );

/**
 * Frames of a recitation before its end card: the last ayah's end (the last clip's when ayahs
 * repeat), the end hold and the lines' fade (`linesEndFrame()`).
 */
export const recitationContentFrames = (
  resolved: Pick<ResolvedRecitationWithClips, 'timings' | 'clips'>,
  tempo: Animation['tempo'],
  fps: number,
): number => Math.max(1, linesEndFrame(recitationEndSeconds(resolved.timings, resolved.clips), tempo, fps));

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
    offsetSeconds: resolved.audioOffsetSeconds,
    latestSeconds:
      (schedule[0]?.start ?? 0) - props.animation.leadInSeconds - tempoSeconds('windowIn', props.animation.tempo),
    endSeconds: timings.ayat[timings.ayat.length - 1]!.end,
    fps: options.fps,
    staticFile,
    signal: options.signal,
    sidecar: timings.alignment,
    hostAudio: followsHostAudio(props),
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
 * `resolved` of `<MushafRecitation>` and its length at `fps`, the props migrated first
 * (`migrateMushafProps()`): the content, the audio's analysis
 * when `audio` or the background's glow needs it, a background video's length; the duration from
 * the timings (moved `audioOffsetSeconds` earlier), or from the clip timeline when `memorize`
 * repeats the ayahs, plus the end card's seconds. No size: `calculateMetadata()` adds it, a slot's
 * box decides it.
 */
export const resolveRecitationProps = async (
  saved: MushafRecitationProps,
  options: ResolvePropsOptions,
): Promise<ResolvedProps<MushafRecitationProps>> => {
  const {fps, signal} = options;
  // First: props saved by an earlier Mushaf Studio (or sent by a host) render the current design.
  const props = migrateMushafProps<MushafRecitationProps>(saved, {defaults: defaultMushafRecitationProps});
  const content = await resolveRecitation(props, {signal, lenientSplits: options.lenientSplits});
  const [cleaned, backgroundVideoSeconds] = await Promise.all([
    withRecitationAudio(props, content, {fps, signal}),
    backgroundVideoSecondsFor(props.background, staticFile),
  ]);
  // Last: the intro card's time goes before the recording once every skip of its start is known.
  const resolved = withIntroDelay(props, cleaned);
  return {
    props: {...props, resolved: {...resolved, backgroundVideoSeconds}},
    durationInFrames: recitationContentFrames(resolved, props.animation.tempo, fps) + endCardFrames(props.endCard, fps),
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
  return {...resolved, ...sizeForAspect(resolved.props.layout.aspect), fps: STUDIO_FPS};
};

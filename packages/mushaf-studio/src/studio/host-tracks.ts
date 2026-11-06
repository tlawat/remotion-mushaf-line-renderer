// The template's own audio and video tracks, as the Studio's timeline places them, and the second
// of each heard at the recitation's frame 0: what Source's "A track in this video" offers and what
// `hostAudio.offsetSeconds` saves. Studio only: nothing registers a track during a render, and the
// track ids change on every mount, so the composition only ever reads the saved `hostAudio` props.
// The timing copies the Studio timeline's own (`@remotion/sdk`'s timeline calculator and
// `getTimelineMediaStartFrame()` in Remotion 4.0.539).
import {useMemo} from 'react';
import {useVideoConfig} from 'remotion';
import {OWN_AUDIO_NAME} from '../audio/host';
import {isHttpUrl} from '../compositions/shared';
import {type TimelineSequence, useTimelineSequences} from './remotion-internals';
import {staticFileList, trackCopyOf} from './studio-api';

/** Why a track is listed but cannot be followed: `hostAudio` keeps one offset, so the track must play at speed 1, once. */
export type HostTrackLimit = 'rate' | 'loop';

/** A track of the template the recitation could follow. */
export type HostAudioTrack = {
  /** The timeline's id: new on every mount, never saved. */
  readonly id: string;
  readonly kind: 'audio' | 'video';
  /** The URL the track plays (`staticFile()`'s, a URL, a `blob:`). */
  readonly src: string;
  /** What the timeline calls it: its `name`, else its file's. */
  readonly label: string;
  /**
   * As the timeline marks it (`muted`, or inside a `<Freeze>`). The Studio's preview marks a track
   * the template plays unmuted this way too, so it is passed on, never a reason to leave one out.
   */
  readonly muted: boolean;
  /** The composition frame the track starts at (before 0 when it is trimmed into the past). */
  readonly startFrame: number;
  /** Its media's speed against the composition's clock: its own rate times every enclosing sequence's. */
  readonly rate: number;
  readonly loops: boolean;
  /** The second of the track's file heard at the recitation's frame 0; negative when the track starts later. */
  readonly offsetSeconds: number;
  /** Why it cannot be followed, `null` when it can. */
  readonly limit: HostTrackLimit | null;
};

type Timing = {
  /** Where the sequence's frame 0 is on the composition's clock. */
  readonly start: number;
  /** The rate of its enclosing sequences together, at which its own frames run. */
  readonly parentRate: number;
  /** The rate its children run at: `parentRate` times its own. */
  readonly childRate: number;
  readonly loops: boolean;
  /** Whether it or an enclosing sequence is the composition's own audio. */
  readonly own: boolean;
};

const roundMs = (seconds: number): number => Math.round(seconds * 1000) / 1000;

/**
 * The template's audio and video tracks among the timeline's `sequences`, each with the second of
 * its file heard at composition frame `ownStart` (the recitation's frame 0) at `fps`. The
 * composition's own `<Audio>` is left out: a track named `OWN_AUDIO_NAME`, or inside a sequence of
 * that name (a trimmed `<Audio>` passes its `name` to the sequence it wraps itself in). A track
 * whose parent is not in the list (the registry mid-update) is left out rather than mistimed.
 */
export const hostAudioTracksOf = (
  sequences: readonly TimelineSequence[],
  options: {readonly ownStart: number; readonly fps: number},
): readonly HostAudioTrack[] => {
  const byId = new Map(sequences.map((sequence) => [sequence.id, sequence] as const));
  const timings = new Map<string, Timing | null>();
  const timingOf = (sequence: TimelineSequence, depth = 0): Timing | null => {
    if (timings.has(sequence.id)) return timings.get(sequence.id) ?? null;
    let timing: Timing | null = null;
    const parent = sequence.parent === null ? null : (byId.get(sequence.parent) ?? null);
    // A cycle or a missing parent is a registry caught between two updates.
    const parentTiming = parent === null || depth > 64 ? null : timingOf(parent, depth + 1);
    if (sequence.parent === null || parentTiming !== null) {
      // The timeline's cascadedStart: a child's `from` counts on its parent's clock, after its trim.
      const start =
        parent === null || parentTiming === null
          ? sequence.from
          : parentTiming.start + (sequence.from - parent.trimBefore) / parentTiming.childRate;
      const parentRate = parentTiming?.childRate ?? 1;
      timing = {
        start,
        parentRate,
        childRate: parentRate * sequence.sequencePlaybackRate,
        loops: sequence.loop || (parentTiming?.loops ?? false),
        own: sequence.displayName === OWN_AUDIO_NAME || (parentTiming?.own ?? false),
      };
    }
    timings.set(sequence.id, timing);
    return timing;
  };
  const tracks: HostAudioTrack[] = [];
  for (const sequence of sequences) {
    if ((sequence.type !== 'audio' && sequence.type !== 'video') || sequence.src === null) continue;
    const timing = timingOf(sequence);
    if (timing === null || timing.own) continue;
    const rate = sequence.playbackRate * timing.childRate;
    // The timeline's media frame at a composition frame F: the frame at the sequence's zero, plus
    // the frames since its start at the media's rate (an older entry has only startMediaFrom).
    const zero = sequence.mediaFrameAtSequenceZero ?? sequence.startMediaFrom;
    const mediaFrame = zero + (options.ownStart - timing.start) * rate;
    tracks.push({
      id: sequence.id,
      kind: sequence.type,
      src: sequence.src,
      label: sequence.displayName,
      muted: sequence.muted,
      startFrame: timing.start,
      rate,
      loops: timing.loops,
      offsetSeconds: roundMs(mediaFrame / options.fps),
      limit: timing.loops ? 'loop' : Math.abs(rate - 1) > 1e-9 ? 'rate' : null,
    });
  }
  return tracks;
};

/**
 * The template's tracks (`hostAudioTracksOf()`) on the Studio's timeline right now, timed from
 * `ownStart` (the panel's `frameOffset`) at the composition's fps. `[]` outside the Studio, where
 * nothing registers. Re-computed only when the timeline's list changes.
 */
export const useHostAudioTracks = (ownStart: number): readonly HostAudioTrack[] => {
  const sequences = useTimelineSequences();
  const {fps} = useVideoConfig();
  return useMemo(() => hostAudioTracksOf(sequences, {ownStart, fps}), [sequences, ownStart, fps]);
};

/** What `audioFileForTrack()` makes of a track's URL. */
export type TrackFile =
  /** A file of `public/`: its path, what `audioFile` takes. */
  | {readonly kind: 'public'; readonly path: string}
  /** A URL of another host: `audioFile` takes it as it is (renders need that host). */
  | {readonly kind: 'url'; readonly url: string}
  /** A `blob:` or `data:` URL, gone after a reload: its bytes must be written into `public/` first. */
  | {readonly kind: 'bytes'; readonly url: string};

const decodePath = (path: string): string =>
  path
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');

/**
 * The `audioFile` of a track's URL, as `staticFile()` made it: the file its bytes were written to
 * this session (`copyOf`, for a `blob:` or `data:` track used before), else the name of the
 * `public/` file whose `src` it is (`staticFiles`, the Studio's list; in the browser-hosted Studio
 * that `src` is itself a `blob:` URL), else the path after `staticBase` (the Studio's
 * `window.remotion_staticBase`), decoded segment by segment; an http(s) URL of the Studio's own
 * `origin` is read by its path the same way. Any other http(s) URL stays a URL; any other `blob:`
 * and `data:` need their bytes written. `null` for anything else (a relative path `staticFile()`
 * did not make).
 */
export const audioFileForTrack = (
  src: string,
  options: {
    readonly staticFiles: readonly {readonly name: string; readonly src: string}[];
    readonly staticBase?: string | null | undefined;
    readonly origin?: string | null | undefined;
    readonly copyOf?: ((src: string) => string | null) | undefined;
  },
): TrackFile | null => {
  const copy = options.copyOf?.(src) ?? null;
  if (copy !== null) return {kind: 'public', path: copy};
  const exact = options.staticFiles.find((file) => file.src === src);
  if (exact) return {kind: 'public', path: exact.name.replace(/^\/+/, '')};
  if (/^(blob|data):/i.test(src)) return {kind: 'bytes', url: src};
  let path = src;
  if (isHttpUrl(src)) {
    const url = new URL(src);
    if (!options.origin || url.origin !== options.origin) return {kind: 'url', url: src};
    path = url.pathname;
  }
  const named = options.staticFiles.find((file) => file.src === path);
  if (named) return {kind: 'public', path: named.name.replace(/^\/+/, '')};
  const base = options.staticBase ?? '';
  if (base !== '' && path.startsWith(`${base}/`))
    return {kind: 'public', path: decodePath(path.slice(base.length + 1))};
  return null;
};

/** The Studio's static base (`window.remotion_staticBase`) and origin, `null` off a page. */
export const studioLocation = (): {readonly staticBase: string | null; readonly origin: string | null} => {
  if (typeof window === 'undefined') return {staticBase: null, origin: null};
  const base = (window as unknown as {remotion_staticBase?: unknown}).remotion_staticBase;
  return {staticBase: typeof base === 'string' ? base : null, origin: window.location?.origin ?? null};
};

/**
 * `audioFileForTrack()` of a track against the Studio's own list of `public/`, static base and
 * origin, and the files tracks were written into this session (`trackCopyOf()`).
 */
export const studioTrackFile = (track: Pick<HostAudioTrack, 'src'>): TrackFile | null =>
  audioFileForTrack(track.src, {staticFiles: staticFileList(), ...studioLocation(), copyOf: trackCopyOf});

/**
 * Whether the saved `hostAudio.offsetSeconds` and the live track's differ by more than half a frame
 * at `fps`: the template's track was moved or trimmed since, and the words would run early or late.
 */
export const hostTrackMoved = (saved: number, live: number, fps: number): boolean =>
  Math.abs(saved - live) > 0.5 / fps + 1e-9;

/**
 * The live track the saved `hostAudio` follows: among the followable tracks whose file is
 * `audioFile` (`fileOf`, `audioFileForTrack()` in the panel), the one named `label`, else the first.
 * When none plays that file, a `blob:` or `data:` track named `label` (non-empty): its bytes were
 * written into `audioFile` in an earlier session, and its URL is new on every page load. `null`
 * when neither is found.
 */
export const followedTrack = (
  tracks: readonly HostAudioTrack[],
  audioFile: string,
  label: string,
  fileOf: (track: HostAudioTrack) => TrackFile | null,
): HostAudioTrack | null => {
  const playing = tracks.filter((track) => {
    const file = fileOf(track);
    return file !== null && (file.kind === 'public' ? file.path : file.url) === audioFile;
  });
  const named = playing.find((track) => track.label === label) ?? playing[0];
  if (named) return named;
  if (label === '') return null;
  return tracks.find((track) => track.label === label && fileOf(track)?.kind === 'bytes') ?? null;
};

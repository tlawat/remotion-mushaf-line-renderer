// Where the composition's audio comes from, said once for Source and Align: what plays now (the
// "Now:" line), which choice the Source tab opens on, and the one recording Align works on. Pure,
// so the tabs only render what these say.
import {hostAudioOf} from '../audio/host';
import type {StagedOrigin} from './store';
import {isUrl} from './studio-api';
import {resolvedOf, type StudioCompositionProps} from './tab-props';

/** The host of an http(s) URL (`hetchyy-quranic-universal-aligner.hf.space`), `null` for anything else. */
export const hostOf = (url: string): string | null => {
  if (!isUrl(url)) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

/** The extensions of a video file whose sound Align decodes in the browser and sends as WAV. */
export const VIDEO_EXTENSIONS: readonly string[] = ['mp4', 'mov', 'm4v', 'mkv'];

/** Whether a path or URL names a video file (by its extension, query and fragment left out). */
export const isVideoFile = (path: string): boolean => {
  const bare = path.replace(/[?#].*$/, '');
  const name = bare.slice(bare.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 && VIDEO_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
};

/** What the composition plays now, and where it came from: what the Source tab's "Now:" line says. */
export type NowSource =
  /** No `audioFile`. */
  | {readonly kind: 'none'}
  /** The template's track (`hostAudio`): `file` is `audioFile`, `track` the timeline name it was matched by. */
  | {readonly kind: 'track'; readonly file: string; readonly track: string; readonly offsetSeconds: number}
  /** `audioFile` is missing from `public/`: `url`, the catalogue clip the timings name, streams instead (renders too). */
  | {readonly kind: 'missing'; readonly path: string; readonly url: string; readonly host: string}
  /** `audioFile` is a URL: previews and renders need `host`. */
  | {readonly kind: 'streaming'; readonly url: string; readonly host: string}
  /** A file of `public/` downloaded from the catalogue's clip host. */
  | {readonly kind: 'catalogue'; readonly path: string; readonly host: string | null}
  /** A file of `public/` whose timings the aligner made: the user's recording. */
  | {readonly kind: 'aligned'; readonly path: string}
  /**
   * A file of `public/` with timings from elsewhere; `otherTimings` names the recording the timings
   * say they were made for when that is another file (the audio was replaced, the timings kept).
   */
  | {readonly kind: 'file'; readonly path: string; readonly otherTimings: string | null};

/** The file name of a path or URL, without its query or fragment. */
const fileNameOf = (path: string): string => {
  const bare = path.replace(/[?#].*$/, '');
  return bare.slice(bare.lastIndexOf('/') + 1);
};

/**
 * What `props` play now (`audioFile`, read with `props.resolved`): the template's track under
 * `hostAudio`; the catalogue clip `calculateMetadata()` streams when `audioFile` is missing
 * (`resolved.audioSrc`); a URL; else a file of `public/`, named by how its timings were made, but
 * only when the timings were made for that file: their `audio` is absent, has its file name, or is
 * the catalogue clip they name (a stream downloaded later). Otherwise the audio was replaced and the
 * timings kept, and `otherTimings` says what they were made for.
 */
export const nowSourceOf = (props: StudioCompositionProps): NowSource => {
  const {audioFile} = props;
  if (audioFile === '') return {kind: 'none'};
  const host = hostAudioOf(props);
  if (host.enabled) return {kind: 'track', file: audioFile, track: host.track, offsetSeconds: host.offsetSeconds};
  const resolved = resolvedOf(props);
  const fallback = (resolved as {readonly audioSrc?: unknown} | null)?.audioSrc;
  if (typeof fallback === 'string' && fallback !== '' && !isUrl(audioFile)) {
    return {kind: 'missing', path: audioFile, url: fallback, host: hostOf(fallback) ?? fallback};
  }
  if (isUrl(audioFile)) return {kind: 'streaming', url: audioFile, host: hostOf(audioFile) ?? audioFile};
  const sidecar = resolved?.timings.alignment;
  const timed = (resolved?.timings as {readonly audio?: unknown} | undefined)?.audio;
  const clip = sidecar?.recitation?.audioUrl;
  const ofThisFile =
    typeof timed !== 'string' || timed === '' || fileNameOf(timed) === fileNameOf(audioFile) || timed === clip;
  if (!ofThisFile) return {kind: 'file', path: audioFile, otherTimings: timed};
  if (sidecar?.source === 'qud-catalogue') return {kind: 'catalogue', path: audioFile, host: hostOf(clip ?? '')};
  if (sidecar?.source === 'qud') return {kind: 'aligned', path: audioFile};
  return {kind: 'file', path: audioFile, otherTimings: null};
};

/** The Source tab's four choices. */
export type SourceMode = 'catalogue' | 'upload' | 'public' | 'track';

/**
 * The choice the Source tab opens on, before the user picks one: the one the current audio came
 * from (the template's track, a recording staged for Align, the catalogue), else the catalogue.
 */
export const defaultSourceMode = (
  props: StudioCompositionProps,
  staged: {readonly path: string | null; readonly origin: StagedOrigin},
): SourceMode => {
  const now = nowSourceOf(props);
  if (now.kind === 'track') return 'track';
  if (staged.path !== null && staged.path !== props.audioFile) return staged.origin;
  if (now.kind === 'aligned') return 'upload';
  return 'catalogue';
};

/** The one recording Align works on, and where it came from. */
export type AlignSource =
  /** Nothing to align. */
  | {readonly kind: 'none'}
  /** The composition plays the catalogue's reviewed timings: aligning again is not needed. */
  | {readonly kind: 'catalogue'}
  /**
   * A file of `public/`: staged in Source (`upload`, `public`), what the composition plays
   * (`current`), or the template's track it follows (`track`).
   */
  | {readonly kind: 'file'; readonly path: string; readonly origin: StagedOrigin | 'current' | 'track'}
  /** A URL the composition plays (streams, or the template's track): fetched by the browser, else by the aligner. */
  | {readonly kind: 'url'; readonly url: string; readonly origin: 'current' | 'track'};

/**
 * What Align sends: the recording Source staged for this target when the composition does not play
 * it yet, else what the composition plays, unless those are the catalogue's reviewed timings. The
 * file the composition plays, staged in Source by name ("A file already in public/", Align this
 * file), is aligned even when the catalogue timed it: the user asked for it.
 */
export const alignSourceOf = (
  props: StudioCompositionProps,
  staged: {readonly path: string | null; readonly origin: StagedOrigin},
): AlignSource => {
  if (staged.path !== null && staged.path !== props.audioFile)
    return {kind: 'file', path: staged.path, origin: staged.origin};
  if (staged.path !== null && staged.origin === 'public' && !hostAudioOf(props).enabled && !isUrl(staged.path))
    return {kind: 'file', path: staged.path, origin: 'current'};
  const now = nowSourceOf(props);
  switch (now.kind) {
    case 'none':
      return {kind: 'none'};
    case 'catalogue':
    case 'missing':
      return {kind: 'catalogue'};
    case 'streaming': {
      // A clip of the catalogue streamed, its timings the catalogue's: nothing to align.
      const sidecar = resolvedOf(props)?.timings.alignment;
      return sidecar?.source === 'qud-catalogue' ? {kind: 'catalogue'} : {kind: 'url', url: now.url, origin: 'current'};
    }
    case 'track':
      return isUrl(now.file)
        ? {kind: 'url', url: now.file, origin: 'track'}
        : {kind: 'file', path: now.file, origin: 'track'};
    default:
      return {kind: 'file', path: now.path, origin: 'current'};
  }
};

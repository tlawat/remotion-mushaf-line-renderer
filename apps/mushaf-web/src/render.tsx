// The render in the browser with `@remotion/web-renderer`, loaded only when the Export step needs
// it (the encoders are most of the page's weight). The compositions play their audio with
// Remotion's `<Audio>` (an HTML5 element), which the web renderer refuses; for the render the page
// gives them no audio file and adds `@remotion/media`'s `<Audio>`, which it mixes into the video,
// with the same trim the composition would apply.
import {Audio} from '@remotion/media';
import {
  canRenderMediaOnWeb,
  renderMediaOnWeb,
  type WebRendererAudioCodec,
  type WebRendererContainer,
  type WebRendererVideoCodec,
} from '@remotion/web-renderer';
import {
  MushafAyahText,
  type MushafAyahTextProps,
  MushafRecitation,
  type MushafRecitationProps,
  type ResolvedRecitation,
  STUDIO_FPS,
} from '@tlawat/mushaf-studio';
import type * as React from 'react';
import {compositionId, type VideoSpec} from './project';
import type {ResolvedVideo} from './resolve';

/** `<MushafRecitation>` for the web renderer: its own audio off, `@remotion/media`'s on, trimmed as the composition trims it. */
export const RecitationForWeb: React.FC<MushafRecitationProps> = (props) => {
  const resolved = props.resolved as ResolvedRecitation | null;
  return (
    <>
      <MushafRecitation {...props} audioFile="" />
      {props.audioFile !== '' && resolved && (
        <Audio src={props.audioFile} trimBefore={Math.round(resolved.audioOffsetSeconds * STUDIO_FPS)} />
      )}
    </>
  );
};

/** `<MushafAyahText>` for the web renderer (its audio is not trimmed). */
export const AyahTextForWeb: React.FC<MushafAyahTextProps> = (props) => (
  <>
    <MushafAyahText {...props} audioFile="" />
    {props.audioFile !== '' && <Audio src={props.audioFile} />}
  </>
);

/** A container and codecs this browser can encode. */
export type WebFormat = {
  readonly container: WebRendererContainer;
  readonly videoCodec: WebRendererVideoCodec;
  readonly audioCodec: WebRendererAudioCodec | null;
  /** The file extension and MIME type of the result. */
  readonly extension: string;
  readonly mimeType: string;
};

/** In order of preference: MP4 plays everywhere; WebM where H.264 cannot be encoded (Chromium without proprietary codecs, Firefox). */
const CANDIDATES: readonly Omit<WebFormat, 'audioCodec'>[] = [
  {container: 'mp4', videoCodec: 'h264', extension: 'mp4', mimeType: 'video/mp4'},
  {container: 'webm', videoCodec: 'vp9', extension: 'webm', mimeType: 'video/webm'},
  {container: 'webm', videoCodec: 'vp8', extension: 'webm', mimeType: 'video/webm'},
];

/** Why the browser cannot render, when it cannot. */
export type FormatCheck = {readonly format: WebFormat | null; readonly issues: readonly string[]};

/** The first format of `CANDIDATES` this browser can encode at this size, or `null` with what stood in the way. */
export const pickWebFormat = async (size: {readonly width: number; readonly height: number}): Promise<FormatCheck> => {
  if (typeof VideoEncoder === 'undefined') {
    return {
      format: null,
      issues: ['This browser has no WebCodecs (VideoEncoder): use a recent Chrome, Edge or Safari.'],
    };
  }
  const issues: string[] = [];
  for (const candidate of CANDIDATES) {
    try {
      const result = await canRenderMediaOnWeb({
        container: candidate.container,
        videoCodec: candidate.videoCodec,
        width: size.width,
        height: size.height,
      });
      if (result.canRender) return {format: {...candidate, audioCodec: result.resolvedAudioCodec}, issues: []};
      for (const issue of result.issues) if (issue.severity === 'error') issues.push(issue.message);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {format: null, issues: [...new Set(issues)]};
};

/**
 * Remotion's licence: free for individuals and small organisations ("free-license"); a deployment
 * that does not qualify sets its own key at build time (`VITE_REMOTION_LICENSE_KEY`).
 */
const licenseKey = (): string => import.meta.env.VITE_REMOTION_LICENSE_KEY || 'free-license';

/** Renders the resolved video in the page and returns the file. `onProgress` gets 0-1. */
export const renderInBrowser = async (
  video: ResolvedVideo,
  format: WebFormat,
  options: {readonly onProgress: (progress: number) => void; readonly signal: AbortSignal},
): Promise<Blob> => {
  const spec: VideoSpec = video.spec;
  const shared = {
    container: format.container,
    videoCodec: format.videoCodec,
    ...(format.audioCodec ? {audioCodec: format.audioCodec} : {}),
    signal: options.signal,
    onProgress: (progress: {progress: number}) => options.onProgress(progress.progress),
    licenseKey: licenseKey(),
    // A slow CDN must not fail the render: the fonts and the audio can take a while on first load.
    delayRenderTimeoutInMilliseconds: 120_000,
  } as const;
  const id = compositionId(video.composition);
  const result =
    video.composition === 'recitation'
      ? await renderMediaOnWeb({
          ...shared,
          composition: {component: RecitationForWeb, id, ...spec, defaultProps: video.props},
          inputProps: video.props,
        })
      : await renderMediaOnWeb({
          ...shared,
          composition: {component: AyahTextForWeb, id, ...spec, defaultProps: video.props},
          inputProps: video.props,
        });
  return result.getBlob();
};

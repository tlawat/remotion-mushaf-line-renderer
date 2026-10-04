// The Review tab's waveform: the recording's peaks on a canvas, the aligner's segments as coloured
// spans under them, the playhead as a line. The canvas is drawn when the view or the data change;
// only the small cursor child reads the frame, so playback re-renders a line, not the canvas.
import type * as React from 'react';
import {useEffect, useRef} from 'react';
import {useCurrentFrame} from 'remotion';
import type {AlignmentSegment} from '../types';
import {useStudioState, useT} from './store';
import {colors, confidenceColor} from './styles';
import {audioUrlOf, loadWaveform, peaksBetween, type WaveformEnvelope} from './waveform-peaks';

export const WAVEFORM_WIDTH = 356;
export const WAVEFORM_HEIGHT = 60;

/** A stretch of composition time, in seconds. */
export type WaveformView = {readonly from: number; readonly to: number};

/** The time (seconds of the composition) at `x` pixels of a view drawn `width` pixels wide. */
export const timeAtX = (view: WaveformView, x: number, width: number): number =>
  view.from + (Math.max(0, Math.min(width, x)) / Math.max(1, width)) * (view.to - view.from);

/** The pixel of a time in a view drawn `width` pixels wide (may be outside `[0, width]`). */
export const xAtTime = (view: WaveformView, seconds: number, width: number): number =>
  view.to > view.from ? ((seconds - view.from) / (view.to - view.from)) * width : 0;

/** The playhead: the only part of the waveform that follows the frame. */
const Cursor: React.FC<{readonly view: WaveformView; readonly fps: number}> = ({view, fps}) => {
  const frame = useCurrentFrame();
  const x = xAtTime(view, frame / fps, WAVEFORM_WIDTH);
  if (x < 0 || x > WAVEFORM_WIDTH) return null;
  return (
    <div
      data-mushaf-waveform="cursor"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `${(x / WAVEFORM_WIDTH) * 100}%`,
        width: 1,
        background: colors.text,
        pointerEvents: 'none',
      }}
    />
  );
};

/** Draws the spans and the peaks; the envelope's times are the recording's, `offset` seconds after the composition's. */
const draw = (
  context: CanvasRenderingContext2D,
  options: {
    readonly envelope: WaveformEnvelope;
    readonly view: WaveformView;
    readonly offset: number;
    readonly segments: readonly AlignmentSegment[];
    readonly threshold: number;
    readonly selected: number | null;
  },
): void => {
  const {envelope, view, offset, segments, threshold, selected} = options;
  const width = WAVEFORM_WIDTH;
  const height = WAVEFORM_HEIGHT;
  context.clearRect(0, 0, width, height);
  context.fillStyle = colors.raised;
  context.fillRect(0, 0, width, height);
  for (const segment of segments) {
    const left = xAtTime(view, segment.timeFrom, width);
    const right = xAtTime(view, segment.timeTo, width);
    if (right < 0 || left > width) continue;
    context.globalAlpha = segment.segment === selected ? 0.45 : 0.25;
    context.fillStyle = confidenceColor(segment.confidence, threshold);
    context.fillRect(left, 0, Math.max(1, right - left), height);
  }
  context.globalAlpha = 1;
  const peaks = peaksBetween(envelope, view.from + offset, view.to + offset, width);
  const middle = height / 2;
  context.fillStyle = colors.text;
  for (let x = 0; x < width; x++) {
    const top = middle - (peaks.max[x] ?? 0) * middle;
    const bottom = middle - (peaks.min[x] ?? 0) * middle;
    context.fillRect(x, top, 1, Math.max(1, bottom - top));
  }
};

/**
 * The waveform of `audioFile` over `view` (composition seconds). Decodes the recording once per URL
 * (the store keeps it); a click seeks the Studio to the time under the pointer.
 */
export const Waveform: React.FC<{
  readonly audioFile: string;
  /** Seconds of the recording before the composition's frame 0 (`audioOffsetSeconds`). */
  readonly offset: number;
  readonly view: WaveformView;
  readonly segments: readonly AlignmentSegment[];
  readonly threshold: number;
  readonly selected: number | null;
  readonly fps: number;
  readonly onSeek: (seconds: number) => void;
}> = ({audioFile, offset, view, segments, threshold, selected, fps, onSeek}) => {
  const t = useT();
  const url = audioFile ? audioUrlOf(audioFile) : '';
  const entry = useStudioState().waveforms[url];
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (url) void loadWaveform(url);
  }, [url]);
  const envelope = entry?.status === 'ready' ? entry.envelope : null;
  useEffect(() => {
    const element = canvas.current;
    if (!element || !envelope) return;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = element.getContext('2d');
    } catch {
      context = null;
    }
    if (context) draw(context, {envelope, view, offset, segments, threshold, selected});
  }, [envelope, view, offset, segments, threshold, selected]);

  if (!url) return null;
  const status =
    entry === undefined || entry.status === 'loading'
      ? t('waveform.decoding')
      : entry.status === 'error'
        ? t('waveform.failed', {error: entry.message})
        : null;
  return (
    <div>
      <div style={{position: 'relative', width: '100%', height: WAVEFORM_HEIGHT}}>
        <canvas
          ref={canvas}
          data-mushaf-waveform="canvas"
          width={WAVEFORM_WIDTH}
          height={WAVEFORM_HEIGHT}
          aria-label={t('waveform.label')}
          role="img"
          style={{width: '100%', height: WAVEFORM_HEIGHT, display: 'block', cursor: 'pointer'}}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const width = rect.width || WAVEFORM_WIDTH;
            // The canvas is drawn left to right whatever the panel's direction: time runs left to right.
            onSeek(timeAtX(view, event.clientX - rect.left, width));
          }}
        />
        <Cursor view={view} fps={fps} />
      </div>
      {status ? <div style={{color: colors.muted, fontSize: 11}}>{status}</div> : null}
    </div>
  );
};

// What the composition does with an analysis: the normalising gain, the volume curve for
// `<Audio volume={(f) => ...}>`, the extra offset that skips the leading silence, and the glow's
// level on a frame. Pure and deterministic: these run on every frame of a render.
import type {AudioAnalysis} from './analyze';

/** Four decimals: stable values, free of float noise. */
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** The ceiling the normalised true peak stays under, in dBFS. */
export const TRUE_PEAK_CEILING_DB = -1;

/**
 * The linear gain that brings `analysis` to `targetLufs`, lowered when the true peak would pass
 * `ceilingDb` (default -1 dBFS): a recording with loud peaks ends up quieter than the target rather
 * than clipped. 1 when there is no loudness to correct (silence, a clip under 0.4 s). Four decimals.
 *
 * `gainFor({lufs: -20, peak: 0.5}, -14)` is 1.7825, not 1.9953: +5.02 dB takes the peak to -1 dBFS, +6 would pass it.
 */
export const gainFor = (
  analysis: Pick<AudioAnalysis, 'lufs' | 'peak'>,
  targetLufs: number,
  ceilingDb: number = TRUE_PEAK_CEILING_DB,
): number => {
  if (analysis.lufs === null) return 1;
  const toTargetDb = targetLufs - analysis.lufs;
  const headroomDb = analysis.peak > 0 ? ceilingDb - 20 * Math.log10(analysis.peak) : Number.POSITIVE_INFINITY;
  return round4(10 ** (Math.min(toTargetDb, headroomDb) / 20));
};

export type VolumeCurve = {
  /** `gainFor()`, or 1 without normalising. */
  readonly gain: number;
  /** Seconds of the fade in from the audio's first frame, and of the fade out to the composition's last. */
  readonly fadeIn: number;
  readonly fadeOut: number;
  /** The composition's length and rate (`useVideoConfig()`). */
  readonly durationInFrames: number;
  readonly fps: number;
  /** The user's volume on top of the gain (`audio.volume`). Default 1. */
  readonly volume?: number | undefined;
};

/**
 * The volume at `frame` of the `<Audio>` (the frame Remotion passes its `volume` callback: 0 where
 * the audio starts): `gain × volume`, ramped linearly from 0 over `fadeIn` and down to 0 at the
 * composition's last frame over `fadeOut`. Four decimals; pure.
 *
 * `<Audio volume={(f) => volumeAt(f, curve)} />`
 */
export const volumeAt = (frame: number, curve: VolumeCurve): number => {
  const fadeInFrames = curve.fadeIn * curve.fps;
  const fadeOutFrames = curve.fadeOut * curve.fps;
  const fadeIn = fadeInFrames > 0 ? clamp01(frame / fadeInFrames) : 1;
  const fadeOut = fadeOutFrames > 0 ? clamp01((curve.durationInFrames - 1 - frame) / fadeOutFrames) : 1;
  return round4(curve.gain * (curve.volume ?? 1) * Math.min(fadeIn, fadeOut));
};

export type SilenceTrimOptions = {
  /** Where the composition already starts in the file (`audioOffsetSeconds`). */
  readonly offsetSeconds: number;
  /**
   * The latest the audio may start: the first played word's start less its line's lead-in and
   * entrance, so the first line still comes in before its word. No limit when omitted.
   */
  readonly latestSeconds?: number | undefined;
  /** Silence kept before the first sound, so the first breath is not cut. Default 0.15. */
  readonly padSeconds?: number | undefined;
};

/** Silence `silenceTrimSeconds()` keeps before the first sound. */
export const SILENCE_PAD_SECONDS = 0.15;

/**
 * How much later the audio should start to skip the leading silence (`audio.trimSilence`), in
 * seconds on top of `offsetSeconds`, to the microsecond: up to `padSeconds` before the first sound,
 * never past `latestSeconds`, never negative (an offset already past the silence stays). The
 * composition adds it to the audio offset and moves the timings by the same amount. 0 for a silent file.
 *
 * `silenceTrimSeconds({firstSoundSeconds: 2.4}, {offsetSeconds: 0})` is 2.25.
 */
export const silenceTrimSeconds = (
  analysis: Pick<AudioAnalysis, 'firstSoundSeconds'>,
  options: SilenceTrimOptions,
): number => {
  if (analysis.firstSoundSeconds === null) return 0;
  let start = analysis.firstSoundSeconds - (options.padSeconds ?? SILENCE_PAD_SECONDS);
  if (options.latestSeconds !== undefined) start = Math.min(start, options.latestSeconds);
  return Math.max(0, Math.round((start - options.offsetSeconds) * 1e6) / 1e6);
};

/**
 * The glow's level at `frame` of the file (the composition frame plus the audio offset in frames):
 * the mean of `levels` over `radius` frames either side (default 2), so it swells rather than
 * flickers. Frames outside the file count as silence. 0-1, four decimals; pure.
 */
export const levelAt = (levels: readonly number[], frame: number, radius = 2): number => {
  const center = Math.round(frame);
  let sum = 0;
  for (let f = center - radius; f <= center + radius; f++) sum += levels[f] ?? 0;
  return round4(clamp01(sum / (2 * radius + 1)));
};

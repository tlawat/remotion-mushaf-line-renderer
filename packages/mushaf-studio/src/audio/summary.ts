// What a timings file keeps of the recording's analysis (`alignment.audio`): the four measurements
// the gain and the silence trim need, written when the panel saves new timings and read back by
// `calculateMetadata()`, so a render that does not draw the glow needs no download to normalise.
import type {AudioSummary, StudioTimings} from '../types';
import type {AudioAnalysis} from './analyze';

/** The part of an analysis a timings file keeps: loudness, true peak, the first sound and the length. */
export const audioSummaryOf = (analysis: Pick<AudioAnalysis, keyof AudioSummary>): AudioSummary => ({
  lufs: analysis.lufs,
  peak: analysis.peak,
  firstSoundSeconds: analysis.firstSoundSeconds,
  durationSeconds: analysis.durationSeconds,
});

const isSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * `value` (a timings file's `alignment.audio`, read from JSON) as a summary, or `null` when it is
 * missing or not one: `lufs` a finite number or `null`, `peak` and `durationSeconds` finite and not
 * negative, `firstSoundSeconds` the same or `null`. A summary that is not one is ignored, so the
 * recording is analysed as if there were none.
 */
export const audioSummaryFrom = (value: unknown): AudioSummary | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const {lufs, peak, firstSoundSeconds, durationSeconds} = value as Record<string, unknown>;
  if (!(lufs === null || (typeof lufs === 'number' && Number.isFinite(lufs)))) return null;
  if (!isSeconds(peak) || !isSeconds(durationSeconds)) return null;
  if (!(firstSoundSeconds === null || isSeconds(firstSoundSeconds))) return null;
  return {lufs, peak, firstSoundSeconds, durationSeconds};
};

/**
 * The timings with `summary` as their sidecar's `audio` (replacing an earlier one), last in it.
 * The same object for timings without a sidecar: the summary describes the recording an alignment
 * was made of, and a bare `RecitationTimings` file has nowhere to keep it.
 */
export const withAudioSummary = <T extends StudioTimings>(timings: T, summary: AudioSummary): T => {
  const sidecar = timings.alignment;
  if (sidecar === undefined) return timings;
  const {audio: _previous, ...rest} = sidecar;
  return {...timings, alignment: {...rest, audio: summary}};
};

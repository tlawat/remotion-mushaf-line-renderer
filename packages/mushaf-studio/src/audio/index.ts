// The recitation cleaned up on its way out (the `audio` props group): measured once in
// `calculateMetadata()` (loudness, true peak, the first sound, a level per frame), then normalised,
// faded and trimmed by pure per-frame functions, with the levels driving the background's glow.
export {
  type AnalyzeOptions,
  type AudioAnalysis,
  analyzeAudio,
  analyzeSamples,
  clearAudioAnalysisCache,
  forgetAudioAnalysis,
} from './analyze';
export {
  applyBiquad,
  type Biquad,
  firstSound,
  frameCount,
  frameLevels,
  integratedLoudness,
  kWeightingFilters,
  mixDown,
  truePeak,
} from './loudness';
export {type AudioSettings, audioSchema, defaultAudio} from './schema';
export {audioSummaryFrom, audioSummaryOf, withAudioSummary} from './summary';
export {
  gainFor,
  levelAt,
  SILENCE_PAD_SECONDS,
  type SilenceTrimOptions,
  silenceTrimSeconds,
  TRUE_PEAK_CEILING_DB,
  type VolumeCurve,
  volumeAt,
} from './volume';

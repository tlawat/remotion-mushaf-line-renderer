// The recitation cleaned up on its way out (the `audio` props group): measured once in
// `calculateMetadata()` (loudness, true peak, the first sound, a level per frame), then normalised,
// faded and trimmed by pure per-frame functions, Nothing on screen follows the level.
export {
  type AnalyzeOptions,
  type AudioAnalysis,
  analyzeAudio,
  analyzeSamples,
  clearAudioAnalysisCache,
  forgetAudioAnalysis,
} from './analyze';
export {
  assertNoHostRepeats,
  defaultHostAudio,
  followsHostAudio,
  type HostAudio,
  hostAudioOf,
  hostAudioSchema,
  OWN_AUDIO_NAME,
} from './host';
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
export {type AudioDecoder, audioToWav, encodeWav, WAV_SAMPLE_RATE} from './wav';

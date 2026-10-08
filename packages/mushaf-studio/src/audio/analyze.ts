// The recitation measured once, in `calculateMetadata()`: fetched, decoded by the browser's Web
// Audio, then the pure measurements of `./loudness`. The result is plain JSON-safe data the
// composition receives as a prop, so nothing here runs during a render's frames.
import {describeValue, MushafStudioError} from '../errors';
import {firstSound, frameLevels, integratedLoudness, mixDown, truePeak} from './loudness';

/** What `analyzeAudio()` measured. Plain data: it goes into the props `calculateMetadata()` returns. */
export type AudioAnalysis = {
  /** Integrated loudness (BS.1770), LUFS to two decimals; `null` for silence or under 0.4 s of audio. */
  readonly lufs: number | null;
  /** True peak, linear (1 is 0 dBFS). */
  readonly peak: number;
  readonly durationSeconds: number;
  /** Start of the first sound in the file, seconds; `null` when the file is silent. */
  readonly firstSoundSeconds: number | null;
  /** Frames per second `levels` is counted in. */
  readonly fps: number;
  /** Level per video frame from the file's start, 0-1 relative to the loudest frame, for the glow. */
  readonly levels: readonly number[];
};

export type AnalyzeOptions = {
  /** The composition's frame rate: `levels` has one entry per frame at this rate. */
  readonly fps: number;
  /** dBFS a 10 ms window must pass to count as sound, for `firstSoundSeconds`. Default -45. */
  readonly silenceThresholdDb?: number | undefined;
};

/**
 * Every measurement of `analyzeAudio()` on samples already decoded: one array per channel, all the
 * same length. Pure; what the tests drive.
 */
export const analyzeSamples = (
  channels: readonly Float32Array[],
  sampleRate: number,
  options: AnalyzeOptions,
): AudioAnalysis => {
  const mono = mixDown(channels);
  return {
    lufs: integratedLoudness(channels, sampleRate),
    peak: Math.round(truePeak(channels) * 1e6) / 1e6,
    durationSeconds: Math.round((mono.length / sampleRate) * 1e6) / 1e6,
    firstSoundSeconds: firstSound(mono, sampleRate, options.silenceThresholdDb),
    fps: options.fps,
    levels: frameLevels(mono, sampleRate, options.fps),
  };
};

/** Decoding rate: 48 kHz, the rate BS.1770 tabulates and most recordings already have. */
const DECODE_RATE = 48_000;

/** Fetches and decodes `url` with the browser's Web Audio; one array per channel. */
const decode = async (url: string): Promise<{channels: Float32Array[]; sampleRate: number}> => {
  if (typeof OfflineAudioContext === 'undefined') {
    throw new MushafStudioError(
      'AUDIO_ANALYSIS_FAILED',
      `Cannot analyse the audio ${describeValue(url)}: there is no Web Audio here. analyzeAudio() runs in calculateMetadata(), in the Studio or the renderer's browser; turn normalize and trimSilence off to render without it.`,
      {url},
    );
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new MushafStudioError(
      'AUDIO_ANALYSIS_FAILED',
      `Cannot fetch the audio ${describeValue(url)} to analyse it (${String(error)}). Check audioFile, or turn normalize and trimSilence off.`,
      {url},
    );
  }
  if (!response.ok) {
    throw new MushafStudioError(
      'AUDIO_ANALYSIS_FAILED',
      `Cannot fetch the audio ${describeValue(url)} to analyse it: HTTP ${response.status}. Check audioFile, or turn normalize and trimSilence off.`,
      {url, status: response.status},
    );
  }
  const bytes = await response.arrayBuffer();
  let buffer: AudioBuffer;
  try {
    buffer = await new OfflineAudioContext(1, 1, DECODE_RATE).decodeAudioData(bytes);
  } catch (error) {
    throw new MushafStudioError(
      'AUDIO_ANALYSIS_FAILED',
      `The audio ${describeValue(url)} could not be decoded (${String(error)}): use an MP3, M4A, WAV, OGG or FLAC file.`,
      {url},
    );
  }
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  return {channels, sampleRate: buffer.sampleRate};
};

const CACHE_KEY = '__mushafStudioAudioAnalysis';

/**
 * The analyses of this page, by fps and URL, on `globalThis` so the Studio's re-evaluations and
 * hot reloads (which re-run module code) reuse them. A failed analysis is dropped, so the next
 * call tries again.
 */
const analysisCache = (): Map<string, Promise<AudioAnalysis>> => {
  const scope = globalThis as typeof globalThis & {[CACHE_KEY]?: Map<string, Promise<AudioAnalysis>>};
  scope[CACHE_KEY] ??= new Map();
  return scope[CACHE_KEY];
};

/** Forgets every cached analysis (tests; the panel after it rewrites a file under the same URL). */
export const clearAudioAnalysisCache = (): void => analysisCache().clear();

/** Forgets the cached analyses of `url` at every fps, so the next `analyzeAudio()` of it reads the file again. */
export const forgetAudioAnalysis = (url: string): void => {
  const cache = analysisCache();
  // Keys are `fps|threshold|url`; neither of the first two holds a `|`, the URL may.
  for (const key of [...cache.keys()])
    if (key.slice(key.indexOf('|', key.indexOf('|') + 1) + 1) === url) cache.delete(key);
};

/**
 * Fetches, decodes and measures the audio at `url` (a URL, as `fileUrl()` gives it): loudness,
 * true peak, duration, where the first sound is and a level per frame at `options.fps`. For
 * `calculateMetadata()` only: browser Web Audio (the Studio and the renderer's Chrome have it), and
 * the network. Cached per URL and fps for the page's life. `signal` abandons this call's wait, not
 * the shared analysis. Fails with `AUDIO_ANALYSIS_FAILED` naming the URL when it cannot fetch or decode.
 */
export const analyzeAudio = (
  url: string,
  options: AnalyzeOptions & {readonly signal?: AbortSignal | undefined},
): Promise<AudioAnalysis> => {
  const cache = analysisCache();
  const key = `${options.fps}|${options.silenceThresholdDb ?? ''}|${url}`;
  let analysis = cache.get(key);
  if (analysis === undefined) {
    analysis = decode(url).then(({channels, sampleRate}) => analyzeSamples(channels, sampleRate, options));
    cache.set(key, analysis);
    analysis.catch(() => {
      if (cache.get(key) === analysis) cache.delete(key);
    });
  }
  const {signal} = options;
  if (signal === undefined) return analysis;
  const shared = analysis;
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
    shared.then(resolve, reject);
  });
};

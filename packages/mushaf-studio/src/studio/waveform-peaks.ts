// The Review tab's waveform: the recording decoded once per URL in the browser (Studio only), kept
// as a fine min/max envelope in the store, and cut into as many peaks as the canvas has columns.
// The peak functions are pure; only `loadWaveform()` touches the network and Web Audio.
import {staticFile} from 'remotion';
import {MushafStudioError} from '../errors';
import {describeError, getStudioState, setStudioState, t} from './store';
import {isUrl} from './studio-api';

/** The lowest and highest sample of each bucket, in [-1, 1]. Both arrays have one entry per bucket. */
export type Peaks = {readonly min: Float32Array; readonly max: Float32Array};

/** A recording as the waveform draws it: `perSecond` min/max pairs for every second of it. */
export type WaveformEnvelope = Peaks & {
  readonly perSecond: number;
  /** Seconds. */
  readonly duration: number;
};

/** A recording's place in the store's waveform cache. */
export type WaveformEntry =
  | {readonly status: 'loading'}
  | {readonly status: 'ready'; readonly envelope: WaveformEnvelope}
  | {readonly status: 'error'; readonly message: string};

/** How fine the cached envelope is: 200 pairs a second draw a 4-second zoom at 360 px without gaps. */
export const ENVELOPE_PER_SECOND = 200;

/**
 * The min and max of `samples[from..to)` cut into `buckets` equal parts. A bucket narrower than one
 * sample takes the sample it falls on, so a short range still draws a line; an empty range gives
 * zeros. `computePeaks([0, 0.5, -1, 0.25], 2)` is `{min: [0, -1], max: [0.5, 0.25]}`.
 */
export const computePeaks = (samples: ArrayLike<number>, buckets: number, from = 0, to = samples.length): Peaks => {
  const count = Math.max(0, Math.floor(buckets));
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  const start = Math.max(0, Math.floor(from));
  const end = Math.min(samples.length, Math.ceil(to));
  const length = end - start;
  if (length <= 0) return {min, max};
  for (let bucket = 0; bucket < count; bucket++) {
    const first = start + Math.floor((bucket * length) / count);
    const last = Math.max(first + 1, start + Math.floor(((bucket + 1) * length) / count));
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let i = first; i < last && i < end; i++) {
      const value = samples[i] ?? 0;
      if (value < low) low = value;
      if (value > high) high = value;
    }
    min[bucket] = low === Number.POSITIVE_INFINITY ? 0 : low;
    max[bucket] = high === Number.NEGATIVE_INFINITY ? 0 : high;
  }
  return {min, max};
};

/**
 * A recording's envelope: `perSecond` buckets a second over every channel at once (the lowest and
 * highest sample of any channel), so a stereo file draws as what is heard.
 */
export const envelopeOf = (
  channels: readonly ArrayLike<number>[],
  sampleRate: number,
  perSecond = ENVELOPE_PER_SECOND,
): WaveformEnvelope => {
  const length = channels.reduce((n, channel) => Math.max(n, channel.length), 0);
  const duration = sampleRate > 0 ? length / sampleRate : 0;
  const buckets = Math.max(1, Math.ceil(duration * perSecond));
  const min = new Float32Array(buckets).fill(Number.POSITIVE_INFINITY);
  const max = new Float32Array(buckets).fill(Number.NEGATIVE_INFINITY);
  for (const channel of channels) {
    // Every channel on the longest one's grid: a shorter channel fills the buckets it reaches.
    const reach = Math.ceil((channel.length / Math.max(1, length)) * buckets);
    const peaks = computePeaks(channel, reach, 0, (reach * length) / buckets);
    for (let i = 0; i < reach; i++) {
      min[i] = Math.min(min[i] ?? 0, peaks.min[i] ?? 0);
      max[i] = Math.max(max[i] ?? 0, peaks.max[i] ?? 0);
    }
  }
  // A bucket no channel reached (or a silent file) is flat.
  for (let i = 0; i < buckets; i++)
    if (!Number.isFinite(min[i] ?? 0) || !Number.isFinite(max[i] ?? 0)) min[i] = max[i] = 0;
  return {min, max, perSecond, duration};
};

/**
 * The envelope between two times (seconds of the recording) in `buckets` peaks: each the lowest
 * min and the highest max of the envelope's pairs it covers. Times outside the recording give flat
 * buckets, so a view that starts before 0 draws silence there.
 */
export const peaksBetween = (envelope: WaveformEnvelope, from: number, to: number, buckets: number): Peaks => {
  const count = Math.max(0, Math.floor(buckets));
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  if (!(to > from)) return {min, max};
  const pairs = envelope.min.length;
  const step = (to - from) / count;
  for (let bucket = 0; bucket < count; bucket++) {
    const a = Math.floor((from + bucket * step) * envelope.perSecond);
    const b = Math.max(a + 1, Math.floor((from + (bucket + 1) * step) * envelope.perSecond));
    let low = 0;
    let high = 0;
    for (let i = Math.max(0, a); i < Math.min(pairs, b); i++) {
      low = Math.min(low, envelope.min[i] ?? 0);
      high = Math.max(high, envelope.max[i] ?? 0);
    }
    min[bucket] = low;
    max[bucket] = high;
  }
  return {min, max};
};

/** The URL the composition plays an `audioFile` from: a URL as it is, a `public/` path through `staticFile()`. */
export const audioUrlOf = (audioFile: string): string => (isUrl(audioFile) ? audioFile : staticFile(audioFile));

type Decoder = {
  decodeAudioData: (data: ArrayBuffer) => Promise<{
    readonly numberOfChannels: number;
    readonly sampleRate: number;
    getChannelData: (channel: number) => Float32Array;
  }>;
  close?: () => Promise<void>;
};

/** The rate the recording is decoded at: an envelope of 200 pairs a second needs no more, and an hour stays in memory. */
export const DECODE_SAMPLE_RATE = 8000;

/** Recordings larger than this are not decoded: the waveform says so rather than exhausting the tab's memory. */
export const MAX_WAVEFORM_BYTES = 100 * 1024 * 1024;

/**
 * Something that decodes audio in this browser: an `OfflineAudioContext` at `DECODE_SAMPLE_RATE`
 * (it resamples as it decodes and needs no user gesture), else the page's `AudioContext`; `null`
 * where there is neither (a server, jsdom).
 */
export const audioDecoder = (): (() => Decoder) | null => {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    OfflineAudioContext?: new (channels: number, length: number, sampleRate: number) => Decoder;
    AudioContext?: new () => Decoder;
    webkitAudioContext?: new () => Decoder;
  };
  const Offline = scope.OfflineAudioContext;
  if (Offline) return () => new Offline(1, 1, DECODE_SAMPLE_RATE);
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  return Context ? () => new Context() : null;
};

const setEntry = (url: string, entry: WaveformEntry): void =>
  setStudioState({waveforms: {...getStudioState().waveforms, [url]: entry}});

/**
 * Decodes the recording at `url` once and caches its envelope in the store; a second call for the
 * same URL (React's double effects included) does nothing. Studio only, in the browser only: where
 * there is no Web Audio it records an error entry and fetches nothing. A failure is an entry
 * of its own, never a thrown error, so the waveform says why it is missing.
 */
export const loadWaveform = async (url: string): Promise<void> => {
  if (getStudioState().waveforms[url] !== undefined) return;
  const decoder = audioDecoder();
  if (decoder === null) {
    setEntry(url, {status: 'error', message: t('waveform.noWebAudio')});
    return;
  }
  setEntry(url, {status: 'loading'});
  let context: Decoder | null = null;
  try {
    const response = await fetch(url);
    if (!response.ok)
      throw new MushafStudioError('BAD_STUDIO_PROP', t('waveform.httpError', {url, status: response.status}), {
        url,
        status: response.status,
      });
    const data = await response.arrayBuffer();
    if (data.byteLength > MAX_WAVEFORM_BYTES)
      throw new MushafStudioError(
        'BAD_STUDIO_PROP',
        t('waveform.tooLarge', {size: Math.round(data.byteLength / 1024 / 1024)}),
        {url, bytes: data.byteLength},
      );
    context = decoder();
    const buffer = await context.decodeAudioData(data);
    const channels = Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i));
    setEntry(url, {status: 'ready', envelope: envelopeOf(channels, buffer.sampleRate)});
  } catch (error) {
    setEntry(url, {status: 'error', message: describeError(error)});
  } finally {
    context?.close?.().catch(() => undefined);
  }
};

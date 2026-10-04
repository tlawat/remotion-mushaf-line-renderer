// Measurements on decoded samples: integrated loudness after ITU-R BS.1770-4 (K-weighting, 400 ms
// blocks every 100 ms, gated at -70 LUFS absolute and -10 LU relative), an oversampled true peak,
// where the first sound is, and a level per video frame for the glow. Pure functions over
// `Float32Array`s, one per channel, so they run the same under vitest as in the browser.

/** Second-order section coefficients, normalised so that a0 is 1. */
export type Biquad = {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
};

/**
 * The two stages of BS.1770's K-weighting at `sampleRate`: the head's high shelf (+4 dB above
 * about 1.5 kHz) and the RLB high-pass (about 38 Hz). The standard tabulates them at 48 kHz only;
 * these are the analogue prototypes behind that table (as libebur128 derives them), so 44.1 kHz and
 * every other rate get the same curve. At 48 kHz they match the standard's coefficients to 1e-8.
 */
export const kWeightingFilters = (sampleRate: number): readonly [Biquad, Biquad] => {
  // Stage 1: the high shelf.
  const shelfF0 = 1681.974450955533;
  const shelfGainDb = 3.999843853973347;
  const shelfQ = 0.7071752369554196;
  let k = Math.tan((Math.PI * shelfF0) / sampleRate);
  const vh = 10 ** (shelfGainDb / 20);
  const vb = vh ** 0.4996667741545416;
  let a0 = 1 + k / shelfQ + k * k;
  const shelf: Biquad = {
    b0: (vh + (vb * k) / shelfQ + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / shelfQ + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / shelfQ + k * k) / a0,
  };
  // Stage 2: the high-pass.
  const passF0 = 38.13547087602444;
  const passQ = 0.5003270373238773;
  k = Math.tan((Math.PI * passF0) / sampleRate);
  a0 = 1 + k / passQ + k * k;
  const highPass: Biquad = {b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / passQ + k * k) / a0};
  return [shelf, highPass];
};

/** `samples` through one biquad (transposed direct form II), into a new array. */
export const applyBiquad = (samples: Float32Array | Float64Array, filter: Biquad): Float64Array => {
  const {b0, b1, b2, a1, a2} = filter;
  const out = new Float64Array(samples.length);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!;
    const y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    out[i] = y;
  }
  return out;
};

/** BS.1770's offset: a full-scale 997 Hz sine on one channel reads -3.01 LUFS. */
const LOUDNESS_OFFSET = -0.691;
const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;

const loudnessOf = (power: number): number => LOUDNESS_OFFSET + 10 * Math.log10(power);

/**
 * Integrated loudness of `channels` (one array per channel, all the same length) in LUFS, to two
 * decimals, or `null` when nothing passes the gates: silence, or less than one 400 ms block. Every
 * channel weighs 1, which is what BS.1770 gives mono, stereo and the front three of a surround mix.
 *
 * `integratedLoudness([fullScaleSine997Hz], 48000)` is -3.01.
 */
export const integratedLoudness = (channels: readonly Float32Array[], sampleRate: number): number | null => {
  const step = Math.round(sampleRate * 0.1);
  const length = channels[0]?.length ?? 0;
  const segments = Math.floor(length / step);
  if (segments < 4) return null;
  // Sum of squares of the K-weighted signal per 100 ms segment, every channel added up: a 400 ms
  // block, 75% overlapped with the next, is four consecutive segments.
  const energy = new Float64Array(segments);
  const [shelf, highPass] = kWeightingFilters(sampleRate);
  for (const channel of channels) {
    const weighted = applyBiquad(applyBiquad(channel, shelf), highPass);
    for (let s = 0; s < segments; s++) {
      let sum = 0;
      for (let i = s * step, end = i + step; i < end; i++) sum += weighted[i]! * weighted[i]!;
      energy[s]! += sum;
    }
  }
  const blockPower: number[] = [];
  for (let b = 0; b + 4 <= segments; b++) {
    blockPower.push((energy[b]! + energy[b + 1]! + energy[b + 2]! + energy[b + 3]!) / (4 * step));
  }
  const mean = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0) / values.length;
  const loud = blockPower.filter((power) => power > 0 && loudnessOf(power) > ABSOLUTE_GATE);
  if (loud.length === 0) return null;
  const relativeGate = loudnessOf(mean(loud)) + RELATIVE_GATE;
  const gated = loud.filter((power) => loudnessOf(power) > relativeGate);
  return Math.round(loudnessOf(mean(gated)) * 100) / 100;
};

/** Half-width of the interpolation kernel, in samples. */
const TAPS = 8;
/** The windowed-sinc weights of the three in-between points of a 4× oversampling, per neighbour. */
const PHASES: readonly (readonly number[])[] = [0.25, 0.5, 0.75].map((fraction) => {
  const weights: number[] = [];
  for (let k = -TAPS + 1; k <= TAPS; k++) {
    const t = fraction - k;
    const sinc = Math.sin(Math.PI * t) / (Math.PI * t);
    weights.push(sinc * 0.5 * (1 + Math.cos((Math.PI * t) / TAPS)));
  }
  return weights;
});

/**
 * The true peak, linear (1 is 0 dBFS): the largest of the samples and of the points a 4×
 * windowed-sinc oversampling puts between them, as BS.1770 annex 2 estimates it. A peak between two
 * samples can only be near a large sample, so only the neighbourhoods of samples above half the
 * sample peak are oversampled. 0 for silence.
 */
export const truePeak = (channels: readonly Float32Array[]): number => {
  let peak = 0;
  for (const channel of channels) {
    let samplePeak = 0;
    for (let i = 0; i < channel.length; i++) samplePeak = Math.max(samplePeak, Math.abs(channel[i]!));
    peak = Math.max(peak, samplePeak);
    const threshold = samplePeak / 2;
    for (let n = 0; n + 1 < channel.length; n++) {
      if (Math.abs(channel[n]!) < threshold && Math.abs(channel[n + 1]!) < threshold) continue;
      for (const weights of PHASES) {
        let value = 0;
        for (let j = 0; j < weights.length; j++) {
          const index = n - TAPS + 1 + j;
          if (index >= 0 && index < channel.length) value += channel[index]! * weights[j]!;
        }
        peak = Math.max(peak, Math.abs(value));
      }
    }
  }
  return peak;
};

/** The channels averaged into one. */
export const mixDown = (channels: readonly Float32Array[]): Float32Array => {
  if (channels.length === 1) return channels[0]!;
  const length = channels[0]?.length ?? 0;
  const mono = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) mono[i]! += channel[i]! / channels.length;
  return mono;
};

const rms = (samples: Float32Array, start: number, end: number): number => {
  const to = Math.min(end, samples.length);
  if (to <= start) return 0;
  let sum = 0;
  for (let i = start; i < to; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / (to - start));
};

/** Window of `firstSound()`, in seconds. */
const SOUND_WINDOW_SECONDS = 0.01;

/**
 * Where the first sound starts, in seconds (to the millisecond): the start of the first 10 ms
 * window of the mixed-down signal whose RMS is above `thresholdDb` dBFS (default -45, above a
 * quiet room's hiss, under a breath). `null` when no window is.
 */
export const firstSound = (mono: Float32Array, sampleRate: number, thresholdDb = -45): number | null => {
  const window = Math.max(1, Math.round(sampleRate * SOUND_WINDOW_SECONDS));
  const threshold = 10 ** (thresholdDb / 20);
  for (let start = 0; start < mono.length; start += window) {
    if (rms(mono, start, start + window) > threshold) return Math.round((start / sampleRate) * 1000) / 1000;
  }
  return null;
};

/**
 * How many video frames `sampleCount` samples last at `fps`: the last partial frame counts.
 * A millionth of a frame of float noise does not add one.
 */
export const frameCount = (sampleCount: number, sampleRate: number, fps: number): number =>
  Math.max(0, Math.ceil((sampleCount * fps) / sampleRate - 1e-6));

/**
 * The level of every video frame at `fps`, 0-1 to three decimals: the RMS of the mixed-down signal
 * over the frame's samples, relative to the loudest frame (1). Relative, so the glow pulses as much
 * for a quiet recording as for a loud one, before or after normalising. All 0 for silence. One
 * entry per `frameCount()`.
 */
export const frameLevels = (mono: Float32Array, sampleRate: number, fps: number): number[] => {
  const count = frameCount(mono.length, sampleRate, fps);
  const raw: number[] = [];
  for (let frame = 0; frame < count; frame++) {
    raw.push(rms(mono, Math.round((frame * sampleRate) / fps), Math.round(((frame + 1) * sampleRate) / fps)));
  }
  let loudest = 0;
  for (const value of raw) loudest = Math.max(loudest, value);
  return raw.map((value) => (loudest === 0 ? 0 : Math.round((value / loudest) * 1000) / 1000));
};

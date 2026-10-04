// Synthetic signals with known levels for the audio tests: sines, seeded noise and silence, as the
// Float32Arrays Web Audio decodes to.

/** `seconds` of a sine at `frequency` Hz and `amplitude` (1 is full scale), starting at `phase` radians. */
export const sine = (frequency: number, amplitude: number, seconds: number, sampleRate = 48_000, phase = 0) => {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate + phase);
  }
  return samples;
};

export const silence = (seconds: number, sampleRate = 48_000) => new Float32Array(Math.round(seconds * sampleRate));

/** Uniform white noise scaled to `rms`, from a fixed seed (a 32-bit LCG): the same samples every run. */
export const noise = (rms: number, seconds: number, sampleRate = 48_000, seed = 12_345) => {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  let state = seed >>> 0;
  // A uniform distribution on [-a, a] has an RMS of a / sqrt(3).
  const amplitude = rms * Math.sqrt(3);
  for (let i = 0; i < samples.length; i++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    samples[i] = amplitude * ((state / 0x1_0000_0000) * 2 - 1);
  }
  return samples;
};

/** The arrays one after the other. */
export const concat = (...parts: readonly Float32Array[]) => {
  const out = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/** `samples` plus `other`, sample by sample (same length). */
export const mix = (samples: Float32Array, other: Float32Array) => samples.map((value, i) => value + other[i]!);

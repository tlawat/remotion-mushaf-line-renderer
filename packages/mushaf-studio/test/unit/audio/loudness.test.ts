// The measurements on synthetic signals of known level: BS.1770's K-weighting and gating, the
// oversampled true peak, the first sound and the per-frame levels.
import {describe, expect, it} from 'vitest';
import {
  analyzeSamples,
  applyBiquad,
  firstSound,
  frameCount,
  frameLevels,
  integratedLoudness,
  kWeightingFilters,
  mixDown,
  truePeak,
} from '../../../src/audio';
import {concat, mix, noise, silence, sine} from './signals';

describe('kWeightingFilters', () => {
  it('gives the coefficients BS.1770 tabulates at 48 kHz', () => {
    const [shelf, highPass] = kWeightingFilters(48_000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 8);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 8);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 8);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 8);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 8);
    expect(highPass).toMatchObject({b0: 1, b1: -2, b2: 1});
    expect(highPass.a1).toBeCloseTo(-1.99004745483398, 8);
    expect(highPass.a2).toBeCloseTo(0.99007225036621, 8);
  });

  it('passes DC through the shelf and blocks it in the high-pass', () => {
    const [shelf, highPass] = kWeightingFilters(44_100);
    const dc = new Float32Array(44_100).fill(0.5);
    expect(applyBiquad(dc, shelf).at(-1)).toBeCloseTo(0.5, 6);
    expect(Math.abs(applyBiquad(dc, highPass).at(-1)!)).toBeLessThan(1e-3);
  });
});

describe('integratedLoudness', () => {
  it('reads a full-scale 997 Hz sine as -3.01 LUFS, at 48 and 44.1 kHz', () => {
    expect(integratedLoudness([sine(997, 1, 5)], 48_000)).toBeCloseTo(-3.01, 1);
    expect(Math.abs(integratedLoudness([sine(997, 1, 5)], 48_000)! + 3.01)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(integratedLoudness([sine(997, 1, 5, 44_100)], 44_100)! + 3.01)).toBeLessThanOrEqual(0.02);
  });

  it('follows the amplitude in dB: -20 dB is -23.01 LUFS', () => {
    expect(Math.abs(integratedLoudness([sine(997, 0.1, 5)], 48_000)! + 23.01)).toBeLessThanOrEqual(0.02);
  });

  it('adds the channels: the same sine on both of a stereo pair is 3 dB louder', () => {
    const left = sine(997, 0.1, 5);
    expect(integratedLoudness([left, left], 48_000)! - integratedLoudness([left], 48_000)!).toBeCloseTo(3.01, 1);
  });

  it('reads noise at half the RMS 6.02 dB quieter', () => {
    const loud = integratedLoudness([noise(0.2, 5)], 48_000)!;
    const quiet = integratedLoudness([noise(0.1, 5)], 48_000)!;
    expect(loud - quiet).toBeCloseTo(6.02, 1);
    // White noise is mostly treble, which the K-weighting lifts: louder than its plain RMS (-13.98 dBFS).
    expect(loud).toBeGreaterThan(-13.98);
  });

  it('gates out what is under -70 LUFS (absolute gate)', () => {
    const tone = sine(997, 0.1, 10);
    // -80 dBFS hiss: counted, it would pull the mean down by 3 dB.
    const withHiss = concat(noise(0.0001, 10), tone, noise(0.0001, 10, 48_000, 99));
    // Only the blocks straddling a boundary, part tone, part hiss, pass the gate besides the tone's own.
    expect(Math.abs(integratedLoudness([withHiss], 48_000)! - integratedLoudness([tone], 48_000)!)).toBeLessThan(0.15);
  });

  it('gates out quiet passages more than 10 LU under the rest (relative gate)', () => {
    const loudPart = sine(997, 0.1, 4);
    const quietPart = sine(997, 0.003, 4); // -50.5 dBFS: over the absolute gate, under the relative one
    const measured = integratedLoudness([concat(loudPart, quietPart)], 48_000)!;
    expect(Math.abs(measured + 23.01)).toBeLessThan(0.3);
    // Without the relative gate the quiet half would count, and halve the mean power: about -26.
    expect(measured).toBeGreaterThan(-24);
  });

  it('is null for silence, and under one 400 ms block', () => {
    expect(integratedLoudness([silence(3)], 48_000)).toBeNull();
    expect(integratedLoudness([sine(997, 1, 0.35)], 48_000)).toBeNull();
    expect(integratedLoudness([new Float32Array(0)], 48_000)).toBeNull();
    expect(integratedLoudness([], 48_000)).toBeNull();
  });
});

describe('truePeak', () => {
  it('finds the peak between the samples of a quarter-rate sine sampled at ±45°', () => {
    const samples = sine(12_000, 1, 0.1, 48_000, Math.PI / 4);
    expect(Math.max(...samples.map(Math.abs))).toBeCloseTo(Math.SQRT1_2, 5);
    expect(truePeak([samples])).toBeGreaterThan(0.98);
    expect(truePeak([samples])).toBeLessThan(1.03);
  });

  it('is the sample peak for a slow sine, the largest channel, and 0 for silence', () => {
    expect(truePeak([sine(100, 0.5, 0.2)])).toBeCloseTo(0.5, 3);
    expect(truePeak([sine(100, 0.25, 0.2), sine(100, 0.5, 0.2)])).toBeCloseTo(0.5, 3);
    expect(truePeak([silence(0.2)])).toBe(0);
    expect(truePeak([new Float32Array(0)])).toBe(0);
  });
});

describe('mixDown', () => {
  it('returns a mono channel as it is and averages the others', () => {
    const one = new Float32Array([0.5, -0.5]);
    expect(mixDown([one])).toBe(one);
    expect([...mixDown([one, new Float32Array([0.25, 0.5])])]).toEqual([0.375, 0]);
  });
});

describe('firstSound', () => {
  it('finds the first sound after silence, to the 10 ms window', () => {
    expect(firstSound(concat(silence(1.25), sine(220, 0.1, 1)), 48_000)).toBe(1.25);
  });

  it('ignores a noise floor under the threshold, and honours another threshold', () => {
    const signal = concat(noise(0.001, 0.8), mix(sine(220, 0.1, 1), noise(0.001, 1)));
    expect(firstSound(signal, 48_000)).toBe(0.8); // -60 dBFS hiss
    expect(firstSound(signal, 48_000, -70)).toBe(0);
  });

  it('is 0 for a file that starts with sound, null for silence and for nothing', () => {
    expect(firstSound(sine(220, 0.1, 1), 48_000)).toBe(0);
    expect(firstSound(silence(2), 48_000)).toBeNull();
    expect(firstSound(new Float32Array(0), 48_000)).toBeNull();
  });
});

describe('frameCount / frameLevels', () => {
  it('has one level per video frame, the last partial frame included', () => {
    expect(frameCount(96_000, 48_000, 30)).toBe(60);
    expect(frameCount(96_001, 48_000, 30)).toBe(61);
    expect(frameCount(1, 48_000, 30)).toBe(1);
    expect(frameCount(0, 48_000, 30)).toBe(0);
    expect(frameLevels(silence(2), 48_000, 30)).toHaveLength(60);
    expect(frameLevels(silence(2.01), 48_000, 30)).toHaveLength(61);
    expect(frameLevels(silence(2), 48_000, 25)).toHaveLength(50);
    expect(frameLevels(new Float32Array(0), 48_000, 30)).toEqual([]);
  });

  it('is the RMS of each frame relative to the loudest, 0-1', () => {
    const levels = frameLevels(concat(sine(300, 0.5, 1), sine(300, 0.25, 1), silence(1)), 48_000, 30);
    expect(levels).toHaveLength(90);
    expect(levels.slice(0, 30).every((level) => Math.abs(level - 1) <= 0.002)).toBe(true);
    expect(levels.slice(30, 60).every((level) => Math.abs(level - 0.5) <= 0.002)).toBe(true);
    expect(levels.slice(60)).toEqual(Array(30).fill(0));
  });

  it('is all 0 for silence', () => {
    expect(new Set(frameLevels(silence(1), 48_000, 30))).toEqual(new Set([0]));
  });
});

describe('analyzeSamples', () => {
  it('measures everything at once, in plain data', () => {
    const analysis = analyzeSamples([concat(silence(0.5), sine(997, 0.1, 4))], 48_000, {fps: 30});
    expect(analysis.durationSeconds).toBe(4.5);
    expect(analysis.firstSoundSeconds).toBe(0.5);
    expect(analysis.peak).toBeCloseTo(0.1, 3);
    expect(Math.abs(analysis.lufs! + 23.01)).toBeLessThan(0.3);
    expect(analysis.fps).toBe(30);
    expect(analysis.levels).toHaveLength(135);
    expect(JSON.parse(JSON.stringify(analysis))).toEqual(analysis);
  });

  it('measures silence as no loudness and no first sound', () => {
    expect(analyzeSamples([silence(1)], 48_000, {fps: 30})).toMatchObject({
      lufs: null,
      peak: 0,
      firstSoundSeconds: null,
      durationSeconds: 1,
    });
  });
});

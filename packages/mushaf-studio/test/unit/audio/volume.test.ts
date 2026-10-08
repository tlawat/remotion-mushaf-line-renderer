// The per-frame side of the audio cleanup: the normalising gain and its peak clamp, the volume
// curve with its fades, the silence trim and the glow's smoothed level.
import {describe, expect, it} from 'vitest';
import {
  audioSchema,
  defaultAudio,
  gainFor,
  levelAt,
  silenceTrimSeconds,
  TRUE_PEAK_CEILING_DB,
  type VolumeCurve,
  volumeAt,
} from '../../../src/audio';

const db = (gain: number) => 20 * Math.log10(gain);

describe('audioSchema', () => {
  it('accepts its defaults and refuses values out of range', () => {
    expect(audioSchema.parse(defaultAudio)).toEqual(defaultAudio);
    expect(defaultAudio).toMatchObject({normalize: true, targetLufs: -14, fadeInSeconds: 0.3, fadeOutSeconds: 1});
    expect(audioSchema.safeParse({...defaultAudio, targetLufs: -24}).success).toBe(false);
    expect(audioSchema.safeParse({...defaultAudio, fadeOutSeconds: 6}).success).toBe(false);
    expect(audioSchema.safeParse({...defaultAudio, volume: 2.5}).success).toBe(false);
  });

  it('describes every field for the Props sidebar', () => {
    for (const [name, field] of Object.entries(audioSchema.shape)) {
      expect(field.description, name).toBeTruthy();
    }
  });
});

describe('gainFor', () => {
  it('brings the loudness to the target when the peak allows it', () => {
    expect(db(gainFor({lufs: -20, peak: 0.1}, -14))).toBeCloseTo(6, 2);
    expect(db(gainFor({lufs: -8, peak: 1}, -14))).toBeCloseTo(-6, 2);
    expect(gainFor({lufs: -14, peak: 0.5}, -14)).toBe(1);
  });

  it('stops where the true peak reaches -1 dBFS', () => {
    const gain = gainFor({lufs: -20, peak: 0.5}, -14);
    expect(gain).toBe(1.7825);
    expect(db(0.5 * gain)).toBeCloseTo(TRUE_PEAK_CEILING_DB, 2);
    // A peak already over the ceiling is brought down even at the target loudness.
    expect(db(1.2 * gainFor({lufs: -14, peak: 1.2}, -14))).toBeCloseTo(-1, 2);
    expect(db(0.5 * gainFor({lufs: -20, peak: 0.5}, -14, -3))).toBeCloseTo(-3, 2);
  });

  it('is 1 without a loudness (silence, a clip too short), and only the target without a peak', () => {
    expect(gainFor({lufs: null, peak: 0.3}, -14)).toBe(1);
    expect(db(gainFor({lufs: -30, peak: 0}, -14))).toBeCloseTo(16, 2);
  });
});

describe('volumeAt', () => {
  const curve: VolumeCurve = {gain: 2, fadeIn: 1, fadeOut: 2, durationInFrames: 301, fps: 30};

  it('fades in linearly from 0 over fadeIn', () => {
    expect(volumeAt(0, curve)).toBe(0);
    expect(volumeAt(15, curve)).toBe(1);
    expect(volumeAt(30, curve)).toBe(2);
    expect(volumeAt(100, curve)).toBe(2);
  });

  it('fades out linearly to 0 at the last frame', () => {
    expect(volumeAt(300 - 60, curve)).toBe(2);
    expect(volumeAt(300 - 30, curve)).toBe(1);
    expect(volumeAt(300, curve)).toBe(0);
    expect(volumeAt(320, curve)).toBe(0);
  });

  it('multiplies the user’s volume, and keeps the lower fade when they overlap', () => {
    expect(volumeAt(100, {...curve, volume: 0.5})).toBe(1);
    const short = {...curve, durationInFrames: 31};
    expect(volumeAt(15, short)).toBe(Math.min(15 / 30, 15 / 60) * 2);
  });

  it('is gain × volume everywhere without fades, and the same for the same frame', () => {
    const flat = {...curve, fadeIn: 0, fadeOut: 0, volume: 1.5};
    expect([0, 150, 300].map((frame) => volumeAt(frame, flat))).toEqual([3, 3, 3]);
    expect(volumeAt(17, curve)).toBe(volumeAt(17, curve));
  });
});

describe('silenceTrimSeconds', () => {
  it('starts the audio just before the first sound', () => {
    expect(silenceTrimSeconds({firstSoundSeconds: 2.4}, {offsetSeconds: 0})).toBe(2.25);
    expect(silenceTrimSeconds({firstSoundSeconds: 2.4}, {offsetSeconds: 0, padSeconds: 0})).toBe(2.4);
  });

  it('never moves past latestSeconds, and counts from the offset already there', () => {
    expect(silenceTrimSeconds({firstSoundSeconds: 2.4}, {offsetSeconds: 0, latestSeconds: 1})).toBe(1);
    expect(silenceTrimSeconds({firstSoundSeconds: 2.4}, {offsetSeconds: 1})).toBe(1.25);
  });

  it('is 0 when the audio already starts past the silence, for sound at once, and for a silent file', () => {
    expect(silenceTrimSeconds({firstSoundSeconds: 2.4}, {offsetSeconds: 3})).toBe(0);
    expect(silenceTrimSeconds({firstSoundSeconds: 0}, {offsetSeconds: 0})).toBe(0);
    expect(silenceTrimSeconds({firstSoundSeconds: null}, {offsetSeconds: 0})).toBe(0);
  });
});

describe('levelAt', () => {
  const levels = [0, 0, 1, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5];

  it('averages the levels around the frame', () => {
    expect(levelAt(levels, 2)).toBe(0.2);
    expect(levelAt(levels, 7)).toBe(0.5);
    expect(levelAt(levels, 2, 0)).toBe(1);
    expect(levelAt(levels, 2.4, 0)).toBe(1);
  });

  it('counts frames outside the file as silence', () => {
    expect(levelAt(levels, 9)).toBe(0.3);
    expect(levelAt(levels, -10)).toBe(0);
    expect(levelAt(levels, 50)).toBe(0);
    expect(levelAt([], 0)).toBe(0);
  });
});

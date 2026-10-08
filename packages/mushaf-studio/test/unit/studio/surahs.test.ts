import {describe, expect, it} from 'vitest';
import {ayahCount, SURAHS, surah, surahLabel} from '../../../src/studio/surahs';

describe('surahs', () => {
  it('lists the 114 surahs in order', () => {
    expect(SURAHS).toHaveLength(114);
    expect(SURAHS.map((s) => s.number)).toEqual(Array.from({length: 114}, (_, i) => i + 1));
    expect(new Set(SURAHS.map((s) => s.english)).size).toBe(114);
    expect(new Set(SURAHS.map((s) => s.arabic)).size).toBe(114);
    for (const entry of SURAHS) {
      expect(entry.arabic).toMatch(/^[؀-ۿ ]+$/);
      expect(entry.english.length).toBeGreaterThan(1);
      expect(Number.isInteger(entry.ayahs) && entry.ayahs >= 3).toBe(true);
    }
  });

  it('carries the Kufan ayah counts, 6,236 in all', () => {
    expect(SURAHS.reduce((sum, s) => sum + s.ayahs, 0)).toBe(6236);
    expect(ayahCount(1)).toBe(7);
    expect(ayahCount(2)).toBe(286);
    expect(ayahCount(3)).toBe(200);
    expect(ayahCount(4)).toBe(176);
    expect(ayahCount(9)).toBe(129);
    expect(ayahCount(18)).toBe(110);
    expect(ayahCount(36)).toBe(83);
    expect(ayahCount(55)).toBe(78);
    expect(ayahCount(103)).toBe(3);
    expect(ayahCount(114)).toBe(6);
  });

  it('answers nothing for a number that is not a surah', () => {
    expect(surah(0)).toBeUndefined();
    expect(surah(115)).toBeUndefined();
    expect(ayahCount(0)).toBe(0);
    expect(ayahCount(115)).toBe(0);
    expect(surahLabel(2)).toBe('2. Al-Baqarah (البقرة)');
    expect(surahLabel(200)).toBe('200');
  });
});

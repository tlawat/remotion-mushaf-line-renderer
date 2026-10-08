// Timings of either version read the same way: the surah of each ayah, the first and last ayah a
// recitation times, the translations' keys, and copies with their ayat changed that keep the version
// (a version 2 ayah keeps its surah). Version 1 holds one surah; version 2 crosses surahs.
import {type AyahTiming, normalizeTimings, type RecitationTimings} from '@tlawat/remotion-mushaf-line';
import type {StudioTimings} from '../types';

/** One ayah, by surah and number. */
export type AyahRef = {readonly surah: number; readonly ayah: number};

/**
 * The first and last ayah a recitation times, in recitation order: of one surah, or of several
 * (`from.surah < to.surah`).
 */
export type PassageSpan = {readonly from: AyahRef; readonly to: AyahRef};

/** The surah of `timings.ayat[index]`: the file's for version 1, the ayah's own for version 2. */
export const surahOfAyah = (timings: RecitationTimings, index: number): number =>
  timings.version === 1 ? timings.surah : timings.ayat[index]!.surah;

/** The first and last ayah of the timings (which have at least one, as `parseRecitationTimings()` checks). */
export const passageSpan = (timings: RecitationTimings): PassageSpan => {
  const last = timings.ayat.length - 1;
  return {
    from: {surah: surahOfAyah(timings, 0), ayah: timings.ayat[0]!.ayah},
    to: {surah: surahOfAyah(timings, last), ayah: timings.ayat[last]!.ayah},
  };
};

/** Whether the timings name ayahs of more than one surah. */
export const crossesSurahs = (timings: RecitationTimings): boolean => {
  const {from, to} = passageSpan(timings);
  return from.surah !== to.surah;
};

/** `"surah:ayah"` of every ayah of the timings, in the file's order: the translations' keys. */
export const ayahKeysOf = (timings: RecitationTimings): string[] =>
  normalizeTimings(timings).ayat.map((ayah) => `${ayah.surah}:${ayah.ayah}`);

/** Mushaf order of two ayahs: negative when `a` comes first. */
export const compareAyahs = (a: AyahRef, b: AyahRef): number => a.surah - b.surah || a.ayah - b.ayah;

/**
 * The timings with the ayat `keep` accepts, in order, each the same object; `keep` gets the ayah and
 * its surah. A version 1 file comes back exactly as `{...timings, ayat: timings.ayat.filter(...)}`.
 */
export const filterAyat = (
  timings: StudioTimings,
  keep: (ayah: AyahTiming, surah: number) => boolean,
): StudioTimings => {
  if (timings.version === 1) return {...timings, ayat: timings.ayat.filter((ayah) => keep(ayah, timings.surah))};
  return {...timings, ayat: timings.ayat.filter((ayah) => keep(ayah, ayah.surah))};
};

/**
 * The timings with every ayah through `map`, which returns the ayah changed (its keys spread first, so
 * their order is kept). A version 2 ayah keeps its surah whatever `map` returns. A version 1 file
 * comes back exactly as `{...timings, ayat: timings.ayat.map(map)}`.
 */
export const mapAyat = (
  timings: StudioTimings,
  map: (ayah: AyahTiming, index: number) => AyahTiming,
): StudioTimings => {
  if (timings.version === 1) return {...timings, ayat: timings.ayat.map(map)};
  return {...timings, ayat: timings.ayat.map((ayah, i) => ({...map(ayah, i), surah: ayah.surah}))};
};

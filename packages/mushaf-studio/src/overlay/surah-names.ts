// The surahs' transliterated names for the title overlay. The list itself is the panel's
// (`studio/surahs.ts`, plain data with no Studio code in it), so there is one table of names.
import {SURAHS} from '../studio/surahs';

/** The 114 transliterated names in order (`SURAH_NAMES[0]` is "Al-Fatihah"). */
export const SURAH_NAMES: readonly string[] = SURAHS.map((s) => s.english);

/** The transliterated name of a surah (`surahEnglishName(36)` is "Ya-Sin"); "Surah n" for a number that is not one. */
export const surahEnglishName = (surah: number): string => SURAH_NAMES[surah - 1] ?? `Surah ${surah}`;

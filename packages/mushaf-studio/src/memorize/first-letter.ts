/** U+0640 ARABIC TATWEEL: the stroke after the first letter that says "the word goes on". */
export const TATWEEL = 'ـ';

/** A combining mark: what follows a letter in the same grapheme. */
const MARK = /\p{M}/u;

/**
 * The diacritics a first letter is shown without: the harakat, shadda, sukun and the other marks of
 * U+064B–U+065F, the dagger alif U+0670, and the Quranic annotation signs U+06D6–U+06ED (small
 * high letters, the pause signs, the small waw and yeh, the rounded zero).
 */
const DIACRITIC = /[ً-ٰٟۖ-ۭ]/gu;

/**
 * The first letter of a Unicode Quran word followed by a tatweel, its diacritics left off: the
 * cue `'first-letters'` shows for a word not yet recited. The first grapheme is the first code
 * point and the combining marks after it, counted here rather than by `Intl.Segmenter` so every
 * engine cuts the same way; marks outside the diacritic ranges (none in the Uthmani text) stay.
 * `''` for an empty word.
 *
 * ```ts
 * firstLetterOf('ٱلْحَمْدُ') // 'ٱـ'
 * firstLetterOf('بِسْمِ')    // 'بـ'
 * ```
 */
export const firstLetterOf = (word: string): string => {
  const points = Array.from(word);
  const first = points[0];
  if (first === undefined) return '';
  let grapheme = first;
  for (const point of points.slice(1)) {
    if (!MARK.test(point)) break;
    grapheme += point;
  }
  return `${grapheme.replace(DIACRITIC, '')}${TATWEEL}`;
};

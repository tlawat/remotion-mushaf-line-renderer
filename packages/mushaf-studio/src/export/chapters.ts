import {MushafStudioError} from '../errors';
import {ayahRangeText, surahEnglishName} from '../overlay';
import type {StudioTimings} from '../types';

/** YouTube's rules for the chapters of a description: at least this many... */
export const YOUTUBE_MIN_CHAPTERS = 3;
/** ...each at least this many seconds long, the first at 0:00. */
export const YOUTUBE_MIN_CHAPTER_SECONDS = 10;

export type ChaptersOptions = {
  /** The name before the range of each chapter; default the surah's transliterated name ("Al-Fatihah"). */
  readonly surahName?: string | undefined;
  /** `'ayah'` (default): a chapter may start at every ayah. `'n-ayahs'`: at every `n`-th ayah. */
  readonly every?: 'ayah' | 'n-ayahs' | undefined;
  /** Ayahs per chapter under `every: 'n-ayahs'`, a whole number from 1; default 5. */
  readonly n?: number | undefined;
  /**
   * Seconds added to every time: whatever the video shows before the timings' 0, such as an intro
   * card that delays the recitation. Default 0.
   */
  readonly offsetSeconds?: number | undefined;
};

type Chapter = {
  start: number;
  fromAyah: number;
  toAyah: number;
};

/** `M:SS`, or `H:MM:SS` from an hour, as YouTube reads them; seconds are floored, so a chapter never starts early. */
const chapterTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds + 1e-6));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// A recitation may go back to an ayah, so a chapter's range is the lowest and highest ayah in it.
const merge = (chapter: Chapter, fromAyah: number, toAyah: number): void => {
  chapter.fromAyah = Math.min(chapter.fromAyah, fromAyah);
  chapter.toAyah = Math.max(chapter.toAyah, toAyah);
};

const badOption = (option: string, value: unknown, expected: string): never => {
  throw new MushafStudioError(
    'BAD_STUDIO_PROP',
    `chaptersFromTimings() ${option} is ${JSON.stringify(value)}: expected ${expected}.`,
    {option, value},
  );
};

/**
 * YouTube chapters for a recitation, as the lines of a description: `"0:00 Al-Fatihah 1:2"`, one
 * per chapter, a chapter of several ayahs written as a range (`"0:12 Al-Fatihah 1:4–5"`). Times are
 * the timings' (pass the composition's, `resolved.timings`, which start at the video's 0) plus
 * `offsetSeconds`, floored to the second.
 *
 * The rules, so that YouTube accepts the list:
 * - a chapter starts at an ayah's start (every ayah, or every `n`-th under `every: 'n-ayahs'`);
 * - the first chapter starts at 0:00, whenever its first ayah does;
 * - an ayah, or a group of `n`, that starts less than 10 s after the chapter before it starts is
 *   merged into that chapter, which then names the range;
 * - the last chapter is merged into the one before it when it lasts less than 10 s (to the end of
 *   the last ayah);
 * - fewer than 3 chapters left: none at all (`[]`), since YouTube ignores such a list.
 *
 * `BAD_STUDIO_PROP` for an `n` that is not a whole number from 1, or an `offsetSeconds` that is not
 * a finite number.
 */
export const chaptersFromTimings = (timings: StudioTimings, options: ChaptersOptions = {}): readonly string[] => {
  const n = options.every === 'n-ayahs' ? (options.n ?? 5) : 1;
  if (!Number.isInteger(n) || n < 1) badOption('n', options.n, 'a whole number of ayahs, 1 or more');
  const offset = options.offsetSeconds ?? 0;
  if (!Number.isFinite(offset)) badOption('offsetSeconds', options.offsetSeconds, 'a finite number of seconds');
  const name = options.surahName ?? surahEnglishName(timings.surah);
  if (timings.ayat.length === 0) return [];

  const chapters: Chapter[] = [];
  for (let i = 0; i < timings.ayat.length; i += n) {
    const group = timings.ayat.slice(i, i + n);
    const start = chapters.length === 0 ? 0 : group[0]!.start + offset;
    const ayahs = group.map((ayah) => ayah.ayah);
    const fromAyah = Math.min(...ayahs);
    const toAyah = Math.max(...ayahs);
    const last = chapters[chapters.length - 1];
    if (last !== undefined && start - last.start < YOUTUBE_MIN_CHAPTER_SECONDS) merge(last, fromAyah, toAyah);
    else chapters.push({start, fromAyah, toAyah});
  }
  const end = Math.max(...timings.ayat.map((ayah) => ayah.end)) + offset;
  const final = chapters[chapters.length - 1]!;
  if (chapters.length > 1 && end - final.start < YOUTUBE_MIN_CHAPTER_SECONDS) {
    chapters.pop();
    merge(chapters[chapters.length - 1]!, final.fromAyah, final.toAyah);
  }
  if (chapters.length < YOUTUBE_MIN_CHAPTERS) return [];
  return chapters.map(
    (chapter) =>
      `${chapterTime(chapter.start)} ${name} ${ayahRangeText(timings.surah, chapter.fromAyah, chapter.toAyah)}`,
  );
};

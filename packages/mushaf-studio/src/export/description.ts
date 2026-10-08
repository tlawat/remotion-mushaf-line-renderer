import {type AyahRef, compareAyahs, surahOfAyah} from '../compositions/timings';
import {ayahSpanText} from '../overlay';
import type {StudioTimings} from '../types';

/** The attribution of the mushaf's fonts, which every video shows. */
export const FONTS_ATTRIBUTION =
  "Mushaf: KFGQPC V4 fonts, © King Fahd Glorious Qur'an Printing Complex, via QUL (qul.tarteel.ai)";
/** The attribution CC-BY-4.0 asks for, when the timings came from the QUD Universal Aligner or its catalogue. */
export const QUD_ATTRIBUTION = 'Timings: QUD Universal Aligner (aligner.qud.dev), CC-BY-4.0';

export type AttributionOptions = {
  readonly timings: StudioTimings;
  /** The translation shown, by name (`meta.name` of the file); none when empty or left out. */
  readonly translationName?: string | undefined;
  /** Where that translation came from; default `'quran.com'`. */
  readonly translationSource?: string | undefined;
};

/**
 * The credits a published video owes, one line each: the fonts (always), the QUD timings when the
 * sidecar says they came from QUD (`alignment.source` `'qud'` or `'qud-catalogue'`), and the
 * translation when one is named. For a description or an end card; see docs/mushaf-studio/licensing.md.
 *
 * ```ts
 * attributionLines({timings, translationName: 'Saheeh International'});
 * // ['Mushaf: KFGQPC V4 fonts, ...', 'Timings: QUD Universal Aligner (aligner.qud.dev), CC-BY-4.0', 'Translation: Saheeh International (quran.com)']
 * ```
 */
export const attributionLines = (options: AttributionOptions): readonly string[] => {
  const lines = [FONTS_ATTRIBUTION];
  const source = options.timings.alignment?.source;
  if (source === 'qud' || source === 'qud-catalogue') lines.push(QUD_ATTRIBUTION);
  const translation = options.translationName?.trim() ?? '';
  if (translation !== '') lines.push(`Translation: ${translation} (${options.translationSource ?? 'quran.com'})`);
  return lines;
};

export type YoutubeDescriptionOptions = AttributionOptions & {
  /** The surah's name as the title shows it ("Al-Fatihah"; `surahSpanName()` across surahs). */
  readonly surahName: string;
  /** The reciter's name; the first line leaves it out when empty. */
  readonly reciter: string;
  /** The lines of `chaptersFromTimings()`; no Chapters section when empty. */
  readonly chapters: readonly string[];
};

/**
 * A description to paste into YouTube: what is recited and by whom, the chapters (YouTube reads
 * them from the description), and the credits of `attributionLines()`. Sections are separated by a
 * blank line; the text ends with a newline. The range is the lowest to the highest ayah timed,
 * across surahs from the first surah's to the last's ("Al-Falaq – An-Nas 113:4–114:2").
 *
 * ```text
 * Al-Fatihah 1:2–7, recited by Mishary Alafasy
 *
 * Chapters
 * 0:00 Al-Fatihah 1:2–3
 * ...
 *
 * Credits
 * Mushaf: KFGQPC V4 fonts, © King Fahd Glorious Qur'an Printing Complex, via QUL (qul.tarteel.ai)
 * ```
 */
export const youtubeDescription = (options: YoutubeDescriptionOptions): string => {
  const {timings} = options;
  const ayahs = timings.ayat
    .map((ayah, i): AyahRef => ({surah: surahOfAyah(timings, i), ayah: ayah.ayah}))
    .sort(compareAyahs);
  const range = ayahs.length === 0 ? '' : ` ${ayahSpanText(ayahs[0]!, ayahs[ayahs.length - 1]!)}`;
  const reciter = options.reciter.trim();
  const title = `${options.surahName}${range}${reciter === '' ? '' : `, recited by ${reciter}`}`;
  const sections = [title];
  if (options.chapters.length > 0) sections.push(['Chapters', ...options.chapters].join('\n'));
  sections.push(['Credits', ...attributionLines(options)].join('\n'));
  return `${sections.join('\n\n')}\n`;
};

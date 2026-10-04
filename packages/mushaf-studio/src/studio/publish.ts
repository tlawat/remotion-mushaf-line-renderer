// What the Review tab's export row hands to YouTube: chapters and a description from the
// composition's timings, the thumbnail still's props, and the clipboard they are copied to.
import {chaptersFromTimings} from '../export/chapters';
import {youtubeDescription} from '../export/description';
import {surahEnglishName} from '../overlay/surah-names';
import type {StudioTimings} from '../types';
import {reciterOf, resolvedTranslationsOf, type StudioCompositionProps, type StudioResolved} from './tab-props';

/** The id the app's Root gives `<MushafThumbnail>`: the export row's Thumbnail button saves its props. */
export const THUMBNAIL_COMPOSITION_ID = 'MushafThumbnail';

/**
 * YouTube chapters of the composition: `resolved.timings` start at the video's 0, so no offset.
 * `[]` when the passage is too short for YouTube (fewer than 3 chapters 10 s apart).
 */
export const chaptersOf = (timings: StudioTimings): readonly string[] =>
  chaptersFromTimings(timings, {offsetSeconds: 0});

/** Where a translation came from, as the credits name it. */
const sourceName = (source: string): string => (source === 'qul' ? 'QUL, qul.tarteel.ai' : source);

/**
 * The description of `youtubeDescription()` for the composition: the surah and range of the
 * timings, the overlay's reciter, the chapters, and the credits (the translations the composition
 * loaded, by their `meta.name`, with the first one's source).
 */
export const descriptionOf = (props: StudioCompositionProps, resolved: StudioResolved): string => {
  const {timings} = resolved;
  const translations = resolvedTranslationsOf(resolved);
  const names = [...new Set(translations.map((translation) => translation.meta.name.trim()).filter(Boolean))];
  const first = translations[0];
  return youtubeDescription({
    timings,
    surahName: surahEnglishName(timings.surah),
    reciter: reciterOf(props),
    translationName: names.join(', '),
    translationSource: first ? sourceName(first.meta.source) : undefined,
    chapters: chaptersOf(timings),
  });
};

/** The props `<MushafThumbnail>` takes from the composition: the surah, the range timed, and the reciter as its title. */
export type ThumbnailPatch = {
  readonly surah: number;
  readonly fromAyah: number;
  readonly toAyah: number;
  readonly title: string;
};

/** The thumbnail of the passage `timings` time: its lowest and highest ayah, titled with the overlay's reciter. */
export const thumbnailPatchOf = (props: StudioCompositionProps, timings: StudioTimings): ThumbnailPatch => {
  const ayahs = timings.ayat.map((ayah) => ayah.ayah);
  return {
    surah: timings.surah,
    fromAyah: ayahs.length === 0 ? 1 : Math.max(1, Math.min(...ayahs)),
    toAyah: ayahs.length === 0 ? 0 : Math.max(...ayahs),
    title: reciterOf(props),
  };
};

/**
 * Copies `text` to the clipboard: `navigator.clipboard`, else a hidden selected textarea and
 * `execCommand('copy')` (an http Studio on another host has no clipboard API). Resolves with
 * whether either worked; on `false` the caller shows the text for the user to copy.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused (no permission, the page not focused): try the selection.
  }
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
};

import {staticFile as remotionStaticFile} from 'remotion';
import {readTimings, trimTimings} from '../compositions/recitation/resolve';
import {fileUrl, loadTextFile} from '../compositions/shared';
import {describeValue, MushafStudioError} from '../errors';
import {clipTimeline, type MemorizeClip} from '../memorize/timeline';
import type {AyahTranslation, StudioTimings} from '../types';
import {unicodeFontOf} from './font';
import type {MushafAyahTextProps} from './schema';
import {type AyahWord, type AyahWords, ayahWordsOf, loadAyahWords} from './text';

/** One timed ayah of the passage with its words, as `<MushafAyahText>` shows it: one Sequence each. */
export type ResolvedAyah = {
  readonly surah: number;
  readonly ayah: number;
  /** Seconds, from the timings. */
  readonly start: number;
  readonly end: number;
  readonly words: readonly AyahWord[];
};

/** What `calculateMetadata()` of `<MushafAyahText>` resolves once per render from the content props. */
export type ResolvedAyahText = {
  /** Trimmed to the range, without the ayahs the recording does not carry whole. */
  readonly timings: StudioTimings;
  readonly text: AyahWords;
  readonly translation: AyahTranslation | null;
  /** One per timed ayah, in order. */
  readonly ayahs: readonly ResolvedAyah[];
  /** The clip timeline of `memorize` (`clipTimeline()`): one clip per ayah at its own time when ayahs play once. */
  readonly clips: readonly MemorizeClip[];
};

export type ResolveAyahTextOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly staticFile?: ((path: string) => string) | undefined;
};

const bad = (message: string, details: Readonly<Record<string, unknown>>): MushafStudioError =>
  new MushafStudioError('BAD_STUDIO_PROP', message, details);

/**
 * Resolves the content props once: fetches and validates the timings and trims them to the ayah
 * range (as `<MushafRecitation>` does), loads the text file and the ayah translation, and pairs
 * every timed ayah with its words, and lays out the clip timeline of `memorize`. The text is read from `public/` only, never fetched from
 * quran.com here, so renders are offline and reproducible. Throws `BAD_STUDIO_PROP` for an empty
 * `textFile`, a text in a script the font does not set, or an ayah the text does not hold. Pure
 * given `fetch`; `calculateMetadata()` is this plus the size and duration.
 */
export const resolveAyahText = async (
  props: MushafAyahTextProps,
  options: ResolveAyahTextOptions = {},
): Promise<ResolvedAyahText> => {
  const io = {fetch: options.fetch ?? globalThis.fetch, staticFile: options.staticFile ?? remotionStaticFile};
  const font = unicodeFontOf(props.font);
  if (props.textFile === '') {
    throw bad(
      'textFile is empty, and the Quran text is not fetched during a render. Fetch it once from the Mushaf panel’s Text tab, or run fetchQuranComText({chapter, script: "uthmani"}) and write serialiseAyahWords() of the result to public/, then set textFile to its path (e.g. "mushaf-studio/fatiha/text-uthmani.json").',
      {prop: 'textFile'},
    );
  }
  const timings = trimTimings(await readTimings(props.timingsFile, io), props.fromAyah, props.toAyah);
  const [text, translation] = await Promise.all([
    loadAyahWords(fileUrl(props.textFile, io.staticFile), {fetch: io.fetch}),
    loadTextFile('ayah', 'translationFile', props.text.translationFile, io),
  ]);
  if (text.script !== font.script) {
    throw bad(
      `textFile ${describeValue(props.textFile)} holds ${text.script} text, but font "${props.font}" sets ${font.script} text. Fetch the ${font.script} text into textFile, or pick a font for ${text.script}.`,
      {prop: 'textFile', file: props.textFile, script: text.script, font: props.font},
    );
  }
  const ayahs = timings.ayat.map((timing): ResolvedAyah => {
    const words = ayahWordsOf(text, timings.surah, timing.ayah);
    if (words.length === 0) {
      throw bad(
        `textFile ${describeValue(props.textFile)} has no words for ayah ${timings.surah}:${timing.ayah}, which the timings carry. Fetch the text of surah ${timings.surah} again (the panel’s Text tab), or narrow fromAyah/toAyah to the ayahs it holds.`,
        {prop: 'textFile', file: props.textFile, surah: timings.surah, ayah: timing.ayah},
      );
    }
    return {surah: timings.surah, ayah: timing.ayah, start: timing.start, end: timing.end, words};
  });
  return {timings, text, translation, ayahs, clips: clipTimeline(timings, props.memorize)};
};

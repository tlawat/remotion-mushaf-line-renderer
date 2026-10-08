import {normalizeTimings} from '@tlawat/remotion-mushaf-line';
import {staticFile as remotionStaticFile} from 'remotion';
import {
  loadTranslationLayers,
  recitedPassageOf,
  resolveEndCardContent,
  translationLayerSpecs,
} from '../compositions/extras';
import {readTimings, shiftTimings, trimTimings} from '../compositions/recitation/resolve';
import {fileUrl} from '../compositions/shared';
import {ayahKeysOf} from '../compositions/timings';
import {describeValue, MushafStudioError} from '../errors';
import {clipTimeline, type MemorizeClip} from '../memorize/timeline';
import type {Memorize} from '../schema';
import type {AyahTranslation, ResolvedExtras, StudioTimings} from '../types';
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
export type ResolvedAyahText = ResolvedExtras & {
  /**
   * Trimmed to the range (one surah's timings only: timings across surahs are used whole), without
   * the ayahs the recording does not carry whole; moved `audioOffsetSeconds` earlier when
   * `audio.trimSilence` skipped the recording's leading silence.
   */
  readonly timings: StudioTimings;
  /** Seconds of the recording skipped before frame 0 (`audio.trimSilence`); 0 or unset: the file's own times. */
  readonly audioOffsetSeconds?: number | undefined;
  readonly text: AyahWords;
  /** The first translation shown (`translations[0]`), or `null`. */
  readonly translation: AyahTranslation | null;
  /** One per timed ayah, in order, each with its own surah (timings across surahs name several). */
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
 * range (as `<MushafRecitation>` does: timings across surahs are used whole, and the text file
 * must then hold every surah they name), loads the text file and the ayah translation, and pairs
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
  const keys = new Set(ayahKeysOf(timings));
  const [text, translations, endCard] = await Promise.all([
    loadAyahWords(fileUrl(props.textFile, io.staticFile), {fetch: io.fetch}),
    loadTranslationLayers(translationLayerSpecs(props.text), keys, io),
    resolveEndCardContent(props.endCard, recitedPassageOf(timings), io),
  ]);
  if (text.script !== font.script) {
    throw bad(
      `textFile ${describeValue(props.textFile)} holds ${text.script} text, but font "${props.font}" sets ${font.script} text. Fetch the ${font.script} text into textFile, or pick a font for ${text.script}.`,
      {prop: 'textFile', file: props.textFile, script: text.script, font: props.font},
    );
  }
  const all = normalizeTimings(timings).ayat;
  const surahs = [...new Set(all.map((timing) => timing.surah))];
  const ayahs = all.map((timing): ResolvedAyah => {
    const {surah} = timing;
    const words = ayahWordsOf(text, surah, timing.ayah);
    if (words.length === 0) {
      // Version 2 is used whole (no range) and the Text tab fetches one surah: the file must be merged.
      const fix =
        timings.version === 2
          ? `These timings (version 2) are used whole and name surah${surahs.length === 1 ? '' : 's'} ${surahs.join(', ')}, so textFile must hold the words of every one: merge the text of surah ${surah} into it (fetchQuranComText({chapter: ${surah}, script: "${text.script}"}) per surah, their "words" in one file through serialiseAyahWords()).`
          : `Fetch the text of surah ${surah} again (the panel’s Text tab), or narrow fromAyah/toAyah to the ayahs it holds.`;
      throw bad(
        `textFile ${describeValue(props.textFile)} has no words for ayah ${surah}:${timing.ayah}, which the timings carry. ${fix}`,
        {prop: 'textFile', file: props.textFile, surah, ayah: timing.ayah},
      );
    }
    return {surah, ayah: timing.ayah, start: timing.start, end: timing.end, words};
  });
  return {
    timings,
    text,
    translation: translations[0] ?? null,
    translations,
    ayahs,
    clips: clipTimeline(timings, props.memorize),
    endCard,
  };
};

/**
 * A resolved ayah text that starts `seconds` later in the recording (`audio.trimSilence`):
 * `audioOffsetSeconds` grows by it, and the timings, the ayahs and the clip timeline move that much
 * earlier. The same object for 0.
 */
export const skipAyahTextStart = (
  resolved: ResolvedAyahText,
  seconds: number,
  memorize: Pick<Memorize, 'mode' | 'repeat' | 'pauseSeconds'>,
): ResolvedAyahText => {
  if (seconds === 0) return resolved;
  const timings = shiftTimings(resolved.timings, seconds);
  const earlier = (t: number): number => Math.round((t - seconds) * 1e6) / 1e6;
  return {
    ...resolved,
    timings,
    audioOffsetSeconds: Math.round(((resolved.audioOffsetSeconds ?? 0) + seconds) * 1e6) / 1e6,
    ayahs: resolved.ayahs.map((ayah) => ({...ayah, start: earlier(ayah.start), end: earlier(ayah.end)})),
    clips: clipTimeline(timings, memorize),
  };
};

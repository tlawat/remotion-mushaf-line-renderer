// What the compositions resolve once per render besides their own content, shared by all of them:
// the stacked translations, the audio's cleanup (its analysis, gain, silence trim and levels), the
// end card's content and a background video's length. Run in `calculateMetadata()` and the
// resolvers, never during a frame; the frames read the plain data these put in `resolved`.
import {analyzeAudio} from '../audio/analyze';
import type {AudioSettings} from '../audio/schema';
import {gainFor, silenceTrimSeconds} from '../audio/volume';
import {probeVideoSeconds} from '../background/MushafBackground';
import type {Background} from '../background/schema';
import {loadChapterInfo} from '../content/chapter-info';
import {loadTafsir, tafsirEntryFor} from '../content/tafsir';
import {describeValue, isMushafStudioError, MushafStudioError} from '../errors';
import type {EndCardSettings, Text} from '../schema';
import {AUTO_FONT} from '../schema';
import type {AyahTranslation, ResolvedAudio, ResolvedEndCard} from '../types';
import {fileUrl, loadTextFile} from './shared';

type Io = {
  readonly fetch: typeof fetch;
  readonly staticFile: (path: string) => string;
  readonly signal?: AbortSignal | undefined;
};

// ---------------------------------------------------------------------------------------------
// Translations

/**
 * One translation the composition stacks, as the props ask for it: its file, its font (`'auto'` or
 * a CSS family), size and colour, and its direction (`'language'`: from the file's language).
 */
export type TranslationLayerSpec = {
  readonly file: string;
  readonly font: string;
  readonly fontSize: number;
  readonly color: string;
  readonly direction: 'ltr' | 'rtl' | 'language';
  /** The prop it comes from, for error messages: `translationFile` or `translations.1.file`. */
  readonly prop: 'translationFile' | `translations.${number}.file`;
};

/** The fields of a `text` group the translations read. `translations` may be missing in props saved before it. */
export type TranslationTextProps = Pick<
  Text,
  'translationFile' | 'translationFont' | 'translationSize' | 'translationColor' | 'translationDirection'
> & {readonly translations?: Text['translations'] | undefined};

/**
 * The translations a `text` group shows, top to bottom: the layers of `translations` that name a
 * file, or when there are none, `translationFile` with the `translation*` fields (its direction as
 * `translationDirection` says). `[]` for no translation. Where they go (`translationPosition`) is the component's.
 */
export const translationLayerSpecs = (text: TranslationTextProps): readonly TranslationLayerSpec[] => {
  const layers = text.translations ?? [];
  if (layers.length > 0) {
    return layers.flatMap((layer, i): TranslationLayerSpec[] =>
      layer.file === ''
        ? []
        : [
            {
              file: layer.file,
              font: layer.font,
              fontSize: layer.fontSize,
              color: layer.color,
              direction: 'language',
              prop: `translations.${i}.file`,
            },
          ],
    );
  }
  if (text.translationFile === '') return [];
  return [
    {
      file: text.translationFile,
      font: text.translationFont,
      fontSize: text.translationSize,
      color: text.translationColor,
      direction: text.translationDirection,
      prop: 'translationFile',
    },
  ];
};

/** A translation with only the ayahs of `keys` (`"surah:ayah"`): what the composition can show, so the props stay small. */
export const pickAyahs = (translation: AyahTranslation, keys: Iterable<string>): AyahTranslation => {
  const text: Record<string, string> = {};
  for (const key of keys) {
    const value = translation.text[key];
    if (value !== undefined) text[key] = value;
  }
  return {...translation, text};
};

/**
 * Loads every translation `specs` names, in order, each checked to be an ayah-by-ayah file (a word
 * file is `BAD_STUDIO_PROP` naming its prop) and cut to `keys`. More than three is
 * `BAD_STUDIO_PROP` too (the schema says so; a `<Player>`'s props are not checked by it).
 */
export const loadTranslationLayers = async (
  specs: readonly TranslationLayerSpec[],
  keys: ReadonlySet<string>,
  io: Io,
): Promise<readonly AyahTranslation[]> => {
  if (specs.length > 3) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `text.translations has ${specs.length} translations with a file; a stack holds 1 to 3. Remove one.`,
      {prop: 'text.translations', count: specs.length},
    );
  }
  const loaded = await Promise.all(specs.map((spec) => loadTextFile('ayah', spec.prop, spec.file, io)));
  return loaded.flatMap((translation) => (translation === null ? [] : [pickAyahs(translation, keys)]));
};

/** The fonts a translation spec names that the stack loads itself: `'auto'`. */
export const isAutoFont = (font: string): boolean => font.trim().toLowerCase() === AUTO_FONT;

// ---------------------------------------------------------------------------------------------
// Audio

/** No analysis: the audio plays as it is. */
export const NO_AUDIO_ANALYSIS: ResolvedAudio = {gain: 1, trimSeconds: 0, levels: []};

/** Whether the background's glow is drawn, so the levels are worth measuring. */
export const glowIsOn = (background: Pick<Background, 'glow'>): boolean =>
  background.glow.enabled && background.glow.strength > 0;

/** Whether `calculateMetadata()` has to analyse the recording: there is one, and something uses the analysis. */
export const needsAudioAnalysis = (
  audioFile: string,
  audio: Pick<AudioSettings, 'normalize' | 'trimSilence'>,
  background: Pick<Background, 'glow'>,
): boolean => audioFile !== '' && (audio.normalize || audio.trimSilence || glowIsOn(background));

export type AudioCleanupOptions = {
  readonly audioFile: string;
  readonly audio: AudioSettings;
  readonly background: Pick<Background, 'glow'>;
  /** Seconds of the recording the composition already skips (`audioOffsetSeconds`). */
  readonly offsetSeconds: number;
  /**
   * The latest second of the composition, on its clock before the trim, the audio may start at:
   * where the first line (or ayah) starts to come in, so it still enters before its first word.
   */
  readonly latestSeconds: number;
  /** The last ayah's end on the composition's clock before the trim: the levels are kept to it plus a second. */
  readonly endSeconds: number;
  readonly fps: number;
  readonly staticFile: (path: string) => string;
  readonly signal?: AbortSignal | undefined;
};

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Analyses the recording when something needs it (`needsAudioAnalysis()`) and says what to do with
 * it: the gain that brings it to `audio.targetLufs` (`gainFor()`, under `normalize`), the seconds of
 * leading silence to skip (`silenceTrimSeconds()`, under `trimSilence`, never past `latestSeconds`)
 * and, for the glow, one level per frame from the composition's new start (three decimals). An
 * analysis that fails with `AUDIO_ANALYSIS_FAILED` (no Web Audio, a file the browser cannot fetch or
 * decode) is not an error: the audio plays as it is, and `warning` says why. Any other failure
 * (an abort) passes through.
 */
export const resolveAudioCleanup = async (
  options: AudioCleanupOptions,
): Promise<{readonly audio: ResolvedAudio; readonly warning: string | null}> => {
  const {audio, background, fps} = options;
  if (!needsAudioAnalysis(options.audioFile, audio, background)) return {audio: NO_AUDIO_ANALYSIS, warning: null};
  let analysis: Awaited<ReturnType<typeof analyzeAudio>>;
  try {
    analysis = await analyzeAudio(fileUrl(options.audioFile, options.staticFile), {
      fps,
      ...(options.signal ? {signal: options.signal} : {}),
    });
  } catch (error) {
    if (isMushafStudioError(error) && error.code === 'AUDIO_ANALYSIS_FAILED') {
      return {audio: NO_AUDIO_ANALYSIS, warning: error.message};
    }
    throw error;
  }
  const gain = audio.normalize ? gainFor(analysis, audio.targetLufs) : 1;
  const trimSeconds = audio.trimSilence
    ? silenceTrimSeconds(analysis, {
        offsetSeconds: options.offsetSeconds,
        latestSeconds: options.offsetSeconds + Math.max(0, options.latestSeconds),
      })
    : 0;
  let levels: readonly number[] = [];
  if (glowIsOn(background)) {
    const from = Math.round((options.offsetSeconds + trimSeconds) * fps);
    const count = Math.max(0, Math.ceil((options.endSeconds - trimSeconds + 1) * fps));
    levels = analysis.levels.slice(from, from + count).map(round3);
  }
  return {audio: {gain, trimSeconds, levels}, warning: null};
};

// ---------------------------------------------------------------------------------------------
// End card

/** Frames the end card adds to the composition: `seconds` at `fps`, 0 for none. */
export const endCardFrames = (endCard: Pick<EndCardSettings, 'show' | 'seconds'> | undefined, fps: number): number =>
  endCard === undefined || endCard.show === 'none' ? 0 : Math.max(1, Math.round(endCard.seconds * fps));

const emptyFile = (prop: 'tafsirFile' | 'chapterInfoFile', show: string): MushafStudioError =>
  new MushafStudioError(
    'BAD_STUDIO_PROP',
    `endCard.show is "${show}" but endCard.${prop} is empty. Fetch it in the Mushaf panel's Text tab (or write it with ${prop === 'tafsirFile' ? 'serialiseTafsir()' : 'serialiseChapterInfo()'}) and set its path under public/, or pick another end card.`,
    {prop: `endCard.${prop}`},
  );

/**
 * The end card's content: for `'tafsir'`, the tafsir file cut to the entry that covers the last ayah
 * recited (`tafsirEntryFor()`); for `'chapter-info'`, the surah's introduction, which must be the
 * surah recited. `BAD_STUDIO_PROP` for a missing file or another surah's introduction; the loaders'
 * own errors (`TRANSLATION_FETCH_FAILED`, `BAD_TRANSLATION_FILE`) pass through.
 */
export const resolveEndCardContent = async (
  endCard: EndCardSettings,
  recited: {readonly surah: number; readonly lastAyah: number},
  io: Pick<Io, 'fetch' | 'staticFile'>,
): Promise<ResolvedEndCard> => {
  if (endCard.show === 'tafsir') {
    if (endCard.tafsirFile === '') throw emptyFile('tafsirFile', endCard.show);
    const tafsir = await loadTafsir(fileUrl(endCard.tafsirFile, io.staticFile), {fetch: io.fetch});
    const entry = tafsirEntryFor(tafsir, `${recited.surah}:${recited.lastAyah}`);
    return {tafsir: {...tafsir, entries: entry ? [entry] : []}, chapterInfo: null};
  }
  if (endCard.show === 'chapter-info') {
    if (endCard.chapterInfoFile === '') throw emptyFile('chapterInfoFile', endCard.show);
    const info = await loadChapterInfo(fileUrl(endCard.chapterInfoFile, io.staticFile), {fetch: io.fetch});
    if (info.surah !== recited.surah) {
      throw new MushafStudioError(
        'BAD_STUDIO_PROP',
        `endCard.chapterInfoFile ${describeValue(endCard.chapterInfoFile)} introduces surah ${info.surah}, but surah ${recited.surah} is recited. Fetch surah ${recited.surah}'s introduction.`,
        {prop: 'endCard.chapterInfoFile', surah: info.surah, recited: recited.surah},
      );
    }
    return {tafsir: null, chapterInfo: info};
  }
  return {tafsir: null, chapterInfo: null};
};

// ---------------------------------------------------------------------------------------------
// Background

/**
 * A background video's length for its frame-exact loop, when the props leave it to be found
 * (`videoSeconds` 0): `probeVideoSeconds()` in the browser, `null` for any other background or when
 * the browser cannot read it (the video then loops by itself).
 */
export const backgroundVideoSecondsFor = async (
  background: Pick<Background, 'kind' | 'src' | 'videoSeconds'>,
  staticFile: (path: string) => string,
  probe: (url: string) => Promise<number | null> = probeVideoSeconds,
): Promise<number | null> =>
  background.kind === 'video' && background.src !== '' && background.videoSeconds === 0
    ? probe(fileUrl(background.src, staticFile))
    : null;

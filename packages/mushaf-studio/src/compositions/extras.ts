// What the compositions resolve once per render besides their own content, shared by all of them:
// the stacked translations, the audio's cleanup (its analysis, gain, silence trim and levels), the
// end card's content and a background video's length. Run in `calculateMetadata()` and the
// resolvers, never during a frame; the frames read the plain data these put in `resolved`.
import type {RecitationTimings} from '@tlawat/remotion-mushaf-line';
import {type AudioAnalysis, analyzeAudio} from '../audio/analyze';
import type {AudioSettings} from '../audio/schema';
import {audioSummaryFrom} from '../audio/summary';
import {gainFor, silenceTrimSeconds} from '../audio/volume';
import {probeVideoSeconds} from '../background/MushafBackground';
import type {Background} from '../background/schema';
import {loadChapterInfo} from '../content/chapter-info';
import {loadTafsir, tafsirEntryFor} from '../content/tafsir';
import {describeValue, isMushafStudioError, MushafStudioError} from '../errors';
import type {EndCardSettings, Text} from '../schema';
import {AUTO_FONT} from '../schema';
import type {AlignmentSidecar, AyahTranslation, ResolvedAudio, ResolvedEndCard} from '../types';
import {fileUrl, isHttpUrl, loadTextFile} from './shared';

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

/** The default sample's recording in `public/`: what the compositions' `audioFile` is out of the box. */
export const SAMPLE_AUDIO_FILE = 'mushaf-studio/fatiha/audio.mp3';

/**
 * The repository's command that downloads the sample's recording to `SAMPLE_AUDIO_FILE`. It exists in
 * this repository's app only, so the warning names it for the sample alone.
 */
export const SAMPLE_COMMAND = 'bun run --cwd apps/mushaf-studio sample';

/**
 * Whether the server answers 404 for `url` (a `HEAD`, or a one-byte `GET` where `HEAD` is not
 * allowed). Any other answer, or no answer, counts as there: the file then plays (or fails) as it
 * always did. An abort passes through.
 */
const isMissing = async (url: string, request: typeof fetch, signal: AbortSignal | undefined): Promise<boolean> => {
  const ask = (method: 'HEAD' | 'GET') =>
    request(url, {
      method,
      cache: 'no-store',
      ...(method === 'GET' ? {headers: {Range: 'bytes=0-0'}} : {}),
      ...(signal ? {signal} : {}),
    });
  try {
    let response = await ask('HEAD');
    if (response.status === 405 || response.status === 501) {
      response = await ask('GET');
      await response.body?.cancel().catch(() => undefined);
    }
    return response.status === 404;
  } catch (error) {
    if (signal?.aborted) throw error;
    return false;
  }
};

export type AudioSourceOptions = {
  readonly audioFile: string;
  /** The timings file's sidecar (`timings.alignment`): its catalogue clip is the fallback. */
  readonly sidecar?: Pick<AlignmentSidecar, 'recitation'> | undefined;
  readonly staticFile: (path: string) => string;
  /** For the probe of `audioFile`; `globalThis.fetch` by default. */
  readonly fetch?: typeof fetch | undefined;
  readonly signal?: AbortSignal | undefined;
};

/** Where the recording plays from, and why when it is not `audioFile` (`resolveAudioSource()`). */
export type AudioSource = {
  /** The URL to play instead of `audioFile`, or `null` for `audioFile` itself. */
  readonly src: string | null;
  /** For the Studio: `audioFile` is missing, the clip plays instead, and how to download it. */
  readonly warning: string | null;
};

const AUDIO_FILE_AS_IS: AudioSource = {src: null, warning: null};

/**
 * The recording's source when `audioFile` is a `public/` path that is not there (the server answers
 * 404) and the timings name the catalogue clip they were made of (`alignment.recitation.audioUrl`):
 * that clip, with a warning that says the file is missing and how to get it: `SAMPLE_COMMAND` for the
 * sample's recording, else the clip to save as `public/<audioFile>` (a project made from the npm
 * package has no such command).
 * The default sample's recording is the reciter's and is not committed, so a fresh checkout streams
 * it until `bun run sample` has downloaded it. `audioFile` itself (`src: null`, no request made)
 * for an empty `audioFile`, a URL, or timings without a clip URL; also when the file is there or
 * the server cannot be asked. For `calculateMetadata()`: it makes a request.
 */
export const resolveAudioSource = async (options: AudioSourceOptions): Promise<AudioSource> => {
  const {audioFile} = options;
  const clip = options.sidecar?.recitation?.audioUrl;
  if (audioFile === '' || isHttpUrl(audioFile) || typeof clip !== 'string' || !isHttpUrl(clip)) {
    return AUDIO_FILE_AS_IS;
  }
  const request = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  let url: string;
  try {
    url = options.staticFile(audioFile);
  } catch {
    // A path `staticFile()` refuses (`./a.mp3`): the composition reports it where it plays the file.
    return AUDIO_FILE_AS_IS;
  }
  if (!(await isMissing(url, request, options.signal))) return AUDIO_FILE_AS_IS;
  const fix =
    audioFile === SAMPLE_AUDIO_FILE
      ? `Download it once with \`${SAMPLE_COMMAND}\``
      : `Download that clip once and save it as public/${audioFile}`;
  return {
    src: clip,
    warning: `audioFile ${describeValue(audioFile)} is not in public/ (HTTP 404), so the clip the timings name streams instead (${clip}). ${fix}, or point audioFile at your recording.`,
  };
};

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
  /**
   * The timings file's sidecar (`timings.alignment`): its `audio` summary stands in for the analysis
   * when the glow is off, and its catalogue clip plays when `audioFile` is missing (`resolveAudioSource()`).
   */
  readonly sidecar?: Pick<AlignmentSidecar, 'recitation' | 'audio'> | undefined;
  /** For the probe of `audioFile`; `globalThis.fetch` by default. */
  readonly fetch?: typeof fetch | undefined;
};

/** What `resolveAudioCleanup()` resolves: the cleanup, the Studio's warning, and the URL to play instead of `audioFile`. */
export type AudioCleanup = {
  readonly audio: ResolvedAudio;
  /** Why the audio plays from `src`, why it could not be analysed, or both; `null` for neither. Studio only. */
  readonly warning: string | null;
  /** `resolveAudioSource()`'s: the clip the timings name when `audioFile` is missing, else `null`. Becomes `resolved.audioSrc`. */
  readonly src: string | null;
};

const joinWarnings = (...warnings: readonly (string | null)[]): string | null => {
  const present = warnings.filter((warning): warning is string => warning !== null && warning !== '');
  return present.length === 0 ? null : present.join(' ');
};

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Finds where the recording plays from (`resolveAudioSource()`: the timings' catalogue clip when
 * `audioFile` is missing from `public/`), analyses it when something needs it
 * (`needsAudioAnalysis()`) and says what to do with it: the gain that brings it to
 * `audio.targetLufs` (`gainFor()`, under `normalize`), the seconds of leading silence to skip
 * (`silenceTrimSeconds()`, under `trimSilence`, never past `latestSeconds`) and, for the glow, one
 * level per frame from the composition's new start (three decimals). With the glow off, the
 * sidecar's `audio` summary (written when the panel saved the timings) stands in for the analysis,
 * so nothing is downloaded. An analysis that fails with `AUDIO_ANALYSIS_FAILED` (no Web Audio, a
 * file the browser cannot fetch or decode) is not an error: the audio plays as it is, and `warning`
 * says why. Any other failure (an abort) passes through.
 */
export const resolveAudioCleanup = async (options: AudioCleanupOptions): Promise<AudioCleanup> => {
  const {audio, background, fps} = options;
  const source = await resolveAudioSource(options);
  const cleanup = (resolved: ResolvedAudio, warning: string | null): AudioCleanup => ({
    audio: resolved,
    warning: joinWarnings(source.warning, warning),
    src: source.src,
  });
  if (!needsAudioAnalysis(options.audioFile, audio, background)) return cleanup(NO_AUDIO_ANALYSIS, null);
  const summary = glowIsOn(background) ? null : audioSummaryFrom(options.sidecar?.audio);
  let analysis: Pick<AudioAnalysis, 'lufs' | 'peak' | 'firstSoundSeconds' | 'levels'>;
  if (summary !== null) {
    analysis = {...summary, levels: []};
  } else {
    try {
      analysis = await analyzeAudio(source.src ?? fileUrl(options.audioFile, options.staticFile), {
        fps,
        ...(options.signal ? {signal: options.signal} : {}),
      });
    } catch (error) {
      if (isMushafStudioError(error) && error.code === 'AUDIO_ANALYSIS_FAILED') {
        return cleanup(NO_AUDIO_ANALYSIS, error.message);
      }
      throw error;
    }
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
  return cleanup({gain, trimSeconds, levels}, null);
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
 * What the end card's content is chosen by: the surah and number of the last ayah recited, and,
 * for a recitation that crosses surahs, every surah recited (`surah` alone otherwise).
 */
export type RecitedPassage = {
  readonly surah: number;
  readonly lastAyah: number;
  readonly surahs?: readonly number[] | undefined;
};

/** The `RecitedPassage` of timings of either version: `surahs` only when they cross surahs. */
export const recitedPassageOf = (timings: RecitationTimings): RecitedPassage => {
  const last = timings.ayat[timings.ayat.length - 1]!.ayah;
  if (timings.version === 1) return {surah: timings.surah, lastAyah: last};
  const surahs = [...new Set(timings.ayat.map((ayah) => ayah.surah))];
  return {surah: surahs[surahs.length - 1]!, lastAyah: last, ...(surahs.length > 1 ? {surahs} : {})};
};

/**
 * The end card's content: for `'tafsir'`, the tafsir file cut to the entry that covers the last ayah
 * recited (`tafsirEntryFor()`); for `'chapter-info'`, the surah's introduction, which must be the
 * surah recited (one of them, for a recitation across surahs). `BAD_STUDIO_PROP` for a missing file
 * or another surah's introduction; the loaders' own errors (`CONTENT_FETCH_FAILED` for a request
 * that fails, `BAD_CONTENT_FILE` for a file that is not the envelope) pass through.
 */
export const resolveEndCardContent = async (
  endCard: EndCardSettings,
  recited: RecitedPassage,
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
    const surahs = recited.surahs ?? [recited.surah];
    if (!surahs.includes(info.surah)) {
      const one = surahs.length === 1;
      throw new MushafStudioError(
        'BAD_STUDIO_PROP',
        `endCard.chapterInfoFile ${describeValue(endCard.chapterInfoFile)} introduces surah ${info.surah}, but ${one ? `surah ${recited.surah} is recited. Fetch surah ${recited.surah}'s introduction.` : `surahs ${surahs.join(', ')} are recited. Fetch the introduction of one of them.`}`,
        {prop: 'endCard.chapterInfoFile', surah: info.surah, recited: one ? recited.surah : surahs},
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

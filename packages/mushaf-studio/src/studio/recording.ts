// What Source and Align do once a new recording has its timings: measure the recording into them,
// write them without replacing reviewed ones, and point the composition at them in one patch,
// which resets the range and the splits only when the recording really changed and clears the
// passage's files that no longer fit. An ayah text also needs the Quran text of the new passage, or
// `calculateMetadata()` would look for its ayahs in the old passage's text and the composition (and
// the panel with it) would not mount.
import {recitedRange} from '@tlawat/remotion-mushaf-line';
import {staticFile as remotionStaticFile} from 'remotion';
import {analyzeAudio, forgetAudioAnalysis} from '../audio/analyze';
import {followsHostAudio, hostAudioOf} from '../audio/host';
import {audioSummaryFrom, audioSummaryOf, withAudioSummary} from '../audio/summary';
import {recitedPassageOf} from '../compositions/extras';
import {fileUrl, loadTextFile, STUDIO_FPS} from '../compositions/shared';
import {ayahKeysOf, passageSpan} from '../compositions/timings';
import {loadChapterInfo} from '../content/chapter-info';
import {loadTafsir, tafsirEntryFor} from '../content/tafsir';
import {isMushafStudioError, MushafStudioError} from '../errors';
import type {StudioTimings} from '../types';
import {unicodeFontOf} from '../unicode/font';
import {fetchQuranComText, type QuranTextScript, serialiseAyahWords} from '../unicode/text';
import {describeError, type StudioTarget, setStudioState, t} from './store';
import {
  baseName,
  deepMerge,
  isUrl,
  numberedName,
  type PropsPatch,
  patchProps,
  projectPath,
  readTimingsFile,
  takenPublicPaths,
  writeFile,
  writeJsonFile,
} from './studio-api';
import {
  endCardOf,
  freshRecording,
  hasTranslationLayers,
  isAyahTextProps,
  type StudioCompositionProps,
  textFileOf,
  textGroupOf,
  translationLayersOf,
  translationLayersPatch,
} from './tab-props';

/** A passage of one surah: what the Text tab fetches and names its files after. */
export type Passage = {readonly chapter: number; readonly fromAyah: number; readonly toAyah: number};

/** The Text tab's name for the Quran text of a passage: `text-uthmani-1-2-7.json`. */
export const quranTextName = (script: QuranTextScript, passage: Passage): string =>
  `text-${script}-${passage.chapter}-${passage.fromAyah}-${passage.toAyah}.json`;

/** How long saving waits for the recording's measurement before it writes the timings without it. */
export const SUMMARY_TIMEOUT_MS = 60_000;

/**
 * The timings with the summary of `analyzeAudio()` on `audioFile` as `alignment.audio`
 * (`audioSummaryOf()`), so `calculateMetadata()` can normalise and trim the silence without
 * downloading the recording again. Best effort: the timings as they are when they have no sidecar,
 * or when the recording cannot be measured within `timeoutMs` (no Web Audio, a file the browser
 * cannot fetch or decode). The file may have just been rewritten under the same name, so an earlier
 * analysis of its URL is forgotten first.
 */
export const withRecordingSummary = async (
  timings: StudioTimings,
  audioFile: string,
  options: {
    readonly analyze?: typeof analyzeAudio | undefined;
    readonly staticFile?: ((path: string) => string) | undefined;
    readonly timeoutMs?: number | undefined;
  } = {},
): Promise<StudioTimings> => {
  if (timings.alignment === undefined || audioFile === '') return timings;
  const url = fileUrl(audioFile, options.staticFile ?? remotionStaticFile);
  const analyze = options.analyze ?? analyzeAudio;
  forgetAudioAnalysis(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? SUMMARY_TIMEOUT_MS);
  try {
    return withAudioSummary(timings, audioSummaryOf(await analyze(url, {fps: STUDIO_FPS, signal: controller.signal})));
  } catch {
    return timings;
  } finally {
    clearTimeout(timer);
  }
};

/** `value` with every object's keys in order: two JSON values compare equal whatever order their keys came in. */
const sortedKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedKeys((value as Record<string, unknown>)[key])]),
  );
};

/** Whether two timings files hold the same thing (keys in any order). */
export const sameTimings = (a: StudioTimings, b: StudioTimings): boolean =>
  JSON.stringify(sortedKeys(a)) === JSON.stringify(sortedKeys(b));

/** Where `timingsPathFor()` puts new timings. */
export type TimingsPath = {
  readonly path: string;
  /** The file at the first name, left alone because it has edits or other timings; `null` when the first name is used. */
  readonly kept: string | null;
  /** Whether `path` already holds exactly these timings, so nothing needs writing. */
  readonly same: boolean;
};

/**
 * Where new timings go in the project without replacing reviewed ones: `name`, or, while a file of
 * `public/` (`taken`; by default `takenPublicPaths()`, so a file this session wrote counts before
 * the Studio lists it) is there with manual edits (`alignment.edits`) or other timings, the next of
 * `name-2.timings.json`, `-3`, ... (`numberedName()`) that is free or holds exactly these timings.
 * A file that cannot be read is not replaced either.
 */
export const timingsPathFor = async (
  project: string | undefined,
  name: string,
  timings: StudioTimings,
  options: {
    readonly taken?: ReadonlySet<string> | undefined;
    readonly read?: ((path: string) => Promise<StudioTimings>) | undefined;
  } = {},
): Promise<TimingsPath> => {
  const taken = options.taken ?? takenPublicPaths();
  const read = options.read ?? readTimingsFile;
  const first = projectPath(project, name);
  for (let n = 1; ; n += 1) {
    const path = projectPath(project, numberedName(name, n));
    if (!taken.has(path)) return {path, kept: n === 1 ? null : first, same: false};
    const existing = await read(path).catch(() => null);
    if (existing !== null && sameTimings(existing, timings)) return {path, kept: n === 1 ? null : first, same: true};
  }
};

/** `"1:2-7"`, or `"2:280-3:5"` across surahs: a passage as the notices name it. */
const passageLabel = (timings: StudioTimings): string => {
  const {from, to} = passageSpan(timings);
  return from.surah === to.surah
    ? `${from.surah}:${from.ayah}-${to.ayah}`
    : `${from.surah}:${from.ayah}-${to.surah}:${to.ayah}`;
};

/**
 * Whether new timings are another recording than the composition's (`before`, its timings file as
 * read; `null` when it has none or it cannot be read): another audio file, the same file with other
 * bytes (the recordings' measured summaries differ), or another recited passage. Only then does a
 * save reset the ayah range and the splits.
 */
export const isOtherRecording = (
  props: Pick<StudioCompositionProps, 'audioFile'>,
  audioFile: string,
  before: StudioTimings | null,
  after: StudioTimings,
): boolean => {
  if (before === null || props.audioFile !== audioFile) return true;
  if (passageLabel(before) !== passageLabel(after)) return true;
  const was = audioSummaryFrom(before.alignment?.audio);
  const is = audioSummaryFrom(after.alignment?.audio);
  return was !== null && is !== null && JSON.stringify(was) !== JSON.stringify(is);
};

type Io = {
  readonly fetch: typeof fetch;
  readonly staticFile: (path: string) => string;
};

const defaultIo = (): Io => ({
  // Wrapped, not referenced: the native fetch throws "Illegal invocation" as another object's method.
  fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
  staticFile: remotionStaticFile,
});

/** What `stalePassageFiles()` found: the patch that clears them, and their paths. */
export type StalePassageFiles = {readonly patch: PropsPatch; readonly cleared: readonly string[]};

/**
 * The text and end-card files of `props` that do not fit the passage of `timings`, and the patch
 * that clears them: an ayah translation (`text.translationFile`, a layer of `text.translations`)
 * without every ayah recited, a gloss or transliteration without a word of each, a tafsir with no
 * commentary for the last ayah, another surah's introduction. The end card shows nothing
 * (`endCard.show` `'none'`) when the file it shows goes. A file that cannot be read is left as it is:
 * that is not a sign it is another passage's.
 */
export const stalePassageFiles = async (
  props: StudioCompositionProps,
  timings: StudioTimings,
  io: Io = defaultIo(),
): Promise<StalePassageFiles> => {
  const keys = ayahKeysOf(timings);
  const recited = recitedPassageOf(timings);
  const fitsOrUnreadable = async (check: () => Promise<boolean>): Promise<boolean> => check().catch(() => true);
  const ayahFileFits = (file: string) =>
    fitsOrUnreadable(async () => {
      const translation = await loadTextFile('ayah', 'translationFile', file, io);
      return translation === null || keys.every((key) => translation.text[key] !== undefined);
    });
  const wordFileFits = (field: 'glossFile' | 'transliterationFile', file: string) =>
    fitsOrUnreadable(async () => {
      const gloss = await loadTextFile('word', field, file, io);
      if (gloss === null) return true;
      const words = Object.keys(gloss.words);
      return keys.every((key) => words.some((word) => word.startsWith(`${key}:`)));
    });
  let patch: Record<string, unknown> = {};
  const cleared: string[] = [];
  const clear = (file: string, part: Readonly<Record<string, unknown>>) => {
    cleared.push(file);
    patch = deepMerge(patch, part);
  };

  if (textGroupOf(props) !== null) {
    const layers = translationLayersOf(props);
    const fits = await Promise.all(layers.map((layer) => ayahFileFits(layer.file)));
    if (fits.some((fit) => !fit)) {
      for (const [i, layer] of layers.entries()) if (!fits[i]) cleared.push(layer.file);
      patch = deepMerge(
        patch,
        (hasTranslationLayers(props)
          ? translationLayersPatch(layers.filter((_, i) => fits[i]))
          : {text: {translationFile: ''}}) as Readonly<Record<string, unknown>>,
      );
    }
    for (const field of ['glossFile', 'transliterationFile'] as const) {
      const file = textFileOf(props, field);
      if (file !== '' && !(await wordFileFits(field, file))) clear(file, {text: {[field]: ''}});
    }
  }

  const card = endCardOf(props);
  const tafsirFile = card.tafsirFile ?? '';
  if (tafsirFile !== '') {
    const fits = await fitsOrUnreadable(async () => {
      const tafsir = await loadTafsir(fileUrl(tafsirFile, io.staticFile), {fetch: io.fetch});
      return tafsirEntryFor(tafsir, `${recited.surah}:${recited.lastAyah}`) !== null;
    });
    if (!fits) clear(tafsirFile, {endCard: {tafsirFile: '', ...(card.show === 'tafsir' ? {show: 'none'} : {})}});
  }
  const chapterInfoFile = card.chapterInfoFile ?? '';
  if (chapterInfoFile !== '') {
    const fits = await fitsOrUnreadable(async () => {
      const info = await loadChapterInfo(fileUrl(chapterInfoFile, io.staticFile), {fetch: io.fetch});
      return (recited.surahs ?? [recited.surah]).includes(info.surah);
    });
    if (!fits)
      clear(chapterInfoFile, {
        endCard: {chapterInfoFile: '', ...(card.show === 'chapter-info' ? {show: 'none'} : {})},
      });
  }
  return {patch: patch as PropsPatch, cleared};
};

/** What `saveRecording()` did. */
export type SavedRecording = {
  /** The timings' path, as `timingsFile` now names it. */
  readonly timingsFile: string;
  /** What the status line says of it: the timings put under a new name, the old passage's files cleared, the range kept. */
  readonly notices: readonly string[];
};

/**
 * Saves a new recording: its timings measured (`withRecordingSummary()`) and written into the
 * project as `timingsName`, or under the next free numbered name when a file there has manual edits
 * or other timings (`timingsPathFor()`: a reviewed file is never replaced), then `audioFile` and
 * `timingsFile` in one patch (with `hostAudio` turned off, unless `keepHostAudio`: the new
 * recording is the composition's own to play). Only when it is another recording (`isOtherRecording()`) does the
 * patch also reset the range and the splits (`freshRecording()`) and clear the text and end-card
 * files that do not fit the new passage (`stalePassageFiles()`). On `<MushafAyahText>` it first
 * fetches the text of the recited ayahs in its font's script and writes it beside them, under the
 * Text tab's name, and the same patch sets `textFile`. A text that cannot be fetched patches
 * nothing: the files stay written and the error names them. Resolves with the timings' path and
 * what to tell the user.
 */
export const saveRecording = async (options: {
  /** Where the patch goes (`patchProps()`'s target). */
  readonly target: StudioTarget;
  readonly props: StudioCompositionProps;
  readonly project: string | undefined;
  readonly audioFile: string;
  readonly timings: StudioTimings;
  readonly timingsName: string;
  /**
   * Whether `audioFile` is the template's track the composition follows (`hostAudio`), which stays
   * on; otherwise a composition that followed one plays `audioFile` itself again.
   */
  readonly keepHostAudio?: boolean | undefined;
}): Promise<SavedRecording> => {
  const {target, props, project, audioFile, timingsName} = options;
  const measured = await withRecordingSummary(options.timings, audioFile);
  const where = await timingsPathFor(project, timingsName, measured);
  const timingsFile = where.same ? where.path : await writeJsonFile(where.path, measured);
  const notices: string[] = [];
  if (where.kept !== null) notices.push(t('recording.notice.versioned', {kept: where.kept, path: timingsFile}));
  const before = props.timingsFile === '' ? null : await readTimingsFile(props.timingsFile).catch(() => null);
  const untracks = followsHostAudio(props) && options.keepHostAudio !== true;
  let patch: PropsPatch = {
    audioFile,
    timingsFile,
    ...(untracks ? {hostAudio: {...hostAudioOf(props), enabled: false}} : {}),
  };
  if (untracks)
    notices.push(
      t('recording.notice.untracked', {
        track: hostAudioOf(props).track || baseName(props.audioFile),
        file: isUrl(audioFile) ? audioFile : `public/${audioFile}`,
      }),
    );
  if (isOtherRecording(props, audioFile, before, measured)) {
    const stale = await stalePassageFiles(props, measured);
    patch = deepMerge(deepMerge(stale.patch, patch), freshRecording(props)) as PropsPatch;
    if (stale.cleared.length > 0)
      notices.push(
        t('recording.notice.cleared', {
          count: stale.cleared.length,
          files: stale.cleared.map((file) => `public/${file}`).join(', '),
          passage: passageLabel(measured),
        }),
      );
  } else {
    notices.push(t('recording.notice.sameRecording'));
  }
  if (!isAyahTextProps(props)) {
    setStudioState({busy: t('busy.updating')});
    await patchProps(target, patch);
    return {timingsFile, notices};
  }
  const {surah, fromAyah, toAyah} = recitedRange(measured);
  const passage: Passage = {chapter: surah, fromAyah, toAyah};
  const {script} = unicodeFontOf(props.font);
  setStudioState({busy: t('text.busy.text', {script})});
  let textFile: string;
  try {
    const text = await fetchQuranComText({...passage, script});
    textFile = await writeFile(projectPath(project, quranTextName(script, passage)), serialiseAyahWords(text));
  } catch (error) {
    throw new MushafStudioError(
      isMushafStudioError(error) ? error.code : 'TRANSLATION_FETCH_FAILED',
      t('error.textAfterTimings', {
        timingsFile,
        surah,
        fromAyah,
        toAyah,
        error: describeError(error).replace(/\.$/, ''),
      }),
      {timingsFile, ...passage, script},
    );
  }
  setStudioState({busy: t('busy.updating')});
  await patchProps(target, {...patch, textFile});
  return {timingsFile, notices};
};

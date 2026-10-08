// What Source and Align do once a new recording has its timings: measure the recording into them,
// write them, and point the composition at them in one patch. An ayah text also needs the Quran text
// of the new passage, or `calculateMetadata()` would look for its ayahs in the old passage's text
// and the composition (and the panel with it) would not mount.
import {recitedRange} from '@tlawat/remotion-mushaf-line';
import {staticFile as remotionStaticFile} from 'remotion';
import {analyzeAudio, forgetAudioAnalysis} from '../audio/analyze';
import {audioSummaryOf, withAudioSummary} from '../audio/summary';
import {fileUrl, STUDIO_FPS} from '../compositions/shared';
import {isMushafStudioError, MushafStudioError} from '../errors';
import type {StudioTimings} from '../types';
import {unicodeFontOf} from '../unicode/font';
import {fetchQuranComText, type QuranTextScript, serialiseAyahWords} from '../unicode/text';
import {describeError, setStudioState, t} from './store';
import {type PropsPatch, patchProps, projectPath, writeFile, writeJsonFile} from './studio-api';
import {freshRecording, isAyahTextProps, type StudioCompositionProps} from './tab-props';

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

/**
 * Writes the timings of a new recording into the project as `timingsName`, measured first
 * (`withRecordingSummary()`), and saves `audioFile`,
 * `timingsFile` and the reset range (`freshRecording()`) in one patch. On `<MushafAyahText>` it
 * first fetches the text of the recited ayahs in its font's script and writes it beside them, under
 * the Text tab's name, and the same patch sets `textFile`. A text that cannot be fetched patches
 * nothing: the files stay written and the error names them. Resolves with the timings' path.
 */
export const saveRecording = async (options: {
  readonly compositionId: string;
  readonly props: StudioCompositionProps;
  readonly project: string | undefined;
  readonly audioFile: string;
  readonly timings: StudioTimings;
  readonly timingsName: string;
}): Promise<string> => {
  const {compositionId, props, project, audioFile, timingsName} = options;
  const measured = await withRecordingSummary(options.timings, audioFile);
  const timingsFile = await writeJsonFile(projectPath(project, timingsName), measured);
  const patch: PropsPatch = {audioFile, timingsFile, ...freshRecording(props)};
  if (!isAyahTextProps(props)) {
    setStudioState({busy: t('busy.updating')});
    await patchProps(compositionId, patch);
    return timingsFile;
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
  await patchProps(compositionId, {...patch, textFile});
  return timingsFile;
};

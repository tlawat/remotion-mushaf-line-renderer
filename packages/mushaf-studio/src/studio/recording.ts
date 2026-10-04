// What Source and Align do once a new recording has its timings: write them, and point the
// composition at them in one patch. An ayah text also needs the Quran text of the new passage, or
// `calculateMetadata()` would look for its ayahs in the old passage's text and the composition (and
// the panel with it) would not mount.
import {recitedRange} from '@tlawat/remotion-mushaf-line';
import {isMushafStudioError, MushafStudioError} from '../errors';
import type {StudioTimings} from '../types';
import {unicodeFontOf} from '../unicode/font';
import {fetchQuranComText, type QuranTextScript, serialiseAyahWords} from '../unicode/text';
import {describeError, setStudioState} from './store';
import {type PropsPatch, patchProps, projectPath, writeFile, writeJsonFile} from './studio-api';
import {freshRecording, isAyahTextProps, type StudioCompositionProps} from './tab-props';

/** A passage of one surah: what the Text tab fetches and names its files after. */
export type Passage = {readonly chapter: number; readonly fromAyah: number; readonly toAyah: number};

/** The Text tab's name for the Quran text of a passage: `text-uthmani-1-2-7.json`. */
export const quranTextName = (script: QuranTextScript, passage: Passage): string =>
  `text-${script}-${passage.chapter}-${passage.fromAyah}-${passage.toAyah}.json`;

/**
 * Writes the timings of a new recording into the project as `timingsName` and saves `audioFile`,
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
  const {compositionId, props, project, audioFile, timings, timingsName} = options;
  const timingsFile = await writeJsonFile(projectPath(project, timingsName), timings);
  const patch: PropsPatch = {audioFile, timingsFile, ...freshRecording(props)};
  if (!isAyahTextProps(props)) {
    setStudioState({busy: 'Updating the composition...'});
    await patchProps(compositionId, patch);
    return timingsFile;
  }
  const {surah, fromAyah, toAyah} = recitedRange(timings);
  const passage: Passage = {chapter: surah, fromAyah, toAyah};
  const {script} = unicodeFontOf(props.font);
  setStudioState({busy: `Fetching the ${script} text...`});
  let textFile: string;
  try {
    const text = await fetchQuranComText({...passage, script});
    textFile = await writeFile(projectPath(project, quranTextName(script, passage)), serialiseAyahWords(text));
  } catch (error) {
    throw new MushafStudioError(
      isMushafStudioError(error) ? error.code : 'TRANSLATION_FETCH_FAILED',
      `The timings are in public/${timingsFile}, but the Quran text for ${surah}:${fromAyah}-${toAyah} could not be fetched: ${describeError(error).replace(/\.$/, '')}; fetch it in the Text tab, then pick the timings again.`,
      {timingsFile, ...passage, script},
    );
  }
  setStudioState({busy: 'Updating the composition...'});
  await patchProps(compositionId, {...patch, textFile});
  return timingsFile;
};

import {exitTiming, getMushafLines, type MushafLineData} from '@tlawat/remotion-mushaf-line';
import type {CalculateMetadataFunction} from 'remotion';
import {staticFile as remotionStaticFile} from 'remotion';
import {MushafStudioError} from '../../errors';
import {dataSourceFrom, sizeForAspect, themeSelectionFrom} from '../../schema';
import type {AyahTranslation} from '../../types';
import {loadTextFile, STUDIO_FPS} from '../shared';
import type {MushafPassageProps} from './schema';

/** What `calculateMetadata()` of `<MushafPassage>` resolves once per render from the content props. */
export type ResolvedPassage = {
  /** The passage's lines, in reading order. */
  readonly lines: readonly MushafLineData[];
  readonly translation: AyahTranslation | null;
};

export type ResolvePassageOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly staticFile?: ((path: string) => string) | undefined;
  /** `calculateMetadata()`'s `abortSignal`: the Studio aborts a resolution it no longer needs. */
  readonly signal?: AbortSignal | undefined;
};

/** Frames for a passage: every line holds `holdSeconds`, and the last one leaves after its hold. */
export const passageDuration = (lineCount: number, holdSeconds: number, fps: number): number =>
  Math.max(1, Math.round(lineCount * holdSeconds * fps) + exitTiming().getDurationInFrames({fps}));

/** Resolves the content props once: the lines of the ayah range and the translation file. Pure given `fetch`. */
export const resolvePassage = async (
  props: MushafPassageProps,
  options: ResolvePassageOptions = {},
): Promise<ResolvedPassage> => {
  // `globalThis.fetch` is wrapped, not referenced: calling the native fetch as a method of another
  // object ("io.fetch(url)") throws "Illegal invocation" in browsers.
  const io = {
    fetch: options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)),
    staticFile: options.staticFile ?? remotionStaticFile,
    ...(options.signal ? {signal: options.signal} : {}),
  };
  if (props.toAyah !== 0 && props.toAyah < props.fromAyah) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `toAyah (${props.toAyah}) is before fromAyah (${props.fromAyah}). Set toAyah to ${props.fromAyah} or later, or to 0 for the end of the surah.`,
      {prop: 'toAyah', fromAyah: props.fromAyah, toAyah: props.toAyah},
    );
  }
  // `toAyah` is optional without `undefined` in the package's options: spread it in or leave it out.
  const lines = await getMushafLines({
    surah: props.surah,
    fromAyah: props.fromAyah,
    ...(props.toAyah === 0 ? {} : {toAyah: props.toAyah}),
    slice: props.slice,
    theme: themeSelectionFrom(props.theme, props.customTheme),
    data: dataSourceFrom(props.data, io.staticFile),
  });
  const translation = await loadTextFile('ayah', 'translationFile', props.text.translationFile, io);
  return {lines, translation};
};

/** `calculateMetadata` for `<Composition id="MushafPassage">`: `resolved`, width and height from the aspect, duration from the line count. `abortSignal` reaches the fetches. */
export const calculateMushafPassageMetadata: CalculateMetadataFunction<MushafPassageProps> = async ({
  props,
  abortSignal,
}) => {
  const resolved = await resolvePassage(props, {signal: abortSignal});
  return {
    props: {...props, resolved},
    ...sizeForAspect(props.layout.aspect),
    fps: STUDIO_FPS,
    durationInFrames: passageDuration(resolved.lines.length, props.holdSeconds, STUDIO_FPS),
  };
};

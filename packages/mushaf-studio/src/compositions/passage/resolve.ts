import {exitTiming, getMushafLines, type MushafLineData} from '@tlawat/remotion-mushaf-line';
import type {CalculateMetadataFunction} from 'remotion';
import {staticFile as remotionStaticFile} from 'remotion';
import {MushafStudioError} from '../../errors';
import {showsIntro} from '../../overlay';
import {dataSourceFrom, sizeForAspect, themeSelectionFrom} from '../../schema';
import type {AyahTranslation} from '../../types';
import {headerCount, headerSeconds, loadTextFile, STUDIO_FPS, surahHeaderLines} from '../shared';
import type {MushafPassageProps} from './schema';

/** What `calculateMetadata()` of `<MushafPassage>` resolves once per render from the content props. */
export type ResolvedPassage = {
  /** The passage's lines, in reading order; the surah's header lines first when `header` put them there. */
  readonly lines: readonly MushafLineData[];
  readonly translation: AyahTranslation | null;
};

export type ResolvePassageOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly staticFile?: ((path: string) => string) | undefined;
  /** `calculateMetadata()`'s `abortSignal`: the Studio aborts a resolution it no longer needs. */
  readonly signal?: AbortSignal | undefined;
};

/** Frames for a passage of ayah lines alone: every line holds `holdSeconds`, and the last one leaves after its hold. With header lines or an intro card, `passageTimeline()`'s `end` plus the exit. */
export const passageDuration = (lineCount: number, holdSeconds: number, fps: number): number =>
  Math.max(1, Math.round(lineCount * holdSeconds * fps) + exitTiming().getDurationInFrames({fps}));

/** Where each line of a passage is on screen, in frames: `from` and `durationInFrames` per line, and the frame the last line's hold ends. */
export type PassageTimeline = {
  readonly starts: readonly number[];
  readonly holds: readonly number[];
  readonly end: number;
};

/**
 * The passage's timeline: after the intro card when it is on (`overlay.introSeconds`, nothing is
 * heard to wait for), each header line for `headerSeconds()`, then each ayah line for
 * `holdSeconds`. Pure; the component and `calculateMetadata()` both read it.
 */
export const passageTimeline = (
  lines: readonly MushafLineData[],
  props: Pick<MushafPassageProps, 'holdSeconds' | 'overlay'>,
  fps: number,
): PassageTimeline => {
  const holdFrames = Math.max(1, Math.round(props.holdSeconds * fps));
  const headerFrames = Math.max(1, Math.round(headerSeconds(props.overlay) * fps));
  const headers = headerCount(lines);
  let at = showsIntro(props.overlay.title) ? Math.round(props.overlay.introSeconds * fps) : 0;
  const starts: number[] = [];
  const holds: number[] = [];
  lines.forEach((_, i) => {
    const hold = i < headers ? headerFrames : holdFrames;
    starts.push(at);
    holds.push(hold);
    at += hold;
  });
  return {starts, holds, end: at};
};

/**
 * Resolves the content props once: the lines of the ayah range, after the surah's header lines when
 * `header` asks for them and the passage starts at ayah 1 (`surahHeaderLines()`), and the
 * translation file. Pure given `fetch`.
 */
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
  const theme = themeSelectionFrom(props.theme, props.customTheme);
  const data = dataSourceFrom(props.data, io.staticFile);
  const lines = await getMushafLines({
    surah: props.surah,
    fromAyah: props.fromAyah,
    ...(props.toAyah === 0 ? {} : {toAyah: props.toAyah}),
    slice: props.slice,
    theme,
    data,
  });
  const headers =
    props.fromAyah === 1 && lines[0] ? await surahHeaderLines(props.surah, lines[0], props.header, {theme, data}) : [];
  const translation = await loadTextFile('ayah', 'translationFile', props.text.translationFile, io);
  return {lines: headers.length === 0 ? lines : [...headers, ...lines], translation};
};

/** `calculateMetadata` for `<Composition id="MushafPassage">`: `resolved`, width and height from the aspect, duration from the timeline (`passageTimeline()`). `abortSignal` reaches the fetches. */
export const calculateMushafPassageMetadata: CalculateMetadataFunction<MushafPassageProps> = async ({
  props,
  abortSignal,
}) => {
  const resolved = await resolvePassage(props, {signal: abortSignal});
  return {
    props: {...props, resolved},
    ...sizeForAspect(props.layout.aspect),
    fps: STUDIO_FPS,
    durationInFrames: Math.max(
      1,
      passageTimeline(resolved.lines, props, STUDIO_FPS).end + exitTiming().getDurationInFrames({fps: STUDIO_FPS}),
    ),
  };
};

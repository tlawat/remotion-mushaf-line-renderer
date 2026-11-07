import {getMushafLines, type MushafLineData} from '@tlawat/remotion-mushaf-line';
import type {CalculateMetadataFunction} from 'remotion';
import {staticFile as remotionStaticFile} from 'remotion';
import {MushafStudioError} from '../../errors';
import {showsIntro} from '../../overlay';
import {type Animation, dataSourceFrom, migrateMushafProps, sizeForAspect, themeSelectionFrom} from '../../schema';
import {tempoFrames} from '../../schema/tokens';
import type {AyahTranslation} from '../../types';
import {backgroundVideoSecondsFor, loadTranslationLayers, translationLayerSpecs} from '../extras';
import type {AyahChange} from '../recitation/transitions';
import {firstAyahKey, headerCount, headerSeconds, STUDIO_FPS, surahHeaderLines} from '../shared';
import {defaultMushafPassageProps, type MushafPassageProps} from './schema';

/** What `calculateMetadata()` of `<MushafPassage>` resolves once per render from the content props. */
export type ResolvedPassage = {
  /** The passage's lines, in reading order; the surah's header lines first when `header` put them there. */
  readonly lines: readonly MushafLineData[];
  /** The first translation shown (`translations[0]`), or `null`. */
  readonly translation: AyahTranslation | null;
  /** One per layer of `text.translations` with a file (or `text.translationFile` alone), cut to the passage's ayahs. */
  readonly translations?: readonly AyahTranslation[] | undefined;
  /** `probeVideoSeconds()` of a background video whose `videoSeconds` is 0, when the browser could read it. */
  readonly backgroundVideoSeconds?: number | null | undefined;
};

export type ResolvePassageOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly staticFile?: ((path: string) => string) | undefined;
  /** `calculateMetadata()`'s `abortSignal`: the Studio aborts a resolution it no longer needs. */
  readonly signal?: AbortSignal | undefined;
};

/**
 * Frames the lines take to leave after the last hold: `endFade` (1 s, 1.4 s slow) on `SINE`, none
 * under `cut`.
 */
export const passageEndFade = (animation: Pick<Animation, 'lines' | 'tempo'>, fps: number): number =>
  animation.lines === 'cut' ? 0 : tempoFrames('endFade', animation.tempo, fps);

/**
 * Frames for a passage of ayah lines alone: every line holds `holdSeconds`, and the last one fades
 * out after its hold (`passageEndFade()`, calm by default). With header lines or an intro card,
 * `passageTimeline()`'s `end` plus the fade.
 */
export const passageDuration = (
  lineCount: number,
  holdSeconds: number,
  fps: number,
  animation: Pick<Animation, 'lines' | 'tempo'> = {lines: 'fade', tempo: 'calm'},
): number => Math.max(1, Math.round(lineCount * holdSeconds * fps) + passageEndFade(animation, fps));

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
 * When the ayah of a passage's translation and corner label changes (render-design.md 5.2, 5.5):
 * at the hold start of each line that starts with another ayah than the line before it (nothing
 * is heard to wait for: the outgoing line gives way there too), by a `translationDissolve`
 * staggered dissolve, never before the change before it is over. The first entry is the first
 * line's ayah, from the start; a header line has no ayah (`null`), and the first ayah after it
 * dissolves in from nothing. For `shownAyahAt()`; pure.
 */
export const passageAyahChanges = (
  lines: readonly MushafLineData[],
  timeline: Pick<PassageTimeline, 'starts'>,
  animation: Pick<Animation, 'lines' | 'tempo'>,
  fps: number,
): readonly AyahChange[] => {
  const duration = animation.lines === 'cut' ? 0 : tempoFrames('translationDissolve', animation.tempo, fps);
  const changes: AyahChange[] = [];
  lines.forEach((line, i) => {
    const key = firstAyahKey(line);
    const last = changes[changes.length - 1];
    if (last === undefined) changes.push({key, start: Number.NEGATIVE_INFINITY, duration: 0});
    else if (key !== last.key) {
      const start = Math.max(timeline.starts[i] ?? 0, last.start + last.duration);
      changes.push({key, start, duration});
    }
  });
  return changes;
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
  const keys = new Set(lines.flatMap((line) => line.words.map((word) => `${word.surah}:${word.ayah}`)));
  const translations = await loadTranslationLayers(translationLayerSpecs(props.text), keys, io);
  return {
    lines: headers.length === 0 ? lines : [...headers, ...lines],
    translation: translations[0] ?? null,
    translations,
  };
};

/** `calculateMetadata` for `<Composition id="MushafPassage">`: the props migrated (`migrateMushafProps()`), `resolved` (and a background video's length), width and height from the aspect, duration from the timeline (`passageTimeline()`) and the lines' fade (`passageEndFade()`). `abortSignal` reaches the fetches. */
export const calculateMushafPassageMetadata: CalculateMetadataFunction<MushafPassageProps> = async ({
  props: saved,
  abortSignal,
}) => {
  // First: props saved by an earlier Mushaf Studio (or sent by a host) render the current design.
  const props = migrateMushafProps<MushafPassageProps>(saved, {defaults: defaultMushafPassageProps});
  const [resolved, backgroundVideoSeconds] = await Promise.all([
    resolvePassage(props, {signal: abortSignal}),
    backgroundVideoSecondsFor(props.background, remotionStaticFile),
  ]);
  return {
    props: {...props, resolved: {...resolved, backgroundVideoSeconds}},
    ...sizeForAspect(props.layout.aspect),
    fps: STUDIO_FPS,
    durationInFrames: Math.max(
      1,
      passageTimeline(resolved.lines, props, STUDIO_FPS).end + passageEndFade(props.animation, STUDIO_FPS),
    ),
  };
};

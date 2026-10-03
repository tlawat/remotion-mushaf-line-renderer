// What both compositions share: the frame rate, turning a content prop into a URL, loading a
// translation file of the expected kind, naming the ayah a line starts with or the one being heard,
// the frames at which the slots of a schedule are in place, and the geometry and styles of the
// blocks on the canvas.
import {
  fontSizeForWidth,
  type LineSchedule,
  lineHeightForFontSize,
  type MushafLineData,
  type RecitationTimings,
  sliceWords,
} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {describeValue, MushafStudioError} from '../errors';
import type {Layout, Text} from '../schema';
import {loadTranslation} from '../translations';
import type {Translation} from '../types';

/** The compositions' frame rate: what the Root declares, and what `durationInFrames` is counted in. */
export const STUDIO_FPS = 30;

/** A `public/` path through `staticFile()`; an http(s) URL as it is (`staticFile()` refuses those). */
export const fileUrl = (path: string, staticFile: (path: string) => string): string =>
  /^https?:\/\//i.test(path) ? path : staticFile(path);

export type TextFileProp = 'translationFile' | 'glossFile' | 'transliterationFile';

const SHAPES: Readonly<Record<Translation['kind'], string>> = {
  ayah: 'an ayah-by-ayah translation ({"1:1": "..."}, or any QUL shape)',
  word: 'a word-by-word file ({"1:1:1": "..."})',
};

/**
 * Loads the translation file a `text.*File` prop names, or `null` for an empty prop, and checks it
 * is of the kind the prop takes: an ayah file where a word file is expected (or the reverse) is
 * `BAD_STUDIO_PROP`, named after the prop so the Props sidebar shows where to look. `signal` is
 * `calculateMetadata()`'s, so the Studio can abort a resolution it no longer needs.
 */
export const loadTextFile = async <K extends Translation['kind']>(
  kind: K,
  prop: TextFileProp,
  file: string,
  options: {
    readonly fetch: typeof fetch;
    readonly staticFile: (path: string) => string;
    readonly signal?: AbortSignal | undefined;
  },
): Promise<Extract<Translation, {kind: K}> | null> => {
  if (file === '') return null;
  const translation = await loadTranslation(fileUrl(file, options.staticFile), {
    fetch: options.fetch,
    ...(options.signal ? {signal: options.signal} : {}),
  });
  if (translation.kind !== kind) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `text.${prop} ${describeValue(file)} is ${SHAPES[translation.kind]}, but ${prop} takes ${SHAPES[kind]}. Point ${prop} at ${SHAPES[kind]}${kind === 'ayah' ? ', or move this file to glossFile / transliterationFile' : ', or move this file to translationFile'}.`,
      {prop, file, kind: translation.kind},
    );
  }
  return translation as Extract<Translation, {kind: K}>;
};

/** The translation key ("surah:ayah") of the first word a line shows, or `null` for a line without words. */
export const firstAyahKey = (line: MushafLineData | undefined): string | null => {
  const word = line ? sliceWords(line)[0] : undefined;
  return word ? `${word.surah}:${word.ayah}` : null;
};

/**
 * The translation key of the ayah being recited at `seconds`: the last ayah of the file whose
 * `start` is at or before it, `null` before the first. A pause between ayahs keeps the previous one
 * current until the next starts, like `wordAt()` does for words; unlike it, this needs no per-word
 * times, so the translation follows the audio even for a file that only times its ayahs.
 */
export const ayahAt = (timings: RecitationTimings, seconds: number): string | null => {
  let current: number | null = null;
  for (const ayah of timings.ayat) if (ayah.start <= seconds) current = ayah.ayah;
  return current === null ? null : `${timings.surah}:${current}`;
};

/**
 * The frame at which each slot of a schedule is in place, one per slot, never decreasing: a slot is
 * fully on screen `leadInSeconds` before its first word is heard. `scheduleLines()` keeps the lines
 * in reading order, so under `occurrence: 'last'` a slot whose first word was repeated after the
 * next slot began starts after it; such a slot takes the next one's frame (its line scrolls in with
 * the next, as the window's `steps` require, instead of `scrollPosition()` refusing them).
 */
export const leadFrames = (
  schedule: readonly LineSchedule[],
  leadInSeconds: number,
  fps: number,
): readonly number[] => {
  let previous = Number.NEGATIVE_INFINITY;
  return schedule.map((slot) => {
    previous = Math.max(previous, Math.round((slot.start - leadInSeconds) * fps));
    return previous;
  });
};

/** A background image fills the frame, cropped to it, under everything. */
export const BACKGROUND_IMAGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

/** The one-line notice the compositions show in the Studio when a fonts mode degraded to the CDN. */
export const WARNING_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  padding: '0.4em 1em',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 22,
  lineHeight: 1.3,
  color: '#7a2e0e',
  background: 'rgba(255, 232, 204, 0.92)',
};

/** Where the lines sit on the canvas: the measure between the margins, the type size for it, and the box of `slots` line boxes. */
export type BlockGeometry = {
  /** The width the lines are set to: the composition's less both margins. */
  readonly measure: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  /** Line boxes in the block: `visibleLines`, or 1 when the lines are shown one at a time. */
  readonly slots: number;
  readonly blockHeight: number;
  /** The block's top edge, `verticalAlign` of the room left under it. */
  readonly top: number;
};

/** The lines' block for a layout in a frame of `size`: the package's default type size is for a line spanning the whole width, so the measure sets it. */
export const blockGeometry = (
  layout: Pick<Layout, 'marginX' | 'visibleLines' | 'verticalAlign'>,
  size: {readonly width: number; readonly height: number},
): BlockGeometry => {
  const measure = size.width - 2 * layout.marginX;
  const fontSize = fontSizeForWidth(measure);
  const lineHeight = lineHeightForFontSize(fontSize);
  const slots = layout.visibleLines === 0 ? 1 : layout.visibleLines;
  const blockHeight = slots * lineHeight;
  const top = Math.round((size.height - blockHeight) * layout.verticalAlign);
  return {measure, fontSize, lineHeight, slots, blockHeight, top};
};

/** A schema offset as a `translateY`; nothing for 0, so an unmoved block has the style it had before the prop existed. */
const offsetStyle = (offsetY: number): React.CSSProperties =>
  offsetY === 0 ? {} : {transform: `translateY(${offsetY}px)`};

/** The lines' block: an absolute box between the margins, `layout.offsetY` down from `top`. Its `<Sequence>` fills it. */
export const linesBlockStyle = (
  geometry: BlockGeometry,
  layout: Pick<Layout, 'marginX' | 'offsetY'>,
): React.CSSProperties => ({
  position: 'absolute',
  top: geometry.top,
  left: layout.marginX,
  width: geometry.measure,
  height: geometry.blockHeight,
  ...offsetStyle(layout.offsetY),
});

/** The translation block: under the lines (`below`) or over them (`above`), 0.6 em away, `text.translationOffsetY` down. */
export const translationBlockStyle = (
  geometry: BlockGeometry,
  layout: Pick<Layout, 'marginX'>,
  text: Pick<Text, 'translationPosition' | 'translationSize' | 'translationOffsetY'>,
  height: number,
): React.CSSProperties => {
  const gap = Math.round(text.translationSize * 0.6);
  return {
    position: 'absolute',
    left: layout.marginX,
    width: geometry.measure,
    ...(text.translationPosition === 'above'
      ? {bottom: height - geometry.top + gap}
      : {top: geometry.top + geometry.blockHeight + gap}),
    ...offsetStyle(text.translationOffsetY),
  };
};

/** The gloss strip: along the bottom edge, one gloss size up, between the margins. */
export const glossBlockStyle = (
  geometry: BlockGeometry,
  layout: Pick<Layout, 'marginX'>,
  text: Pick<Text, 'glossSize'>,
): React.CSSProperties => ({
  position: 'absolute',
  left: layout.marginX,
  width: geometry.measure,
  bottom: text.glossSize,
});

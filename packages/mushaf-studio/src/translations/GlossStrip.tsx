import type * as React from 'react';
import type {WordSpan} from '../schema/marks';
import {SINE, SOFT, tempoFrames} from '../schema/tokens';
import type {WordGloss} from '../types';
import {TRANSLATION_LINE_HEIGHT} from './TranslationBlock';

/** The strip's word at a moment: the current word, the one before it, and frames since the change. */
export type GlossStripState = {
  readonly activeWordId: string | null;
  readonly previousWordId: string | null;
  /** Frames since `activeWordId` took over; large once the change is long done. */
  readonly framesSinceChange: number;
};

/** Seconds after a change the incoming gloss starts to come in (2 frames at 30 fps): the outgoing one is mostly gone by then. */
const GLOSS_IN_DELAY_SECONDS = 2 / 30;

/**
 * Which word the strip shows at `seconds` of the recording: the word of the last kept span
 * (`wordSpans()`) that has started, held through pauses, so a word too short to mark never flashes
 * its gloss. `null` before the first.
 */
export const glossStripState = (spans: readonly WordSpan[], seconds: number, fps: number): GlossStripState => {
  let index = -1;
  for (let i = 0; i < spans.length; i++) {
    if (spans[i]!.start <= seconds) index = i;
    else break;
  }
  const current = spans[index];
  if (current === undefined) return {activeWordId: null, previousWordId: null, framesSinceChange: Infinity};
  return {
    activeWordId: current.id,
    previousWordId: spans[index - 1]?.id ?? null,
    framesSinceChange: (seconds - current.start) * fps,
  };
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/**
 * The outgoing and incoming text's opacity, `framesSinceChange` frames of a `fps` composition after
 * a change: out over `glossOut` (0.1 s), in over `glossIn` (0.2 s) from 0.067 s on, the same in
 * time at any frame rate (3, 6 and 2 frames at 30 fps; 6, 12 and 4 at 60).
 */
export const glossStripOpacities = (
  framesSinceChange: number,
  fps = 30,
): {readonly out: number; readonly in: number} => {
  const delay = Math.round(GLOSS_IN_DELAY_SECONDS * fps);
  return {
    out: round4(1 - SINE(clamp01(framesSinceChange / tempoFrames('glossOut', 'calm', fps)))),
    in: round4(SOFT(clamp01((framesSinceChange - delay) / tempoFrames('glossIn', 'calm', fps)))),
  };
};

export type GlossStripProps = {
  /** The word translation and/or transliteration to show for the active word. */
  readonly translation: WordGloss | null;
  readonly transliteration: WordGloss | null;
  /** `MushafWord.id` of the word being recited, or `null` between words. */
  readonly activeWordId: string | null;
  /** The word shown before it, fading out over the first frames of the change (`glossStripState()`). */
  readonly previousWordId?: string | null | undefined;
  /** Frames since `activeWordId` took over. Default: the change is long done (no fade). */
  readonly framesSinceChange?: number | undefined;
  /** The composition's frame rate, which `framesSinceChange` counts in. Default 30. */
  readonly fps?: number | undefined;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

/**
 * A strip that shows the active word's gloss: its translation and, under it, its transliteration,
 * centred. There is one row per gloss given (`null` leaves its row out), and a row keeps its height
 * when there is no active word or the word has no gloss there, so the layout never jumps. At a
 * change the previous gloss fades out over 0.1 s and the new one in over 0.2 s from 0.067 s on
 * (`glossStripOpacities()`). Pure in its props.
 */
export const GlossStrip: React.FC<GlossStripProps> = ({
  translation,
  transliteration,
  activeWordId,
  previousWordId = null,
  framesSinceChange = Infinity,
  fps = 30,
  fontFamily,
  fontSize,
  color,
  style,
  className,
}) => {
  const opacities = glossStripOpacities(framesSinceChange, fps);
  const fading = previousWordId !== null && previousWordId !== activeWordId && opacities.out > 0;
  const textOf = (gloss: WordGloss, id: string | null): string => (id === null ? '' : (gloss.words[id] ?? ''));
  const row = (gloss: WordGloss, kind: 'translation' | 'transliteration') => (
    <div
      className={`mushaf-gloss__${kind}`}
      style={{position: 'relative', minHeight: fontSize * TRANSLATION_LINE_HEIGHT}}
    >
      <span style={opacities.in < 1 ? {opacity: opacities.in} : undefined}>{textOf(gloss, activeWordId)}</span>
      {fading && (
        <span data-gloss-outgoing="" style={{position: 'absolute', left: 0, right: 0, top: 0, opacity: opacities.out}}>
          {textOf(gloss, previousWordId)}
        </span>
      )}
    </div>
  );
  return (
    <div
      className={className ? `mushaf-gloss ${className}` : 'mushaf-gloss'}
      data-word-id={activeWordId ?? undefined}
      style={{fontFamily, fontSize, color, textAlign: 'center', lineHeight: TRANSLATION_LINE_HEIGHT, ...style}}
    >
      {translation ? row(translation, 'translation') : null}
      {transliteration ? row(transliteration, 'transliteration') : null}
    </div>
  );
};

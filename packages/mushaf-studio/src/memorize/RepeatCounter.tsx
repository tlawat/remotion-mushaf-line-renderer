import type * as React from 'react';
import {useVideoConfig} from 'remotion';
import {SMALL_CAPS} from '../overlay/TitleOverlay';
import type {Overlay} from '../schema';
import {studioFontStyle} from '../schema/fonts';
import {dissolve, frameGeometry, type Tempo, tempoFrames} from '../schema/tokens';
import {clipAt, type MemorizeClip, repeatCounterText} from './timeline';

export type RepeatCounterProps = {
  readonly clips: readonly MemorizeClip[];
  /** `repeatsOf(memorize)`. */
  readonly repeats: number;
  /** Seconds of the composition. */
  readonly seconds: number;
  /** The title overlay's ink, font, size and corner: the counter goes in the corner across from its label. */
  readonly overlay: Pick<Overlay, 'color' | 'font' | 'corner' | 'cornerSize'>;
  /** Whether the corner label is shown (`showsCorner()`): without it the counter sits top left. Default `true`. */
  readonly labelShown?: boolean | undefined;
  /** `animation.tempo`, for the change's length (`labelChange`). Default `'calm'`. */
  readonly tempo?: Tempo | undefined;
  /** The composition draws the jadwal (`layout.frame: 'hairline'`): the counter goes inside its inner rule. Default `false`. */
  readonly jadwal?: boolean | undefined;
  /** No longer drawn (the counter has no pill); kept for callers written before the render design. */
  readonly background?: string | undefined;
};

/** The corner across from `corner` on the same edge: the title's label and the counter never meet. */
const ACROSS: Readonly<Record<Overlay['corner'], Overlay['corner']>> = {
  'top-left': 'top-right',
  'top-right': 'top-left',
  'bottom-left': 'bottom-right',
  'bottom-right': 'bottom-left',
};

/**
 * The repetition counter of the memorisation modes: "2 / 3" while the second of three plays of an
 * ayah is heard (and through the pause after it), as plain text in the label face (small caps,
 * tabular figures, 60 % ink), in the corner across from the title overlay's label (top left when
 * there is none), inside the safe area, and inside the jadwal's inner rule when one is drawn. It
 * changes by a `labelChange` dissolve when the next play starts. Nothing when ayahs play once or
 * before the first clip. Pure in its props.
 */
export const RepeatCounter: React.FC<RepeatCounterProps> = ({
  clips,
  repeats,
  seconds,
  overlay,
  labelShown,
  tempo,
  jadwal,
}) => {
  const {fps, width, height} = useVideoConfig();
  const clip = clipAt(clips, seconds);
  const text = repeatCounterText(clip, repeats);
  if (text === null || clip === null) return null;
  const geometry = frameGeometry(width, height, {jadwal});
  const corner = labelShown === false ? 'top-left' : ACROSS[overlay.corner];
  const size = overlay.cornerSize > 0 ? overlay.cornerSize : geometry.label;
  const index = clips.indexOf(clip);
  const before = index > 0 ? repeatCounterText(clips[index - 1]!, repeats) : null;
  const length = tempoFrames('labelChange', tempo ?? 'calm', fps);
  const into = seconds * fps - Math.round(clip.compositionFrom * fps);
  const changing = before !== null && before !== text && into < length;
  const sides = changing ? dissolve(into, length) : {out: 0, in: 1};
  return (
    <div
      data-mushaf-overlay="repeat-counter"
      style={{
        position: 'absolute',
        ...(corner.startsWith('top') ? {top: geometry.top} : {bottom: geometry.bottom}),
        ...(corner.endsWith('left') ? {left: geometry.safe} : {right: geometry.safe}),
        color: overlay.color,
        ...studioFontStyle(overlay.font, 'label'),
        ...SMALL_CAPS,
        fontSize: size,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        direction: 'ltr',
        opacity: 0.6,
        ...(changing ? {display: 'grid'} : {}),
      }}
    >
      {changing ? (
        <>
          <span data-mushaf-overlay-part="outgoing" aria-hidden="true" style={{gridArea: '1 / 1', opacity: sides.out}}>
            {before}
          </span>
          <span style={{gridArea: '1 / 1', opacity: sides.in}}>{text}</span>
        </>
      ) : (
        text
      )}
    </div>
  );
};

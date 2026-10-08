import type * as React from 'react';
import type {Overlay} from '../schema';
import {withAlpha} from '../schema/highlight';
import {clipAt, type MemorizeClip, repeatCounterText} from './timeline';

export type RepeatCounterProps = {
  readonly clips: readonly MemorizeClip[];
  /** `repeatsOf(memorize)`. */
  readonly repeats: number;
  /** Seconds of the composition. */
  readonly seconds: number;
  /** The title overlay's ink, font, size and corner: the counter goes in the corner across from its label. */
  readonly overlay: Pick<Overlay, 'color' | 'font' | 'corner' | 'cornerSize'>;
  /** The page colour, behind the counter at 70 %. */
  readonly background: string;
};

/** The corner across from `corner` on the same edge: the title's label and the counter never meet. */
const ACROSS: Readonly<Record<Overlay['corner'], Overlay['corner']>> = {
  'top-left': 'top-right',
  'top-right': 'top-left',
  'bottom-left': 'bottom-right',
  'bottom-right': 'bottom-left',
};

/**
 * The repetition counter of the memorisation modes: "2/3" while the second of three plays of an
 * ayah is heard (and through the pause after it), small, in the corner across from the title
 * overlay's label, in its ink and font on a pill of the page colour. Nothing when ayahs play once
 * or before the first clip. Pure in its props.
 */
export const RepeatCounter: React.FC<RepeatCounterProps> = ({clips, repeats, seconds, overlay, background}) => {
  const text = repeatCounterText(clipAt(clips, seconds), repeats);
  if (text === null) return null;
  const corner = ACROSS[overlay.corner];
  const size = overlay.cornerSize;
  return (
    <div
      data-mushaf-overlay="repeat-counter"
      style={{
        position: 'absolute',
        ...(corner.startsWith('top') ? {top: size} : {bottom: size}),
        ...(corner.endsWith('left') ? {left: size} : {right: size}),
        padding: '0.15em 0.6em',
        borderRadius: '1em',
        background: withAlpha(background, 0.7),
        color: overlay.color,
        fontFamily: overlay.font,
        fontSize: size,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        direction: 'ltr',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {text}
    </div>
  );
};

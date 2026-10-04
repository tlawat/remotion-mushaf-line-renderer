// The arithmetic of the interlinear glosses, apart from the DOM: how big the labels are, how much
// room a line needs for them, and where each one goes under its word.

/** The labels' size is `glossSize`, but never more than this share of the printed line's type size. */
export const INTERLINEAR_SIZE_SHARE = 0.3;

/** A label whose text is too wide for its word shrinks down to this share of its size, then is cut with an ellipsis. */
export const INTERLINEAR_MIN_FIT = 0.7;

/** One label row's height, in multiples of the label size. */
export const INTERLINEAR_ROW_HEIGHT = 1.25;

/** The labels' type size for a gloss size and a line type size: small, whatever `glossSize` says. Never under 8 px. */
export const interlinearFontSize = (glossSize: number, lineFontSize: number): number =>
  Math.max(8, Math.round(Math.min(glossSize, lineFontSize * INTERLINEAR_SIZE_SHARE)));

/** The height of one label row, in px. */
export const interlinearRowHeight = (fontSize: number): number => Math.round(fontSize * INTERLINEAR_ROW_HEIGHT);

/** How many label rows the loaded files give: one for the gloss, one for the transliteration. */
export const interlinearRows = (gloss: unknown, transliteration: unknown): number =>
  (gloss ? 1 : 0) + (transliteration ? 1 : 0);

/**
 * How much a line slot grows to hold `rows` label rows of `fontSize`: the rows and a tenth of the
 * size above them, rounded up to an even number of px so the line can move up by exactly half of
 * it (`interlinearLineShift()`). 0 for no rows: the slot keeps its height.
 */
export const interlinearExtraHeight = (rows: number, fontSize: number): number => {
  if (rows <= 0) return 0;
  const raw = rows * interlinearRowHeight(fontSize) + Math.round(fontSize * 0.1);
  return 2 * Math.ceil(raw / 2);
};

/**
 * The line's own move inside its grown slot: the glyphs are centred in the line box, so the line
 * goes up by half the extra height to put them back at the top of the slot and leave the extra
 * height under them for the labels. A `translateY` on the line's root, `undefined` for no extra.
 */
export const interlinearLineShift = (extraHeight: number): {readonly transform: string} | undefined =>
  extraHeight === 0 ? undefined : {transform: `translateY(${-extraHeight / 2}px)`};

/**
 * Where the first label row starts, in px from the top of the line's row: under the glyph box
 * (`lineHeight - extraHeight`, the line height without the labels), which the line box centres,
 * so half the extra height lower.
 */
export const interlinearTop = (lineHeight: number, extraHeight: number): number => lineHeight - extraHeight / 2;

/** One word element of a printed line, measured in px from the row's left edge. */
export type WordBox = {
  /** `data-location`: `MushafWord.id`. */
  readonly id: string;
  readonly kind: 'word' | 'end';
  /** Hidden by a slice (it takes no space and gets no label). */
  readonly hidden: boolean;
  readonly left: number;
  readonly width: number;
};

/** Where one label goes: a box `width` wide from `left` (px from the row's left edge), centred under its word. */
export type LabelPlacement = {
  readonly id: string;
  readonly left: number;
  readonly width: number;
};

/** Two decimals: enough for a px position, free of float noise in the style strings. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The labels of a measured row: one per shown word (not a marker, not a word a slice hides, not an
 * empty box), centred under it and as wide as the room it has, the word's own box plus half the gap
 * to the shown word on each side; a side with no neighbour reaches the row's edge. The width is
 * twice the nearer side's room, so the label stays centred on its word. Words come in any order;
 * the result is in visual order, left to right. Pure.
 */
export const placeLabels = (boxes: readonly WordBox[], rowWidth: number): readonly LabelPlacement[] => {
  const shown = boxes.filter((box) => !box.hidden && box.width > 0).sort((a, b) => a.left - b.left);
  const placements: LabelPlacement[] = [];
  shown.forEach((box, i) => {
    if (box.kind !== 'word') return;
    const before = shown[i - 1];
    const after = shown[i + 1];
    const right = box.left + box.width;
    const leftBound = before ? box.left - Math.max(0, box.left - (before.left + before.width)) / 2 : 0;
    const rightBound = after ? right + Math.max(0, after.left - right) / 2 : Math.max(right, rowWidth);
    const centre = box.left + box.width / 2;
    const half = Math.max(0, Math.min(centre - Math.min(leftBound, box.left), Math.max(rightBound, right) - centre));
    placements.push({id: box.id, left: round2(centre - half), width: round2(2 * half)});
  });
  return placements;
};

/**
 * A label's type size for its text's natural width at `size` and the width it has: `size` when it
 * fits, else shrunk in proportion but never under `INTERLINEAR_MIN_FIT` of it (the ellipsis cuts
 * the rest), to a tenth of a px. A text not measured (0) keeps `size`.
 */
export const fitLabelSize = (natural: number, available: number, size: number): number => {
  if (natural <= 0 || natural <= available) return size;
  const scaled = Math.max(size * INTERLINEAR_MIN_FIT, (size * available) / natural);
  return Math.floor(scaled * 10) / 10;
};

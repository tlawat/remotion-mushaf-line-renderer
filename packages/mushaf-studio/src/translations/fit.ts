// How large a translation is drawn so it never takes more than two lines (render-design.md 5.5): its
// words measured with the loaded font on a canvas 2D context, wrapped greedily the way the browser
// counts lines (`text-wrap: balance` evens the lines out, it never adds one). Deterministic: the
// same text, face and width give the same size on every frame.

/** What a translation's lines are measured in. */
export type TextFace = {
  /** CSS `font-family`. */
  readonly fontFamily: string;
  readonly fontWeight?: number | undefined;
  readonly fontStyle?: 'italic' | undefined;
};

/** Measures a string's advance in px at `size`, or `null` where nothing can measure (no canvas). */
type Measure = (text: string, size: number) => number;

/** Average advance of a book serif's lowercase, in em: the estimate where no canvas can measure. */
const ESTIMATED_ADVANCE = 0.5;

let context: OffscreenCanvasRenderingContext2D | null | undefined;

/** A canvas 2D context, made once; `null` without `OffscreenCanvas` (the server, jsdom). */
const canvasContext = (): OffscreenCanvasRenderingContext2D | null => {
  if (context !== undefined) return context;
  context = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  return context;
};

const measureFor = (face: TextFace): Measure => {
  const ctx = canvasContext();
  if (ctx === null) return (text, size) => text.length * ESTIMATED_ADVANCE * size;
  return (text, size) => {
    ctx.font = `${face.fontStyle ?? 'normal'} ${face.fontWeight ?? 400} ${size}px ${face.fontFamily}`;
    return ctx.measureText(text).width;
  };
};

/** The advance of `text` at `size` px in `face`: measured on a canvas, or estimated (0.5 em a character) without one. */
export const textAdvance = (text: string, face: TextFace, size: number): number => measureFor(face)(text, size);

/**
 * How many lines `text` takes at `size` px in a box `width` px wide, wrapped at spaces like the
 * browser: a word wider than the box takes a line of its own. 0 for an empty text.
 */
export const lineCount = (text: string, face: TextFace, size: number, width: number): number => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const measure = measureFor(face);
  const space = measure(' ', size);
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const advance = measure(word, size);
    if (used === 0) used = advance;
    else if (used + space + advance <= width + 0.5) used += space + advance;
    else {
      lines += 1;
      used = advance;
    }
  }
  return lines;
};

/** The width of a translation's measure: the box, never wider than 60 ch at `size` (`min(box, 60ch)`). */
export const measureWidth = (face: TextFace, size: number, box: number): number =>
  Math.min(box, 60 * measureFor(face)('0', size));

/** The most lines a translation takes at its size before it is drawn smaller. */
export const TRANSLATION_MAX_LINES = 2;
/** How much smaller a translation that needs more than two lines is drawn: it may then take 3 or 4. */
export const TRANSLATION_SHRINK = 0.85;

/**
 * The size a translation is drawn at in a box `width` px wide: `size`, or `0.85 × size` when it
 * needs more than two lines there (it may then take three or four; it is never cut). Measured with
 * the face as loaded, so call it after the font gate (`useStudioFonts()`).
 */
export const translationFitSize = (text: string, face: TextFace, size: number, width: number): number =>
  lineCount(text, face, size, measureWidth(face, size, width)) > TRANSLATION_MAX_LINES
    ? Math.round(size * TRANSLATION_SHRINK * 100) / 100
    : size;

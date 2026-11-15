// The word bands: a faint band behind the words `wordBand` names, drawn by the line as one shape per
// colour behind its row rather than as a background on each word. Pure geometry here; the line
// measures where each word's ink is (`useInkExtents`) and paints the result.
import type * as React from 'react';
import type {MushafBandShape} from '../types';

/** Where a word's ink is on its row, px from the row's left edge, and the band behind it (0-1 of its colour's alpha). */
export type BandSegment = {
  readonly left: number;
  readonly right: number;
  readonly strength: number;
};

/** One point of a band's profile: px from the row's left edge, and the band's strength there (0-1). */
export type BandPoint = readonly [x: number, strength: number];

/** A band's shape with every default filled in. */
export type ResolvedBandShape = Required<MushafBandShape>;

/** The design's band: 1.65 em tall at 55 % of the line box, feathered 0.22 em, ending 0.35 em past the ink. */
export const DEFAULT_BAND_SHAPE: ResolvedBandShape = {height: 1.65, y: 0.55, feather: 0.22, pad: 0.05, end: 0.3};

/** The `MushafBandShape` a line paints with, its defaults filled in. */
export const resolveBandShape = (shape: MushafBandShape | undefined): ResolvedBandShape => ({
  height: shape?.height ?? DEFAULT_BAND_SHAPE.height,
  y: shape?.y ?? DEFAULT_BAND_SHAPE.y,
  feather: shape?.feather ?? DEFAULT_BAND_SHAPE.feather,
  pad: shape?.pad ?? DEFAULT_BAND_SHAPE.pad,
  end: shape?.end ?? DEFAULT_BAND_SHAPE.end,
});

/** The soft end of a band, as fractions of its width from the outside in: an S-curve, so the end reads as rounded, not as a ramp. */
const END_PROFILE: readonly BandPoint[] = [
  [0, 0],
  [0.25, 0.156],
  [0.5, 0.5],
  [0.75, 0.844],
  [1, 1],
];

/** One segment's profile as knots: zero outside, the S-curve over `end` px, full over the ink and `pad`. */
const knotsOf = (segment: BandSegment, pad: number, end: number): BandPoint[] => {
  const left = segment.left - pad;
  const right = segment.right + pad;
  const rise = END_PROFILE.map(([t, v]) => [left - end + t * end, v * segment.strength] as const);
  const fall = END_PROFILE.map(([t, v]) => [right + end - t * end, v * segment.strength] as const).reverse();
  return [...rise, ...fall];
};

/** A piecewise-linear profile at `x`: 0 outside its knots. */
const valueAt = (knots: readonly BandPoint[], x: number): number => {
  const first = knots[0];
  const last = knots[knots.length - 1];
  if (first === undefined || last === undefined || x <= first[0] || x >= last[0]) return 0;
  for (let i = 1; i < knots.length; i++) {
    const [x1, v1] = knots[i]!;
    const [x0, v0] = knots[i - 1]!;
    if (x <= x1) return x1 === x0 ? Math.max(v0, v1) : v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
  }
  return 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/**
 * The profile of the band behind a line's segments: at each point, the strongest segment's band
 * (their upper envelope), never their sum, so two words' bands that meet (a mark letting go beside
 * the next one coming in) or overlap (an ayah's run of words) read as one band with no brighter
 * seam. Each segment is full over its ink and `pad` px past it, and ends in a soft S-curve `end` px
 * long. Points ascend in x, start and end at 0, and are exact: the envelope of piecewise-linear
 * profiles is piecewise linear between their knots and their crossings.
 */
export const bandProfile = (segments: readonly BandSegment[], pad: number, end: number): BandPoint[] => {
  const profiles = segments.filter((s) => s.strength > 0 && s.right >= s.left).map((s) => knotsOf(s, pad, end));
  if (profiles.length === 0) return [];
  const xs = [...new Set(profiles.flatMap((knots) => knots.map(([x]) => x)))].sort((a, b) => a - b);
  const points: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x0 = xs[i]!;
    points.push(x0);
    const x1 = xs[i + 1];
    if (x1 === undefined) break;
    // Between two knots every profile is a straight line: add where two of them cross.
    const ends = profiles.map((knots) => [valueAt(knots, x0 + 1e-9), valueAt(knots, x1 - 1e-9)] as const);
    for (let a = 0; a < ends.length; a++) {
      for (let b = a + 1; b < ends.length; b++) {
        const da = ends[a]![0] - ends[b]![0];
        const db = ends[a]![1] - ends[b]![1];
        if (da * db < 0) points.push(x0 + ((x1 - x0) * da) / (da - db));
      }
    }
  }
  const sorted = [...new Set(points)].sort((a, b) => a - b);
  // At a knot where a profile steps (none do; the guard keeps the envelope honest), the larger side wins.
  const envelope = sorted.map((x) => [x, Math.max(...profiles.map((knots) => valueAt(knots, x)))] as const);
  // Drop the points that lie on the line through their neighbours: fewer gradient stops, same band.
  const kept: BandPoint[] = [];
  for (const point of envelope) {
    const a = kept[kept.length - 2];
    const b = kept[kept.length - 1];
    if (a !== undefined && b !== undefined && point[0] > a[0]) {
      const onLine = a[1] + ((point[1] - a[1]) * (b[0] - a[0])) / (point[0] - a[0]);
      if (Math.abs(onLine - b[1]) < 1e-4) kept.pop();
    }
    kept.push([round2(point[0]), round4(point[1])]);
  }
  return kept;
};

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()` as channels and alpha; `null` for anything else. */
export const parseBandColor = (color: string): {readonly rgb: string; readonly alpha: number} | null => {
  const text = color.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text)?.[1];
  if (hex !== undefined) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const channel = (i: number) => Number.parseInt(full.slice(i, i + 2), 16);
    return {
      rgb: `${channel(0)}, ${channel(2)}, ${channel(4)}`,
      alpha: full.length === 8 ? channel(6) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/i.exec(text);
  if (rgb === null) return null;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] === '%' ? 100 : 1);
  return {rgb: `${Number(rgb[1])}, ${Number(rgb[2])}, ${Number(rgb[3])}`, alpha: Math.min(1, Math.max(0, alpha))};
};

/**
 * The runs of a profile: the stretches between the points where it is back to 0, each a profile of
 * its own (starting and ending at 0). Two words whose bands touch are one run.
 */
export const bandRuns = (profile: readonly BandPoint[]): BandPoint[][] => {
  const runs: BandPoint[][] = [];
  let run: BandPoint[] = [];
  for (const point of profile) {
    run.push(point);
    if (point[1] === 0 && run.length > 1) {
      runs.push(run);
      run = [];
    } else if (point[1] === 0) run = [point];
  }
  return runs;
};

/** The horizontal gradient of one run: its profile as `rgba()` stops, x from the run's own left edge. */
export const bandGradient = (rgb: string, run: readonly BandPoint[]): string => {
  const left = run[0]?.[0] ?? 0;
  return `linear-gradient(to right, ${run
    .map(([x, strength]) => `rgba(${rgb}, ${strength}) ${round2(x - left)}px`)
    .join(', ')})`;
};

/**
 * The style of one run's box: from its first point to its last, `shape.height` em tall at `shape.y`
 * of the line box, its top and bottom feathered through a mask and its ends rounded (an ellipse as
 * long as the soft end and half the band tall), so the band is one shape with soft round ends and no
 * tile edges in it.
 */
export const bandBoxStyle = (
  run: readonly BandPoint[],
  rgb: string,
  fontSize: number,
  lineHeight: number,
  shape: ResolvedBandShape,
): React.CSSProperties => {
  const height = shape.height * fontSize;
  const left = run[0]?.[0] ?? 0;
  const right = run[run.length - 1]?.[0] ?? left;
  const feather = `${round2(shape.feather * fontSize)}px`;
  const mask = `linear-gradient(to bottom, transparent 0, #000 ${feather}, #000 calc(100% - ${feather}), transparent 100%)`;
  return {
    position: 'absolute',
    left: round2(left),
    width: round2(right - left),
    top: round2(shape.y * (lineHeight - height)),
    height: round2(height),
    backgroundImage: bandGradient(rgb, run),
    borderRadius: `${round2(shape.end * fontSize)}px / 50%`,
    maskImage: mask,
    WebkitMaskImage: mask,
    pointerEvents: 'none',
  };
};

/** A word's band where its ink is: px from the row's left edge, in its colour (`WordBand.color`). */
export type InkBand = {
  readonly left: number;
  readonly right: number;
  readonly color: string;
};

/** One box of `bandBoxes()`: React's `key` (its colour and place) and its style. */
export type BandBox = {readonly key: string; readonly style: React.CSSProperties};

export type BandBoxesOptions = {
  /** px: the type size the shape's em are of. */
  readonly fontSize: number;
  /** px: the line box the band sits in. */
  readonly lineHeight: number;
  readonly shape?: MushafBandShape | undefined;
};

/**
 * The boxes that paint the bands behind a row: one per run of touching bands of one colour,
 * whatever the number of words in it, its profile the strongest band at each point
 * (`bandProfile()`), so neighbouring words join with no seam and overlapping ends never add up. A
 * colour it cannot read (not hex, `rgb()` or `rgba()`) paints nothing. Positions are px from the
 * row's left edge, as the bands' are.
 *
 * ```ts
 * bandBoxes([{left: 120, right: 410, color: 'rgba(177, 147, 83, 0.13)'}], {fontSize: 90, lineHeight: 198});
 * ```
 */
export const bandBoxes = (bands: readonly InkBand[], options: BandBoxesOptions): BandBox[] => {
  const shape = resolveBandShape(options.shape);
  const {fontSize, lineHeight} = options;
  const byColor = new Map<string, BandSegment[]>();
  for (const band of bands) {
    const parsed = parseBandColor(band.color);
    if (parsed === null || parsed.alpha <= 0) continue;
    const segments = byColor.get(parsed.rgb) ?? [];
    segments.push({left: band.left, right: band.right, strength: parsed.alpha});
    byColor.set(parsed.rgb, segments);
  }
  return [...byColor.entries()].flatMap(([rgb, segments]) =>
    bandRuns(bandProfile(segments, shape.pad * fontSize, shape.end * fontSize)).map((run) => ({
      key: `${rgb}@${run[0]?.[0] ?? 0}`,
      style: bandBoxStyle(run, rgb, fontSize, lineHeight, shape),
    })),
  );
};

/** The ink of a run of text against its advance: px past the advance's left (`left`, negative past it) and right edges. */
export type InkOverhang = {readonly left: number; readonly right: number};

let measureContext: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * How far the ink of `text` set in `font` (a CSS `font` shorthand, e.g. `90px "mushaf-qpc-v4-p1"`)
 * reaches past its advance box on each side, in px: `{left: 4, right: 7}` means 4 px of ink left of
 * the box and 7 px right of it (negative: the ink stops inside). Measured on a canvas with kerning
 * off, as the line sets its words; `null` where there is no canvas (a server, jsdom), so the caller
 * keeps the box. The font must already be in `document.fonts`.
 */
export const measureInkOverhang = (text: string, font: string): InkOverhang | null => {
  if (measureContext === undefined) {
    measureContext = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  }
  const context = measureContext;
  if (context === null) return null;
  context.font = font;
  context.fontKerning = 'none';
  context.textAlign = 'left';
  context.direction = 'ltr';
  const metrics = context.measureText(text);
  if (!Number.isFinite(metrics.actualBoundingBoxLeft) || !Number.isFinite(metrics.actualBoundingBoxRight)) return null;
  return {left: metrics.actualBoundingBoxLeft, right: metrics.actualBoundingBoxRight - metrics.width};
};

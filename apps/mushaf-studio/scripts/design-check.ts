#!/usr/bin/env bun
// `bun scripts/design-check.ts <round folder>`: measures the stills and strips `design-stills.ts`
// rendered against the numeric criteria of render-design.md 12.2, and prints which cases pass. A
// criterion only an eye can judge (a rosette is a line drawing, a lone word on the last line) is
// listed as "look" and does not count either way. The measures are in design-image.ts; the frames
// and the colours each case expects are here. Dev only.
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {INOUT} from '@tlawat/mushaf-studio';
import {
  type Band,
  bandsOf,
  channelDistance,
  chromaHueOf,
  coverageOf,
  decodePng,
  deltaE2000,
  diffBox,
  diffColumnBands,
  dissolveShares,
  groundColorOf,
  hexOf,
  type Image,
  inkBox,
  inkiestPixel,
  inkRowProfile,
  levelOf,
  maxDiffIn,
  opacityIn,
  pixelAt,
  type Rect,
  type Rgb,
  rgbOf,
} from './design-image';

/** One measured criterion: `pass` is `null` for what only an eye can judge. */
export type CheckResult = {readonly name: string; readonly pass: boolean | null; readonly detail: string};

/** A case's criteria, measured. `pass` is true when every measured one passes, `null` when none could be. */
export type CaseReport = {
  readonly id: string;
  readonly pass: boolean | null;
  readonly checks: readonly CheckResult[];
};

/** Where the checks find a case's images and its length. */
export type CaseImages = {
  readonly still: (id: string, frame: number) => Image | null;
  readonly strip: (id: string, frame: number) => Image | null;
  /** The composition's `durationInFrames` with the case's props, or `null` when unknown. */
  readonly duration: (id: string) => number | null;
  /** A file of the round's `public/` (the backdrop of V19), or `null`. */
  readonly asset: (file: string) => Image | null;
};

/** The size of a line at full scale (render-design.md 3.3): glyph and line box in px, side margin. */
export const GEOMETRY = {
  landscape: {width: 1920, height: 1080, glyph: 90, lineBox: 198, marginX: 190},
  vertical: {width: 1080, height: 1920, glyph: 52, lineBox: 114, marginX: 90},
} as const;

/** The safe area at full scale: 5 % of the short side. */
export const SAFE_AREA = 54;

/** The grounds and inks of the looks the cases render (3.1). */
export const INKS = {
  ivory: {ground: '#f8f3e6', ink: '#1c1a16'},
  paper: {ground: '#fbf7ee', ink: '#1c1a16'},
  charcoal: {ground: '#121416', ink: '#f1eadb'},
  green: {ground: '#10241b', ink: '#eee7d6'},
} as const;

const check = (name: string, pass: boolean | null, detail: string): CheckResult => ({name, pass, detail});
const look = (name: string, detail = 'judged by eye'): CheckResult => check(name, null, detail);
const missing = (name: string, what: string): CheckResult => check(name, false, `missing: ${what}`);
const fixed = (n: number, digits = 2): string => n.toFixed(digits);

/** The bands of rows with ink across the whole frame, vowel marks joined to their letters. */
export const lineBands = (image: Image, ground: Rgb, lineBox: number, threshold = 12): Band[] =>
  bandsOf(inkRowProfile(image, {x0: 0, y0: 0, x1: image.width, y1: image.height}, ground, threshold), {
    min: 1,
    gap: Math.max(2, Math.round(0.12 * lineBox)),
  });

/** The band nearest a row (by its middle), or `null` for none. */
export const bandNear = (bands: readonly Band[], y: number): Band | null => {
  let best: Band | null = null;
  for (const band of bands) {
    if (best === null || Math.abs((band.start + band.end) / 2 - y) < Math.abs((best.start + best.end) / 2 - y)) {
      best = band;
    }
  }
  return best;
};

const rowsRect = (image: Image, band: Band): Rect => ({x0: 0, y0: band.start, x1: image.width, y1: band.end});

const grow = (rect: Rect, by: number): Rect => ({
  x0: rect.x0 - by,
  y0: rect.y0 - by,
  x1: rect.x1 + by,
  y1: rect.y1 + by,
});

const contains = (outer: Rect, inner: Rect): boolean =>
  inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1;

const scaled = (format: keyof typeof GEOMETRY, scale: number) => {
  const g = GEOMETRY[format];
  return {
    width: g.width * scale,
    height: g.height * scale,
    glyph: g.glyph * scale,
    lineBox: g.lineBox * scale,
    marginX: g.marginX * scale,
    safe: SAFE_AREA * scale,
  };
};

/** The centre line of a frame: the band of ink nearest the middle of the window. */
const centreBand = (image: Image, ground: Rgb, lineBox: number, y = image.height / 2): Band | null =>
  bandNear(lineBands(image, ground, lineBox), y);

// ---------------------------------------------------------------------------------------------
// The cases

/** V1: the Mushaf page at f60 (f56 for the word still at rest). */
export const checkV1 = (images: CaseImages): CheckResult[] => {
  const f60 = images.still('V1', 60);
  const f56 = images.still('V1', 56);
  if (f60 === null || f56 === null) return [missing('stills', 'V1 f56, f60')];
  const g = scaled('landscape', 0.5);
  const ground = rgbOf(INKS.ivory.ground);
  const ink = rgbOf(INKS.ivory.ink);
  const out: CheckResult[] = [];
  const measured = groundColorOf(f60);
  out.push(check('ivory page', channelDistance(measured, ground) <= 3, `ground ${hexOf(measured)}`));
  const box = inkBox(f60, {x0: 0, y0: 0, x1: f60.width, y1: f60.height}, ground);
  out.push(
    box === null
      ? missing('margins', 'no ink')
      : check(
          'margins 95 px at half scale',
          box.x0 >= g.marginX - 4 && box.x1 <= g.width - g.marginX + 4,
          `ink from x ${box.x0} to ${box.x1} (measure ${g.marginX}-${g.width - g.marginX})`,
        ),
  );
  const bands = lineBands(f60, ground, g.lineBox);
  const centre = bandNear(bands, f60.height / 2);
  const below = bands.find((b) => centre !== null && b.start >= centre.end);
  if (centre === null) return [...out, missing('lines', 'no centre line')];
  out.push(
    check(
      'centred lines',
      Math.abs((centre.start + centre.end) / 2 - f60.height / 2) <= 0.25 * g.lineBox,
      `${bands.length} bands; centre line rows ${centre.start}-${centre.end}`,
    ),
  );
  const word = diffBox(f56, f60, 6, rowsRect(f60, centre));
  const heard =
    word === null
      ? null
      : opacityIn(f60, {x0: word.x1 + 2, y0: centre.start, x1: f60.width, y1: centre.end}, ground, ink);
  out.push(
    heard === null
      ? missing('1:2:1-1:2:3 full ink', 'no change at 1:2:4 between f56 and f60')
      : check('1:2:1-1:2:3 full ink', heard >= 0.9, `opacity ${fixed(heard)}`),
  );
  if (word !== null) {
    const rest = inkiestPixel(f56, word, ground);
    out.push(
      check(
        'a word at rest ≈ #74716a ±6',
        channelDistance(rest, rgbOf('#74716a')) <= 6,
        `1:2:4 at f56: ${hexOf(rest)}`,
      ),
    );
  }
  out.push(
    below === undefined
      ? missing('line 2 at 0.3', 'no line below the centre')
      : (() => {
          const o = opacityIn(f60, rowsRect(f60, below), ground, ink);
          return check('line 2 at 0.3', Math.abs(o - 0.3) <= 0.08, `opacity ${fixed(o)}`);
        })(),
  );
  out.push(look('nothing coloured'));
  return out;
};

/** V2: the ink of 1:2:4 fills in over f58-f64, and nothing else changes. */
export const checkV2 = (images: CaseImages): CheckResult[] => {
  const frames = Array.from({length: 11}, (_, i) => 56 + i);
  const shots = frames.map((f) => images.strip('V2', f));
  if (shots.some((s) => s === null)) return [missing('strip', 'V2 f56-f66')];
  const strip = shots as Image[];
  const ground = rgbOf(INKS.ivory.ground);
  const ink = rgbOf(INKS.ivory.ink);
  const first = strip[0] as Image;
  const last = strip[strip.length - 1] as Image;
  const word = diffBox(first, last, 6);
  if (word === null) return [missing('ink fill', 'nothing changes over the strip')];
  const series = strip.map((s) => opacityIn(s, word, ground, ink));
  const monotonic = series.every((v, i) => i === 0 || v >= (series[i - 1] ?? 0) - 0.02);
  const at = (f: number): number => series[frames.indexOf(f)] ?? 0;
  const out = [
    check('monotonic', monotonic, series.map((v) => fixed(v)).join(' ')),
    check('at rest until f58', at(58) <= 0.66, `f58 ${fixed(at(58))}`),
    check('full by f64', at(64) >= 0.95, `f64 ${fixed(at(64))}`),
  ];
  let stray: Rect | null = null;
  for (let i = 1; i < strip.length; i++) {
    const changed = diffBox(strip[i - 1] as Image, strip[i] as Image, 6);
    if (changed !== null && !contains(grow(word, 2), changed)) stray = changed;
  }
  out.push(
    check(
      'no other change on screen',
      stray === null,
      stray === null ? `only ${JSON.stringify(word)}` : `also ${JSON.stringify(stray)}`,
    ),
  );
  return out;
};

/** Where 1:2:4, the last word of the first line, ends (f101.7: 3.391 s). */
const SAMPLE_WORD_124_END = 101.7;

/**
 * The start (in tenths of a frame) and the length (whole frames) of an eased movement that best fit
 * a measured progress, 0 to 1 per frame: how a scroll's timing is read off a strip.
 */
export const fitEasing = (
  samples: readonly {readonly frame: number; readonly progress: number}[],
  easing: (t: number) => number,
  {from, to, durations}: {from: number; to: number; durations: readonly [number, number]},
): {readonly start: number; readonly duration: number; readonly error: number} => {
  let best = {start: from, duration: durations[0], error: Number.POSITIVE_INFINITY};
  for (let start = from; start <= to; start += 0.1) {
    for (let duration = durations[0]; duration <= durations[1]; duration++) {
      let error = 0;
      for (const {frame, progress} of samples) {
        const t = Math.min(1, Math.max(0, (frame - start) / duration));
        error += (easing(t) - progress) ** 2;
      }
      if (error < best.error) best = {start, duration, error};
    }
  }
  return best;
};

/** V3: the window does not scroll before f102, and scrolls one line box in `duration` frames. */
export const checkScroll = (images: CaseImages, id: string, to: number, duration: number): CheckResult[] => {
  const g = scaled('landscape', 0.5);
  const ground = rgbOf(INKS.ivory.ground);
  const tops: number[] = [];
  for (let f = 96; f <= to; f++) {
    const shot = images.strip(id, f);
    if (shot === null) return [missing('strip', `${id} f${f}`)];
    tops.push(lineBands(shot, ground, g.lineBox, 8)[0]?.start ?? Number.NaN);
  }
  const base = tops[0] ?? 0;
  const moved = tops.map((t) => t - base);
  const final = moved[moved.length - 1] ?? 0;
  const frameOf = (i: number): number => 96 + i;
  const early = moved.findIndex((m, i) => frameOf(i) <= 102 && Math.abs(m) > 1);
  const progress = moved.map((m) => (final === 0 ? 0 : m / final));
  const fit = fitEasing(
    progress.map((p, i) => ({frame: frameOf(i), progress: p})),
    (t) => INOUT(t),
    {from: 96, to: 120, durations: [duration - 6, duration + 6]},
  );
  return [
    check(
      'still until 1:2:4 ends (f102)',
      early < 0,
      early < 0 ? 'no movement to f102' : `moved ${moved[early]} px at f${frameOf(early)}`,
    ),
    check('one line box', Math.abs(Math.abs(final) - g.lineBox) <= 2, `moved ${final} px (line box ${g.lineBox})`),
    check(
      `scroll lasts ${duration} f, after the line's last word`,
      Math.abs(fit.duration - duration) <= 2 && fit.start >= SAMPLE_WORD_124_END - 0.5,
      `best fit: from f${fixed(fit.start, 1)} over ${fit.duration} f (error ${fixed(fit.error, 3)}); the ayah ends at f106`,
    ),
    look('no marked word above the centre', 'the ink mark adds no colour'),
  ];
};

/** V4, V4-slow, V5, V20's strip: the dissolve between two lines in one place. */
export const checkDissolve = (
  images: CaseImages,
  id: string,
  {from, to, ground, ink, shift = 0}: {from: number; to: number; ground: string; ink: string; shift?: number},
): {readonly checks: CheckResult[]; readonly maxRise: number; readonly outgoingMoved: number} => {
  const g0 = rgbOf(ground);
  const i0 = rgbOf(ink);
  const first = images.strip(id, from);
  const second = images.strip(id, to);
  if (first === null || second === null) {
    return {checks: [missing('strip', `${id} f${from}-f${to}`)], maxRise: 0, outgoingMoved: 0};
  }
  const a = inkBox(first, {x0: 0, y0: 0, x1: first.width, y1: first.height}, g0);
  const b = inkBox(second, {x0: 0, y0: 0, x1: second.width, y1: second.height}, g0);
  if (a === null || b === null) return {checks: [missing('lines', 'no ink')], maxRise: 0, outgoingMoved: 0};
  const rect = grow(
    {x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)},
    shift + 2,
  );
  const fits: {f: number; a: number; b: number; dy: number}[] = [];
  let outgoingMoved = 0;
  for (let f = from; f <= to; f++) {
    const shot = images.strip(id, f);
    if (shot === null) return {checks: [missing('strip', `${id} f${f}`)], maxRise: 0, outgoingMoved: 0};
    const fit = dissolveShares(shot, first, second, rect, g0, i0, shift);
    fits.push({f, a: fit.a, b: fit.b, dy: fit.dy});
    if (shift > 0 && fit.a > 0.3) {
      const back = dissolveShares(shot, second, first, rect, g0, i0, 3);
      outgoingMoved = Math.max(outgoingMoved, Math.abs(back.dy));
    }
  }
  const both = fits.filter((x) => x.a > 0.2 && x.b > 0.2);
  const blank = fits.filter((x) => x.a + x.b < 0.15);
  const maxRise = Math.max(0, ...fits.filter((x) => x.b > 0.1).map((x) => x.dy));
  const at102 = fits.find((x) => x.f === 102);
  const series = fits.map((x) => `f${x.f} ${fixed(x.a)}/${fixed(x.b)}`).join(', ');
  return {
    checks: [
      check(
        'line 1 fully visible at f102',
        at102 !== undefined && at102.a >= 0.95,
        `f102 ${at102 === undefined ? '-' : fixed(at102.a)}`,
      ),
      check(
        'never both above 0.2',
        both.length === 0,
        both.length === 0 ? series : `both at ${both.map((x) => `f${x.f}`).join(' ')}`,
      ),
      check(
        'never blank (out + in ≥ 0.15)',
        blank.length === 0,
        blank.length === 0
          ? `least ${fixed(Math.min(...fits.map((x) => x.a + x.b)))}`
          : `blank at ${blank.map((x) => `f${x.f}`).join(' ')}`,
      ),
    ],
    maxRise,
    outgoingMoved,
  };
};

/** V6: no pink and no mint anywhere (the `normal` palette's rosette fills), on each of three looks. */
export const checkRosettes = (images: CaseImages, id: string): CheckResult[] => {
  const shot = images.still(id, 60);
  if (shot === null) return [missing('still', `${id} f60`)];
  const ground = groundColorOf(shot);
  let pink = 0;
  let mint = 0;
  for (let y = 0; y < shot.height; y++) {
    for (let x = 0; x < shot.width; x++) {
      const c = pixelAt(shot, x, y);
      if (channelDistance(c, ground) <= 20 || levelOf(c) < 140) continue;
      const {chroma, hue} = chromaHueOf(c);
      if (chroma < 10) continue;
      if (hue >= 330 || hue < 20) pink++;
      else if (hue >= 140 && hue <= 200) mint++;
    }
  }
  return [
    check('no pink, no mint', pink <= 30 && mint <= 30, `${pink} pink and ${mint} mint pixels`),
    look('gold line, vellum petals, no solid coin'),
  ];
};

/** The most inked of the pixels of `rect` that differ from `ref` by more than `threshold`: a tinted letter. */
export const inkiestChanged = (shot: Image, ref: Image, rect: Rect, ground: Rgb, threshold = 6): Rgb | null => {
  let best: Rgb | null = null;
  for (let y = Math.max(0, rect.y0); y < Math.min(shot.height, rect.y1); y++) {
    for (let x = Math.max(0, rect.x0); x < Math.min(shot.width, rect.x1); x++) {
      const c = pixelAt(shot, x, y);
      if (channelDistance(c, pixelAt(ref, x, y)) <= threshold) continue;
      if (best === null || Math.abs(levelOf(c) - levelOf(ground)) > Math.abs(levelOf(best) - levelOf(ground))) best = c;
    }
  }
  return best;
};

/**
 * V7 and V9: the word being recited drawn in the accent, the one before it still letting go at f63.
 * At f56 only 1:2:3 is tinted, which places it; 1:2:4 is what differs at f63 to its left (RTL).
 */
export const checkTint = (images: CaseImages, id: string, expected: string): CheckResult[] => {
  const g = scaled('landscape', 0.5);
  const ground = rgbOf(INKS.ivory.ground);
  const shot = images.still(id, 63);
  const ref = images.still(`${id}-ref`, 63);
  const before = images.still(id, 56);
  const beforeRef = images.still(`${id}-ref`, 56);
  if (shot === null || ref === null || before === null || beforeRef === null) {
    return [missing('stills', `${id} and ${id}-ref f56, f63`)];
  }
  const centre = centreBand(ref, ground, g.lineBox);
  if (centre === null) return [missing('lines', 'no centre line')];
  const rows = rowsRect(shot, centre);
  const previous = diffBox(before, beforeRef, 6, rows);
  if (previous === null) return [check('tinted', false, '1:2:3 is not tinted at f56')];
  const out: CheckResult[] = [];
  const word = inkiestChanged(shot, ref, {...rows, x1: previous.x0}, ground);
  out.push(
    word === null
      ? check(`1:2:4 in ${expected}`, false, 'nothing differs left of 1:2:3')
      : check(
          `1:2:4 in ${expected} (ΔE2000 ≤ 5)`,
          deltaE2000(word, rgbOf(expected)) <= 5,
          `inkiest tinted pixel ${hexOf(word)}, ΔE ${fixed(deltaE2000(word, rgbOf(expected)), 1)}, hue ${fixed(chromaHueOf(word).hue, 0)}`,
        ),
  );
  const trail = inkiestChanged(shot, ref, {...rows, x0: previous.x0, x1: previous.x1}, ground);
  out.push(
    check(
      '1:2:3 still partly tinted at f63',
      trail !== null && chromaHueOf(trail).chroma > 6,
      trail === null
        ? 'no longer differs'
        : `inkiest changed pixel ${hexOf(trail)}, chroma ${fixed(chromaHueOf(trail).chroma, 1)}`,
    ),
  );
  const changed = diffBox(shot, ref, 6);
  out.push(
    check(
      'nothing else changed',
      changed !== null && contains(grow(rows, 2), changed) && changed.x1 <= previous.x1 + 2,
      `differs over ${JSON.stringify(changed)}; 1:2:3 is x ${previous.x0}-${previous.x1}`,
    ),
  );
  return out;
};

/** V8: a tint on a tajweed theme is drawn as a wash; the letters keep their colours. */
export const checkTintAsWash = (images: CaseImages): CheckResult[] => {
  const g = scaled('landscape', 0.5);
  const shot = images.still('V8', 60);
  const ref = images.still('V8-ref', 60);
  if (shot === null || ref === null) return [missing('stills', 'V8 and V8-ref f60')];
  const ground = rgbOf(INKS.paper.ground);
  const ink = rgbOf(INKS.paper.ink);
  const box = diffBox(shot, ref, 2);
  if (box === null) return [check('a wash behind 1:2:4', false, 'nothing differs from the reference')];
  const cover = coverageOf(ref, box, ground, ink);
  let recoloured = 0;
  let washed = 0;
  let i = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const d = channelDistance(pixelAt(shot, x, y), pixelAt(ref, x, y));
      if ((cover[i] ?? 0) > 0.85 && d > 6) recoloured++;
      if ((cover[i] ?? 0) < 0.05 && d >= 2) washed++;
      i++;
    }
  }
  return [
    check(
      'a wash behind one word',
      washed > 0 && box.y1 - box.y0 <= g.lineBox && box.x1 - box.x0 <= 0.5 * (g.width - 2 * g.marginX),
      `${washed} paper pixels washed over ${box.x1 - box.x0}×${box.y1 - box.y0}`,
    ),
    check('no letter recoloured', recoloured === 0, `${recoloured} letter pixels changed`),
    look('tajweed colours intact', 'measured with the letters above'),
  ];
};

/** V10: one band over the ayah, no seam along it, clear of the lines around. */
export const checkAyahWash = (images: CaseImages, id: string, format: keyof typeof GEOMETRY): CheckResult[] => {
  const g = scaled(format, 0.5);
  const shot = images.still(id, 60);
  const ref = images.still(`${id}-ref`, 60);
  if (shot === null || ref === null) return [missing('stills', `${id} and ${id}-ref f60`)];
  const ground = rgbOf(INKS.charcoal.ground);
  const bands = lineBands(ref, ground, g.lineBox, 8);
  const band = diffBox(shot, ref, 3);
  if (band === null) return [check('a band', false, 'nothing differs from the reference')];
  const centre = bandNear(bands, (band.y0 + band.y1) / 2);
  const out: CheckResult[] = [];
  const lineInk = centre === null ? null : inkBox(ref, rowsRect(ref, centre), ground);
  out.push(
    lineInk === null
      ? missing('rosette included', 'no line')
      : check(
          'the whole ayah, rosette included',
          band.x0 <= lineInk.x0 + 2 && band.x1 >= lineInk.x1 - 2,
          `band x ${band.x0}-${band.x1}, ink x ${lineInk.x0}-${lineInk.x1}`,
        ),
  );
  // Along the band's middle row, where the reference shows the ground (between the letters).
  const y = Math.round((band.y0 + band.y1) / 2);
  const cap = Math.round(g.glyph * 0.5);
  const lift: number[] = [];
  // From the rosette's right (its disc, in the ground's colour, covers the band) to the right cap.
  for (let x = band.x0 + Math.round(g.glyph * 1.1); x < band.x1 - cap; x++) {
    const r = pixelAt(ref, x, y);
    if (channelDistance(r, ground) <= 3) lift.push(levelOf(pixelAt(shot, x, y)) - levelOf(r));
  }
  const spread = lift.length === 0 ? Number.NaN : Math.max(...lift) - Math.min(...lift);
  out.push(
    check(
      'no seam (varies < 1 % of the range along its middle)',
      lift.length > 0 && spread <= 2.55,
      `${lift.length} px, lift ${fixed(Math.min(...lift), 1)}-${fixed(Math.max(...lift), 1)} levels`,
    ),
  );
  const above = bands.filter((b) => centre !== null && b.end <= centre.start).at(-1);
  const below = bands.find((b) => centre !== null && b.start >= centre.end);
  out.push(
    check(
      'clear of the lines above and below',
      (above === undefined || band.y0 >= above.end) && (below === undefined || band.y1 <= below.start),
      `band rows ${band.y0}-${band.y1}; above ends ${above?.end ?? '-'}, below starts ${below?.start ?? '-'}`,
    ),
  );
  out.push(look('soft rounded ends'));
  return out;
};

/** V11: a word wash on 1:2:4 holds the marks under its letters, and keeps off the next line. */
export const checkWordWash = (images: CaseImages, id: string, format: keyof typeof GEOMETRY): CheckResult[] => {
  const g = scaled(format, 1);
  const shot = images.still(id, 66);
  const ref = images.still(`${id}-ref`, 66);
  if (shot === null || ref === null) return [missing('stills', `${id} and ${id}-ref f66`)];
  const ground = rgbOf(INKS.charcoal.ground);
  const band = diffBox(shot, ref, 3);
  if (band === null) return [check('a band', false, 'nothing differs from the reference')];
  const bands = lineBands(ref, ground, g.lineBox, 8);
  const centre = bandNear(bands, (band.y0 + band.y1) / 2);
  const below = bands.find((b) => centre !== null && b.start >= centre.end);
  const word = inkBox(
    ref,
    {x0: band.x0, y0: centre?.start ?? band.y0, x1: band.x1, y1: centre?.end ?? band.y1},
    ground,
  );
  return [
    check(
      'marks below the letters inside the band',
      word !== null && word.y1 <= band.y1 + 1,
      `word ink to row ${word?.y1 ?? '-'}, band to ${band.y1}`,
    ),
    check(
      'the band never touches the next line',
      below === undefined || band.y1 < below.start,
      `band to ${band.y1}, next line from ${below?.start ?? '-'}`,
    ),
  ];
};

/** V12: the jadwal at the safe area at 0.45, ayah 2 full, the line below at the neighbour opacity. */
export const checkJadwal = (images: CaseImages): CheckResult[] => {
  const g = scaled('landscape', 0.5);
  const shot = images.still('V12', 60);
  if (shot === null) return [missing('still', 'V12 f60')];
  const ground = rgbOf(INKS.green.ground);
  const metal = rgbOf('#cfae63');
  const y = Math.round(shot.height / 2);
  const span = levelOf(metal) - levelOf(ground);
  let strongest = 0;
  let strongestX = -1;
  let outer = 0;
  for (let x = Math.floor(g.safe) - 3; x <= Math.ceil(g.safe) + 1; x++) {
    const a = (levelOf(pixelAt(shot, x, y)) - levelOf(ground)) / span;
    outer += Math.max(0, a);
    if (a > strongest) {
      strongest = a;
      strongestX = x;
    }
  }
  const out = [
    check('rule at the safe area', Math.abs(strongestX - g.safe) <= 2, `strongest at x ${strongestX} (safe ${g.safe})`),
    check(
      'gold at 0.45',
      Math.abs(outer - 0.45) <= 0.15,
      `the outer rule's 2 px (1 at half scale) carry ${fixed(outer)} of the metal`,
    ),
  ];
  const bands = lineBands(shot, ground, g.lineBox).filter(
    (b) => b.start > g.safe + 4 && b.end < shot.height - g.safe - 4,
  );
  const centre = bandNear(bands, shot.height / 2);
  const below = bands.find((b) => centre !== null && b.start >= centre.end);
  const ink = rgbOf(INKS.green.ink);
  const inner = (b: Band): Rect => ({x0: g.safe + 6, y0: b.start, x1: shot.width - g.safe - 6, y1: b.end});
  if (centre !== null) {
    const o = opacityIn(shot, inner(centre), ground, ink);
    out.push(check('ayah 2 full', o >= 0.9, `opacity ${fixed(o)}`));
  }
  if (below !== undefined) {
    const o = opacityIn(shot, inner(below), ground, ink);
    out.push(check('the line below at 0.25', Math.abs(o - 0.25) <= 0.08, `opacity ${fixed(o)}`));
  }
  return out;
};

/** V13: the legend one centred row in a band of its own, under the lines or the page. */
export const checkLegend = (images: CaseImages, id: string): CheckResult[] => {
  const g = scaled('landscape', 0.5);
  const shot = images.still(id, 60);
  if (shot === null) return [missing('still', `${id} f60`)];
  const ground = rgbOf(INKS.paper.ground);
  const bands = lineBands(shot, ground, g.lineBox * 0.25, 10);
  const legend = bands.at(-1);
  const above = bands.at(-2);
  if (legend === undefined || above === undefined) return [missing('legend', 'fewer than two bands')];
  const box = inkBox(shot, rowsRect(shot, legend), ground);
  const centre = box === null ? Number.NaN : (box.x0 + box.x1) / 2;
  return [
    check(
      'one row in a band of its own',
      legend.end - legend.start <= 0.35 * g.lineBox && legend.start > above.end,
      `legend rows ${legend.start}-${legend.end}, the text above ends ${above.end}`,
    ),
    check('centred', Math.abs(centre - shot.width / 2) <= 0.03 * shot.width, `centre x ${fixed(centre, 0)}`),
    look('pastels not washed out'),
  ];
};

/** V14: the translation centred, under half the Arabic, at most two lines; changed by f110. */
export const checkTranslation = (images: CaseImages, id: string, format: keyof typeof GEOMETRY): CheckResult[] => {
  const g = scaled(format, 0.5);
  const f60 = images.still(id, 60);
  const f110 = images.still(id, 110);
  if (f60 === null || f110 === null) return [missing('stills', `${id} f60, f110`)];
  const ground = rgbOf(INKS.ivory.ground);
  const size = (format === 'landscape' ? 36 : 26) * 0.5;
  const bands = lineBands(f60, ground, g.lineBox * 0.3, 10);
  const centre = bandNear(bands, f60.height / 2);
  const text = bands.filter((b) => centre !== null && b.start > centre.end && b.end - b.start < 0.45 * g.lineBox);
  if (text.length === 0) return [missing('translation', 'no small text under the lines')];
  const box = inkBox(f60, {x0: 0, y0: text[0]?.start ?? 0, x1: f60.width, y1: text.at(-1)?.end ?? 0}, ground);
  const heights = text.map((b) => b.end - b.start);
  const tallest = Math.max(...heights);
  const changed = box === null ? 0 : maxDiffIn(f60, f110, box);
  return [
    check('at most 2 lines', text.length <= 2, `${text.length} lines, ${heights.join('/')} px tall`),
    check(
      `${size * 2} px (half scale ${size})`,
      tallest >= 0.75 * size && tallest <= 1.4 * size,
      `tallest line ${tallest} px of ink`,
    ),
    check(
      'centred',
      box !== null && Math.abs((box.x0 + box.x1) / 2 - f60.width / 2) <= 0.03 * f60.width,
      `x ${box?.x0}-${box?.x1}`,
    ),
    check('changed by f110 (after ayah 2)', changed > 20, `largest change ${changed}`),
    look('EB Garamond 500'),
  ];
};

/** V15: the intro card on the bare ground, gone by the first word, and the video longer by the delay. */
export const checkIntro = (images: CaseImages): CheckResult[] => {
  const g = scaled('landscape', 0.5);
  const ground = rgbOf(INKS.ivory.ground);
  const ink = rgbOf(INKS.ivory.ink);
  const f0 = images.still('V15', 0);
  const f30 = images.still('V15', 30);
  const first = images.still('V15', 126);
  if (f0 === null || f30 === null || first === null) return [missing('stills', 'V15 f0, f30, f126')];
  let bare = 0;
  for (let y = 0; y < f0.height; y++) {
    for (let x = 0; x < f0.width; x++) bare = Math.max(bare, channelDistance(pixelAt(f0, x, y), ground));
  }
  const card = inkBox(f30, {x0: 0, y0: 0, x1: f30.width, y1: f30.height}, ground);
  const centre = centreBand(first, ground, g.lineBox);
  // Settled: in place and at rest (0.6) before the first word fills.
  const settled = centre === null ? 0 : opacityIn(first, rowsRect(first, centre), ground, ink);
  const withCard = images.duration('V15');
  const without = images.duration('V1');
  const delay = Math.round((3 + 0.8 + 0.4 - 0.331) * 30);
  return [
    check('f0 bare ground', bare <= 3, `largest difference from the ground ${bare}`),
    check('f30 the card', card !== null, `card ink ${JSON.stringify(card)}`),
    check(
      'the lines settled at the first word (f126)',
      Math.abs(settled - 0.6) <= 0.05,
      `centre line at ${fixed(settled)} (at rest: 0.6)`,
    ),
    check(
      'longer by introDelaySeconds',
      withCard !== null && without !== null && Math.abs(withCard - without - delay) <= 2,
      `${withCard ?? '-'} frames against ${without ?? '-'} (delay ${delay} frames)`,
    ),
    look('cartouche, hairline and lozenge, «الآيات ٢–٧» with ٢ on the right'),
  ];
};

/** V16: the corner label and the counter, inside the safe area, plain text. */
export const checkCorners = (images: CaseImages): CheckResult[] => {
  const g = scaled('landscape', 0.5);
  const shot = images.still('V16', 150);
  if (shot === null) return [missing('still', 'V16 f150')];
  const ground = rgbOf(INKS.ivory.ground);
  const corner = (x0: number, x1: number): Rect | null =>
    inkBox(shot, {x0, y0: 0, x1, y1: Math.round(shot.height * 0.2)}, ground, 20);
  const label = corner(shot.width / 2, shot.width);
  const counter = corner(0, shot.width / 2);
  const inside = (r: Rect | null): boolean =>
    r !== null && r.x0 >= g.safe - 1 && r.y0 >= g.safe - 1 && r.x1 <= shot.width - g.safe + 1;
  const fill = (r: Rect | null): number => {
    if (r === null) return 1;
    let painted = 0;
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) if (channelDistance(pixelAt(shot, x, y), ground) > 4) painted++;
    }
    return painted / ((r.x1 - r.x0) * (r.y1 - r.y0));
  };
  return [
    check('corner label inside the safe area', inside(label), `label ${JSON.stringify(label)}`),
    check('counter opposite, inside the safe area', inside(counter), `counter ${JSON.stringify(counter)}`),
    check(
      'no pill',
      fill(label) < 0.6 && fill(counter) < 0.6,
      `painted ${fixed(fill(label))} and ${fixed(fill(counter))}`,
    ),
    look('small caps, "AL-FATIHAH · 2", "2 / 3"'),
  ];
};

/** V17: the lines held, then fading, then the credits card on the same ground. */
export const checkEnd = (images: CaseImages, lastWordEnd: number): CheckResult[] => {
  const g = scaled('landscape', 0.5);
  const ground = rgbOf(INKS.ivory.ground);
  const ink = rgbOf(INKS.ivory.ink);
  const held = images.still('V17', lastWordEnd + 15);
  const fading = images.still('V17', lastWordEnd + 60);
  const card = images.still('V17', lastWordEnd + 90);
  if (held === null || fading === null || card === null) return [missing('stills', 'V17 +0.5 s, +2 s, +3 s')];
  const centre = centreBand(held, ground, g.lineBox);
  if (centre === null) return [missing('lines', 'no line at +0.5 s')];
  const rows = rowsRect(held, centre);
  const h = opacityIn(held, rows, ground, ink);
  const f = opacityIn(fading, rows, ground, ink);
  const sameGround = [held, fading, card].every((s) => channelDistance(groundColorOf(s), ground) <= 3);
  return [
    check('held at +0.5 s', h >= 0.95, `opacity ${fixed(h)}`),
    check('fading at +2 s', f > 0.1 && f < 0.9, `opacity ${fixed(f)}`),
    check(
      'the card at +3 s',
      inkBox(card, {x0: 0, y0: 0, x1: card.width, y1: card.height}, ground) !== null,
      'ink on the card',
    ),
    check('the same ground', sameGround, 'corners of the three frames'),
    look('the surah-name title once'),
  ];
};

/** V18: the page's height, its band, and the band's cross-fade from line to line. */
export const checkPage = (images: CaseImages): CheckResult[] => {
  const shot = images.still('V18', 60);
  const ref = images.still('V18-ref', 60);
  if (shot === null || ref === null) return [missing('stills', 'V18 and V18-ref f60')];
  const ground = rgbOf(INKS.ivory.ground);
  const page = inkBox(ref, {x0: 0, y0: 0, x1: ref.width, y1: ref.height}, ground, 20);
  const share = page === null ? 0 : (page.y1 - page.y0) / ref.height;
  const out = [
    check('page at most 92 % of the height', share >= 0.85 && share <= 0.925, `page ${fixed(share * 100, 1)} %`),
    check('a band on the line being recited', diffBox(shot, ref, 2) !== null, 'differs from the page without a band'),
  ];
  const strengths: number[][] = [];
  let rows: Band[] = [];
  for (let f = 100; f <= 114; f++) {
    const s = images.strip('V18', f);
    const r = images.strip('V18-ref', f);
    if (s === null || r === null) return [...out, missing('strip', `V18 f${f}`)];
    const profile: number[] = [];
    for (let y = 0; y < s.height; y++) {
      let sum = 0;
      for (let x = 0; x < s.width; x++) sum += channelDistance(pixelAt(s, x, y), pixelAt(r, x, y));
      profile.push(sum);
    }
    if (f === 100 || f === 114) rows = [...rows, ...bandsOf(profile, {min: 0.5 * Math.max(...profile), gap: 4})];
    strengths.push(profile);
  }
  const lines = rows.filter((b, i) => rows.findIndex((o) => o.start === b.start) === i);
  const series = lines.map((b) => strengths.map((p) => p.slice(b.start, b.end).reduce((a, v) => a + v, 0)));
  const detail = series.map((s) => s.map((v) => fixed(v / Math.max(...s, 1))).join(' ')).join(' | ');
  const jumps = series.map((s) => {
    const max = Math.max(...s, 1);
    return Math.max(0, ...s.slice(1).map((v, i) => Math.abs(v - (s[i] ?? 0)) / max));
  });
  out.push(
    check(
      'the band cross-fades between lines',
      lines.length >= 2 && jumps.every((j) => j <= 0.6),
      `${lines.length} lines; largest step ${fixed(Math.max(0, ...jumps) * 100, 0)} % of a band (f100-f114: ${detail})`,
    ),
    look('double rule, no corner dots'),
    look('turn: a dissolve after the last word', 'the sample is one page: no turn to see'),
  );
  return out;
};

/** The two white stripes of the backdrop in a row, as x centres (left, right). */
const stripesIn = (image: Image, y: number): [number, number] | null => {
  const half = image.width / 2;
  const peak = (x0: number, x1: number): number => {
    let best = x0;
    for (let x = x0; x < x1; x++) if (levelOf(pixelAt(image, x, y)) > levelOf(pixelAt(image, best, y))) best = x;
    return best;
  };
  const l = peak(0, half);
  const r = peak(half, image.width);
  return l === r ? null : [l, r];
};

/** V19: the image dimmed, a vignette, a slow zoom no larger than 1.05. */
export const checkBackground = (images: CaseImages, backdrop: string): CheckResult[] => {
  const f0 = images.still('V19', 0);
  const duration = images.duration('V19');
  const last = duration === null ? null : images.still('V19', duration - 1);
  const source = images.asset(backdrop);
  if (f0 === null || last === null || source === null) return [missing('stills', 'V19 f0, last frame, backdrop')];
  const at = (img: Image, fx: number, fy: number): Rgb =>
    pixelAt(img, Math.round(fx * (img.width - 1)), Math.round(fy * (img.height - 1)));
  const ratio = (fx: number, fy: number): number => levelOf(at(f0, fx, fy)) / Math.max(1, levelOf(at(source, fx, fy)));
  const middle = ratio(0.5, 0.5);
  const edge = ratio(0.01, 0.01);
  const y = Math.round(f0.height * 0.12);
  const before = stripesIn(f0, y);
  const after = stripesIn(last, y);
  const zoom = before === null || after === null ? Number.NaN : (after[1] - after[0]) / (before[1] - before[0]);
  return [
    check('dimmed ≥ 0.45', middle <= 0.55 + 0.03, `the image at ${fixed(middle)} of its level in the middle`),
    check('vignette visible', edge < middle * 0.9, `corner ${fixed(edge)} against ${fixed(middle)}`),
    check('zoom ≤ 1.05 at the end', zoom > 1 && zoom <= 1.055, `stripes ${before} → ${after}: ${fixed(zoom, 3)}`),
    look('no banding'),
  ];
};

/** V20: a wash per word on the ayah text, and the ayah dissolve never blank. */
export const checkAyahText = (images: CaseImages): CheckResult[] => {
  const shot = images.still('V20', 60);
  const ref = images.still('V20-ref', 60);
  if (shot === null || ref === null) return [missing('stills', 'V20 and V20-ref f60')];
  const band = diffBox(shot, ref, 3);
  const block = inkBox(ref, {x0: 0, y0: 0, x1: ref.width, y1: ref.height}, rgbOf(INKS.charcoal.ground));
  const words = band === null ? [] : diffColumnBands(shot, ref, band, 3, 2);
  const dissolve = checkDissolve(images, 'V20', {
    from: 96,
    to: 130,
    ground: INKS.charcoal.ground,
    ink: INKS.charcoal.ink,
  }).checks.filter((c) => !c.name.startsWith('line 1'));
  return [
    check(
      'a wash per word, not the ayah',
      band !== null && block !== null && words.length <= 2 && band.x1 - band.x0 < 0.6 * (block.x1 - block.x0),
      `${words.length} washed runs (the word and its trail) over ${band === null ? 0 : band.x1 - band.x0} of ${block === null ? 0 : block.x1 - block.x0} px`,
    ),
    ...dissolve,
    look('no lone word on the last line, word spacing 0.1 em'),
  ];
};

/** Every case's checks, by id (references have none of their own). */
export const CHECKS: Readonly<Record<string, (images: CaseImages) => CheckResult[]>> = {
  V1: checkV1,
  V2: checkV2,
  V3: (i) => checkScroll(i, 'V3', 140, 24),
  'V3-slow': (i) => checkScroll(i, 'V3-slow', 150, 34),
  V4: (i) => checkDissolve(i, 'V4', {from: 96, to: 130, ...INKS.ivory}).checks,
  'V4-slow': (i) => checkDissolve(i, 'V4-slow', {from: 96, to: 135, ...INKS.ivory}).checks,
  V5: (i) => {
    const d = checkDissolve(i, 'V5', {from: 96, to: 130, ...INKS.ivory, shift: 8});
    return [
      ...d.checks,
      check('rises ≤ 6 px at half scale', d.maxRise <= 6 && d.maxRise > 0, `largest offset ${d.maxRise} px`),
      check('the outgoing line does not move', d.outgoingMoved === 0, `moved ${d.outgoingMoved} px`),
    ];
  },
  'V6-mushaf': (i) => checkRosettes(i, 'V6-mushaf'),
  'V6-haram-night': (i) => checkRosettes(i, 'V6-haram-night'),
  'V6-madinah-green': (i) => checkRosettes(i, 'V6-madinah-green'),
  V7: (i) => checkTint(i, 'V7', '#806321'),
  V8: checkTintAsWash,
  V9: (i) => checkTint(i, 'V9', '#806321'),
  V10: (i) => checkAyahWash(i, 'V10', 'landscape'),
  'V10-vertical': (i) => checkAyahWash(i, 'V10-vertical', 'vertical'),
  V11: (i) => checkWordWash(i, 'V11', 'landscape'),
  'V11-vertical': (i) => checkWordWash(i, 'V11-vertical', 'vertical'),
  V12: checkJadwal,
  V13: (i) => checkLegend(i, 'V13'),
  'V13-page': (i) => checkLegend(i, 'V13-page'),
  V14: (i) => checkTranslation(i, 'V14', 'landscape'),
  'V14-vertical': (i) => checkTranslation(i, 'V14-vertical', 'vertical'),
  V15: checkIntro,
  V16: checkCorners,
  V17: (i) => checkEnd(i, 827),
  V18: checkPage,
  V19: (i) => checkBackground(i, 'design/backdrop.png'),
  V20: checkAyahText,
};

/** A case's verdict: every measured check passes; `null` when nothing could be measured. */
export const verdictOf = (checks: readonly CheckResult[]): boolean | null => {
  const measured = checks.filter((c) => c.pass !== null);
  return measured.length === 0 ? null : measured.every((c) => c.pass === true);
};

/** Runs the checks of `ids` (every case with checks when empty) on `images`. */
export const runChecks = (images: CaseImages, ids: readonly string[] = []): CaseReport[] =>
  Object.entries(CHECKS)
    .filter(([id]) => ids.length === 0 || ids.includes(id))
    .map(([id, run]) => {
      let checks: CheckResult[];
      try {
        checks = run(images);
      } catch (error) {
        checks = [check('measure', false, error instanceof Error ? error.message : String(error))];
      }
      return {id, pass: verdictOf(checks), checks};
    });

/** The reports as the table the command prints. */
export const formatReports = (reports: readonly CaseReport[]): string =>
  reports
    .map((r) => {
      const head = `${r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'LOOK'}  ${r.id}`;
      const lines = r.checks.map(
        (c) => `      ${c.pass === true ? 'ok  ' : c.pass === false ? 'FAIL' : 'look'} ${c.name}: ${c.detail}`,
      );
      return [head, ...lines].join('\n');
    })
    .join('\n');

/** The images of a round's folder, as `design-stills.ts` writes it, read once each. */
export const folderImages = (dir: string): CaseImages => {
  const cache = new Map<string, Image | null>();
  const read = (file: string): Image | null => {
    if (!cache.has(file)) cache.set(file, existsSync(file) ? decodePng(readFileSync(file)) : null);
    return cache.get(file) ?? null;
  };
  const durations: Record<string, number> = existsSync(path.join(dir, 'durations.json'))
    ? (JSON.parse(readFileSync(path.join(dir, 'durations.json'), 'utf8')) as Record<string, number>)
    : {};
  const stripDir = (id: string): string => path.join(dir, `${id}-strip`);
  return {
    still: (id, frame) => read(path.join(dir, `${id}-f${String(frame).padStart(3, '0')}.png`)),
    strip: (id, frame) => {
      const folder = stripDir(id);
      if (!existsSync(folder)) return null;
      const file = readdirSync(folder).find((name) => Number(/(\d+)\.png$/.exec(name)?.[1]) === frame);
      return file === undefined ? null : read(path.join(folder, file));
    },
    duration: (id) => durations[id] ?? null,
    asset: (file) => read(path.join(dir, 'public', file)),
  };
};

if (import.meta.main) {
  const [dir, ...ids] = process.argv.slice(2);
  if (dir === undefined || dir === '-h' || dir === '--help') {
    console.log('Usage: bun scripts/design-check.ts <round folder> [case ids...]');
    process.exit(dir === undefined ? 2 : 0);
  }
  const reports = runChecks(folderImages(dir), ids);
  console.log(formatReports(reports));
  writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(reports, null, 2)}\n`);
  const passed = reports.filter((r) => r.pass === true).map((r) => r.id);
  console.log(`\n${passed.length} of ${reports.length} cases pass: ${passed.join(' ')}`);
}

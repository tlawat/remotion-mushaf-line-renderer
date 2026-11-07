// The pixel half of the design checker (`scripts/design-check.ts`): a PNG reader and writer for the
// stills Remotion renders, the colour arithmetic of the criteria (CIE Lab and ΔE2000) and the
// measurements they are made of (the ground, an opacity, ink rows and bands, a difference box, the
// share of two references in a dissolve). Pure functions of their arguments, with no file system,
// so that scripts/design-image.test.ts can pin them down on images built in memory. Dev only.
import {deflateSync, inflateSync} from 'node:zlib';

/** An image as 8-bit RGBA rows, top to bottom. */
export type Image = {readonly width: number; readonly height: number; readonly data: Uint8Array};

/** A colour as sRGB channels 0-255. */
export type Rgb = {readonly r: number; readonly g: number; readonly b: number};

/** A rectangle in pixels: `x0`/`y0` included, `x1`/`y1` excluded. */
export type Rect = {readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number};

/** A run of rows (or columns) with ink: `start` included, `end` excluded. */
export type Band = {readonly start: number; readonly end: number};

/** A failure of the image code: a PNG it cannot read, a rectangle outside the image. */
export class DesignImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignImageError';
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Channels per pixel of the PNG colour types read here: grey, RGB, grey + alpha, RGBA. */
const CHANNELS: Readonly<Record<number, number>> = {0: 1, 2: 3, 4: 2, 6: 4};

/**
 * Reads an 8-bit, non-interlaced PNG (what `remotion still` and ffmpeg write) as RGBA. Anything
 * else (16-bit, palette, interlaced) is a `DesignImageError` naming what it found.
 */
export const decodePng = (file: Uint8Array): Image => {
  const bytes = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new DesignImageError('not a PNG file');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      colorType = body[9] ?? -1;
      const interlace = body[12];
      if (depth !== 8 || CHANNELS[colorType] === undefined || interlace !== 0) {
        throw new DesignImageError(
          `unsupported PNG: bit depth ${depth}, colour type ${colorType}, interlace ${interlace}`,
        );
      }
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const channels = CHANNELS[colorType];
  if (channels === undefined || width === 0 || height === 0) throw new DesignImageError('PNG without a header');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const from = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const value = raw[from + x] ?? 0;
      const left = x >= channels ? (rows[y * stride + x - channels] ?? 0) : 0;
      const up = y > 0 ? (rows[(y - 1) * stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= channels ? (rows[(y - 1) * stride + x - channels] ?? 0) : 0;
      const predicted =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? (left + up) >> 1
              : filter === 4
                ? paeth(left, up, upLeft)
                : 0;
      rows[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const grey = channels <= 2;
    data[i * 4] = rows[s] ?? 0;
    data[i * 4 + 1] = grey ? (rows[s] ?? 0) : (rows[s + 1] ?? 0);
    data[i * 4 + 2] = grey ? (rows[s] ?? 0) : (rows[s + 2] ?? 0);
    data[i * 4 + 3] = channels === 4 ? (rows[s + 3] ?? 255) : channels === 2 ? (rows[s + 1] ?? 255) : 255;
  }
  return {width, height, data};
};

const chunk = (type: string, body: Uint8Array): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
};

/** Writes an image as an 8-bit RGBA PNG (no filtering): the backdrop of still V19, the tests' fixtures. */
export const encodePng = (image: Image): Uint8Array => {
  const {width, height, data} = image;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
};

/** A blank image of one colour. */
export const solidImage = (width: number, height: number, color: Rgb): Image => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([color.r, color.g, color.b, 255], i * 4);
  return {width, height, data};
};

/** The pixel at (x, y). */
export const pixelAt = (image: Image, x: number, y: number): Rgb => {
  const i = (y * image.width + x) * 4;
  return {r: image.data[i] ?? 0, g: image.data[i + 1] ?? 0, b: image.data[i + 2] ?? 0};
};

/** `#rrggbb` as channels; a `DesignImageError` for anything else. */
export const rgbOf = (hex: string): Rgb => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null) throw new DesignImageError(`not a #rrggbb colour: ${hex}`);
  const n = Number.parseInt(match[1] ?? '0', 16);
  return {r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff};
};

/** Channels as `#rrggbb`. */
export const hexOf = ({r, g, b}: Rgb): string =>
  `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** The mean of the three channels, 0-255: the "level" the criteria compare. */
export const levelOf = ({r, g, b}: Rgb): number => (r + g + b) / 3;

/** The largest channel difference of two colours. */
export const channelDistance = (a: Rgb, b: Rgb): number =>
  Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));

const linear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** CIE L*a*b* (D65) of an sRGB colour. */
export const labOf = ({r, g, b}: Rgb): {readonly l: number; readonly a: number; readonly b: number} => {
  const [R, G, B] = [linear(r), linear(g), linear(b)];
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116);
  return {l: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z))};
};

/** CIEDE2000 colour difference: about 1 is the smallest difference an eye sees side by side. */
export const deltaE2000 = (first: Rgb, second: Rgb): number => {
  const p = labOf(first);
  const q = labOf(second);
  const rad = Math.PI / 180;
  const c1 = Math.hypot(p.a, p.b);
  const c2 = Math.hypot(q.a, q.b);
  const cMean = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7)));
  const a1 = (1 + g) * p.a;
  const a2 = (1 + g) * q.a;
  const c1p = Math.hypot(a1, p.b);
  const c2p = Math.hypot(a2, q.b);
  const hue = (bb: number, aa: number): number => {
    if (bb === 0 && aa === 0) return 0;
    const h = Math.atan2(bb, aa) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1 = hue(p.b, a1);
  const h2 = hue(q.b, a2);
  const dL = q.l - p.l;
  const dC = c2p - c1p;
  let dh = 0;
  if (c1p * c2p !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh / 2) * rad);
  const lMean = (p.l + q.l) / 2;
  const cpMean = (c1p + c2p) / 2;
  let hMean = h1 + h2;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1 - h2) <= 180) hMean = (h1 + h2) / 2;
    else hMean = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hMean - 30) * rad) +
    0.24 * Math.cos(2 * hMean * rad) +
    0.32 * Math.cos((3 * hMean + 6) * rad) -
    0.2 * Math.cos((4 * hMean - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hMean - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cpMean ** 7 / (cpMean ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sc = 1 + 0.045 * cpMean;
  const sh = 1 + 0.015 * cpMean * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
};

/** Chroma and hue (degrees) of a colour in CIE LCh: the "is it coloured, and which colour" test. */
export const chromaHueOf = (color: Rgb): {readonly chroma: number; readonly hue: number} => {
  const {a, b} = labOf(color);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return {chroma: Math.hypot(a, b), hue: hue < 0 ? hue + 360 : hue};
};

/** The whole image as a rectangle. */
export const fullRect = (image: Image): Rect => ({x0: 0, y0: 0, x1: image.width, y1: image.height});

const clampRect = (image: Image, rect: Rect): Rect => ({
  x0: Math.max(0, Math.floor(rect.x0)),
  y0: Math.max(0, Math.floor(rect.y0)),
  x1: Math.min(image.width, Math.ceil(rect.x1)),
  y1: Math.min(image.height, Math.ceil(rect.y1)),
});

/** The median colour of the four corner patches (`size` px square): the page, where nothing is drawn. */
export const groundColorOf = (image: Image, size = 8): Rgb => {
  const values: Rgb[] = [];
  const s = Math.min(size, image.width, image.height);
  for (const [cx, cy] of [
    [0, 0],
    [image.width - s, 0],
    [0, image.height - s],
    [image.width - s, image.height - s],
  ] as const) {
    for (let y = cy; y < cy + s; y++) for (let x = cx; x < cx + s; x++) values.push(pixelAt(image, x, y));
  }
  const median = (pick: (c: Rgb) => number): number => {
    const sorted = values.map(pick).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  return {r: median((c) => c.r), g: median((c) => c.g), b: median((c) => c.b)};
};

/**
 * How far each pixel of `rect` is from the ground toward the ink, 0 (ground) to 1 (ink), by level:
 * the coverage the ink-row, opacity and dissolve measures read.
 */
export const coverageOf = (image: Image, rect: Rect, ground: Rgb, ink: Rgb): Float32Array => {
  const r = clampRect(image, rect);
  const span = levelOf(ink) - levelOf(ground);
  const out = new Float32Array((r.x1 - r.x0) * (r.y1 - r.y0));
  let i = 0;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      out[i++] = span === 0 ? 0 : (levelOf(pixelAt(image, x, y)) - levelOf(ground)) / span;
    }
  }
  return out;
};

/**
 * The opacity of the ink in `rect`: the coverage of its most inked pixels (the `quantile` from the
 * top, 0.2 % by default, so a stroke's solid core counts and its antialiased edge does not). A word
 * at rest 0.6 on ivory reads 0.6; an empty rectangle reads about 0.
 */
export const opacityIn = (image: Image, rect: Rect, ground: Rgb, ink: Rgb, quantile = 0.002): number => {
  const values = Array.from(coverageOf(image, rect, ground, ink)).sort((a, b) => b - a);
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.floor(values.length * quantile))] ?? 0;
};

/** The colour of the most inked pixel of `rect` (the darkest on a light ground, the lightest on a dark one). */
export const inkiestPixel = (image: Image, rect: Rect, ground: Rgb): Rgb => {
  const r = clampRect(image, rect);
  let best = ground;
  let bestDistance = -1;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const c = pixelAt(image, x, y);
      const d = Math.abs(levelOf(c) - levelOf(ground));
      if (d > bestDistance) {
        best = c;
        bestDistance = d;
      }
    }
  }
  return best;
};

/** Per row of `rect`: how many pixels differ from the ground by more than `threshold` levels. */
export const inkRowProfile = (image: Image, rect: Rect, ground: Rgb, threshold = 12): number[] => {
  const r = clampRect(image, rect);
  const profile: number[] = [];
  for (let y = r.y0; y < r.y1; y++) {
    let count = 0;
    for (let x = r.x0; x < r.x1; x++)
      if (Math.abs(levelOf(pixelAt(image, x, y)) - levelOf(ground)) > threshold) count++;
    profile.push(count);
  }
  return profile;
};

/** Per column of `rect`, as `inkRowProfile()` per row. */
export const inkColumnProfile = (image: Image, rect: Rect, ground: Rgb, threshold = 12): number[] => {
  const r = clampRect(image, rect);
  const profile: number[] = [];
  for (let x = r.x0; x < r.x1; x++) {
    let count = 0;
    for (let y = r.y0; y < r.y1; y++)
      if (Math.abs(levelOf(pixelAt(image, x, y)) - levelOf(ground)) > threshold) count++;
    profile.push(count);
  }
  return profile;
};

/**
 * The runs of a profile above `min`, joined across gaps shorter than `gap` (a line's vowel marks sit
 * apart from its letters) and offset by `origin`, so they are image coordinates.
 */
export const bandsOf = (profile: readonly number[], {min = 0, gap = 1, origin = 0} = {}): Band[] => {
  const bands: Band[] = [];
  let start = -1;
  let lastInk = -1;
  profile.forEach((value, i) => {
    if (value > min) {
      if (start < 0) start = i;
      else if (i - lastInk > gap) {
        bands.push({start: start + origin, end: lastInk + 1 + origin});
        start = i;
      }
      lastInk = i;
    }
  });
  if (start >= 0) bands.push({start: start + origin, end: lastInk + 1 + origin});
  return bands;
};

/** The box of the pixels of `rect` that differ from the ground by more than `threshold` levels, or null. */
export const inkBox = (image: Image, rect: Rect, ground: Rgb, threshold = 12): Rect | null => {
  const r = clampRect(image, rect);
  const rows = bandsOf(inkRowProfile(image, r, ground, threshold), {gap: r.y1, origin: r.y0});
  const cols = bandsOf(inkColumnProfile(image, r, ground, threshold), {gap: r.x1, origin: r.x0});
  const row = rows[0];
  const col = cols[0];
  return row && col ? {x0: col.start, y0: row.start, x1: col.end, y1: row.end} : null;
};

/** The box of the pixels where two images of one size differ by more than `threshold` (largest channel), or null. */
export const diffBox = (a: Image, b: Image, threshold = 6, rect: Rect = fullRect(a)): Rect | null => {
  if (a.width !== b.width || a.height !== b.height) throw new DesignImageError('the images differ in size');
  const r = clampRect(a, rect);
  let box: {x0: number; y0: number; x1: number; y1: number} | null = null;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (channelDistance(pixelAt(a, x, y), pixelAt(b, x, y)) > threshold) {
        if (box === null) box = {x0: x, y0: y, x1: x + 1, y1: y + 1};
        else {
          box.x0 = Math.min(box.x0, x);
          box.y0 = Math.min(box.y0, y);
          box.x1 = Math.max(box.x1, x + 1);
          box.y1 = Math.max(box.y1, y + 1);
        }
      }
    }
  }
  return box;
};

/** The columns where two images differ by more than `threshold`, as runs joined across gaps under `gap`. */
export const diffColumnBands = (a: Image, b: Image, rect: Rect, threshold = 6, gap = 4): Band[] => {
  const r = clampRect(a, rect);
  const profile: number[] = [];
  for (let x = r.x0; x < r.x1; x++) {
    let count = 0;
    for (let y = r.y0; y < r.y1; y++) if (channelDistance(pixelAt(a, x, y), pixelAt(b, x, y)) > threshold) count++;
    profile.push(count);
  }
  return bandsOf(profile, {gap, origin: r.x0});
};

/** The largest channel difference of two images over `rect`. */
export const maxDiffIn = (a: Image, b: Image, rect: Rect): number => {
  const r = clampRect(a, rect);
  let max = 0;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) max = Math.max(max, channelDistance(pixelAt(a, x, y), pixelAt(b, x, y)));
  }
  return max;
};

/** The coverage of `image` over `rect` with its content moved down by `dy` px; rows from outside the image are ground. */
const shiftedCoverage = (image: Image, rect: Rect, dy: number, ground: Rgb, ink: Rgb): Float32Array => {
  const span = levelOf(ink) - levelOf(ground);
  const out = new Float32Array((rect.x1 - rect.x0) * (rect.y1 - rect.y0));
  let i = 0;
  for (let y = rect.y0; y < rect.y1; y++) {
    const from = y - dy;
    for (let x = rect.x0; x < rect.x1; x++) {
      out[i++] =
        from < 0 || from >= image.height || span === 0
          ? 0
          : (levelOf(pixelAt(image, x, from)) - levelOf(ground)) / span;
    }
  }
  return out;
};

/** A frame of a dissolve as the share of its two references (`dissolveShares()`). */
export type DissolveFit = {readonly a: number; readonly b: number; readonly dy: number; readonly residual: number};

/**
 * The share of two references in a frame of a dissolve between them: the coverage of `frame` over
 * `rect`, fitted by least squares as `a × coverage(first) + b × coverage(second)`. With `shift`, the
 * second reference is also tried moved by -`shift`..`shift` px down, and the best fit says by how
 * much (`dy`, positive when the frame shows it lower: a line still rising into place). The two lines
 * of a one-line dissolve share one place, so their pixels cannot be told apart; their shapes can.
 */
export const dissolveShares = (
  frame: Image,
  first: Image,
  second: Image,
  rect: Rect,
  ground: Rgb,
  ink: Rgb,
  shift = 0,
): DissolveFit => {
  const r = clampRect(frame, rect);
  const f = coverageOf(frame, r, ground, ink);
  const p = coverageOf(first, r, ground, ink);
  let best: DissolveFit = {a: 0, b: 0, dy: 0, residual: Number.POSITIVE_INFINITY};
  for (let dy = -shift; dy <= shift; dy++) {
    const q = shiftedCoverage(second, r, dy, ground, ink);
    let pp = 0;
    let qq = 0;
    let pq = 0;
    let fp = 0;
    let fq = 0;
    for (let i = 0; i < f.length; i++) {
      const pv = p[i] ?? 0;
      const qv = q[i] ?? 0;
      const fv = f[i] ?? 0;
      pp += pv * pv;
      qq += qv * qv;
      pq += pv * qv;
      fp += fv * pv;
      fq += fv * qv;
    }
    const det = pp * qq - pq * pq;
    const a = det === 0 ? 0 : (fp * qq - fq * pq) / det;
    const b = det === 0 ? 0 : (fq * pp - fp * pq) / det;
    let residual = 0;
    for (let i = 0; i < f.length; i++) residual += ((f[i] ?? 0) - a * (p[i] ?? 0) - b * (q[i] ?? 0)) ** 2;
    if (residual < best.residual) best = {a, b, dy, residual};
  }
  return best;
};

/**
 * The backdrop of still V19: a quiet sky (blue-grey above, a warm haze below) with two thin white
 * stripes at 20 % and 80 % of the width, whose distance tells the slow zoom.
 */
export const backdropImage = (width = 1920, height = 1080): Image => {
  const data = new Uint8Array(width * height * 4);
  const top = {r: 93, g: 127, b: 163};
  const bottom = {r: 217, g: 199, b: 168};
  const stripe = Math.max(1, Math.round(width / 640));
  const left = Math.round(width * 0.2);
  const right = Math.round(width * 0.8);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const white = Math.abs(x - left) < stripe || Math.abs(x - right) < stripe;
      const i = (y * width + x) * 4;
      data[i] = white ? 255 : Math.round(top.r + (bottom.r - top.r) * t);
      data[i + 1] = white ? 255 : Math.round(top.g + (bottom.g - top.g) * t);
      data[i + 2] = white ? 255 : Math.round(top.b + (bottom.b - top.b) * t);
      data[i + 3] = 255;
    }
  }
  return {width, height, data};
};

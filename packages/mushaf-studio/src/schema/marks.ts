// The timing model of the marks: when a word or an ayah is marked and how strongly, and when a
// change of line, ayah or page starts. Pure functions of the timings and a time in seconds of the
// recording, so every frame paints the same (docs/mushaf-studio/render-design.md, section 4).
import {normalizeTimings, type RecitationTimings, type WordOccurrence} from '@tlawat/remotion-mushaf-line';
import {INOUT, SOFT, type Tempo, tempoFrames, tempoSeconds} from './tokens';

/** Seconds an ayah's mark holds after the ayah ends, unless the next ayah starts sooner: it lets go in the breath. */
export const RELEASE_SECONDS = 0.25;

/** A word span shorter than this many frames (at 30 fps: 0.133 s) gets no tint or wash of its own. */
export const MIN_SPAN_FRAMES = 4;

/** When an ayah is recited, and when its mark lets go (`release`). */
export type AyahSpan = {
  readonly surah: number;
  readonly ayah: number;
  readonly start: number;
  readonly end: number;
  /** `min(next ayah's start, end + 0.25 s)`; the last ayah: `end + 0.25 s`. */
  readonly release: number;
};

/** When a word carries its tint or wash: from its start to the next timed word of its ayah (the last word: the release). */
export type WordSpan = {
  /** `MushafWord.id`, `"surah:ayah:word"`. */
  readonly id: string;
  readonly surah: number;
  readonly ayah: number;
  readonly start: number;
  readonly end: number;
};

const ayahKey = (surah: number, ayah: number): string => `${surah}:${ayah}`;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Every ayah of the timings in recitation order, with its release. Either version of the timings. */
export const ayahSpans = (timings: RecitationTimings): readonly AyahSpan[] => {
  const ayat = normalizeTimings(timings).ayat;
  return ayat.map((ayah, i) => {
    const next = ayat[i + 1];
    const release = ayah.end + RELEASE_SECONDS;
    return {
      surah: ayah.surah,
      ayah: ayah.ayah,
      start: ayah.start,
      end: ayah.end,
      release: next === undefined ? release : Math.min(next.start, release),
    };
  });
};

/** Whether the timings carry a time for any word; without, `mode: 'word'` behaves as `'ayah'`. */
export const hasWordTimes = (timings: RecitationTimings): boolean =>
  timings.ayat.some((ayah) => (ayah.words?.length ?? 0) > 0);

/** Which entries of a list of ids are the occurrence kept: the first time each id appears, or the last. */
const keptOccurrences = (ids: readonly string[], occurrence: WordOccurrence): readonly boolean[] => {
  const index = new Map<string, number>();
  ids.forEach((id, i) => {
    if (occurrence === 'last' || !index.has(id)) index.set(id, i);
  });
  return ids.map((id, i) => index.get(id) === i);
};

/**
 * When each timed word is heard, by `MushafWord.id`: its `occurrence` (first or last recitation of a
 * repeated word). What the ink fills from; a word the anti-flicker rule drops still fills here.
 */
export const wordStartIndex = (
  timings: RecitationTimings,
  occurrence: WordOccurrence = 'first',
): Readonly<Record<string, number>> => {
  const words = normalizeTimings(timings).ayat.flatMap((ayah) => ayah.words ?? []);
  const kept = keptOccurrences(
    words.map((word) => word.id),
    occurrence,
  );
  const starts: Record<string, number> = {};
  words.forEach((word, i) => {
    if (kept[i]) starts[word.id] = word.start;
  });
  return starts;
};

export type WordSpanOptions = {
  /** Which recitation of a repeated word is marked. Default `'first'`. */
  readonly occurrence?: WordOccurrence | undefined;
};

/**
 * The spans of the tint and wash, in recitation order. A word's span runs from its start to the
 * start of the next timed word in its ayah; the last word's to the ayah's release. A span shorter
 * than 4 frames (0.133 s) is dropped (it would flicker) and the previous kept word of its ayah
 * holds on to its end instead. A word without a time of its own has no span.
 */
export const wordSpans = (timings: RecitationTimings, options: WordSpanOptions = {}): readonly WordSpan[] => {
  const occurrence = options.occurrence ?? 'first';
  // In seconds, whatever the composition's rate: the flicker is in time, not in frames.
  const floor = MIN_SPAN_FRAMES / 30;
  const ayat = ayahSpans(timings);
  const normalised = normalizeTimings(timings).ayat;
  const all = normalised.flatMap((ayah, a) => {
    const words = ayah.words ?? [];
    const release = ayat[a]!.release;
    return words.map((word, i) => ({
      id: word.id,
      surah: ayah.surah,
      ayah: ayah.ayah,
      start: word.start,
      end: Math.max(word.start, words[i + 1]?.start ?? release),
    }));
  });
  const kept = keptOccurrences(
    all.map((span) => span.id),
    occurrence,
  );
  const spans: WordSpan[] = [];
  all.forEach((span, i) => {
    if (!kept[i]) return;
    if (span.end - span.start >= floor - 1e-9) {
      spans.push(span);
      return;
    }
    const previous = spans[spans.length - 1];
    if (previous !== undefined && previous.surah === span.surah && previous.ayah === span.ayah) {
      spans[spans.length - 1] = {...previous, end: Math.max(previous.end, span.end)};
    }
  });
  return spans;
};

/** `wordSpans()` by `MushafWord.id`. */
export const wordSpanIndex = (spans: readonly WordSpan[]): ReadonlyMap<string, WordSpan> =>
  new Map(spans.map((span) => [span.id, span]));

/** `ayahSpans()` by `"surah:ayah"`. */
export const ayahSpanIndex = (spans: readonly AyahSpan[]): ReadonlyMap<string, AyahSpan> =>
  new Map(spans.map((span) => [ayahKey(span.surah, span.ayah), span]));

/**
 * How strongly a word is marked at `seconds`, 0-1: in over `markIn` (5 frames) on `SOFT` from its
 * start, out over `markOut` (10 frames) on `INOUT` from its end. The two neighbours of a change are
 * briefly both partly marked, a glide in place: the mark never travels, and never starts before
 * its word.
 */
export const wordEmphasis = (span: Pick<WordSpan, 'start' | 'end'>, seconds: number): number => {
  const rise = SOFT(clamp01((seconds - span.start) / tempoSeconds('markIn')));
  const fall = INOUT(clamp01((seconds - span.end) / tempoSeconds('markOut')));
  return rise * (1 - fall);
};

/** How strongly an ayah is marked at `seconds`, 0-1: in from its start and out from its release, each over `ayahMark` on `INOUT`. */
export const ayahEmphasis = (
  ayah: Pick<AyahSpan, 'start' | 'release'>,
  seconds: number,
  tempo: Tempo = 'calm',
): number => {
  const length = tempoSeconds('ayahMark', tempo);
  return INOUT(clamp01((seconds - ayah.start) / length)) * (1 - INOUT(clamp01((seconds - ayah.release) / length)));
};

/** How far a word's ink has filled at `seconds`, 0-1: over `inkFill` (6 frames) on `SOFT` from its start, then 1 for good. */
export const inkFill = (start: number, seconds: number): number =>
  SOFT(clamp01((seconds - start) / tempoSeconds('inkFill')));

/** What kind of change a boundary is: a dissolve compresses to fit a short pause; the window's scroll does not. */
export type BoundaryKind = 'dissolve' | 'scroll';

export type BoundaryOptions = {
  /** `E`: seconds the outgoing unit's last word ends (`outgoingEnd()`). */
  readonly end: number;
  /** `F`: seconds the incoming unit's first word starts. */
  readonly next: number;
  readonly fps: number;
  /** `D`: the change's full length in frames (`tempoFrames('lineDissolve', tempo, fps)`, ...). */
  readonly duration: number;
  /** The longest the incoming unit waits, settled, before its first word. */
  readonly leadInSeconds: number;
  /** Default `'dissolve'`. */
  readonly kind?: BoundaryKind | undefined;
  /** The tempo of `Dmin`. Default `'calm'`. */
  readonly tempo?: Tempo | undefined;
};

/** When a change starts and how long it takes, in frames of the composition. */
export type Boundary = {readonly start: number; readonly duration: number};

/**
 * When a change between two units starts, late and never early: `start = max(E, F − leadIn − D_eff)`
 * with `D_eff = clamp(F − E, Dmin, D)` for a dissolve and `D` for the scroll. So nothing changes
 * before the outgoing unit has been recited; with a pause, the incoming unit is settled `leadIn`
 * before its first word; with continuous recitation the dissolve shrinks to `Dmin` (10 frames) and
 * overlaps the incoming first word. `start` is a whole frame, never before `E`.
 */
export const boundaryStart = (options: BoundaryOptions): Boundary => {
  const {end, next, fps, duration, leadInSeconds} = options;
  const kind = options.kind ?? 'dissolve';
  const dmin = Math.min(duration, tempoFrames('Dmin', options.tempo ?? 'calm', fps));
  const gap = Math.round((next - end) * fps);
  const length = kind === 'scroll' ? duration : Math.min(duration, Math.max(dmin, gap));
  // A hair under E's frame counts as E: float noise never pushes the start a frame later.
  const earliest = Math.ceil(end * fps - 1e-6);
  return {start: Math.max(earliest, Math.round((next - leadInSeconds) * fps) - length), duration: length};
};

export type OutgoingEndOptions = {
  readonly timings: RecitationTimings;
  /** `MushafWord.id` of the outgoing unit's last word (the rosette, when the unit ends its ayah). */
  readonly lastWordId: string;
  /** Whether the unit ends where its ayah ends. */
  readonly endsAyah: boolean;
  /** `F`: the incoming unit's first word start, for a file with ayah times only. */
  readonly next: number;
  /** Default `'first'`. */
  readonly occurrence?: WordOccurrence | undefined;
};

/**
 * `E` of a boundary: the end of the outgoing unit's last word; a word without a time of its own
 * ends at its ayah's end when the unit ends the ayah, else where the next timed word of its ayah
 * starts; a file with ayah times only, ending mid-ayah, gives `next` (`E = F`).
 */
export const outgoingEnd = (options: OutgoingEndOptions): number => {
  const {timings, lastWordId, endsAyah, next} = options;
  const occurrence = options.occurrence ?? 'first';
  const ayat = normalizeTimings(timings).ayat;
  const [surah, ayahNumber, position] = lastWordId.split(':').map(Number);
  const ayah = ayat.find((a) => a.surah === surah && a.ayah === ayahNumber);
  const words = ayah?.words ?? [];
  const kept = keptOccurrences(
    words.map((word) => word.id),
    occurrence,
  );
  const own = words.find((word, i) => kept[i] && word.id === lastWordId);
  if (own !== undefined) return own.end;
  if (endsAyah && ayah !== undefined) return ayah.end;
  const later = words.find((word) => Number(word.id.split(':')[2]) > (position ?? 0));
  if (later !== undefined) return later.start;
  if (ayah !== undefined && words.length > 0) return ayah.end;
  return next;
};

// The aligner's answers as the studio's timings: the package's `RecitationTimings`, and next to it
// the `alignment` sidecar that keeps what the format has no room for (segment confidence and
// flags, each word's Uthmani text, the session). Pure: no clock, no network.
import {type AyahTiming, parseRecitationTimings, type WordTiming} from '@tlawat/remotion-mushaf-line';
import {describeValue, MushafStudioError} from '../errors';
import type {AlignmentSegment, AlignmentSidecar, AlignmentWord, CatalogueOrigin, StudioTimingsV1} from '../types';
import type {QudAlignResponse, QudChapterSegments, QudSegment, QudTimestampsResponse, QudWord} from './types';

/** Seconds the ayah-end marker stays current after the ayah's last word, unless the next ayah starts sooner. */
export const MARKER_HOLD_SECONDS = 0.8;

export type FromQudOptions = {
  /** Recorded in the file as `audio` (a public-folder path or a URL). */
  readonly audio?: string | undefined;
  /** Keep only the ayahs from this one on. */
  readonly fromAyah?: number | undefined;
  /** Keep only the ayahs up to this one; `durationSeconds` then ends with it. */
  readonly toAyah?: number | undefined;
  readonly model?: string | undefined;
  /** Where the alignment ran when the answer does not say (it does: its `device` wins). */
  readonly device?: string | undefined;
  readonly riwayah?: string | undefined;
};

/** Recorded as the file's `source`: the API's output is CC-BY-4.0, so the file names where it came from. */
const SOURCE = 'aligner.qud.dev';

type Triple = readonly [location: string, start: number, end: number];
type TimedSegment = {readonly segment: number; readonly words?: readonly (QudWord | Triple)[] | undefined};

/** One recited word, recording-relative, with where the aligner put it. */
type Heard = AlignmentWord & {readonly surah: number; readonly ayah: number};

const round = (seconds: number): number => Math.round(seconds * 1000) / 1000;

const isTriple = (word: QudWord | Triple): word is Triple => Array.isArray(word);

const badResponse = (problem: string, value: unknown): never => {
  throw new MushafStudioError(
    'QUD_BAD_RESPONSE',
    `The aligner's answer cannot be converted: ${problem} (got ${describeValue(value)}). Align again; if it persists, the API has changed.`,
  );
};

/**
 * Every word the aligner heard, made recording-relative (word times are relative to their
 * segment's `time_from`), in the order the answer lists them. A word's text is its own `word`
 * when the answer gives one, else its place in the segment's `matched_text` when the counts agree,
 * else its location.
 */
const hear = (segments: readonly QudSegment[], timed: readonly TimedSegment[]): Heard[] => {
  const byNumber = new Map(segments.map((s) => [s.segment, s]));
  const heard: Heard[] = [];
  for (const entry of timed) {
    const segment = byNumber.get(entry.segment);
    if (segment === undefined)
      return badResponse('the timestamps name a segment the alignment does not have', entry.segment);
    const words = entry.words ?? [];
    const texts = segment.matched_text?.split(/\s+/).filter((t) => t !== '') ?? [];
    for (const [i, raw] of words.entries()) {
      const word = isTriple(raw) ? {location: raw[0], start: raw[1], end: raw[2], word: ''} : raw;
      const match = /^([1-9]\d*):([1-9]\d*):[1-9]\d*$/.exec(word.location);
      if (match === null) return badResponse('a word location is not "surah:ayah:word"', word.location);
      const [surah, ayah] = match.slice(1).map(Number) as [number, number];
      const text = word.word || (texts.length === words.length ? texts[i]! : word.location);
      heard.push({
        id: word.location,
        text,
        segment: segment.segment,
        start: round(word.start + segment.time_from),
        end: round(word.end + segment.time_from),
        surah,
        ayah,
      });
    }
  }
  return heard;
};

/**
 * The timings proper, as the reference converter (example/tools/qud-aligner.ts) makes them: every
 * occurrence kept in audio order, an ayah spanning its first to its last word, `complete` when
 * every position up to the highest one was heard, and a complete ayah's end marker (the mushaf
 * word after its last one) held `MARKER_HOLD_SECONDS` or until the next recited ayah starts.
 */
const timeAyat = (heard: readonly Heard[], {fromAyah, toAyah}: Pick<FromQudOptions, 'fromAyah' | 'toAyah'>) => {
  const surah = heard[0]?.surah;
  if (surah === undefined)
    throw new MushafStudioError(
      'QUD_NO_MATCH',
      "The aligner matched no words of the Quran in this recording (every segment is unmatched, an isti'adha or a basmala): there is nothing to time. Check that the audio is a recitation in the chosen riwayah, or try the Large model.",
    );
  const other = heard.find((w) => w.surah !== surah);
  if (other !== undefined)
    throw new MushafStudioError(
      'QUD_NO_MATCH',
      `The recording carries words of surah ${surah} and of surah ${other.surah} (${other.id}), but a timings file holds one surah. Cut the recording at the surah boundary and align each part.`,
      {surahs: [surah, other.surah]},
    );
  const byAyah = new Map<number, WordTiming[]>();
  for (const {id, start, end, ayah} of heard) {
    const words = byAyah.get(ayah) ?? [];
    words.push({id, start, end});
    byAyah.set(ayah, words);
  }
  const recited = [...byAyah.keys()].sort((x, y) => x - y);
  const kept = recited.filter(
    (a) => (fromAyah === undefined || a >= fromAyah) && (toAyah === undefined || a <= toAyah),
  );
  if (kept.length === 0)
    throw new MushafStudioError(
      'QUD_NO_MATCH',
      `The aligner matched no words of ayahs ${fromAyah ?? 1}-${toAyah ?? 'end'} of surah ${surah}; it heard ayahs ${recited[0]}-${recited[recited.length - 1]}. Change fromAyah and toAyah.`,
      {surah, fromAyah: fromAyah ?? null, toAyah: toAyah ?? null, recited},
    );
  const ayat = kept.map((ayah): AyahTiming => {
    const words = [...byAyah.get(ayah)!].sort((x, y) => x.start - y.start);
    const positions = new Set(words.map((w) => Number(w.id.split(':')[2])));
    const last = Math.max(...positions);
    const complete = positions.size === last;
    const start = words[0]!.start;
    const lastEnd = Math.max(...words.map((w) => w.end));
    if (!complete) return {ayah, start, end: lastEnd, complete, words};
    // The marker's hold ends where the next recited ayah starts, whether or not it is kept.
    const following = recited[recited.indexOf(ayah) + 1];
    const nextStart =
      following === undefined ? Number.POSITIVE_INFINITY : Math.min(...byAyah.get(following)!.map((w) => w.start));
    const markerEnd = round(Math.max(lastEnd, Math.min(lastEnd + MARKER_HOLD_SECONDS, nextStart)));
    return {
      ayah,
      start,
      end: markerEnd,
      complete,
      words: [...words, {id: `${surah}:${ayah}:${last + 1}`, start: lastEnd, end: markerEnd}],
    };
  });
  return {surah, ayat};
};

const toSegment = (s: QudSegment): AlignmentSegment => ({
  segment: s.segment,
  timeFrom: round(s.time_from),
  timeTo: round(s.time_to),
  // The aligner writes "" (or null) for an isti'adha, a basmala or no match.
  refFrom: s.ref_from || null,
  refTo: s.ref_to || null,
  confidence: s.confidence,
  hasMissingWords: s.has_missing_words ?? false,
  hasRepeatedWords: s.has_repeated_words ?? false,
  error: s.error || null,
  matchedText: s.matched_text || null,
  ...(s.kind ? {kind: s.kind} : {}),
});

const toWord = ({id, text, segment, start, end}: Heard): AlignmentWord => ({id, text, segment, start, end});

const assemble = (
  segments: readonly QudSegment[],
  heard: readonly Heard[],
  options: Pick<FromQudOptions, 'audio' | 'fromAyah' | 'toAyah'>,
  sidecar: Omit<AlignmentSidecar, 'version' | 'segments' | 'words' | 'edits'>,
): StudioTimingsV1 => {
  const {surah, ayat} = timeAyat(heard, options);
  const alignment: AlignmentSidecar = {
    version: 1,
    ...sidecar,
    segments: segments.map(toSegment),
    words: [...heard].sort((x, y) => x.start - y.start).map(toWord),
    edits: [],
  };
  const durationSeconds =
    options.toAyah === undefined ? round(Math.max(...segments.map((s) => s.time_to))) : ayat[ayat.length - 1]!.end;
  const file = {
    version: 1 as const,
    surah,
    ...(options.audio === undefined ? {} : {audio: options.audio}),
    durationSeconds,
    source: SOURCE,
    ayat,
    alignment,
  };
  try {
    parseRecitationTimings(file);
  } catch (error) {
    throw new MushafStudioError(
      'QUD_BAD_RESPONSE',
      `The aligner's word times do not make valid recitation timings: ${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
  return file;
};

/**
 * Converts an alignment and its word timestamps into the studio's timings: the package's
 * `RecitationTimings` (every occurrence kept in audio order, `complete` per ayah, the ayah-end
 * marker held `MARKER_HOLD_SECONDS`) plus the `alignment` sidecar (segments with confidence, the
 * words with their text). Pure; validated through `parseRecitationTimings()` before it returns.
 * `fromAyah` and `toAyah` trim the timings; the sidecar keeps the whole session (every segment and
 * word) so that it can be split or realigned again. Throws `QUD_NO_MATCH` when no word was matched,
 * when the words belong to two surahs, or when none is in the range kept.
 */
export const timingsFromQud = (
  {align, timestamps}: {readonly align: QudAlignResponse; readonly timestamps: QudTimestampsResponse},
  options: FromQudOptions = {},
): StudioTimingsV1 => {
  if (timestamps.audio_id !== undefined && timestamps.audio_id !== align.audio_id)
    return badResponse(
      `the timestamps belong to session ${timestamps.audio_id}, the alignment to ${align.audio_id}`,
      timestamps.audio_id,
    );
  const device = align.device ?? options.device;
  return assemble(align.segments, hear(align.segments, timestamps.segments), options, {
    source: 'qud',
    audioId: align.audio_id,
    ...(options.model === undefined ? {} : {model: options.model}),
    ...(device === undefined || device === null ? {} : {device}),
    ...(options.riwayah === undefined ? {} : {riwayah: options.riwayah}),
  });
};

/**
 * The same for a catalogue chapter (`getChapterSegments()` with timestamps): times are already
 * relative to the clip, and `recitation` records where it came from. `audio` defaults to the
 * clip's `audio_url`.
 */
export const timingsFromCatalogue = (
  chapter: QudChapterSegments,
  options: Pick<FromQudOptions, 'audio'> = {},
): StudioTimingsV1 => {
  const recitation: CatalogueOrigin = {
    slug: chapter.recitation,
    chapter: chapter.chapter,
    verseFrom: chapter.verse_from,
    verseTo: chapter.verse_to,
    clipStart: chapter.clip_start,
    audioUrl: chapter.audio_url,
  };
  return assemble(
    chapter.segments,
    hear(chapter.segments, chapter.segments),
    {audio: options.audio ?? chapter.audio_url},
    {source: 'qud-catalogue', recitation},
  );
};

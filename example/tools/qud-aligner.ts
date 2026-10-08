// The QUD Universal Aligner (https://aligner.qud.dev, an open API, no key) as a producer of the
// package's recitation timings. Two parts: `alignWithQud()` sends a recording to the API and returns
// its two responses; `fromQudAligner()` converts them, and is pure. Neither is part of the package:
// it only knows the format they write (see the package README, "Following a recording").
//
// What the API does with a recording: cuts it at the reciter's pauses, recognises which surah and
// ayahs each segment carries (no reference text is needed), and times every word. Each segment comes
// back with a confidence; a segment it could not match carries an `error` and no words. The audio
// leaves the machine; the API's output is CC-BY-4.0 (see its FAQ).
import {readFile} from 'node:fs/promises';
import {basename, extname} from 'node:path';
import {
  type AyahTiming,
  parseRecitationTimings,
  type RecitationTimingsV1,
  type WordTiming,
} from '@tlawat/remotion-mushaf-line';

export const DEFAULT_QUD_API = 'https://aligner.qud.dev/api/v1';

/** One segment of `POST /align/audio`: a stretch between two pauses and the words it was matched to. */
export type QudSegment = {
  segment: number;
  time_from: number;
  time_to: number;
  /** "surah:ayah:word" of the first and last matched word; empty for isti'adha, basmala or no match. */
  ref_from: string;
  ref_to: string;
  confidence: number;
  has_missing_words?: boolean;
  error?: string | null;
  matched_text?: string;
};

export type QudAlignResponse = {
  audio_id: string;
  segments: QudSegment[];
  device?: string;
  warning?: string | null;
};

/** `POST /sessions/{audio_id}/timestamps`: per segment, `[location, start, end]` with times relative to the segment's `time_from`. */
export type QudTimestampsResponse = {
  audio_id?: string;
  segments: {segment: number; words?: [string, number, number][]; timing_status?: string}[];
};

export type QudAlignOptions = {
  /** Path of the recording (any common audio format). */
  audio: string;
  api?: string;
  /** `'Base'` (default) or `'Large'`. */
  model?: string;
  /** `'hafs'` (default), `'warsh'`, `'qalun'` or `'shuba'`. */
  riwayah?: string;
  /** `'GPU'` (default; the API falls back to the CPU when the free quota is spent) or `'CPU'`. */
  device?: string;
};

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
};

const post = async (url: string, body: FormData | string): Promise<unknown> => {
  const response = await fetch(url, {
    method: 'POST',
    body,
    headers: typeof body === 'string' ? {'content-type': 'application/json'} : undefined,
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
};

/** Sends a recording through the aligner: segmentation and matching, then word timings for the session. */
export const alignWithQud = async ({
  audio,
  api = DEFAULT_QUD_API,
  model = 'Base',
  riwayah = 'hafs',
  device = 'GPU',
}: QudAlignOptions): Promise<{align: QudAlignResponse; timestamps: QudTimestampsResponse}> => {
  const bytes = await readFile(audio);
  const form = new FormData();
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
    type: MIME[extname(audio).toLowerCase()] ?? 'application/octet-stream',
  });
  form.append('audio', blob, basename(audio));
  form.append('model_name', model);
  form.append('device', device);
  form.append('riwayah', riwayah);
  const align = (await post(`${api}/align/audio`, form)) as QudAlignResponse;
  const timestamps = (await post(
    `${api}/sessions/${align.audio_id}/timestamps`,
    JSON.stringify({granularity: 'words'}),
  )) as QudTimestampsResponse;
  return {align, timestamps};
};

/** Seconds the ayah-end marker stays current after the ayah's last word, unless the next ayah starts sooner. */
export const MARKER_HOLD_SECONDS = 0.8;

export type FromQudOptions = {
  /** Recorded in the file as `audio` (a public-folder path or a file name). */
  audio?: string;
  /** Recorded in the file as `source`. */
  source?: string;
  /** Keep only the ayahs from this one on (the recording may carry more than the file should). */
  fromAyah?: number;
  /** Keep only the ayahs up to this one; `durationSeconds` then ends with it. */
  toAyah?: number;
};

/**
 * Converts the aligner's two responses into recitation timings. Every occurrence of a word is kept, in
 * audio order (a word the reciter repeats after a pause comes back once per segment); an ayah spans
 * its first to its last word; `complete` says whether every position up to the highest one was
 * heard; and, as the Whisper tool does, a complete ayah gets its ayah-end marker (the mushaf word
 * after its last one) at the ayah's end, held `MARKER_HOLD_SECONDS` or until the next ayah starts.
 */
export const fromQudAligner = (
  {align, timestamps}: {align: QudAlignResponse; timestamps: QudTimestampsResponse},
  {audio, source, fromAyah, toAyah}: FromQudOptions = {},
): RecitationTimingsV1 => {
  const offsets = new Map(align.segments.map((s) => [s.segment, s.time_from]));
  const byAyah = new Map<number, WordTiming[]>();
  let surah: number | null = null;
  for (const segment of timestamps.segments) {
    const offset = offsets.get(segment.segment);
    if (offset === undefined)
      throw new Error(`timestamps name segment ${segment.segment}, which the alignment does not have.`);
    for (const [location, start, end] of segment.words ?? []) {
      const [s, a, position] = location.split(':').map(Number);
      if (!s || !a || !position) throw new Error(`unexpected word location ${JSON.stringify(location)}.`);
      if (surah === null) surah = s;
      if (s !== surah)
        throw new Error(
          `the recording carries surah ${surah} and surah ${s}; recitation timings hold one surah. Split the audio.`,
        );
      const words = byAyah.get(a) ?? [];
      words.push({id: location, start: round(start + offset), end: round(end + offset)});
      byAyah.set(a, words);
    }
  }
  if (surah === null) throw new Error('the aligner matched no words: nothing to convert.');

  const numbers = [...byAyah.keys()]
    .filter((a) => (fromAyah === undefined || a >= fromAyah) && (toAyah === undefined || a <= toAyah))
    .sort((x, y) => x - y);
  if (numbers.length === 0)
    throw new Error(`the aligner matched no words of ayahs ${fromAyah ?? 1}-${toAyah ?? 'end'}.`);
  const ayat: AyahTiming[] = numbers.map((ayah) => {
    const words = [...byAyah.get(ayah)!].sort((x, y) => x.start - y.start);
    const positions = new Set(words.map((w) => Number(w.id.split(':')[2])));
    const last = Math.max(...positions);
    const complete = positions.size === last;
    const start = words[0]!.start;
    const lastEnd = Math.max(...words.map((w) => w.end));
    // The marker's hold ends where the next recited ayah starts, whether or not it is kept.
    const following = [...byAyah.keys()].filter((a) => a > ayah).sort((x, y) => x - y)[0];
    const next = following === undefined ? null : byAyah.get(following)!;
    const nextStart = next ? Math.min(...next.map((w) => w.start)) : null;
    if (!complete) return {ayah, start, end: lastEnd, complete, words};
    const markerEnd = round(
      Math.max(lastEnd, Math.min(lastEnd + MARKER_HOLD_SECONDS, nextStart ?? Number.POSITIVE_INFINITY)),
    );
    return {
      ayah,
      start,
      end: markerEnd,
      complete,
      words: [...words, {id: `${surah}:${ayah}:${last + 1}`, start: lastEnd, end: markerEnd}],
    };
  });
  const durationSeconds =
    toAyah === undefined ? round(Math.max(...align.segments.map((s) => s.time_to))) : ayat[ayat.length - 1]!.end;
  // The aligner's answer is one surah (checked above): a version-1 file.
  return parseRecitationTimings({
    version: 1,
    surah,
    ...(audio === undefined ? {} : {audio}),
    durationSeconds,
    source: source ?? 'aligner.qud.dev',
    ayat,
  }) as RecitationTimingsV1;
};

const round = (seconds: number): number => Math.round(seconds * 1000) / 1000;

// Contract of the QUD module (workstream 2). Implement in client.ts and convert.ts; keep these
// exports and signatures. The client is browser-safe (no node:fs): it takes a Blob or File.
import type {StudioTimings} from '../types';
import type {
  QudAlignOptions,
  QudAlignResponse,
  QudChapterSegments,
  QudClientOptions,
  QudRealignRequest,
  QudRecitation,
  QudSplitRequest,
  QudTimestampsResponse,
} from './types';

export type * from './types';

export const DEFAULT_QUD_API = 'https://aligner.qud.dev/api/v1';

/** Seconds the ayah-end marker stays current after the ayah's last word, unless the next ayah starts sooner. */
export const MARKER_HOLD_SECONDS = 0.8;

/** Segments under this confidence are flagged by default. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet (workstream 2).`);
};

/** `GET /recitations`: the reviewed, pre-aligned recitations. */
export const listRecitations = (_options: QudClientOptions = {}): Promise<readonly QudRecitation[]> =>
  notImplemented('listRecitations');

/** `GET /audio-recitations`: recitations with chapter audio but no reviewed segments (for Align). */
export const listAudioRecitations = (_options: QudClientOptions = {}): Promise<readonly QudRecitation[]> =>
  notImplemented('listAudioRecitations');

/** `GET /recitations/{slug}/chapters/{chapter}/segments?include_timestamps=true`, for a verse range. */
export const getChapterSegments = (
  _query: {readonly slug: string; readonly chapter: number; readonly verseFrom?: number; readonly verseTo?: number},
  _options: QudClientOptions = {},
): Promise<QudChapterSegments> => notImplemented('getChapterSegments');

/** `GET /recitations/{slug}/chapters/{chapter}/audio`: the whole chapter's audio URL. */
export const getChapterAudioUrl = (
  _query: {readonly slug: string; readonly chapter: number},
  _options: QudClientOptions = {},
): Promise<string> => notImplemented('getChapterAudioUrl');

/**
 * `POST /align/audio/stream`: uploads a recording and aligns it, reporting progress. Resolves with
 * the same body as the non-streaming route. The audio leaves the machine: the panel says so first.
 */
export const alignAudio = (
  _audio: Blob,
  _fileName: string,
  _align: QudAlignOptions = {},
  _options: QudClientOptions = {},
): Promise<QudAlignResponse> => notImplemented('alignAudio');

/** `POST /align/url/stream`: the same for a URL the aligner downloads itself. */
export const alignUrl = (
  _url: string,
  _align: QudAlignOptions = {},
  _options: QudClientOptions = {},
): Promise<QudAlignResponse> => notImplemented('alignUrl');

/** `POST /sessions/{audioId}/timestamps`: per-word times for the session's segments (or the ones given). */
export const sessionTimestamps = (
  _audioId: string,
  _request: {readonly segments?: readonly unknown[] | undefined; readonly signal?: AbortSignal | undefined} = {},
  _options: QudClientOptions = {},
): Promise<QudTimestampsResponse> => notImplemented('sessionTimestamps');

/** `POST /sessions/{audioId}/split`: subdivide the session's segments. */
export const splitSession = (
  _audioId: string,
  _request: QudSplitRequest,
  _options: QudClientOptions = {},
): Promise<QudAlignResponse> => notImplemented('splitSession');

/** `POST /sessions/{audioId}/realign/stream`: re-run ASR and matching over boundaries the user supplies. */
export const realignSession = (
  _audioId: string,
  _request: QudRealignRequest,
  _align: Pick<QudAlignOptions, 'onProgress' | 'signal'> = {},
  _options: QudClientOptions = {},
): Promise<QudAlignResponse> => notImplemented('realignSession');

export type FromQudOptions = {
  /** Recorded in the file as `audio` (a public-folder path or a URL). */
  readonly audio?: string | undefined;
  /** Keep only the ayahs from this one on. */
  readonly fromAyah?: number | undefined;
  /** Keep only the ayahs up to this one. */
  readonly toAyah?: number | undefined;
  readonly model?: string | undefined;
  readonly device?: string | undefined;
  readonly riwayah?: string | undefined;
};

/**
 * Converts an alignment and its word timestamps into the studio's timings: the package's
 * `RecitationTimings` (every occurrence kept in audio order, `complete` per ayah, the ayah-end
 * marker held `MARKER_HOLD_SECONDS`) plus the `alignment` sidecar (segments with confidence, the
 * words with their text). Pure; validated through `parseRecitationTimings()` before it returns.
 */
export const timingsFromQud = (
  _responses: {readonly align: QudAlignResponse; readonly timestamps: QudTimestampsResponse},
  _options: FromQudOptions = {},
): StudioTimings => notImplemented('timingsFromQud');

/**
 * The same for a catalogue chapter (`getChapterSegments()` with timestamps): times are already
 * relative to the clip, and `recitation` records where it came from.
 */
export const timingsFromCatalogue = (
  _chapter: QudChapterSegments,
  _options: Pick<FromQudOptions, 'audio'> = {},
): StudioTimings => notImplemented('timingsFromCatalogue');

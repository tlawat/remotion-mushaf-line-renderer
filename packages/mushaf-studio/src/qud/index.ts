// Contract of the QUD module (workstream 2): the aligner's HTTP API in client.ts (browser-safe: it
// takes a Blob or File, no node:fs) and the conversion to the studio's timings in convert.ts (pure).
// The doc comments live on the implementations.
export {
  alignAudio,
  alignUrl,
  DEFAULT_QUD_API,
  getChapterAudioUrl,
  getChapterSegments,
  listAudioRecitations,
  listRecitations,
  realignSession,
  sessionTimestamps,
  splitSession,
} from './client';
export {type FromQudOptions, MARKER_HOLD_SECONDS, timingsFromCatalogue, timingsFromQud} from './convert';
export {isHafsRecitation} from './riwayah';
export type * from './types';

/** Segments under this confidence are flagged by default. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

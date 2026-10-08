/**
 * Error codes of the studio package. The main package's `MushafError` covers everything that
 * happens to a line; these cover what happens around it: the aligner, the catalogue, the
 * translation and content files, project files and the panel's own inputs.
 */
export type MushafStudioErrorCode =
  /** The aligner or the catalogue answered with an error; `details.status` and `details.code` carry theirs. */
  | 'QUD_HTTP'
  /** The GPU quota and the CPU rate limit are both spent; `details.retryAfterSeconds` says when to retry. */
  | 'QUD_RATE_LIMITED'
  /** The aligner's answer is not in the shape the client expects. */
  | 'QUD_BAD_RESPONSE'
  /** The aligner matched nothing, or words of two surahs. */
  | 'QUD_NO_MATCH'
  /** A translation file is in none of the shapes the loader understands. */
  | 'BAD_TRANSLATION_FILE'
  /** A translation source could not be fetched. */
  | 'TRANSLATION_FETCH_FAILED'
  /**
   * A tafsir or a surah introduction (chapter info) could not be fetched: the request failed, the
   * source answered in a shape the client does not know, or it has nothing for the range asked for.
   */
  | 'CONTENT_FETCH_FAILED'
  /** A tafsir or chapter-info file is not the envelope its loader reads (another version or kind, a bad field). */
  | 'BAD_CONTENT_FILE'
  /**
   * A project file (`project.json`) cannot be imported: not JSON, another version, props that fail
   * the composition's schema, props for the other kind of composition, or files `public/` lacks.
   */
  | 'BAD_PROJECT_FILE'
  /** A line split names a line that is not in the passage or a word that is not on that line. */
  | 'BAD_LINE_SPLIT'
  /** A composition prop is out of range or inconsistent (the Zod schema catches most; this covers the rest). */
  | 'BAD_STUDIO_PROP'
  /** An edit of the timings in the panel is impossible: a start after the end, a word the file does not have. */
  | 'BAD_TIMING_EDIT'
  /** The audio could not be fetched or decoded for loudness and level analysis. */
  | 'AUDIO_ANALYSIS_FAILED'
  /** A Studio API was called outside the Studio. */
  | 'NOT_IN_STUDIO';

/**
 * Every user-facing failure of the studio package is one of these: a stable `code` to branch on,
 * a message that names the offending value and the fix, and `details` for the rest.
 */
export class MushafStudioError extends Error {
  override readonly name = 'MushafStudioError';
  readonly code: MushafStudioErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: MushafStudioErrorCode, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const isMushafStudioError = (value: unknown): value is MushafStudioError =>
  value instanceof MushafStudioError ||
  (typeof value === 'object' && value !== null && (value as {name?: unknown}).name === 'MushafStudioError');

/** For messages: a short, quoted rendering of a value. */
export const describeValue = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value.length > 60 ? `${value.slice(0, 57)}...` : value);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) return `an array of ${value.length}`;
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
};

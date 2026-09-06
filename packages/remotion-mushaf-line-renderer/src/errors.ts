export type MushafErrorCode =
  | 'UNKNOWN_MUSHAF'
  | 'BAD_TAJWEED'
  | 'PAGE_OUT_OF_RANGE'
  | 'AYAH_NOT_FOUND'
  | 'LINE_OUT_OF_RANGE'
  | 'BAD_LINE_PROP'
  | 'BAD_LINE_DATA'
  | 'UNSUPPORTED_LINE_TYPE'
  | 'BAD_ENTER'
  | 'BAD_EXIT'
  | 'BAD_SIZE'
  | 'DATA_NOT_COMPILED'
  | 'DATA_LOAD_FAILED'
  | 'BAD_FONT_URL'
  | 'FONT_HTTP'
  | 'FONT_NETWORK'
  | 'FONT_TIMEOUT'
  | 'FONT_INVALID'
  | 'FONT_PARSE'
  | 'FONT_NOT_AVAILABLE'
  | 'FONT_URL_CONFLICT'
  | 'FONT_SUPERSEDED'
  | 'CANVAS_PRESENTATION';

/**
 * Every failure raised by remotion-mushaf-line-renderer. `code` is stable and documented; the
 * message always names the offending value and what to do about it.
 */
export class MushafError extends Error {
  readonly code: MushafErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: MushafErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MushafError';
    this.code = code;
    this.details = details;
  }
}

export const isMushafError = (e: unknown): e is MushafError =>
  e instanceof MushafError || (typeof e === 'object' && e !== null && (e as {name?: unknown}).name === 'MushafError' && typeof (e as {code?: unknown}).code === 'string');

export const describeValue = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return `an array of length ${value.length}`;
  return `a value of type ${typeof value}`;
};

// The QUD Universal Aligner's HTTP API, from the browser: the catalogue (GET), alignment with its
// progress streamed as Server-Sent Events, and the session follow-ups (timestamps, split, realign).
// Browser-safe on purpose: fetch, FormData, Blob and ReadableStream only. Every answer is checked
// for the shape the conversion relies on before it is returned, and kept verbatim otherwise.
import {describeValue, MushafStudioError} from '../errors';
import {flushSse, parseSseChunk, type SseEvent} from './sse';
import type {
  QudAlignOptions,
  QudAlignResponse,
  QudChapterSegments,
  QudClientOptions,
  QudProgress,
  QudRealignRequest,
  QudRecitation,
  QudSplitRequest,
  QudTimestampsResponse,
} from './types';

/** The aligner's public API (OpenAPI 3.1 at `/openapi.json`): no key, CORS open for `localhost` origins. */
export const DEFAULT_QUD_API = 'https://aligner.qud.dev/api/v1';

type Call = {
  readonly method: 'GET' | 'POST';
  /** The API path, values already in it: also how messages name the route. */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly json?: unknown;
  readonly form?: FormData;
  readonly stream?: boolean;
  readonly signal?: AbortSignal | undefined;
};

type Read<T> = (body: unknown, route: string) => T;

const routeOf = (call: Call): string => `${call.method} ${call.path}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// Annotated so that a call as a statement ends control flow (narrowing needs a declared `never`).
const badResponse: (route: string, problem: string, value: unknown) => never = (route, problem, value) => {
  throw new MushafStudioError(
    'QUD_BAD_RESPONSE',
    `QUD ${route} answered in an unexpected shape: ${problem} (got ${describeValue(value)}). Check that the \`api\` option points at the aligner's /api/v1, or update @tlawat/mushaf-studio if the API has changed.`,
    {route},
  );
};

const hint = (status: number | null): string => {
  if (status === 404)
    return ' Check the recitation and chapter; a session (audio_id) expires after a few hours, so align again.';
  if (status !== null && status >= 500) return ' The service failed; try again in a moment.';
  return '';
};

/** The client's error for a non-2xx answer or an `error` event: their body is `{code, message, detail}`. */
const apiError = (route: string, status: number | null, body: unknown, retryAfter: string | null = null) => {
  const error = isRecord(body) && typeof body.code === 'string' && typeof body.message === 'string' ? body : null;
  const code = error === null ? null : (error.code as string);
  const detail = error !== null && isRecord(error.detail) ? error.detail : null;
  const said = error === null ? "a body that is not the API's {code, message} error" : `${code}: "${error.message}"`;
  if (status === 429) {
    const header = retryAfter !== null && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) : null;
    const retryAfterSeconds = isNumber(detail?.retry_after_s) ? detail.retry_after_s : header;
    return new MushafStudioError(
      'QUD_RATE_LIMITED',
      `QUD ${route} is rate limited (${said}): the free GPU quota and the CPU fair-use limit are both spent. Retry ${retryAfterSeconds === null ? 'later' : `in ${retryAfterSeconds} s`}, or pass a Hugging Face token to spend your own GPU quota.`,
      {route, status, code, retryAfterSeconds, detail},
    );
  }
  return new MushafStudioError(
    'QUD_HTTP',
    `QUD ${route} failed${status === null ? '' : ` with HTTP ${status}`} (${said}).${hint(status)}`,
    {route, status, code, detail},
  );
};

const buildUrl = (api: string, call: Call): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(call.query ?? {})) if (value !== undefined) query.set(key, String(value));
  const search = query.toString();
  return `${api.replace(/\/+$/, '')}${call.path}${search === '' ? '' : `?${search}`}`;
};

const send = async (call: Call, options: QudClientOptions): Promise<Response> => {
  const route = routeOf(call);
  const url = buildUrl(options.api ?? DEFAULT_QUD_API, call);
  const headers: Record<string, string> = {accept: call.stream ? 'text/event-stream' : 'application/json'};
  if (call.json !== undefined) headers['content-type'] = 'application/json';
  // Sent with this request only: the client keeps no copy of the token.
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const body = call.form ?? (call.json === undefined ? undefined : JSON.stringify(call.json));
  // Called unbound: a native fetch invoked as a method of `options` throws "Illegal invocation".
  const request = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await request(url, {
      method: call.method,
      headers,
      credentials: 'omit',
      ...(body === undefined ? {} : {body}),
      ...(call.signal === undefined ? {} : {signal: call.signal}),
    });
  } catch (error) {
    if (call.signal?.aborted) throw error;
    throw new MushafStudioError(
      'QUD_HTTP',
      `Could not reach QUD for ${route} at ${url} (${error instanceof Error ? error.message : String(error)}). Check the connection, and that the \`api\` option names a server that sends CORS headers for this origin.`,
      {route, status: 0, code: null, url, cause: error},
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON: apiError says so.
    }
    throw apiError(route, response.status, parsed, response.headers.get('retry-after'));
  }
  return response;
};

const requestJson = async <T>(call: Call, options: QudClientOptions, read: Read<T>): Promise<T> => {
  const route = routeOf(call);
  const response = await send(call, options);
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return badResponse(route, 'the body is not JSON', text);
  }
  return read(body, route);
};

const parseData = (data: string): unknown => {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
};

const isProgress = (value: unknown): value is QudProgress =>
  isRecord(value) && typeof value.stage === 'string' && isNumber(value.step) && isNumber(value.steps);

/** Reads a streaming route's events to the end: progress to `onProgress`, then its one result or error. */
const requestStream = async <T>(
  call: Call,
  options: QudClientOptions,
  read: Read<T>,
  onProgress: ((progress: QudProgress) => void) | undefined,
): Promise<T> => {
  const route = routeOf(call);
  const response = await send({...call, stream: true}, options);
  if (response.body === null) return badResponse(route, 'an empty event stream', null);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // A result is wrapped so that a falsy body cannot read as "no result yet".
  const handle = (event: SseEvent): {readonly value: T} | null => {
    if (event.event === 'progress') {
      // Progress is informational: one the client cannot read is skipped, not fatal to a long alignment.
      const progress = parseData(event.data);
      if (isProgress(progress)) onProgress?.({stage: progress.stage, step: progress.step, steps: progress.steps});
      return null;
    }
    if (event.event === 'result') {
      const body = parseData(event.data);
      if (body === undefined) return badResponse(route, 'a `result` event whose data is not JSON', event.data);
      return {value: read(body, route)};
    }
    if (event.event === 'error') {
      const body = parseData(event.data) ?? event.data;
      throw apiError(route, isRecord(body) && isNumber(body.status) ? body.status : null, body);
    }
    return null;
  };
  let rest = '';
  let done = false;
  try {
    while (!done) {
      call.signal?.throwIfAborted();
      const next = await reader.read();
      done = next.done;
      let events: readonly SseEvent[];
      if (next.done) events = flushSse(rest + decoder.decode());
      else ({events, rest} = parseSseChunk(rest, decoder.decode(next.value, {stream: true})));
      for (const event of events) {
        const result = handle(event);
        if (result !== null) return result.value;
      }
    }
  } finally {
    // Closes the connection once the result is in (or on an error); a no-op on a finished stream.
    reader.cancel().catch(() => undefined);
  }
  return badResponse(route, 'an event stream that ended without a `result` event', null);
};

const checkWords = (route: string, at: string, value: unknown): void => {
  if (!Array.isArray(value)) badResponse(route, `${at} is not an array of words`, value);
  for (const [i, word] of (value as unknown[]).entries()) {
    const ok = Array.isArray(word)
      ? word.length === 3 && typeof word[0] === 'string' && isNumber(word[1]) && isNumber(word[2])
      : isRecord(word) && typeof word.location === 'string' && isNumber(word.start) && isNumber(word.end);
    if (!ok) badResponse(route, `${at}[${i}] is neither {word, location, start, end} nor [location, start, end]`, word);
  }
};

const checkSegments = (route: string, value: unknown, timed: boolean): void => {
  if (!Array.isArray(value)) badResponse(route, 'expected an array of segments', value);
  for (const [i, segment] of (value as unknown[]).entries()) {
    const at = `segments[${i}]`;
    if (!isRecord(segment)) badResponse(route, `${at} is not an object`, segment);
    for (const key of timed ? ['segment'] : ['segment', 'time_from', 'time_to', 'confidence'])
      if (!isNumber(segment[key])) badResponse(route, `${at}.${key} is not a number`, segment[key]);
    for (const key of timed ? [] : ['ref_from', 'ref_to'])
      if (segment[key] !== undefined && segment[key] !== null && typeof segment[key] !== 'string')
        badResponse(route, `${at}.${key} is not a "surah:ayah:word" string`, segment[key]);
    if (segment.words !== undefined) checkWords(route, `${at}.words`, segment.words);
  }
};

const readRecitations: Read<readonly QudRecitation[]> = (body, route) => {
  if (!isRecord(body) || !Array.isArray(body.recitations))
    return badResponse(route, 'expected {recitations: [...]}', body);
  for (const [i, entry] of (body.recitations as unknown[]).entries()) {
    if (!isRecord(entry) || typeof entry.slug !== 'string' || typeof entry.label !== 'string')
      return badResponse(route, `recitations[${i}] has no slug or label`, entry);
    if (!Array.isArray(entry.chapters))
      badResponse(route, `recitations[${i}].chapters is not an array`, entry.chapters);
  }
  return body.recitations as readonly QudRecitation[];
};

const readChapter: Read<QudChapterSegments> = (body, route) => {
  if (!isRecord(body)) return badResponse(route, 'expected a chapter object', body);
  if (typeof body.recitation !== 'string') badResponse(route, 'recitation is not a string', body.recitation);
  if (typeof body.audio_url !== 'string') badResponse(route, 'audio_url is not a string', body.audio_url);
  for (const key of ['chapter', 'verse_from', 'verse_to', 'clip_start'])
    if (!isNumber(body[key])) badResponse(route, `${key} is not a number`, body[key]);
  checkSegments(route, body.segments, false);
  return body as QudChapterSegments;
};

const readAudioUrl: Read<string> = (body, route) =>
  isRecord(body) && typeof body.audio_url === 'string'
    ? body.audio_url
    : badResponse(route, 'expected {audio_url}', body);

const readAlign: Read<QudAlignResponse> = (body, route) => {
  if (!isRecord(body)) return badResponse(route, 'expected {audio_id, segments}', body);
  if (typeof body.audio_id !== 'string') badResponse(route, 'audio_id is not a string', body.audio_id);
  checkSegments(route, body.segments, false);
  return body as QudAlignResponse;
};

const readTimestamps: Read<QudTimestampsResponse> = (body, route) => {
  if (!isRecord(body)) return badResponse(route, 'expected {segments}', body);
  checkSegments(route, body.segments, true);
  return body as QudTimestampsResponse;
};

/** The form fields (and JSON keys) of the alignment options, in the API's names; the API's defaults apply to the rest. */
const alignFields = (align: QudAlignOptions): Record<string, string | number> => {
  const fields: Record<string, string | number> = {};
  if (align.model !== undefined) fields.model_name = align.model;
  if (align.device !== undefined) fields.device = align.device;
  if (align.riwayah !== undefined) fields.riwayah = align.riwayah;
  if (align.padLeftMs !== undefined) fields.pad_left_ms = align.padLeftMs;
  if (align.padRightMs !== undefined) fields.pad_right_ms = align.padRightMs;
  return fields;
};

const sessionPath = (audioId: string, action: string): string => `/sessions/${encodeURIComponent(audioId)}/${action}`;

const chapterPath = (slug: string, chapter: number, action: string): string =>
  `/recitations/${encodeURIComponent(slug)}/chapters/${chapter}/${action}`;

/** `GET /recitations`: the reviewed, pre-aligned recitations. */
export const listRecitations = (options: QudClientOptions = {}): Promise<readonly QudRecitation[]> =>
  requestJson({method: 'GET', path: '/recitations'}, options, readRecitations);

/** `GET /audio-recitations`: recitations with chapter audio but no reviewed segments (for Align). */
export const listAudioRecitations = (options: QudClientOptions = {}): Promise<readonly QudRecitation[]> =>
  requestJson({method: 'GET', path: '/audio-recitations'}, options, readRecitations);

/** `GET /recitations/{slug}/chapters/{chapter}/segments?include_timestamps=true`, for a verse range (default: the whole chapter). */
export const getChapterSegments = (
  query: {readonly slug: string; readonly chapter: number; readonly verseFrom?: number; readonly verseTo?: number},
  options: QudClientOptions = {},
): Promise<QudChapterSegments> =>
  requestJson(
    {
      method: 'GET',
      path: chapterPath(query.slug, query.chapter, 'segments'),
      query: {verse_from: query.verseFrom, verse_to: query.verseTo, include_timestamps: true},
    },
    options,
    readChapter,
  );

/** `GET /recitations/{slug}/chapters/{chapter}/audio`: the whole chapter's audio URL. */
export const getChapterAudioUrl = (
  query: {readonly slug: string; readonly chapter: number},
  options: QudClientOptions = {},
): Promise<string> =>
  requestJson({method: 'GET', path: chapterPath(query.slug, query.chapter, 'audio')}, options, readAudioUrl);

/**
 * `POST /align/audio/stream`: uploads a recording and aligns it, reporting progress. Resolves with
 * the same body as the non-streaming route. The audio leaves the machine: the panel says so first.
 * Options left out take the API's defaults (`Base`, `GPU`, `hafs`, 100 ms and 200 ms of padding).
 */
export const alignAudio = (
  audio: Blob,
  fileName: string,
  align: QudAlignOptions = {},
  options: QudClientOptions = {},
): Promise<QudAlignResponse> => {
  const form = new FormData();
  form.append('audio', audio, fileName);
  for (const [key, value] of Object.entries(alignFields(align))) form.append(key, String(value));
  return requestStream(
    {method: 'POST', path: '/align/audio/stream', form, signal: align.signal},
    options,
    readAlign,
    align.onProgress,
  );
};

/** `POST /align/url/stream`: the same for a URL the aligner downloads itself. */
export const alignUrl = (
  url: string,
  align: QudAlignOptions = {},
  options: QudClientOptions = {},
): Promise<QudAlignResponse> =>
  requestStream(
    {method: 'POST', path: '/align/url/stream', json: {url, ...alignFields(align)}, signal: align.signal},
    options,
    readAlign,
    align.onProgress,
  );

/** `POST /sessions/{audioId}/timestamps`: per-word times for the session's segments (or the ones given). */
export const sessionTimestamps = (
  audioId: string,
  request: {readonly segments?: readonly unknown[] | undefined; readonly signal?: AbortSignal | undefined} = {},
  options: QudClientOptions = {},
): Promise<QudTimestampsResponse> =>
  requestJson(
    {
      method: 'POST',
      path: sessionPath(audioId, 'timestamps'),
      json: {granularity: 'words', ...(request.segments === undefined ? {} : {segments: request.segments})},
      signal: request.signal,
    },
    options,
    readTimestamps,
  );

/** `POST /sessions/{audioId}/split`: subdivide the session's segments. */
export const splitSession = (
  audioId: string,
  request: QudSplitRequest,
  options: QudClientOptions = {},
): Promise<QudAlignResponse> =>
  requestJson({method: 'POST', path: sessionPath(audioId, 'split'), json: request}, options, readAlign);

/** `POST /sessions/{audioId}/realign/stream`: re-run ASR and matching over boundaries the user supplies. */
export const realignSession = (
  audioId: string,
  request: QudRealignRequest,
  align: Pick<QudAlignOptions, 'onProgress' | 'signal'> = {},
  options: QudClientOptions = {},
): Promise<QudAlignResponse> =>
  requestStream(
    {method: 'POST', path: sessionPath(audioId, 'realign/stream'), json: request, signal: align.signal},
    options,
    readAlign,
    align.onProgress,
  );

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  alignAudio,
  alignUrl,
  DEFAULT_QUD_API,
  getChapterAudioUrl,
  getChapterSegments,
  listAudioRecitations,
  listRecitations,
  type QudProgress,
  type QudSegment,
  realignSession,
  sessionTimestamps,
  splitSession,
} from '../../../src/qud';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.resolve(__dirname, '../../fixtures/qud', name), 'utf8'));

const AUDIO_ID = '18dc30e0546544699e75a6c3afe69b05';

type Sent = {readonly url: string; readonly init: RequestInit};

/** A fetch that records what it is sent and answers with the given responses, in order. */
const fakeFetch = (...responses: Response[]) => {
  const sent: Sent[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({url: String(input), init: init ?? {}});
    if (init?.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError');
    const response = responses.shift();
    if (response === undefined) throw new Error(`unexpected request to ${String(input)}`);
    return response;
  }) as typeof globalThis.fetch;
  return {fetch, sent};
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', ...headers},
  });

/**
 * An event stream encoded once and delivered in chunks of `size` bytes, as the network may cut it:
 * an odd size cuts inside the two-byte UTF-8 of Arabic letters and marks.
 */
const events = (stream: string, size = Number.POSITIVE_INFINITY): Response => {
  const bytes = new TextEncoder().encode(stream);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
        controller.close();
      },
    }),
    {headers: {'content-type': 'text/event-stream'}},
  );
};

const progress = (stage: string, step: number): string =>
  `event: progress\ndata: ${JSON.stringify({stage, step, steps: 5})}\n\n`;

const result = (body: unknown): string => `event: result\ndata: ${JSON.stringify(body)}\n\n`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalogue routes', () => {
  it('listRecitations: GET /recitations, JSON accepted, no credentials, no token by default', async () => {
    const {fetch, sent} = fakeFetch(json(fixture('recitations.json')));
    const recitations = await listRecitations({fetch});
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(`${DEFAULT_QUD_API}/recitations`);
    expect(sent[0]!.init).toEqual({method: 'GET', headers: {accept: 'application/json'}, credentials: 'omit'});
    expect(recitations).toHaveLength(6);
    expect(recitations[0]).toMatchObject({
      slug: 'abdul_hamid_ghraio_2025_yt',
      reciter: {name_en: 'Abdul Hamid Ghraio'},
    });
    expect(recitations[0]!.chapters).toHaveLength(114);
  });

  it('sends the token as a Bearer token and takes another api base (trailing slash ignored)', async () => {
    const {fetch, sent} = fakeFetch(json(fixture('recitations.json')));
    await listRecitations({fetch, api: 'http://localhost:7860/api/v1/', token: 'hf_secret'});
    expect(sent[0]!.url).toBe('http://localhost:7860/api/v1/recitations');
    expect(sent[0]!.init.headers).toEqual({accept: 'application/json', authorization: 'Bearer hf_secret'});
  });

  it('sends no Authorization header for an empty or null token', async () => {
    const {fetch, sent} = fakeFetch(json(fixture('recitations.json')), json(fixture('recitations.json')));
    await listRecitations({fetch, token: ''});
    await listRecitations({fetch, token: null});
    expect(sent.map((s) => s.init.headers)).toEqual([{accept: 'application/json'}, {accept: 'application/json'}]);
  });

  it('uses the global fetch when none is given', async () => {
    const {fetch, sent} = fakeFetch(json(fixture('recitations.json')));
    vi.stubGlobal('fetch', fetch);
    await expect(listRecitations()).resolves.toHaveLength(6);
    expect(sent[0]!.url).toBe(`${DEFAULT_QUD_API}/recitations`);
  });

  it('listAudioRecitations: GET /audio-recitations', async () => {
    const {fetch, sent} = fakeFetch(json(fixture('recitations.json')));
    await expect(listAudioRecitations({fetch})).resolves.toHaveLength(6);
    expect(sent[0]!.url).toBe(`${DEFAULT_QUD_API}/audio-recitations`);
    expect(sent[0]!.init.method).toBe('GET');
  });

  it('getChapterSegments: the verse range and include_timestamps in the query', async () => {
    const chapter = fixture('chapter-1-segments.json');
    const {fetch, sent} = fakeFetch(json(chapter), json(chapter));
    const answer = await getChapterSegments(
      {slug: 'abdul_hamid_ghraio_2025_yt', chapter: 1, verseFrom: 1, verseTo: 7},
      {fetch},
    );
    expect(sent[0]!.url).toBe(
      `${DEFAULT_QUD_API}/recitations/abdul_hamid_ghraio_2025_yt/chapters/1/segments?verse_from=1&verse_to=7&include_timestamps=true`,
    );
    expect(answer).toEqual(chapter);
    expect(answer.segments[0]!.words).toHaveLength(4);
    await getChapterSegments({slug: 'a slug/with?odd', chapter: 2}, {fetch});
    expect(sent[1]!.url).toBe(
      `${DEFAULT_QUD_API}/recitations/a%20slug%2Fwith%3Fodd/chapters/2/segments?include_timestamps=true`,
    );
  });

  it('getChapterAudioUrl: the audio_url of the answer', async () => {
    const audioUrl =
      'https://hetchyy-quranic-universal-aligner.hf.space/preload-audio/abdul_hamid_ghraio_2025_yt/1.mp3';
    const {fetch, sent} = fakeFetch(json({recitation: 'abdul_hamid_ghraio_2025_yt', chapter: 1, audio_url: audioUrl}));
    await expect(getChapterAudioUrl({slug: 'abdul_hamid_ghraio_2025_yt', chapter: 1}, {fetch})).resolves.toBe(audioUrl);
    expect(sent[0]!.url).toBe(`${DEFAULT_QUD_API}/recitations/abdul_hamid_ghraio_2025_yt/chapters/1/audio`);
  });
});

describe('streaming routes', () => {
  it('alignAudio: uploads the recording as multipart, reports progress, resolves with the result', async () => {
    const align = fixture('align-response.json');
    const stream = [
      progress('queued_cpu', 1),
      ': keepalive\n\n',
      progress('segmenting', 2),
      progress('transcribing', 3),
      result(align),
    ].join('');
    const {fetch, sent} = fakeFetch(events(stream, 7));
    const seen: QudProgress[] = [];
    const audio = new Blob([new Uint8Array([1, 2, 3])], {type: 'audio/mpeg'});
    const answer = await alignAudio(
      audio,
      'fatiha.mp3',
      {model: 'Large', device: 'CPU', riwayah: 'hafs', padLeftMs: 50, onProgress: (p) => seen.push(p)},
      {fetch, token: 'hf_secret'},
    );
    expect(answer).toEqual(align);
    expect(seen).toEqual([
      {stage: 'queued_cpu', step: 1, steps: 5},
      {stage: 'segmenting', step: 2, steps: 5},
      {stage: 'transcribing', step: 3, steps: 5},
    ]);
    const {url, init} = sent[0]!;
    expect(url).toBe(`${DEFAULT_QUD_API}/align/audio/stream`);
    expect(init.method).toBe('POST');
    // No content-type: the browser writes the multipart boundary itself.
    expect(init.headers).toEqual({accept: 'text/event-stream', authorization: 'Bearer hf_secret'});
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get('audio') as File;
    expect(file.name).toBe('fatiha.mp3');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== 'audio'))).toEqual({
      model_name: 'Large',
      device: 'CPU',
      riwayah: 'hafs',
      pad_left_ms: '50',
    });
  });

  it('decodes a character the network cut in two: the matched_text survives every chunk size', async () => {
    const align = fixture('align-response.json') as {segments: {matched_text?: string | null}[]};
    const matched = align.segments.map((s) => s.matched_text);
    expect(matched.some((text) => typeof text === 'string' && /[\u0600-\u06ff]/.test(text))).toBe(true);
    for (const size of [1, 3, 5, 7, 11]) {
      const {fetch} = fakeFetch(events(progress('matching', 4) + result(align), size));
      const answer = await alignAudio(new Blob(['x']), 'a.mp3', {}, {fetch});
      expect(answer.segments.map((s) => s.matched_text)).toEqual(matched);
      expect(answer).toEqual(align);
    }
  });

  it('passes a progress stage it does not know through as it came', async () => {
    const {fetch} = fakeFetch(events(progress('warming_up', 1) + result(fixture('align-response.json'))));
    const seen: QudProgress[] = [];
    await alignAudio(new Blob(['x']), 'a.mp3', {onProgress: (p) => seen.push(p)}, {fetch});
    // Typed as such: a stage outside QudStage is a QudProgress too (test:types checks it).
    const unknown: QudProgress = {stage: 'warming_up', step: 1, steps: 5};
    expect(seen).toEqual([unknown]);
  });

  it("accepts null refs, as the API sends for an isti'adha or a basmala, and types them so", async () => {
    const special: QudSegment = {segment: 1, time_from: 0, time_to: 2.1, ref_from: null, ref_to: null, confidence: 1};
    const body = {audio_id: AUDIO_ID, segments: [special]};
    const {fetch} = fakeFetch(events(result(body)));
    await expect(alignAudio(new Blob(['x']), 'a.mp3', {}, {fetch})).resolves.toEqual(body);
  });

  it('alignAudio: sends only the audio when no option is given (the API defaults apply)', async () => {
    const {fetch, sent} = fakeFetch(events(result(fixture('align-response.json'))));
    await alignAudio(new Blob(['x']), 'a.wav', {}, {fetch});
    expect([...(sent[0]!.init.body as FormData).keys()]).toEqual(['audio']);
  });

  it('rejects with QUD_HTTP and the status and code of an error event', async () => {
    const error = {status: 422, code: 'no_speech', message: 'No speech was detected in the audio.', detail: null};
    const {fetch} = fakeFetch(events(`${progress('segmenting', 2)}event: error\ndata: ${JSON.stringify(error)}\n\n`));
    const seen: QudProgress[] = [];
    const promise = alignAudio(new Blob(['x']), 'a.mp3', {onProgress: (p) => seen.push(p)}, {fetch});
    await expect(promise).rejects.toMatchObject({
      name: 'MushafStudioError',
      code: 'QUD_HTTP',
      details: {status: 422, code: 'no_speech', route: 'POST /align/audio/stream'},
    });
    await expect(promise).rejects.toThrow(/POST \/align\/audio\/stream.*422.*"No speech was detected in the audio\."/);
    expect(seen).toHaveLength(1);
  });

  it('maps a 429 error event to QUD_RATE_LIMITED', async () => {
    const error = {status: 429, code: 'rate_limited', message: 'Try later.', detail: {retry_after_s: 90}};
    const {fetch} = fakeFetch(events(`event: error\ndata: ${JSON.stringify(error)}\n\n`));
    await expect(alignUrl('https://example.com/a.mp3', {}, {fetch})).rejects.toMatchObject({
      code: 'QUD_RATE_LIMITED',
      details: {status: 429, retryAfterSeconds: 90},
    });
  });

  it('rejects with QUD_BAD_RESPONSE when the stream ends without a result, or the result is malformed', async () => {
    const {fetch} = fakeFetch(
      events(progress('segmenting', 2)),
      events(result({segments: []})),
      events('event: result\ndata: {not json\n\n'),
    );
    const call = () => alignAudio(new Blob(['x']), 'a.mp3', {}, {fetch});
    await expect(call()).rejects.toMatchObject({code: 'QUD_BAD_RESPONSE'});
    await expect(call()).rejects.toThrow(/audio_id is not a string/);
    await expect(call()).rejects.toThrow(/not JSON/);
  });

  it('reads a last event that has no closing blank line, and skips progress it cannot read', async () => {
    const align = fixture('align-response.json');
    const {fetch} = fakeFetch(events(`event: progress\ndata: oops\n\nevent: result\ndata: ${JSON.stringify(align)}`));
    const seen: QudProgress[] = [];
    await expect(alignAudio(new Blob(['x']), 'a.mp3', {onProgress: (p) => seen.push(p)}, {fetch})).resolves.toEqual(
      align,
    );
    expect(seen).toEqual([]);
  });

  it('alignUrl: POST /align/url/stream with the URL and options as JSON', async () => {
    const align = fixture('align-response.json');
    const {fetch, sent} = fakeFetch(events(progress('queued_gpu', 1) + result(align)));
    await expect(
      alignUrl('https://example.com/fatiha.mp3', {model: 'Base', riwayah: 'warsh', padRightMs: 300}, {fetch}),
    ).resolves.toEqual(align);
    expect(sent[0]!.url).toBe(`${DEFAULT_QUD_API}/align/url/stream`);
    expect(sent[0]!.init.method).toBe('POST');
    expect(sent[0]!.init.headers).toEqual({accept: 'text/event-stream', 'content-type': 'application/json'});
    expect(JSON.parse(sent[0]!.init.body as string)).toEqual({
      url: 'https://example.com/fatiha.mp3',
      model_name: 'Base',
      riwayah: 'warsh',
      pad_right_ms: 300,
    });
  });

  it('realignSession: POST /sessions/{id}/realign/stream with the boundaries', async () => {
    const align = fixture('align-response.json');
    const {fetch, sent} = fakeFetch(events(progress('matching', 4) + result(align), 3));
    const seen: QudProgress[] = [];
    const request = {
      timestamps: [
        {start: 0.2, end: 3.4},
        {start: 3.5, end: 6},
      ],
      model_name: 'Large' as const,
    };
    await expect(realignSession(AUDIO_ID, request, {onProgress: (p) => seen.push(p)}, {fetch})).resolves.toEqual(align);
    expect(sent[0]!.url).toBe(`${DEFAULT_QUD_API}/sessions/${AUDIO_ID}/realign/stream`);
    expect(JSON.parse(sent[0]!.init.body as string)).toEqual(request);
    expect(seen).toEqual([{stage: 'matching', step: 4, steps: 5}]);
  });

  it('passes the signal to fetch and rethrows its abort as is', async () => {
    const {fetch, sent} = fakeFetch(events(result(fixture('align-response.json'))));
    const controller = new AbortController();
    controller.abort();
    const promise = alignAudio(new Blob(['x']), 'a.mp3', {signal: controller.signal}, {fetch});
    await expect(promise).rejects.toMatchObject({name: 'AbortError'});
    expect(sent[0]!.init.signal).toBe(controller.signal);
  });

  it('stops reading the stream when the signal aborts mid-way', async () => {
    // The progress event in a chunk of its own, the result in the next.
    const first = progress('segmenting', 2);
    const {fetch} = fakeFetch(events(first + result(fixture('align-response.json')), first.length));
    const controller = new AbortController();
    const promise = alignAudio(
      new Blob(['x']),
      'a.mp3',
      {signal: controller.signal, onProgress: () => controller.abort()},
      {fetch},
    );
    await expect(promise).rejects.toMatchObject({name: 'AbortError'});
  });
});

describe('session routes', () => {
  it('sessionTimestamps: POST /sessions/{id}/timestamps asking for words', async () => {
    const timestamps = fixture('timestamps-response.json');
    const {fetch, sent} = fakeFetch(json(timestamps), json(timestamps));
    await expect(sessionTimestamps(AUDIO_ID, {}, {fetch})).resolves.toEqual(timestamps);
    expect(sent[0]!.url).toBe(`${DEFAULT_QUD_API}/sessions/${AUDIO_ID}/timestamps`);
    expect(sent[0]!.init.method).toBe('POST');
    expect(sent[0]!.init.headers).toEqual({accept: 'application/json', 'content-type': 'application/json'});
    expect(JSON.parse(sent[0]!.init.body as string)).toEqual({granularity: 'words'});
    const segments = [{segment: 1, time_from: 0.22, time_to: 3.46}];
    await sessionTimestamps(AUDIO_ID, {segments}, {fetch});
    expect(JSON.parse(sent[1]!.init.body as string)).toEqual({granularity: 'words', segments});
  });

  it('splitSession: POST /sessions/{id}/split with the request as given', async () => {
    const split = fixture('split-response.json');
    const {fetch, sent} = fakeFetch(json(split));
    const answer = await splitSession(AUDIO_ID, {max_verses: 1, max_words: 2, require_stop_sign: false}, {fetch});
    expect(answer).toEqual(split);
    expect(answer.segments).toHaveLength(11);
    expect(sent[0]!.url).toBe(`${DEFAULT_QUD_API}/sessions/${AUDIO_ID}/split`);
    expect(JSON.parse(sent[0]!.init.body as string)).toEqual({max_verses: 1, max_words: 2, require_stop_sign: false});
  });
});

describe('errors', () => {
  it('maps HTTP 429 to QUD_RATE_LIMITED with detail.retry_after_s', async () => {
    const body = {code: 'rate_limited', message: 'CPU fair-use limit reached.', detail: {retry_after_s: 42}};
    const {fetch} = fakeFetch(json(body, 429));
    const promise = listRecitations({fetch});
    await expect(promise).rejects.toMatchObject({
      code: 'QUD_RATE_LIMITED',
      details: {status: 429, code: 'rate_limited', retryAfterSeconds: 42, route: 'GET /recitations'},
    });
    await expect(promise).rejects.toThrow(/Retry in 42 s/);
  });

  it('falls back to the Retry-After header, else null, for a 429', async () => {
    const {fetch} = fakeFetch(
      json({code: 'rate_limited', message: 'Slow down.'}, 429, {'retry-after': '30'}),
      json('Too Many Requests', 429),
    );
    await expect(listRecitations({fetch})).rejects.toMatchObject({details: {retryAfterSeconds: 30}});
    await expect(listRecitations({fetch})).rejects.toMatchObject({
      code: 'QUD_RATE_LIMITED',
      details: {retryAfterSeconds: null, code: null},
    });
  });

  it('maps HTTP 500 to QUD_HTTP naming the route and quoting the API', async () => {
    const body = {code: 'internal_error', message: 'Something broke.', detail: null};
    const {fetch} = fakeFetch(json(body, 500));
    const promise = splitSession(AUDIO_ID, {}, {fetch});
    await expect(promise).rejects.toMatchObject({
      code: 'QUD_HTTP',
      details: {status: 500, code: 'internal_error', route: `POST /sessions/${AUDIO_ID}/split`},
    });
    await expect(promise).rejects.toThrow(
      `QUD POST /sessions/${AUDIO_ID}/split failed with HTTP 500 (internal_error: "Something broke.").`,
    );
  });

  it('maps an error answer that is not the API error body to QUD_HTTP with a null code', async () => {
    const {fetch} = fakeFetch(json('<html>Bad gateway</html>', 502));
    await expect(sessionTimestamps(AUDIO_ID, {}, {fetch})).rejects.toMatchObject({
      code: 'QUD_HTTP',
      details: {status: 502, code: null},
    });
  });

  it('says what to do on a 402 (GPU quota spent): device CPU or a Hugging Face token, still QUD_HTTP', async () => {
    const body = {code: 'gpu_quota_exhausted', message: 'The free GPU quota is exhausted.', detail: null};
    const event = {status: 402, ...body};
    const {fetch} = fakeFetch(json(body, 402), events(`event: error\ndata: ${JSON.stringify(event)}\n\n`));
    for (const promise of [
      alignUrl('https://example.com/a.mp3', {}, {fetch}),
      alignAudio(new Blob(['x']), 'a.mp3', {}, {fetch}),
    ]) {
      const error = await promise.catch((e: unknown) => e);
      expect(error).toMatchObject({code: 'QUD_HTTP', details: {status: 402, code: 'gpu_quota_exhausted'}});
      expect((error as Error).message).toMatch(/HTTP 402 \(gpu_quota_exhausted: "The free GPU quota is exhausted\."\)/);
      expect((error as Error).message).toContain("device: 'CPU'");
      expect((error as Error).message).toContain('Hugging Face token');
    }
  });

  it('quotes the field and the message of a 422 validation error', async () => {
    const detail = [
      {loc: ['body', 'device'], msg: "Input should be 'GPU' or 'CPU'", type: 'enum'},
      {loc: ['body', 'pad_left_ms'], msg: 'Input should be a valid integer', type: 'int_parsing'},
    ];
    const {fetch} = fakeFetch(json({detail}, 422), json({detail: [{msg: 'Field required'}]}, 422));
    const promise = alignUrl('https://example.com/a.mp3', {}, {fetch});
    await expect(promise).rejects.toMatchObject({code: 'QUD_HTTP', details: {status: 422, code: null, detail}});
    await expect(promise).rejects.toThrow(
      `QUD POST /align/url/stream failed with HTTP 422 (the request was refused: body.device: "Input should be 'GPU' or 'CPU'" (and 1 more)).`,
    );
    await expect(sessionTimestamps(AUDIO_ID, {}, {fetch})).rejects.toThrow(/refused: "Field required"\)/);
  });

  it('says a session may have expired on a 404', async () => {
    const {fetch} = fakeFetch(json({code: 'session_not_found', message: 'Unknown or expired audio_id.'}, 404));
    await expect(splitSession(AUDIO_ID, {}, {fetch})).rejects.toThrow(/expires after a few hours/);
  });

  it('maps a malformed 2xx body to QUD_BAD_RESPONSE', async () => {
    const {fetch} = fakeFetch(
      json({recitations: 'all of them'}),
      json('not json at all'),
      json({recitation: 'x', chapter: 1, verse_from: 1, verse_to: 7, clip_start: 0, segments: []}),
      json({audio_id: AUDIO_ID, segments: [{segment: 1, time_from: 0, time_to: 1, confidence: 'high'}]}),
      json({segments: [{segment: 1, words: [['1:1:1', 0]]}]}),
      json({chapter: 1}),
    );
    await expect(listRecitations({fetch})).rejects.toMatchObject({code: 'QUD_BAD_RESPONSE'});
    await expect(listRecitations({fetch})).rejects.toThrow(/the body is not JSON/);
    await expect(getChapterSegments({slug: 'x', chapter: 1}, {fetch})).rejects.toThrow(/audio_url is not a string/);
    await expect(splitSession(AUDIO_ID, {}, {fetch})).rejects.toThrow(/segments\[0\]\.confidence is not a number/);
    await expect(sessionTimestamps(AUDIO_ID, {}, {fetch})).rejects.toThrow(/segments\[0\]\.words\[0\] is neither/);
    await expect(getChapterAudioUrl({slug: 'x', chapter: 1}, {fetch})).rejects.toMatchObject({
      code: 'QUD_BAD_RESPONSE',
      details: {route: 'GET /recitations/x/chapters/1/audio'},
    });
  });

  it('maps a network failure to QUD_HTTP with status 0', async () => {
    const fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof globalThis.fetch;
    await expect(listRecitations({fetch})).rejects.toMatchObject({code: 'QUD_HTTP', details: {status: 0, code: null}});
    await expect(listRecitations({fetch})).rejects.toThrow(
      /Could not reach QUD for GET \/recitations.*Failed to fetch/,
    );
  });
});

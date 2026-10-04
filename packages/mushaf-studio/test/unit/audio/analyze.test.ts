// analyzeAudio() with `fetch` and Web Audio stubbed: decoding, the per-URL cache on globalThis, the
// errors that name the URL, and an aborted wait that leaves the shared analysis alone.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {analyzeAudio, clearAudioAnalysisCache} from '../../../src/audio';
import {concat, silence, sine} from './signals';

const decoded = [concat(silence(0.5), sine(997, 0.1, 2))];

class FakeOfflineAudioContext {
  static decodes = 0;
  constructor(
    readonly channels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {}
  async decodeAudioData(bytes: ArrayBuffer) {
    FakeOfflineAudioContext.decodes++;
    if (bytes.byteLength === 0) throw new Error('EncodingError');
    return {
      numberOfChannels: decoded.length,
      sampleRate: this.sampleRate,
      getChannelData: (channel: number) => decoded[channel]!,
    };
  }
}

const fetchOk = () =>
  vi.fn(async (url: string) => new Response(url.includes('empty') ? new Uint8Array(0) : new Uint8Array(16)));

beforeEach(() => {
  clearAudioAnalysisCache();
  FakeOfflineAudioContext.decodes = 0;
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
});
afterEach(() => vi.unstubAllGlobals());

describe('analyzeAudio', () => {
  it('fetches, decodes at 48 kHz and measures', async () => {
    const fetch = fetchOk();
    vi.stubGlobal('fetch', fetch);
    const analysis = await analyzeAudio('/static/a.mp3', {fps: 30});
    expect(fetch).toHaveBeenCalledWith('/static/a.mp3');
    expect(analysis).toMatchObject({durationSeconds: 2.5, firstSoundSeconds: 0.5, fps: 30});
    expect(analysis.levels).toHaveLength(75);
    expect(analysis.lufs).toBeLessThan(-22);
  });

  it('caches per URL and fps on globalThis', async () => {
    const fetch = fetchOk();
    vi.stubGlobal('fetch', fetch);
    const [first, second] = await Promise.all([
      analyzeAudio('/static/a.mp3', {fps: 30}),
      analyzeAudio('/static/a.mp3', {fps: 30}),
    ]);
    expect(second).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await analyzeAudio('/static/a.mp3', {fps: 25})).levels).toHaveLength(63);
    await analyzeAudio('/static/b.mp3', {fps: 30});
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((globalThis as Record<string, unknown>).__mushafStudioAudioAnalysis).toBeInstanceOf(Map);
  });

  it('fails with BAD_STUDIO_PROP naming the URL, and tries again next time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', {status: 404})),
    );
    await expect(analyzeAudio('/static/missing.mp3', {fps: 30})).rejects.toMatchObject({
      code: 'AUDIO_ANALYSIS_FAILED',
      details: {url: '/static/missing.mp3', status: 404},
      message: expect.stringContaining('/static/missing.mp3'),
    });
    const fetch = fetchOk();
    vi.stubGlobal('fetch', fetch);
    await expect(analyzeAudio('/static/missing.mp3', {fps: 30})).resolves.toMatchObject({fps: 30});
  });

  it('fails on a network error and on a file it cannot decode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(analyzeAudio('https://example.test/a.mp3', {fps: 30})).rejects.toMatchObject({
      code: 'AUDIO_ANALYSIS_FAILED',
    });
    vi.stubGlobal('fetch', fetchOk());
    await expect(analyzeAudio('/static/empty.mp3', {fps: 30})).rejects.toMatchObject({
      code: 'AUDIO_ANALYSIS_FAILED',
      message: expect.stringContaining('could not be decoded'),
    });
  });

  it('fails without Web Audio, saying where it runs', async () => {
    vi.stubGlobal('OfflineAudioContext', undefined);
    vi.stubGlobal('fetch', fetchOk());
    await expect(analyzeAudio('/static/a.mp3', {fps: 30})).rejects.toMatchObject({
      code: 'AUDIO_ANALYSIS_FAILED',
      message: expect.stringContaining('calculateMetadata()'),
    });
  });

  it('abandons the wait on abort, and the analysis still lands in the cache', async () => {
    const fetch = fetchOk();
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const waiting = analyzeAudio('/static/a.mp3', {fps: 30, signal: controller.signal});
    controller.abort(new Error('superseded'));
    await expect(waiting).rejects.toThrow('superseded');
    const already = new AbortController();
    already.abort(new Error('too late'));
    await expect(analyzeAudio('/static/a.mp3', {fps: 30, signal: already.signal})).rejects.toThrow('too late');
    await expect(analyzeAudio('/static/a.mp3', {fps: 30})).resolves.toMatchObject({fps: 30});
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

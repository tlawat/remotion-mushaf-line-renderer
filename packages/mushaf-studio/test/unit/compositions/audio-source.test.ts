// Where the recording plays from and what the cleanup measures it with: the timings' catalogue clip
// when `audioFile` is missing from public/ (`resolveAudioSource()`), the sidecar's persisted summary
// instead of an analysis when the glow is off, and the URL the compositions play (`recordingUrl()`).
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {defaultBackground} from '../../../src/background/schema';
import {
  type AudioCleanupOptions,
  resolveAudioCleanup,
  resolveAudioSource,
  SAMPLE_AUDIO_FILE,
  SAMPLE_COMMAND,
} from '../../../src/compositions/extras';
import {defaultMushafRecitationProps} from '../../../src/compositions/recitation/schema';
import {fileUrl, isHttpUrl, recordingUrl} from '../../../src/compositions/shared';
import {MushafStudioError} from '../../../src/errors';
import {defaultMushafPageProps} from '../../../src/page/schema';
import type {AlignmentSidecar} from '../../../src/types';
import {defaultMushafAyahTextProps} from '../../../src/unicode/schema';

const mocks = vi.hoisted(() => ({analyzeAudio: vi.fn()}));
vi.mock('../../../src/audio/analyze', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/audio/analyze')>()),
  analyzeAudio: (...args: unknown[]) => mocks.analyzeAudio(...args),
}));

const CLIP =
  'https://hetchyy-quranic-universal-aligner.hf.space/preload-audio/abdul_hamid_ghraio_2025_yt/1.mp3?start_ms=2909&end_ms=30695';
const SUMMARY = {lufs: -18.79, peak: 0.437768, firstSoundSeconds: 0.5, durationSeconds: 27.8};
const ANALYSIS = {lufs: -20, peak: 0.5, durationSeconds: 31, firstSoundSeconds: 3.2, fps: 30, levels: [0.5, 1]};
const sidecar = (changes: Partial<AlignmentSidecar> = {}): AlignmentSidecar => ({
  version: 1,
  source: 'qud-catalogue',
  recitation: {slug: 'r', chapter: 1, verseFrom: 1, verseTo: 7, clipStart: 2.909, audioUrl: CLIP},
  segments: [],
  words: [],
  edits: [],
  ...changes,
});
const staticFile = (path: string) => `https://studio.test/${path}`;

/** A server holding `present` (paths under the studio's origin); HEAD answers `headStatus` for the rest when given. */
const server = (present: readonly string[], options: {readonly headStatus?: number} = {}) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const there = present.some((path) => url === staticFile(path));
    if (init?.method === 'HEAD' && options.headStatus !== undefined)
      return new Response(null, {status: options.headStatus});
    return new Response(there ? 'ID3' : 'Not found', {status: there ? 200 : 404});
  });

beforeEach(() => {
  mocks.analyzeAudio.mockReset();
  mocks.analyzeAudio.mockResolvedValue(ANALYSIS);
});

describe('the defaults', () => {
  it('play the sample’s recording from public/, in every composition with audio', () => {
    expect(SAMPLE_AUDIO_FILE).toBe('mushaf-studio/fatiha/audio.mp3');
    for (const props of [defaultMushafRecitationProps, defaultMushafAyahTextProps, defaultMushafPageProps]) {
      expect(props.audioFile).toBe(SAMPLE_AUDIO_FILE);
      expect(props.timingsFile).toBe('mushaf-studio/fatiha/timings.json');
    }
    expect(SAMPLE_COMMAND).toBe('bun run --cwd apps/mushaf-studio sample');
  });
});

describe('resolveAudioSource', () => {
  it('streams the timings’ clip when audioFile is missing from public/, and says how to download it', async () => {
    const fetch = server([]);
    const source = await resolveAudioSource({audioFile: SAMPLE_AUDIO_FILE, sidecar: sidecar(), staticFile, fetch});
    expect(source.src).toBe(CLIP);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      staticFile(SAMPLE_AUDIO_FILE),
      expect.objectContaining({method: 'HEAD', cache: 'no-store'}),
    );
    expect(source.warning).toContain('audioFile "mushaf-studio/fatiha/audio.mp3" is not in public/');
    expect(source.warning).toContain(CLIP);
    expect(source.warning).toContain('`bun run --cwd apps/mushaf-studio sample`');
  });

  it('says where to save the clip for another file, without the repository’s command', async () => {
    const source = await resolveAudioSource({
      audioFile: "mushaf-studio/p/it's.mp3",
      sidecar: sidecar(),
      staticFile,
      fetch: server([]),
    });
    expect(source.warning).toContain(
      `streams instead (${CLIP}). Download that clip once and save it as public/mushaf-studio/p/it's.mp3, or point audioFile at your recording.`,
    );
    expect(source.warning).not.toContain(SAMPLE_COMMAND);
  });

  it('plays audioFile when it is there', async () => {
    const fetch = server([SAMPLE_AUDIO_FILE]);
    expect(await resolveAudioSource({audioFile: SAMPLE_AUDIO_FILE, sidecar: sidecar(), staticFile, fetch})).toEqual({
      src: null,
      warning: null,
    });
  });

  it('asks nothing for an empty audioFile, a URL, or timings without a clip', async () => {
    const {recitation: _, ...rest} = sidecar();
    const noClip: AlignmentSidecar = rest;
    const fetch = server([]);
    const asIs = {src: null, warning: null};
    expect(await resolveAudioSource({audioFile: '', sidecar: sidecar(), staticFile, fetch})).toEqual(asIs);
    expect(
      await resolveAudioSource({audioFile: 'https://cdn.test/a.mp3', sidecar: sidecar(), staticFile, fetch}),
    ).toEqual(asIs);
    expect(await resolveAudioSource({audioFile: 'a.mp3', staticFile, fetch})).toEqual(asIs);
    expect(await resolveAudioSource({audioFile: 'a.mp3', sidecar: noClip, staticFile, fetch})).toEqual(asIs);
    const notUrl = sidecar();
    const badClip = {...notUrl, recitation: {...notUrl.recitation!, audioUrl: 'clip.mp3'}};
    expect(await resolveAudioSource({audioFile: 'a.mp3', sidecar: badClip, staticFile, fetch})).toEqual(asIs);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks with a one-byte GET where HEAD is not allowed', async () => {
    const fetch = server([], {headStatus: 405});
    const source = await resolveAudioSource({audioFile: 'a.mp3', sidecar: sidecar(), staticFile, fetch});
    expect(source.src).toBe(CLIP);
    expect(fetch).toHaveBeenLastCalledWith(
      staticFile('a.mp3'),
      expect.objectContaining({method: 'GET', headers: {Range: 'bytes=0-0'}}),
    );
    const there = await resolveAudioSource({
      audioFile: 'a.mp3',
      sidecar: sidecar(),
      staticFile,
      fetch: server(['a.mp3'], {headStatus: 405}),
    });
    expect(there.src).toBeNull();
  });

  it('keeps audioFile for any answer but 404, and when the server cannot be asked', async () => {
    const options = {audioFile: 'a.mp3', sidecar: sidecar(), staticFile};
    expect((await resolveAudioSource({...options, fetch: server([], {headStatus: 500})})).src).toBeNull();
    expect((await resolveAudioSource({...options, fetch: server([], {headStatus: 403})})).src).toBeNull();
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await resolveAudioSource({...options, fetch: offline})).toEqual({src: null, warning: null});
  });

  it('leaves a path staticFile() refuses to the composition', async () => {
    const fetch = server([]);
    const refuse = () => {
      throw new TypeError('staticFile() does not support relative paths');
    };
    expect(await resolveAudioSource({audioFile: './a.mp3', sidecar: sidecar(), staticFile: refuse, fetch})).toEqual({
      src: null,
      warning: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets an abort through', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError');
    });
    await expect(
      resolveAudioSource({audioFile: 'a.mp3', sidecar: sidecar(), staticFile, fetch, signal: controller.signal}),
    ).rejects.toThrow('Aborted');
  });

  it('uses the global fetch by default', async () => {
    const fetch = server([]);
    vi.stubGlobal('fetch', fetch);
    try {
      expect((await resolveAudioSource({audioFile: 'a.mp3', sidecar: sidecar(), staticFile})).src).toBe(CLIP);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

const cleanupOptions = (changes: Partial<AudioCleanupOptions> = {}): AudioCleanupOptions => ({
  audioFile: SAMPLE_AUDIO_FILE,
  audio: defaultMushafRecitationProps.audio,
  background: defaultBackground,
  offsetSeconds: 0,
  latestSeconds: 10,
  endSeconds: 27.559,
  fps: 30,
  staticFile,
  fetch: server([SAMPLE_AUDIO_FILE]),
  ...changes,
});
const glow = {...defaultBackground, glow: {enabled: true, color: '#fff', strength: 0.5}};

describe('resolveAudioCleanup', () => {
  it('normalises from the sidecar’s summary with the glow off: no analysis, no download', async () => {
    const result = await resolveAudioCleanup(cleanupOptions({sidecar: sidecar({audio: SUMMARY})}));
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    // gainFor({lufs: -18.79, peak: 0.437768}, -14): +4.79 dB, under the -1 dBFS ceiling (+6.18 dB).
    expect(result).toEqual({audio: {gain: 1.7358, trimSeconds: 0, levels: []}, warning: null, src: null});
  });

  it('trims the silence from the summary’s first sound', async () => {
    const audio = {...defaultMushafRecitationProps.audio, trimSilence: true};
    const result = await resolveAudioCleanup(cleanupOptions({audio, sidecar: sidecar({audio: SUMMARY})}));
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    expect(result.audio.trimSeconds).toBe(0.35);
  });

  it('still analyses for the glow’s levels, and when the summary is missing or not one', async () => {
    const withGlow = await resolveAudioCleanup(cleanupOptions({background: glow, sidecar: sidecar({audio: SUMMARY})}));
    expect(mocks.analyzeAudio).toHaveBeenCalledTimes(1);
    expect(withGlow.audio.levels).toEqual([0.5, 1]);
    await resolveAudioCleanup(cleanupOptions({sidecar: sidecar()}));
    const broken = {...sidecar(), audio: {lufs: 'loud'}} as unknown as AlignmentSidecar;
    const result = await resolveAudioCleanup(cleanupOptions({sidecar: broken}));
    expect(mocks.analyzeAudio).toHaveBeenCalledTimes(3);
    expect(mocks.analyzeAudio).toHaveBeenLastCalledWith(
      staticFile(SAMPLE_AUDIO_FILE),
      expect.objectContaining({fps: 30}),
    );
    expect(result.audio.gain).toBe(1.7825);
  });

  it('plays and analyses the timings’ clip when audioFile is missing, with the warning', async () => {
    const result = await resolveAudioCleanup(cleanupOptions({background: glow, sidecar: sidecar(), fetch: server([])}));
    expect(result.src).toBe(CLIP);
    expect(mocks.analyzeAudio).toHaveBeenCalledWith(CLIP, expect.objectContaining({fps: 30}));
    expect(result.warning).toContain(SAMPLE_COMMAND);
  });

  it('gives the clip and the warning even when nothing needs an analysis', async () => {
    const audio = {...defaultMushafRecitationProps.audio, normalize: false};
    const result = await resolveAudioCleanup(cleanupOptions({audio, sidecar: sidecar(), fetch: server([])}));
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
    expect(result.audio).toEqual({gain: 1, trimSeconds: 0, levels: []});
    expect(result.src).toBe(CLIP);
    expect(result.warning).toContain('is not in public/');
  });

  it('says both when the clip streams and cannot be analysed', async () => {
    mocks.analyzeAudio.mockRejectedValue(new MushafStudioError('AUDIO_ANALYSIS_FAILED', 'No Web Audio here.'));
    const result = await resolveAudioCleanup(cleanupOptions({sidecar: sidecar(), fetch: server([])}));
    expect(result.audio).toEqual({gain: 1, trimSeconds: 0, levels: []});
    expect(result.warning).toMatch(/is not in public\/.*\. No Web Audio here\.$/);
    expect(result.src).toBe(CLIP);
  });

  it('is what it was without a sidecar: no request, the analysis of audioFile', async () => {
    const fetch = server([]);
    const result = await resolveAudioCleanup(cleanupOptions({audioFile: 'audio.mp3', fetch}));
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.analyzeAudio).toHaveBeenCalledWith(staticFile('audio.mp3'), expect.objectContaining({fps: 30}));
    expect(result).toEqual({audio: {gain: 1.7825, trimSeconds: 0, levels: []}, warning: null, src: null});
  });
});

describe('recordingUrl', () => {
  it('plays resolved.audioSrc when calculateMetadata() set it, else audioFile', () => {
    expect(recordingUrl(SAMPLE_AUDIO_FILE, {audioSrc: CLIP}, staticFile)).toBe(CLIP);
    expect(recordingUrl(SAMPLE_AUDIO_FILE, {audioSrc: null}, staticFile)).toBe(staticFile(SAMPLE_AUDIO_FILE));
    expect(recordingUrl(SAMPLE_AUDIO_FILE, {audioSrc: ''}, staticFile)).toBe(staticFile(SAMPLE_AUDIO_FILE));
    expect(recordingUrl(SAMPLE_AUDIO_FILE, {}, staticFile)).toBe(staticFile(SAMPLE_AUDIO_FILE));
    expect(recordingUrl(SAMPLE_AUDIO_FILE, null, staticFile)).toBe(staticFile(SAMPLE_AUDIO_FILE));
    expect(recordingUrl('https://cdn.test/a.mp3', undefined, staticFile)).toBe('https://cdn.test/a.mp3');
  });

  it('tells a URL from a public/ path', () => {
    expect(isHttpUrl('HTTPS://cdn.test/a.mp3')).toBe(true);
    expect(isHttpUrl('http://cdn.test/a.mp3')).toBe(true);
    expect(isHttpUrl('mushaf-studio/a.mp3')).toBe(false);
    expect(isHttpUrl('ftp://cdn.test/a.mp3')).toBe(false);
    expect(fileUrl('mushaf-studio/a.mp3', staticFile)).toBe(staticFile('mushaf-studio/a.mp3'));
  });
});

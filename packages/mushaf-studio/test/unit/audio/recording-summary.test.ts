// The panel measures a new recording when it saves its timings (`withRecordingSummary()` in
// `saveRecording()`), best effort: the summary goes into `alignment.audio`, and timings without a
// sidecar, a recording that cannot be measured or one that takes too long are saved as they are.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defaultMushafRecitationProps} from '../../../src/compositions/recitation/schema';
import {SUMMARY_TIMEOUT_MS, saveRecording, withRecordingSummary} from '../../../src/studio/recording';
import type {AlignmentSidecar, StudioTimings} from '../../../src/types';

const mocks = vi.hoisted(() => ({
  analyzeAudio: vi.fn(),
  writeJsonFile: vi.fn(async (path: string, _value: unknown) => path),
  patchProps: vi.fn(async () => undefined),
}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  staticFile: (path: string) => `https://studio.test/${path}`,
}));
vi.mock('../../../src/audio/analyze', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/audio/analyze')>()),
  analyzeAudio: (...args: unknown[]) => mocks.analyzeAudio(...args),
}));
vi.mock('../../../src/studio/studio-api', () => ({
  patchProps: mocks.patchProps,
  projectPath: (project: string | undefined, name: string) => `mushaf-studio/${project ?? 'default'}/${name}`,
  writeFile: vi.fn(async (path: string) => path),
  writeJsonFile: mocks.writeJsonFile,
}));
vi.mock('../../../src/studio/store', () => ({
  describeError: (error: unknown) => String(error),
  setStudioState: vi.fn(),
  t: (key: string) => key,
}));

const ANALYSIS = {lufs: -18.79, peak: 0.437768, durationSeconds: 27.8, firstSoundSeconds: 0.06, fps: 30, levels: [0]};
const SUMMARY = {lufs: -18.79, peak: 0.437768, firstSoundSeconds: 0.06, durationSeconds: 27.8};
const sidecar: AlignmentSidecar = {version: 1, source: 'qud-catalogue', segments: [], words: [], edits: []};
const timings = (alignment: AlignmentSidecar | null = sidecar): StudioTimings => ({
  version: 1,
  surah: 1,
  ayat: [{ayah: 2, start: 0.3, end: 3.5}],
  ...(alignment ? {alignment} : {}),
});

beforeEach(() => {
  mocks.analyzeAudio.mockReset();
  mocks.analyzeAudio.mockResolvedValue(ANALYSIS);
  mocks.writeJsonFile.mockClear();
  mocks.patchProps.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('withRecordingSummary', () => {
  it('measures the recording through staticFile() and keeps the summary in the sidecar', async () => {
    const measured = await withRecordingSummary(timings(), 'mushaf-studio/p/clip.mp3');
    expect(mocks.analyzeAudio).toHaveBeenCalledWith(
      'https://studio.test/mushaf-studio/p/clip.mp3',
      expect.objectContaining({fps: 30, signal: expect.any(AbortSignal)}),
    );
    expect(measured.alignment!.audio).toEqual(SUMMARY);
    expect(measured.ayat).toEqual(timings().ayat);
  });

  it('measures a URL as it is', async () => {
    await withRecordingSummary(timings(), 'https://cdn.test/clip.mp3?start_ms=1');
    expect(mocks.analyzeAudio.mock.calls[0]![0]).toBe('https://cdn.test/clip.mp3?start_ms=1');
  });

  it('saves timings without a sidecar, or without a recording, as they are, unmeasured', async () => {
    const bare = timings(null);
    expect(await withRecordingSummary(bare, 'clip.mp3')).toBe(bare);
    const withSidecar = timings();
    expect(await withRecordingSummary(withSidecar, '')).toBe(withSidecar);
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
  });

  it('saves the timings as they are when the recording cannot be measured', async () => {
    const original = timings();
    mocks.analyzeAudio.mockRejectedValue(new Error('AUDIO_ANALYSIS_FAILED'));
    expect(await withRecordingSummary(original, 'clip.mp3')).toBe(original);
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    mocks.analyzeAudio.mockImplementation(
      (_url: string, options: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () => reject(options.signal.reason)),
        ),
    );
    const original = timings();
    const pending = withRecordingSummary(original, 'clip.mp3');
    await vi.advanceTimersByTimeAsync(SUMMARY_TIMEOUT_MS);
    expect(await pending).toBe(original);
  });

  it('takes its analyser, staticFile and timeout from the options', async () => {
    const analyze = vi.fn(async () => ({...ANALYSIS, lufs: null}));
    const measured = await withRecordingSummary(timings(), 'clip.mp3', {
      analyze,
      staticFile: (path) => `/public/${path}`,
      timeoutMs: 10,
    });
    expect(analyze).toHaveBeenCalledWith('/public/clip.mp3', expect.objectContaining({fps: 30}));
    expect(measured.alignment!.audio!.lufs).toBeNull();
    expect(mocks.analyzeAudio).not.toHaveBeenCalled();
  });
});

describe('saveRecording', () => {
  const save = (alignment: AlignmentSidecar | null = sidecar) =>
    saveRecording({
      compositionId: 'MushafRecitation',
      props: defaultMushafRecitationProps,
      project: 'p',
      audioFile: 'mushaf-studio/p/clip.mp3',
      timings: timings(alignment),
      timingsName: 'clip.timings.json',
    });

  it('writes the timings with the recording’s summary, then points the composition at them', async () => {
    expect(await save()).toBe('mushaf-studio/p/clip.timings.json');
    const written = mocks.writeJsonFile.mock.calls[0]![1] as StudioTimings;
    expect(written.alignment!.audio).toEqual(SUMMARY);
    expect(mocks.patchProps).toHaveBeenCalledWith(
      'MushafRecitation',
      expect.objectContaining({
        audioFile: 'mushaf-studio/p/clip.mp3',
        timingsFile: 'mushaf-studio/p/clip.timings.json',
      }),
    );
  });

  it('still saves when the recording cannot be measured', async () => {
    mocks.analyzeAudio.mockRejectedValue(new Error('no Web Audio'));
    await save();
    const written = mocks.writeJsonFile.mock.calls[0]![1] as StudioTimings;
    expect(written.alignment).toEqual(sidecar);
    expect(written.alignment).not.toHaveProperty('audio');
    expect(mocks.patchProps).toHaveBeenCalledTimes(1);
  });
});

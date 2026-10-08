// The recording's summary a timings file keeps (`alignment.audio`): picked from an analysis, read
// back from JSON (anything that is not one ignored), put into the sidecar; and forgetting one URL's
// cached analyses so the panel measures a file rewritten under the same name again.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  analyzeAudio,
  audioSummaryFrom,
  audioSummaryOf,
  clearAudioAnalysisCache,
  forgetAudioAnalysis,
  gainFor,
  withAudioSummary,
} from '../../../src/audio';
import type {AlignmentSidecar, StudioTimings} from '../../../src/types';
import {concat, silence, sine} from './signals';

const SUMMARY = {lufs: -18.79, peak: 0.437768, firstSoundSeconds: 0.06, durationSeconds: 27.808417};

const sidecar: AlignmentSidecar = {version: 1, source: 'qud-catalogue', segments: [], words: [], edits: []};
const timings = (alignment?: AlignmentSidecar): StudioTimings => ({
  version: 1,
  surah: 1,
  ayat: [{ayah: 1, start: 0, end: 1}],
  ...(alignment ? {alignment} : {}),
});

describe('audioSummaryOf', () => {
  it('keeps loudness, true peak, the first sound and the length, under the analysis’s names', () => {
    const analysis = {...SUMMARY, fps: 30, levels: [0, 1]};
    expect(audioSummaryOf(analysis)).toEqual(SUMMARY);
    expect(Object.keys(audioSummaryOf(analysis))).toEqual(['lufs', 'peak', 'firstSoundSeconds', 'durationSeconds']);
    // It is what gainFor() reads.
    expect(gainFor(audioSummaryOf(analysis), -14)).toBe(gainFor(analysis, -14));
  });
});

describe('audioSummaryFrom', () => {
  it('reads a summary, silence (null loudness and first sound) included', () => {
    expect(audioSummaryFrom(SUMMARY)).toEqual(SUMMARY);
    const silent = {lufs: null, peak: 0, firstSoundSeconds: null, durationSeconds: 0};
    expect(audioSummaryFrom(silent)).toEqual(silent);
    // Extra keys are left behind.
    expect(audioSummaryFrom({...SUMMARY, levels: [1]})).toEqual(SUMMARY);
  });

  it('ignores what is not one', () => {
    for (const value of [undefined, null, 'loud', [], {}, [SUMMARY]]) expect(audioSummaryFrom(value)).toBeNull();
    expect(audioSummaryFrom({...SUMMARY, lufs: '-18'})).toBeNull();
    expect(audioSummaryFrom({...SUMMARY, lufs: Number.NaN})).toBeNull();
    expect(audioSummaryFrom({...SUMMARY, peak: -0.1})).toBeNull();
    expect(audioSummaryFrom({...SUMMARY, peak: null})).toBeNull();
    expect(audioSummaryFrom({...SUMMARY, firstSoundSeconds: -1})).toBeNull();
    expect(audioSummaryFrom({...SUMMARY, durationSeconds: Number.POSITIVE_INFINITY})).toBeNull();
    const {durationSeconds: _, ...noDuration} = SUMMARY;
    expect(audioSummaryFrom(noDuration)).toBeNull();
  });
});

describe('withAudioSummary', () => {
  it('puts the summary last in the sidecar, replacing an earlier one', () => {
    const first = withAudioSummary(timings(sidecar), SUMMARY);
    expect(first.alignment!.audio).toEqual(SUMMARY);
    expect(Object.keys(first.alignment!).at(-1)).toBe('audio');
    const again = withAudioSummary(first, {...SUMMARY, lufs: -20});
    expect(again.alignment!.audio!.lufs).toBe(-20);
    expect(again.alignment).toEqual({...sidecar, audio: {...SUMMARY, lufs: -20}});
    // The timings themselves are untouched.
    expect(again.ayat).toBe(first.ayat);
  });

  it('leaves timings without a sidecar as they are', () => {
    const bare = timings();
    expect(withAudioSummary(bare, SUMMARY)).toBe(bare);
  });
});

class FakeOfflineAudioContext {
  async decodeAudioData() {
    return {numberOfChannels: 1, sampleRate: 48_000, getChannelData: () => concat(silence(0.2), sine(997, 0.1, 1))};
  }
}

describe('forgetAudioAnalysis', () => {
  beforeEach(() => {
    clearAudioAnalysisCache();
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('drops one URL’s analyses at every fps, the others kept', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array(16)));
    vi.stubGlobal('fetch', fetch);
    const url = '/static/a.mp3?x=1|2';
    await analyzeAudio(url, {fps: 30});
    await analyzeAudio(url, {fps: 25});
    await analyzeAudio(`${url}b`, {fps: 30});
    expect(fetch).toHaveBeenCalledTimes(3);
    forgetAudioAnalysis(url);
    await analyzeAudio(`${url}b`, {fps: 30});
    expect(fetch).toHaveBeenCalledTimes(3);
    await analyzeAudio(url, {fps: 30});
    await analyzeAudio(url, {fps: 25});
    expect(fetch).toHaveBeenCalledTimes(5);
    // A URL never analysed: nothing to forget.
    expect(() => forgetAudioAnalysis('/static/none.mp3')).not.toThrow();
  });
});

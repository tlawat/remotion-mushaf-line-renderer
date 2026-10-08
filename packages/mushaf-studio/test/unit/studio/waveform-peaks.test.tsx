// @vitest-environment jsdom
// The Review tab's waveform: the peak functions on their edge cases, the decode-once cache, and the
// canvas (segments coloured by confidence, the peaks, the playhead), the click that seeks, the zoom.
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const env = vi.hoisted(() => ({
  isStudio: true,
  isRendering: false,
  isPlayer: false,
  isClientSideRendering: false,
  isReadOnlyStudio: false,
}));
const frame = vi.hoisted(() => ({current: 0}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  getRemotionEnvironment: () => env,
  useRemotionEnvironment: () => env,
  useVideoConfig: () => ({width: 1920, height: 1080, fps: 30, durationInFrames: 900, id: 'MushafRecitation'}),
  useCurrentFrame: () => frame.current,
  Sequence: () => null,
  staticFile: (path: string) => `/static/${path}`,
}));

const studio = vi.hoisted(() => ({
  writeStaticFile: vi.fn(),
  saveDefaultProps: vi.fn(),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => []),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);

const {computePeaks, envelopeOf, peaksBetween, loadWaveform, audioUrlOf} = await import(
  '../../../src/studio/waveform-peaks'
);
const {timeAtX, xAtTime} = await import('../../../src/studio/Waveform');
const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {resetStudioStore, getStudioState} = await import('../../../src/studio/store');
const {colors} = await import('../../../src/studio/styles');
type StudioTimings = import('../../../src/types').StudioTimings;
type AlignmentSegment = import('../../../src/types').AlignmentSegment;

const list = (array: Float32Array): number[] => [...array].map((v) => Math.round(v * 1000) / 1000);

/** A decoder that hands back `channels` at `sampleRate`, whatever it is given; counts its instances. */
const fakeAudioContext = (channels: readonly Float32Array[], sampleRate: number) => {
  const made = {count: 0, closed: 0};
  class FakeAudioContext {
    constructor() {
      made.count++;
    }
    async decodeAudioData() {
      return {numberOfChannels: channels.length, sampleRate, getChannelData: (i: number) => channels[i]!};
    }
    async close() {
      made.closed++;
    }
  }
  return {FakeAudioContext, made};
};

beforeEach(() => {
  resetStudioStore();
  frame.current = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetStudioStore();
});

describe('computePeaks', () => {
  it('takes the min and max of each bucket', () => {
    const peaks = computePeaks([0, 0.5, -1, 0.25], 2);
    expect(list(peaks.min)).toEqual([0, -1]);
    expect(list(peaks.max)).toEqual([0.5, 0.25]);
  });

  it('gives zeros for no samples, nothing for no buckets', () => {
    expect(list(computePeaks([], 3).max)).toEqual([0, 0, 0]);
    expect(list(computePeaks([], 3).min)).toEqual([0, 0, 0]);
    expect(computePeaks([0.1, 0.2], 0).min).toHaveLength(0);
  });

  it('repeats the sample under a bucket narrower than one sample', () => {
    const peaks = computePeaks([0.5, -0.5], 4);
    expect(list(peaks.max)).toEqual([0.5, 0.5, -0.5, -0.5]);
    expect(list(peaks.min)).toEqual([0.5, 0.5, -0.5, -0.5]);
  });

  it('reads only the range asked for, clamped to the samples', () => {
    const samples = [1, -1, 0.5, -0.5, 0.25, -0.25];
    expect(list(computePeaks(samples, 1, 2, 4).max)).toEqual([0.5]);
    expect(list(computePeaks(samples, 1, 2, 4).min)).toEqual([-0.5]);
    expect(list(computePeaks(samples, 1, 4, 100).max)).toEqual([0.25]);
    expect(list(computePeaks(samples, 2, 5, 5).max)).toEqual([0, 0]);
  });
});

describe('envelopeOf / peaksBetween', () => {
  it('folds every channel into one envelope, perSecond pairs a second', () => {
    const left = new Float32Array([0.5, 0.5, 0, 0]);
    const right = new Float32Array([0, -0.75, 0.25, 0]);
    const envelope = envelopeOf([left, right], 4, 2);
    expect(envelope.duration).toBe(1);
    expect(envelope.perSecond).toBe(2);
    expect(list(envelope.max)).toEqual([0.5, 0.25]);
    expect(list(envelope.min)).toEqual([-0.75, 0]);
  });

  it('is one flat pair for a silent or empty recording', () => {
    const envelope = envelopeOf([], 44_100);
    expect(envelope.duration).toBe(0);
    expect(list(envelope.min)).toEqual([0]);
    expect(list(envelope.max)).toEqual([0]);
  });

  it('cuts a stretch of the recording into buckets, flat outside it', () => {
    const envelope = envelopeOf([new Float32Array([0.1, -0.2, 0.9, -0.9, 0.3, -0.1, 0, 0])], 4, 4);
    // 2 s at 4 pairs a second; the second 0.5 s holds 0.9/-0.9.
    expect(list(peaksBetween(envelope, 0, 1, 2).max)).toEqual([0.1, 0.9]);
    expect(list(peaksBetween(envelope, 0, 1, 2).min)).toEqual([-0.2, -0.9]);
    expect(list(peaksBetween(envelope, -1, 0, 2).max)).toEqual([0, 0]);
    expect(list(peaksBetween(envelope, 5, 6, 2).max)).toEqual([0, 0]);
    expect(peaksBetween(envelope, 1, 1, 4).max).toHaveLength(4);
    expect(list(peaksBetween(envelope, 1, 1, 4).max)).toEqual([0, 0, 0, 0]);
  });

  it('maps pixels and times both ways', () => {
    const view = {from: 2, to: 6};
    expect(timeAtX(view, 0, 400)).toBe(2);
    expect(timeAtX(view, 100, 400)).toBe(3);
    expect(timeAtX(view, 900, 400)).toBe(6);
    expect(xAtTime(view, 5, 400)).toBe(300);
    expect(xAtTime(view, 1, 400)).toBe(-100);
  });
});

describe('loadWaveform', () => {
  it('fetches nothing and says why where the browser has no Web Audio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await loadWaveform('/static/a.mp3');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getStudioState().waveforms['/static/a.mp3']).toEqual({
      status: 'error',
      message: 'this browser cannot decode audio here (no Web Audio).',
    });
  });

  it('decodes a URL once and keeps its envelope in the store', async () => {
    const {FakeAudioContext, made} = fakeAudioContext([new Float32Array([0.5, -0.5, 0.25, -0.25])], 4);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const fetchMock = vi.fn(async () => ({ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8)}));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([loadWaveform('/static/a.mp3'), loadWaveform('/static/a.mp3')]);
    await loadWaveform('/static/a.mp3');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/static/a.mp3');
    expect(made).toEqual({count: 1, closed: 1});
    const entry = getStudioState().waveforms['/static/a.mp3'];
    expect(entry?.status).toBe('ready');
    expect(entry?.status === 'ready' && entry.envelope.duration).toBe(1);
  });

  it('prefers an OfflineAudioContext at 8 kHz, which resamples as it decodes', async () => {
    const made: number[][] = [];
    class FakeOffline {
      constructor(...args: number[]) {
        made.push(args);
      }
      async decodeAudioData() {
        return {numberOfChannels: 1, sampleRate: 8000, getChannelData: () => new Float32Array(8000)};
      }
    }
    const {FakeAudioContext, made: online} = fakeAudioContext([], 4);
    vi.stubGlobal('OfflineAudioContext', FakeOffline);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8)})),
    );
    await loadWaveform('/static/b.mp3');
    expect(made).toEqual([[1, 1, 8000]]);
    expect(online.count).toBe(0);
    const entry = getStudioState().waveforms['/static/b.mp3'];
    expect(entry?.status === 'ready' && entry.envelope.duration).toBe(1);
  });

  it('does not decode a recording too large to keep in memory', async () => {
    const {FakeAudioContext, made} = fakeAudioContext([], 4);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ok: true, status: 200, arrayBuffer: async () => ({byteLength: 150 * 1024 * 1024})})),
    );
    await loadWaveform('/static/huge.wav');
    expect(made.count).toBe(0);
    expect(getStudioState().waveforms['/static/huge.wav']).toEqual({
      status: 'error',
      message: 'the recording is 150 MB, too large to draw here.',
    });
  });

  it('records an HTTP failure as an entry, never as a thrown error', async () => {
    const {FakeAudioContext} = fakeAudioContext([], 4);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ok: false, status: 404})),
    );
    await expect(loadWaveform('/static/gone.mp3')).resolves.toBeUndefined();
    expect(getStudioState().waveforms['/static/gone.mp3']).toEqual({
      status: 'error',
      message: '/static/gone.mp3 could not be read (HTTP 404).',
    });
  });

  it('reads a public/ path through staticFile() and a URL as it is', () => {
    expect(audioUrlOf('mushaf-studio/p/a.mp3')).toBe('/static/mushaf-studio/p/a.mp3');
    expect(audioUrlOf('https://x.y/a.mp3')).toBe('https://x.y/a.mp3');
  });
});

describe('the waveform in the Review tab', () => {
  const segment = (n: number, timeFrom: number, timeTo: number, confidence: number): AlignmentSegment => ({
    segment: n,
    timeFrom,
    timeTo,
    refFrom: null,
    refTo: null,
    confidence,
    hasMissingWords: false,
    hasRepeatedWords: false,
    error: null,
    matchedText: null,
  });
  const timings: StudioTimings = {
    version: 1,
    surah: 1,
    ayat: [{ayah: 2, start: 0, end: 9.5, words: [{id: '1:2:1', start: 0, end: 9.5}]}],
    alignment: {
      version: 1,
      source: 'qud',
      segments: [segment(1, 0, 3, 0.95), segment(2, 3.4, 7.8, 0.85), segment(3, 8, 9.5, 0.4)],
      words: [],
      edits: [],
    },
  };
  const props = {
    ...defaultMushafRecitationProps,
    audioFile: 'mushaf-studio/p/a.mp3',
    resolved: {
      timings,
      audioOffsetSeconds: 0,
      lines: [],
      schedule: [],
      translation: null,
      gloss: null,
      transliteration: null,
      doubtful: {},
    },
  };

  type Fill = {style: string; alpha: number; x: number; y: number; w: number; h: number};
  const canvasRecorder = () => {
    const fills: Fill[] = [];
    const context = {
      fillStyle: '',
      globalAlpha: 1,
      clearRect: vi.fn(),
      fillRect(x: number, y: number, w: number, h: number) {
        fills.push({style: this.fillStyle, alpha: this.globalAlpha, x, y, w, h});
      },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => context as unknown as CanvasRenderingContext2D,
    );
    return fills;
  };

  const ready = () => {
    // Ten seconds at 100 samples a second: a quiet first half, a loud second half.
    const samples = new Float32Array(1000).map((_, i) => (i < 500 ? 0.1 : 0.8) * (i % 2 === 0 ? 1 : -1));
    const {FakeAudioContext} = fakeAudioContext([samples], 100);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8)})),
    );
  };

  it('draws the segments in their confidence colours and the peaks, and shows the playhead', async () => {
    ready();
    const fills = canvasRecorder();
    frame.current = 150; // 5 s at 30 fps
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="review" />);
    expect(screen.getByText('Decoding the recording...')).toBeTruthy();
    await waitFor(() => expect(fills.length).toBeGreaterThan(300));
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/p/a.mp3');
    expect(screen.queryByText('Decoding the recording...')).toBeNull();
    const spans = fills.filter((fill) => fill.alpha < 1);
    expect(spans.map((fill) => fill.style)).toEqual([colors.ok, colors.warning, colors.danger]);
    // Whole recording view: 0 to 10 s over 356 px; segment 2 starts at 3.4 s.
    expect(spans[1]!.x).toBeCloseTo((3.4 / 10) * 356, 3);
    const peaks = fills.filter((fill) => fill.alpha === 1 && fill.style === colors.text);
    expect(peaks).toHaveLength(356);
    // Taller bars in the loud half.
    expect(peaks[300]!.h).toBeGreaterThan(peaks[50]!.h * 4);
    const cursor = document.querySelector<HTMLElement>('[data-mushaf-waveform="cursor"]')!;
    expect(cursor.style.left).toBe('50%');
  });

  it('seeks to the time under the pointer, without playing', async () => {
    ready();
    canvasRecorder();
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="review" />);
    const canvas = document.querySelector<HTMLCanvasElement>('[data-mushaf-waveform="canvas"]')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({left: 10, width: 356} as DOMRect);
    fireEvent.click(canvas, {clientX: 10 + 89});
    // A quarter of 0..10 s is 2.5 s, frame 75.
    expect(studio.seek).toHaveBeenCalledWith(75);
    expect(studio.play).not.toHaveBeenCalled();
  });

  it('zooms to the opened segment ± 2 s, and the slider widens it', async () => {
    ready();
    canvasRecorder();
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="review" />);
    const slider = screen.getByRole('slider', {name: 'Zoom'});
    expect(slider).toHaveProperty('disabled', true);
    expect(screen.getByText('The whole recording; open a segment to zoom to it.')).toBeTruthy();
    const row = document.querySelector<HTMLElement>('[data-segment="2"]')!;
    fireEvent.click(row.querySelector('button')!);
    expect(slider).toHaveProperty('disabled', false);
    expect(screen.getByText('±2 s around segment #2')).toBeTruthy();
    const canvas = document.querySelector<HTMLCanvasElement>('[data-mushaf-waveform="canvas"]')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({left: 0, width: 356} as DOMRect);
    // 1.4 s to 9.8 s: the left edge is 1.4 s, frame 42.
    fireEvent.click(canvas, {clientX: 0});
    expect(studio.seek).toHaveBeenLastCalledWith(42);
    fireEvent.change(slider, {target: {value: '3'}});
    expect(screen.getByText('±3 s around segment #2')).toBeTruthy();
    fireEvent.click(canvas, {clientX: 0});
    expect(studio.seek).toHaveBeenLastCalledWith(12);
    // Closing the segment shows the whole recording again.
    fireEvent.click(row.querySelector('button')!);
    expect(slider).toHaveProperty('disabled', true);
  });

  it('decodes each recording once, however often the tab is opened', async () => {
    ready();
    canvasRecorder();
    const {unmount} = render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="review" />);
    await waitFor(() => expect(getStudioState().waveforms['/static/mushaf-studio/p/a.mp3']?.status).toBe('ready'));
    unmount();
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="review" />);
    await act(async () => undefined);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

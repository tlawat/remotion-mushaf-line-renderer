// @vitest-environment jsdom
// The doubtful segments on the Studio's timeline: one empty <Sequence> per segment under the
// threshold, with missing words or an error, in composition frames, rendered beside the dock's
// portal (in the composition), in the Studio only, and off when the Review tab says so.
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const env = vi.hoisted(() => ({
  isStudio: true,
  isRendering: false,
  isPlayer: false,
  isClientSideRendering: false,
  isReadOnlyStudio: false,
}));
vi.mock('remotion', async (importOriginal) => {
  const React = await import('react');
  return {
    ...(await importOriginal<typeof import('remotion')>()),
    getRemotionEnvironment: () => env,
    useRemotionEnvironment: () => env,
    useVideoConfig: () => ({width: 1920, height: 1080, fps: 30, durationInFrames: 900, id: 'MushafRecitation'}),
    useCurrentFrame: () => 0,
    // A Sequence as an element that carries its props, so the test sees where it is rendered.
    Sequence: (props: {
      from: number;
      durationInFrames: number;
      name: string;
      layout: string;
      showInTimeline: boolean;
      children?: unknown;
    }) =>
      React.createElement('i', {
        'data-sequence': props.name,
        'data-from': props.from,
        'data-duration': props.durationInFrames,
        'data-layout': props.layout,
        'data-timeline': String(props.showInTimeline),
        'data-children': String(props.children !== undefined),
      }),
    staticFile: (path: string) => `/static/${path}`,
  };
});

vi.mock('@remotion/studio', () => ({
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
vi.mock('../../../src/translations', () => ({listQuranComTranslations: vi.fn(async () => [])}));

const {MushafStudioPanel} = await import('../../../src/studio');
const {doubtMarkers, doubtMarkerName, isDoubtfulSegment} = await import('../../../src/studio/doubts');
const {translate} = await import('../../../src/studio/i18n');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {resetStudioStore, getStudioState, setStudioState} = await import('../../../src/studio/store');
type AlignmentSegment = import('../../../src/types').AlignmentSegment;
type StudioTimings = import('../../../src/types').StudioTimings;
type MushafRecitationProps = import('../../../src/compositions/recitation/schema').MushafRecitationProps;

const segment = (
  n: number,
  timeFrom: number,
  timeTo: number,
  rest: Partial<AlignmentSegment> = {},
): AlignmentSegment => ({
  segment: n,
  timeFrom,
  timeTo,
  refFrom: `1:${n + 1}:1`,
  refTo: `1:${n + 1}:4`,
  confidence: 0.95,
  hasMissingWords: false,
  hasRepeatedWords: false,
  error: null,
  matchedText: null,
  ...rest,
});

const en = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
  translate('en', key, params);

/** Four segments in composition time: sure, low, missing words, an error with no match. */
const segments: readonly AlignmentSegment[] = [
  segment(1, 0.1, 2.9),
  segment(2, 3.4, 7.8, {confidence: 0.62, refFrom: '1:3:1', refTo: '1:3:2'}),
  segment(3, 8, 9.5, {hasMissingWords: true}),
  segment(4, 10, 10.01, {confidence: 0, error: 'no match', refFrom: null, refTo: null}),
];

const timings: StudioTimings = {
  version: 1,
  surah: 1,
  ayat: [{ayah: 2, start: 0.1, end: 2.9, words: [{id: '1:2:1', start: 0.1, end: 0.6}]}],
  alignment: {version: 1, source: 'qud', segments, words: [], edits: []},
};

const props = (rest: Partial<MushafRecitationProps> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  ...rest,
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
});

const dock = () => document.body.querySelector<HTMLElement>('[data-mushaf-studio="panel"]');

beforeEach(() => {
  resetStudioStore();
  env.isStudio = true;
  env.isRendering = false;
  env.isClientSideRendering = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetStudioStore();
});

describe('doubtMarkers', () => {
  it('flags a segment under the threshold, with missing words or with an error, and nothing else', () => {
    expect(segments.map((s) => isDoubtfulSegment(s, 0.8))).toEqual([false, true, true, true]);
    expect(isDoubtfulSegment(segment(9, 0, 1, {confidence: 0.8}), 0.8)).toBe(false);
    expect(isDoubtfulSegment(segment(9, 0, 1, {hasRepeatedWords: true}), 0.8)).toBe(false);
  });

  it('names a marker by its confidence and references, then what else is wrong', () => {
    expect(doubtMarkerName(segments[1]!, en)).toBe('⚠ 62% 1:3:1–1:3:2');
    expect(doubtMarkerName(segments[2]!, en)).toBe('⚠ 95% 1:4:1–1:4:4 · missing words');
    expect(doubtMarkerName(segments[3]!, en)).toBe('⚠ 0% · no match');
  });

  it('turns composition seconds into frames, at least one frame long, dropping what ends before frame 0', () => {
    expect(doubtMarkers(segments, 0.8, 30, en)).toEqual([
      {segment: 2, from: 102, durationInFrames: 132, name: '⚠ 62% 1:3:1–1:3:2'},
      {segment: 3, from: 240, durationInFrames: 45, name: '⚠ 95% 1:4:1–1:4:4 · missing words'},
      {segment: 4, from: 300, durationInFrames: 1, name: '⚠ 0% · no match'},
    ]);
    // A segment the audio offset moved before frame 0 is dropped, one that straddles it is clipped.
    const early = [segment(1, -3, -1, {confidence: 0.1}), segment(2, -0.5, 1, {confidence: 0.1})];
    expect(doubtMarkers(early, 0.8, 30, en).map(({from, durationInFrames}) => [from, durationInFrames])).toEqual([
      [0, 30],
    ]);
    expect(doubtMarkers([], 0.8, 30, en)).toEqual([]);
  });
});

describe('<DoubtMarkers> in the panel', () => {
  it('renders one empty Sequence per doubtful segment in the composition, outside the dock', () => {
    const {container} = render(<MushafStudioPanel compositionId="MushafRecitation" props={props()} />);
    const markers = [...container.querySelectorAll<HTMLElement>('[data-sequence]')];
    expect(markers.map((m) => [m.dataset.sequence, m.dataset.from, m.dataset.duration])).toEqual([
      ['⚠ 62% 1:3:1–1:3:2', '102', '132'],
      ['⚠ 95% 1:4:1–1:4:4 · missing words', '240', '45'],
      ['⚠ 0% · no match', '300', '1'],
    ]);
    for (const marker of markers) {
      expect(marker.dataset.layout).toBe('none');
      expect(marker.dataset.timeline).toBe('true');
      expect(marker.dataset.children).toBe('false');
    }
    expect(dock()!.querySelector('[data-sequence]')).toBeNull();
  });

  it('follows the confidence threshold of the props', () => {
    const {container} = render(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={props({review: {...defaultMushafRecitationProps.review, confidenceThreshold: 0.5}})}
      />,
    );
    expect([...container.querySelectorAll<HTMLElement>('[data-sequence]')].map((m) => m.dataset.from)).toEqual([
      '240',
      '300',
    ]);
  });

  it('renders none outside the Studio preview', () => {
    for (const flags of [
      {isStudio: false, isRendering: true, isClientSideRendering: false},
      {isStudio: true, isRendering: true, isClientSideRendering: false},
      {isStudio: true, isRendering: false, isClientSideRendering: true},
      {isStudio: false, isRendering: false, isClientSideRendering: false},
    ]) {
      Object.assign(env, flags);
      const {container, unmount} = render(<MushafStudioPanel compositionId="MushafRecitation" props={props()} />);
      expect(container.querySelectorAll('[data-sequence]')).toHaveLength(0);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('is turned off and on from the Review tab, and the choice is remembered with the panel layout', () => {
    const {container} = render(
      <MushafStudioPanel compositionId="MushafRecitation" props={props()} initialTab="review" />,
    );
    const toggle = screen.getByRole('checkbox', {name: 'Show doubts on the timeline'});
    expect(toggle).toHaveProperty('checked', true);
    fireEvent.click(toggle);
    expect(getStudioState().showDoubts).toBe(false);
    expect(container.querySelectorAll('[data-sequence]')).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('mushaf-studio.panel')!).showDoubts).toBe(false);
    fireEvent.click(toggle);
    expect(container.querySelectorAll('[data-sequence]')).toHaveLength(3);
  });

  it('starts off when the stored layout says so', async () => {
    setStudioState({showDoubts: false});
    vi.resetModules();
    const fresh = await import('../../../src/studio/store');
    expect(fresh.getStudioState().showDoubts).toBe(false);
  });
});

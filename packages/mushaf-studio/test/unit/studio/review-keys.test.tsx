// @vitest-environment jsdom
// The Review tab's keyboard: j/k through the doubtful words (seek, open the segment), [ ] { } to
// nudge the selected word by 20 ms, Enter to apply, Space to play or pause, ? for the list; no key
// reaches the Studio, and a key typed into a field stays the field's.
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const env = vi.hoisted(() => ({
  isStudio: true,
  isRendering: false,
  isPlayer: false,
  isClientSideRendering: false,
  isReadOnlyStudio: false,
}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  getRemotionEnvironment: () => env,
  useRemotionEnvironment: () => env,
  useVideoConfig: () => ({width: 1920, height: 1080, fps: 30, durationInFrames: 900, id: 'MushafRecitation'}),
  useCurrentFrame: () => 0,
  Sequence: () => null,
  staticFile: (path: string) => `/static/${path}`,
}));

const studio = vi.hoisted(() => ({
  writeStaticFile: vi.fn(async () => undefined),
  saveDefaultProps: vi.fn(async () => undefined),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => []),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);

const {MushafStudioPanel} = await import('../../../src/studio');
const {reviewKeyAction, stepDoubt, reviewWords, doubtfulReviewWords, REVIEW_SHORTCUTS} = await import(
  '../../../src/studio/review-words'
);
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {resetStudioStore, getStudioState} = await import('../../../src/studio/store');
type StudioTimings = import('../../../src/types').StudioTimings;
type AlignmentWord = import('../../../src/types').AlignmentWord;
type AlignmentSegment = import('../../../src/types').AlignmentSegment;

const word = (id: string, segment: number, start: number, end: number): AlignmentWord => ({
  id,
  text: `w${id}`,
  segment,
  start,
  end,
});
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

/** Segment 1 is sure, 2 is under the threshold (1:3:1 recited twice), 3 is sure; ayah 5 is incomplete. */
const timings = (): StudioTimings => ({
  version: 1,
  surah: 1,
  audio: 'mushaf-studio/p/a.mp3',
  ayat: [
    {
      ayah: 2,
      start: 0,
      end: 2,
      words: [
        {id: '1:2:1', start: 0, end: 1},
        {id: '1:2:2', start: 1, end: 2},
      ],
    },
    {
      ayah: 3,
      start: 3,
      end: 6,
      words: [
        {id: '1:3:1', start: 3, end: 4},
        {id: '1:3:1', start: 4, end: 5},
        {id: '1:3:2', start: 5, end: 6},
      ],
    },
    {ayah: 4, start: 6, end: 7, words: [{id: '1:4:1', start: 6, end: 7}]},
    {ayah: 5, start: 7, end: 8, complete: false, words: [{id: '1:5:1', start: 7, end: 8}]},
  ],
  alignment: {
    version: 1,
    source: 'qud',
    audioId: 'abc',
    segments: [segment(1, 0, 2, 1), segment(2, 3, 6, 0.5), segment(3, 6, 8, 0.99)],
    words: [
      word('1:2:1', 1, 0, 1),
      word('1:2:2', 1, 1, 2),
      word('1:3:1', 2, 3, 4),
      word('1:3:1', 2, 4, 5),
      word('1:3:2', 2, 5, 6),
      word('1:4:1', 3, 6, 7),
      word('1:5:1', 3, 7, 8),
    ],
    edits: [],
  },
});

const props = () => ({
  ...defaultMushafRecitationProps,
  audioFile: 'mushaf-studio/p/a.mp3',
  timingsFile: 'mushaf-studio/p/a.timings.json',
  resolved: {
    timings: timings(),
    audioOffsetSeconds: 0,
    lines: [],
    schedule: [],
    translation: null,
    gloss: null,
    transliteration: null,
    doubtful: {},
  },
});

const review = () => document.querySelector<HTMLElement>('[data-mushaf-review]')!;
const key = (k: string) => fireEvent.keyDown(review(), {key: k});
/** A time input of one occurrence's row (a repeated word has two rows with the same labels). */
const time = (wordKey: string, edge: 'start' | 'end') => {
  const id = wordKey.slice(0, wordKey.indexOf('#'));
  return document
    .querySelector(`[data-word-key="${wordKey}"]`)!
    .querySelector<HTMLInputElement>(`input[aria-label="${id} ${edge}"]`)!;
};
const selected = () =>
  [...document.querySelectorAll<HTMLElement>('[data-selected="true"]')].map((row) => row.dataset.wordKey);

beforeEach(() => {
  resetStudioStore();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ok: true, status: 200, json: async () => timings()})),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetStudioStore();
});

describe('the keyboard, as data', () => {
  it('maps the keys to actions and leaves modified keys to the Studio', () => {
    expect(reviewKeyAction({key: 'j'})).toEqual({kind: 'step', direction: 1});
    expect(reviewKeyAction({key: 'k'})).toEqual({kind: 'step', direction: -1});
    expect(reviewKeyAction({key: '['})).toEqual({kind: 'nudge', edge: 'start', seconds: -0.02});
    expect(reviewKeyAction({key: ']'})).toEqual({kind: 'nudge', edge: 'start', seconds: 0.02});
    expect(reviewKeyAction({key: '{'})).toEqual({kind: 'nudge', edge: 'end', seconds: -0.02});
    expect(reviewKeyAction({key: '}'})).toEqual({kind: 'nudge', edge: 'end', seconds: 0.02});
    expect(reviewKeyAction({key: 'Enter'})).toEqual({kind: 'apply'});
    expect(reviewKeyAction({key: ' '})).toEqual({kind: 'toggle-playback'});
    expect(reviewKeyAction({key: '?'})).toEqual({kind: 'help'});
    expect(reviewKeyAction({key: 'x'})).toBeNull();
    expect(reviewKeyAction({key: 'j', ctrlKey: true})).toBeNull();
    expect(reviewKeyAction({key: 'k', metaKey: true})).toBeNull();
    expect(REVIEW_SHORTCUTS.map((s) => s.keys)).toEqual(['j / k', '[ / ]', '{ / }', 'Enter', 'Space', '?']);
  });

  it('lists the doubtful words by start: a doubtful segment, an incomplete ayah', () => {
    const t = timings();
    const words = reviewWords(t);
    expect(words.map((w) => w.key)).toEqual([
      '1:2:1#0',
      '1:2:2#0',
      '1:3:1#0',
      '1:3:1#1',
      '1:3:2#0',
      '1:4:1#0',
      '1:5:1#0',
    ]);
    expect(words[3]).toMatchObject({id: '1:3:1', occurrence: 1, text: 'w1:3:1', group: 's2', start: 4});
    const doubtful = doubtfulReviewWords(words, t, 0.8);
    expect(doubtful.map((w) => w.key)).toEqual(['1:3:1#0', '1:3:1#1', '1:3:2#0', '1:5:1#0']);
    expect(doubtfulReviewWords(words, t, 0.4).map((w) => w.key)).toEqual(['1:5:1#0']);
    // Without a sidecar: the ayahs' words, grouped by ayah.
    const {alignment: _alignment, ...bare} = t;
    expect(reviewWords(bare).map((w) => w.group)).toEqual(['a1:2', 'a1:2', 'a1:3', 'a1:3', 'a1:3', 'a1:4', 'a1:5']);
    expect(doubtfulReviewWords(reviewWords(bare), bare, 0.8).map((w) => w.key)).toEqual(['1:5:1#0']);
  });

  it('steps through the doubtful words without wrapping, from the selection or from an end', () => {
    const t = timings();
    const words = reviewWords(t);
    const doubtful = doubtfulReviewWords(words, t, 0.8);
    expect(stepDoubt(doubtful, null, 1)?.key).toBe('1:3:1#0');
    expect(stepDoubt(doubtful, null, -1)?.key).toBe('1:5:1#0');
    expect(stepDoubt(doubtful, doubtful[0]!, 1)?.key).toBe('1:3:1#1');
    expect(stepDoubt(doubtful, doubtful[0]!, -1)?.key).toBe('1:3:1#0');
    expect(stepDoubt(doubtful, doubtful[3]!, 1)?.key).toBe('1:5:1#0');
    // From a sure word: the nearest doubtful one in that direction.
    expect(stepDoubt(doubtful, words[5]!, 1)?.key).toBe('1:5:1#0');
    expect(stepDoubt(doubtful, words[5]!, -1)?.key).toBe('1:3:2#0');
    expect(stepDoubt(doubtful, words[0]!, -1)?.key).toBe('1:2:1#0');
    expect(stepDoubt([], null, 1)).toBeNull();
  });
});

describe('the Review tab keyboard', () => {
  it('j and k go through the doubtful words: select, open the segment, seek', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props()} initialTab="review" />);
    expect(selected()).toEqual([]);
    key('j');
    expect(selected()).toEqual(['1:3:1#0']);
    expect(studio.seek).toHaveBeenLastCalledWith(90);
    key('j');
    expect(selected()).toEqual(['1:3:1#1']);
    expect(studio.seek).toHaveBeenLastCalledWith(120);
    key('j');
    key('j');
    // The incomplete ayah's word, in segment 3, which opened too.
    expect(selected()).toEqual(['1:5:1#0']);
    expect(document.querySelector('[data-word-key="1:4:1#0"]')).not.toBeNull();
    key('k');
    expect(selected()).toEqual(['1:3:2#0']);
    expect(studio.seek).toHaveBeenLastCalledWith(150);
    expect(studio.play).not.toHaveBeenCalled();
  });

  it('[ ] { } nudge the selected word by 20 ms and Enter applies them', async () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props()} initialTab="review" />);
    key('[');
    expect(getStudioState().notice).toMatch(/Select a word first/);
    key('j');
    key('[');
    key('[');
    key('}');
    expect(time('1:3:1#0', 'start')).toHaveProperty('value', '2.96');
    expect(time('1:3:1#0', 'end')).toHaveProperty('value', '4.02');
    key(']');
    expect(time('1:3:1#0', 'start')).toHaveProperty('value', '2.98');
    key('{');
    expect(time('1:3:1#0', 'end')).toHaveProperty('value', '4');
    expect(screen.getByText('Apply edits (1)')).toBeTruthy();
    key('Enter');
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(1));
    const [write] = studio.writeStaticFile.mock.calls[0] as unknown as [{filePath: string; contents: string}];
    expect(write.filePath).toBe('mushaf-studio/p/a.timings.json');
    const file = JSON.parse(write.contents) as StudioTimings;
    expect(file.ayat[1]!.words![0]).toEqual({id: '1:3:1', start: 2.98, end: 4});
    await waitFor(() => expect(screen.getByText('Apply edits (0)')).toBeTruthy());
    // Enter with nothing pending writes nothing.
    key('Enter');
    expect(studio.writeStaticFile).toHaveBeenCalledTimes(1);
  });

  it('Space plays or pauses through the Studio, ? shows the shortcuts', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props()} initialTab="review" />);
    key(' ');
    expect(studio.toggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    key('?');
    const list = document.querySelector('[data-mushaf-review="shortcuts"]')!;
    expect(list.querySelectorAll('li')).toHaveLength(6);
    expect(list.textContent).toContain('Play / pause');
    key('?');
    expect(document.querySelector('[data-mushaf-review="shortcuts"]')).toBeNull();
  });

  it('keeps every shortcut away from the Studio and stops the default action', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props()} initialTab="review" />);
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    document.addEventListener('keydown', outside);
    for (const k of ['j', 'k', '[', ']', '{', '}', ' ', '?', 'Enter']) {
      const event = new KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true});
      review().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    window.removeEventListener('keydown', outside);
    document.removeEventListener('keydown', outside);
    expect(outside).not.toHaveBeenCalled();
  });

  it('leaves a key typed into a field to the field', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props()} initialTab="review" />);
    key('j');
    const input = time('1:3:1#0', 'start');
    const event = new KeyboardEvent('keydown', {key: '[', bubbles: true, cancelable: true});
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(time('1:3:1#0', 'start')).toHaveProperty('value', '3');
    fireEvent.keyDown(input, {key: ' '});
    expect(studio.toggle).not.toHaveBeenCalled();
  });

  it('selects a word by its text for the keys to nudge', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props()} initialTab="review" />);
    const row = document.querySelector<HTMLElement>('[data-segment="1"]')!;
    fireEvent.click(row.querySelector('button')!);
    fireEvent.click(screen.getByText('w1:2:2'));
    expect(selected()).toEqual(['1:2:2#0']);
    expect(studio.seek).toHaveBeenLastCalledWith(30);
    key(']');
    expect(screen.getByLabelText('1:2:2 start')).toHaveProperty('value', '1.02');
  });
});

/** 113:1-2 then 114:1-2, without a sidecar: the same ayah numbers in two surahs; 114:1 is incomplete. */
const acrossSurahs = (): StudioTimings => ({
  version: 2,
  ayat: [
    {surah: 113, ayah: 1, start: 0, end: 1, words: [{id: '113:1:1', start: 0, end: 1}]},
    {surah: 113, ayah: 2, start: 1, end: 2, words: [{id: '113:2:1', start: 1, end: 2}]},
    {surah: 114, ayah: 1, start: 3, end: 4, complete: false, words: [{id: '114:1:1', start: 3, end: 4}]},
    {surah: 114, ayah: 2, start: 4, end: 5, words: [{id: '114:2:1', start: 4, end: 5}]},
  ],
});

describe('timings across surahs', () => {
  it('groups the words by surah and ayah, and takes only the incomplete ayah of its own surah as doubtful', () => {
    const t = acrossSurahs();
    const words = reviewWords(t);
    expect(words.map((w) => w.group)).toEqual(['a113:1', 'a113:2', 'a114:1', 'a114:2']);
    expect(doubtfulReviewWords(words, t, 0.8).map((w) => w.key)).toEqual(['114:1:1#0']);
  });

  it('lists each ayah under its own surah and opens only the row asked', () => {
    const base = props();
    render(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={{...base, resolved: {...base.resolved, timings: acrossSurahs()}}}
        initialTab="review"
      />,
    );
    const rows = [...review().querySelectorAll<HTMLElement>('li')].filter((row) => row.querySelector('strong'));
    expect(rows.map((row) => row.querySelector('strong')!.textContent)).toEqual(['113:1', '113:2', '114:1', '114:2']);
    fireEvent.click(rows[2]!.querySelector('button')!);
    expect(document.querySelector('[data-word-key="114:1:1#0"]')).not.toBeNull();
    expect(document.querySelector('[data-word-key="113:1:1#0"]')).toBeNull();
  });
});

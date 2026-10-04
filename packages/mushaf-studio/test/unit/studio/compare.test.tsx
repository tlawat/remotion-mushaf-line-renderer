// @vitest-environment jsdom
// Two timings files word by word: the pure diff (repeated words by occurrence, lone words, the
// order, the summary) and the Review tab's "Compare with..." (the file list, the table, the seek).
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
  writeStaticFile: vi.fn(),
  saveDefaultProps: vi.fn(),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => [] as {name: string; src: string; sizeInBytes: number; lastModified: number}[]),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);

const {diffTimings, summarise} = await import('../../../src/studio/compare');
const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {resetStudioStore, getStudioState} = await import('../../../src/studio/store');
type RecitationTimings = import('@tlawat/remotion-mushaf-line').RecitationTimings;

const file = (words: readonly (readonly [string, number])[]): RecitationTimings => {
  const byAyah = new Map<number, {id: string; start: number; end: number}[]>();
  for (const [id, start] of words) {
    const ayah = Number(id.split(':')[1]);
    byAyah.set(ayah, [...(byAyah.get(ayah) ?? []), {id, start, end: start + 0.5}]);
  }
  return {
    version: 1,
    surah: 1,
    ayat: [...byAyah].map(([ayah, list]) => ({ayah, start: list[0]!.start, end: list.at(-1)!.end, words: list})),
  };
};

describe('diffTimings', () => {
  it('matches a repeated word by the order of its recitations', () => {
    const a = file([
      ['1:3:1', 3],
      ['1:3:1', 4],
      ['1:3:2', 5],
    ]);
    const b = file([
      ['1:3:1', 3.1],
      ['1:3:1', 4.5],
      ['1:3:2', 5],
    ]);
    const diff = diffTimings(a, b);
    expect(diff.words).toEqual([
      {id: '1:3:1', occurrence: 1, startA: 4, startB: 4.5, diff: 0.5},
      {id: '1:3:1', occurrence: 0, startA: 3, startB: 3.1, diff: 0.1},
      {id: '1:3:2', occurrence: 0, startA: 5, startB: 5, diff: 0},
    ]);
    expect(diff.onlyInA).toEqual([]);
    expect(diff.onlyInB).toEqual([]);
  });

  it('lists the words only one file times, an extra repetition included', () => {
    const a = file([
      ['1:2:1', 0],
      ['1:3:1', 3],
      ['1:3:1', 4],
    ]);
    const b = file([
      ['1:3:1', 3],
      ['1:4:1', 6],
    ]);
    const diff = diffTimings(a, b);
    expect(diff.words.map((w) => `${w.id}#${w.occurrence}`)).toEqual(['1:3:1#0']);
    expect(diff.onlyInA).toEqual([
      {id: '1:2:1', occurrence: 0, start: 0},
      {id: '1:3:1', occurrence: 1, start: 4},
    ]);
    expect(diff.onlyInB).toEqual([{id: '1:4:1', occurrence: 0, start: 6}]);
  });

  it('sorts by the size of the difference, earlier words first among equals, negative ones included', () => {
    const a = file([
      ['1:2:1', 1],
      ['1:2:2', 2],
      ['1:2:3', 3],
    ]);
    const b = file([
      ['1:2:1', 1.2],
      ['1:2:2', 1.7],
      ['1:2:3', 3.2],
    ]);
    expect(diffTimings(a, b).words.map((w) => [w.id, w.diff])).toEqual([
      ['1:2:2', -0.3],
      ['1:2:1', 0.2],
      ['1:2:3', 0.2],
    ]);
  });

  it('summarises the absolute differences: median, nearest-rank p90, max', () => {
    expect(summarise([])).toEqual({matched: 0, median: 0, p90: 0, max: 0});
    expect(summarise([0.25])).toEqual({matched: 1, median: 0.25, p90: 0.25, max: 0.25});
    expect(summarise([0.4, 0.1, 0.3, 0.2])).toEqual({matched: 4, median: 0.25, p90: 0.4, max: 0.4});
    const ten = Array.from({length: 10}, (_, i) => (i + 1) / 10);
    expect(summarise(ten)).toEqual({matched: 10, median: 0.55, p90: 0.9, max: 1});
    const a = file([
      ['1:2:1', 1],
      ['1:2:2', 2],
    ]);
    const b = file([
      ['1:2:1', 0.9],
      ['1:2:2', 2.3],
    ]);
    expect(diffTimings(a, b).summary).toEqual({matched: 2, median: 0.2, p90: 0.3, max: 0.3});
  });

  it('is empty for two empty files', () => {
    const empty: RecitationTimings = {version: 1, surah: 1, ayat: []};
    expect(diffTimings(empty, empty)).toEqual({
      words: [],
      onlyInA: [],
      onlyInB: [],
      summary: {matched: 0, median: 0, p90: 0, max: 0},
    });
  });
});

describe('Compare with... in the Review tab', () => {
  const mine = file([
    ['1:2:1', 1],
    ['1:2:2', 2],
    ['1:2:3', 3],
  ]);
  const theirs = file([
    ['1:2:1', 1.05],
    ['1:2:2', 2.4],
  ]);
  const props = {
    ...defaultMushafRecitationProps,
    audioFile: '',
    timingsFile: 'mushaf-studio/p/mine.timings.json',
    resolved: {
      timings: mine,
      audioOffsetSeconds: 0.5,
      lines: [],
      schedule: [],
      translation: null,
      gloss: null,
      transliteration: null,
      doubtful: {},
    },
  };
  const entry = (name: string) => ({name, src: `/static/${name}`, sizeInBytes: 10, lastModified: 0});

  beforeEach(() => {
    resetStudioStore();
    studio.getStaticFiles.mockReturnValue([
      entry('mushaf-studio/p/mine.timings.json'),
      entry('mushaf-studio/p/theirs.timings.json'),
      entry('mushaf-studio/p/a.mp3'),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (url.includes('theirs') ? theirs : mine),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    resetStudioStore();
  });

  it('lists the other JSON files, reads both files and shows the summary and the words by difference', async () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="review" />);
    fireEvent.click(screen.getByText(/Compare with another timings file/));
    const select = screen.getByRole('combobox', {name: 'Compare with…'});
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual([
      '',
      'mushaf-studio/p/theirs.timings.json',
    ]);
    fireEvent.change(select, {target: {value: 'mushaf-studio/p/theirs.timings.json'}});
    await waitFor(() => expect(document.querySelectorAll('[data-mushaf-compare="row"]')).toHaveLength(2));
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/p/mine.timings.json');
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/p/theirs.timings.json');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-mushaf-compare="row"]')];
    expect(rows.map((row) => row.dataset.word)).toEqual(['1:2:2#0', '1:2:1#0']);
    expect(rows[0]!.textContent).toContain('+400');
    expect(document.querySelector('[data-mushaf-compare="summary"]')!.textContent).toBe(
      '2 words in both: median 0.23 s, p90 0.40 s, max 0.40 s apart; 1 only in this file, 0 only in mushaf-studio/p/theirs.timings.json.',
    );
    // A row seeks to the word in the composition: its file time less the audio offset.
    fireEvent.click(rows[0]!);
    expect(studio.seek).toHaveBeenLastCalledWith(45);
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
  });

  it('shows the 50 largest differences only', async () => {
    const many = (shift: number) =>
      file(Array.from({length: 60}, (_, i) => [`1:2:${i + 1}`, i + (shift ? (i + 1) / 1000 : 0)] as const));
    const big = {...props, resolved: {...props.resolved, timings: many(0)}};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({ok: true, status: 200, json: async () => many(url.includes('theirs') ? 1 : 0)})),
    );
    render(<MushafStudioPanel compositionId="MushafRecitation" props={big} initialTab="review" />);
    fireEvent.click(screen.getByText(/Compare with another timings file/));
    fireEvent.change(screen.getByRole('combobox', {name: 'Compare with…'}), {
      target: {value: 'mushaf-studio/p/theirs.timings.json'},
    });
    await waitFor(() => expect(document.querySelectorAll('[data-mushaf-compare="row"]')).toHaveLength(50));
    expect(document.querySelector<HTMLElement>('[data-mushaf-compare="row"]')!.dataset.word).toBe('1:2:60#0');
    expect(document.querySelector('[data-mushaf-compare="summary"]')!.textContent).toMatch(/^60 words in both/);
  });

  it('says in the status line when the other file cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('theirs') ? {ok: false, status: 404} : {ok: true, status: 200, json: async () => mine},
      ),
    );
    render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="review" />);
    fireEvent.click(screen.getByText(/Compare with another timings file/));
    fireEvent.change(screen.getByRole('combobox', {name: 'Compare with…'}), {
      target: {value: 'mushaf-studio/p/theirs.timings.json'},
    });
    await waitFor(() => expect(getStudioState().error).toMatch(/theirs.timings.json could not be read \(HTTP 404\)/));
    expect(document.querySelectorAll('[data-mushaf-compare="row"]')).toHaveLength(0);
  });
});

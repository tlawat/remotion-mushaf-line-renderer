// @vitest-environment jsdom
// The panel under jsdom: nothing outside the Studio, the dock in the Studio, and the one path a
// change takes (files into public/, then saveDefaultProps, then reevaluateComposition).
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import chapterFixture from '../../fixtures/qud/chapter-1-segments.json';
import recitationsFixture from '../../fixtures/qud/recitations.json';

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
  goToComposition: vi.fn(),
  focusDefaultPropsPath: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);

const qud = vi.hoisted(() => ({
  listRecitations: vi.fn(),
  getChapterSegments: vi.fn(),
  timingsFromCatalogue: vi.fn(),
  alignAudio: vi.fn(),
  sessionTimestamps: vi.fn(),
  splitSession: vi.fn(),
  realignSession: vi.fn(),
  timingsFromQud: vi.fn(),
}));
vi.mock('../../../src/qud', () => ({...qud, DEFAULT_CONFIDENCE_THRESHOLD: 0.8}));

const translations = vi.hoisted(() => ({
  listQuranComTranslations: vi.fn(async () => []),
  fetchQuranComTranslation: vi.fn(),
  fetchQuranComWordGloss: vi.fn(),
  serialiseTranslation: vi.fn(),
  loadTranslation: vi.fn(),
}));
vi.mock('../../../src/translations', () => translations);

// The Lines tab wrapped to count its renders: the wrapper re-renders only when the dock does (the
// tab's own store subscription does not reach it), so the count says whether the memo held. With
// `crash` set it throws instead, as a tab with a bug would.
const linesRenders = vi.hoisted(() => ({count: 0, crash: false}));
vi.mock('../../../src/studio/tabs/LinesTab', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/studio/tabs/LinesTab')>();
  const LinesTab: typeof actual.LinesTab = (props) => {
    linesRenders.count++;
    if (linesRenders.crash) throw new Error('the Lines tab exploded');
    return <actual.LinesTab {...props} />;
  };
  return {LinesTab};
});

const {MushafStudioPanel, isInStudio} = await import('../../../src/studio');
const {isStudioPreview} = await import('../../../src/studio/environment');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {resetStudioStore, getStudioState, setStudioState} = await import('../../../src/studio/store');
const {patchProps} = await import('../../../src/studio/studio-api');
type StudioTimings = import('../../../src/types').StudioTimings;
type MushafRecitationProps = import('../../../src/compositions/recitation/schema').MushafRecitationProps;

const timings: StudioTimings = {
  version: 1,
  surah: 1,
  ayat: [{ayah: 2, start: 0.1, end: 2.95, words: [{id: '1:2:1', start: 0.1, end: 0.67}]}],
  alignment: {version: 1, source: 'qud-catalogue', segments: [], words: [], edits: []},
};

const studioCalls = () =>
  Object.values(studio).reduce((n, fn) => n + (fn as {mock: {calls: unknown[]}}).mock.calls.length, 0);

const dock = () => document.body.querySelector<HTMLElement>('[data-mushaf-studio="panel"]');

/** Props with `resolved` as `calculateMetadata()` fills it for these timings (no lines: the Review and Text tabs need none). */
const resolvedProps = (t: StudioTimings, rest: Partial<MushafRecitationProps> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  ...rest,
  resolved: {
    timings: t,
    audioOffsetSeconds: 0,
    lines: [],
    schedule: [],
    translation: null,
    gloss: null,
    transliteration: null,
    doubtful: {},
  },
});

beforeEach(() => {
  resetStudioStore();
  linesRenders.count = 0;
  linesRenders.crash = false;
  env.isStudio = true;
  env.isRendering = false;
  env.isClientSideRendering = false;
  qud.listRecitations.mockResolvedValue(recitationsFixture.recitations);
  qud.getChapterSegments.mockResolvedValue(chapterFixture);
  qud.timingsFromCatalogue.mockReturnValue(timings);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer})),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetStudioStore();
});

describe('isInStudio / isStudioPreview', () => {
  it('is true in the Studio preview only', () => {
    expect(isInStudio()).toBe(true);
    env.isRendering = true;
    expect(isInStudio()).toBe(false);
    env.isRendering = false;
    env.isClientSideRendering = true;
    expect(isInStudio()).toBe(false);
    env.isClientSideRendering = false;
    env.isStudio = false;
    expect(isInStudio()).toBe(false);
  });

  it('needs all three flags: isStudio without isRendering and without isClientSideRendering', () => {
    const preview = {isStudio: true, isRendering: false, isClientSideRendering: false};
    expect(isStudioPreview(preview)).toBe(true);
    expect(isStudioPreview({...preview, isRendering: true})).toBe(false);
    expect(isStudioPreview({...preview, isClientSideRendering: true})).toBe(false);
    expect(isStudioPreview({...preview, isStudio: false})).toBe(false);
    // What the Studio's in-browser render sets through the context the hook reads.
    expect(isStudioPreview({isStudio: false, isRendering: false, isClientSideRendering: true})).toBe(false);
  });
});

describe('<MushafStudioPanel>', () => {
  it('renders nothing and touches no API outside the Studio', async () => {
    env.isStudio = false;
    env.isRendering = true;
    const {container} = render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />,
    );
    expect(container.innerHTML).toBe('');
    expect(dock()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(studioCalls()).toBe(0);
    expect(qud.listRecitations).not.toHaveBeenCalled();
  });

  it("renders nothing in the Studio's own in-browser render", async () => {
    env.isStudio = true;
    env.isClientSideRendering = true;
    const {container} = render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />,
    );
    expect(container.innerHTML).toBe('');
    expect(dock()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(studioCalls()).toBe(0);
    expect(qud.listRecitations).not.toHaveBeenCalled();
  });

  it('docks into document.body with the five tabs in the Studio', async () => {
    const {container} = render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />,
    );
    expect(container.innerHTML).toBe(''); // a portal: nothing inside the composition
    const root = dock()!;
    expect(root).not.toBeNull();
    expect(root.parentElement).toBe(document.body);
    expect(root.style.position).toBe('fixed');
    expect(root.style.width).toBe('380px');
    expect(screen.getByText('Mushaf Studio')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Source',
      'Align',
      'Review',
      'Lines',
      'Text',
    ]);
    expect(screen.getByRole('tab', {selected: true}).textContent).toBe('Source');
    await screen.findByText('Use this recitation');
    expect(qud.listRecitations).toHaveBeenCalledTimes(1);
    // Switching tabs is remembered; the catalogue is not fetched again when coming back.
    fireEvent.click(screen.getByRole('tab', {name: 'Lines'}));
    expect(getStudioState().tab).toBe('lines');
    expect(screen.getByRole('tab', {selected: true}).textContent).toBe('Lines');
    fireEvent.click(screen.getByRole('tab', {name: 'Source'}));
    await screen.findByText('Use this recitation');
    expect(qud.listRecitations).toHaveBeenCalledTimes(1);
  });

  it('keeps key presses inside the dock away from the Studio', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    fireEvent.keyDown(screen.getByRole('tab', {name: 'Align'}), {key: ' '});
    window.removeEventListener('keydown', outside);
    expect(outside).not.toHaveBeenCalled();
  });

  it('collapses to a strip and comes back, remembering it', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    fireEvent.click(screen.getByTitle('Collapse the panel'));
    expect(dock()!.dataset.collapsed).toBe('true');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('mushaf-studio.panel')!).collapsed).toBe(true);
    fireEvent.click(screen.getByTitle('Open the Mushaf panel'));
    expect(dock()!.dataset.collapsed).toBe('false');
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('opens the initial tab given, until the user picks one', () => {
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="review" />,
    );
    expect(screen.getByRole('tab', {selected: true}).textContent).toBe('Review');
    expect(screen.getByText(/Nothing to review yet/)).toBeTruthy();
  });

  it('uses a catalogue recitation: two files into public/, one props patch, one re-evaluation', async () => {
    setStudioState({uploadedAudio: 'mushaf-studio/my-fatiha/mine.m4a'});
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} project="My Fatiha" />,
    );
    await screen.findByText('Use this recitation');
    expect(screen.getByRole('combobox', {name: 'Reciter'})).toHaveProperty('value', 'abdul_hamid_ghraio_2025_yt');
    expect(screen.getByRole('combobox', {name: 'Surah'})).toHaveProperty('value', '1');
    expect(screen.getByLabelText('From ayah')).toHaveProperty('value', '1');
    expect(screen.getByLabelText('To ayah')).toHaveProperty('value', '7');
    fireEvent.change(screen.getByLabelText('From ayah'), {target: {value: '2'}});
    fireEvent.click(screen.getByText('Use this recitation'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(qud.getChapterSegments).toHaveBeenCalledWith({
      slug: 'abdul_hamid_ghraio_2025_yt',
      chapter: 1,
      verseFrom: 2,
      verseTo: 7,
    });
    expect(fetch).toHaveBeenCalledWith(chapterFixture.audio_url);
    const audioPath = 'mushaf-studio/my-fatiha/abdul_hamid_ghraio_2025_yt-1-2-7.mp3';
    const timingsPath = 'mushaf-studio/my-fatiha/abdul_hamid_ghraio_2025_yt-1-2-7.timings.json';
    expect(studio.writeStaticFile).toHaveBeenCalledTimes(2);
    const [audioWrite, timingsWrite] = studio.writeStaticFile.mock.calls as unknown as [
      [{filePath: string; contents: ArrayBuffer}],
      [{filePath: string; contents: string}],
    ];
    expect(audioWrite[0].filePath).toBe(audioPath);
    expect(new Uint8Array(audioWrite[0].contents)).toEqual(new Uint8Array([1, 2, 3]));
    expect(timingsWrite[0]).toEqual({filePath: timingsPath, contents: JSON.stringify(timings, null, 1)});
    expect(qud.timingsFromCatalogue).toHaveBeenCalledWith(chapterFixture, {audio: audioPath});
    const call = studio.saveDefaultProps.mock.calls[0] as unknown as [
      {
        compositionId: string;
        defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>;
      },
    ];
    expect(call[0].compositionId).toBe('MushafRecitation');
    const saved = {
      ...defaultMushafRecitationProps,
      fromAyah: 3,
      splits: [{page: 1, line: 2, atWordId: 3}],
      text: {...defaultMushafRecitationProps.text, translationFile: 'keep-me.json'},
    };
    const next = call[0].defaultProps({savedDefaultProps: saved});
    expect(next).toMatchObject({audioFile: audioPath, timingsFile: timingsPath, fromAyah: 0, toAyah: 0, splits: []});
    expect(next.text).toEqual(saved.text);
    expect(next.theme).toBe('plain');
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
    // The clip is what Align works on now: an earlier upload is forgotten.
    expect(getStudioState().uploadedAudio).toBeNull();
  });

  it('keeps the catalogue URL as the audio when the clip cannot be downloaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ok: false, status: 503})),
    );
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    await screen.findByText('Use this recitation');
    fireEvent.click(screen.getByText('Use this recitation'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(studio.writeStaticFile).toHaveBeenCalledTimes(1);
    expect(qud.timingsFromCatalogue).toHaveBeenCalledWith(chapterFixture, {audio: chapterFixture.audio_url});
    const call = studio.saveDefaultProps.mock.calls[0] as unknown as [
      {defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>},
    ];
    expect(call[0].defaultProps({savedDefaultProps: {}}).audioFile).toBe(chapterFixture.audio_url);
    await waitFor(() => expect(getStudioState().notice).toMatch(/could not be downloaded \(HTTP 503\)/));
  });

  it('shows a failure in the status line, never as a React error', async () => {
    qud.getChapterSegments.mockRejectedValue(new Error('aligner down'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    await screen.findByText('Use this recitation');
    fireEvent.click(screen.getByText('Use this recitation'));
    await waitFor(() => expect(getStudioState().error).toBe('aligner down'));
    expect(screen.getByText('aligner down')).toBeTruthy();
    expect(studio.writeStaticFile).not.toHaveBeenCalled();
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Dismiss'));
    expect(getStudioState().error).toBeNull();
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not re-render when the composition re-renders with the same content', async () => {
    const {rerender} = render(
      <MushafStudioPanel compositionId="MushafRecitation" props={resolvedProps(timings)} initialTab="lines" />,
    );
    expect(linesRenders.count).toBe(1);
    // A new props object with the same content and a new `resolved` identity: what a frame gives.
    rerender(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={resolvedProps(JSON.parse(JSON.stringify(timings)), {splits: []})}
        initialTab="lines"
      />,
    );
    expect(linesRenders.count).toBe(1);
    // A content change does reach the dock.
    rerender(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={resolvedProps(timings, {timingsFile: 'other.json'})}
        initialTab="lines"
      />,
    );
    expect(linesRenders.count).toBe(2);
    // So does a re-alignment that keeps every count: another session, other word times.
    const realigned: StudioTimings = {
      ...timings,
      ayat: [{ayah: 2, start: 0.2, end: 2.95, words: [{id: '1:2:1', start: 0.2, end: 0.67}]}],
      alignment: {...timings.alignment!, audioId: 'again'},
    };
    rerender(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={resolvedProps(realigned, {timingsFile: 'other.json'})}
        initialTab="lines"
      />,
    );
    expect(linesRenders.count).toBe(3);
    expect(qud.listRecitations).not.toHaveBeenCalled();
  });

  it('starts under the top bar on the right, moves to the left edge on request, and remembers it', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    const root = dock()!;
    expect(root.style.top).toBe('40px');
    expect(root.style.right).toBe('0px');
    expect(root.style.left).toBe('');
    expect(root.dataset.side).toBe('right');
    fireEvent.click(screen.getByTitle('Move the panel to the left edge'));
    expect(root.style.left).toBe('0px');
    expect(root.style.right).toBe('');
    expect(root.dataset.side).toBe('left');
    expect(JSON.parse(localStorage.getItem('mushaf-studio.panel')!)).toMatchObject({side: 'left', collapsed: false});
    fireEvent.click(screen.getByTitle('Collapse the panel'));
    expect(root.style.width).toBe('28px');
    expect(root.style.left).toBe('0px');
    fireEvent.click(screen.getByTitle('Open the Mushaf panel'));
    fireEvent.click(screen.getByTitle('Move the panel to the right edge'));
    expect(root.style.right).toBe('0px');
  });

  it('keeps the dock up when a tab crashes: the error goes to the status line and Reload mounts the tab again', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    linesRenders.crash = true;
    render(<MushafStudioPanel compositionId="MushafRecitation" props={resolvedProps(timings)} initialTab="lines" />);
    expect(dock()).not.toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(getStudioState().error).toBe('the Lines tab exploded');
    expect(screen.getByText('the Lines tab exploded')).toBeTruthy();
    expect(screen.getByText('Reload')).toBeTruthy();
    expect(screen.queryByText('Slots (0)')).toBeNull();
    // The other tabs are not affected.
    fireEvent.click(screen.getByRole('tab', {name: 'Review'}));
    expect(screen.getByText(/Ayahs \(1\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', {name: 'Lines'}));
    expect(screen.getByText('Reload')).toBeTruthy();
    linesRenders.crash = false;
    fireEvent.click(screen.getByText('Reload'));
    expect(screen.queryByText('Reload')).toBeNull();
    expect(screen.getByText('Slots (0)')).toBeTruthy();
    errors.mockRestore();
  });

  it('shows a saved change before the composition comes back with it, then lets the props speak', async () => {
    const {rerender} = render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="text" />,
    );
    expect(screen.getByText('Now: none')).toBeTruthy();
    await patchProps('MushafRecitation', {text: {translationFile: 'mushaf-studio/p/t.json'}});
    await screen.findByText('Now: mushaf-studio/p/t.json');
    // A frame with the old props (the Root has not reloaded yet) does not take the change back.
    rerender(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={{...defaultMushafRecitationProps, resolved: null, splits: []}}
        initialTab="text"
      />,
    );
    expect(screen.getByText('Now: mushaf-studio/p/t.json')).toBeTruthy();
    expect(getStudioState().pendingPatch).toEqual({text: {translationFile: 'mushaf-studio/p/t.json'}});
    // The props arrive with it: the pending patch has done its job.
    rerender(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={{
          ...defaultMushafRecitationProps,
          text: {...defaultMushafRecitationProps.text, translationFile: 'mushaf-studio/p/t.json'},
        }}
        initialTab="text"
      />,
    );
    await waitFor(() => expect(getStudioState().pendingPatch).toBeNull());
    expect(screen.getByText('Now: mushaf-studio/p/t.json')).toBeTruthy();
  });
});

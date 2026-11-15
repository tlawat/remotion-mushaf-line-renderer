// @vitest-environment jsdom
// The panel of a drop-in slot: saves under the template's key (the first one writing complete
// props over `null`), Source first while the slot is empty, seeks and the playhead shifted by the
// slot's start, looks that leave the box's size alone, one dock for several slots, and the error a
// slot resolver left shown in the dock.
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import type * as React from 'react';
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
const clock = vi.hoisted(() => ({frame: 0, sequences: [] as Record<string, unknown>[]}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  getRemotionEnvironment: () => env,
  useRemotionEnvironment: () => env,
  useVideoConfig: () => ({width: 1080, height: 1920, fps: 30, durationInFrames: 900, id: 'MyTemplate'}),
  useCurrentFrame: () => clock.frame,
  Sequence: ({children, ...props}: {children?: React.ReactNode}) => {
    clock.sequences.push(props);
    return <>{children}</>;
  },
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
  goToComposition: vi.fn(),
  focusDefaultPropsPath: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);

const qud = vi.hoisted(() => ({
  listRecitations: vi.fn(),
  getChapterSegments: vi.fn(),
  getChapterAudioUrl: vi.fn(),
  timingsFromCatalogue: vi.fn(),
  alignAudio: vi.fn(),
  sessionTimestamps: vi.fn(),
  splitSession: vi.fn(),
  realignSession: vi.fn(),
  timingsFromQud: vi.fn(),
}));
vi.mock('../../../src/qud', () => ({...qud, DEFAULT_CONFIDENCE_THRESHOLD: 0.8}));
vi.mock('../../../src/translations', () => ({
  listQuranComTranslations: vi.fn(async () => []),
  fetchQuranComTranslation: vi.fn(),
  fetchQuranComWordGloss: vi.fn(),
  serialiseTranslation: vi.fn(),
  loadTranslation: vi.fn(),
}));
vi.mock('../../../src/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/content')>()),
  listQuranComTafsirs: vi.fn(async () => []),
}));

const {MushafStudioPanel} = await import('../../../src/studio');
const {Waveform} = await import('../../../src/studio/Waveform');
const {emptySlotPropsFor, defaultMushafRecitationSlotProps, mushafRecitationSlotSchema} = await import(
  '../../../src/slots'
);
const {MUSHAF_LOOKS, lookById, lookInBox} = await import('../../../src/presets');
const {resetStudioStore, getStudioState, setStudioState} = await import('../../../src/studio/store');
const {resetSaveTracking} = await import('../../../src/studio/studio-api');
const {dockSpaceHolders, STUDIO_CONTAINER_ID} = await import('../../../src/studio/dock-space');
type MushafRecitationProps = import('../../../src/compositions/recitation/schema').MushafRecitationProps;
type StudioTimings = import('../../../src/types').StudioTimings;

type SaveCall = [
  {compositionId: string; defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>},
];
const saved = (index: number, savedDefaultProps: Record<string, unknown>): Record<string, unknown> =>
  (studio.saveDefaultProps.mock.calls[index] as unknown as SaveCall)[0].defaultProps({savedDefaultProps});
const saveTarget = (index: number) =>
  (studio.saveDefaultProps.mock.calls[index] as unknown as SaveCall)[0].compositionId;

const docks = () => [...document.body.querySelectorAll<HTMLElement>('[data-mushaf-studio="panel"]')];
const card = (id: string) => document.body.querySelector<HTMLButtonElement>(`[data-look="${id}"]`)!;

/** What a template's Root holds: its own props, and the slot's under `mushaf`. */
const template = (mushaf: unknown) => ({title: 'Al-Fatihah', introSeconds: 1.5, mushaf});

const timings: StudioTimings = {
  version: 1,
  surah: 1,
  ayat: [{ayah: 2, start: 0.1, end: 2.95, words: [{id: '1:2:1', start: 0.1, end: 0.67}]}],
  alignment: {
    version: 1,
    source: 'qud',
    segments: [
      {
        segment: 1,
        timeFrom: 2,
        timeTo: 3,
        refFrom: '1:2:1',
        refTo: '1:2:1',
        confidence: 0.5,
        hasMissingWords: false,
        hasRepeatedWords: false,
        error: null,
        matchedText: 'ٱلْحَمْدُ',
      },
    ],
    words: [],
    edits: [],
  },
};

const resolvedSlot = (rest: Partial<MushafRecitationProps> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationSlotProps,
  audioFile: '',
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
    durationInFrames: 120,
  },
});

beforeEach(() => {
  resetStudioStore();
  resetSaveTracking();
  clock.frame = 0;
  clock.sequences = [];
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

describe('a slot with no recitation yet', () => {
  it('opens on Source, says what the first save does, and shows the empty props to the tabs', () => {
    setStudioState({tab: 'review'});
    render(<MushafStudioPanel compositionId="MyTemplate" props={null} kind="recitation" propsKey="mushaf" />);
    expect(screen.getByRole('tab', {selected: true}).textContent).toBe('Source');
    expect(document.body.querySelector('[data-mushaf-control="slot-empty"]')?.textContent).toContain('mushaf');
  });

  it('writes complete props under the key on the first save, and leaves the template its own', async () => {
    render(<MushafStudioPanel compositionId="MyTemplate" props={null} kind="recitation" propsKey="mushaf" />);
    fireEvent.click(screen.getByRole('tab', {name: 'Look'}));
    fireEvent.click(card('haram-night'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(saveTarget(0)).toBe('MyTemplate');
    const next = saved(0, template(null));
    expect(next.title).toBe('Al-Fatihah');
    expect(next.introSeconds).toBe(1.5);
    const mushaf = next.mushaf as MushafRecitationProps;
    // The template's schema takes it: complete props, the empty slot's with the look.
    expect(mushafRecitationSlotSchema.safeParse(mushaf).success).toBe(true);
    expect(mushaf).toMatchObject({audioFile: '', timingsFile: '', theme: 'custom', data: 'mirror'});
    expect(mushaf.layout.background).toBe('#121416');
    expect(Object.keys(mushaf).sort()).toEqual(Object.keys(emptySlotPropsFor('recitation')).sort());
  });

  it("downloads a catalogue pick into the slot's own folder and saves the files under the key", async () => {
    render(<MushafStudioPanel compositionId="MyTemplate" props={null} kind="recitation" propsKey="mushaf" />);
    fireEvent.click(await screen.findByText('Download into public/'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    const timingsPath = 'mushaf-studio/mytemplate-mushaf/abdul_hamid_ghraio_2025_yt-1-1-7.timings.json';
    expect(studio.writeStaticFile).toHaveBeenCalledWith(expect.objectContaining({filePath: timingsPath}));
    const next = saved(0, template(null));
    expect(next.title).toBe('Al-Fatihah');
    const mushaf = next.mushaf as MushafRecitationProps;
    expect(mushaf.timingsFile).toBe(timingsPath);
    expect(mushafRecitationSlotSchema.safeParse(mushaf).success).toBe(true);
    // A later save starts from what the template holds there now.
    expect((saved(0, template(resolvedSlot({theme: 'normal'}))).mushaf as MushafRecitationProps).theme).toBe('normal');
  });
});

describe('a slot with a recitation', () => {
  it('hides the Format row and keeps layout.aspect when a look is applied: the box decides the size', async () => {
    render(<MushafStudioPanel compositionId="MyTemplate" props={resolvedSlot()} propsKey="mushaf" initialTab="look" />);
    expect(screen.getByText(/a look leaves layout\.aspect as it is/)).toBeTruthy();
    expect(document.body.querySelector('[data-mushaf-control="format"]')).toBeNull();
    fireEvent.click(card('haram-night'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    const mushaf = saved(0, template(resolvedSlot())).mushaf as MushafRecitationProps;
    expect(mushaf.layout.aspect).toBe('16:9');
    expect(mushaf.layout.background).toBe('#121416');
    // An old frame look's id gives its format, which a slot takes without the aspect.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(lookInBox(lookById('reel')!).patch.layout).toEqual({marginX: 90, verticalAlign: 0.45});
    expect(MUSHAF_LOOKS.every((look) => look.patch.layout?.aspect === undefined)).toBe(true);
  });

  it("seeks at the slot's start in the template, and marks the doubts there", () => {
    render(
      <MushafStudioPanel
        compositionId="MyTemplate"
        props={resolvedSlot()}
        propsKey="mushaf"
        frameOffset={45}
        initialTab="review"
      />,
    );
    const row = document.body.querySelector<HTMLElement>('li[data-segment="1"]')!;
    fireEvent.click(row);
    // 2 s into the recitation at 30 fps, 45 frames into the template.
    expect(studio.seek).toHaveBeenCalledWith(105);
    // The markers: in a Sequence of their own at the slot's start, as long as the slot.
    const group = clock.sequences.find((s) => s.name === 'Mushaf doubts');
    expect(group).toMatchObject({from: 45, durationInFrames: 120, layout: 'none'});
    expect(clock.sequences.some((s) => s.from === 60 && s.durationInFrames === 30)).toBe(true);
  });

  it("ends the markers with the slot's box when it says how long it is", () => {
    const at = (durationInFrames: number) => {
      clock.sequences = [];
      cleanup();
      render(
        <MushafStudioPanel
          compositionId="MyTemplate"
          props={resolvedSlot()}
          propsKey="mushaf"
          frameOffset={45}
          durationInFrames={durationInFrames}
        />,
      );
      return clock.sequences.find((s) => s.name === 'Mushaf doubts');
    };
    // Shorter and longer than the resolver's 120 frames: the box's length, not the resolver's.
    expect(at(50)).toMatchObject({from: 45, durationInFrames: 50});
    expect(at(300)).toMatchObject({from: 45, durationInFrames: 300});
  });

  it('adds no doubts track to the template when nothing is doubtful', () => {
    const sure: StudioTimings = {
      ...timings,
      alignment: {...timings.alignment!, segments: timings.alignment!.segments.map((s) => ({...s, confidence: 0.99}))},
    };
    const props = resolvedSlot();
    render(
      <MushafStudioPanel
        compositionId="MyTemplate"
        props={{...props, resolved: {...(props.resolved as object), timings: sure}}}
        propsKey="mushaf"
        frameOffset={45}
      />,
    );
    expect(clock.sequences.some((s) => s.name === 'Mushaf doubts')).toBe(false);
  });

  it('seeks at frame 0 of a composition of its own, as before', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={resolvedSlot()} initialTab="review" />);
    fireEvent.click(document.body.querySelector<HTMLElement>('li[data-segment="1"]')!);
    expect(studio.seek).toHaveBeenCalledWith(60);
    expect(clock.sequences.some((s) => s.name === 'Mushaf doubts')).toBe(false);
  });

  it('shows the error the slot resolver left, above the status line', () => {
    const failed = {
      ...defaultMushafRecitationSlotProps,
      resolved: {error: 'timingsFile is broken', durationInFrames: 0},
    };
    render(<MushafStudioPanel compositionId="MyTemplate" props={failed} propsKey="mushaf" />);
    const alert = document.body.querySelector('[data-mushaf-control="slot-error"]');
    expect(alert?.textContent).toBe('The mushaf slot shows nothing: timingsFile is broken');
  });

  it('says which resolver to call when no resolver filled the props in', () => {
    const unresolved = {...defaultMushafRecitationSlotProps, timingsFile: 't.timings.json', resolved: null};
    render(<MushafStudioPanel compositionId="MyTemplate" props={unresolved} propsKey="mushaf" />);
    const alert = document.body.querySelector('[data-mushaf-control="slot-error"]');
    expect(alert?.textContent).toMatch(
      /^The mushaf slot shows nothing: the props are not resolved: call resolveMushafRecitationSlot\(\)/,
    );
  });
});

describe('the waveform in a slot', () => {
  it("draws the playhead at the recitation's time: the template's frame less the slot's start", () => {
    const view = {from: 0, to: 10};
    const cursorLeft = () =>
      (document.body.querySelector('[data-mushaf-waveform="cursor"]') as HTMLElement | null)?.style.left;
    clock.frame = 180;
    const props = {audioFile: 'a.mp3', offset: 0, view, segments: [], threshold: 0.8, selected: null, fps: 30};
    const {unmount} = render(<Waveform {...props} frameOffset={150} onSeek={() => undefined} />);
    expect(cursorLeft()).toBe('10%');
    unmount();
    render(<Waveform {...props} onSeek={() => undefined} />);
    expect(cursorLeft()).toBe('60%');
  });
});

describe('several slots in one template', () => {
  it('show one dock with a picker, and the picked slot is the one that saves', async () => {
    render(
      <>
        <MushafStudioPanel compositionId="MyTemplate" props={resolvedSlot()} propsKey="first" initialTab="look" />
        <MushafStudioPanel compositionId="MyTemplate" props={null} kind="recitation" propsKey="second" />
      </>,
    );
    expect(docks()).toHaveLength(1);
    const picker = screen.getByRole('combobox', {name: 'Which slot of this template the panel edits'});
    expect([...picker.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['first', 'second']);
    expect((picker as HTMLSelectElement).value).toBe('MyTemplate/first');
    fireEvent.change(picker, {target: {value: 'MyTemplate/second'}});
    expect(docks()).toHaveLength(1);
    expect(getStudioState().activePanels).toEqual({MyTemplate: 'MyTemplate/second'});
    // The second slot is empty: its dock opens on Source and says so.
    expect(document.body.querySelector('[data-mushaf-control="slot-empty"]')?.textContent).toContain('second');
    fireEvent.click(screen.getByRole('tab', {name: 'Look'}));
    fireEvent.click(card('haram-night'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    const next = saved(0, {first: resolvedSlot(), second: null});
    expect((next.first as MushafRecitationProps).layout.background).toBe('transparent');
    expect((next.second as MushafRecitationProps).layout.background).toBe('#121416');
  });

  it('show one dock for two slots with one key, and keep it when the first goes', () => {
    const root = document.createElement('div');
    root.id = STUDIO_CONTAINER_ID;
    document.body.append(root);
    const {rerender} = render(
      <>
        <MushafStudioPanel key="a" compositionId="MyTemplate" props={resolvedSlot()} propsKey="mushaf" />
        <MushafStudioPanel key="b" compositionId="MyTemplate" props={resolvedSlot()} propsKey="mushaf" />
      </>,
    );
    expect(docks()).toHaveLength(1);
    // One key, one entry in the picker: no picker.
    expect(screen.queryByRole('combobox', {name: 'Which slot of this template the panel edits'})).toBeNull();
    // The space for the dock is reserved once, as for one panel.
    expect(dockSpaceHolders()).toBe(1);
    rerender(<MushafStudioPanel key="b" compositionId="MyTemplate" props={resolvedSlot()} propsKey="mushaf" />);
    expect(docks()).toHaveLength(1);
    expect(getStudioState().panels.MyTemplate?.map((p) => p.key)).toEqual(['MyTemplate/mushaf']);
    expect(dockSpaceHolders()).toBe(1);
    cleanup();
    root.remove();
    expect(dockSpaceHolders()).toBe(0);
  });

  it('keeps the dock when the picked slot goes, on the one left', () => {
    const {rerender} = render(
      <>
        <MushafStudioPanel compositionId="MyTemplate" props={resolvedSlot()} propsKey="first" />
        <MushafStudioPanel compositionId="MyTemplate" props={resolvedSlot()} propsKey="second" />
      </>,
    );
    setStudioState({activePanels: {MyTemplate: 'MyTemplate/second'}});
    rerender(<MushafStudioPanel compositionId="MyTemplate" props={resolvedSlot()} propsKey="first" />);
    expect(docks()).toHaveLength(1);
    expect(screen.queryByRole('combobox', {name: 'Which slot of this template the panel edits'})).toBeNull();
    expect(getStudioState().panels.MyTemplate?.map((p) => p.key)).toEqual(['MyTemplate/first']);
  });
});

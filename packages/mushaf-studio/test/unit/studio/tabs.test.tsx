// @vitest-environment jsdom
// The tabs under jsdom, one user path each: Align (consent, the uploaded recording, the token),
// Source and Align on an ayah text (the passage's text in the same patch, or no patch at all), Review (boundaries, a batch of nudges, the marker, a split that keeps the log, the captions
// export), Lines (a split patch, then another before the Root comes back) and Text (a file of the
// wrong kind, file names, the Quran text for a recitation and for an ayah text, no glosses on an
// ayah text).
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import chapterFixture from '../../fixtures/qud/chapter-1-segments.json';
import recitationsFixture from '../../fixtures/qud/recitations.json';
import fatihaText from '../../fixtures/unicode/fatiha-text.json';
import {fatihaLines} from '../compositions/helpers/fatiha-lines';

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
  getStaticFiles: vi.fn(() => [] as {src: string; name: string; sizeInBytes: number; lastModified: number}[]),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  goToComposition: vi.fn(),
  focusDefaultPropsPath: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);

const qud = vi.hoisted(() => ({
  listRecitations: vi.fn(async () => []),
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
  listQuranComTranslations: vi.fn(async (): Promise<unknown[]> => []),
  fetchQuranComTranslation: vi.fn(),
  fetchQuranComWordGloss: vi.fn(),
  serialiseTranslation: vi.fn(),
  loadTranslation: vi.fn(),
}));
vi.mock('../../../src/translations', () => translations);

// quran.com stays out of it: the text a fetch gives is the fixture's.
const unicodeText = vi.hoisted(() => ({fetchQuranComText: vi.fn()}));
vi.mock('../../../src/unicode/text', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/unicode/text')>()),
  fetchQuranComText: unicodeText.fetchQuranComText,
}));

const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {defaultMushafAyahTextProps} = await import('../../../src/unicode/schema');
const {parseAyahWords, serialiseAyahWords} = await import('../../../src/unicode/text');
const {captionsToSrt, toCaptions} = await import('../../../src/captions');
const {MushafStudioError} = await import('../../../src/errors');
const {resetStudioStore, getStudioState, setStudioState} = await import('../../../src/studio/store');
type MushafAyahTextProps = import('../../../src/unicode/schema').MushafAyahTextProps;
type StudioTimings = import('../../../src/types').StudioTimings;
type AlignmentWord = import('../../../src/types').AlignmentWord;
type ResolvedRecitation = import('../../../src/types').ResolvedRecitation;
type MushafRecitationProps = import('../../../src/compositions/recitation/schema').MushafRecitationProps;
type StudioSession = import('../../../src/studio/store').StudioSession;

const word = (id: string, text: string, segment: number, start: number, end: number): AlignmentWord => ({
  id,
  text,
  segment,
  start,
  end,
});

/** Two segments: ayah 2, then ayah 3 recited with its first word twice, complete, with its end marker 1:3:3. */
const reviewTimings = (): StudioTimings => ({
  version: 1,
  surah: 1,
  audio: 'mushaf-studio/p/fatiha.mp3',
  ayat: [
    {
      ayah: 2,
      start: 0.1,
      end: 2.95,
      words: [
        {id: '1:2:1', start: 0.1, end: 0.67},
        {id: '1:2:2', start: 0.67, end: 1.29},
        {id: '1:2:3', start: 1.29, end: 1.72},
        {id: '1:2:4', start: 1.72, end: 2.95},
      ],
    },
    {
      ayah: 3,
      start: 3.49,
      end: 7.8,
      complete: true,
      words: [
        {id: '1:3:1', start: 3.49, end: 4.56},
        {id: '1:3:1', start: 5, end: 6},
        {id: '1:3:2', start: 6, end: 7},
        {id: '1:3:3', start: 7, end: 7.8},
      ],
    },
  ],
  alignment: {
    version: 1,
    source: 'qud',
    audioId: 'abc',
    segments: [
      {
        segment: 1,
        timeFrom: 0,
        timeTo: 3,
        refFrom: '1:2:1',
        refTo: '1:2:4',
        confidence: 1,
        hasMissingWords: false,
        hasRepeatedWords: false,
        error: null,
        matchedText: 'الحمد لله رب العالمين',
      },
      {
        segment: 2,
        timeFrom: 3.4,
        timeTo: 7.8,
        refFrom: '1:3:1',
        refTo: '1:3:2',
        confidence: 0.7,
        hasMissingWords: false,
        hasRepeatedWords: true,
        error: null,
        matchedText: 'الرحمن الرحمن الرحيم',
      },
    ],
    words: [
      word('1:2:1', 'ٱلْحَمْدُ', 1, 0.1, 0.67),
      word('1:2:2', 'لِلَّهِ', 1, 0.67, 1.29),
      word('1:2:3', 'رَبِّ', 1, 1.29, 1.72),
      word('1:2:4', 'ٱلْعَٰلَمِينَ', 1, 1.72, 2.95),
      word('1:3:1', 'ٱلرَّحْمَٰنِ', 2, 3.49, 4.56),
      word('1:3:1', 'ٱلرَّحْمَٰنِ', 2, 5, 6),
      word('1:3:2', 'ٱلرَّحِيمِ', 2, 6, 7),
    ],
    edits: [{kind: 'nudge', at: '2026-10-03T11:00:00.000Z', note: '1:2:2#0: 0.6-1.29s to 0.67-1.29s'}],
  },
});

/** The file's times moved `offset` seconds earlier, as `resolveRecitation()` hands them to the composition. */
const shifted = (t: StudioTimings, offset: number): StudioTimings => {
  const move = (seconds: number) => Math.round((seconds - offset) * 1e6) / 1e6;
  return {
    ...t,
    ayat: t.ayat.map((a) => ({
      ...a,
      start: move(a.start),
      end: move(a.end),
      words: a.words!.map((w) => ({...w, start: move(w.start), end: move(w.end)})),
    })),
    alignment: {
      ...t.alignment!,
      segments: t.alignment!.segments.map((s) => ({...s, timeFrom: move(s.timeFrom), timeTo: move(s.timeTo)})),
      words: t.alignment!.words.map((w) => ({...w, start: move(w.start), end: move(w.end)})),
    },
  };
};

/** `resolved` as `calculateMetadata()` fills it: the file cut to `fromAyah` and moved `audioOffsetSeconds` earlier. */
const resolvedFor = (t: StudioTimings, audioOffsetSeconds = 0, fromAyah = 0): ResolvedRecitation => ({
  timings: shifted({...t, ayat: t.ayat.filter((a) => a.ayah >= fromAyah)}, audioOffsetSeconds),
  audioOffsetSeconds,
  lines: fatihaLines(2, 3),
  schedule: [
    {index: 0, start: 0.1, end: 3.49},
    {index: 1, start: 3.49, end: 7.8},
  ],
  translation: null,
  gloss: null,
  transliteration: null,
  doubtful: {},
});

const propsWith = (
  t: StudioTimings,
  rest: Partial<MushafRecitationProps> = {},
  audioOffsetSeconds = 0,
): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  audioFile: 'mushaf-studio/p/fatiha.mp3',
  timingsFile: 'mushaf-studio/p/fatiha.timings.json',
  ...rest,
  resolved: resolvedFor(t, audioOffsetSeconds, rest.fromAyah ?? 0),
});

/** `<MushafAyahText>`'s props over the same timings: `resolved` with `timings` and the text, no lines, no offset. */
const ayahTextProps = (t: StudioTimings): MushafAyahTextProps => ({
  ...defaultMushafAyahTextProps,
  audioFile: 'mushaf-studio/p/fatiha.mp3',
  timingsFile: 'mushaf-studio/p/fatiha.timings.json',
  resolved: {timings: t, text: parseAyahWords(fatihaText), translation: null, ayahs: []},
});

const session = (): StudioSession => ({
  audioId: 'abc',
  align: {audio_id: 'abc', segments: []} as unknown as StudioSession['align'],
  audio: 'mushaf-studio/p/fatiha.mp3',
  model: 'Base',
  device: 'GPU',
  riwayah: 'hafs',
});

type SaveCall = [
  {compositionId: string; defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>},
];
type WriteCall = [{filePath: string; contents: string | ArrayBuffer}];

const saved = (index: number, base: Record<string, unknown> = {}): Record<string, unknown> =>
  (studio.saveDefaultProps.mock.calls[index] as unknown as SaveCall)[0].defaultProps({savedDefaultProps: base});
const written = (index: number): WriteCall[0] => (studio.writeStaticFile.mock.calls[index] as unknown as WriteCall)[0];
const writtenJson = (index: number): StudioTimings => JSON.parse(written(index).contents as string) as StudioTimings;
const panel = (props: MushafRecitationProps, tab: 'align' | 'review' | 'lines' | 'text') =>
  render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab={tab} />);

beforeEach(() => {
  resetStudioStore();
  env.isStudio = true;
  env.isRendering = false;
  env.isClientSideRendering = false;
  // A recording for `readPublicFile()`, the timings file (as committed, untrimmed, unshifted) for `readTimingsFile()`.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['audio']),
      json: async () => reviewTimings(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetStudioStore();
});

describe('Align', () => {
  it('says where the audio goes before the button, aligns the uploaded recording over a public clip, and keeps the token out of every file and prop', async () => {
    setStudioState({uploadedAudio: 'mushaf-studio/p/My Take.m4a'});
    const timings = reviewTimings();
    qud.alignAudio.mockResolvedValue({audio_id: 'sess-1', segments: [], device: 'GPU'});
    qud.sessionTimestamps.mockResolvedValue({audio_id: 'sess-1', segments: []});
    qud.timingsFromQud.mockReturnValue(timings);
    panel(propsWith(timings, {audioFile: 'mushaf-studio/p/clip.mp3'}), 'align');
    expect(screen.getByText('public/mushaf-studio/p/My Take.m4a')).toBeTruthy();
    const consent = screen.getByText(/Your audio leaves this machine only when you press Align/);
    const button = screen.getByRole('button', {name: 'Align'});
    expect(consent.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Hugging Face token (optional, for your own GPU quota)'), {
      target: {value: 'hf_secret'},
    });
    fireEvent.click(button);
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/p/My Take.m4a');
    const [blob, name, options, auth] = qud.alignAudio.mock.calls[0] as unknown as [Blob, string, object, object];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe('My Take.m4a');
    expect(options).toMatchObject({model: 'Base', device: 'GPU', riwayah: 'hafs'});
    expect(auth).toEqual({token: 'hf_secret'});
    expect(qud.sessionTimestamps).toHaveBeenCalledWith('sess-1', {}, {token: 'hf_secret'});
    expect(written(0).filePath).toBe('mushaf-studio/mushafrecitation/my-take.timings.json');
    expect(saved(0)).toMatchObject({
      audioFile: 'mushaf-studio/p/My Take.m4a',
      timingsFile: 'mushaf-studio/mushafrecitation/my-take.timings.json',
      fromAyah: 0,
      toAyah: 0,
      splits: [],
    });
    const everything = JSON.stringify([
      studio.writeStaticFile.mock.calls,
      studio.saveDefaultProps.mock.calls.map((_, i) => saved(i)),
      localStorage,
    ]);
    expect(everything).not.toContain('hf_secret');
    expect(sessionStorage.getItem('mushaf-studio.hf-token')).toBe('hf_secret');
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().session).toMatchObject({audioId: 'sess-1', audio: 'mushaf-studio/p/My Take.m4a'});
    expect(getStudioState().error).toBeNull();
    // A recitation reads no Quran text: none is fetched, the one file written is the timings.
    expect(unicodeText.fetchQuranComText).not.toHaveBeenCalled();
    expect(studio.writeStaticFile).toHaveBeenCalledTimes(1);
  });

  it('has nothing to align when the composition plays a URL and nothing was uploaded', () => {
    panel(propsWith(reviewTimings(), {audioFile: 'https://x.y/z.mp3'}), 'align');
    expect(screen.getByRole('button', {name: 'Align'})).toHaveProperty('disabled', true);
    expect(screen.getByText(/Put a recording into public\//)).toBeTruthy();
  });
});

describe('a new recording on an ayah text', () => {
  const ayahPanel = (tab: 'source' | 'align') =>
    render(
      <MushafStudioPanel
        compositionId="MushafAyahText"
        props={ayahTextProps(reviewTimings())}
        initialTab={tab}
        project="Reel"
      />,
    );
  const quranComDown = () =>
    unicodeText.fetchQuranComText.mockRejectedValue(
      new MushafStudioError('TRANSLATION_FETCH_FAILED', 'quran.com answered 1:2-3 with HTTP 503.'),
    );

  beforeEach(() => {
    qud.listRecitations.mockResolvedValue(recitationsFixture.recitations as never);
    qud.getChapterSegments.mockResolvedValue(chapterFixture);
    // The clip of the passage is ayahs 2-3 of Al-Fatihah: the old text (and the props' textFile) is another passage's.
    qud.timingsFromCatalogue.mockReturnValue(reviewTimings());
    qud.alignAudio.mockResolvedValue({audio_id: 'sess-1', segments: [], device: 'GPU'});
    qud.sessionTimestamps.mockResolvedValue({audio_id: 'sess-1', segments: []});
    qud.timingsFromQud.mockReturnValue(reviewTimings());
    unicodeText.fetchQuranComText.mockResolvedValue(parseAyahWords(fatihaText));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob(['audio']),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
    );
  });

  const textPath = 'mushaf-studio/reel/text-uthmani-1-2-3.json';

  it("Source fetches the passage's text in the font's script and sets it with the timings, in one patch", async () => {
    ayahPanel('source');
    fireEvent.click(await screen.findByText('Use this recitation'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(unicodeText.fetchQuranComText).toHaveBeenCalledWith({chapter: 1, fromAyah: 2, toAyah: 3, script: 'uthmani'});
    const timingsPath = 'mushaf-studio/reel/abdul_hamid_ghraio_2025_yt-1-1-7.timings.json';
    expect(studio.writeStaticFile.mock.calls.map((_, i) => written(i).filePath)).toEqual([
      'mushaf-studio/reel/abdul_hamid_ghraio_2025_yt-1-1-7.mp3',
      timingsPath,
      textPath,
    ]);
    expect(written(2).contents).toBe(serialiseAyahWords(parseAyahWords(fatihaText)));
    expect(saved(0)).toEqual({
      audioFile: 'mushaf-studio/reel/abdul_hamid_ghraio_2025_yt-1-1-7.mp3',
      timingsFile: timingsPath,
      textFile: textPath,
      fromAyah: 0,
      toAyah: 0,
    });
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
  });

  it('Source patches nothing when the text cannot be fetched, and says where the timings are', async () => {
    quranComDown();
    ayahPanel('source');
    fireEvent.click(await screen.findByText('Use this recitation'));
    await waitFor(() => expect(getStudioState().error).not.toBeNull());
    expect(getStudioState().error).toBe(
      'The timings are in public/mushaf-studio/reel/abdul_hamid_ghraio_2025_yt-1-1-7.timings.json, but the Quran text for 1:2-3 could not be fetched: quran.com answered 1:2-3 with HTTP 503; fetch it in the Text tab, then pick the timings again.',
    );
    expect(studio.writeStaticFile).toHaveBeenCalledTimes(2);
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
    expect(studio.reevaluateComposition).not.toHaveBeenCalled();
    expect(getStudioState().busy).toBeNull();
  });

  it("Align fetches the passage's text and sets it with the timings, in one patch", async () => {
    setStudioState({uploadedAudio: 'mushaf-studio/reel/take.m4a'});
    ayahPanel('align');
    fireEvent.click(screen.getByRole('button', {name: 'Align'}));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(unicodeText.fetchQuranComText).toHaveBeenCalledWith({chapter: 1, fromAyah: 2, toAyah: 3, script: 'uthmani'});
    expect(studio.writeStaticFile.mock.calls.map((_, i) => written(i).filePath)).toEqual([
      'mushaf-studio/reel/take.timings.json',
      textPath,
    ]);
    expect(saved(0)).toEqual({
      audioFile: 'mushaf-studio/reel/take.m4a',
      timingsFile: 'mushaf-studio/reel/take.timings.json',
      textFile: textPath,
      fromAyah: 0,
      toAyah: 0,
    });
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
  });

  it('Align patches nothing when the text cannot be fetched, but keeps the session and the timings', async () => {
    quranComDown();
    setStudioState({uploadedAudio: 'mushaf-studio/reel/take.m4a'});
    ayahPanel('align');
    fireEvent.click(screen.getByRole('button', {name: 'Align'}));
    await waitFor(() => expect(getStudioState().error).not.toBeNull());
    expect(getStudioState().error).toMatch(
      /^The timings are in public\/mushaf-studio\/reel\/take\.timings\.json, but the Quran text for 1:2-3 could not be fetched: /,
    );
    expect(studio.writeStaticFile).toHaveBeenCalledTimes(1);
    expect(written(0).filePath).toBe('mushaf-studio/reel/take.timings.json');
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
    expect(getStudioState().session).toMatchObject({audioId: 'sess-1', audio: 'mushaf-studio/reel/take.m4a'});
  });
});

describe('Source', () => {
  it('forgets the upload when a file of public/ is picked as the audio', async () => {
    setStudioState({uploadedAudio: 'mushaf-studio/p/mine.m4a'});
    studio.getStaticFiles.mockReturnValue([
      {src: '/x', name: 'mushaf-studio/p/old.mp3', sizeInBytes: 2048, lastModified: 0},
    ]);
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    fireEvent.change(screen.getByRole('combobox', {name: 'Audio in public/'}), {
      target: {value: 'mushaf-studio/p/old.mp3'},
    });
    fireEvent.click(screen.getByText('Use as audio'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(saved(0)).toEqual({audioFile: 'mushaf-studio/p/old.mp3'});
    await waitFor(() => expect(getStudioState().uploadedAudio).toBeNull());
  });
});

describe('Review', () => {
  it('edits one boundary and keeps the others', () => {
    panel(propsWith(reviewTimings()), 'review');
    fireEvent.click(screen.getByText(/Re-align with these boundaries/));
    expect(screen.getByLabelText('Boundary 2 start')).toHaveProperty('value', '3.4');
    fireEvent.change(screen.getByLabelText('Boundary 1 start'), {target: {value: '0.5'}});
    expect(screen.getByLabelText('Boundary 1 start')).toHaveProperty('value', '0.5');
    expect(screen.getByLabelText('Boundary 1 end')).toHaveProperty('value', '3');
    expect(screen.getByLabelText('Boundary 2 start')).toHaveProperty('value', '3.4');
    expect(screen.getByLabelText('Boundary 2 end')).toHaveProperty('value', '7.8');
    fireEvent.change(screen.getByLabelText('Boundary 2 end'), {target: {value: '7.9'}});
    expect(screen.getByLabelText('Boundary 1 start')).toHaveProperty('value', '0.5');
    expect(screen.getAllByLabelText(/^Boundary \d+ start$/)).toHaveLength(2);
  });

  it('applies a batch of nudges to the occurrences the user edited and moves the marker with the last word', async () => {
    panel(propsWith(reviewTimings()), 'review');
    fireEvent.click(screen.getAllByTitle('Show the words')[1]!);
    const starts = screen.getAllByLabelText('1:3:1 start');
    const ends = screen.getAllByLabelText('1:3:1 end');
    expect(starts).toHaveLength(2);
    fireEvent.change(ends[0]!, {target: {value: '5.9'}});
    fireEvent.change(starts[0]!, {target: {value: '5.5'}});
    fireEvent.change(ends[1]!, {target: {value: '3.4'}});
    fireEvent.change(starts[1]!, {target: {value: '3'}});
    fireEvent.change(screen.getByLabelText('1:3:2 end'), {target: {value: '7.3'}});
    fireEvent.click(screen.getByText('Apply edits (3)'));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/p/fatiha.timings.json');
    expect(written(0).filePath).toBe('mushaf-studio/p/fatiha.timings.json');
    const next = writtenJson(0);
    expect(next.ayat[1]!.words).toEqual([
      {id: '1:3:1', start: 3, end: 3.4},
      {id: '1:3:1', start: 5.5, end: 5.9},
      {id: '1:3:2', start: 6, end: 7.3},
      {id: '1:3:3', start: 7.3, end: 7.8},
    ]);
    expect(next.ayat[1]!.start).toBe(3);
    expect(next.alignment!.words.slice(4).map((w) => [w.id, w.start, w.end])).toEqual([
      ['1:3:1', 3, 3.4],
      ['1:3:1', 5.5, 5.9],
      ['1:3:2', 6, 7.3],
    ]);
    expect(next.alignment!.edits).toHaveLength(2);
    expect(next.alignment!.edits[1]!.note).toBe(
      '1:3:1#0: 3.49-4.56s to 5.5-5.9s; 1:3:1#1: 5-6s to 3-3.4s; 1:3:2#0: 6-7s to 6-7.3s',
    );
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
  });

  it('writes a nudge into the file at its own times when the composition plays the recording from an offset', async () => {
    // Played from 2 s in: the tab shows segment 2 at 1.4-5.8 while the file says 3.4-7.8.
    panel(propsWith(reviewTimings(), {fromAyah: 3}, 2), 'review');
    expect(screen.getByText('1.40–5.80 s')).toBeTruthy();
    expect(screen.getByText(/Ayahs \(1\)/)).toBeTruthy();
    fireEvent.click(screen.getAllByTitle('Show the words')[1]!);
    expect(screen.getByLabelText('1:3:2 end')).toHaveProperty('value', '5');
    fireEvent.change(screen.getByLabelText('1:3:2 end'), {target: {value: '5.3'}});
    fireEvent.click(screen.getByText('Apply edits (1)'));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(1));
    const next = writtenJson(0);
    // The file's own times, the nudge moved back by the offset, the marker along; ayah 2 (outside the range) kept.
    expect(next.ayat[0]).toEqual(reviewTimings().ayat[0]);
    expect(next.ayat[1]!.words).toEqual([
      {id: '1:3:1', start: 3.49, end: 4.56},
      {id: '1:3:1', start: 5, end: 6},
      {id: '1:3:2', start: 6, end: 7.3},
      {id: '1:3:3', start: 7.3, end: 7.8},
    ]);
    expect(next.alignment!.words[6]).toEqual(word('1:3:2', 'ٱلرَّحِيمِ', 2, 6, 7.3));
    expect(next.alignment!.segments).toEqual(reviewTimings().alignment!.segments);
    expect(next.alignment!.edits[1]!.note).toBe('1:3:2#0: 6-7s to 6-7.3s');
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
  });

  it('keeps the edit log through a split and says the nudges are replaced', async () => {
    setStudioState({session: session()});
    const converted: StudioTimings = {...reviewTimings(), alignment: {...reviewTimings().alignment!, edits: []}};
    qud.splitSession.mockResolvedValue({audio_id: 'abc', segments: [], warning: 'Short clip.'});
    qud.sessionTimestamps.mockResolvedValue({audio_id: 'abc', segments: []});
    qud.timingsFromQud.mockReturnValue(converted);
    panel(propsWith(reviewTimings()), 'review');
    fireEvent.click(screen.getByText(/Split segments\.\.\./));
    fireEvent.click(screen.getByRole('button', {name: 'Split segments'}));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(1));
    expect(qud.splitSession).toHaveBeenCalledWith(
      'abc',
      {max_verses: 1, max_words: null, max_duration: 30, require_stop_sign: false},
      {token: null},
    );
    const next = writtenJson(0);
    expect(next.alignment!.edits.map((e) => e.kind)).toEqual(['nudge', 'split-segment']);
    expect(next.alignment!.edits[0]).toEqual(reviewTimings().alignment!.edits[0]);
    expect(next.alignment!.edits[1]!.note).toBe('max 1 verse(s), any words, 30 s');
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().notice).toBe(
      'Short clip. The new alignment replaces the times of the 1 nudge made before; the edit log keeps it.',
    );
  });

  it('exports the captions of the timings file at its own times, as SRT and as Caption[] JSON, markers on request', async () => {
    // The composition plays ayah 3 from 2 s in; the captions follow the audio file, every ayah of it.
    panel(propsWith(reviewTimings(), {fromAyah: 3}, 2), 'review');
    expect(screen.getByRole('checkbox', {name: 'include ayah markers'})).toHaveProperty('checked', false);
    fireEvent.click(screen.getByRole('button', {name: 'SRT'}));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/p/fatiha.timings.json');
    expect(written(0).filePath).toBe('mushaf-studio/mushafrecitation/fatiha.srt');
    const srt = written(0).contents as string;
    expect(srt.startsWith('1\n00:00:00,100 --> 00:00:00,670\nٱلْحَمْدُ\n\n2\n00:00:00,670 --> 00:00:01,290\n')).toBe(true);
    expect(srt).toBe(captionsToSrt(toCaptions(reviewTimings())));
    expect(srt).not.toContain('۝');
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().notice).toBe(
      'public/mushaf-studio/mushafrecitation/fatiha.srt is written: 7 cues, timed to the audio file.',
    );
    fireEvent.click(screen.getByRole('checkbox', {name: 'include ayah markers'}));
    fireEvent.click(screen.getByRole('button', {name: 'Captions JSON'}));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(2));
    expect(written(1).filePath).toBe('mushaf-studio/mushafrecitation/fatiha.captions.json');
    const captions = JSON.parse(written(1).contents as string) as unknown[];
    expect(captions).toEqual(toCaptions(reviewTimings(), {markers: true}));
    expect(captions).toHaveLength(8);
    expect(captions[0]).toEqual({text: 'ٱلْحَمْدُ', startMs: 100, endMs: 670, timestampMs: 100, confidence: 1});
    expect(captions[7]).toEqual({text: ' ۝٣', startMs: 7000, endMs: 7800, timestampMs: 7000, confidence: null});
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().notice).toBe(
      'public/mushaf-studio/mushafrecitation/fatiha.captions.json is written: 8 captions, timed to the audio file.',
    );
    expect(screen.getByText(/Remotion's caption tooling \(@remotion\/captions\) reads/)).toBeTruthy();
    // Exporting changes neither the timings file nor the props.
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
    expect(studio.reevaluateComposition).not.toHaveBeenCalled();
    expect(getStudioState().error).toBeNull();
  });
});

describe('Lines', () => {
  it('splits a line at a word, and a second split before the Root comes back keeps the first', async () => {
    const {container} = panel(propsWith(reviewTimings()), 'lines');
    expect(container.innerHTML).toBe('');
    expect(screen.getByText('Slots (2)')).toBeTruthy();
    const chip = (wordId: number) => document.body.querySelector<HTMLButtonElement>(`[data-word-id="${wordId}"]`)!;
    expect(chip(1).disabled).toBe(true); // the first word of its slot
    fireEvent.click(chip(2));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(saved(0, {splits: []})).toEqual({splits: [{page: 1, line: 3, atWordId: 2}]});
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(screen.getByText('Splits (1)')).toBeTruthy();
    fireEvent.click(chip(4));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    // `savedDefaultProps` still says no splits: the Root has not reloaded. Both splits are saved all the same.
    expect(saved(1, {splits: []})).toEqual({
      splits: [
        {page: 1, line: 3, atWordId: 2},
        {page: 1, line: 3, atWordId: 4},
      ],
    });
    await waitFor(() => expect(screen.getByText('Splits (2)')).toBeTruthy());
    fireEvent.click(screen.getAllByTitle('Remove this split')[0]!);
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(3));
    expect(saved(2, {splits: []})).toEqual({splits: [{page: 1, line: 3, atWordId: 4}]});
  });
});

describe('Text', () => {
  it('refuses a file of the wrong kind before it reaches the props, and names it in the status line', async () => {
    studio.getStaticFiles.mockReturnValue([
      {src: '/x', name: 'mushaf-studio/p/words.json', sizeInBytes: 10, lastModified: 0},
    ]);
    translations.loadTranslation.mockResolvedValue({
      kind: 'word',
      meta: {id: 'f', name: 'f', language: 'en', source: 'file'},
      words: {},
    });
    panel(propsWith(reviewTimings()), 'text');
    fireEvent.change(screen.getByRole('combobox', {name: 'JSON file in public/'}), {
      target: {value: 'mushaf-studio/p/words.json'},
    });
    fireEvent.click(screen.getByText('As translation'));
    await waitFor(() => expect(getStudioState().error).toMatch(/takes an ayah-by-ayah translation/));
    expect(translations.loadTranslation).toHaveBeenCalledWith('/static/mushaf-studio/p/words.json', expect.anything());
    expect(screen.getByText(/takes an ayah-by-ayah translation/)).toBeTruthy();
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
    expect(getStudioState().busy).toBeNull();
    fireEvent.click(screen.getByText('As gloss'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(saved(0)).toEqual({text: {glossFile: 'mushaf-studio/p/words.json'}});
    await waitFor(() => expect(getStudioState().error).toBeNull());
    // Clearing a prop reads no file.
    translations.loadTranslation.mockClear();
    fireEvent.click(screen.getByText('No gloss'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    expect(translations.loadTranslation).not.toHaveBeenCalled();
    expect(saved(1)).toEqual({text: {glossFile: ''}});
  });

  it('names the fetched files after the passage, under the composition when no project is given', async () => {
    translations.listQuranComTranslations.mockResolvedValue([
      {id: 20, name: 'Saheeh International', authorName: 'Saheeh', language: 'en', languageName: 'English'},
    ]);
    translations.fetchQuranComTranslation.mockResolvedValue({kind: 'ayah'});
    translations.fetchQuranComWordGloss.mockResolvedValue({kind: 'word'});
    translations.serialiseTranslation.mockReturnValue('{"serialised":true}');
    panel(propsWith(reviewTimings()), 'text');
    await screen.findByText('Fetch for this passage');
    fireEvent.click(screen.getByText('Fetch for this passage'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(translations.fetchQuranComTranslation).toHaveBeenCalledWith({
      resourceId: 20,
      chapter: 1,
      fromAyah: 2,
      toAyah: 3,
    });
    expect(written(0)).toEqual({
      filePath: 'mushaf-studio/mushafrecitation/translation-20-1-2-3.json',
      contents: '{"serialised":true}',
    });
    expect(saved(0)).toEqual({text: {translationFile: 'mushaf-studio/mushafrecitation/translation-20-1-2-3.json'}});
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    fireEvent.change(screen.getByLabelText('Language (quran.com code, en, ur, id, ...)'), {target: {value: 'Ur'}});
    fireEvent.click(screen.getByText('Fetch translation'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    expect(written(1).filePath).toBe('mushaf-studio/mushafrecitation/gloss-ur-1-2-3.json');
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    fireEvent.click(screen.getByText('Fetch transliteration'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(3));
    expect(written(2).filePath).toBe('mushaf-studio/mushafrecitation/transliteration-ur-1-2-3.json');
  });

  it("fetches the Quran text of the passage into the project and leaves a recitation's props alone", async () => {
    unicodeText.fetchQuranComText.mockResolvedValue(parseAyahWords(fatihaText));
    panel(propsWith(reviewTimings()), 'text');
    expect(screen.getByText(/The printed lines need no text file/)).toBeTruthy();
    expect(screen.getByRole('combobox', {name: 'Script'})).toHaveProperty('value', 'uthmani');
    fireEvent.click(screen.getByText('Fetch the text of this passage'));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(1));
    expect(unicodeText.fetchQuranComText).toHaveBeenCalledWith({chapter: 1, fromAyah: 2, toAyah: 3, script: 'uthmani'});
    expect(written(0)).toEqual({
      filePath: 'mushaf-studio/mushafrecitation/text-uthmani-1-2-3.json',
      contents: serialiseAyahWords(parseAyahWords(fatihaText)),
    });
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().notice).toMatch(
      /^public\/mushaf-studio\/mushafrecitation\/text-uthmani-1-2-3\.json is written\./,
    );
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
    expect(studio.reevaluateComposition).not.toHaveBeenCalled();
    expect(getStudioState().error).toBeNull();
  });

  it('shows no word gloss or transliteration controls on an ayah text, which paints none', () => {
    studio.getStaticFiles.mockReturnValue([
      {src: '/x', name: 'mushaf-studio/p/words.json', sizeInBytes: 10, lastModified: 0},
    ]);
    render(
      <MushafStudioPanel compositionId="MushafAyahText" props={ayahTextProps(reviewTimings())} initialTab="text" />,
    );
    expect(screen.getByText('Word glosses apply to MushafRecitation.')).toBeTruthy();
    expect(screen.queryByText('Word by word')).toBeNull();
    expect(screen.queryByText('Fetch transliteration')).toBeNull();
    expect(screen.queryByText('No gloss')).toBeNull();
    expect(screen.queryByText('As gloss')).toBeNull();
    expect(screen.queryByText('As transliteration')).toBeNull();
    // The ayah translation still applies.
    expect(screen.getByText('As translation')).toBeTruthy();
    cleanup();
    panel(propsWith(reviewTimings()), 'text');
    expect(screen.getByText('Word by word')).toBeTruthy();
    expect(screen.queryByText('Word glosses apply to MushafRecitation.')).toBeNull();
  });

  it("sets an ayah text's textFile to the fetched file, but not to a text in a script its font does not set", async () => {
    unicodeText.fetchQuranComText.mockImplementation(async ({script}: {script: 'uthmani' | 'indopak'}) => ({
      ...parseAyahWords(fatihaText),
      script,
    }));
    render(
      <MushafStudioPanel
        compositionId="MushafAyahText"
        props={ayahTextProps(reviewTimings())}
        initialTab="text"
        project="Reel"
      />,
    );
    expect(screen.getByText(`Now: ${defaultMushafAyahTextProps.textFile}`)).toBeTruthy();
    expect(screen.getByRole('combobox', {name: 'Script'})).toHaveProperty('value', 'uthmani');
    fireEvent.click(screen.getByText('Fetch the text of this passage'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    expect(written(0).filePath).toBe('mushaf-studio/reel/text-uthmani-1-2-3.json');
    expect(saved(0)).toEqual({textFile: 'mushaf-studio/reel/text-uthmani-1-2-3.json'});
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().notice).toBe(
      "public/mushaf-studio/reel/text-uthmani-1-2-3.json is written and is now the composition's textFile.",
    );
    expect(screen.getByText('Now: mushaf-studio/reel/text-uthmani-1-2-3.json')).toBeTruthy();
    // IndoPak text: written and named, but the Uthmani font would not resolve it, so textFile stays.
    fireEvent.change(screen.getByRole('combobox', {name: 'Script'}), {target: {value: 'indopak'}});
    fireEvent.click(screen.getByText('Fetch the text of this passage'));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(2));
    expect(unicodeText.fetchQuranComText).toHaveBeenLastCalledWith({
      chapter: 1,
      fromAyah: 2,
      toAyah: 3,
      script: 'indopak',
    });
    expect(written(1).filePath).toBe('mushaf-studio/reel/text-indopak-1-2-3.json');
    expect(JSON.parse(written(1).contents as string)).toMatchObject({kind: 'quran-text', script: 'indopak'});
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1);
    expect(getStudioState().notice).toBe(
      'public/mushaf-studio/reel/text-indopak-1-2-3.json is written, but textFile is left as it is: font "uthmani-hafs" sets uthmani text, not indopak.',
    );
  });
});

// @vitest-environment jsdom
// The page under jsdom with the package's network functions mocked (the catalogue and the chapter
// from the research fixtures, a two-entry translation list, a resolver that reads the timings
// through the page's memory fetch): pick the default reciter's surah 1, see the Player get the
// resolved props, apply a look, and find the export's fallback (jsdom has no WebCodecs).
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import type {MushafRecitationProps, ResolveRecitationOptions} from '@tlawat/mushaf-studio';
import {afterEach, describe, expect, it, vi} from 'vitest';
import chapterFixture from '../../../packages/mushaf-studio/test/fixtures/qud/chapter-1-segments.json';
import recitationsFixture from '../../../packages/mushaf-studio/test/fixtures/qud/recitations.json';

const network = vi.hoisted(() => ({
  listRecitations: vi.fn(),
  getChapterSegments: vi.fn(),
  listQuranComTranslations: vi.fn(),
  fetchQuranComTranslation: vi.fn(),
  fetchQuranComWordGloss: vi.fn(),
  fetchQuranComText: vi.fn(),
  resolveRecitation: vi.fn(),
  resolveAyahText: vi.fn(),
}));

vi.mock('@tlawat/mushaf-studio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/mushaf-studio')>()),
  ...network,
}));

// The Player stand-in shows what it was given.
vi.mock('@remotion/player', () => ({
  Player: (props: {inputProps: MushafRecitationProps; durationInFrames: number; compositionWidth: number}) => (
    <div
      data-testid="player"
      data-timings={props.inputProps.timingsFile}
      data-audio={props.inputProps.audioFile}
      data-background={props.inputProps.layout.background}
      data-duration={props.durationInFrames}
      data-width={props.compositionWidth}
    />
  ),
}));

vi.mock('@remotion/web-renderer', () => ({
  canRenderMediaOnWeb: vi.fn(async () => ({canRender: true, issues: [], resolvedAudioCodec: 'aac'})),
  renderMediaOnWeb: vi.fn(),
}));

const {App} = await import('./App');
const DEFAULT_SLUG = 'abdul_hamid_ghraio_2025_yt';
const {memoryFiles} = await import('./memory-files');
const studio = await import('@tlawat/mushaf-studio');

network.listRecitations.mockResolvedValue(recitationsFixture.recitations);
network.getChapterSegments.mockResolvedValue(chapterFixture);
network.listQuranComTranslations.mockResolvedValue([
  {id: 20, name: 'Saheeh International', authorName: 'Saheeh International', language: 'en', languageName: 'english'},
  {id: 31, name: 'Hamidullah', authorName: 'Muhammad Hamidullah', language: 'fr', languageName: 'french'},
]);
// The real timings, read the way the real resolver reads them; the lines are not needed here.
network.resolveRecitation.mockImplementation(
  async (props: MushafRecitationProps, options: ResolveRecitationOptions) => {
    const timings = await studio.readTimings(props.timingsFile, {
      fetch: options.fetch!,
      staticFile: options.staticFile!,
    });
    return {
      timings,
      audioOffsetSeconds: 0,
      lines: [],
      schedule: [],
      translation: null,
      gloss: null,
      transliteration: null,
      doubtful: {},
    };
  },
);

afterEach(() => {
  cleanup();
  memoryFiles.clear();
});

describe('<App>', () => {
  it('previews surah 1 from the default reciter, applies a look, and offers the export', async () => {
    render(<App />);
    expect(screen.getByRole('heading', {name: 'Mushaf Studio'})).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Pick a reciter/);

    const reciter = screen.getByLabelText('Reciter') as HTMLSelectElement;
    await waitFor(() => expect(reciter.value).toBe('abdul_hamid_ghraio_2025_yt'));
    const surah = screen.getByLabelText('Surah') as HTMLSelectElement;
    expect(within(surah).getByRole('option', {name: '1. Al-Fatihah'})).toBeTruthy();

    fireEvent.change(surah, {target: {value: '1'}});
    const player = await screen.findByTestId('player');
    expect(network.getChapterSegments).toHaveBeenCalledWith({slug: 'abdul_hamid_ghraio_2025_yt', chapter: 1}, {});
    expect(player.dataset.audio).toBe(chapterFixture.audio_url);
    expect(player.dataset.timings).toBe('mem://timings/abdul_hamid_ghraio_2025_yt/1.json');
    expect(memoryFiles.has('timings/abdul_hamid_ghraio_2025_yt/1.json')).toBe(true);
    expect(player.dataset.width).toBe('1920');
    expect(Number(player.dataset.duration)).toBeGreaterThan(30);

    // The resolver got the memory fetch and staticFile, not the network's.
    const [props, options] = network.resolveRecitation.mock.calls.at(-1) as [
      MushafRecitationProps,
      ResolveRecitationOptions,
    ];
    expect(props).toMatchObject({fonts: 'cdn', data: 'cdn', resolved: null});
    expect(options.staticFile?.('timings/x.json')).toBe('mem://timings/x.json');

    // The range is bounded by what the catalogue times.
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to = screen.getByLabelText('To') as HTMLInputElement;
    expect(Number(from.min)).toBeLessThanOrEqual(Number(from.value));
    expect(to.max).toBe('7');

    // Step 2: the Night look.
    fireEvent.click(screen.getByRole('button', {name: /^Night/}));
    await waitFor(() => expect(screen.getByTestId('player').dataset.background).toBe('#101418'));
    expect(screen.getByRole('button', {name: /^Night/}).getAttribute('aria-pressed')).toBe('true');

    // Step 3: the translation list.
    await waitFor(() => expect(screen.getByRole('option', {name: /Saheeh International/})).toBeTruthy());

    // Step 4: no WebCodecs under jsdom: the machine fallback, the captions and the notice.
    expect(await screen.findByText('Render on your machine')).toBeTruthy();
    expect(screen.getByText(/bun run make --reciter abdul_hamid_ghraio_2025_yt --surah 1/)).toBeTruthy();
    for (const label of ['SRT', 'WebVTT', 'Captions JSON'])
      expect(screen.getByRole('button', {name: label})).toBeTruthy();
    expect(screen.getByRole('link', {name: /What you may publish/}).getAttribute('href')).toMatch(/licensing\.md$/);
  });

  it('loads a recitation in another riwayah only once the user confirms it on the Hafs mushaf', async () => {
    network.getChapterSegments.mockClear();
    render(<App />);
    const reciter = screen.getByLabelText('Reciter') as HTMLSelectElement;
    await waitFor(() => expect(reciter.value).toBe(DEFAULT_SLUG));
    expect(screen.queryByText(/the mushaf drawn here is the Hafs print/)).toBeNull();
    fireEvent.change(reciter, {target: {value: 'abdulbasit_abdulsamad_warsh_qdc'}});
    const warning = screen.getByText(/in the Warsh A'n Nafi' riwayah, but the mushaf drawn here is the Hafs print/);
    expect(warning.getAttribute('role')).toBe('alert');
    fireEvent.change(screen.getByLabelText('Surah'), {target: {value: '1'}});
    expect(network.getChapterSegments).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('checkbox', {name: "Use the Warsh A'n Nafi' recitation with the Hafs mushaf anyway"}),
    );
    await screen.findByTestId('player');
    expect(network.getChapterSegments).toHaveBeenCalledWith({slug: 'abdulbasit_abdulsamad_warsh_qdc', chapter: 1}, {});
    // Another riwayah asks again.
    fireEvent.change(reciter, {target: {value: 'ahmed_deban_qalon_mp3quran'}});
    expect(network.getChapterSegments).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/in the Qalon A'n Nafi' riwayah/)).toBeTruthy();
  });

  it('says so when the catalogue cannot be loaded, and loads it on Try again', async () => {
    network.listRecitations.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    const alert = await screen.findByText(/The catalogue could not be loaded: offline/);
    expect(alert.getAttribute('role')).toBe('alert');
    fireEvent.click(within(alert).getByRole('button', {name: 'Try again'}));
    await waitFor(() => expect((screen.getByLabelText('Reciter') as HTMLSelectElement).value).toBe(DEFAULT_SLUG));
    expect(screen.queryByText(/The catalogue could not be loaded/)).toBeNull();
  });
});

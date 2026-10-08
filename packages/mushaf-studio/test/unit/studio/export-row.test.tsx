// @vitest-environment jsdom
// The Review tab's export row: WebVTT by word and by ayah written from the timings file, the
// YouTube chapters and description copied (the clipboard API, its textarea fallback, and the text
// shown when both fail), and the thumbnail still saved and opened, or the missing composition named.
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
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
  goToComposition: vi.fn(),
  focusDefaultPropsPath: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);
vi.mock('../../../src/qud', () => ({listRecitations: vi.fn(async () => []), DEFAULT_CONFIDENCE_THRESHOLD: 0.8}));

const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {captionsToVtt, fromCaptions, toCaptionCues, toCaptions} = await import('../../../src/captions');
const {chaptersFromTimings, youtubeDescription} = await import('../../../src/export');
const {resetStudioStore, getStudioState} = await import('../../../src/studio/store');
const {copyToClipboard, thumbnailPatchOf} = await import('../../../src/studio/publish');
type StudioTimings = import('../../../src/types').StudioTimings;
type MushafRecitationProps = import('../../../src/compositions/recitation/schema').MushafRecitationProps;
type AyahTranslation = import('../../../src/types').AyahTranslation;

/** `count` ayahs of Al-Fatihah from ayah 2, `seconds` each, two words each, with a QUD sidecar. */
const timingsOf = (count: number, seconds: number): StudioTimings => {
  const ayat = Array.from({length: count}, (_, i) => {
    const start = i * seconds;
    const ayah = i + 2;
    return {
      ayah,
      start,
      end: start + seconds,
      words: [
        {id: `1:${ayah}:1`, start, end: start + seconds / 2},
        {id: `1:${ayah}:2`, start: start + seconds / 2, end: start + seconds},
      ],
    };
  });
  return {
    version: 1,
    surah: 1,
    audio: 'mushaf-studio/p/fatiha.mp3',
    ayat,
    alignment: {
      version: 1,
      source: 'qud',
      audioId: 'abc',
      segments: [],
      words: ayat.flatMap((a) =>
        a.words.map((w, k) => ({id: w.id, text: k === 0 ? 'ٱلْحَمْدُ' : 'لِلَّهِ', segment: 1, start: w.start, end: w.end})),
      ),
      edits: [],
    },
  };
};

const translation: AyahTranslation = {
  kind: 'ayah',
  meta: {id: 'quran.com:20', name: 'Saheeh International', language: 'en', source: 'quran.com'},
  text: {},
};

const propsWith = (timings: StudioTimings, reciter = 'Mishary Alafasy'): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  audioFile: 'mushaf-studio/p/fatiha.mp3',
  timingsFile: 'mushaf-studio/p/fatiha.timings.json',
  overlay: {...defaultMushafRecitationProps.overlay, reciter},
  resolved: {
    timings,
    audioOffsetSeconds: 0,
    lines: fatihaLines(2, 3),
    schedule: [{index: 0, start: 0, end: 1}],
    translation,
    translations: [translation],
    gloss: null,
    transliteration: null,
    doubtful: {},
  },
});

type WriteCall = [{filePath: string; contents: string}];
const written = (index: number) => (studio.writeStaticFile.mock.calls[index] as unknown as WriteCall)[0];
type SaveCall = [
  {compositionId: string; defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>},
];
const saveCall = (index: number) => (studio.saveDefaultProps.mock.calls[index] as unknown as SaveCall)[0];

const review = (props: MushafRecitationProps) =>
  render(<MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="review" />);

const writeText = vi.fn(async (_text: string) => undefined);
const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, 'clipboard', {value, configurable: true, writable: true});

let fileTimings: StudioTimings;

beforeEach(() => {
  resetStudioStore();
  fileTimings = timingsOf(2, 2);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ok: true, status: 200, json: async () => fileTimings, blob: async () => new Blob(['a'])})),
  );
  setClipboard({writeText});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetStudioStore();
});

describe('WebVTT', () => {
  it('writes the words of the timings file as cues aligned to the start, and the ayahs as one cue each', async () => {
    review(propsWith(timingsOf(2, 2)));
    fireEvent.click(screen.getByRole('button', {name: 'VTT (words)'}));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/p/fatiha.timings.json');
    expect(written(0).filePath).toBe('mushaf-studio/mushafrecitation/fatiha.vtt');
    expect(written(0).contents).toBe(captionsToVtt(toCaptionCues(fileTimings), {align: 'start'}));
    expect(written(0).contents.startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:01.000 align:start\nٱلْحَمْدُ\n')).toBe(true);
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().notice).toBe(
      'public/mushaf-studio/mushafrecitation/fatiha.vtt is written: 4 cues, timed to the audio file.',
    );
    fireEvent.click(screen.getByRole('button', {name: 'VTT (ayahs)'}));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(2));
    expect(written(1).filePath).toBe('mushaf-studio/mushafrecitation/fatiha.ayahs.vtt');
    expect(written(1).contents).toBe(captionsToVtt(toCaptionCues(fileTimings), {align: 'start', lines: 'ayah'}));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().notice).toBe(
      'public/mushaf-studio/mushafrecitation/fatiha.ayahs.vtt is written: 2 cues, timed to the audio file.',
    );
    // Exporting changes neither the timings nor the props.
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });
});

describe('captions import', () => {
  const importCaptions = (contents: string, name = 'fatiha.captions.json') => {
    const input = document.querySelector<HTMLInputElement>('[data-mushaf-control="import-captions-file"]')!;
    fireEvent.change(input, {target: {files: [new File([contents], name, {type: 'application/json'})]}});
  };

  it('reads edited captions back into the timings file at its own times, logs a re-alignment and re-resolves', async () => {
    review(propsWith(timingsOf(2, 2)));
    expect(screen.getByRole('button', {name: 'Import captions…'})).toHaveProperty('disabled', false);
    const edited = toCaptions(fileTimings).map((caption, i) => (i === 1 ? {...caption, endMs: 1800} : caption));
    importCaptions(JSON.stringify(edited));
    await waitFor(() => expect(studio.writeStaticFile).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/static/mushaf-studio/p/fatiha.timings.json');
    expect(written(0).filePath).toBe('mushaf-studio/p/fatiha.timings.json');
    const next = JSON.parse(written(0).contents) as StudioTimings;
    const {alignment, ...rest} = fromCaptions(edited, fileTimings);
    expect(next).toMatchObject(rest);
    expect(next.ayat[0]!.words![1]).toEqual({id: '1:2:2', start: 1, end: 1.8});
    expect(next.alignment!.edits).toEqual([{kind: 'realign', at: expect.any(String), note: 'captions import'}]);
    expect(next.alignment!.words).toEqual(alignment!.words);
    await waitFor(() => expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
    expect(getStudioState().notice).toBe(
      'fatiha.captions.json is imported: the times of its 4 captions are in the timings file, and its edit log has the import.',
    );
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });

  it('writes nothing for captions that change no time', async () => {
    review(propsWith(timingsOf(2, 2)));
    importCaptions(JSON.stringify(toCaptions(fileTimings, {markers: true})));
    await waitFor(() =>
      expect(getStudioState().notice).toBe('fatiha.captions.json changes no time: the timings file is left as it is.'),
    );
    expect(studio.writeStaticFile).not.toHaveBeenCalled();
  });

  it('shows why a file cannot be imported: not captions, a caption missing, a caption out of order', async () => {
    review(propsWith(timingsOf(2, 2)));
    importCaptions('{"captions": []}', 'notes.json');
    await waitFor(() =>
      expect(getStudioState().error).toMatch(/^notes\.json is not a Captions JSON: expected an array/),
    );
    importCaptions(JSON.stringify([...toCaptions(fileTimings).slice(0, 2), 7]));
    await waitFor(() => expect(getStudioState().error).toMatch(/caption 2 is 7, not a caption/));
    importCaptions(JSON.stringify(toCaptions(fileTimings).slice(1)));
    await waitFor(() =>
      expect(getStudioState().error).toMatch(/^fromCaptions\(\) got 3 captions, but the timings make 4/),
    );
    const swapped = toCaptions(fileTimings).map((caption, i) => (i === 2 ? {...caption, startMs: 500} : caption));
    importCaptions(JSON.stringify(swapped));
    await waitFor(() =>
      expect(getStudioState().error).toMatch(/before caption 1 .*the words must stay in audio order/),
    );
    expect(studio.writeStaticFile).not.toHaveBeenCalled();
    expect(studio.reevaluateComposition).not.toHaveBeenCalled();
  });
});

describe('chapters and description', () => {
  it("copies the chapters of the composition's timings, from 0:00", async () => {
    const timings = timingsOf(4, 12);
    review(propsWith(timings));
    fireEvent.click(screen.getByRole('button', {name: 'Copy chapters'}));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const chapters = chaptersFromTimings(timings, {offsetSeconds: 0});
    expect(chapters).toHaveLength(4);
    expect(writeText).toHaveBeenCalledWith(`${chapters.join('\n')}\n`);
    expect(writeText.mock.calls[0]![0].startsWith('0:00 Al-Fatihah 1:2\n0:12 Al-Fatihah 1:3\n')).toBe(true);
    await waitFor(() =>
      expect(getStudioState().notice).toBe('4 chapters are copied: paste them into the video description.'),
    );
  });

  it('copies nothing and says why when the passage is too short for YouTube chapters', () => {
    review(propsWith(timingsOf(2, 2)));
    fireEvent.click(screen.getByRole('button', {name: 'Copy chapters'}));
    expect(writeText).not.toHaveBeenCalled();
    expect(getStudioState().notice).toBe(
      'No chapters: the passage is too short for YouTube chapters (fewer than 3 chapters 10 s apart).',
    );
  });

  it('copies the description: the surah, the reciter of the overlay, the chapters and the credits', async () => {
    const timings = timingsOf(4, 12);
    review(propsWith(timings));
    fireEvent.click(screen.getByRole('button', {name: 'Copy description'}));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const expected = youtubeDescription({
      timings,
      surahName: 'Al-Fatihah',
      reciter: 'Mishary Alafasy',
      translationName: 'Saheeh International',
      translationSource: 'quran.com',
      chapters: chaptersFromTimings(timings, {offsetSeconds: 0}),
    });
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(expected).toContain('Al-Fatihah 1:2–5, recited by Mishary Alafasy');
    expect(expected).toContain('Translation: Saheeh International (quran.com)');
    expect(expected).toContain('Timings: QUD Universal Aligner');
    await waitFor(() => expect(getStudioState().notice).toBe('The description is copied: paste it into YouTube.'));
  });

  it('falls back to a selected textarea, then shows the text to copy when the browser refuses both', async () => {
    setClipboard(undefined);
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {value: execCommand, configurable: true, writable: true});
    await expect(copyToClipboard('text')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();

    execCommand.mockReturnValue(false);
    review(propsWith(timingsOf(4, 12)));
    fireEvent.click(screen.getByRole('button', {name: 'Copy chapters'}));
    const area = await screen.findByRole<HTMLTextAreaElement>('textbox', {name: 'Text to copy'});
    expect(area.value.startsWith('0:00 Al-Fatihah 1:2\n')).toBe(true);
    expect(getStudioState().notice).toMatch(/^The browser did not let the panel copy/);
    fireEvent.click(screen.getByRole('button', {name: 'Close'}));
    expect(screen.queryByRole('textbox', {name: 'Text to copy'})).toBeNull();
  });
});

describe('thumbnail', () => {
  it("saves the passage and the reciter into MushafThumbnail's props, then opens it", async () => {
    review(propsWith(timingsOf(4, 12)));
    fireEvent.click(screen.getByRole('button', {name: 'Thumbnail'}));
    await waitFor(() => expect(studio.goToComposition).toHaveBeenCalledWith('MushafThumbnail'));
    expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1);
    expect(saveCall(0).compositionId).toBe('MushafThumbnail');
    // Merged into what the thumbnail has: its style stays.
    expect(saveCall(0).defaultProps({savedDefaultProps: {surah: 36, title: '', theme: 'normal'}})).toEqual({
      surah: 1,
      fromAyah: 2,
      toAyah: 5,
      title: 'Mishary Alafasy',
      theme: 'normal',
    });
    // Not the panel's own composition: nothing pending for it, nothing re-evaluated.
    expect(getStudioState().pendingPatch).toBeNull();
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().notice).toBe('MushafThumbnail now shows 1:2-5 and is open in the Studio.');
  });

  it('names the missing composition when the Root has no MushafThumbnail, and opens nothing', async () => {
    studio.saveDefaultProps.mockRejectedValueOnce(
      new Error('No composition with the ID MushafThumbnail found. Available compositions: MushafRecitation'),
    );
    review(propsWith(timingsOf(2, 2)));
    fireEvent.click(screen.getByRole('button', {name: 'Thumbnail'}));
    await waitFor(() => expect(getStudioState().error).toMatch(/^The Root has no MushafThumbnail composition/));
    expect(studio.goToComposition).not.toHaveBeenCalled();
    expect(getStudioState().busy).toBeNull();
  });

  it('passes any other failure on as it is', async () => {
    studio.saveDefaultProps.mockRejectedValueOnce(new Error('saveDefaultProps() is not available in read-only Studio'));
    review(propsWith(timingsOf(2, 2)));
    fireEvent.click(screen.getByRole('button', {name: 'Thumbnail'}));
    await waitFor(() => expect(getStudioState().error).toBe('saveDefaultProps() is not available in read-only Studio'));
    expect(studio.goToComposition).not.toHaveBeenCalled();
  });

  it('takes the lowest and highest ayah timed, and no title without a reciter', () => {
    const props = propsWith(timingsOf(1, 2), '');
    expect(thumbnailPatchOf(props, {...timingsOf(1, 2), ayat: []})).toEqual({
      surah: 1,
      fromAyah: 1,
      toAyah: 0,
      title: '',
    });
    expect(thumbnailPatchOf(props, timingsOf(3, 2))).toEqual({surah: 1, fromAyah: 2, toAyah: 4, title: ''});
  });

  it('takes the first surah and its ayahs when the timings cross surahs', () => {
    const crossing: StudioTimings = {
      version: 2,
      ayat: [
        {surah: 113, ayah: 4, start: 0, end: 1},
        {surah: 113, ayah: 5, start: 1, end: 2},
        {surah: 114, ayah: 1, start: 2, end: 3},
      ],
    };
    expect(thumbnailPatchOf(propsWith(timingsOf(1, 2), ''), crossing)).toEqual({
      surah: 113,
      fromAyah: 4,
      toAyah: 5,
      title: '',
    });
  });
});

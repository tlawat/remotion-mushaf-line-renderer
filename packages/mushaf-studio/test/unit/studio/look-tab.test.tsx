// @vitest-environment jsdom
// The Look tab under jsdom: the cards each composition gets, the active look marked, one click
// one saveDefaultProps with the look merged in, and Undo going back through the looks, each only
// where the props still hold it.
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

const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps, mushafRecitationSchema} = await import(
  '../../../src/compositions/recitation/schema'
);
const {defaultMushafAyahTextProps, mushafAyahTextSchema} = await import('../../../src/unicode/schema');
const {applyLook, looksFor, MUSHAF_LOOKS} = await import('../../../src/presets');
const {resetStudioStore, getStudioState} = await import('../../../src/studio/store');
const {observeLiveProps, resetSaveTracking} = await import('../../../src/studio/studio-api');

type SaveCall = [
  {
    compositionId: string;
    defaultProps: (v: {savedDefaultProps: Record<string, unknown>}) => Record<string, unknown>;
  },
];

const saved = (index: number, savedDefaultProps: Record<string, unknown>): Record<string, unknown> =>
  (studio.saveDefaultProps.mock.calls[index] as unknown as SaveCall)[0].defaultProps({savedDefaultProps});

const cards = () => [...document.body.querySelectorAll<HTMLButtonElement>('[data-look]')];
const card = (id: string) => document.body.querySelector<HTMLButtonElement>(`[data-look="${id}"]`)!;
const look = (id: string) => MUSHAF_LOOKS.find((entry) => entry.id === id)!;

beforeEach(() => {
  resetStudioStore();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetStudioStore();
  resetSaveTracking();
});

describe('Look tab', () => {
  it('comes right after Source, and works without resolved props', () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    expect(screen.getAllByRole('tab')[1]!.textContent).toBe('Look');
    fireEvent.click(screen.getByRole('tab', {name: 'Look'}));
    expect(getStudioState().tab).toBe('look');
    expect(cards().length).toBeGreaterThan(0);
  });

  it("shows a recitation's looks with their names, descriptions and swatches, the active one marked", () => {
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="look" />,
    );
    const ids = looksFor('recitation').map((entry) => entry.id);
    expect(cards().map((button) => button.dataset.look)).toEqual(ids);
    for (const entry of looksFor('recitation')) {
      expect(card(entry.id).textContent).toContain(entry.name);
      expect(card(entry.id).textContent).toContain(entry.description);
      expect(card(entry.id).querySelectorAll('[title]').length).toBeGreaterThanOrEqual(3);
    }
    // The defaults are the design's own: none of these looks sets them.
    for (const entry of looksFor('recitation')) expect(card(entry.id).getAttribute('aria-pressed')).toBe('false');
    // The swatch shows what the look would give: Night's page and its tint colour.
    const night = [...card('night').querySelectorAll<HTMLElement>('[title]')].map((chip) => chip.title);
    expect(night).toEqual(expect.arrayContaining(['Page: #101418', 'Current word: #f2c66d']));
  });

  it('shows an ayah text only the looks designed for it', () => {
    render(<MushafStudioPanel compositionId="MushafAyahText" props={defaultMushafAyahTextProps} initialTab="look" />);
    expect(cards().map((button) => button.dataset.look)).toEqual(looksFor('ayah-text').map((entry) => entry.id));
    expect(card('tajweed-light')).toBeNull();
    expect(card('karaoke')).not.toBeNull();
  });

  it('applies a look with one saveDefaultProps carrying the merged patch, and Undo saves the props back', async () => {
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="look" />,
    );
    fireEvent.click(card('night'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
    expect((studio.saveDefaultProps.mock.calls[0] as unknown as SaveCall)[0].compositionId).toBe('MushafRecitation');
    // The Root's props with a translation set since: the look keeps it.
    const root = {
      ...defaultMushafRecitationProps,
      text: {...defaultMushafRecitationProps.text, translationFile: 'mushaf-studio/p/t.json'},
    };
    const withNight = saved(0, root);
    expect(withNight).toEqual(applyLook(root, look('night')));
    expect(mushafRecitationSchema.parse(withNight)).toEqual(withNight);
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
    // The pending patch shows the look before the Root comes back.
    expect(card('night').getAttribute('aria-pressed')).toBe('true');
    expect(card('classic').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByText('Undo Night'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getStudioState().lookUndo).toEqual({}));
    expect(saved(1, root)).toEqual(root);
    expect(screen.queryByText('Undo Night')).toBeNull();
    expect(card('night').getAttribute('aria-pressed')).toBe('false');
  });

  it('undoes the looks last first, each only where the props still hold it', async () => {
    const panel = (props: typeof defaultMushafRecitationProps) => (
      <MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="look" />
    );
    const {rerender} = render(panel(defaultMushafRecitationProps));
    fireEvent.click(card('night'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    const night = applyLook(defaultMushafRecitationProps, look('night'));
    rerender(panel(night));
    fireEvent.click(card('karaoke'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().lookUndo.MushafRecitation?.map((entry) => entry.name)).toEqual(['Night', 'Karaoke']);
    const karaoke = applyLook(night, look('karaoke'));
    rerender(panel(karaoke));
    // The marker's colour set in the Props sidebar since (the Studio's live props answered the saves).
    const edited = {...karaoke, highlight: {...karaoke.highlight, color: '#123456'}};
    observeLiveProps({MushafRecitation: karaoke});
    observeLiveProps({MushafRecitation: edited});
    rerender(panel(edited));

    fireEvent.click(screen.getByText('Undo Karaoke'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    const undone = saved(2, edited) as typeof edited;
    expect(undone.highlight).toEqual({...night.highlight, color: '#123456'});
    expect(undone.animation).toEqual(night.animation);
    expect(getStudioState().notice).toBe(
      'Karaoke is undone; the fields changed since it was applied keep their new values.',
    );
    rerender(panel(undone));
    observeLiveProps({MushafRecitation: undone});

    // Night's own colour of the word was changed since too: only its other fields go back.
    fireEvent.click(screen.getByText('Undo Night'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(getStudioState().lookUndo).toEqual({}));
    const back = saved(3, undone) as typeof edited;
    expect(back.layout).toEqual(defaultMushafRecitationProps.layout);
    expect(back.theme).toBe(defaultMushafRecitationProps.theme);
    expect(back.highlight).toEqual({...defaultMushafRecitationProps.highlight, color: '#123456'});
  });

  it('saves nothing when every field the look set has changed since, and says so', async () => {
    const panel = (props: typeof defaultMushafRecitationProps) => (
      <MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="look" />
    );
    const {rerender} = render(panel(defaultMushafRecitationProps));
    fireEvent.click(card('karaoke'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    const karaoke = applyLook(defaultMushafRecitationProps, look('karaoke'));
    rerender(panel(karaoke));
    // Another style set by hand over every field Karaoke set.
    rerender(
      panel(
        applyLook(karaoke, {
          ...look('karaoke'),
          patch: {
            ...look('night').patch,
            animation: {lines: 'cut'},
            highlight: {mode: 'ayah', style: 'tint', color: '#000000', restOpacity: 0.8},
          },
        }),
      ),
    );
    fireEvent.click(screen.getByText('Undo Karaoke'));
    expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1);
    expect(getStudioState().lookUndo).toEqual({});
    expect(getStudioState().notice).toBe(
      'Nothing of Karaoke is left to undo: every field it set has been changed since.',
    );
    expect(screen.queryByText('Undo Karaoke')).toBeNull();
  });

  it('applies to an ayah text only what it has', async () => {
    render(<MushafStudioPanel compositionId="MushafAyahText" props={defaultMushafAyahTextProps} initialTab="look" />);
    fireEvent.click(card('black-gold'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    const next = saved(0, {...defaultMushafAyahTextProps});
    expect(next).not.toHaveProperty('theme');
    expect(next).not.toHaveProperty('customTheme');
    expect(mushafAyahTextSchema.parse(next)).toEqual(next);
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(screen.getByText('Undo Black & gold')).toBeTruthy();
  });

  it('follows a style change made in the Props sidebar', () => {
    const classic = applyLook(defaultMushafRecitationProps, look('classic'));
    const {rerender} = render(<MushafStudioPanel compositionId="MushafRecitation" props={classic} initialTab="look" />);
    expect(card('classic').getAttribute('aria-pressed')).toBe('true');
    rerender(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={applyLook(classic, look('sepia'))}
        initialTab="look"
      />,
    );
    expect(card('sepia').getAttribute('aria-pressed')).toBe('true');
    expect(card('classic').getAttribute('aria-pressed')).toBe('false');
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });
});

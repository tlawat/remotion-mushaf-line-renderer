// @vitest-environment jsdom
// The Look tab under jsdom: the cards each composition gets, the active look marked, one click
// one saveDefaultProps with the look merged in, and Undo saving what the look changed back.
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
    // The defaults are the classic page; nothing else they match sets the same colours.
    expect(card('classic').getAttribute('aria-pressed')).toBe('true');
    expect(card('night').getAttribute('aria-pressed')).toBe('false');
    // The swatch shows what the look would give: Night's page and its glow colour.
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
    await waitFor(() => expect(getStudioState().lookUndo).toBeNull());
    expect(saved(1, root)).toEqual(root);
    expect(screen.queryByText('Undo Night')).toBeNull();
    expect(card('classic').getAttribute('aria-pressed')).toBe('true');
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
    const {rerender} = render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="look" />,
    );
    expect(card('classic').getAttribute('aria-pressed')).toBe('true');
    rerender(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={applyLook(defaultMushafRecitationProps, look('sepia'))}
        initialTab="look"
      />,
    );
    expect(card('sepia').getAttribute('aria-pressed')).toBe('true');
    expect(card('classic').getAttribute('aria-pressed')).toBe('false');
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });
});

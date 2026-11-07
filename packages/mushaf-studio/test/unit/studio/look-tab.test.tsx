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
const {capChroma, mixColors} = await import('../../../src/schema/color');
const {resetStudioStore, getStudioState, setStudioState} = await import('../../../src/studio/store');
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
      expect(card(entry.id).textContent).toContain(entry.nameAr);
      expect(card(entry.id).textContent).toContain(entry.description);
      expect([...card(entry.id).querySelectorAll<HTMLElement>('[data-chip]')].map((chip) => chip.dataset.chip)).toEqual(
        ['page', 'ink', 'metal', 'mark'],
      );
    }
    // The defaults are the Mushaf look, and only that one.
    for (const entry of looksFor('recitation'))
      expect(card(entry.id).getAttribute('aria-pressed')).toBe(entry.id === 'mushaf' ? 'true' : 'false');
    // The chips show what the look would give: Haram night's page, its gold and its wash's capped gold.
    const night = [...card('haram-night').querySelectorAll<HTMLElement>('[data-chip]')].map((chip) => chip.title);
    expect(night).toEqual(['Page: #121416', 'Ink: #f1eadb', 'Metal: #d8b56a', `Mark: ${capChroma('#d8b56a')}`]);
    // Learning's tint is drawn darker, so it reads at 5:1 on the ivory.
    const learning = [...card('learning').querySelectorAll<HTMLElement>('[data-chip]')].map((chip) => chip.title);
    expect(learning[3]).toBe('Mark: #806321');
    // The ink mark: the ink at its rest opacity on the page.
    expect(card('mushaf').querySelector<HTMLElement>('[data-chip="mark"]')!.title).toBe(
      `Mark: ${mixColors('#1c1a16', '#f8f3e6', 0.4)}`,
    );
  });

  it('shows an ayah text only the looks designed for it', () => {
    render(<MushafStudioPanel compositionId="MushafAyahText" props={defaultMushafAyahTextProps} initialTab="look" />);
    expect(cards().map((button) => button.dataset.look)).toEqual(looksFor('ayah-text').map((entry) => entry.id));
    expect(card('tajweed')).toBeNull();
    expect(card('haram-night')).not.toBeNull();
  });

  it('applies a look with one saveDefaultProps carrying the merged patch, and Undo saves the props back', async () => {
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="look" />,
    );
    fireEvent.click(card('haram-night'));
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
    expect(withNight).toEqual(applyLook(root, look('haram-night')));
    expect(mushafRecitationSchema.parse(withNight)).toEqual(withNight);
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
    // The pending patch shows the look before the Root comes back.
    expect(card('haram-night').getAttribute('aria-pressed')).toBe('true');
    expect(card('learning').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByText('Undo Haram night'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getStudioState().lookUndo).toEqual({}));
    expect(saved(1, root)).toEqual(root);
    expect(screen.queryByText('Undo Haram night')).toBeNull();
    expect(card('haram-night').getAttribute('aria-pressed')).toBe('false');
  });

  it('undoes the looks last first, each only where the props still hold it', async () => {
    const panel = (props: typeof defaultMushafRecitationProps) => (
      <MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="look" />
    );
    const {rerender} = render(panel(defaultMushafRecitationProps));
    fireEvent.click(card('haram-night'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    const night = applyLook(defaultMushafRecitationProps, look('haram-night'));
    rerender(panel(night));
    fireEvent.click(card('learning'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().lookUndo.MushafRecitation?.map((entry) => entry.name)).toEqual(['Haram night', 'Learning']);
    const learning = applyLook(night, look('learning'));
    rerender(panel(learning));
    // The marker's colour set in the Props sidebar since (the Studio's live props answered the saves).
    const edited = {...learning, highlight: {...learning.highlight, color: '#123456'}};
    observeLiveProps({MushafRecitation: learning});
    observeLiveProps({MushafRecitation: edited});
    rerender(panel(edited));

    fireEvent.click(screen.getByText('Undo Learning'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    const undone = saved(2, edited) as typeof edited;
    expect(undone.highlight).toEqual({...night.highlight, color: '#123456'});
    expect(undone.animation).toEqual(night.animation);
    expect(getStudioState().notice).toBe(
      'Learning is undone; the fields changed since it was applied keep their new values.',
    );
    rerender(panel(undone));
    observeLiveProps({MushafRecitation: undone});

    // Night's own colour of the word was changed since too: only its other fields go back.
    fireEvent.click(screen.getByText('Undo Haram night'));
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
    fireEvent.click(card('learning'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    const learning = applyLook(defaultMushafRecitationProps, look('learning'));
    rerender(panel(learning));
    // Another style set by hand over every field Karaoke set.
    rerender(
      panel(
        applyLook(learning, {
          ...look('learning'),
          // Every field Learning set, each to a value of its own.
          patch: {
            theme: 'dark',
            customTheme: {
              base: 'black',
              frame: '#010101',
              accent: '#020202',
              detail: '#030303',
              background: '#040404',
              override: {
                ink: true,
                silent: true,
                rules: true,
                frame: false,
                accent: false,
                detail: false,
                background: false,
              },
            },
            layout: {
              background: '#101010',
              color: '#eeeeee',
              neighbourOpacity: 0.2,
              frame: 'hairline',
              backgroundImage: 'x.jpg',
            },
            animation: {lines: 'cut', tempo: 'slow'},
            highlight: {mode: 'ayah', style: 'wash', color: '#000000', restOpacity: 0.8},
            text: {
              translationPosition: 'above',
              glossPosition: 'none',
              translationColor: '#111111',
              glossColor: '#222222',
              translationFont: 'Serif',
              glossFont: 'Sans',
            },
            overlay: {color: '#333333', font: 'Serif'},
            background: {color: '#444444', vignette: 0.1},
          },
        }),
      ),
    );
    fireEvent.click(screen.getByText('Undo Learning'));
    expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1);
    expect(getStudioState().lookUndo).toEqual({});
    expect(getStudioState().notice).toBe(
      'Nothing of Learning is left to undo: every field it set has been changed since.',
    );
    expect(screen.queryByText('Undo Learning')).toBeNull();
  });

  it('applies to an ayah text only what it has', async () => {
    render(<MushafStudioPanel compositionId="MushafAyahText" props={defaultMushafAyahTextProps} initialTab="look" />);
    fireEvent.click(card('madinah-green'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    const next = saved(0, {...defaultMushafAyahTextProps});
    expect(next).not.toHaveProperty('theme');
    expect(next).not.toHaveProperty('customTheme');
    expect(mushafAyahTextSchema.parse(next)).toEqual(next);
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(screen.getByText('Undo Madinah green')).toBeTruthy();
  });

  it('follows a style change made in the Props sidebar', () => {
    const classic = applyLook(defaultMushafRecitationProps, look('learning'));
    const {rerender} = render(<MushafStudioPanel compositionId="MushafRecitation" props={classic} initialTab="look" />);
    expect(card('learning').getAttribute('aria-pressed')).toBe('true');
    rerender(
      <MushafStudioPanel
        compositionId="MushafRecitation"
        props={applyLook(classic, look('haram-night'))}
        initialTab="look"
      />,
    );
    expect(card('haram-night').getAttribute('aria-pressed')).toBe('true');
    expect(card('learning').getAttribute('aria-pressed')).toBe('false');
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });

  it('shows the Format row with the current shape selected, and a format keeps the positions the user chose', async () => {
    // The lines moved up by hand: the format leaves them there, and moves the margins it recommends.
    const placed = {
      ...defaultMushafRecitationProps,
      layout: {...defaultMushafRecitationProps.layout, verticalAlign: 0.3},
    };
    render(<MushafStudioPanel compositionId="MushafRecitation" props={placed} initialTab="look" />);
    const formats = [...document.body.querySelectorAll<HTMLButtonElement>('[data-format]')];
    expect(formats.map((b) => [b.dataset.format, b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['landscape', 'Landscape', 'true'],
      ['vertical', 'Vertical', 'false'],
      ['square', 'Square', 'false'],
      ['portrait', 'Portrait', 'false'],
    ]);
    expect(document.body.querySelector('[data-mushaf-hint="vertical"]')).toBeNull();
    fireEvent.click(formats[1]!);
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    const next = saved(0, placed) as typeof defaultMushafRecitationProps;
    expect(next.layout).toMatchObject({aspect: '9:16', marginX: 90, verticalAlign: 0.3});
    expect(next.layout.visibleLines).toBe(defaultMushafRecitationProps.layout.visibleLines);
    // Shown as vertical from its pending patch, with the hint for printed lines.
    expect(document.body.querySelector('[data-format="vertical"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.querySelector('[data-mushaf-hint="vertical"]')!.textContent).toBe(
      'Printed lines are small in a vertical frame; the Ayah text composition suits reels better.',
    );
  });

  it('gives no reels hint on an ayah text, which suits them', () => {
    render(<MushafStudioPanel compositionId="MushafAyahText" props={defaultMushafAyahTextProps} initialTab="look" />);
    expect(document.body.querySelector('[data-format="vertical"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.querySelector('[data-mushaf-hint="vertical"]')).toBeNull();
  });

  it('sums the mark up in one line, with a note when a tint is drawn darker or shown as a wash', () => {
    const summary = () => document.body.querySelector('[data-mushaf-mark-summary]')!.textContent;
    const note = () => document.body.querySelector<HTMLElement>('[data-mushaf-mark-note]');
    const panel = (props: typeof defaultMushafRecitationProps) => (
      <MushafStudioPanel compositionId="MushafRecitation" props={props} initialTab="look" />
    );
    const {rerender} = render(panel(defaultMushafRecitationProps));
    expect(summary()).toBe('Follows each word · Ink');
    expect(note()).toBeNull();
    expect(document.body.querySelector('[data-mushaf-motion-summary]')!.textContent).toBe('Motion: Dissolve · Calm');
    const learning = applyLook(defaultMushafRecitationProps, look('learning'));
    rerender(panel(learning));
    expect(summary()).toBe('Follows each word · Tint');
    expect(note()!.dataset.mushafMarkNote).toBe('adjusted');
    expect(note()!.textContent).toBe('Tint shown as #806321 so it reads on this page');
    rerender(panel({...learning, theme: 'light'}));
    expect(note()!.textContent).toBe('Shown as a wash: a tint would repaint the tajweed colours');
    rerender(panel({...learning, highlight: {...learning.highlight, color: '#806321'}}));
    expect(note()).toBeNull();
    rerender(panel(applyLook(defaultMushafRecitationProps, look('haram-night'))));
    expect(summary()).toBe('Follows the ayah · Wash');
    expect(document.body.querySelector('[data-mushaf-motion-summary]')!.textContent).toBe('Motion: Dissolve · Slow');
    rerender(
      panel({...defaultMushafRecitationProps, highlight: {...defaultMushafRecitationProps.highlight, mode: 'none'}}),
    );
    expect(summary()).toBe('Marks nothing');
  });

  it('names each look in English and Arabic, and describes it in the panel’s language', () => {
    setStudioState({language: 'ar'});
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="look" />,
    );
    const mushaf = card('mushaf');
    expect(mushaf.querySelector('[lang="ar"]')!.textContent).toBe('مصحف');
    expect(mushaf.querySelector<HTMLElement>('[lang="ar"]')!.style.fontFamily).toContain('Amiri');
    expect(mushaf.querySelector('[lang="en"]')!.textContent).toBe('Mushaf');
    expect(mushaf.textContent).toContain(look('mushaf').descriptionAr);
    expect(document.body.querySelector('[data-mushaf-mark-summary]')!.textContent).toBe('تتبع كل كلمة · مداد');
    expect(document.body.querySelector('[data-mushaf-motion-summary]')!.textContent).toBe('الحركة: ذوبان · هادئ');
    expect(document.body.querySelector('[data-format="portrait"]')!.textContent).toBe('طولي');
  });
});

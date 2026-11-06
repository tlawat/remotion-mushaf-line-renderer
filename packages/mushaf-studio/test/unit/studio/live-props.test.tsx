// @vitest-environment jsdom
// The dock inside the Studio's live props (`EditorPropsContext`): saves start from them, a panel
// save they lose right after is offered back (never written back on its own), and what the panel
// keeps per composition (pending patches, look undo) stays with that composition.
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import type * as React from 'react';
import {Internals} from 'remotion';
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
  saveDefaultProps: vi.fn(),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => []),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
  goToComposition: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);
vi.mock('../../../src/qud', () => ({listRecitations: vi.fn(async () => []), DEFAULT_CONFIDENCE_THRESHOLD: 0.8}));

const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {defaultMushafAyahTextProps} = await import('../../../src/unicode/schema');
const {applyLook, MUSHAF_LOOKS} = await import('../../../src/presets');
const {resetStudioStore, getStudioState, setStudioState} = await import('../../../src/studio/store');
const {resetSaveTracking} = await import('../../../src/studio/studio-api');
type Props = Record<string, unknown>;
type PanelProps = NonNullable<React.ComponentProps<typeof MushafStudioPanel>['props']>;

const ID = 'MushafRecitation';
const look = (id: string) => MUSHAF_LOOKS.find((entry) => entry.id === id)!;
const card = (id: string) => document.body.querySelector<HTMLButtonElement>(`[data-look="${id}"]`)!;

/**
 * The Studio around the panel: the Root file (page-load props at first), the live props the
 * Studio pushes after each write, and the props the composition renders (the live ones).
 */
const mount = (initialTab: 'look' | 'source' = 'look') => {
  const pageLoad: Props = {...defaultMushafRecitationProps, resolved: null};
  let file: Props = pageLoad;
  let live: Record<string, Props> = {[ID]: pageLoad};
  studio.saveDefaultProps.mockImplementation(
    async ({defaultProps}: {defaultProps: (v: {savedDefaultProps: Props}) => Props}) => {
      file = defaultProps({savedDefaultProps: pageLoad});
    },
  );
  const tree = () => (
    <Internals.EditorPropsContext.Provider value={{props: live, updateProps: () => undefined}}>
      <MushafStudioPanel compositionId={ID} props={live[ID] as PanelProps} initialTab={initialTab} />
    </Internals.EditorPropsContext.Provider>
  );
  const view = render(tree());
  return {
    get file() {
      return file;
    },
    /** The Studio pushes the Root's content: the live props, and the composition with them. */
    echo: (props: Props = file) => {
      live = {...live, [ID]: props};
      view.rerender(tree());
    },
    pageLoad,
  };
};

beforeEach(() => {
  resetStudioStore();
  resetSaveTracking();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetStudioStore();
  resetSaveTracking();
});

describe('the dock in the live props', () => {
  it('starts a look from the live props, keeping what the Props sidebar changed', async () => {
    const studioModel = mount();
    // The sidebar set a translation and five lines; the Studio's page-load copy knows nothing of it.
    const sidebar = {
      ...studioModel.pageLoad,
      text: {...defaultMushafRecitationProps.text, translationFile: 'mushaf-studio/p/t.json'},
      layout: {...defaultMushafRecitationProps.layout, visibleLines: 5},
    };
    studioModel.echo(sidebar);
    fireEvent.click(card('night'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(studioModel.file).toEqual(applyLook(sidebar, look('night')));
    expect(studioModel.file).toMatchObject({
      text: {translationFile: 'mushaf-studio/p/t.json'},
      layout: {visibleLines: 5},
    });
  });

  it('offers Restore when the live props lose a panel save, and writes it only when asked', async () => {
    const studioModel = mount();
    fireEvent.click(card('night'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    studioModel.echo();
    expect(screen.queryByRole('button', {name: 'Restore'})).toBeNull();
    // The sidebar's JSON Reset: the live props are the page-load props again.
    act(() => studioModel.echo(studioModel.pageLoad));
    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toMatch(
      /^Some of the panel's changes are no longer in the props \(theme, layout\.background, /,
    );
    expect(notice.textContent).toMatch(/and \d+ more\)/);
    expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', {name: 'Restore'}));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(studioModel.file).toEqual(applyLook(studioModel.pageLoad, look('night')));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the props as they are when the offer is dismissed, and says it in Arabic too', async () => {
    setStudioState({language: 'ar'});
    const studioModel = mount();
    fireEvent.click(card('night'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    studioModel.echo();
    act(() => studioModel.echo(studioModel.pageLoad));
    expect((await screen.findByRole('alert')).textContent).toMatch(/^لم تعد بعض تغييرات اللوحة في الخصائص/);
    fireEvent.click(screen.getByTitle('أبقِ الخصائص كما هي'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(getStudioState().rolledBack).toEqual({});
    expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1);
  });

  it('undoes looks one by one, the last first, on the composition that applied them', async () => {
    const studioModel = mount();
    fireEvent.click(card('night'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    studioModel.echo();
    fireEvent.click(card('sepia'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    studioModel.echo();
    expect(getStudioState().lookUndo[ID]!.map((entry) => entry.name)).toEqual(['Night', 'Sepia']);
    fireEvent.click(screen.getByText('Undo Sepia'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(studioModel.file).toEqual(applyLook(studioModel.pageLoad, look('night')));
    studioModel.echo();
    fireEvent.click(screen.getByText('Undo Night'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(studioModel.file).toEqual(studioModel.pageLoad);
    expect(screen.queryByText(/^Undo /)).toBeNull();
    expect(getStudioState().lookUndo).toEqual({});
  });
});

describe('state per composition', () => {
  it('shows a pending patch and a look undo only on the composition they belong to', async () => {
    studio.saveDefaultProps.mockImplementation(async () => undefined);
    const {rerender} = render(
      <MushafStudioPanel compositionId={ID} props={defaultMushafRecitationProps} initialTab="look" />,
    );
    fireEvent.click(card('night'));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    // Not back yet: the recitation shows Night from its pending patch.
    expect(card('night').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Undo Night')).toBeTruthy();
    // On another composition neither shows: its look is its own.
    rerender(<MushafStudioPanel compositionId="MushafAyahText" props={defaultMushafAyahTextProps} initialTab="look" />);
    expect(screen.queryByText('Undo Night')).toBeNull();
    expect(document.body.querySelector('[data-look][aria-pressed="true"]')?.getAttribute('data-look')).not.toBe(
      'night',
    );
    expect(Object.keys(getStudioState().pendingPatches)).toEqual([ID]);
  });
});

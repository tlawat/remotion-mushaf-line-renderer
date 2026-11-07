// @vitest-environment jsdom
// The upgrade banner over every tab: shown while the Root holds props an earlier Mushaf Studio
// saved (read from the Studio's live props, not the migrated ones the composition renders), its
// "What changes" list, and its two saves: the migrated props, or the migrated props with the Mushaf
// look and the format's positions. In English and Arabic; nothing is written before a click.
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import type * as React from 'react';
import {Internals} from 'remotion';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import oldRoot from '../../fixtures/migrate/old-root-defaults.json';

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
const {upgradeWithLook} = await import('../../../src/studio/MushafStudioPanel');
const {defaultMushafRecitationProps, mushafRecitationSchema} = await import(
  '../../../src/compositions/recitation/schema'
);
const {applyLook, lookById} = await import('../../../src/presets');
const {describeMushafMigration, migrateMushafProps} = await import('../../../src/schema/migrate');
const {resetStudioStore, getStudioState, setStudioState} = await import('../../../src/studio/store');
const {resetSaveTracking} = await import('../../../src/studio/studio-api');
type Props = Record<string, unknown>;
type PanelProps = NonNullable<React.ComponentProps<typeof MushafStudioPanel>['props']>;

const ID = 'MushafRecitation';
const OLD = (oldRoot as Record<string, Props>).MushafRecitation!;
const defaults = defaultMushafRecitationProps as unknown as Props;
const banner = () => document.body.querySelector<HTMLElement>('[data-mushaf-control="upgrade"]');
const button = (name: string) => banner()!.querySelector<HTMLButtonElement>(`[data-upgrade="${name}"]`)!;

/** The panel in the Studio with `saved` as the Root's live props; the composition renders them migrated. */
const mount = (saved: Props, tab: 'look' | 'source' | 'review' = 'source') => {
  let file: Props = saved;
  studio.saveDefaultProps.mockImplementation(
    async ({defaultProps}: {defaultProps: (v: {savedDefaultProps: Props}) => Props}) => {
      file = defaultProps({savedDefaultProps: saved});
    },
  );
  const rendered = migrateMushafProps<PanelProps>(saved, {defaults});
  render(
    <Internals.EditorPropsContext.Provider value={{props: {[ID]: saved}, updateProps: () => undefined}}>
      <MushafStudioPanel compositionId={ID} props={rendered} initialTab={tab} />
    </Internals.EditorPropsContext.Provider>,
  );
  return {
    get file() {
      return file;
    },
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

describe('the upgrade banner', () => {
  it('is shown on every tab while the Root holds old props, and never for props in the current shape', () => {
    for (const tab of ['source', 'look', 'review'] as const) {
      mount(OLD, tab);
      expect(banner()?.textContent, tab).toContain('These props were saved by an earlier Mushaf Studio.');
      expect(button('migrate').textContent).toBe('Upgrade');
      expect(button('details').textContent).toBe('What changes');
      expect(button('with-look').textContent).toBe('Upgrade and apply the Mushaf look');
      cleanup();
    }
    mount({...defaultMushafRecitationProps, resolved: null});
    expect(banner()).toBeNull();
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });

  it('lists what changes: every note of the migration, its field, before and after', () => {
    mount(OLD);
    expect(document.body.querySelector('[data-mushaf-control="upgrade-details"]')).toBeNull();
    fireEvent.click(button('details'));
    const notes = describeMushafMigration(OLD, {defaults});
    const items = [...document.body.querySelectorAll<HTMLElement>('[data-mushaf-control="upgrade-details"] li')];
    expect(items.map((item) => item.dataset.path)).toEqual(notes.map((note) => note.path));
    const style = items.find((item) => item.dataset.path === 'highlight.style')!;
    expect(style.textContent).toContain(JSON.stringify(OLD.highlight && (OLD.highlight as Props).style));
    expect(button('details').textContent).toBe('Hide the changes');
    expect(studio.saveDefaultProps).not.toHaveBeenCalled();
  });

  it('saves the migrated props on Upgrade, whole, and says how many settings changed', async () => {
    const studioModel = mount(OLD);
    fireEvent.click(button('migrate'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    expect(getStudioState().error).toBeNull();
    expect(studioModel.file).toEqual(migrateMushafProps(OLD, {defaults}));
    // The old fields are gone (a merge could not have deleted them), and the sidebar accepts the result.
    expect(studioModel.file.highlight).not.toHaveProperty('dimOthers');
    expect(mushafRecitationSchema.safeParse(studioModel.file).success).toBe(true);
    expect(studio.reevaluateComposition).toHaveBeenCalledTimes(1);
    const count = describeMushafMigration(OLD, {defaults}).length;
    expect(getStudioState().notice).toBe(
      `Upgraded: ${count} settings changed. The changelog lists the visual differences.`,
    );
  });

  it('saves the migrated props with the Mushaf look and the landscape positions on the second button', async () => {
    const placed = {...OLD, layout: {...(OLD.layout as Props), marginX: 120, verticalAlign: 0.3}};
    const studioModel = mount(placed);
    fireEvent.click(button('with-look'));
    await waitFor(() => expect(studio.saveDefaultProps).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStudioState().busy).toBeNull());
    const file = studioModel.file as typeof defaultMushafRecitationProps;
    expect(file).toEqual(upgradeWithLook(placed, {defaults, inSlot: false}));
    expect(file.highlight).toMatchObject({mode: 'word', style: 'ink', color: '#b8913a', restOpacity: 0.6});
    expect(file.layout).toMatchObject({background: '#f8f3e6', marginX: 190, verticalAlign: 0.5});
    expect(mushafRecitationSchema.safeParse(file).success).toBe(true);
    // The content is kept.
    expect(file.timingsFile).toBe(OLD.timingsFile);
    expect(file).toEqual({
      ...applyLook(migrateMushafProps<Props>(placed, {defaults}), lookById('mushaf')!),
      layout: {...file.layout},
    });
  });

  it('in a slot leaves the aspect and the positions to the box', () => {
    const slot = {...OLD, layout: {...(OLD.layout as Props), aspect: '9:16', marginX: 40}};
    const next = upgradeWithLook(slot, {defaults, inSlot: true}) as typeof defaultMushafRecitationProps;
    expect(next.layout).toMatchObject({aspect: '9:16', marginX: 40});
  });

  it('speaks Arabic in the Arabic panel', () => {
    setStudioState({language: 'ar'});
    mount(OLD);
    expect(banner()!.textContent).toContain('حُفظت هذه الخصائص بإصدار سابق من استوديو المصحف.');
    expect(button('migrate').textContent).toBe('ترقية');
    expect(button('details').textContent).toBe('ما الذي يتغيّر');
    expect(button('with-look').textContent).toBe('ترقية وتطبيق مظهر المصحف');
    // The list of changes gives each reason in Arabic too, its values filled in.
    fireEvent.click(button('details'));
    expect(document.body.querySelector('[data-mushaf-control="upgrade-details"] p')!.textContent).toBe(
      'يغيّر حفظ الترقية هذه الحقول (والمعاينة تعرضها الآن):',
    );
    const item = (path: string) =>
      document.body.querySelector<HTMLElement>(`[data-mushaf-control="upgrade-details"] li[data-path="${path}"]`)!;
    expect(item('highlight.style').textContent).toContain('تغيّر اسمه: تذهيب');
    expect(item('background.kenBurnsScale').textContent).toContain('خارج المدى الجديد 1–1.05');
    expect(item('animation.lines').textContent).toContain('من enter "slide-fade"');
    expect(item('background.glow').textContent).toContain('لا شيء يتبع مستوى الصوت');
    for (const note of describeMushafMigration(OLD, {defaults})) {
      expect(item(note.path).textContent, note.path).not.toContain(note.reason);
    }
  });

  it('gives each reason in English in the English panel, as the migration words it', () => {
    mount(OLD);
    fireEvent.click(button('details'));
    for (const note of describeMushafMigration(OLD, {defaults})) {
      const item = document.body.querySelector<HTMLElement>(
        `[data-mushaf-control="upgrade-details"] li[data-path="${note.path}"]`,
      )!;
      expect(item.textContent, note.path).toContain(` · ${note.reason}`);
    }
  });
});

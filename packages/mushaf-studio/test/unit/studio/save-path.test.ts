// The panel's save path against a model of Remotion 4.0.539's Studio, as it behaves:
// - `saveDefaultProps()` hands its callback `savedDefaultProps`, the Root as the page loaded it, and
//   that never changes in a session (the Studio writes the Root without rebuilding the bundle);
// - the Root file is what was written last, by anyone; the Props sidebar writes the whole object,
//   built from the live props;
// - the live props (`EditorPropsContext`) are the file's content, pushed after every write
//   (`default-props-updatable-changed`); the dock hands each new value to `observeLiveProps()`.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const studio = vi.hoisted(() => ({
  writeStaticFile: vi.fn(async () => undefined),
  saveDefaultProps: vi.fn(),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => []),
  goToComposition: vi.fn(),
  seek: vi.fn(),
  play: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock('@remotion/studio', () => studio);

const api = await import('../../../src/studio/studio-api');
const {getStudioState, resetStudioStore} = await import('../../../src/studio/store');

type Props = Record<string, unknown>;
const ID = 'MushafRecitation';

const PAGE_LOAD: Props = {
  audioFile: 'page-load.mp3',
  timingsFile: 'page-load.timings.json',
  splits: [],
  layout: {visibleLines: 3, background: '#ffffff'},
  overlay: {reciter: ''},
};

/** The Studio: one Root file, its frozen page-load copy, and the live props the dock renders. */
const remotion = () => {
  let file: Props = PAGE_LOAD;
  let live: Record<string, Props> = {};
  let during: ((write: () => void) => void) | null = null;
  studio.saveDefaultProps.mockImplementation(
    async ({defaultProps}: {defaultProps: (v: {savedDefaultProps: Props}) => Props}) => {
      const write = () => {
        file = defaultProps({savedDefaultProps: PAGE_LOAD});
      };
      const hook = during;
      during = null;
      if (hook) hook(write);
      else write();
    },
  );
  const model = {
    get file() {
      return file;
    },
    /** What happens while the next save is on its way: `write` is the server writing it (a throw fails it). */
    set duringNextSave(hook: (write: () => void) => void) {
      during = hook;
    },
    /** The Studio reads the Root again (the composition selected again, a reconnect): the same content, a new object. */
    reread(now?: number) {
      live = {...live, [ID]: structuredClone(file)};
      api.observeLiveProps(live, now);
    },
    /** The file-change event reaches the browser: the live props become the file, the dock renders them. */
    echo(now?: number) {
      live = {...live, [ID]: file};
      api.observeLiveProps(live, now);
    },
    /** A Props-sidebar edit: the whole live object, changed, written to the Root. */
    sidebar(change: (props: Props) => Props) {
      file = change(live[ID] ?? PAGE_LOAD);
    },
    /** The sidebar's JSON Reset: the live props go back to the page-load props; nothing is written. */
    jsonReset(now?: number) {
      live = {...live, [ID]: PAGE_LOAD};
      api.observeLiveProps(live, now);
    },
  };
  model.echo();
  return model;
};

beforeEach(() => {
  resetStudioStore();
  api.resetSaveTracking();
});

afterEach(() => {
  vi.clearAllMocks();
  resetStudioStore();
  api.resetSaveTracking();
});

describe('the save path against the Studio', () => {
  it('keeps a Props-sidebar edit made between two panel saves, and never replays an older panel value', async () => {
    const studioModel = remotion();
    // The panel aligns: a new recording.
    await api.patchProps(ID, {audioFile: 'take-1.mp3', timingsFile: 'take-1.timings.json'});
    studioModel.echo();
    expect(getStudioState().inFlightPatches).toEqual({});
    // The sidebar shows five lines instead of three.
    studioModel.sidebar((props) => ({...props, layout: {...(props.layout as Props), visibleLines: 5}}));
    studioModel.echo();
    // The panel applies a look: the sidebar's five lines stay, and so does the recording.
    await api.patchProps(ID, {layout: {background: '#101418'}});
    expect(studioModel.file).toMatchObject({
      audioFile: 'take-1.mp3',
      layout: {visibleLines: 5, background: '#101418'},
    });
    studioModel.echo();
    // The user points audioFile at another file in the sidebar, a field the panel set earlier.
    studioModel.sidebar((props) => ({...props, audioFile: 'mine.mp3'}));
    studioModel.echo();
    // The next panel save keeps it: the panel's take-1.mp3 is not written back.
    await api.patchProps(ID, {splits: [{page: 1, line: 2, atWordId: 3}]});
    expect(studioModel.file).toEqual({
      ...PAGE_LOAD,
      audioFile: 'mine.mp3',
      timingsFile: 'take-1.timings.json',
      splits: [{page: 1, line: 2, atWordId: 3}],
      layout: {visibleLines: 5, background: '#101418'},
    });
    studioModel.echo();
    expect(getStudioState().inFlightPatches).toEqual({});
    expect(getStudioState().rolledBack).toEqual({});
  });

  it('lands two quick saves made before the Studio has come back with the first', async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    // No echo yet: the second save carries the first.
    await api.patchProps(ID, {splits: [{page: 1, line: 1, atWordId: 1}]});
    expect(studioModel.file).toMatchObject({audioFile: 'take-1.mp3', splits: [{page: 1, line: 1, atWordId: 1}]});
    studioModel.echo();
    expect(getStudioState().inFlightPatches).toEqual({});
  });

  it('offers to restore what the sidebar JSON Reset dropped, and writes nothing on its own', async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {audioFile: 'take-1.mp3', timingsFile: 'take-1.timings.json'});
    studioModel.echo();
    // Minutes later the user presses Reset in the sidebar's JSON view: the page-load props are back.
    studioModel.jsonReset(Date.now() + 10 * 60_000);
    expect(getStudioState().rolledBack).toEqual({
      [ID]: {audioFile: 'take-1.mp3', timingsFile: 'take-1.timings.json'},
    });
    expect(getStudioState().inFlightPatches).toEqual({});
    // The sidebar saves the reset props; a later panel save does not bring the recording back by itself...
    studioModel.sidebar((props) => props);
    studioModel.echo(Date.now() + 10 * 60_000);
    await api.patchProps(ID, {layout: {background: '#000000'}});
    expect(studioModel.file).toMatchObject({audioFile: 'page-load.mp3', timingsFile: 'page-load.timings.json'});
    expect(getStudioState().rolledBack[ID]).toBeDefined();
    // ...Restore does.
    await api.restoreRolledBack(ID);
    expect(studioModel.file).toMatchObject({
      audioFile: 'take-1.mp3',
      timingsFile: 'take-1.timings.json',
      layout: {visibleLines: 3, background: '#000000'},
    });
    expect(getStudioState().rolledBack).toEqual({});
  });

  it('offers to restore a panel save that a racing sidebar save wrote over, and forgets the offer when the props come back', async () => {
    const studioModel = remotion();
    const before = studioModel.file;
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    // The sidebar committed an edit built from the props before the panel's save: it writes the old recording back.
    studioModel.sidebar(() => ({...before, overlay: {reciter: 'Alafasy'}}));
    studioModel.echo();
    expect(getStudioState().rolledBack).toEqual({[ID]: {audioFile: 'take-1.mp3'}});
    // Nothing pending shows the lost value as if it were there.
    expect(getStudioState().pendingPatches[ID]).toBeUndefined();
    // The Studio's undo puts it back: the offer goes.
    studioModel.sidebar((props) => ({...props, audioFile: 'take-1.mp3'}));
    studioModel.echo();
    expect(getStudioState().rolledBack).toEqual({});
  });

  it("takes a later sidebar change of a field the panel saved as the user's", async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {layout: {background: '#101418'}});
    studioModel.echo();
    studioModel.sidebar((props) => ({...props, layout: {...(props.layout as Props), background: '#222222'}}));
    studioModel.echo(Date.now() + api.RACE_WINDOW_MS + 1000);
    expect(getStudioState().rolledBack).toEqual({});
    await api.patchProps(ID, {splits: []});
    expect(studioModel.file).toMatchObject({layout: {background: '#222222'}});
  });

  it('dismisses an offer without writing anything', async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    studioModel.echo();
    studioModel.jsonReset();
    expect(getStudioState().rolledBack[ID]).toEqual({audioFile: 'take-1.mp3'});
    const saves = studio.saveDefaultProps.mock.calls.length;
    api.dismissRolledBack(ID);
    expect(getStudioState().rolledBack).toEqual({});
    await api.restoreRolledBack(ID);
    expect(studio.saveDefaultProps.mock.calls.length).toBe(saves);
  });

  it('drops what is in flight when a later save fails after the echo came, so a later sidebar edit stays', async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    // The next save fails, but the first one's echo is rendered while it is on its way.
    studioModel.duringNextSave = () => {
      studioModel.echo();
      throw new Error('The Studio disconnected');
    };
    await expect(api.patchProps(ID, {splits: [{page: 1, line: 1, atWordId: 1}]})).rejects.toThrow('disconnected');
    expect(getStudioState().inFlightPatches).toEqual({});
    // A minute later the user points audioFile at another file in the sidebar.
    studioModel.sidebar((props) => ({...props, audioFile: 'mine.mp3'}));
    studioModel.echo(Date.now() + 60_000);
    await api.patchProps(ID, {layout: {background: '#000000'}});
    expect(studioModel.file).toMatchObject({audioFile: 'mine.mp3', layout: {background: '#000000'}});
    expect(getStudioState().rolledBack).toEqual({});
  });

  it('keeps carrying what is in flight when a later save fails before the echo, and lands it with the next', async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    studioModel.duringNextSave = () => {
      throw new Error('The Studio disconnected');
    };
    await expect(api.patchProps(ID, {splits: [{page: 1, line: 1, atWordId: 1}]})).rejects.toThrow('disconnected');
    expect(getStudioState().inFlightPatches).toEqual({[ID]: {audioFile: 'take-1.mp3'}});
    await api.patchProps(ID, {layout: {background: '#000000'}});
    expect(studioModel.file).toMatchObject({audioFile: 'take-1.mp3', layout: {background: '#000000'}});
    studioModel.echo();
    expect(getStudioState().inFlightPatches).toEqual({});
  });

  it("drops what is in flight once the first live props after the save are the user's, past the race window", async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    // The first live props the dock sees, long after, have the sidebar's recording.
    studioModel.sidebar((props) => ({...props, audioFile: 'mine.mp3'}));
    studioModel.echo(Date.now() + 60_000);
    expect(getStudioState().inFlightPatches).toEqual({});
    expect(getStudioState().rolledBack).toEqual({});
    await api.patchProps(ID, {layout: {background: '#000000'}});
    expect(studioModel.file).toMatchObject({audioFile: 'mine.mp3'});
  });

  it('judges a racing sidebar save that came, with the echo, before the save resolved', async () => {
    const studioModel = remotion();
    const before = studioModel.file;
    // The server writes the panel's save and the echo is rendered; the sidebar, built from the
    // props before it, writes over it; both are rendered before the panel's save resolves.
    studioModel.duringNextSave = (write) => {
      write();
      studioModel.echo();
      studioModel.sidebar(() => ({...before, layout: {visibleLines: 7, background: '#ffffff'}}));
      studioModel.echo();
    };
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    expect(getStudioState().rolledBack).toEqual({[ID]: {audioFile: 'take-1.mp3'}});
    expect(getStudioState().inFlightPatches).toEqual({});
    // Ten seconds later the user sets the recording in the sidebar; the next panel save keeps it.
    studioModel.sidebar((props) => ({...props, audioFile: 'mine.mp3'}));
    studioModel.echo(Date.now() + 10_000);
    await api.patchProps(ID, {splits: []});
    expect(studioModel.file).toMatchObject({audioFile: 'mine.mp3', layout: {visibleLines: 7}});
  });

  it('offers back what every save of the session wrote when the sidebar JSON Reset drops it', async () => {
    const studioModel = remotion();
    // Align, then a look.
    await api.patchProps(ID, {audioFile: 'take-1.mp3', timingsFile: 'take-1.timings.json'});
    studioModel.echo();
    await api.patchProps(ID, {layout: {background: '#101418'}});
    studioModel.echo();
    studioModel.jsonReset(Date.now() + 10 * 60_000);
    expect(getStudioState().rolledBack).toEqual({
      [ID]: {audioFile: 'take-1.mp3', timingsFile: 'take-1.timings.json', layout: {background: '#101418'}},
    });
    await api.restoreRolledBack(ID);
    expect(studioModel.file).toMatchObject({
      audioFile: 'take-1.mp3',
      timingsFile: 'take-1.timings.json',
      layout: {visibleLines: 3, background: '#101418'},
    });
  });

  it('does not offer back a field the user changed in the sidebar after the panel saved it', async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    studioModel.echo();
    await api.patchProps(ID, {layout: {background: '#101418'}});
    studioModel.echo();
    studioModel.sidebar((props) => ({...props, audioFile: 'mine.mp3'}));
    studioModel.echo(Date.now() + 60_000);
    studioModel.jsonReset(Date.now() + 10 * 60_000);
    expect(getStudioState().rolledBack).toEqual({[ID]: {layout: {background: '#101418'}}});
  });

  it('does not bring a dismissed offer back when the Studio reads the same page-load props again', async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    studioModel.echo();
    // The JSON Reset, saved by the sidebar, then read again.
    studioModel.sidebar(() => PAGE_LOAD);
    studioModel.reread(Date.now() + 60_000);
    expect(getStudioState().rolledBack).toEqual({[ID]: {audioFile: 'take-1.mp3'}});
    api.dismissRolledBack(ID);
    // The composition is selected again (after Set thumbnail, say): the same content, a new object.
    studioModel.reread(Date.now() + 120_000);
    expect(getStudioState().rolledBack).toEqual({});
  });

  it('keeps the offer when Restore fails, so it can be pressed again', async () => {
    const studioModel = remotion();
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    studioModel.echo();
    studioModel.jsonReset(Date.now() + 10 * 60_000);
    studioModel.duringNextSave = () => {
      throw new Error('The Studio disconnected');
    };
    await expect(api.restoreRolledBack(ID)).rejects.toThrow('disconnected');
    expect(getStudioState().rolledBack).toEqual({[ID]: {audioFile: 'take-1.mp3'}});
    await api.restoreRolledBack(ID);
    expect(studioModel.file).toMatchObject({audioFile: 'take-1.mp3'});
    expect(getStudioState().rolledBack).toEqual({});
  });
});

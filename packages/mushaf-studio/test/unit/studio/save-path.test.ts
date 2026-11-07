// The panel's save path against a model of Remotion 4.0.539's Studio, as it behaves:
// - `saveDefaultProps()` hands its callback `savedDefaultProps`, the Root as the page loaded it, and
//   that never changes in a session (the Studio writes the Root without rebuilding the bundle);
// - the Root file is what was written last, by anyone; every write sends one echo of what it wrote
//   (`default-props-updatable-changed`, a new object), and the echoes reach the browser in write
//   order, but when each is rendered, before or after the panel's save resolves, is up to timing;
// - a Props-sidebar edit (OptionsPanel's `setDefaultProps`) first changes the live props in the
//   browser (`updateProps`), built from what the sidebar shows, then writes that object to the Root;
// - the Studio's undo writes the Root as it was before its last write, which sends an echo too;
// - the dock hands each new live props object (`EditorPropsContext`) to `observeLiveProps()`.
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

const ALIGNED = {audioFile: 'take-1.mp3', timingsFile: 'take-1.timings.json'};

/** The Studio: one Root file, its frozen page-load copy, the echoes on their way, and the live props the dock renders. */
const remotion = () => {
  let file: Props = PAGE_LOAD;
  const history: Props[] = [];
  const echoes: Props[] = [];
  let live: Record<string, Props> = {};
  let during: ((write: () => void) => void) | null = null;
  const writeRoot = (next: Props) => {
    history.push(file);
    file = next;
    echoes.push(structuredClone(next));
  };
  const show = (props: Props, now?: number) => {
    live = {...live, [ID]: props};
    api.observeLiveProps(live, now);
  };
  studio.saveDefaultProps.mockImplementation(
    async ({defaultProps}: {defaultProps: (v: {savedDefaultProps: Props}) => Props}) => {
      // The Studio builds the object before it sends it; the server writes it when the request arrives.
      const next = defaultProps({savedDefaultProps: PAGE_LOAD});
      const write = () => writeRoot(next);
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
    /** Every echo on its way reaches the browser, in write order, and the dock renders each. */
    echo(now?: number) {
      for (let next = echoes.shift(); next; next = echoes.shift()) show(next, now);
    },
    /** Only the oldest echo on its way is rendered. */
    echoOne(now?: number) {
      const next = echoes.shift();
      if (!next) throw new Error('No echo on its way');
      show(next, now);
    },
    /** The dock looks at the same live props again (a timer, a re-render): nothing new. */
    look(now?: number) {
      api.observeLiveProps(live, now);
    },
    /** The Studio reads the Root again (the composition selected again, a reconnect): the same content, a new object. */
    reread(now?: number) {
      show(structuredClone(file), now);
    },
    /** A Props-sidebar edit: the live props changed at once, built from what the sidebar shows, then written to the Root. */
    sidebar(change: (props: Props) => Props, now?: number) {
      const next = change(live[ID] ?? PAGE_LOAD);
      show(next, now);
      writeRoot(next);
    },
    /** The Studio's undo (Ctrl/Cmd+Z): the Root as it was before its last write, written again. */
    undo() {
      const previous = history.pop();
      if (!previous) throw new Error('Nothing to undo');
      file = previous;
      echoes.push(structuredClone(previous));
    },
    /** The sidebar's JSON Reset: the live props go back to the page-load props; nothing is written. */
    jsonReset(now?: number) {
      show(PAGE_LOAD, now);
    },
  };
  show(PAGE_LOAD);
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
    await api.patchProps(ID, ALIGNED);
    // Before the panel's echo is rendered, the user changes the layout in the sidebar: built from
    // the props it shows, which do not have the alignment yet.
    studioModel.sidebar((props) => ({...props, layout: {...(props.layout as Props), visibleLines: 5}}));
    // Its local object is older than the panel's echo: nothing is judged yet, and the save is still carried.
    expect(getStudioState().rolledBack).toEqual({});
    expect(getStudioState().pendingPatches[ID]).toEqual(ALIGNED);
    expect(getStudioState().inFlightPatches).toEqual({[ID]: ALIGNED});
    // The panel's echo shows the alignment...
    studioModel.echoOne();
    expect(getStudioState().rolledBack).toEqual({});
    // ...and the sidebar's echo has written it over.
    studioModel.echoOne();
    expect(studioModel.file).toMatchObject({audioFile: 'page-load.mp3', layout: {visibleLines: 5}});
    expect(getStudioState().rolledBack).toEqual({[ID]: ALIGNED});
    // Nothing pending shows the lost value as if it were there.
    expect(getStudioState().pendingPatches[ID]).toBeUndefined();
    // The Studio's undo of the sidebar's write puts it back: the offer goes.
    studioModel.undo();
    studioModel.echo();
    expect(getStudioState().rolledBack).toEqual({});
  });

  it('lands three quick panel saves when the echoes come one save behind', async () => {
    const studioModel = remotion();
    // Align, then a look; the echo of the alignment is rendered while the look is on its way.
    await api.patchProps(ID, ALIGNED);
    studioModel.duringNextSave = (write) => {
      write();
      studioModel.echoOne();
    };
    await api.patchProps(ID, {layout: {background: '#101418'}});
    // The look is still in flight: the live props showed the alignment, not the look.
    expect(getStudioState().inFlightPatches).toEqual({[ID]: {layout: {background: '#101418'}}});
    // A split before the look's echo: it carries the look.
    await api.patchProps(ID, {splits: [{page: 1, line: 1, atWordId: 1}]});
    expect(studioModel.file).toMatchObject({
      ...ALIGNED,
      layout: {visibleLines: 3, background: '#101418'},
      splits: [{page: 1, line: 1, atWordId: 1}],
    });
    studioModel.echo();
    expect(getStudioState().inFlightPatches).toEqual({});
    expect(getStudioState().rolledBack).toEqual({});
  });

  it('offers nothing for a sidebar save sent just before a panel save, and offers back what a second one wrote over', async () => {
    const studioModel = remotion();
    // The user types a reciter in the sidebar and clicks Align: the field's blur saves first.
    studioModel.sidebar((props) => ({...props, overlay: {reciter: 'Alafasy'}}));
    studioModel.duringNextSave = (write) => {
      write();
      studioModel.echoOne();
    };
    await api.patchProps(ID, ALIGNED);
    expect(studioModel.file).toMatchObject({...ALIGNED, overlay: {reciter: 'Alafasy'}});
    // The sidebar's echo is older than the panel's: no offer, the tabs keep the alignment.
    expect(getStudioState().rolledBack).toEqual({});
    expect(getStudioState().pendingPatches[ID]).toEqual(ALIGNED);
    expect(getStudioState().inFlightPatches).toEqual({[ID]: ALIGNED});
    // A sidebar edit made before the panel's echo still lands with it, and keeps the alignment.
    studioModel.sidebar((props) => ({...props, layout: {...(props.layout as Props), visibleLines: 5}}));
    studioModel.echo();
    expect(getStudioState().rolledBack).toEqual({[ID]: ALIGNED});
    await api.restoreRolledBack(ID);
    expect(studioModel.file).toMatchObject({...ALIGNED, overlay: {reciter: 'Alafasy'}, layout: {visibleLines: 5}});
    studioModel.echo();
    expect(getStudioState().rolledBack).toEqual({});
  });

  it("takes the Studio's undo of a panel save as the user's, even at once", async () => {
    const studioModel = remotion();
    studioModel.sidebar((props) => ({...props, layout: {...(props.layout as Props), visibleLines: 5}}));
    studioModel.echo();
    // A look, then Ctrl+Z at once: the Root goes back to the sidebar's five lines without the look.
    await api.patchProps(ID, {layout: {background: '#101418'}});
    studioModel.echo();
    studioModel.undo();
    studioModel.echo(Date.now() + 2000);
    expect(studioModel.file).toMatchObject({layout: {visibleLines: 5, background: '#ffffff'}});
    expect(getStudioState().rolledBack).toEqual({});
    expect(getStudioState().pendingPatches[ID]).toBeUndefined();
    // The next panel save does not bring the look back.
    await api.patchProps(ID, {splits: []});
    expect(studioModel.file).toMatchObject({layout: {visibleLines: 5, background: '#ffffff'}});
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
    studioModel.sidebar((props) => ({...props, audioFile: 'mine.mp3'}), Date.now() + 60_000);
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

  it('offers back what no live props showed within the race window, and withdraws the offer when its echo comes late', async () => {
    const studioModel = remotion();
    await api.patchProps(ID, ALIGNED);
    // No echo is rendered (two came at once and React rendered only the last, say); the dock looks
    // again once the race window is over.
    studioModel.look(Date.now() + api.RACE_WINDOW_MS + 1000);
    expect(getStudioState().inFlightPatches).toEqual({});
    expect(getStudioState().rolledBack).toEqual({[ID]: ALIGNED});
    expect(getStudioState().pendingPatches[ID]).toBeUndefined();
    // The echo comes after all: the offer goes, and the next save starts from it.
    studioModel.echo(Date.now() + api.RACE_WINDOW_MS + 2000);
    expect(getStudioState().rolledBack).toEqual({});
    await api.patchProps(ID, {layout: {background: '#000000'}});
    expect(studioModel.file).toMatchObject({...ALIGNED, layout: {background: '#000000'}});
  });

  it('judges the race window from a timer when nothing new comes', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date']});
    try {
      remotion();
      await api.patchProps(ID, ALIGNED);
      expect(getStudioState().rolledBack).toEqual({});
      await vi.advanceTimersByTimeAsync(api.RACE_WINDOW_MS + 200);
      expect(getStudioState().rolledBack).toEqual({[ID]: ALIGNED});
    } finally {
      vi.useRealTimers();
    }
  });

  it('judges a racing sidebar save that came, with the echo, before the save resolved', async () => {
    const studioModel = remotion();
    // The server writes the panel's save; the sidebar, built from the props before it, writes over
    // it; both echoes are rendered before the panel's save resolves.
    studioModel.duringNextSave = (write) => {
      write();
      studioModel.sidebar((props) => ({...props, layout: {visibleLines: 7, background: '#ffffff'}}));
      studioModel.echo();
    };
    await api.patchProps(ID, {audioFile: 'take-1.mp3'});
    expect(getStudioState().rolledBack).toEqual({[ID]: {audioFile: 'take-1.mp3'}});
    expect(getStudioState().inFlightPatches).toEqual({});
    // Ten seconds later the user sets the recording in the sidebar; the next panel save keeps it.
    studioModel.sidebar((props) => ({...props, audioFile: 'mine.mp3'}), Date.now() + 10_000);
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
    studioModel.sidebar((props) => ({...props, audioFile: 'mine.mp3'}), Date.now() + 60_000);
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

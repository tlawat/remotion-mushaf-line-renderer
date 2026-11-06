// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MushafStudioError} from '../../../src/errors';
import {
  activePanelOf,
  describeError,
  dockOwnerOf,
  draftOf,
  getHfToken,
  getStudioState,
  loadOnce,
  mountedPanelsOf,
  registerPanel,
  resetStudioStore,
  runStudioTask,
  setDraft,
  setHfToken,
  setStudioState,
  studioStore,
  subscribeStudioStore,
  targetKeyOf,
  toTarget,
  useStudioDraft,
  withEntry,
} from '../../../src/studio/store';

beforeEach(() => resetStudioStore());
afterEach(() => resetStudioStore());

describe('the studio store', () => {
  it('starts idle, hands out the same snapshot until something changes, and notifies subscribers', () => {
    const first = getStudioState();
    expect(first).toMatchObject({tab: null, collapsed: false, busy: null, error: null, session: null, catalogue: null});
    expect(studioStore.getSnapshot()).toBe(first);
    const listener = vi.fn();
    const unsubscribe = subscribeStudioStore(listener);
    setStudioState({tab: 'review', busy: 'Working...'});
    expect(listener).toHaveBeenCalledTimes(1);
    const second = getStudioState();
    expect(second).not.toBe(first);
    expect(second.tab).toBe('review');
    expect(second.busy).toBe('Working...');
    expect(second.collapsed).toBe(false);
    unsubscribe();
    setStudioState({busy: null});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('remembers the panel layout in localStorage and the session in sessionStorage', async () => {
    setStudioState({tab: 'lines', collapsed: true});
    expect(JSON.parse(localStorage.getItem('mushaf-studio.panel')!)).toEqual({
      tab: 'lines',
      collapsed: true,
      side: 'right',
      language: 'en',
      showDoubts: true,
    });
    setStudioState({side: 'left'});
    expect(JSON.parse(localStorage.getItem('mushaf-studio.panel')!).side).toBe('left');
    const session = {
      audioId: 'abc',
      align: {audio_id: 'abc', segments: []},
      audio: 'mushaf-studio/default/a.mp3',
      model: 'Base',
      device: 'GPU',
      riwayah: 'hafs',
    } as const;
    const uploads = {MushafRecitation: 'mushaf-studio/default/a.mp3', 'Template/mushaf': 'mushaf-studio/t/b.mp3'};
    setStudioState({
      session,
      uploadedAudio: uploads,
      stagedFrom: {'Template/mushaf': 'public'},
      busy: 'x',
      error: 'y',
      catalogue: [],
      pendingPatches: {MushafRecitation: {slice: true}},
      drafts: {MushafRecitation: {review: {nudges: 1}}},
    });
    expect(JSON.parse(sessionStorage.getItem('mushaf-studio.session')!)).toEqual({
      session,
      uploadedAudio: uploads,
      stagedFrom: {'Template/mushaf': 'public'},
    });
    // A reload: a fresh module reads the storage back, the transient fields start over.
    vi.resetModules();
    const fresh = await import('../../../src/studio/store');
    const state = fresh.getStudioState();
    expect(state).toMatchObject({
      tab: 'lines',
      collapsed: true,
      side: 'left',
      session,
      uploadedAudio: uploads,
      stagedFrom: {'Template/mushaf': 'public'},
    });
    expect(state.pendingPatches).toEqual({});
    expect(state.inFlightPatches).toEqual({});
    expect(state.lookUndo).toEqual({});
    expect(state.drafts).toEqual({});
    expect(state.busy).toBeNull();
    expect(state.error).toBeNull();
    expect(state.catalogue).toBeNull();
    fresh.resetStudioStore();
    expect(localStorage.getItem('mushaf-studio.panel')).toBeNull();
    expect(sessionStorage.getItem('mushaf-studio.session')).toBeNull();
  });

  it('ignores junk in storage', async () => {
    localStorage.setItem('mushaf-studio.panel', '{"tab": "nope", "collapsed": "yes"}');
    // An upload kept by an older panel, one path for every composition: not this one's to guess.
    sessionStorage.setItem('mushaf-studio.session', '{"session": {"audioId": 1}, "uploadedAudio": "a.mp3"}');
    vi.resetModules();
    const fresh = await import('../../../src/studio/store');
    expect(fresh.getStudioState()).toMatchObject({
      tab: null,
      collapsed: false,
      side: 'right',
      session: null,
      uploadedAudio: {},
    });
    sessionStorage.setItem(
      'mushaf-studio.session',
      '{"uploadedAudio": {"A": "a.mp3", "B": 2}, "stagedFrom": {"A": "public", "B": "nope", "C": 1}}',
    );
    vi.resetModules();
    const again = await import('../../../src/studio/store');
    expect(again.getStudioState().uploadedAudio).toEqual({A: 'a.mp3'});
    expect(again.getStudioState().stagedFrom).toEqual({A: 'public'});
  });

  it('files state by target key: a composition id, or the id and the props key of a slot', () => {
    expect(targetKeyOf('MushafRecitation')).toBe('MushafRecitation');
    expect(targetKeyOf({compositionId: 'MushafRecitation'})).toBe('MushafRecitation');
    expect(targetKeyOf({compositionId: 'Template', propsKey: 'mushaf'})).toBe('Template/mushaf');
    expect(targetKeyOf({compositionId: 'Template', propsKey: ''})).toBe('Template');
    expect(toTarget('A')).toEqual({compositionId: 'A'});
    const target = {compositionId: 'T', propsKey: 'k'};
    expect(toTarget(target)).toBe(target);
  });

  it('sets and removes keyed entries without touching the others', () => {
    const record = {a: 1, b: 2};
    expect(withEntry(record, 'c', 3)).toEqual({a: 1, b: 2, c: 3});
    expect(withEntry(record, 'a', undefined)).toEqual({b: 2});
    expect(withEntry(record, 'z', undefined)).toBe(record);
    expect(record).toEqual({a: 1, b: 2});
  });

  it('keeps tab drafts by target key across unmounts, and forgets one on undefined', () => {
    setDraft('A', 'nudges', [1]);
    setDraft('A/slot', 'nudges', [2]);
    expect(draftOf('A', 'nudges')).toEqual([1]);
    expect(draftOf('A/slot', 'nudges')).toEqual([2]);
    expect(draftOf('B', 'nudges')).toBeUndefined();
    setDraft('A', 'nudges', undefined);
    expect(getStudioState().drafts).toEqual({'A/slot': {nudges: [2]}});
    const Counter = () => {
      const [count, setCount] = useStudioDraft('A', 'count', 0);
      return (
        <button type="button" onClick={() => setCount((n) => n + 1)}>
          {`count ${count}`}
        </button>
      );
    };
    const first = render(<Counter />);
    fireEvent.click(screen.getByText('count 0'));
    fireEvent.click(screen.getByText('count 1'));
    first.unmount();
    // A tab switch unmounts the tab: the draft is still there when it comes back.
    render(<Counter />);
    expect(screen.getByText('count 2')).toBeTruthy();
    expect(draftOf('A', 'count')).toBe(2);
    cleanup();
  });

  it('keeps the Hugging Face token in sessionStorage only', () => {
    expect(getHfToken()).toBe('');
    setHfToken('hf_secret');
    expect(sessionStorage.getItem('mushaf-studio.hf-token')).toBe('hf_secret');
    expect(localStorage.length).toBe(0);
    expect(getHfToken()).toBe('hf_secret');
    setHfToken('');
    expect(sessionStorage.getItem('mushaf-studio.hf-token')).toBeNull();
  });

  it('runs a task with a busy label and turns its failure into the error line', async () => {
    const seen: (string | null)[] = [];
    const unsubscribe = subscribeStudioStore(() => seen.push(getStudioState().busy));
    const ok = await runStudioTask('Doing it...', async () => {
      expect(getStudioState().busy).toBe('Doing it...');
    });
    expect(ok).toBe(true);
    expect(getStudioState().busy).toBeNull();
    expect(getStudioState().error).toBeNull();
    const failed = await runStudioTask('Failing...', async () => {
      throw new MushafStudioError('QUD_RATE_LIMITED', 'The aligner is busy.', {retryAfterSeconds: 41.2});
    });
    expect(failed).toBe(false);
    expect(getStudioState().error).toBe('The aligner is busy. Retry in 42 s.');
    expect(getStudioState().busy).toBeNull();
    expect(seen).toEqual(['Doing it...', null, 'Failing...', 'Failing...', null]);
    unsubscribe();
  });

  it('describes any failure', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('text')).toBe('text');
    expect(describeError(new MushafStudioError('QUD_HTTP', 'HTTP 500 from the aligner.'))).toBe(
      'HTTP 500 from the aligner.',
    );
  });

  it('loads a cached list once, however many ask', async () => {
    const load = vi.fn(async () => [{slug: 'a'}] as never);
    await Promise.all([loadOnce('catalogue', load), loadOnce('catalogue', load)]);
    await loadOnce('catalogue', load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(getStudioState().catalogue).toEqual([{slug: 'a'}]);
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    await loadOnce('quranComResources', failing);
    expect(getStudioState().error).toBe('offline');
    expect(getStudioState().quranComResources).toBeNull();
    await loadOnce('quranComResources', failing);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('runs one task at a time: a second one is refused with a notice while the first is busy', async () => {
    let finish!: () => void;
    const first = runStudioTask('Aligning...', () => new Promise<void>((resolve) => (finish = resolve)));
    expect(getStudioState().busy).toBe('Aligning...');
    const second = vi.fn(async () => undefined);
    expect(await runStudioTask('Copying the recording into public/...', second)).toBe(false);
    expect(second).not.toHaveBeenCalled();
    expect(getStudioState().notice).toBe(
      'The panel is busy (Aligning...); wait for it to finish before copying the recording into public/.',
    );
    expect(getStudioState().busy).toBe('Aligning...');
    finish();
    expect(await first).toBe(true);
    expect(getStudioState().busy).toBeNull();
    expect(await runStudioTask('Copying the recording into public/...', second)).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('loads a list in `loading`, never through `busy`, so a list arriving does not free a running task', async () => {
    let finish!: () => void;
    const task = runStudioTask('Aligning...', () => new Promise<void>((resolve) => (finish = resolve)));
    let deliver!: (value: never) => void;
    const load = vi.fn(() => new Promise<never>((resolve) => (deliver = resolve)));
    const loading = loadOnce('catalogue', load);
    expect(getStudioState().loading).toEqual(['catalogue']);
    expect(getStudioState().busy).toBe('Aligning...');
    deliver([{slug: 'a'}] as never);
    await loading;
    expect(getStudioState().loading).toEqual([]);
    expect(getStudioState().catalogue).toEqual([{slug: 'a'}]);
    expect(getStudioState().busy).toBe('Aligning...');
    finish();
    await task;
    expect(getStudioState().busy).toBeNull();
  });
});

describe('the panels mounted in a composition', () => {
  it('lists each key once in mount order, and shows the chosen one while it is mounted, else the first', () => {
    expect(activePanelOf(getStudioState(), 'T')).toBeNull();
    const first = registerPanel('T', {key: 'T/a', label: 'a'});
    const second = registerPanel('T', {key: 'T/b', label: 'b'});
    const again = registerPanel('T', {key: 'T/b', label: 'b'});
    expect(mountedPanelsOf(getStudioState(), 'T').map((p) => p.key)).toEqual(['T/a', 'T/b']);
    expect(activePanelOf(getStudioState(), 'T')).toBe('T/a');
    setStudioState({activePanels: {T: 'T/b'}});
    expect(activePanelOf(getStudioState(), 'T')).toBe('T/b');
    // One of the two `b`s goes: it is still mounted.
    again();
    expect(activePanelOf(getStudioState(), 'T')).toBe('T/b');
    second();
    expect(activePanelOf(getStudioState(), 'T')).toBe('T/a');
    // Released twice: counted once; the composition's entry goes with the last.
    second();
    first();
    expect(getStudioState().panels).toEqual({});
    // Another composition's panels are its own.
    registerPanel('U', {key: 'U', label: 'U'});
    expect(activePanelOf(getStudioState(), 'T')).toBeNull();
    expect(activePanelOf(getStudioState(), 'U')).toBe('U');
  });

  it('gives the dock of a key mounted twice to the first of the two, then to the one left', () => {
    expect(dockOwnerOf(getStudioState(), 'T')).toBeNull();
    const a = {key: 'T/a', label: 'a'};
    const first = {key: 'T/b', label: 'b'};
    const second = {key: 'T/b', label: 'b'};
    const releaseA = registerPanel('T', a);
    const releaseFirst = registerPanel('T', first);
    const releaseSecond = registerPanel('T', second);
    expect(dockOwnerOf(getStudioState(), 'T')).toBe(a);
    setStudioState({activePanels: {T: 'T/b'}});
    // Both are active (one key); only the first mounted docks.
    expect(dockOwnerOf(getStudioState(), 'T')).toBe(first);
    // The owner goes: its own entry is taken out, not the other one's, and the other docks.
    releaseFirst();
    expect(getStudioState().panels.T).toEqual([a, second]);
    expect(dockOwnerOf(getStudioState(), 'T')).toBe(second);
    releaseSecond();
    expect(dockOwnerOf(getStudioState(), 'T')).toBe(a);
    releaseA();
    expect(dockOwnerOf(getStudioState(), 'T')).toBeNull();
  });
});

// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MushafStudioError} from '../../../src/errors';
import {
  describeError,
  getHfToken,
  getStudioState,
  loadOnce,
  resetStudioStore,
  runStudioTask,
  setHfToken,
  setStudioState,
  studioStore,
  subscribeStudioStore,
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
    expect(JSON.parse(localStorage.getItem('mushaf-studio.panel')!)).toEqual({tab: 'lines', collapsed: true});
    const session = {
      audioId: 'abc',
      align: {audio_id: 'abc', segments: []},
      audio: 'mushaf-studio/default/a.mp3',
      model: 'Base',
      device: 'GPU',
      riwayah: 'hafs',
    } as const;
    setStudioState({session, uploadedAudio: 'mushaf-studio/default/a.mp3', busy: 'x', error: 'y', catalogue: []});
    expect(JSON.parse(sessionStorage.getItem('mushaf-studio.session')!)).toEqual({
      session,
      uploadedAudio: 'mushaf-studio/default/a.mp3',
    });
    // A reload: a fresh module reads the storage back, the transient fields start over.
    vi.resetModules();
    const fresh = await import('../../../src/studio/store');
    const state = fresh.getStudioState();
    expect(state).toMatchObject({tab: 'lines', collapsed: true, session, uploadedAudio: 'mushaf-studio/default/a.mp3'});
    expect(state.busy).toBeNull();
    expect(state.error).toBeNull();
    expect(state.catalogue).toBeNull();
    fresh.resetStudioStore();
    expect(localStorage.getItem('mushaf-studio.panel')).toBeNull();
    expect(sessionStorage.getItem('mushaf-studio.session')).toBeNull();
  });

  it('ignores junk in storage', async () => {
    localStorage.setItem('mushaf-studio.panel', '{"tab": "nope", "collapsed": "yes"}');
    sessionStorage.setItem('mushaf-studio.session', '{"session": {"audioId": 1}}');
    vi.resetModules();
    const fresh = await import('../../../src/studio/store');
    expect(fresh.getStudioState()).toMatchObject({tab: null, collapsed: false, session: null, uploadedAudio: null});
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
});

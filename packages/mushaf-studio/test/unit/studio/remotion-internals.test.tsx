// @vitest-environment jsdom
// The shapes the panel reads from Remotion's `Internals`, pinned against the installed Remotion: a
// version that renames or reshapes one of them fails here (and in the type check of this file)
// before it fails in a Studio.
import {act, cleanup, render} from '@testing-library/react';
import type * as React from 'react';
import {useContext, useEffect} from 'react';
import {Internals} from 'remotion';
import {afterEach, describe, expect, it} from 'vitest';
import {
  editorPropsOf,
  type LiveEditorProps,
  sequenceStartOf,
  type TimelineSequence,
  timelineSequenceOf,
  timelineSequencesOf,
  useLiveEditorProps,
  useOwnSequenceStart,
  useTimelineSequences,
} from '../../../src/studio/remotion-internals';

type EditorPropsValue = React.ContextType<typeof Internals.EditorPropsContext>;
type SequenceValue = NonNullable<React.ContextType<typeof Internals.SequenceContext>>;
type Registry = NonNullable<React.ContextType<typeof Internals.SequenceRegistryContext>>;
type Sequence = ReturnType<typeof Internals.useSequenceManagerSequences>[number];

afterEach(cleanup);

/** Renders `use()` and hands back what it returned last. */
const probe = <T,>(use: () => T, wrap: (children: React.ReactElement) => React.ReactElement) => {
  const seen: {current: T | undefined} = {current: undefined};
  const Probe = () => {
    seen.current = use();
    return null;
  };
  render(wrap(<Probe />));
  return seen;
};

describe('the live editor props', () => {
  it('reads Remotion’s own EditorPropsProvider, as the Studio fills it after a Root write', () => {
    let update: EditorPropsValue['updateProps'] | null = null;
    const Updater = () => {
      const context = useContext(Internals.EditorPropsContext);
      useEffect(() => {
        update = context.updateProps;
      }, [context.updateProps]);
      return null;
    };
    const seen = probe(useLiveEditorProps, (children) => (
      <Internals.EditorPropsProvider>
        <Updater />
        {children}
      </Internals.EditorPropsProvider>
    ));
    expect(seen.current).toEqual({});
    act(() => update!({id: 'MushafRecitation', defaultProps: {}, newProps: {audioFile: 'a.mp3'}}));
    expect(seen.current).toEqual({MushafRecitation: {audioFile: 'a.mp3'}});
    const first = seen.current;
    act(() => update!({id: 'MushafThumbnail', defaultProps: {}, newProps: (old) => ({...old, surah: 2})}));
    expect(seen.current).toEqual({MushafRecitation: {audioFile: 'a.mp3'}, MushafThumbnail: {surah: 2}});
    expect(seen.current!.MushafRecitation).toBe(first!.MushafRecitation);
  });

  it('is empty outside the Studio’s provider', () => {
    expect(probe(useLiveEditorProps, (children) => children).current).toEqual({});
  });

  it('keeps the record as it is, and drops what is not an object', () => {
    const props = {A: {x: 1}};
    const value: EditorPropsValue = {props, updateProps: () => undefined};
    expect(editorPropsOf(value)).toBe(props);
    expect(editorPropsOf({props: {A: {x: 1}, B: null, C: 'x'}})).toEqual({A: {x: 1}});
    for (const junk of [undefined, null, 'x', {}, {props: null}, {props: []}]) expect(editorPropsOf(junk)).toEqual({});
    const typed: LiveEditorProps = editorPropsOf(value);
    expect(typed.A).toEqual({x: 1});
  });
});

describe('the enclosing sequence', () => {
  const context = (rest: Partial<SequenceValue>): SequenceValue => ({
    playbackRate: 1,
    absoluteFrom: 0,
    cumulatedFrom: 0,
    cumulatedNegativeFrom: 0,
    relativeFrom: 0,
    parentFrom: 0,
    durationInFrames: 100,
    id: 'seq',
    width: null,
    height: null,
    premounting: false,
    postmounting: false,
    premountDisplay: null,
    postmountDisplay: null,
    ...rest,
  });

  it('starts at absoluteFrom, read from Remotion’s SequenceContext', () => {
    const seen = probe(useOwnSequenceStart, (children) => (
      <Internals.SequenceContext.Provider value={context({absoluteFrom: 75, cumulatedFrom: 30, relativeFrom: 45})}>
        {children}
      </Internals.SequenceContext.Provider>
    ));
    expect(seen.current).toBe(75);
  });

  it('is 0 at the top of a composition, and falls back to cumulatedFrom + relativeFrom', () => {
    expect(probe(useOwnSequenceStart, (children) => children).current).toBe(0);
    expect(sequenceStartOf({cumulatedFrom: 30, relativeFrom: 15})).toBe(45);
    expect(sequenceStartOf({cumulatedFrom: 30})).toBe(0);
    expect(sequenceStartOf({absoluteFrom: Number.NaN, cumulatedFrom: 1, relativeFrom: 2})).toBe(3);
    expect(sequenceStartOf(null)).toBe(0);
  });
});

describe('the timeline sequences', () => {
  const sequence = (rest: Partial<Sequence> & Pick<Sequence, 'type'>): Sequence =>
    ({
      sequencePlaybackRate: 1,
      from: 0,
      trimBefore: null,
      duration: 300,
      id: 'audio-1',
      displayName: 'Music',
      documentationLink: null,
      parent: null,
      showInTimeline: true,
      timelineOrder: null,
      loopDisplay: undefined,
      getStack: () => null,
      premountDisplay: null,
      postmountDisplay: null,
      controls: null,
      refForOutline: null,
      effects: [],
      effectRuntimeValues: null,
      isInsideSeries: false,
      frozenFrame: null,
      ...rest,
    }) as Sequence;

  const audio = sequence({
    type: 'audio',
    src: '/static/music.mp3',
    muted: false,
    startMediaFrom: 60,
    mediaFrameAtSequenceZero: null,
    playbackRate: 1,
    frozenMediaFrame: null,
    from: 30,
    parent: 'scene',
  } as Partial<Sequence> & Pick<Sequence, 'type'>);

  it('reads the registry Remotion’s useSequenceManagerSequences() subscribes to', () => {
    let snapshot: Sequence[] = [audio];
    const listeners = new Set<() => void>();
    const registry: Registry = {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setSnapshot: (update) => {
        snapshot = update(snapshot);
        for (const listener of listeners) listener();
      },
    };
    const seen = probe(useTimelineSequences, (children) => (
      <Internals.SequenceRegistryContext.Provider value={registry}>
        {children}
      </Internals.SequenceRegistryContext.Provider>
    ));
    const expected: TimelineSequence = {
      id: 'audio-1',
      displayName: 'Music',
      type: 'audio',
      src: '/static/music.mp3',
      from: 30,
      durationInFrames: 300,
      parent: 'scene',
      startMediaFrom: 60,
      mediaFrameAtSequenceZero: null,
      playbackRate: 1,
      sequencePlaybackRate: 1,
      trimBefore: 0,
      loop: false,
      muted: false,
    };
    expect(seen.current).toEqual([expected]);
    const first = seen.current;
    act(() =>
      registry.setSnapshot((list) => [...list, sequence({type: 'sequence', id: 'scene', displayName: 'Scene'})]),
    );
    expect(seen.current).not.toBe(first);
    expect(seen.current!.map((entry) => entry.id)).toEqual(['audio-1', 'scene']);
  });

  it('is empty outside the Studio', () => {
    expect(probe(useTimelineSequences, (children) => children).current).toEqual([]);
  });

  it('reads a plain sequence, a looping video, and skips what has no id', () => {
    expect(timelineSequenceOf(sequence({type: 'sequence', sequencePlaybackRate: 2}))).toMatchObject({
      type: 'sequence',
      src: null,
      startMediaFrom: 0,
      playbackRate: 2,
      loop: false,
    });
    const video = sequence({
      type: 'video',
      src: 'v.mp4',
      playbackRate: 1.5,
      startMediaFrom: 0,
      loopDisplay: {numberOfTimes: 2, startOffset: 0, durationInFrames: 150},
    } as Partial<Sequence> & Pick<Sequence, 'type'>);
    expect(timelineSequenceOf(video)).toMatchObject({type: 'video', src: 'v.mp4', playbackRate: 1.5, loop: true});
    // What the offset of a template's track is worked out from: the timeline's own fields.
    const trimmed = sequence({
      type: 'audio',
      src: 'a.mp3',
      muted: true,
      startMediaFrom: 90,
      mediaFrameAtSequenceZero: 45,
      playbackRate: 1,
      frozenMediaFrame: null,
      sequencePlaybackRate: 2,
      trimBefore: 30,
    } as Partial<Sequence> & Pick<Sequence, 'type'>);
    expect(timelineSequenceOf(trimmed)).toMatchObject({
      mediaFrameAtSequenceZero: 45,
      sequencePlaybackRate: 2,
      trimBefore: 30,
      muted: true,
    });
    expect(
      timelineSequenceOf({id: 'x', type: 'audio', trimBefore: null, mediaFrameAtSequenceZero: null}),
    ).toMatchObject({trimBefore: 0, mediaFrameAtSequenceZero: null});
    expect(timelineSequenceOf({displayName: 'x'})).toBeNull();
    expect(timelineSequenceOf({id: 'bare'})).toEqual({
      id: 'bare',
      displayName: '',
      type: 'sequence',
      src: null,
      from: 0,
      durationInFrames: 0,
      parent: null,
      startMediaFrom: 0,
      mediaFrameAtSequenceZero: null,
      playbackRate: 1,
      sequencePlaybackRate: 1,
      trimBefore: 0,
      loop: false,
      muted: false,
    });
    expect(timelineSequencesOf('nope')).toEqual([]);
    expect(timelineSequencesOf([null, {id: 'a'}]).map((entry) => entry.id)).toEqual(['a']);
  });
});

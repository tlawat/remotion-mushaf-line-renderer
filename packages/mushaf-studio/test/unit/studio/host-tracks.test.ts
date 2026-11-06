// The template's tracks and the second of each heard at the recitation's frame 0, worked out as the
// Studio's timeline places them: the registrations Remotion 4.0.539 makes for a trimmed
// `<Html5Audio>` in a `<Sequence>`, an `@remotion/media` `<Audio>`, nested sequences at other rates,
// a loop, the composition's own `<Audio>`; and turning a track's URL into an `audioFile`.
import {describe, expect, it} from 'vitest';
import {
  audioFileForTrack,
  followedTrack,
  type HostAudioTrack,
  hostAudioTracksOf,
  hostTrackMoved,
} from '../../../src/studio/host-tracks';
import type {TimelineSequence} from '../../../src/studio/remotion-internals';

const sequence = (rest: Partial<TimelineSequence> & Pick<TimelineSequence, 'id'>): TimelineSequence => ({
  displayName: '',
  type: 'sequence',
  src: null,
  from: 0,
  durationInFrames: 300,
  parent: null,
  startMediaFrom: 0,
  mediaFrameAtSequenceZero: null,
  playbackRate: 1,
  sequencePlaybackRate: 1,
  trimBefore: 0,
  loop: false,
  muted: false,
  ...rest,
});
const audio = (rest: Partial<TimelineSequence> & Pick<TimelineSequence, 'id'>): TimelineSequence =>
  sequence({type: 'audio', src: '/static-abc/music.mp3', displayName: 'music.mp3', ...rest});

const FPS = 30;

describe('hostAudioTracksOf()', () => {
  it('times a trimmed <Html5Audio> in a <Sequence from={60}>: 3 s heard at frame 60', () => {
    // <Sequence from={60}><Html5Audio trimBefore={90} /></Sequence>: Html5Audio wraps itself in a
    // hidden <Sequence from={-90}> and registers from 0 under it, its media frame at zero 90 * (1 - 1).
    const sequences = [
      sequence({id: 'scene', from: 60, displayName: 'Scene'}),
      sequence({id: 'trim', from: -90, parent: 'scene', displayName: 'Music'}),
      audio({id: 'a', parent: 'trim', startMediaFrom: 90, mediaFrameAtSequenceZero: 0}),
    ];
    const [track] = hostAudioTracksOf(sequences, {ownStart: 60, fps: FPS});
    expect(track).toMatchObject({kind: 'audio', src: '/static-abc/music.mp3', startFrame: -30, rate: 1, limit: null});
    expect(track!.offsetSeconds).toBe(3);
    // A recitation at frame 0 starts 2 s before the track would: 1 s into the file, extrapolated.
    expect(hostAudioTracksOf(sequences, {ownStart: 0, fps: FPS})[0]!.offsetSeconds).toBe(1);
  });

  it('times an @remotion/media <Audio from={60} trimBefore={90}>: its own sequence, the media frame at zero 90', () => {
    const sequences = [audio({id: 'm', from: 60, startMediaFrom: 90, mediaFrameAtSequenceZero: 90})];
    expect(hostAudioTracksOf(sequences, {ownStart: 0, fps: FPS})[0]!.offsetSeconds).toBe(1);
    expect(hostAudioTracksOf(sequences, {ownStart: 60, fps: FPS})[0]!.offsetSeconds).toBe(3);
    // A track that starts after the recitation: a negative second.
    const plain = [audio({id: 'p', from: 90})];
    expect(hostAudioTracksOf(plain, {ownStart: 30, fps: FPS})[0]!.offsetSeconds).toBe(-2);
    // An older entry without mediaFrameAtSequenceZero: startMediaFrom stands in.
    const older = [audio({id: 'o', from: 0, startMediaFrom: 45})];
    expect(hostAudioTracksOf(older, {ownStart: 0, fps: FPS})[0]!.offsetSeconds).toBe(1.5);
  });

  it('counts a child’s from on its parent’s clock, after the parent’s trim', () => {
    const sequences = [sequence({id: 'outer', from: 30, trimBefore: 15}), audio({id: 'a', from: 45, parent: 'outer'})];
    // The track starts at 30 + (45 - 15) = 60.
    const [track] = hostAudioTracksOf(sequences, {ownStart: 90, fps: FPS});
    expect(track!.startFrame).toBe(60);
    expect(track!.offsetSeconds).toBe(1);
  });

  it('lists a track at another speed or looping, but not as one to follow', () => {
    const sequences = [
      sequence({id: 'fast', sequencePlaybackRate: 2}),
      audio({id: 'a', parent: 'fast'}),
      audio({id: 'b', playbackRate: 1.5, src: '/static-abc/b.mp3'}),
      sequence({id: 'loop', loop: true}),
      audio({id: 'c', parent: 'loop', src: '/static-abc/c.mp3'}),
      audio({id: 'd', type: 'video', src: '/static-abc/clip.mp4', muted: true}),
    ];
    const tracks = hostAudioTracksOf(sequences, {ownStart: 0, fps: FPS});
    expect(tracks.map((track) => [track.id, track.rate, track.limit])).toEqual([
      ['a', 2, 'rate'],
      ['b', 1.5, 'rate'],
      ['c', 1, 'loop'],
      ['d', 1, null],
    ]);
    expect(tracks[3]).toMatchObject({kind: 'video', muted: true});
  });

  it('leaves out the composition’s own <Audio>, by its name or the name of the sequence it wraps itself in', () => {
    const sequences = [
      sequence({id: 'slot', from: 60, displayName: 'Recitation'}),
      audio({id: 'own', parent: 'slot', displayName: 'Mushaf recitation audio'}),
      sequence({id: 'wrap', parent: 'slot', displayName: 'Mushaf recitation audio'}),
      audio({id: 'own-trimmed', parent: 'wrap', displayName: 'audio.mp3'}),
      audio({id: 'template', displayName: 'Template audio'}),
      sequence({id: 'plain'}),
      sequence({id: 'image', type: 'image', src: '/static-abc/a.png'}),
    ];
    expect(hostAudioTracksOf(sequences, {ownStart: 60, fps: FPS}).map((track) => track.id)).toEqual(['template']);
  });

  it('skips a track whose parent is not registered yet, or a cycle, rather than mistiming it', () => {
    const sequences = [
      audio({id: 'orphan', parent: 'gone'}),
      sequence({id: 'x', parent: 'y'}),
      sequence({id: 'y', parent: 'x'}),
      audio({id: 'looped', parent: 'x'}),
    ];
    expect(hostAudioTracksOf(sequences, {ownStart: 0, fps: FPS})).toEqual([]);
    expect(hostAudioTracksOf([], {ownStart: 0, fps: FPS})).toEqual([]);
  });
});

describe('audioFileForTrack()', () => {
  const staticFiles = [{name: 'mushaf-studio/fatiha/audio.mp3', src: '/static-abc/mushaf-studio/fatiha/audio.mp3'}];
  const options = {staticFiles, staticBase: '/static-abc', origin: 'http://localhost:3000'};

  it('names the file of public/ the Studio lists with that src', () => {
    expect(audioFileForTrack('/static-abc/mushaf-studio/fatiha/audio.mp3', options)).toEqual({
      kind: 'public',
      path: 'mushaf-studio/fatiha/audio.mp3',
    });
  });

  it('strips the static base off a file the list does not show yet, decoding each segment', () => {
    expect(audioFileForTrack('/static-abc/my%20takes/take%231.mp3', options)).toEqual({
      kind: 'public',
      path: 'my takes/take#1.mp3',
    });
    // The Studio's own origin in front changes nothing.
    expect(audioFileForTrack('http://localhost:3000/static-abc/mushaf-studio/fatiha/audio.mp3', options)).toEqual({
      kind: 'public',
      path: 'mushaf-studio/fatiha/audio.mp3',
    });
  });

  it('keeps another host’s URL, asks for the bytes of a blob: or data: URL, and gives up on the rest', () => {
    expect(audioFileForTrack('https://cdn.example.org/a.mp3', options)).toEqual({
      kind: 'url',
      url: 'https://cdn.example.org/a.mp3',
    });
    expect(audioFileForTrack('blob:http://localhost:3000/1234', options)).toEqual({
      kind: 'bytes',
      url: 'blob:http://localhost:3000/1234',
    });
    expect(audioFileForTrack('data:audio/wav;base64,UklGRg==', options)?.kind).toBe('bytes');
    expect(audioFileForTrack('/elsewhere/a.mp3', options)).toBeNull();
    expect(audioFileForTrack('/static-abc/a.mp3', {staticFiles: []})).toBeNull();
  });

  it("maps a blob: src the Studio's list gives a public/ file (the browser-hosted Studio) to that file", () => {
    const hosted = [{name: 'a.mp3', src: 'blob:http://localhost:3000/a'}];
    expect(audioFileForTrack('blob:http://localhost:3000/a', {staticFiles: hosted})).toEqual({
      kind: 'public',
      path: 'a.mp3',
    });
    expect(audioFileForTrack('blob:http://localhost:3000/b', {staticFiles: hosted})?.kind).toBe('bytes');
  });

  it('maps a blob: track whose bytes were written this session back to that file', () => {
    const copyOf = (src: string) => (src === 'blob:http://localhost:3000/t' ? 'mushaf-studio/p/track.mp3' : null);
    expect(audioFileForTrack('blob:http://localhost:3000/t', {...options, copyOf})).toEqual({
      kind: 'public',
      path: 'mushaf-studio/p/track.mp3',
    });
    expect(audioFileForTrack('blob:http://localhost:3000/u', {...options, copyOf})?.kind).toBe('bytes');
  });
});

describe('a track that moved', () => {
  const track = (rest: Partial<HostAudioTrack>): HostAudioTrack => ({
    id: String(Math.random()),
    kind: 'audio',
    src: '/static-abc/music.mp3',
    label: 'Template audio',
    muted: false,
    startFrame: 0,
    rate: 1,
    loops: false,
    offsetSeconds: 0,
    limit: null,
    ...rest,
  });
  const fileOf = (t: HostAudioTrack) => ({kind: 'public' as const, path: t.src.replace('/static-abc/', '')});

  it('moved only past half a frame', () => {
    expect(hostTrackMoved(1, 1.016, 30)).toBe(false);
    expect(hostTrackMoved(1, 1.017, 30)).toBe(true);
    expect(hostTrackMoved(0, -0.5, 30)).toBe(true);
  });

  it('is matched by its file, then by the name the offset was saved with', () => {
    const tracks = [
      track({id: 'a', label: 'Music', src: '/static-abc/music.mp3'}),
      track({id: 'b', label: 'Template audio', src: '/static-abc/music.mp3'}),
      track({id: 'c', label: 'Template audio', src: '/static-abc/other.mp3'}),
    ];
    expect(followedTrack(tracks, 'music.mp3', 'Template audio', fileOf)?.id).toBe('b');
    expect(followedTrack(tracks, 'music.mp3', 'Renamed', fileOf)?.id).toBe('a');
    expect(followedTrack(tracks, 'none.mp3', 'Template audio', fileOf)).toBeNull();
  });

  it('matches a blob: track by its name when no track plays the file its bytes went into', () => {
    const bytesOf = (t: HostAudioTrack) =>
      t.src.startsWith('blob:') ? {kind: 'bytes' as const, url: t.src} : fileOf(t);
    const tracks = [
      track({id: 'a', label: 'Music', src: '/static-abc/music.mp3'}),
      track({id: 'b', label: 'Template audio', src: 'blob:http://localhost:3000/new'}),
    ];
    expect(followedTrack(tracks, 'mushaf-studio/p/track.webm', 'Template audio', bytesOf)?.id).toBe('b');
    // A file a track plays wins; no name, or a name no blob: track has, matches nothing.
    expect(followedTrack(tracks, 'music.mp3', 'Template audio', bytesOf)?.id).toBe('a');
    expect(followedTrack(tracks, 'mushaf-studio/p/track.webm', '', bytesOf)).toBeNull();
    expect(followedTrack(tracks, 'mushaf-studio/p/track.webm', 'Music', bytesOf)).toBeNull();
  });
});

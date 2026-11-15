// What Source's "Now:" line says the composition plays, the choice Source opens on, and the one
// recording Align sends, for every way the audio can have come in; and `hostAudio` read leniently.
import {describe, expect, it} from 'vitest';
import {
  assertNoHostRepeats,
  defaultHostAudio,
  followsHostAudio,
  hostAudioOf,
  hostAudioSchema,
} from '../../../src/audio';
import {defaultMushafRecitationProps, type MushafRecitationProps} from '../../../src/compositions/recitation';
import {alignSourceOf, defaultSourceMode, hostOf, isVideoFile, nowSourceOf} from '../../../src/studio/audio-source';
import type {AlignmentSidecar, StudioTimings} from '../../../src/types';

const CLIP = 'https://hetchyy-quranic-universal-aligner.hf.space/preload-audio/r/1.mp3?start_ms=0&end_ms=9000';
const sidecar = (source: AlignmentSidecar['source']): AlignmentSidecar => ({
  version: 1,
  source,
  ...(source === 'qud-catalogue'
    ? {recitation: {slug: 'r', chapter: 1, verseFrom: 1, verseTo: 7, clipStart: 0, audioUrl: CLIP}}
    : {}),
  segments: [],
  words: [],
  edits: [],
});
const timings = (source: AlignmentSidecar['source'] | null, audio?: string): StudioTimings => ({
  version: 1,
  surah: 1,
  ...(audio === undefined ? {} : {audio}),
  ayat: [{ayah: 1, start: 0, end: 1}],
  ...(source === null ? {} : {alignment: sidecar(source)}),
});
const props = (
  rest: Partial<MushafRecitationProps>,
  source: AlignmentSidecar['source'] | null = null,
  audioSrc: string | null = null,
  audio?: string,
): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  audioFile: 'mushaf-studio/p/take.mp3',
  ...rest,
  resolved: {timings: timings(source, audio), audioSrc},
});
const nothingStaged = {path: null, origin: 'upload' as const};

describe('hostAudio, read leniently', () => {
  it('is off for props saved before it, and for junk', () => {
    expect(hostAudioOf({})).toEqual(defaultHostAudio);
    expect(hostAudioOf({hostAudio: null})).toEqual(defaultHostAudio);
    expect(hostAudioOf({hostAudio: 'yes'})).toEqual(defaultHostAudio);
    expect(hostAudioOf({hostAudio: {enabled: 'true', offsetSeconds: Number.NaN, track: 3}})).toEqual(defaultHostAudio);
    expect(hostAudioOf({hostAudio: {enabled: true, offsetSeconds: -1.25}})).toEqual({
      enabled: true,
      offsetSeconds: -1.25,
      track: '',
    });
    expect(followsHostAudio({hostAudio: {enabled: true}})).toBe(true);
    expect(followsHostAudio(defaultMushafRecitationProps)).toBe(false);
  });

  it('describes every field for the Props sidebar, and refuses repeats only when it is on', () => {
    for (const [key, field] of Object.entries(hostAudioSchema.shape)) expect(field.description, key).toBeTruthy();
    const on = {hostAudio: {...defaultHostAudio, enabled: true}};
    expect(() => assertNoHostRepeats(on, {mode: 'off', repeat: 3})).not.toThrow();
    expect(() => assertNoHostRepeats(on, {mode: 'repeat', repeat: 1})).not.toThrow();
    expect(() => assertNoHostRepeats(on, {mode: 'blank-all', repeat: 2})).toThrow(
      expect.objectContaining({code: 'BAD_STUDIO_PROP'}),
    );
  });
});

describe('nowSourceOf()', () => {
  it('names each way the audio came in', () => {
    expect(nowSourceOf(props({audioFile: ''}))).toEqual({kind: 'none'});
    expect(nowSourceOf(props({}, 'qud-catalogue'))).toEqual({
      kind: 'catalogue',
      path: 'mushaf-studio/p/take.mp3',
      host: 'hetchyy-quranic-universal-aligner.hf.space',
    });
    expect(nowSourceOf(props({}, 'qud'))).toEqual({kind: 'aligned', path: 'mushaf-studio/p/take.mp3'});
    expect(nowSourceOf(props({}, 'manual'))).toEqual({
      kind: 'file',
      path: 'mushaf-studio/p/take.mp3',
      otherTimings: null,
    });
    expect(nowSourceOf({...defaultMushafRecitationProps, resolved: null}).kind).toBe('file');
  });

  it('names where the timings came from only when they were made for the file the composition plays', () => {
    // The catalogue download wrote the clip under this name, or the stream was downloaded later.
    expect(nowSourceOf(props({}, 'qud-catalogue', null, 'mushaf-studio/p/take.mp3')).kind).toBe('catalogue');
    expect(nowSourceOf(props({}, 'qud-catalogue', null, CLIP)).kind).toBe('catalogue');
    expect(nowSourceOf(props({}, 'qud', null, 'mushaf-studio/p/take.mp3')).kind).toBe('aligned');
    // "Replace the audio only" with the user's own file: not downloaded from the catalogue, and alignable.
    const replaced = props(
      {audioFile: 'mushaf-studio/p/my-own-take.mp3'},
      'qud-catalogue',
      null,
      'mushaf-studio/p/take.mp3',
    );
    expect(nowSourceOf(replaced)).toEqual({
      kind: 'file',
      path: 'mushaf-studio/p/my-own-take.mp3',
      otherTimings: 'mushaf-studio/p/take.mp3',
    });
    expect(alignSourceOf(replaced, nothingStaged)).toEqual({
      kind: 'file',
      path: 'mushaf-studio/p/my-own-take.mp3',
      origin: 'current',
    });
    expect(
      nowSourceOf(props({audioFile: 'mushaf-studio/p/mine.mp3'}, 'qud', null, 'mushaf-studio/p/take.mp3')).kind,
    ).toBe('file');
  });

  it('says when a missing file streams the catalogue clip, and when audioFile is a stream', () => {
    expect(nowSourceOf(props({}, 'qud-catalogue', CLIP))).toEqual({
      kind: 'missing',
      path: 'mushaf-studio/p/take.mp3',
      url: CLIP,
      host: 'hetchyy-quranic-universal-aligner.hf.space',
    });
    expect(nowSourceOf(props({audioFile: CLIP}, 'qud-catalogue'))).toEqual({
      kind: 'streaming',
      url: CLIP,
      host: 'hetchyy-quranic-universal-aligner.hf.space',
    });
  });

  it('says the template’s track plays it under hostAudio, whatever the timings are', () => {
    const host = {enabled: true, offsetSeconds: 2, track: 'Template audio'};
    expect(nowSourceOf(props({hostAudio: host}, 'qud-catalogue', CLIP))).toEqual({
      kind: 'track',
      file: 'mushaf-studio/p/take.mp3',
      track: 'Template audio',
      offsetSeconds: 2,
    });
  });
});

describe('defaultSourceMode()', () => {
  it('opens on where the audio came from, the catalogue otherwise', () => {
    expect(defaultSourceMode(props({}), nothingStaged)).toBe('catalogue');
    expect(defaultSourceMode(props({}, 'qud-catalogue'), nothingStaged)).toBe('catalogue');
    expect(defaultSourceMode(props({}, 'qud'), nothingStaged)).toBe('upload');
    expect(defaultSourceMode(props({hostAudio: {enabled: true, offsetSeconds: 0, track: ''}}), nothingStaged)).toBe(
      'track',
    );
    expect(defaultSourceMode(props({}), {path: 'mushaf-studio/p/old.mp3', origin: 'public'})).toBe('public');
    expect(defaultSourceMode(props({}), {path: 'mushaf-studio/p/new.m4a', origin: 'upload'})).toBe('upload');
    // Staged and since aligned: the composition plays it, nothing is pending.
    expect(defaultSourceMode(props({}, 'manual'), {path: 'mushaf-studio/p/take.mp3', origin: 'public'})).toBe(
      'catalogue',
    );
  });
});

describe('alignSourceOf()', () => {
  it('sends what Source staged while the composition does not play it yet', () => {
    expect(alignSourceOf(props({}, 'qud-catalogue'), {path: 'mushaf-studio/p/mine.m4a', origin: 'upload'})).toEqual({
      kind: 'file',
      path: 'mushaf-studio/p/mine.m4a',
      origin: 'upload',
    });
    expect(alignSourceOf(props({}, 'qud'), {path: 'mushaf-studio/p/take.mp3', origin: 'public'})).toEqual({
      kind: 'file',
      path: 'mushaf-studio/p/take.mp3',
      origin: 'current',
    });
  });

  it('aligns the catalogue clip itself when Source staged it by name, but never instead of a followed track', () => {
    const staged = {path: 'mushaf-studio/p/take.mp3', origin: 'public' as const};
    expect(alignSourceOf(props({}, 'qud-catalogue'), staged)).toEqual({
      kind: 'file',
      path: 'mushaf-studio/p/take.mp3',
      origin: 'current',
    });
    expect(alignSourceOf(props({}, 'qud-catalogue'), {...staged, origin: 'upload'})).toEqual({kind: 'catalogue'});
    const host = {enabled: true, offsetSeconds: 0, track: 'Template audio'};
    expect(alignSourceOf(props({hostAudio: host}, 'qud-catalogue'), staged)).toEqual({
      kind: 'file',
      path: 'mushaf-studio/p/take.mp3',
      origin: 'track',
    });
  });

  it('does not align the catalogue’s reviewed timings again, streamed or missing', () => {
    expect(alignSourceOf(props({}, 'qud-catalogue'), nothingStaged)).toEqual({kind: 'catalogue'});
    expect(alignSourceOf(props({audioFile: CLIP}, 'qud-catalogue'), nothingStaged)).toEqual({kind: 'catalogue'});
    expect(alignSourceOf(props({}, 'qud-catalogue', CLIP), nothingStaged)).toEqual({kind: 'catalogue'});
  });

  it('aligns a URL the composition plays, the template’s track, or nothing', () => {
    expect(alignSourceOf(props({audioFile: 'https://x.y/z.mp3'}, 'qud'), nothingStaged)).toEqual({
      kind: 'url',
      url: 'https://x.y/z.mp3',
      origin: 'current',
    });
    const host = {enabled: true, offsetSeconds: 0, track: 'Template audio'};
    expect(alignSourceOf(props({hostAudio: host}, 'qud-catalogue'), nothingStaged)).toEqual({
      kind: 'file',
      path: 'mushaf-studio/p/take.mp3',
      origin: 'track',
    });
    expect(alignSourceOf(props({hostAudio: host, audioFile: 'https://x.y/z.mp4'}), nothingStaged)).toEqual({
      kind: 'url',
      url: 'https://x.y/z.mp4',
      origin: 'track',
    });
    expect(alignSourceOf(props({audioFile: ''}), nothingStaged)).toEqual({kind: 'none'});
  });
});

describe('names', () => {
  it('tells a video by its extension, and a URL by its host', () => {
    expect(isVideoFile('mushaf-studio/p/clip.MP4')).toBe(true);
    expect(isVideoFile('https://x.y/a.mov?download=1')).toBe(true);
    expect(isVideoFile('a.webm')).toBe(false);
    expect(isVideoFile('mp4')).toBe(false);
    expect(hostOf(CLIP)).toBe('hetchyy-quranic-universal-aligner.hf.space');
    expect(hostOf('mushaf-studio/p/a.mp3')).toBeNull();
  });
});

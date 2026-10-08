// glossVisibilityFrom(): a label shows what its word shows, a word without a time of its own taking
// its ayah's start, in timings of either version (version 2 names each ayah's surah).
import {describe, expect, it} from 'vitest';
import {glossVisibilityFrom} from '../../../src/interlinear';
import {clipTimeline} from '../../../src/memorize';
import type {StudioTimings} from '../../../src/types';
import falaqNas from '../../fixtures/timings/falaq-nas.json';
import fatiha from '../../fixtures/timings/fatiha.json';

const blank = {mode: 'blank-upcoming' as const, revealAfterRepeats: 1};
const at = (timings: StudioTimings, now: number) =>
  glossVisibilityFrom({
    memorize: blank,
    clips: clipTimeline(timings, {...blank, repeat: 1, pauseSeconds: 0}),
    timings,
    // No word has a time of its own: each is first heard at its ayah's start.
    starts: {},
    activeWordId: null,
    seconds: now,
    now,
  })!;

describe('glossVisibilityFrom', () => {
  it('shows an untimed word from its ayah’s start, in one surah’s timings', () => {
    const timings = fatiha as unknown as StudioTimings;
    const second = timings.ayat[1]!;
    expect(second.ayah).toBe(3);
    expect(at(timings, second.start - 0.01)('1:3:1')).toBe('hidden');
    expect(at(timings, second.start)('1:3:1')).toBe('shown');
  });

  it('shows an untimed word from its ayah’s start in timings across surahs, by the ayah’s own surah', () => {
    const timings = falaqNas as unknown as StudioTimings;
    const nas = timings.ayat[2]!;
    expect(nas).toMatchObject({surah: 114, ayah: 1});
    expect(at(timings, nas.start - 0.01)('114:1:2')).toBe('hidden');
    expect(at(timings, nas.start)('114:1:2')).toBe('shown');
    expect(at(timings, nas.start)('113:4:1')).toBe('shown');
    // A surah the timings do not name has no start: its words stay hidden.
    expect(at(timings, 100)('112:1:1')).toBe('hidden');
  });

  it('hides nothing outside the blank modes', () => {
    const timings = fatiha as unknown as StudioTimings;
    const options = {clips: [], timings, starts: {}, activeWordId: null, seconds: 0, now: 0};
    expect(glossVisibilityFrom({...options, memorize: {mode: 'off', revealAfterRepeats: 1}})).toBeUndefined();
    expect(glossVisibilityFrom({...options, memorize: {mode: 'repeat', revealAfterRepeats: 1}})).toBeUndefined();
  });
});

// The clip timeline of the memorisation modes against the Fatiha timings fixture: the clips, the
// clock that maps the composition back onto the recording, the schedule laid on the clips and the
// window position that can scroll back.
import {enterTiming, type LineSchedule, scheduleLines, scrollPosition} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {
  audioClock,
  audioTimeAt,
  clipAt,
  clipTimeline,
  isIdentityTimeline,
  repeatCounterText,
  repeatsOf,
  scheduleForClips,
  scrollTargetPosition,
  timelineDuration,
  timelineEnd,
} from '../../../src/memorize';
import {defaultMemorize} from '../../../src/schema';
import type {StudioTimings} from '../../../src/types';
import fatiha from '../../fixtures/timings/fatiha.json';
import {fatihaLines} from '../compositions/helpers/fatiha-lines';

const timings = fatiha as unknown as StudioTimings;
const memorize = (changes: Partial<typeof defaultMemorize> = {}) => ({
  ...defaultMemorize,
  mode: 'repeat' as const,
  ...changes,
});
/** Ayah 2: 0.331-3.391 (3.06 s); ayah 3 starts at 3.533. */
const AYAH2 = {from: 0.331, to: 3.391, length: 3.06};

describe('repeatsOf', () => {
  it('is 1 when off, whatever repeat says, and repeat otherwise', () => {
    expect(repeatsOf({mode: 'off', repeat: 3})).toBe(1);
    expect(repeatsOf({mode: 'repeat', repeat: 3})).toBe(3);
    expect(repeatsOf({mode: 'blank-all', repeat: 1})).toBe(1);
  });
});

describe('clipTimeline', () => {
  it('is the recording itself when ayahs play once: one clip per ayah at its own start', () => {
    const clips = clipTimeline(timings, defaultMemorize);
    expect(clips).toHaveLength(timings.ayat.length);
    for (const [i, clip] of clips.entries()) {
      const ayah = timings.ayat[i]!;
      expect(clip).toEqual({
        ayah: ayah.ayah,
        repetition: 1,
        audioFrom: ayah.start,
        audioTo: Math.min(ayah.end, timings.ayat[i + 1]?.start ?? ayah.end),
        compositionFrom: ayah.start,
      });
    }
    expect(isIdentityTimeline(clips)).toBe(true);
    expect(timelineEnd(clips)).toBe(27.559);
  });

  it('plays each ayah N times, pauseSeconds apart, keeps the gap between ayahs, and shifts the rest', () => {
    const clips = clipTimeline(timings, memorize({repeat: 3, pauseSeconds: 0.5}));
    expect(clips).toHaveLength(3 * timings.ayat.length);
    expect(isIdentityTimeline(clips)).toBe(false);
    expect(clips.slice(0, 3)).toEqual([
      {ayah: 2, repetition: 1, audioFrom: AYAH2.from, audioTo: AYAH2.to, compositionFrom: 0.331},
      {ayah: 2, repetition: 2, audioFrom: AYAH2.from, audioTo: AYAH2.to, compositionFrom: 3.891},
      {ayah: 2, repetition: 3, audioFrom: AYAH2.from, audioTo: AYAH2.to, compositionFrom: 7.451},
    ]);
    // The third play ends at 7.451 + 3.06 = 10.511; the recording's gap (3.533 - 3.391) follows.
    expect(clips[3]).toMatchObject({ayah: 3, repetition: 1, audioFrom: 3.533, compositionFrom: 10.653});
    // Every ayah adds two more plays and two pauses: 2 × Σ length + 2 × 6 × 0.5.
    const lengths = timings.ayat.reduce(
      (sum, a, i) => sum + Math.min(a.end, timings.ayat[i + 1]?.start ?? a.end) - a.start,
      0,
    );
    expect(timelineEnd(clips)).toBeCloseTo(27.559 + 2 * lengths + 2 * 6 * 0.5, 6);
    expect(timelineDuration(clips, 30)).toBe(Math.ceil((timelineEnd(clips) + 1) * 30));
  });

  it('has no pause for pauseSeconds 0, and one play for repeat 1 in any mode', () => {
    const clips = clipTimeline(timings, memorize({repeat: 2, pauseSeconds: 0}));
    expect(clips[1]!.compositionFrom).toBe(AYAH2.to);
    expect(isIdentityTimeline(clipTimeline(timings, memorize({mode: 'blank-all', repeat: 1})))).toBe(true);
  });

  it('cuts an ayah that overlaps the next at the next one’s start, so no audio is heard twice at once', () => {
    const overlapping = {
      version: 1 as const,
      surah: 1,
      ayat: [
        {ayah: 1, start: 0, end: 2.5},
        {ayah: 2, start: 2, end: 4},
      ],
    };
    const clips = clipTimeline(overlapping, memorize({repeat: 2, pauseSeconds: 0}));
    expect(clips.map((c) => [c.ayah, c.audioFrom, c.audioTo, c.compositionFrom])).toEqual([
      [1, 0, 2, 0],
      [1, 0, 2, 2],
      [2, 2, 4, 4],
      [2, 2, 4, 6],
    ]);
  });

  it('is empty for no ayahs, and ends at 0', () => {
    const clips = clipTimeline({version: 1, surah: 1, ayat: []}, memorize());
    expect(clips).toEqual([]);
    expect(timelineEnd(clips)).toBe(0);
    expect(timelineDuration(clips, 30)).toBe(30);
  });
});

describe('clipAt and audioTimeAt', () => {
  const clips = clipTimeline(timings, memorize({repeat: 3, pauseSeconds: 0.5}));

  it('is null and the same second before the first clip', () => {
    expect(clipAt(clips, 0.2)).toBeNull();
    expect(audioTimeAt(clips, 0.2)).toBe(0.2);
  });

  it('restarts the recording at each play and holds its end through the pause', () => {
    expect(clipAt(clips, 1)?.repetition).toBe(1);
    expect(audioTimeAt(clips, 1)).toBeCloseTo(1, 9);
    expect(clipAt(clips, 4)?.repetition).toBe(2);
    expect(audioTimeAt(clips, 4)).toBeCloseTo(AYAH2.from + (4 - 3.891), 9);
    // 3.391-3.891 is the pause after the first play: the clip's end.
    expect(clipAt(clips, 3.6)?.repetition).toBe(1);
    expect(audioTimeAt(clips, 3.6)).toBe(AYAH2.to);
  });

  it('runs on after the last clip', () => {
    const last = clips[clips.length - 1]!;
    const after = timelineEnd(clips) + 0.5;
    expect(audioTimeAt(clips, after)).toBeCloseTo(last.audioTo + 0.5, 6);
  });

  it('audioClock is the identity for an identity timeline, exactly', () => {
    const clock = audioClock(clipTimeline(timings, defaultMemorize));
    for (const s of [0, 0.1, 3.45, 12.3456789, 40]) expect(clock(s)).toBe(s);
    expect(audioClock(clips)(4)).toBe(audioTimeAt(clips, 4));
  });
});

describe('repeatCounterText', () => {
  it('says which play of how many, and nothing for one play or before the first clip', () => {
    const clips = clipTimeline(timings, memorize({repeat: 3}));
    expect(repeatCounterText(clipAt(clips, 4), 3)).toBe('2/3');
    expect(repeatCounterText(clips[2]!, 3)).toBe('3/3');
    expect(repeatCounterText(null, 3)).toBeNull();
    expect(repeatCounterText(clips[0]!, 1)).toBeNull();
  });
});

describe('scheduleForClips', () => {
  const lines = fatihaLines();
  const schedule = scheduleLines(lines, timings);

  it('is the same schedule for an identity timeline', () => {
    expect(scheduleForClips(schedule, lines, clipTimeline(timings, defaultMemorize), 0)).toBe(schedule);
  });

  it('brings each ayah’s line back for every play, at the play’s time; one ayah per line merges into one slot', () => {
    const clips = clipTimeline(timings, memorize({repeat: 2, pauseSeconds: 0.5}));
    const laid = scheduleForClips(schedule, lines, clips, 0);
    // One ayah per line: the line stays through both plays of its ayah.
    expect(laid.map((slot) => slot.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(laid[0]!.start).toBe(schedule[0]!.start);
    // Cut to the clip: the second play's end (the line's own end, 3.533, is past the ayah's).
    expect(laid[0]!.end).toBeCloseTo(clips[1]!.compositionFrom + AYAH2.length, 6);
    expect(laid[1]!.start).toBeCloseTo(clips[2]!.compositionFrom + (schedule[1]!.start - clips[2]!.audioFrom), 6);
  });

  it('comes back to the ayah’s first line when an ayah spans two lines', () => {
    // Ayah 7 over two lines: its first five words on one, the rest and the marker on the next.
    const [first, ...rest] = fatihaLines(7, 7);
    const words = first!.words;
    const two = [
      {...first!, words: words.slice(0, 5)},
      {...first!, line: first!.line + 1, words: words.slice(5)},
      ...rest,
    ];
    const ayah7 = {version: 1 as const, surah: 1, ayat: timings.ayat.filter((a) => a.ayah === 7)};
    const twoSchedule = scheduleLines(two, ayah7);
    expect(twoSchedule).toHaveLength(2);
    const clips = clipTimeline(ayah7, memorize({repeat: 2, pauseSeconds: 0.5}));
    const laid = scheduleForClips(twoSchedule, two, clips, 0);
    expect(laid.map((slot) => slot.index)).toEqual([0, 1, 0, 1]);
    expect(laid[2]!.start).toBe(clips[1]!.compositionFrom);
  });

  it('keeps the header slots before the clips as they are', () => {
    const headed: LineSchedule[] = [
      {index: 0, start: 0, end: 0.331},
      ...schedule.map((s) => ({...s, index: s.index + 1})),
    ];
    const withHeader = [lines[0]!, ...lines];
    const laid = scheduleForClips(headed, withHeader, clipTimeline(timings, memorize({repeat: 2})), 1);
    expect(laid[0]).toEqual({index: 0, start: 0, end: 0.331});
    expect(laid[1]!.index).toBe(1);
  });
});

describe('scrollTargetPosition', () => {
  const timing = enterTiming();
  const steps = [0, 30, 45, 90];

  it('is scrollPosition() for targets 0, 1, 2…, frame by frame', () => {
    for (let frame = -5; frame <= 120; frame += 5) {
      expect(scrollTargetPosition({frame, fps: 30, steps, targets: [0, 1, 2, 3], timing})).toBeCloseTo(
        scrollPosition({frame, fps: 30, steps, timing}),
        9,
      );
    }
  });

  it('scrolls back to an earlier line for the next play, and holds on a repeated target', () => {
    const position = (frame: number) => scrollTargetPosition({frame, fps: 30, steps, targets: [0, 1, 0, 0], timing});
    expect(position(30)).toBeCloseTo(1, 9);
    expect(position(45)).toBeCloseTo(0, 9);
    expect(position(120)).toBeCloseTo(0, 9);
    const mid = position(40);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('is 0 for no targets', () => {
    expect(scrollTargetPosition({frame: 10, fps: 30, steps: [], targets: []})).toBe(0);
  });
});

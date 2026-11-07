// When the line window scrolls (render-design.md 4.3, 5.2): each step starts after the outgoing
// line's last word, late and never early, also when ayahs repeat and the recording is moved onto
// its clips.
import {type RecitationTimingsV1, scheduleLines, scrollPosition} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {windowScrollStarts} from '../../../src/compositions/recitation/scroll';
import {clipTimeline, scheduleForClips, scrollTargetPosition} from '../../../src/memorize';
import {scrollTimingFrom} from '../../../src/schema';
import fatiha from '../../fixtures/timings/fatiha.json';
import {fatihaLines} from './helpers/fatiha-lines';

const timings = fatiha as unknown as RecitationTimingsV1;
const lines = fatihaLines();
const fps = 30;
const base = {lines, timings, fps, leadInSeconds: 0.4, scrollFrames: 24, appearFrame: 0};

describe('windowScrollStarts', () => {
  it('starts each scroll at the end of the outgoing line, never while its last word is heard', () => {
    const clips = clipTimeline(timings, {mode: 'off', repeat: 1, pauseSeconds: 0});
    const steps = windowScrollStarts({...base, timeline: scheduleLines(lines, timings), clips});
    // Line 1 is in the centre slot from the window's first frame (its step a whole scroll before
    // it); then each line waits for its ayah's end: 1:2:4 is recited to 3.391 s (f101.7), so the
    // window moves from f102.
    expect(steps).toEqual([-24, 102, 171, 259, 390, 484]);
  });

  it('puts the first line in the centre slot from the frame the window appears, and nothing moves before the first step', () => {
    const clips = clipTimeline(timings, {mode: 'off', repeat: 1, pauseSeconds: 0});
    const timeline = scheduleLines(lines, timings);
    for (const appearFrame of [0, 90]) {
      const steps = windowScrollStarts({...base, timeline, clips, appearFrame});
      expect(steps[0]).toBe(appearFrame - 24);
      const timing = scrollTimingFrom('calm');
      for (const frame of [appearFrame, appearFrame + 12, steps[1]!]) {
        expect(scrollPosition({frame, fps, steps, timing, anchor: 'start'})).toBe(0);
      }
    }
  });

  it('waits for a long pause to end, settled leadInSeconds before the next word', () => {
    // Ayah 3 two seconds later: line 2 scrolls in to be settled 0.4 s before 5.533 s.
    const paused = {
      ...timings,
      ayat: timings.ayat.map((a) =>
        a.ayah < 3
          ? a
          : {
              ...a,
              start: a.start + 2,
              end: a.end + 2,
              words: a.words!.map((w) => ({...w, start: w.start + 2, end: w.end + 2})),
            },
      ),
    };
    const clips = clipTimeline(paused, {mode: 'off', repeat: 1, pauseSeconds: 0});
    const steps = windowScrollStarts({...base, timings: paused, timeline: scheduleLines(lines, paused), clips});
    expect(steps[1]).toBe(Math.round((5.533 - 0.4) * fps) - 24);
    expect(steps[1]).toBeGreaterThan(102);
  });

  it('moves the outgoing word end onto its clip when ayahs repeat, and scrolls back after the last play', () => {
    const clips = clipTimeline(timings, {mode: 'repeat', repeat: 2, pauseSeconds: 0.5});
    const timeline = scheduleForClips(scheduleLines(lines, timings), lines, clips, 0);
    // Ayah 2 plays at 0.331-3.391 and 3.891-6.951 s: its line is one slot, ending with the second play.
    expect(timeline[0]).toMatchObject({index: 0, start: 0.331, end: 6.951});
    const steps = windowScrollStarts({...base, timeline, clips});
    expect(steps[1]).toBe(Math.ceil(6.951 * fps));
    // Every scroll starts once its outgoing slot's last play has been heard, and none goes back in time.
    for (let j = 1; j < steps.length; j++) {
      expect(steps[j]).toBeGreaterThanOrEqual(steps[j - 1]!);
      expect(steps[j]).toBeGreaterThanOrEqual(Math.floor(timeline[j - 1]!.start * fps));
    }
  });
});

describe('scrollTargetPosition with anchor start', () => {
  it('starts each step at its frame, as scrollPosition does', () => {
    const timing = scrollTimingFrom();
    const steps = [0, 30, 90];
    for (let frame = 0; frame <= 130; frame += 5) {
      expect(scrollTargetPosition({frame, fps, steps, targets: [0, 1, 2], timing, anchor: 'start'})).toBeCloseTo(
        scrollPosition({frame, fps, steps, timing, anchor: 'start'}),
        9,
      );
    }
    expect(scrollTargetPosition({frame: 30, fps, steps, targets: [0, 1, 2], timing, anchor: 'start'})).toBe(0);
  });
});

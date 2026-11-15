// When a recitation's lines, translation and corner number change (render-design.md 4.3, 5.2): every
// change starts after the outgoing unit's last word, late and never early, and runs as the staggered
// dissolve; the first line appears over windowIn, the last holds and fades before the end card.
import {type RecitationTimingsV1, scheduleLines} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {
  ayahChanges,
  firstAppearance,
  linesEndFrame,
  linesPresence,
  oneLinePlan,
  recitationEndSeconds,
  shownAyahAt,
  slotEnd,
} from '../../../src/compositions/recitation';
import {clipTimeline, scheduleForClips} from '../../../src/memorize';
import {dissolve, dissolveShares, SINE, type Tempo, tempoFrames} from '../../../src/schema';
import fatiha from '../../fixtures/timings/fatiha.json';
import {fatihaLines} from './helpers/fatiha-lines';

const timings = fatiha as unknown as RecitationTimingsV1;
const lines = fatihaLines();
const fps = 30;
type Plays = Parameters<typeof clipTimeline>[1];
const off: Plays = {mode: 'off', repeat: 1, pauseSeconds: 0};

/** The fixture with every ayah from the third on `seconds` later: a long pause before each. */
const paused = (seconds: number): RecitationTimingsV1 => ({
  ...timings,
  ayat: timings.ayat.map((a, i) =>
    i === 0
      ? a
      : {
          ...a,
          start: a.start + i * seconds,
          end: a.end + i * seconds,
          words: a.words!.map((w) => ({...w, start: w.start + i * seconds, end: w.end + i * seconds})),
        },
  ),
});

/** Every recitation the boundaries are checked on: continuous, with pauses, slow, and ayahs repeated. */
const cases = (): {name: string; timings: RecitationTimingsV1; memorize: Plays; tempo: Tempo}[] => [
  {name: 'as recorded', timings, memorize: off, tempo: 'calm'},
  {name: 'with pauses', timings: paused(2), memorize: off, tempo: 'calm'},
  {name: 'slow', timings: paused(0.5), memorize: off, tempo: 'slow'},
  {name: 'repeated', timings, memorize: {mode: 'repeat', repeat: 2, pauseSeconds: 0.5}, tempo: 'calm'},
];

const inputsOf = (t: RecitationTimingsV1, memorize: Plays, leadInSeconds = 0.4) => {
  const clips = clipTimeline(t, memorize);
  const timeline = scheduleForClips(scheduleLines(lines, t), lines, clips, 0);
  return {timeline, lines, timings: t, clips, fps, leadInSeconds};
};

describe('oneLinePlan', () => {
  it.each(cases())('starts every line change at or after the outgoing line’s last word ($name)', (c) => {
    for (const motion of ['fade', 'rise', 'cut'] as const) {
      const inputs = inputsOf(c.timings, c.memorize);
      const endSeconds = recitationEndSeconds(c.timings, inputs.clips);
      const plan = oneLinePlan({...inputs, motion, tempo: c.tempo, earliest: 0, endSeconds});
      expect(plan).toHaveLength(inputs.timeline.length);
      for (let k = 1; k < plan.length; k++) {
        const outgoing = inputs.timeline[plan[k - 1]!.slot]!;
        const incoming = inputs.timeline[plan[k]!.slot]!;
        const e = slotEnd(outgoing, incoming, inputs);
        // t0, the change's start, is where the outgoing line's exit begins.
        const t0 = plan[k - 1]!.from + plan[k - 1]!.durationInFrames - plan[k - 1]!.exitFrames;
        expect([c.name, motion, k, t0 >= e * fps - 1e-6]).toEqual([c.name, motion, k, true]);
        // The incoming line comes in from inside the change, never before t0.
        expect(plan[k]!.from).toBeGreaterThanOrEqual(t0);
        if (motion === 'cut') {
          expect(plan[k]!.from).toBe(t0);
          expect(plan[k - 1]!.exitFrames).toBe(0);
        } else {
          // The staggered dissolve's shares of the change's length.
          const d = plan[k]!.from - t0 + plan[k]!.enterFrames;
          expect(dissolveShares(d)).toEqual({out: plan[k - 1]!.exitFrames, in: plan[k]!.from - t0});
          expect(d).toBeGreaterThanOrEqual(
            Math.min(tempoFrames('Dmin', c.tempo, fps), tempoFrames('lineDissolve', c.tempo, fps)),
          );
          expect(d).toBeLessThanOrEqual(tempoFrames('lineDissolve', c.tempo, fps));
        }
      }
    }
  });

  it('takes the full dissolve after a pause, settled leadInSeconds before the next first word', () => {
    const t = paused(2);
    const inputs = inputsOf(t, off);
    const plan = oneLinePlan({
      ...inputs,
      motion: 'fade',
      tempo: 'calm',
      earliest: 0,
      endSeconds: recitationEndSeconds(t, inputs.clips),
    });
    // Ayah 3 starts at 5.533 s: the 20-frame dissolve ends 0.4 s before it (f154), so t0 is f134.
    const t0 = plan[0]!.from + plan[0]!.durationInFrames - plan[0]!.exitFrames;
    expect(t0).toBe(Math.round((5.533 - 0.4) * fps) - 20);
    expect(plan[1]!.from + plan[1]!.enterFrames).toBe(Math.round((5.533 - 0.4) * fps));
  });

  it('scales the dissolve and the first appearance by the tempo', () => {
    const t = paused(3);
    const inputs = inputsOf(t, off);
    const endSeconds = recitationEndSeconds(t, inputs.clips);
    const calm = oneLinePlan({...inputs, motion: 'fade', tempo: 'calm', earliest: 0, endSeconds});
    const slow = oneLinePlan({...inputs, motion: 'fade', tempo: 'slow', earliest: 0, endSeconds});
    expect(calm[0]!.enterFrames).toBe(24);
    expect(slow[0]!.enterFrames).toBe(34);
    expect(
      calm[1]!.enterFrames + calm[1]!.from - (calm[0]!.from + calm[0]!.durationInFrames - calm[0]!.exitFrames),
    ).toBe(20);
    expect(
      slow[1]!.enterFrames + slow[1]!.from - (slow[0]!.from + slow[0]!.durationInFrames - slow[0]!.exitFrames),
    ).toBe(28);
    // The last line holds 45 frames after the last word and fades over 30 (42 slow).
    expect(calm.at(-1)!.from + calm.at(-1)!.durationInFrames).toBe(Math.ceil(endSeconds * fps) + 45 + 30);
    expect(slow.at(-1)!.exitFrames).toBe(42);
  });

  it('starts the first line at the intro card hand-off on the bundled sample after the intro delay', () => {
    const shifted: RecitationTimingsV1 = {
      ...timings,
      ayat: timings.ayat.map((a) => ({
        ...a,
        start: a.start + 3.869,
        end: a.end + 3.869,
        words: a.words!.map((w) => ({...w, start: w.start + 3.869, end: w.end + 3.869})),
      })),
    };
    const inputs = inputsOf(shifted, off);
    const endSeconds = recitationEndSeconds(shifted, inputs.clips);
    const plan = oneLinePlan({...inputs, motion: 'fade', tempo: 'calm', earliest: 80, handoff: true, endSeconds});
    expect(plan[0]!.from).toBe(80);
    expect(oneLinePlan({...inputs, motion: 'fade', tempo: 'calm', earliest: 80, endSeconds})[0]!.from).toBe(90);
  });

  it('starts the first line after the intro card, never before', () => {
    const inputs = inputsOf(timings, off);
    const plan = oneLinePlan({...inputs, motion: 'fade', tempo: 'calm', earliest: 90, endSeconds: 27.559});
    expect(plan[0]!.from).toBe(90);
    // A change never starts before the first appearance is over.
    expect(plan[0]!.durationInFrames - plan[0]!.exitFrames).toBeGreaterThanOrEqual(24);
  });
});

describe('firstAppearance / linesEndFrame / linesPresence', () => {
  it('settles the first line leadInSeconds before its start, never before the earliest frame', () => {
    expect(firstAppearance({firstStart: 4.2, leadInSeconds: 0.4, fps, entranceFrames: 24, earliest: 0})).toBe(90);
    expect(firstAppearance({firstStart: 0.331, leadInSeconds: 0.4, fps, entranceFrames: 24, earliest: 0})).toBe(0);
    expect(firstAppearance({firstStart: 9, leadInSeconds: 0.4, fps, entranceFrames: 24, earliest: 90})).toBe(234);
  });

  it('takes over from the intro card at its hand-off frame, wherever the first word is', () => {
    // The bundled sample after the intro delay (3.869 s): its own frame would be f90, the card's end;
    // the hand-off is f80 (`introHandoffFrames()` is 10 at the calm tempo).
    const after = {leadInSeconds: 0.4, fps, entranceFrames: 24, earliest: 80, handoff: true};
    expect(firstAppearance({...after, firstStart: 4.2, handoff: false})).toBe(90);
    expect(firstAppearance({...after, firstStart: 4.2})).toBe(80);
    // A recording that starts late (no delay): the lines still come in as the card goes.
    expect(firstAppearance({...after, firstStart: 9})).toBe(80);
  });

  it('ends the lines endHold and endFade after the last word', () => {
    expect(linesEndFrame(27.559, 'calm', 30)).toBe(827 + 45 + 30);
    expect(linesEndFrame(27.559, 'slow', 30)).toBe(827 + 45 + 42);
    expect(recitationEndSeconds(timings, clipTimeline(timings, off))).toBe(27.559);
  });

  it('counts the hold from the last word, not from a rosette the timings time as a word', () => {
    // The Studio's bundled timings give the last ayah's rosette an entry of its own (1:7:10, 0.8 s):
    // the ayah ends at 28.359 s, its last word at 27.559 s.
    const last = timings.ayat[timings.ayat.length - 1]!;
    const withRosette: RecitationTimingsV1 = {
      ...timings,
      ayat: [
        ...timings.ayat.slice(0, -1),
        {...last, end: 28.359, words: [...last.words!, {id: '1:7:10', start: 27.559, end: 28.359}]},
      ],
    };
    const markers = new Set(['1:7:10']);
    expect(recitationEndSeconds(withRosette, clipTimeline(withRosette, off), markers)).toBe(27.559);
    // Unnamed, the rosette is the last word.
    expect(recitationEndSeconds(withRosette, clipTimeline(withRosette, off))).toBe(28.359);
    // So the lines are gone endHold + endFade after the last word: f827 + 45 + 30.
    expect(linesEndFrame(recitationEndSeconds(withRosette, clipTimeline(withRosette, off), markers), 'calm', fps)).toBe(
      902,
    );
    // Repeated: the last word on the last clip.
    const repeat: Plays = {mode: 'repeat', repeat: 2, pauseSeconds: 0.5};
    const clips = clipTimeline(withRosette, repeat);
    const lastClip = clips[clips.length - 1]!;
    expect(recitationEndSeconds(withRosette, clips, markers)).toBeCloseTo(
      lastClip.compositionFrom + 27.559 - lastClip.audioFrom,
      9,
    );
    // Without word times, the ayah's end.
    const ayahsOnly: RecitationTimingsV1 = {
      ...withRosette,
      ayat: withRosette.ayat.map(({words: _words, ...ayah}) => ayah),
    };
    expect(recitationEndSeconds(ayahsOnly, clipTimeline(ayahsOnly, off), markers)).toBe(28.359);
  });

  it('comes in with the lines and goes with their fade', () => {
    const at = (frame: number) => linesPresence(frame, {appear: 90, windowIn: 24, end: 902, endFade: 30});
    expect(at(89)).toBe(0);
    expect(at(102)).toBeCloseTo(SINE(0.5), 4);
    expect(at(500)).toBe(1);
    expect(at(887)).toBeCloseTo(1 - SINE(0.5), 4);
    expect(at(902)).toBe(0);
  });
});

describe('ayahChanges / shownAyahAt', () => {
  it.each(cases())('changes the ayah on screen only after the outgoing ayah’s last word ($name)', (c) => {
    const clips = clipTimeline(c.timings, c.memorize);
    const changes = ayahChanges({timings: c.timings, clips, fps, leadInSeconds: 0.4, tempo: c.tempo});
    expect(changes.map((change) => change.key)).toEqual(['1:2', '1:3', '1:4', '1:5', '1:6', '1:7']);
    for (let k = 1; k < changes.length; k++) {
      // The last play of the outgoing ayah, on the composition's clock.
      const outgoing = clips.filter((clip) => `1:${clip.ayah}` === changes[k - 1]!.key).at(-1)!;
      const ayah = c.timings.ayat.find((a) => a.ayah === outgoing.ayah)!;
      const e = outgoing.compositionFrom + ayah.words!.at(-1)!.end - outgoing.audioFrom;
      expect(changes[k]!.start).toBeGreaterThanOrEqual(e * fps - 1e-6);
      expect(changes[k]!.start).toBeGreaterThanOrEqual(changes[k - 1]!.start + changes[k - 1]!.duration);
    }
  });

  it('dissolves from the outgoing ayah over the change, or over the label’s own length', () => {
    const changes = ayahChanges({timings, clips: clipTimeline(timings, off), fps, leadInSeconds: 0.4, tempo: 'calm'});
    // 1:2:4 ends at 3.391 s (f101.7): the change starts at f102 and, the pause being short, takes 10 frames.
    expect(changes[1]).toEqual({key: '1:3', start: 102, duration: 10});
    expect(shownAyahAt(changes, 0)).toEqual({key: '1:2', outgoing: null, opacity: 1});
    expect(shownAyahAt(changes, 101)).toEqual({key: '1:2', outgoing: null, opacity: 1});
    const mid = shownAyahAt(changes, 105);
    const sides = dissolve(3, 10);
    expect(mid).toEqual({key: '1:3', outgoing: {key: '1:2', opacity: sides.out}, opacity: sides.in});
    expect(shownAyahAt(changes, 112)).toEqual({key: '1:3', outgoing: null, opacity: 1});
    // The corner number: 12 frames from the same t0.
    expect(shownAyahAt(changes, 112, 12).outgoing).not.toBeNull();
    expect(shownAyahAt(changes, 114, 12).outgoing).toBeNull();
    expect(shownAyahAt([], 10)).toEqual({key: null, outgoing: null, opacity: 1});
  });
});

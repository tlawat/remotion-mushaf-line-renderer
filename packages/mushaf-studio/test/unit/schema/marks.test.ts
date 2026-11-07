// The timing model of the marks (render-design.md, section 4) on the bundled Al-Fatihah timings:
// the word spans and their anti-flicker floor, the release after an ayah, the emphasis sampled per
// frame, and the start of every change: late, never early.
import type {RecitationTimingsV1} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {
  ayahEmphasis,
  ayahSpans,
  boundaryStart,
  DURATIONS,
  hasWordTimes,
  INOUT,
  inkFill,
  outgoingEnd,
  SOFT,
  tempoFrames,
  tempoSeconds,
  wordEmphasis,
  wordSpanIndex,
  wordSpans,
  wordStartIndex,
} from '../../../src/schema';
import fatiha from '../../fixtures/timings/fatiha.json';

const timings = fatiha as unknown as RecitationTimingsV1;
const fps = 30;
const at = (frame: number) => frame / fps;
const words = timings.ayat.flatMap((ayah) => ayah.words ?? []);

describe('ayahSpans', () => {
  it('lets each ayah go 0.25 s after it ends, or when the next one starts if that is sooner', () => {
    const spans = ayahSpans(timings);
    expect(spans.map((s) => s.ayah)).toEqual([2, 3, 4, 5, 6, 7]);
    // Ayah 2 ends at 3.391 and ayah 3 starts at 3.533, sooner than 3.391 + 0.25.
    expect(spans[0]).toEqual({surah: 1, ayah: 2, start: 0.331, end: 3.391, release: 3.533});
    // Ayah 3 ends at 5.693, ayah 4 starts at 6.145: 0.25 s after the end.
    expect(spans[1]!.release).toBeCloseTo(5.943, 6);
    expect(spans[5]!.release).toBeCloseTo(27.559 + 0.25, 6);
    const paused = {
      ...timings,
      ayat: [
        {ayah: 1, start: 0, end: 2},
        {ayah: 2, start: 3, end: 4},
      ],
    };
    expect(ayahSpans(paused).map((s) => s.release)).toEqual([2.25, 4.25]);
  });
});

describe('wordSpans', () => {
  it('runs each word to the next timed word of its ayah, the last one to the release', () => {
    const spans = wordSpanIndex(wordSpans(timings));
    expect(spans.get('1:2:1')).toEqual({id: '1:2:1', surah: 1, ayah: 2, start: 0.331, end: 0.901});
    // 1:2:4 (الْعَالَمِينَ) is recited f58-f102, the last word of its ayah: its mark holds to the release.
    expect(Math.floor(spans.get('1:2:4')!.start * fps)).toBe(58);
    expect(spans.get('1:2:4')!.end).toBe(3.533);
    expect(spans.get('1:7:9')!.end).toBeCloseTo(27.809, 6);
  });

  it('drops a span under 4 frames and lets the word before it hold its end', () => {
    // Ayah 4 of the sample's own recording, its rosette timed for 0.114 s: no mark of its own.
    const withRosette = {
      ...timings,
      ayat: [
        {
          ayah: 4,
          start: 6.145,
          end: 8.729,
          words: [
            {id: '1:4:1', start: 6.145, end: 6.875},
            {id: '1:4:2', start: 6.875, end: 7.405},
            {id: '1:4:3', start: 7.405, end: 8.615},
            {id: '1:4:4', start: 8.615, end: 8.729},
          ],
        },
        {ayah: 5, start: 8.729, end: 13.166, words: [{id: '1:5:1', start: 8.729, end: 9.559}]},
      ],
    };
    const spans = wordSpanIndex(wordSpans(withRosette));
    expect(spans.has('1:4:4')).toBe(false);
    expect(spans.get('1:4:3')).toMatchObject({start: 7.405, end: 8.729});
    // Every span kept on the sample is 4 frames or more.
    for (const span of wordSpans(timings)) expect(span.end - span.start).toBeGreaterThanOrEqual(4 / 30 - 1e-9);
    // Its ink still fills: the start index keeps it.
    expect(wordStartIndex(withRosette)['1:4:4']).toBe(8.615);
    // A short first word of an ayah has nobody before it to hold its time: it is simply dropped.
    const short = {
      ...timings,
      ayat: [
        {
          ayah: 1,
          start: 0,
          end: 1,
          words: [
            {id: '1:1:1', start: 0, end: 0.1},
            {id: '1:1:2', start: 0.1, end: 1},
          ],
        },
      ],
    };
    expect(wordSpans(short).map((s) => s.id)).toEqual(['1:1:2']);
  });

  it('marks the first or the last recitation of a repeated word', () => {
    const repeated = {
      ...timings,
      ayat: [
        {
          ayah: 1,
          start: 0,
          end: 4,
          words: [
            {id: '1:1:1', start: 0, end: 1},
            {id: '1:1:2', start: 1, end: 2},
            {id: '1:1:1', start: 2, end: 3},
            {id: '1:1:3', start: 3, end: 4},
          ],
        },
      ],
    };
    expect(wordSpanIndex(wordSpans(repeated)).get('1:1:1')).toMatchObject({start: 0, end: 1});
    expect(wordSpanIndex(wordSpans(repeated, {occurrence: 'last'})).get('1:1:1')).toMatchObject({start: 2, end: 3});
    expect(wordStartIndex(repeated)['1:1:1']).toBe(0);
    expect(wordStartIndex(repeated, 'last')['1:1:1']).toBe(2);
  });

  it('is empty without per-word times, and hasWordTimes says so', () => {
    const ayahsOnly = {...timings, ayat: timings.ayat.map(({words: _words, ...ayah}) => ayah)};
    expect(wordSpans(ayahsOnly)).toEqual([]);
    expect(hasWordTimes(ayahsOnly)).toBe(false);
    expect(hasWordTimes(timings)).toBe(true);
  });
});

describe('wordEmphasis', () => {
  const spans = wordSpanIndex(wordSpans(timings));
  const span = spans.get('1:2:4')!;

  it('comes in over 5 frames on SOFT from the word start, never before it', () => {
    expect(wordEmphasis(span, at(58))).toBe(0); // 1.933 s, before 1.941
    expect(wordEmphasis(span, span.start)).toBe(0);
    expect(wordEmphasis(span, span.start + 2 / fps)).toBeCloseTo(SOFT(0.4), 6);
    expect(wordEmphasis(span, span.start + 5 / fps)).toBe(1);
    expect(wordEmphasis(span, at(80))).toBe(1);
  });

  it('lets go over 10 frames on INOUT from its end, monotonic both ways, inside 0-1', () => {
    expect(wordEmphasis(span, span.end + 5 / fps)).toBeCloseTo(1 - INOUT(0.5), 6);
    expect(wordEmphasis(span, span.end + 10 / fps)).toBe(0);
    const samples = Array.from({length: 70}, (_, i) => wordEmphasis(span, at(55 + i)));
    const peak = samples.indexOf(1);
    expect(samples.every((e) => e >= 0 && e <= 1)).toBe(true);
    expect(samples.slice(0, peak + 1).every((e, i, all) => i === 0 || e >= all[i - 1]!)).toBe(true);
    expect(samples.slice(peak).every((e, i, all) => i === 0 || e <= all[i - 1]!)).toBe(true);
  });

  it('glides: the outgoing and the incoming word are briefly both partly marked, in place', () => {
    const before = spans.get('1:2:3')!;
    const t = span.start + 2 / fps;
    expect(wordEmphasis(before, t)).toBeGreaterThan(0);
    expect(wordEmphasis(before, t)).toBeLessThan(1);
    expect(wordEmphasis(span, t)).toBeGreaterThan(0);
    expect(wordEmphasis(span, t)).toBeLessThan(1);
  });
});

describe('ayahEmphasis / inkFill', () => {
  const ayah = ayahSpans(timings)[1]!; // ayah 3: 3.533-6.145, released at 6.145

  it('marks the ayah in and out over ayahMark on INOUT, longer at the slow tempo', () => {
    expect(ayahEmphasis(ayah, ayah.start)).toBe(0);
    expect(ayahEmphasis(ayah, ayah.start + 7 / fps)).toBeCloseTo(INOUT(0.5), 6);
    expect(ayahEmphasis(ayah, ayah.start + 14 / fps)).toBe(1);
    expect(ayahEmphasis(ayah, ayah.start + 14 / fps, 'slow')).toBeCloseTo(INOUT(14 / 20), 6);
    expect(ayahEmphasis(ayah, ayah.release + 7 / fps)).toBeCloseTo(1 - INOUT(0.5), 6);
    expect(ayahEmphasis(ayah, ayah.release + 14 / fps)).toBe(0);
  });

  it('fills a word’s ink over 6 frames on SOFT and keeps it full', () => {
    expect(inkFill(2, 1.99)).toBe(0);
    expect(inkFill(2, 2 + 3 / fps)).toBeCloseTo(SOFT(0.5), 6);
    expect(inkFill(2, 2 + 6 / fps)).toBe(1);
    expect(inkFill(2, 100)).toBe(1);
  });
});

describe('boundaryStart / outgoingEnd', () => {
  it('never starts a change before the outgoing unit has been recited, at any word, kind and lead-in', () => {
    for (let i = 0; i + 1 < words.length; i++) {
      const last = words[i]!;
      const next = words[i + 1]!;
      const endsAyah = last.id.split(':')[1] !== next.id.split(':')[1];
      const E = outgoingEnd({timings, lastWordId: last.id, endsAyah, next: next.start});
      for (const kind of ['dissolve', 'scroll'] as const) {
        for (const leadInSeconds of [0, 0.4, 2]) {
          for (const tempo of ['calm', 'slow'] as const) {
            const duration = tempoFrames(kind === 'scroll' ? 'scroll' : 'lineDissolve', tempo, fps);
            const b = boundaryStart({end: E, next: next.start, fps, duration, leadInSeconds, kind, tempo});
            expect([last.id, kind, leadInSeconds, b.start / fps >= E - 1e-9]).toEqual([
              last.id,
              kind,
              leadInSeconds,
              true,
            ]);
            if (kind === 'dissolve') expect(b.duration).toBeGreaterThanOrEqual(10);
            else expect(b.duration).toBe(duration);
          }
        }
      }
    }
  });

  it('compresses a dissolve to 10 frames when the pause is short, starting at E and overlapping the first word', () => {
    // 1:2:4 ends at 3.391 (f101.7); 1:3:1 starts at 3.533 (f106): a pause of 4 frames.
    const E = outgoingEnd({timings, lastWordId: '1:2:4', endsAyah: true, next: 3.533});
    expect(E).toBe(3.391);
    expect(boundaryStart({end: E, next: 3.533, fps, duration: 20, leadInSeconds: 0.4})).toEqual({
      start: 102,
      duration: 10,
    });
    // Continuous recitation: no pause at all, the same floor.
    expect(boundaryStart({end: 2, next: 2, fps, duration: 28, leadInSeconds: 0.4})).toEqual({start: 60, duration: 10});
  });

  it('settles the incoming unit leadInSeconds before its first word when the pause allows it', () => {
    expect(boundaryStart({end: 1, next: 5, fps, duration: 20, leadInSeconds: 0.4})).toEqual({start: 118, duration: 20});
    // A pause shorter than the dissolve: it takes the pause, from the end of the word.
    expect(boundaryStart({end: 1, next: 1.5, fps, duration: 20, leadInSeconds: 0.4})).toEqual({
      start: 30,
      duration: 15,
    });
    // The scroll keeps its length, and may overlap the incoming word.
    expect(boundaryStart({end: 1, next: 1.5, fps, duration: 24, leadInSeconds: 0.4, kind: 'scroll'})).toEqual({
      start: 30,
      duration: 24,
    });
  });

  it('takes the word end, else the ayah end at an ayah end, else the next timed word, else F', () => {
    expect(outgoingEnd({timings, lastWordId: '1:2:3', endsAyah: false, next: 9})).toBe(1.941);
    const gappy = {
      ...timings,
      ayat: [
        {
          ayah: 1,
          start: 0,
          end: 4,
          words: [
            {id: '1:1:1', start: 0, end: 1},
            {id: '1:1:3', start: 2, end: 3},
          ],
        },
      ],
    };
    expect(outgoingEnd({timings: gappy, lastWordId: '1:1:2', endsAyah: false, next: 9})).toBe(2);
    expect(outgoingEnd({timings: gappy, lastWordId: '1:1:4', endsAyah: true, next: 9})).toBe(4);
    const ayahsOnly = {...timings, ayat: timings.ayat.map(({words: _words, ...ayah}) => ayah)};
    expect(outgoingEnd({timings: ayahsOnly, lastWordId: '1:2:2', endsAyah: false, next: 2.2})).toBe(2.2);
    expect(outgoingEnd({timings: ayahsOnly, lastWordId: '1:2:5', endsAyah: true, next: 3.6})).toBe(3.391);
  });
});

describe('tempoFrames / tempoSeconds', () => {
  it('reads the durations table, the starred rows 1.4× slower and the word marks never', () => {
    expect(tempoFrames('lineDissolve')).toBe(20);
    expect(tempoFrames('lineDissolve', 'slow')).toBe(28);
    expect(tempoFrames('scroll', 'slow')).toBe(34);
    expect(tempoFrames('cardOut', 'slow')).toBe(30);
    for (const token of ['markIn', 'markOut', 'inkFill'] as const)
      expect(tempoFrames(token, 'slow')).toBe(tempoFrames(token, 'calm'));
    for (const frames of Object.values(DURATIONS)) expect(frames.slow).toBeGreaterThanOrEqual(frames.calm);
  });

  it('converts to another frame rate by seconds, never under one frame', () => {
    expect(tempoFrames('scroll', 'calm', 60)).toBe(48);
    expect(tempoFrames('glossOut', 'calm', 24)).toBe(2);
    expect(tempoFrames('glossOut', 'calm', 1)).toBe(1);
    expect(tempoSeconds('cardIn', 'slow')).toBeCloseTo(1.133, 3);
  });
});

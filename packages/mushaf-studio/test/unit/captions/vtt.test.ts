import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {type Caption, type CaptionCue, captionsToVtt, toCaptionCues, toCaptions} from '../../../src/captions';
import {type QudAlignResponse, type QudTimestampsResponse, timingsFromQud} from '../../../src/qud';
import type {StudioTimings} from '../../../src/types';

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(path.resolve(__dirname, '../../fixtures/qud', name), 'utf8')) as T;

// Al-Fatihah 2-7 as the aligner heard it: Uthmani texts, and an ayah-end marker after each ayah.
const qud = timingsFromQud({
  align: fixture<QudAlignResponse>('align-response.json'),
  timestamps: fixture<QudTimestampsResponse>('timestamps-response.json'),
});

const caption = (text: string, startMs: number, endMs: number): Caption => ({
  text,
  startMs,
  endMs,
  timestampMs: startMs,
  confidence: null,
});
const cue = (text: string, startMs: number, endMs: number, ayah: number, id = `1:${ayah}:1`): CaptionCue => ({
  caption: caption(text, startMs, endMs),
  id,
  surah: 1,
  ayah,
});

/** The cues of a VTT file: its blocks after the header. */
const blocks = (vtt: string): string[] => vtt.split('\n\n').slice(1, -1);

describe('toCaptionCues', () => {
  it('gives the captions of toCaptions() with their word ids, surah and ayah', () => {
    for (const markers of [false, true]) {
      const cues = toCaptionCues(qud, {markers});
      expect(cues.map((c) => c.caption)).toEqual(toCaptions(qud, {markers}));
      expect(cues[0]).toMatchObject({id: '1:2:1', surah: 1, ayah: 2});
      expect(cues.at(-1)!.ayah).toBe(7);
    }
    // The marker is captioned under its own id.
    const marker = toCaptionCues(qud, {markers: true}).find((c) => c.caption.text.includes('۝'))!;
    expect(marker).toMatchObject({id: '1:2:5', ayah: 2});
  });

  it('names an ayah timed without words by its key', () => {
    const timings: StudioTimings = {version: 1, surah: 112, ayat: [{ayah: 3, start: 1, end: 2}]};
    expect(toCaptionCues(timings)).toEqual([
      {
        caption: {text: '112:3', startMs: 1000, endMs: 2000, timestampMs: 1000, confidence: null},
        id: '112:3',
        surah: 112,
        ayah: 3,
      },
    ]);
  });
});

describe('captionsToVtt', () => {
  it('writes the header and HH:MM:SS.mmm cues, hours past 99 in more digits', () => {
    expect(
      captionsToVtt([
        caption('ٱلْحَمْدُ', 0, 59_999),
        caption(' لِلَّهِ', 60_000, 3_599_999),
        caption(' ۝٧', 3_723_004, 363_600_000),
      ]),
    ).toBe(
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:59.999',
        'ٱلْحَمْدُ',
        '',
        '00:01:00.000 --> 00:59:59.999',
        'لِلَّهِ',
        '',
        '01:02:03.004 --> 101:00:00.000',
        '۝٧',
        '',
        '',
      ].join('\n'),
    );
  });

  it('is the header alone for no captions', () => {
    expect(captionsToVtt([])).toBe('WEBVTT\n\n');
    expect(captionsToVtt([], {lines: 'ayah'})).toBe('WEBVTT\n\n');
  });

  it('rounds to the millisecond and clamps below 0', () => {
    expect(blocks(captionsToVtt([caption('a', -5, 1499.6)]))).toEqual(['00:00:00.000 --> 00:00:01.500\na']);
  });

  it('escapes &, < and >, so no text opens a tag or ends the cue with -->', () => {
    expect(blocks(captionsToVtt([caption('a < b && c --> d', 0, 1)]))).toEqual([
      '00:00:00.000 --> 00:00:00.001\na &lt; b &amp;&amp; c --&gt; d',
    ]);
  });

  it("drops a caption's blank lines and trims each line", () => {
    expect(blocks(captionsToVtt([caption(' a \r\n\n  b ', 0, 1)]))).toEqual(['00:00:00.000 --> 00:00:00.001\na\nb']);
  });

  it('merges each ayah into one cue under lines: ayah, from its first word to its last', () => {
    const vtt = captionsToVtt(
      [
        cue('ٱلْحَمْدُ', 320, 890, 2),
        cue(' لِلَّهِ', 890, 1500, 2),
        cue(' رَبِّ', 1450, 1400, 2),
        cue(' ٱلرَّحْمَٰنِ', 3533, 4200, 3),
        // The reciter goes back to ayah 2: a cue of its own, in audio order.
        cue(' رَبِّ', 5000, 5600, 2),
      ],
      {lines: 'ayah'},
    );
    expect(blocks(vtt)).toEqual([
      '00:00:00.320 --> 00:00:01.500\nٱلْحَمْدُ لِلَّهِ رَبِّ',
      '00:00:03.533 --> 00:00:04.200\nٱلرَّحْمَٰنِ',
      '00:00:05.000 --> 00:00:05.600\nرَبِّ',
    ]);
  });

  it('merges the fixture into one cue per ayah, markers included when the cues carry them', () => {
    const cues = toCaptionCues(qud, {markers: true});
    const ayat = blocks(captionsToVtt(cues, {lines: 'ayah'}));
    expect(ayat).toHaveLength(6);
    const ayah2 = cues.filter((c) => c.ayah === 2).map((c) => c.caption);
    const [times, text] = ayat[0]!.split('\n');
    const seconds = (ms: number) => `00:00:${(ms / 1000).toFixed(3).padStart(6, '0')}`;
    expect(times).toBe(`${seconds(ayah2[0]!.startMs)} --> ${seconds(Math.max(...ayah2.map((c) => c.endMs)))}`);
    expect(text!.endsWith('۝٢')).toBe(true);
    expect(text!.split(' ')).toHaveLength(5);
  });

  it('refuses lines: ayah on plain captions, which do not say their ayah', () => {
    expect(() => captionsToVtt([caption('a', 0, 1)] as never, {lines: 'ayah'})).toThrow(
      expect.objectContaining({code: 'BAD_STUDIO_PROP', message: expect.stringMatching(/toCaptionCues/)}),
    );
  });

  it('adds the align and line settings to every cue', () => {
    expect(blocks(captionsToVtt([caption('ٱلْحَمْدُ', 0, 1)], {align: 'start', line: -2}))).toEqual([
      '00:00:00.000 --> 00:00:00.001 align:start line:-2\nٱلْحَمْدُ',
    ]);
    expect(blocks(captionsToVtt([cue('a', 0, 1, 2)], {align: 'right', line: '90%'}))).toEqual([
      '00:00:00.000 --> 00:00:00.001 align:right line:90%\na',
    ]);
    for (const line of [1.5, '90', 'x%'] as const)
      expect(() => captionsToVtt([caption('a', 0, 1)], {line: line as never})).toThrow(
        expect.objectContaining({code: 'BAD_STUDIO_PROP'}),
      );
  });

  it('refuses a time that is not a finite number, naming the caption', () => {
    expect(() => captionsToVtt([caption('a', 0, 1), caption('b', Number.NaN, 2)])).toThrow(
      expect.objectContaining({code: 'BAD_TIMING_EDIT', details: {index: 1}}),
    );
  });
});

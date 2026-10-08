import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {attributionLines, FONTS_ATTRIBUTION, QUD_ATTRIBUTION, youtubeDescription} from '../../../src/export';
import {
  type QudAlignResponse,
  type QudChapterSegments,
  type QudTimestampsResponse,
  timingsFromCatalogue,
  timingsFromQud,
} from '../../../src/qud';
import type {StudioTimings} from '../../../src/types';

const read = <T>(...parts: string[]): T =>
  JSON.parse(readFileSync(path.resolve(__dirname, '../../fixtures', ...parts), 'utf8')) as T;

const plain = read<StudioTimings>('timings', 'fatiha.json');
const qud = timingsFromQud({
  align: read<QudAlignResponse>('qud', 'align-response.json'),
  timestamps: read<QudTimestampsResponse>('qud', 'timestamps-response.json'),
});
const catalogue = timingsFromCatalogue(read<QudChapterSegments>('qud', 'chapter-1-segments.json'));
const manual: StudioTimings = {...plain, alignment: {version: 1, source: 'manual', segments: [], words: [], edits: []}};

describe('attributionLines', () => {
  it('credits the fonts always, and QUD only when the timings came from it', () => {
    expect(attributionLines({timings: plain})).toEqual([FONTS_ATTRIBUTION]);
    expect(attributionLines({timings: manual})).toEqual([FONTS_ATTRIBUTION]);
    expect(attributionLines({timings: qud})).toEqual([FONTS_ATTRIBUTION, QUD_ATTRIBUTION]);
    expect(attributionLines({timings: catalogue})).toEqual([FONTS_ATTRIBUTION, QUD_ATTRIBUTION]);
    expect(QUD_ATTRIBUTION).toBe('Timings: QUD Universal Aligner (aligner.qud.dev), CC-BY-4.0');
    expect(FONTS_ATTRIBUTION).toMatch(/KFGQPC.*QUL/);
  });

  it('names the translation and its source when one is given', () => {
    expect(attributionLines({timings: plain, translationName: ' Saheeh International '}).at(-1)).toBe(
      'Translation: Saheeh International (quran.com)',
    );
    expect(attributionLines({timings: plain, translationName: 'Hilali-Khan', translationSource: 'QUL'}).at(-1)).toBe(
      'Translation: Hilali-Khan (QUL)',
    );
    expect(attributionLines({timings: plain, translationName: ''})).toEqual([FONTS_ATTRIBUTION]);
  });
});

describe('youtubeDescription', () => {
  it('writes the title, the chapters and the credits, a blank line between them', () => {
    const chapters = ['0:00 Al-Fatihah 1:2–5', '0:13 Al-Fatihah 1:6', '0:25 Al-Fatihah 1:7'];
    expect(
      youtubeDescription({
        timings: qud,
        surahName: 'Al-Fatihah',
        reciter: 'Mishary Alafasy',
        translationName: 'Saheeh International',
        chapters,
      }),
    ).toBe(
      [
        'Al-Fatihah 1:2–7, recited by Mishary Alafasy',
        '',
        'Chapters',
        ...chapters,
        '',
        'Credits',
        FONTS_ATTRIBUTION,
        QUD_ATTRIBUTION,
        'Translation: Saheeh International (quran.com)',
        '',
      ].join('\n'),
    );
  });

  it('leaves out the reciter and the chapters when there are none', () => {
    expect(youtubeDescription({timings: plain, surahName: 'Al-Fatihah', reciter: ' ', chapters: []})).toBe(
      `Al-Fatihah 1:2–7\n\nCredits\n${FONTS_ATTRIBUTION}\n`,
    );
  });

  it('writes one ayah alone, and no range for timings without ayahs', () => {
    const one: StudioTimings = {version: 1, surah: 2, ayat: [{ayah: 255, start: 0, end: 30}]};
    expect(youtubeDescription({timings: one, surahName: 'Al-Baqarah', reciter: '', chapters: []})).toMatch(
      /^Al-Baqarah 2:255\n/,
    );
    expect(
      youtubeDescription({
        timings: {version: 1, surah: 2, ayat: []},
        surahName: 'Al-Baqarah',
        reciter: '',
        chapters: [],
      }),
    ).toMatch(/^Al-Baqarah\n/);
  });
});

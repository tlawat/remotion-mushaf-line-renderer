// The surah's header lines before ayah 1 (`header`), in both resolvers, with the package's line
// resolver mocked on the synthetic mushaf: page 1 opens surah 1 with its name and no basmalah line,
// page 2 opens surah 2 with its name and basmalah; surah 9 is a page with a name and no basmalah.
import type {GetMushafLinesOptions, MushafLineData} from '@tlawat/remotion-mushaf-line';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {syntheticLine} from '../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import fatiha from '../../fixtures/timings/fatiha.json';
import {fatihaLines} from './helpers/fatiha-lines';

const mocks = vi.hoisted(() => ({getMushafLines: vi.fn(), loadTranslation: vi.fn()}));

vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  getMushafLines: (options: unknown) => mocks.getMushafLines(options),
}));
vi.mock('../../../src/translations', () => ({
  loadTranslation: (...args: unknown[]) => mocks.loadTranslation(...args),
  ayahKeyOf: () => null,
  TranslationBlock: () => null,
  GlossStrip: () => null,
}));

const {defaultMushafRecitationProps, resolveRecitation} = await import('../../../src/compositions/recitation');
const {calculateMushafPassageMetadata, defaultMushafPassageProps, passageTimeline, resolvePassage} = await import(
  '../../../src/compositions/passage'
);
const {headerCount, leadFrames, surahHeaderLines, withHeaderSlots} = await import('../../../src/compositions/shared');
const {defaultOverlay} = await import('../../../src/schema');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;
type MushafPassageProps = import('../../../src/compositions/passage').MushafPassageProps;

const staticFile = (path: string) => `/static/${path}`;
const fetchJson = (body: unknown) =>
  vi.fn(async () => ({ok: true, status: 200, json: async () => body})) as unknown as typeof fetch;
const types = (lines: readonly MushafLineData[]) => lines.map((l) => l.type);
const nonDecreasing = (values: readonly number[]) => values.every((v, i) => i === 0 || v >= values[i - 1]!);
const pageCalls = () =>
  mocks.getMushafLines.mock.calls.map((c) => c[0] as GetMushafLinesOptions).filter((o) => o.page !== undefined);

// Surah 1 from ayah 1: ayah 1 (synthetic p1 l2) at 4-6.5 s, then the fixture's ayahs 2-7 seven seconds later.
const shift = (s: number) => Math.round((s + 7) * 1000) / 1000;
const fromAyah1 = (ayah1Start = 4) => ({
  version: 1,
  surah: 1,
  ayat: [
    {ayah: 1, start: ayah1Start, end: 6.5},
    ...fatiha.ayat.map((a) => ({
      ...a,
      start: shift(a.start),
      end: shift(a.end),
      words: a.words.map((w) => ({...w, start: shift(w.start), end: shift(w.end)})),
    })),
  ],
});
const ayah1Line = syntheticLine(1, 2);
const page1 = [syntheticLine(1, 1), ayah1Line, ...fatihaLines()];
const page2 = [syntheticLine(2, 1), syntheticLine(2, 2), syntheticLine(2, 3), syntheticLine(2, 4)];
const surah2 = [syntheticLine(2, 3), syntheticLine(2, 4), syntheticLine(3, 1)];

const recitation = (changes: Partial<MushafRecitationProps> = {}): MushafRecitationProps => ({
  ...defaultMushafRecitationProps,
  ...changes,
});
const passage = (changes: Partial<MushafPassageProps> = {}): MushafPassageProps => ({
  ...defaultMushafPassageProps,
  surah: 2,
  fromAyah: 1,
  toAyah: 3,
  ...changes,
});

beforeEach(() => {
  mocks.getMushafLines.mockReset();
  mocks.getMushafLines.mockImplementation(async (options: GetMushafLinesOptions) => {
    if (options.page === 1) return page1;
    if (options.page === 2) return page2;
    if (options.surah === 1) {
      const from = options.fromAyah ?? 1;
      return [...(from === 1 ? [ayah1Line] : []), ...fatihaLines(Math.max(2, from), options.toAyah ?? 7)];
    }
    return surah2;
  });
  mocks.loadTranslation.mockReset();
});

describe('surahHeaderLines', () => {
  const options = {theme: 'normal' as const, data: undefined};

  it('takes the name, and the basmalah line after it when asked and printed, from the page of the first line', async () => {
    expect(types(await surahHeaderLines(2, surah2[0]!, 'name', options))).toEqual(['surah_name']);
    expect(types(await surahHeaderLines(2, surah2[0]!, 'name-basmalah', options))).toEqual(['surah_name', 'basmallah']);
    expect(pageCalls()).toEqual([
      {page: 2, theme: 'normal', data: undefined},
      {page: 2, theme: 'normal', data: undefined},
    ]);
  });

  it('gives Al-Fatihah its name alone: its basmalah is ayah 1, a line of its own', async () => {
    const lines = await surahHeaderLines(1, ayah1Line, 'name-basmalah', options);
    expect(lines).toEqual([syntheticLine(1, 1)]);
  });

  it('gives At-Tawbah its name alone: it has no basmalah', async () => {
    mocks.getMushafLines.mockResolvedValueOnce([
      syntheticLine(2, 1, {surahNumber: 9}),
      syntheticLine(2, 3),
      syntheticLine(2, 4),
    ]);
    const lines = await surahHeaderLines(9, surah2[0]!, 'name-basmalah', options);
    expect(types(lines)).toEqual(['surah_name']);
    expect(lines[0]!.surahNumber).toBe(9);
  });

  it('asks for nothing under none, and finds nothing when the page carries another surah’s header', async () => {
    expect(await surahHeaderLines(2, surah2[0]!, 'none', options)).toEqual([]);
    expect(mocks.getMushafLines).not.toHaveBeenCalled();
    expect(await surahHeaderLines(9, surah2[0]!, 'name', options)).toEqual([]);
  });
});

describe('withHeaderSlots and headerCount', () => {
  const schedule = [
    {index: 0, start: 4, end: 7},
    {index: 1, start: 7, end: 9},
  ];

  it('puts the headers spacingSeconds apart before the first slot and moves the slots past them', () => {
    expect(withHeaderSlots(schedule, 2, 1.5)).toEqual([
      {index: 0, start: 1, end: 2.5},
      {index: 1, start: 2.5, end: 4},
      {index: 2, start: 4, end: 7},
      {index: 3, start: 7, end: 9},
    ]);
  });

  it('never starts a header before 0, keeping the starts from decreasing', () => {
    const slots = withHeaderSlots([{index: 0, start: 0.3, end: 2}], 2, 1.5);
    expect(slots.map((s) => s.start)).toEqual([0, 0, 0.3]);
    expect(nonDecreasing(slots.map((s) => s.start))).toBe(true);
    expect(nonDecreasing(leadFrames(slots, 0.4, 30))).toBe(true);
  });

  it('keeps the schedule itself without headers, or without a slot to put them before', () => {
    expect(withHeaderSlots(schedule, 0, 1.5)).toBe(schedule);
    expect(withHeaderSlots([], 2, 1.5)).toEqual([]);
  });

  it('counts the lines before the first ayah line', () => {
    expect(headerCount(page2)).toBe(2);
    expect(headerCount(surah2)).toBe(0);
    expect(headerCount([])).toBe(0);
  });
});

describe('resolveRecitation with header', () => {
  it('prepends the name before ayah 1 and schedules it 1.5 s before the first line without an intro', async () => {
    const resolved = await resolveRecitation(recitation({header: 'name-basmalah'}), {
      fetch: fetchJson(fromAyah1()),
      staticFile,
    });
    expect(pageCalls()).toEqual([
      {
        page: 1,
        theme: 'plain',
        data: {words: '/static/data/qpc-v4/words.json.zip', layout: '/static/data/qpc-v4/layout.db.zip'},
      },
    ]);
    expect(types(resolved.lines)).toEqual(['surah_name', 'ayah', 'ayah', 'ayah', 'ayah', 'ayah', 'ayah', 'ayah']);
    expect(resolved.schedule.slice(0, 3)).toEqual([
      {index: 0, start: 2.5, end: 4},
      {index: 1, start: 4, end: 7.331},
      {index: 2, start: 7.331, end: 10.533},
    ]);
    expect(resolved.schedule.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(nonDecreasing(resolved.schedule.map((s) => s.start))).toBe(true);
  });

  it('spaces the headers by introSeconds when the intro card is on, never before 0', async () => {
    const intro = {...defaultOverlay, title: 'intro' as const, introSeconds: 3};
    const resolved = await resolveRecitation(recitation({header: 'name', overlay: intro}), {
      fetch: fetchJson(fromAyah1()),
      staticFile,
    });
    expect(resolved.schedule[0]).toEqual({index: 0, start: 1, end: 4});
    const early = await resolveRecitation(recitation({header: 'name', overlay: intro}), {
      fetch: fetchJson(fromAyah1(0.5)),
      staticFile,
    });
    expect(early.schedule[0]).toEqual({index: 0, start: 0, end: 0.5});
    expect(nonDecreasing(leadFrames(early.schedule, 0.4, 30))).toBe(true);
  });

  it('adds nothing when the recitation starts after ayah 1, or under none', async () => {
    const later = await resolveRecitation(recitation({header: 'name-basmalah', fromAyah: 2}), {
      fetch: fetchJson(fromAyah1()),
      staticFile,
    });
    expect(types(later.lines)).not.toContain('surah_name');
    const sample = await resolveRecitation(recitation({header: 'name'}), {fetch: fetchJson(fatiha), staticFile});
    expect(sample.lines).toHaveLength(6);
    const none = await resolveRecitation(recitation(), {fetch: fetchJson(fromAyah1()), staticFile});
    expect(none.schedule[0]).toEqual({index: 0, start: 4, end: 7.331});
    expect(pageCalls()).toEqual([]);
  });
});

describe('resolvePassage with header', () => {
  it('prepends the name and the basmalah when the passage starts at ayah 1', async () => {
    const resolved = await resolvePassage(passage({header: 'name-basmalah'}), {staticFile});
    expect(types(resolved.lines)).toEqual(['surah_name', 'basmallah', 'ayah', 'ayah', 'ayah']);
    expect(pageCalls()).toHaveLength(1);
    expect(pageCalls()[0]).toMatchObject({page: 2, theme: 'normal'});
    const named = await resolvePassage(passage({header: 'name'}), {staticFile});
    expect(types(named.lines)).toEqual(['surah_name', 'ayah', 'ayah', 'ayah']);
  });

  it('prepends the name alone for At-Tawbah', async () => {
    mocks.getMushafLines.mockImplementation(async (options: GetMushafLinesOptions) =>
      options.page === 2 ? [syntheticLine(2, 1, {surahNumber: 9}), syntheticLine(2, 3)] : surah2,
    );
    const resolved = await resolvePassage(passage({surah: 9, header: 'name-basmalah'}), {staticFile});
    expect(types(resolved.lines)).toEqual(['surah_name', 'ayah', 'ayah', 'ayah']);
    expect(resolved.lines[0]!.surahNumber).toBe(9);
  });

  it('adds nothing from a later ayah, and asks for no page', async () => {
    const resolved = await resolvePassage(passage({header: 'name-basmalah', fromAyah: 2}), {staticFile});
    expect(resolved.lines).toEqual(surah2);
    expect(pageCalls()).toEqual([]);
  });

  it('holds each header line headerSeconds and starts after the intro card, the duration following', async () => {
    const lines = [...page2.slice(0, 2), ...surah2];
    expect(passageTimeline(lines, passage(), 30)).toEqual({
      starts: [0, 45, 90, 210, 330],
      holds: [45, 45, 120, 120, 120],
      end: 450,
    });
    const intro = {...defaultOverlay, title: 'both' as const, introSeconds: 2};
    expect(passageTimeline(lines, passage({overlay: intro}), 30)).toEqual({
      starts: [60, 120, 180, 300, 420],
      holds: [60, 60, 120, 120, 120],
      end: 540,
    });
    const metadata = await calculateMushafPassageMetadata({
      props: passage({header: 'name-basmalah'}),
      defaultProps: passage(),
      abortSignal: new AbortController().signal,
      compositionId: 'MushafPassage',
      isRendering: false,
    });
    expect(metadata.durationInFrames).toBe(450 + 10);
  });
});

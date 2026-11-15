// @vitest-environment jsdom
// The end card under jsdom with `remotion` mocked: `<Sequence>` renders its props as data
// attributes, and `useCurrentFrame()` returns the frame set here (the frame inside the sequence).
import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const clock = {frame: 0};
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  useCurrentFrame: () => clock.frame,
  useVideoConfig: () => ({fps: 30, width: 1080, height: 1920, durationInFrames: 900}),
  Sequence: (props: {from: number; durationInFrames: number; name: string; children: React.ReactNode}) => (
    <div data-sequence={props.name} data-from={props.from} data-duration={props.durationInFrames}>
      {props.children}
    </div>
  ),
}));

vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  MushafSurahName: (props: {surah: number; framed?: boolean; fontSize?: number}) => (
    <span data-surah-name={props.surah} data-framed={String(props.framed)} data-font-size={props.fontSize} />
  ),
}));

const {DEFAULT_TEXT_CREDIT, EndCard, endCardContentOpacity, endCardCreditLine, endCardOpacity} = await import(
  '../../../src/content'
);
const {SINE, SOFT} = await import('../../../src/schema');
type Tafsir = import('../../../src/content').Tafsir;
type ChapterInfo = import('../../../src/content').ChapterInfo;

afterEach(() => {
  cleanup();
  clock.frame = 0;
});

const TAFSIR: Tafsir = {
  kind: 'tafsir',
  meta: {id: 'quran.com-tafsir:169', name: 'Ibn Kathir (Abridged)', language: 'en', source: 'quran.com'},
  entries: [{from: '1:1', to: '1:1', paragraphs: ['Introduction to Fatihah']}],
};

const INFO: ChapterInfo = {
  kind: 'chapter-info',
  meta: {id: 'quran.com-chapter-info:1', name: 'Maududi', language: 'en', source: 'quran.com'},
  surah: 1,
  nameSimple: 'Al-Fatihah',
  nameArabic: 'الفاتحة',
  translatedName: 'The Opener',
  revelationPlace: 'makkah',
  revelationOrder: 5,
  ayahCount: 7,
  shortText: 'A preface.',
  paragraphs: [],
};

const card = (props: Partial<React.ComponentProps<typeof EndCard>> = {}) =>
  render(
    <EndCard
      surah={1}
      fromAyah={1}
      toAyah={7}
      from={600}
      durationInFrames={90}
      fontFamily="Lora"
      fontSize={80}
      color="rgb(1, 2, 3)"
      background="rgb(250, 245, 230)"
      {...props}
    />,
  ).container;

const part = (el: Element, name: string) => el.querySelector<HTMLElement>(`[data-mushaf-end-card-part="${name}"]`);

describe('endCardCreditLine', () => {
  it('credits the text always, the timings and the translation when there are some', () => {
    expect(endCardCreditLine({timings: 'qud', translation: 'Saheeh International'})).toBe(
      'Text: King Fahd Complex fonts via QUL · Timings: QUD (CC-BY-4.0) · Translation: Saheeh International',
    );
    expect(endCardCreditLine()).toBe(`Text: ${DEFAULT_TEXT_CREDIT}`);
    expect(endCardCreditLine({timings: null, translation: null})).toBe('Text: King Fahd Complex fonts via QUL');
    expect(endCardCreditLine({timings: 'QUD'})).toBe(
      'Text: King Fahd Complex fonts via QUL · Timings: QUD (CC-BY-4.0)',
    );
    expect(endCardCreditLine({text: 'Uthmani Hafs via QUL', timings: 'manual', translation: '  '})).toBe(
      'Text: Uthmani Hafs via QUL · Timings: manual',
    );
  });
});

describe('endCardOpacity', () => {
  it('fades in linearly over fadeInSeconds, then holds', () => {
    expect([0, 9, 18, 30].map((f) => endCardOpacity(f, 30, 0.6))).toEqual([0, 0.5, 1, 1]);
    expect(endCardOpacity(-3, 30, 0.6)).toBe(0);
    expect(endCardOpacity(0, 30, 0)).toBe(1);
  });
});

describe('EndCard', () => {
  it('lives in its own named Sequence and shows the surah, the range, the reciter and the credits', () => {
    const c = card({reciter: ' Mishary Alafasy ', credits: {timings: 'qud', translation: 'Saheeh International'}});
    const sequence = c.querySelector<HTMLElement>('[data-sequence]')!;
    expect(sequence.dataset.sequence).toBe('End card');
    expect(sequence.dataset.from).toBe('600');
    expect(sequence.dataset.duration).toBe('90');
    const root = c.querySelector<HTMLElement>('[data-mushaf-end-card]')!;
    expect(root.style.background).toBe('rgb(250, 245, 230)');
    expect(root.style.color).toBe('rgb(1, 2, 3)');
    expect(part(c, 'title')!.textContent).toBe('Al-Fatihah الفاتحة');
    expect(part(c, 'title')!.querySelector('[lang="ar"]')!.getAttribute('dir')).toBe('rtl');
    expect(part(c, 'range')!.textContent).toBe('1:1–7');
    expect(part(c, 'reciter')!.textContent).toBe('Mishary Alafasy');
    expect(part(c, 'credits')!.textContent).toBe(
      'Text: King Fahd Complex fonts via QUL · Timings: QUD (CC-BY-4.0) · Translation: Saheeh International',
    );
    expect(c.querySelector('.mushaf-tafsir-card')).toBeNull();
    expect(c.querySelector('.mushaf-chapter-card')).toBeNull();
  });

  it('fades in over its own frames', () => {
    clock.frame = 0;
    expect(card().querySelector<HTMLElement>('[data-mushaf-end-card]')!.style.opacity).toBe('0');
    cleanup();
    clock.frame = 9;
    expect(card().querySelector<HTMLElement>('[data-mushaf-end-card]')!.style.opacity).toBe('0.5');
    cleanup();
    clock.frame = 9;
    expect(card({fadeInSeconds: 0}).querySelector<HTMLElement>('[data-mushaf-end-card]')!.style.opacity).toBe('1');
  });

  it('adds a tafsir card and a chapter card when given, and no reciter line when empty', () => {
    const c = card({reciter: '', tafsir: {tafsir: TAFSIR, ayahKey: '1:1', maxLines: 2}, chapterInfo: INFO});
    expect(part(c, 'reciter')).toBeNull();
    const tafsir = c.querySelector<HTMLElement>('.mushaf-tafsir-card')!;
    expect(tafsir.textContent).toContain('Introduction to Fatihah');
    expect(tafsir.querySelector<HTMLElement>('[data-mushaf-card-part="text"]')!.style.maxHeight).toBe(
      `${2 * 40 * 1.4}px`,
    );
    expect(c.querySelector('.mushaf-chapter-card')!.textContent).toContain('The Opener');
    // The tafsir card comes first.
    const cards = [...c.querySelectorAll('.mushaf-tafsir-card, .mushaf-chapter-card')].map((e) => e.className);
    expect(cards).toEqual(['mushaf-tafsir-card', 'mushaf-chapter-card']);
  });
});

describe('EndCard with glyph (render-design.md 5.9)', () => {
  const glyph = {measure: 900, glyphSize: 52, lineHeight: 114, metal: '#b8913a'};
  const designed = (props: Partial<React.ComponentProps<typeof EndCard>> = {}) =>
    card({glyph, durationInFrames: 150, reciter: 'Abdul Hamid Ghraio', creditLines: ['A', 'B'], ...props});

  it('dissolves its content in over 30 frames on SOFT, holds, and goes to the ground over its last second', () => {
    expect(endCardContentOpacity(0, 30, 150)).toBe(0);
    expect(endCardContentOpacity(15, 30, 150)).toBeCloseTo(SOFT(0.5), 4);
    expect(endCardContentOpacity(30, 30, 150)).toBe(1);
    expect(endCardContentOpacity(119, 30, 150)).toBe(1);
    expect(endCardContentOpacity(135, 30, 150)).toBeCloseTo(1 - SINE(0.5), 4);
    expect(endCardContentOpacity(150, 30, 150)).toBe(0);
    clock.frame = 15;
    expect(part(designed(), 'content')!.style.opacity).toBe(String(Math.round(SOFT(0.5) * 10_000) / 10_000));
  });

  it('is titled once by the framed surah name at 30 % of the measure, with the hairline and its lozenge', () => {
    clock.frame = 60;
    const c = designed({chapterInfo: INFO});
    const titles = c.querySelectorAll('[data-mushaf-end-card-part="title"]');
    expect(titles).toHaveLength(1);
    expect((titles[0] as HTMLElement).style.width).toBe('270px');
    expect(c.querySelector<HTMLElement>('[data-surah-name]')!.dataset).toMatchObject({surahName: '1', framed: 'true'});
    expect(part(c, 'rule')!.style.width).toBe('162px');
    // The chapter card under it does not name the surah again.
    expect(c.querySelector('[data-mushaf-card-part="names"]')).toBeNull();
    expect(c.querySelector('[data-mushaf-card-part="translated"]')!.textContent).toBe('The Opener');
  });

  it('sets the range and credits in small caps, the reciter in italic, on the ground', () => {
    clock.frame = 60;
    const c = designed();
    // Small caps without the macrons: the font sets a capital Ā's macron beside its letter.
    expect(part(c, 'range')!.textContent).toBe('Al-Fatihah · Ayat 1–7');
    expect(part(c, 'range')!.style.fontVariantCaps).toBe('all-small-caps');
    expect(part(c, 'reciter')!.style.fontStyle).toBe('italic');
    const credits = part(c, 'credits')!;
    expect(credits.style.fontVariantCaps).toBe('all-small-caps');
    // 0.8 L at 9:16 (L = 37 px), at 60 % of the ink: legible, still out of the way.
    expect(credits.style.fontSize).toBe('30px');
    expect(credits.style.opacity).toBe('0.6');
    expect([...credits.children].map((line) => line.textContent)).toEqual(['A', 'B']);
    expect(part(c, 'ground')!.style.background).toBe('rgb(250, 245, 230)');
  });
});

// @vitest-environment jsdom
import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {
  type ChapterInfo,
  ChapterInfoCard,
  chapterFactsText,
  ordinal,
  type Tafsir,
  TafsirCard,
} from '../../../src/content';

afterEach(cleanup);

const TAFSIR: Tafsir = {
  kind: 'tafsir',
  meta: {id: 'quran.com-tafsir:169', name: 'Ibn Kathir (Abridged)', language: 'en', source: 'quran.com'},
  entries: [
    {from: '2:11', to: '2:12', paragraphs: ['Meaning of Mischief', 'In his Tafsir, As-Suddi said...']},
    {from: '2:13', to: '2:13', paragraphs: ['Allah said that if the hypocrites are told,']},
  ],
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
  shortText: 'This Surah is named Al-Fatihah because of its subject matter.',
  paragraphs: [],
};

const part = (el: Element, name: string) => el.querySelector<HTMLElement>(`[data-mushaf-card-part="${name}"]`)!;

describe('TafsirCard', () => {
  const card = (props: Partial<React.ComponentProps<typeof TafsirCard>> = {}) =>
    render(
      <TafsirCard tafsir={TAFSIR} ayahKey="2:12" fontFamily="Lora" fontSize={30} color="rgb(1, 2, 3)" {...props} />,
    ).container;

  it('shows the commentary covering the ayah, its range, the name and the text clamped to N lines', () => {
    const el = card({maxLines: 3}).firstElementChild as HTMLElement;
    expect(el.className).toBe('mushaf-tafsir-card');
    expect(el.dataset.ayahKey).toBe('2:12');
    expect(el.lang).toBe('en');
    expect(el.style.direction).toBe('ltr');
    expect(part(el, 'ayahs').textContent).toBe('2:11–12');
    expect(part(el, 'name').textContent).toBe('Ibn Kathir (Abridged)');
    const text = part(el, 'text');
    expect(text.textContent).toBe('Meaning of Mischief In his Tafsir, As-Suddi said...');
    expect(text.style.webkitLineClamp ?? text.style.getPropertyValue('-webkit-line-clamp')).toBe('3');
    expect(text.style.overflow).toBe('hidden');
    expect(text.style.maxHeight).toBe(`${3 * 30 * 1.4}px`);
    expect(text.style.fontSize).toBe('30px');
  });

  it('takes the direction, the background and the accent colour, and defaults to 8 lines', () => {
    const el = card({ayahKey: '2:13', direction: 'rtl', background: 'rgb(9, 9, 9)', accentColor: 'red'})
      .firstElementChild as HTMLElement;
    expect(el.style.direction).toBe('rtl');
    expect(el.style.background).toBe('rgb(9, 9, 9)');
    expect(el.style.padding).toBe('30px');
    expect(part(el, 'header').style.color).toBe('red');
    expect(part(el, 'ayahs').textContent).toBe('2:13');
    expect(part(el, 'text').style.maxHeight).toBe(`${8 * 30 * 1.4}px`);
  });

  it('renders nothing for an ayah the tafsir does not cover, or none', () => {
    expect(card({ayahKey: '2:14'}).childElementCount).toBe(0);
    expect(card({ayahKey: null}).childElementCount).toBe(0);
  });
});

describe('ChapterInfoCard', () => {
  it('writes ordinals and the facts line', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 112, 113].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '112th',
      '113th',
    ]);
    expect(chapterFactsText(INFO)).toBe('Meccan · revealed 5th · 7 ayahs');
    expect(chapterFactsText({...INFO, revelationPlace: 'madinah', revelationOrder: 87, ayahCount: 1})).toBe(
      'Medinan · revealed 87th · 1 ayah',
    );
  });

  it('shows the names in English and Arabic, the translated name, the facts and the short text', () => {
    const el = render(
      <ChapterInfoCard info={INFO} fontFamily="Lora" arabicFontFamily="Amiri" fontSize={20} color="rgb(1, 2, 3)" />,
    ).container.firstElementChild as HTMLElement;
    expect(el.dataset.surah).toBe('1');
    expect(part(el, 'english').textContent).toBe('Al-Fatihah');
    const arabic = part(el, 'arabic');
    expect(arabic.textContent).toBe('الفاتحة');
    expect(arabic.dir).toBe('rtl');
    expect(arabic.style.fontFamily).toBe('Amiri');
    expect(part(el, 'translated').textContent).toBe('The Opener');
    expect(part(el, 'facts').textContent).toBe('Meccan · revealed 5th · 7 ayahs');
    expect(part(el, 'text').textContent).toBe(INFO.shortText);
    expect(part(el, 'text').style.maxHeight).toBe(`${4 * 20 * 1.4}px`);
  });

  it('leaves the short text out with maxLines 0', () => {
    const el = render(<ChapterInfoCard info={INFO} fontFamily="Lora" fontSize={20} color="black" maxLines={0} />)
      .container.firstElementChild as HTMLElement;
    expect(el.querySelector('[data-mushaf-card-part="text"]')).toBeNull();
    expect(part(el, 'arabic').style.fontFamily).toBe('Lora');
  });
});

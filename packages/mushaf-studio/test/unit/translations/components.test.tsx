// @vitest-environment jsdom
import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {GlossStrip, TranslationBlock} from '../../../src/translations';
import type {AyahTranslation, WordGloss} from '../../../src/types';

afterEach(cleanup);

const translation: AyahTranslation = {
  kind: 'ayah',
  meta: {id: 'quran.com:20', name: 'Saheeh International', language: 'en', source: 'quran.com'},
  text: {'1:1': 'In the name of Allāh', '1:2': '[All] praise is [due] to Allāh, Lord of the worlds -'},
};

const wordTranslation: WordGloss = {
  kind: 'word',
  meta: {id: 'quran.com:wbw-translation-en', name: 'wbw', language: 'en', source: 'quran.com'},
  words: {'1:1:1': 'In (the) name', '1:1:2': '(of) Allah'},
};

const wordTransliteration: WordGloss = {
  kind: 'word',
  meta: {id: 'quran.com:wbw-transliteration-en', name: 'tr', language: 'en', source: 'quran.com'},
  words: {'1:1:1': "bis'mi", '1:1:3': 'l-raḥmāni'},
};

const block = (props: Partial<React.ComponentProps<typeof TranslationBlock>> = {}) =>
  render(
    <TranslationBlock
      translation={translation}
      ayahKey="1:2"
      fontFamily="Georgia, serif"
      fontSize={40}
      color="rgb(74, 74, 74)"
      direction="ltr"
      {...props}
    />,
  ).container.firstElementChild as HTMLElement;

const strip = (props: Partial<React.ComponentProps<typeof GlossStrip>> = {}) =>
  render(
    <GlossStrip
      translation={wordTranslation}
      transliteration={wordTransliteration}
      activeWordId="1:1:1"
      fontFamily="Arial"
      fontSize={20}
      color="rgb(1, 2, 3)"
      {...props}
    />,
  ).container.firstElementChild as HTMLElement;

describe('TranslationBlock', () => {
  it("renders one div with the ayah's text and its style", () => {
    const el = block();
    expect(el.tagName).toBe('DIV');
    expect(el.children).toHaveLength(0);
    expect(el.textContent).toBe('[All] praise is [due] to Allāh, Lord of the worlds -');
    expect(el.className).toBe('mushaf-translation');
    expect(el.dataset.ayahKey).toBe('1:2');
    expect(el.lang).toBe('en');
    expect(el.style.direction).toBe('ltr');
    expect(el.style.fontFamily).toBe('Georgia, serif');
    expect(el.style.fontSize).toBe('40px');
    expect(el.style.color).toBe('rgb(74, 74, 74)');
    expect(el.style.textAlign).toBe('start');
    expect(el.style.lineHeight).toBe('1.35');
    expect(el.style.minHeight).toBe('54px');
    expect(el.style.opacity).toBe('1');
  });

  it('follows the direction and the opacity', () => {
    const el = block({direction: 'rtl', opacity: 0.25});
    expect(el.style.direction).toBe('rtl');
    expect(el.style.textAlign).toBe('start');
    expect(el.style.opacity).toBe('0.25');
  });

  it('appends the className and spreads style last', () => {
    const el = block({className: 'mine', style: {color: 'red', textAlign: 'center', paddingTop: 4}});
    expect(el.className).toBe('mushaf-translation mine');
    expect(el.style.color).toBe('red');
    expect(el.style.textAlign).toBe('center');
    expect(el.style.paddingTop).toBe('4px');
  });

  it('stays, empty and one line tall, for no ayah or an ayah the translation lacks', () => {
    const none = block({ayahKey: null});
    expect(none.textContent).toBe('');
    expect(none.dataset.ayahKey).toBeUndefined();
    expect(none.style.minHeight).toBe('54px');
    cleanup();
    const missing = block({ayahKey: '2:255'});
    expect(missing.textContent).toBe('');
    expect(missing.dataset.ayahKey).toBe('2:255');
    expect(missing.style.minHeight).toBe('54px');
  });

  it('renders the text as text, never as HTML', () => {
    const el = block({translation: {...translation, text: {'1:1': '<b>bold</b>'}}, ayahKey: '1:1'});
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toBe('<b>bold</b>');
  });

  it("sets lang only to a language tag ('und' and quran.com's names are left out)", () => {
    expect(
      block({translation: {...translation, meta: {...translation.meta, language: 'und'}}}).hasAttribute('lang'),
    ).toBe(false);
    cleanup();
    expect(
      block({translation: {...translation, meta: {...translation.meta, language: 'tajik'}}}).hasAttribute('lang'),
    ).toBe(false);
  });
});

describe('GlossStrip', () => {
  const rows = (el: HTMLElement) => Array.from(el.children) as HTMLElement[];

  it("shows the active word's translation and, under it, its transliteration, centred", () => {
    const el = strip();
    expect(el.className).toBe('mushaf-gloss');
    expect(el.dataset.wordId).toBe('1:1:1');
    expect(el.style.textAlign).toBe('center');
    expect(el.style.fontFamily).toBe('Arial');
    expect(el.style.fontSize).toBe('20px');
    expect(el.style.color).toBe('rgb(1, 2, 3)');
    expect(el.style.lineHeight).toBe('1.35');
    expect(rows(el).map((r) => [r.className, r.textContent])).toEqual([
      ['mushaf-gloss__translation', 'In (the) name'],
      ['mushaf-gloss__transliteration', "bis'mi"],
    ]);
  });

  it('keeps both rows, one line tall each, when there is no active word', () => {
    const el = strip({activeWordId: null});
    expect(el.dataset.wordId).toBeUndefined();
    expect(rows(el).map((r) => r.textContent)).toEqual(['', '']);
    expect(rows(el).map((r) => r.style.minHeight)).toEqual(['27px', '27px']);
  });

  it('keeps an empty row when the word has no gloss in one of them', () => {
    const el = strip({activeWordId: '1:1:2'});
    expect(rows(el).map((r) => r.textContent)).toEqual(['(of) Allah', '']);
    cleanup();
    expect(rows(strip({activeWordId: '1:1:3'})).map((r) => r.textContent)).toEqual(['', 'l-raḥmāni']);
  });

  it('leaves out the row of a gloss that is not given', () => {
    expect(rows(strip({transliteration: null})).map((r) => r.className)).toEqual(['mushaf-gloss__translation']);
    cleanup();
    expect(rows(strip({translation: null})).map((r) => r.className)).toEqual(['mushaf-gloss__transliteration']);
    cleanup();
    expect(rows(strip({translation: null, transliteration: null}))).toHaveLength(0);
  });

  it('appends the className and spreads style last', () => {
    const el = strip({className: 'mine', style: {textAlign: 'left', marginTop: 8}});
    expect(el.className).toBe('mushaf-gloss mine');
    expect(el.style.textAlign).toBe('left');
    expect(el.style.marginTop).toBe('8px');
  });
});

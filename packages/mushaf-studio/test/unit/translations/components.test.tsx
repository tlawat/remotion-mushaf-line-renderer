// @vitest-environment jsdom
import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {SOFT} from '../../../src/schema';
import {GlossStrip, glossStripOpacities, glossStripState, TranslationBlock} from '../../../src/translations';
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

  it('aligns its lines as `align` says, relative to the direction, start by default', () => {
    expect(block({align: undefined}).style.textAlign).toBe('start');
    cleanup();
    expect(block({align: 'start'}).style.textAlign).toBe('start');
    cleanup();
    expect(block({align: 'center'}).style.textAlign).toBe('center');
    cleanup();
    const end = block({align: 'end', direction: 'rtl'});
    expect(end.style.textAlign).toBe('end');
    expect(end.style.direction).toBe('rtl');
    cleanup();
    // A style of the caller's still goes over it.
    expect(block({align: 'center', style: {textAlign: 'left'}}).style.textAlign).toBe('left');
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

  it('aligns its lines as `align` says, relative to the direction, start by default', () => {
    expect(block({align: undefined}).style.textAlign).toBe('start');
    cleanup();
    expect(block({align: 'start'}).style.textAlign).toBe('start');
    cleanup();
    expect(block({align: 'center'}).style.textAlign).toBe('center');
    cleanup();
    const end = block({align: 'end', direction: 'rtl'});
    expect(end.style.textAlign).toBe('end');
    expect(end.style.direction).toBe('rtl');
    cleanup();
    // A style of the caller's still goes over it.
    expect(block({align: 'center', style: {textAlign: 'left'}}).style.textAlign).toBe('left');
  });

  it('appends the className and spreads style last', () => {
    const el = strip({className: 'mine', style: {textAlign: 'left', marginTop: 8}});
    expect(el.className).toBe('mushaf-gloss mine');
    expect(el.style.textAlign).toBe('left');
    expect(el.style.marginTop).toBe('8px');
  });
});

describe('GlossStrip at a word change', () => {
  const spans = [
    {id: '1:1:1', surah: 1, ayah: 1, start: 0, end: 1},
    {id: '1:1:2', surah: 1, ayah: 1, start: 1, end: 2},
  ];

  it('changes at each kept span, held through a pause, nothing before the first', () => {
    expect(glossStripState(spans, -0.5, 30)).toEqual({
      activeWordId: null,
      previousWordId: null,
      framesSinceChange: Infinity,
    });
    expect(glossStripState(spans, 0.5, 30)).toMatchObject({activeWordId: '1:1:1', previousWordId: null});
    const change = glossStripState(spans, 1 + 2 / 30, 30);
    expect(change).toMatchObject({activeWordId: '1:1:2', previousWordId: '1:1:1'});
    expect(change.framesSinceChange).toBeCloseTo(2, 6);
    expect(glossStripState(spans, 9, 30).activeWordId).toBe('1:1:2');
  });

  it('lets the old gloss go over 3 frames and brings the new one in over 6 from 2 frames on', () => {
    expect(glossStripOpacities(0)).toEqual({out: 1, in: 0});
    expect(glossStripOpacities(2).in).toBe(0);
    expect(glossStripOpacities(3).out).toBe(0);
    expect(glossStripOpacities(5).in).toBeCloseTo(SOFT(0.5), 3);
    expect(glossStripOpacities(8)).toEqual({out: 0, in: 1});
    expect(glossStripOpacities(Infinity)).toEqual({out: 0, in: 1});
  });

  it('keeps the same pace in time at 60 fps: out over 6 frames, in over 12 from 4 frames on', () => {
    // Every 1/30 s after a change, the 60 fps strip shows what the 30 fps one does.
    for (let step = 0; step <= 9; step++) {
      expect(glossStripOpacities(step * 2, 60)).toEqual(glossStripOpacities(step, 30));
    }
    expect(glossStripOpacities(4, 60).in).toBe(0);
    expect(glossStripOpacities(6, 60).out).toBe(0);
    expect(glossStripOpacities(15, 60).in).toBeLessThan(1);
    expect(glossStripOpacities(16, 60)).toEqual({out: 0, in: 1});
    // The strip itself takes the composition's rate.
    const fading = strip({activeWordId: '1:1:2', previousWordId: '1:1:1', framesSinceChange: 2, fps: 60});
    expect(Number(fading.querySelector<HTMLElement>('[data-gloss-outgoing]')!.style.opacity)).toBeCloseTo(
      glossStripOpacities(1, 30).out,
      4,
    );
  });

  it('draws the outgoing gloss over the incoming one while it fades, then the new one alone', () => {
    const fading = strip({activeWordId: '1:1:2', previousWordId: '1:1:1', framesSinceChange: 1});
    const outgoing = fading.querySelectorAll<HTMLElement>('[data-gloss-outgoing]');
    expect(outgoing).toHaveLength(2);
    expect(Number(outgoing[0]!.style.opacity)).toBeCloseTo(glossStripOpacities(1).out, 4);
    expect(outgoing[0]!.textContent).toBe('In (the) name');
    cleanup();
    expect(
      strip({activeWordId: '1:1:2', previousWordId: '1:1:1', framesSinceChange: 10}).querySelector(
        '[data-gloss-outgoing]',
      ),
    ).toBeNull();
  });
});

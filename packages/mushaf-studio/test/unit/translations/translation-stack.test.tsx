// @vitest-environment jsdom
import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {type TranslationLayer, TranslationStack} from '../../../src/translations';
import type {AyahTranslation} from '../../../src/types';

afterEach(cleanup);

const english: AyahTranslation = {
  kind: 'ayah',
  meta: {id: 'quran.com:20', name: 'Saheeh International', language: 'en', source: 'quran.com'},
  text: {'1:1': 'In the name of Allāh', '1:2': '[All] praise is [due] to Allāh'},
};
const urdu: AyahTranslation = {
  kind: 'ayah',
  meta: {id: 'quran.com:97', name: 'Maududi', language: 'ur', source: 'quran.com'},
  text: {'1:1': 'اللہ کے نام سے'},
};

const layer = (translation: AyahTranslation, changes: Partial<TranslationLayer> = {}): TranslationLayer => ({
  translation,
  fontFamily: 'Lora',
  fontSize: 40,
  color: 'rgb(1, 2, 3)',
  direction: 'ltr',
  ...changes,
});

const stack = (props: Partial<React.ComponentProps<typeof TranslationStack>> = {}) =>
  render(
    <TranslationStack
      layers={[
        layer(english),
        layer(urdu, {fontFamily: 'Noto Nastaliq Urdu', fontSize: 30, color: 'rgb(9, 8, 7)', direction: 'rtl'}),
      ]}
      ayahKey="1:1"
      {...props}
    />,
  ).container;

describe('TranslationStack', () => {
  it('stacks one block per translation, each with its own type, separated by a rule', () => {
    const el = stack().firstElementChild as HTMLElement;
    expect(el.className).toBe('mushaf-translation-stack');
    expect(el.dataset.ayahKey).toBe('1:1');
    expect(el.style.flexDirection).toBe('column');
    const [first, rule, second] = [...el.children] as HTMLElement[];
    expect(el.children).toHaveLength(3);
    expect(first!.textContent).toBe('In the name of Allāh');
    expect(first!.lang).toBe('en');
    expect(first!.style.fontFamily).toBe('Lora');
    expect(first!.style.direction).toBe('ltr');
    expect(rule!.dataset.mushafRule).toBe('');
    expect(rule!.style.height).toBe('1px');
    expect(rule!.style.margin).toBe('12px 0px');
    expect(rule!.style.background).toBe('rgb(1, 2, 3)');
    expect(rule!.style.opacity).toBe('0.35');
    expect(second!.textContent).toBe('اللہ کے نام سے');
    expect(second!.lang).toBe('ur');
    expect(second!.style.fontFamily).toBe('"Noto Nastaliq Urdu"');
    expect(second!.style.fontSize).toBe('30px');
    expect(second!.style.color).toBe('rgb(9, 8, 7)');
    expect(second!.style.direction).toBe('rtl');
  });

  it('keeps a block one line tall where its translation has no text for the ayah', () => {
    const el = stack({ayahKey: '1:2'}).firstElementChild as HTMLElement;
    const second = el.children[2] as HTMLElement;
    expect(second.textContent).toBe('');
    expect(second.style.minHeight).toBe(`${30 * 1.35}px`);
  });

  it('aligns every layer as `align` says, start by default, each in its own direction', () => {
    const blocks = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.mushaf-translation'));
    expect(blocks(stack()).map((b) => b.style.textAlign)).toEqual(['start', 'start']);
    cleanup();
    const centred = blocks(stack({align: 'center'}));
    expect(centred.map((b) => b.style.textAlign)).toEqual(['center', 'center']);
    expect(centred.map((b) => b.style.direction)).toEqual(['ltr', 'rtl']);
    cleanup();
    expect(blocks(stack({align: 'end'})).map((b) => b.style.textAlign)).toEqual(['end', 'end']);
  });

  it('takes the rule and the opacity from the props', () => {
    const el = stack({gap: 4, ruleColor: 'red', ruleThickness: 2, ruleOpacity: 1, opacity: 0.5, style: {width: 800}})
      .firstElementChild as HTMLElement;
    expect(el.style.opacity).toBe('0.5');
    expect(el.style.width).toBe('800px');
    const rule = el.children[1] as HTMLElement;
    expect(rule.style.background).toBe('red');
    expect(rule.style.height).toBe('2px');
    expect(rule.style.margin).toBe('4px 0px');
    expect(rule.style.opacity).toBe('1');
  });

  it('renders one layer without a rule, nothing for none, and refuses a fourth', () => {
    const one = stack({layers: [layer(english)]}).firstElementChild as HTMLElement;
    expect(one.children).toHaveLength(1);
    expect(one.querySelector('[data-mushaf-rule]')).toBeNull();
    cleanup();
    expect(stack({layers: []}).childElementCount).toBe(0);
    cleanup();
    const three = stack({layers: [layer(english), layer(urdu), layer(english)]}).firstElementChild as HTMLElement;
    expect(three.querySelectorAll('[data-mushaf-rule]')).toHaveLength(2);
    cleanup();
    expect(() => stack({layers: [layer(english), layer(urdu), layer(english), layer(urdu)]})).toThrow(
      expect.objectContaining({code: 'BAD_STUDIO_PROP', message: expect.stringContaining('1 to 3 translations')}),
    );
  });
});

describe('TranslationStack with the centred layout (render-design.md 5.5)', () => {
  const layout = {width: 1109, ruleWidth: 185, lineHeight: 1.45};

  it('centres every layer, balanced and fitted, with a short centred hairline 0.5 em apart', () => {
    const el = stack({layout, ruleThickness: 1}).firstElementChild as HTMLElement;
    expect(el.style.alignItems).toBe('center');
    const [first, rule] = [...el.children] as HTMLElement[];
    expect(first!.style.textAlign).toBe('center');
    expect(first!.style.lineHeight).toBe('1.45');
    expect(first!.style.width).toBe('min(1109px, 60ch)');
    expect(first!.style.textWrap).toBe('balance');
    expect(rule!.style.width).toBe('185px');
    // A quarter of the layer's 30 px on each side: the layers 0.5 em apart.
    expect(rule!.style.margin).toBe('8px auto');
    expect(rule!.style.background).toBe('rgb(9, 8, 7)');
    expect(rule!.style.opacity).toBe('0.3');
  });

  it('dissolves every layer from the leaving ayah, both in one cell', () => {
    const el = stack({layout, ayahKey: '1:2', outgoing: {ayahKey: '1:1', opacity: 0.4}, textOpacity: 0.3})
      .firstElementChild as HTMLElement;
    const first = el.children[0] as HTMLElement;
    expect(first.style.display).toBe('grid');
    const leaving = first.querySelector<HTMLElement>('[data-mushaf-translation-part="outgoing"]')!;
    const coming = first.querySelector<HTMLElement>('[data-mushaf-translation-part="incoming"]')!;
    expect(leaving.textContent).toBe('In the name of Allāh');
    expect(leaving.style).toMatchObject({gridArea: '1 / 1', opacity: '0.4'});
    expect(leaving.getAttribute('aria-hidden')).toBe('true');
    expect(coming.textContent).toBe('[All] praise is [due] to Allāh');
    expect(coming.style).toMatchObject({gridArea: '1 / 1', opacity: '0.3'});
  });
});

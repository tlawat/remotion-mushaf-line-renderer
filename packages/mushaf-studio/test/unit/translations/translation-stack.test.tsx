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

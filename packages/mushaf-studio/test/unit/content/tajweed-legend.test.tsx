// @vitest-environment jsdom

import {cleanup, render} from '@testing-library/react';
import {MUSHAF_THEMES} from '@tlawat/remotion-mushaf-line';
import {afterEach, describe, expect, it} from 'vitest';
import {TAJWEED_RULES, TajweedLegend, tajweedLegend, themeHasTajweedColors} from '../../../src/content';

afterEach(cleanup);

const colorsOf = (theme: Parameters<typeof tajweedLegend>[0]) =>
  Object.fromEntries(tajweedLegend(theme).map((item) => [item.entry, item.color]));

describe('tajweedLegend', () => {
  it('lists the seven rule entries 3-9 once each, the silent letters on request', () => {
    const rules = tajweedLegend('light');
    expect(rules.map((r) => r.entry)).toEqual([3, 9, 4, 5, 6, 8, 7]);
    expect(new Set(rules.map((r) => r.id)).size).toBe(7);
    expect(tajweedLegend('light', {silent: true}).at(-1)).toMatchObject({id: 'silent', entry: 1, color: '#a5a5a5'});
    for (const rule of TAJWEED_RULES) {
      expect(rule.english).not.toBe('');
      expect(rule.arabic).toMatch(/[؀-ۿ]/);
    }
  });

  it("takes the light theme's colours from MUSHAF_THEMES", () => {
    const light = MUSHAF_THEMES.light.colors!;
    expect(colorsOf('light')).toEqual({
      3: '#b50000',
      9: '#f40000',
      4: '#ff7b00',
      5: '#ce9e00',
      6: '#09b000',
      8: '#2fadff',
      7: '#3f48e6',
    });
    for (const [entry, color] of Object.entries(colorsOf('light'))) expect(color).toBe(light[entry as '3']);
  });

  it("takes the dark theme's colours, which differ from the light theme's", () => {
    expect(colorsOf('dark')).toEqual({
      3: '#ff6b6b',
      9: '#ff4d6d',
      4: '#ffa94d',
      5: '#ffd93d',
      6: '#6bcb77',
      8: '#00d9ff',
      7: '#4d96ff',
    });
  });

  it("reads a raw palette's colours from the font, and a custom theme over a base", () => {
    expect(colorsOf('p1')[3]).toBe('#e30000');
    expect(colorsOf('p3')[3]).toBe('#000000');
    expect(colorsOf({base: 2})[7]).toBe('#134fe1');
    const custom = colorsOf({base: 'sepia', colors: {rules: '#123456', '8': '#abcdef'}});
    expect(custom[3]).toBe('#123456');
    expect(custom[8]).toBe('#abcdef');
    expect(colorsOf('plain')[3]).toBe('currentColor');
    expect(colorsOf('normal')[6]).toBe('currentColor');
  });

  it('refuses what is not a theme', () => {
    for (const theme of ['neon', {base: 9}, {base: 'plain'}, 3, null]) {
      expect(() => tajweedLegend(theme as never)).toThrow(expect.objectContaining({code: 'BAD_STUDIO_PROP'}));
    }
  });

  it('tells the themes with tajweed colours from those without', () => {
    expect(['light', 'dark', 'sepia', 'p1', 'p2'].map((t) => themeHasTajweedColors(t as 'light'))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(['plain', 'normal', 'black', 'p3', 'p4', 'p5'].map((t) => themeHasTajweedColors(t as 'light'))).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

const legend = (props: Partial<React.ComponentProps<typeof TajweedLegend>> = {}) =>
  render(<TajweedLegend theme="light" fontFamily="Lora" fontSize={20} color="rgb(10, 20, 30)" {...props} />).container
    .firstElementChild as HTMLElement;

const swatches = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>('[data-mushaf-legend-part="swatch"]')].map((s) => s.style.background);

describe('TajweedLegend', () => {
  it('renders a wrapping row of swatches in the light theme, named in English and Arabic', () => {
    const el = legend();
    expect(el.dataset.orientation).toBe('row');
    expect(el.style.flexDirection).toBe('row');
    expect(el.style.flexWrap).toBe('wrap');
    expect(swatches(el)).toEqual([
      'rgb(181, 0, 0)',
      'rgb(244, 0, 0)',
      'rgb(255, 123, 0)',
      'rgb(206, 158, 0)',
      'rgb(9, 176, 0)',
      'rgb(47, 173, 255)',
      'rgb(63, 72, 230)',
    ]);
    const first = el.querySelector<HTMLElement>('[data-rule="madd-lazim"]')!;
    expect(first.dataset.entry).toBe('3');
    expect(first.querySelector('[data-mushaf-legend-part="english"]')!.textContent).toBe(
      'Necessary prolongation: 6 counts',
    );
    const arabic = first.querySelector<HTMLElement>('[data-mushaf-legend-part="arabic"]')!;
    expect(arabic.textContent).toBe('مد لازم ٦ حركات');
    expect(arabic.dir).toBe('rtl');
    expect(arabic.lang).toBe('ar');
  });

  it('renders a column in the dark theme with its own colours, one language, colour names', () => {
    const el = legend({theme: 'dark', orientation: 'column', names: 'english', label: 'colour', swatchSize: 12});
    expect(el.style.flexDirection).toBe('column');
    expect(swatches(el)[0]).toBe('rgb(255, 107, 107)');
    expect(el.querySelectorAll('[data-mushaf-legend-part="arabic"]')).toHaveLength(0);
    expect(el.querySelector('[data-mushaf-legend-part="english"]')!.textContent).toBe('Dark red');
    expect(el.querySelector<HTMLElement>('[data-mushaf-legend-part="swatch"]')!.style.width).toBe('12px');
  });

  it('paints currentColor swatches in the text colour, and adds the silent letters on request', () => {
    const el = legend({theme: 'normal', silent: true, names: 'arabic', arabicFontFamily: 'Amiri'});
    expect(new Set(swatches(el))).toEqual(new Set(['rgb(10, 20, 30)']));
    expect(el.querySelectorAll('[data-rule]')).toHaveLength(8);
    expect(el.querySelectorAll('[data-mushaf-legend-part="english"]')).toHaveLength(0);
    expect(el.querySelector<HTMLElement>('[data-mushaf-legend-part="arabic"]')!.style.fontFamily).toBe('Amiri');
  });
});

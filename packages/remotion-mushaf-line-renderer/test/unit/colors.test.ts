import {describe, expect, it} from 'vitest';
import {CURRENT_COLOR, assertCssColor, assertMushafColors, entryColors} from '../../src/colors';
import {getMushafDefinition} from '../../src/mushafs';

const colour = getMushafDefinition('qpc-v4-tajweed');
const plain = getMushafDefinition('qpc-v4');

describe('CSS colours', () => {
  it('accepts the CSS colour syntaxes and refuses anything that could escape the rule', () => {
    for (const value of ['#1b6f3f', '#fff', '#1b6f3fcc', 'rgb(27 111 63)', 'rgba(0,0,0,.4)', 'hsl(150 60% 27%)', 'oklch(62% .11 160)', 'color-mix(in srgb, red 40%, blue)', 'crimson', 'transparent', CURRENT_COLOR]) {
      expect(assertCssColor('mandala.text', value)).toBe(value);
    }
    expect(assertCssColor('mandala.text', '  #fff  ')).toBe('#fff');
    // The value is written into a stylesheet, so nothing that could close the rule gets through —
    // and a string that is simply not a colour is refused too, browser or not.
    for (const value of ['red; } body {display:none}', 'url(x)"', "red'", 'var(--x)/*', 'not a colour', '#12345', '', '   ', 42, null, {}]) {
      expect(() => assertCssColor('mandala.text', value)).toThrow(/must be a CSS colour/);
    }
  });

  it('validates the parts of a colour set', () => {
    expect(assertMushafColors('mandala', {text: 'currentColor', accent: '#c8a45c', background: 'transparent'})).toEqual({text: 'currentColor', accent: '#c8a45c', background: 'transparent'});
    expect(assertMushafColors('mandala', {})).toEqual({});
    expect(() => assertMushafColors('mandala', {colour: 'red'})).toThrow(/mandala.colour is not a colourable part. Known parts: text, accent, background/);
    expect(() => assertMushafColors('mandala', {text: 5})).toThrow(/mandala.text must be a CSS colour/);
    expect(() => assertMushafColors('mandala', ['red'])).toThrow(/must be an object of CSS colours/);
  });
});

describe('entryColors', () => {
  it('expands the three parts into the CPAL entries of the font, ascending', () => {
    expect(entryColors(colour, {text: 'currentColor'})).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15].map((e) => [e, 'currentColor']));
    // The rosette in one colour: its frame and the ayah number (13), the petals (11), the jewel (10).
    expect(entryColors(colour, {accent: '#c8a45c'})).toEqual([
      [10, '#c8a45c'],
      [11, '#c8a45c'],
      [13, '#c8a45c'],
    ]);
    expect(entryColors(colour, {background: 'transparent'})).toEqual([[12, 'transparent']]);
  });

  it('covers every entry of the font between them, and has nothing to paint on a monochrome set', () => {
    const all = entryColors(colour, {text: '#111', accent: '#c8a45c', background: '#fff'});
    expect(all.map(([entry]) => entry)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(entryColors(plain, {text: 'red', accent: 'red'})).toEqual([]);
    expect(entryColors(colour, {})).toEqual([]);
  });
});

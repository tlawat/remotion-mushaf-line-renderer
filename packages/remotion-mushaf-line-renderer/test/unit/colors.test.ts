import {describe, expect, it} from 'vitest';
import {assertCssColor, CURRENT_COLOR} from '../../src/mushaf/colors';

describe('CSS colours', () => {
  it('accepts the CSS colour syntaxes and refuses anything that could escape the rule', () => {
    for (const value of [
      '#1b6f3f',
      '#fff',
      '#1b6f3fcc',
      'rgb(27 111 63)',
      'rgba(0,0,0,.4)',
      'hsl(150 60% 27%)',
      'oklch(62% .11 160)',
      'color-mix(in srgb, red 40%, blue)',
      'crimson',
      'transparent',
      CURRENT_COLOR,
    ]) {
      expect(assertCssColor('theme.colors.ink', value)).toBe(value);
    }
    expect(assertCssColor('theme.colors.ink', '  #fff  ')).toBe('#fff');
    // The value is written into a stylesheet, so nothing that could close the rule gets through —
    // and a string that is simply not a colour is refused too, browser or not.
    for (const value of [
      'red; } body {display:none}',
      'url(x)"',
      "red'",
      'var(--x)/*',
      'not a colour',
      '#12345',
      '',
      '   ',
      42,
      null,
      {},
    ]) {
      expect(() => assertCssColor('theme.colors.ink', value)).toThrow(/must be a CSS colour/);
    }
  });
});

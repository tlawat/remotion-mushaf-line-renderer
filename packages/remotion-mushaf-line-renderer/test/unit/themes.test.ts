import {describe, expect, it} from 'vitest';
import {MUSHAFS} from '../../src/mushaf/registry';
import {MUSHAF_THEME_NAMES, MUSHAF_THEMES, resolveTheme} from '../../src/mushaf/themes';

const font = MUSHAFS['qpc-v4'].fontSets.color;
const at = (entries: ReadonlyArray<readonly [number, string]>, entry: number) =>
  entries.find(([e]) => e === entry)?.[1];

describe('themes', () => {
  it("offers QUL's ten options minus P6, which the font has no palette for", () => {
    expect(MUSHAF_THEME_NAMES).toEqual(['light', 'dark', 'sepia', 'black', 'normal', 'p1', 'p2', 'p3', 'p4', 'p5']);
    expect(Object.keys(MUSHAF_THEMES)).toEqual(MUSHAF_THEME_NAMES);
    expect(font.palettes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(font.entries).toBe(16);
  });

  it("resolves QUL's presets to their base palette and override colours", () => {
    // Values as QUL writes them into its @font-palette-values rules (entries 0-15).
    const light = resolveTheme(font, 'light');
    expect(light).toMatchObject({name: 'light', base: 0, marker: [], data: 'light'});
    expect(light.entries).toHaveLength(16);
    expect(at(light.entries, 0)).toBe('#000000');
    expect(at(light.entries, 7)).toBe('#3f48e6'); // the 2-vowel prolongation, the commonest rule colour
    expect(at(light.entries, 12)).toBe('#d8e9d8');
    const dark = resolveTheme(font, 'dark');
    expect(dark).toMatchObject({base: 5});
    expect(at(dark.entries, 0)).toBe('#e8e8e8');
    expect(at(dark.entries, 12)).toBe('#343a40');
    const sepia = resolveTheme(font, 'sepia');
    expect(sepia).toMatchObject({base: 2});
    expect(at(sepia.entries, 0)).toBe('#3d2914');
    expect(at(sepia.entries, 13)).toBe('#8b0000');
    // Black: everything white, and the ayah number black on the marker only.
    const black = resolveTheme(font, 'black');
    expect(black.base).toBe(5);
    expect(black.entries.every(([, color]) => color === '#ffffff')).toBe(true);
    expect(black.marker).toEqual([[13, '#000000']]);
    // Normal: the font's palette 3, everything written following the inherited CSS colour.
    const normal = resolveTheme(font, 'normal');
    expect(normal.base).toBe(3);
    expect(normal.entries.map(([e]) => e)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15]);
    expect(normal.entries.every(([, color]) => color === 'currentColor')).toBe(true);
    // P1-P5: the raw palettes.
    for (const n of [1, 2, 3, 4, 5])
      expect(resolveTheme(font, `p${n}`)).toEqual({name: `p${n}`, base: n, entries: [], marker: [], data: `p${n}`});
  });

  it('builds custom themes from a base palette or a preset, by part or by entry', () => {
    const gold = resolveTheme(font, {base: 'normal', colors: {accent: '#c8a45c', background: 'transparent'}});
    expect(gold.name).toBeUndefined();
    expect(gold.base).toBe(3);
    expect(at(gold.entries, 11)).toBe('#c8a45c');
    expect(at(gold.entries, 12)).toBe('transparent');
    expect(at(gold.entries, 0)).toBe('currentColor'); // the preset's colours come first
    expect(gold.data).toEqual({base: 3, colors: Object.fromEntries(gold.entries.map(([e, c]) => [String(e), c]))});
    // Tajweed switched off: every rule colour follows the text colour.
    const off = resolveTheme(font, {base: 'light', colors: {rules: 'currentColor'}});
    for (const e of [3, 4, 5, 6, 7, 8, 9]) expect(at(off.entries, e)).toBe('currentColor');
    expect(at(off.entries, 0)).toBe('#000000');
    // A numeric key wins over the part that contains it, whatever the order.
    const one = resolveTheme(font, {base: 3, colors: {'7': 'crimson', rules: 'navy'}});
    expect(at(one.entries, 7)).toBe('crimson');
    expect(at(one.entries, 6)).toBe('navy');
    // A bare base records just that; a marker over a preset keeps the preset's marker underneath.
    expect(resolveTheme(font, {base: 4})).toEqual({base: 4, entries: [], marker: [], data: {base: 4}});
    const marked = resolveTheme(font, {base: 'black', marker: {background: '#ff0'}});
    expect(marked.marker).toEqual([
      [12, '#ff0'],
      [13, '#000000'],
    ]);
    expect(marked.data).toMatchObject({base: 5, marker: {12: '#ff0', 13: '#000000'}});
  });

  it('refuses what the font cannot paint, loudly', () => {
    expect(() => resolveTheme(font, 'p6')).toThrow(
      /theme must be 'plain', a preset \(light, dark, sepia, black, normal, p1, p2, p3, p4, p5\) or \{base, colors\?, marker\?\}, got "p6"/,
    );
    expect(() => resolveTheme(font, {base: 6})).toThrow(
      /theme.base must be a CPAL palette of the font \(0, 1, 2, 3, 4, 5\) or a preset/,
    );
    expect(() => resolveTheme(font, {base: 'mandala' as never})).toThrow(/theme.base must be/);
    expect(() => resolveTheme(font, {base: 0, colors: {'16': 'red'}})).toThrow(
      /theme.colors.16 is neither a part \(ink, silent, rules, frame, accent, detail, background\) nor a CPAL entry of the font \(0–15\)/,
    );
    expect(() => resolveTheme(font, {base: 0, colors: {glow: 'red'} as never})).toThrow(
      /theme.colors.glow is neither a part/,
    );
    expect(() => resolveTheme(font, {base: 0, colors: ['red'] as never})).toThrow(/theme.colors must be an object/);
    expect(() => resolveTheme(font, {base: 0, marker: {frame: 'red; } body {display:none'}})).toThrow(
      /theme.marker.frame must be a CSS colour/,
    );
    expect(() => resolveTheme(font, {base: 0, palette: 3} as never)).toThrow(/theme.palette is not a theme field/);
    expect(() => resolveTheme(font, null)).toThrow(/got null/);
    expect(() => resolveTheme(font, {base: 0, colors: {ink: 'red'}})).not.toThrow();
  });
});

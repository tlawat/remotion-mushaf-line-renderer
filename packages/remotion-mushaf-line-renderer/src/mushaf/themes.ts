import {describeValue, MushafError} from '../errors';
import type {MushafColorPart, MushafTheme, MushafThemeColors, MushafThemeName, MushafThemeSelection} from '../types';
import {assertCssColor, CURRENT_COLOR} from './colors';

/** The rings around the small connective letters (entry 14) are hidden in every preset: the printed page has none. */
const TRANSPARENT = 'transparent';

import type {FontSetDefinition} from './registry';

/** One `override-colors` entry: which CPAL entry, and the CSS colour to paint it with. */
export type PaletteEntry = readonly [entry: number, color: string];

export const MUSHAF_THEME_NAMES: readonly MushafThemeName[] = [
  'light',
  'dark',
  'sepia',
  'black',
  'normal',
  'p1',
  'p2',
  'p3',
  'p4',
  'p5',
];

export const COLOR_PARTS: readonly MushafColorPart[] = [
  'ink',
  'silent',
  'outline',
  'rules',
  'frame',
  'accent',
  'detail',
  'background',
];

/** Sixteen colours, one per CPAL entry, as the object `MushafThemeColors` takes. */
const byEntry = (colors: readonly string[]): MushafThemeColors =>
  Object.fromEntries(colors.map((color, entry) => [String(entry), color])) as MushafThemeColors;

/**
 * The presets, with the colours QUL writes into its `@font-palette-values` rules (its Light, Dark,
 * Sepia and Black themes; `p1`–`p5` are its P1–P5 buttons, the font's own palettes untouched).
 * `normal` is QUL's default look, base palette 3, but with everything written following the
 * inherited CSS `color` instead of a hard-coded black: on a black-on-white page it paints the same
 * pixels, and on any other page it follows the text colour like the plain font would.
 */
export const MUSHAF_THEMES: Readonly<Record<MushafThemeName, MushafTheme>> = {
  light: {
    base: 0,
    colors: byEntry([
      '#000000',
      '#a5a5a5',
      '#a5a5a5',
      '#b50000',
      '#ff7b00',
      '#ce9e00',
      '#09b000',
      '#3f48e6',
      '#2fadff',
      '#f40000',
      '#2ca4ab',
      '#ff0080',
      '#d8e9d8',
      '#000000',
      TRANSPARENT,
      '#a5a5a5',
    ]),
  },
  dark: {
    base: 5,
    colors: byEntry([
      '#e8e8e8',
      '#b0b0b0',
      '#b0b0b0',
      '#ff6b6b',
      '#ffa94d',
      '#ffd93d',
      '#6bcb77',
      '#4d96ff',
      '#00d9ff',
      '#ff4d6d',
      '#26c6da',
      '#ff80ab',
      '#343a40',
      '#e8e8e8',
      TRANSPARENT,
      '#b0b0b0',
    ]),
  },
  sepia: {
    base: 2,
    colors: byEntry([
      '#3d2914',
      '#5c4033',
      '#5c4033',
      '#b84000',
      '#c65d00',
      '#8b6914',
      '#1e7b1e',
      '#2e4a8f',
      '#0077a3',
      '#c41e3a',
      '#a32952',
      '#2d6a4f',
      '#fff7ea',
      '#8b0000',
      TRANSPARENT,
      '#5c4033',
    ]),
  },
  black: {
    base: 5,
    colors: byEntry(Array.from({length: 16}, (_, entry) => (entry === 14 ? TRANSPARENT : '#ffffff'))),
    // QUL's `.theme-black .char-end` rule: the ayah number black on the white marker.
    marker: {frame: '#000000'},
  },
  normal: {
    base: 3,
    colors: {
      ink: CURRENT_COLOR,
      silent: CURRENT_COLOR,
      outline: TRANSPARENT,
      rules: CURRENT_COLOR,
      frame: CURRENT_COLOR,
    },
  },
  p1: {base: 1},
  p2: {base: 2},
  p3: {base: 3},
  p4: {base: 4},
  p5: {base: 5},
};

export const isThemeName = (value: unknown): value is MushafThemeName =>
  typeof value === 'string' && (MUSHAF_THEME_NAMES as readonly string[]).includes(value);

/** A theme with its base and colours worked out down to CPAL entries, ready for a palette rule. */
export type ResolvedTheme = {
  /** The preset, when the selection was a bare preset name. */
  readonly name?: MushafThemeName;
  readonly base: number;
  /** `override-colors` of the row, ascending by entry. `'currentColor'` is still symbolic here. */
  readonly entries: readonly PaletteEntry[];
  /** Extra overrides for the ayah-number marker glyph, ascending by entry; empty when none. */
  readonly marker: readonly PaletteEntry[];
  /** What to record on `MushafLineData.theme`: the name, or a self-contained custom theme. */
  readonly data: MushafThemeSelection;
};

const badTheme = (message: string, details?: Record<string, unknown>): MushafError =>
  new MushafError('BAD_THEME', message, details);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Expands `colors` into a map of entry → colour: parts first, then numeric keys, which win. */
const expandColors = (fontSet: FontSetDefinition, field: string, colors: unknown, into: Map<number, string>): void => {
  if (colors === undefined) return;
  if (!isPlainObject(colors)) {
    throw badTheme(`${field} must be an object of CSS colours by part or CPAL entry, got ${describeValue(colors)}.`, {
      [field]: colors,
    });
  }
  const numeric: Array<[number, string]> = [];
  for (const [key, value] of Object.entries(colors)) {
    if ((COLOR_PARTS as readonly string[]).includes(key)) {
      const color = assertCssColor(`${field}.${key}`, value);
      for (const entry of fontSet.colorParts[key as MushafColorPart]) into.set(entry, color);
    } else if (/^(0|[1-9]\d*)$/.test(key) && Number(key) < fontSet.entries) {
      numeric.push([Number(key), assertCssColor(`${field}.${key}`, value)]);
    } else {
      throw badTheme(
        `${field}.${key} is neither a part (${COLOR_PARTS.join(', ')}) nor a CPAL entry of the font (0–${fontSet.entries - 1}).`,
        {[field]: colors, key},
      );
    }
  }
  for (const [entry, color] of numeric) into.set(entry, color);
};

const sorted = (map: ReadonlyMap<number, string>): PaletteEntry[] => [...map.entries()].sort((a, b) => a[0] - b[0]);

/**
 * Resolves a theme selection (a preset name or a custom theme) against a colour font set: the
 * preset's colours first, then the caller's, parts expanded to entries, every colour checked.
 */
export const resolveTheme = (fontSet: FontSetDefinition, selection: unknown): ResolvedTheme => {
  const entries = new Map<number, string>();
  const marker = new Map<number, string>();
  const name = isThemeName(selection) ? selection : undefined;
  const theme: unknown = name === undefined ? selection : MUSHAF_THEMES[name];
  if (!isPlainObject(theme)) {
    throw badTheme(
      `theme must be 'plain', a preset (${MUSHAF_THEME_NAMES.join(', ')}) or {base, colors?, marker?}, got ${describeValue(selection)}.`,
      {theme: selection},
    );
  }
  let base: number;
  if (isThemeName(theme.base)) {
    const preset = resolveTheme(fontSet, theme.base);
    base = preset.base;
    for (const [entry, color] of preset.entries) entries.set(entry, color);
    for (const [entry, color] of preset.marker) marker.set(entry, color);
  } else if (typeof theme.base === 'number' && fontSet.palettes.includes(theme.base)) {
    base = theme.base;
  } else {
    throw badTheme(
      `theme.base must be a CPAL palette of the font (${fontSet.palettes.join(', ')}) or a preset (${MUSHAF_THEME_NAMES.join(', ')}), got ${describeValue(theme.base)}.`,
      {theme: selection},
    );
  }
  expandColors(fontSet, 'theme.colors', theme.colors, entries);
  expandColors(fontSet, 'theme.marker', theme.marker, marker);
  for (const key of Object.keys(theme)) {
    if (key !== 'base' && key !== 'colors' && key !== 'marker')
      throw badTheme(`theme.${key} is not a theme field (base, colors, marker).`, {theme: selection});
  }
  const entryList = sorted(entries);
  const markerList = sorted(marker);
  const data: MushafThemeSelection =
    name ??
    ({
      base,
      ...(entryList.length === 0 ? {} : {colors: Object.fromEntries(entryList.map(([e, c]) => [String(e), c]))}),
      ...(markerList.length === 0 ? {} : {marker: Object.fromEntries(markerList.map(([e, c]) => [String(e), c]))}),
    } as MushafTheme);
  return {...(name === undefined ? {} : {name}), base, entries: entryList, marker: markerList, data};
};

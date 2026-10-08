import {MUSHAF_THEMES, type MushafThemeSelection} from '@tlawat/remotion-mushaf-line';
import {describeValue, MushafStudioError} from '../errors';

/** The tajweed rules the colour font paints, by id. */
export type TajweedRuleId =
  | 'madd-lazim'
  | 'madd-wajib'
  | 'madd-arid'
  | 'madd-tabii'
  | 'ghunnah'
  | 'qalqalah'
  | 'tafkhim'
  | 'silent';

/** One colour of the KFGQPC V4 tajweed font: its CPAL entry, the rule it marks, and the colour's name in the default palette. */
export type TajweedRule = {
  readonly id: TajweedRuleId;
  /** The CPAL entry of the font that paints it (3-9 for the rules, 1 for the silent letters). */
  readonly entry: number;
  readonly english: string;
  readonly arabic: string;
  /** The colour in the font's default palette (QUL's light theme), for a legend that names colours. */
  readonly colorName: {readonly english: string; readonly arabic: string};
};

/**
 * The seven rule colours of the KFGQPC V4 tajweed font (CPAL entries 3-9, the package's `rules`
 * part), in legend order (the prolongations from longest), then the silent letters (entry 1, of
 * the `silent` part). QUL publishes no legend for this font; the rule of each entry was read off
 * the font itself: the words whose glyphs use the entry in their COLR layers, against their
 * Uthmani text, on pages 1, 2, 3 and 300 (e.g. entry 3 only on ٱلضَّآلِّينَ and الٓمٓ, entry 8 on
 * the sakin qaf, dal, ba and jim of قَبْلِكَ, وَلَقَدْ, مَجْمَعَ, entry 7 on خَتَمَ, ٱللَّهُ, كَفَرُوا۟).
 */
export const TAJWEED_RULES: readonly TajweedRule[] = [
  {
    id: 'madd-lazim',
    entry: 3,
    english: 'Necessary prolongation: 6 counts',
    arabic: 'مد لازم ٦ حركات',
    colorName: {english: 'Dark red', arabic: 'أحمر داكن'},
  },
  {
    id: 'madd-wajib',
    entry: 9,
    english: 'Connected or separated prolongation: 4 or 5 counts',
    arabic: 'مد متصل أو منفصل ٤ أو ٥ حركات',
    colorName: {english: 'Red', arabic: 'أحمر'},
  },
  {
    id: 'madd-arid',
    entry: 4,
    english: 'Prolongation at a stop: 2, 4 or 6 counts',
    arabic: 'مد عارض للسكون ٢ أو ٤ أو ٦ حركات',
    colorName: {english: 'Orange', arabic: 'برتقالي'},
  },
  {
    id: 'madd-tabii',
    entry: 5,
    english: 'Natural prolongation: 2 counts',
    arabic: 'مد طبيعي حركتان',
    colorName: {english: 'Gold', arabic: 'ذهبي'},
  },
  {
    id: 'ghunnah',
    entry: 6,
    english: 'Nasalisation (ghunnah): 2 counts',
    arabic: 'غنة حركتان',
    colorName: {english: 'Green', arabic: 'أخضر'},
  },
  {
    id: 'qalqalah',
    entry: 8,
    english: 'Echoing (qalqalah)',
    arabic: 'قلقلة',
    colorName: {english: 'Light blue', arabic: 'أزرق فاتح'},
  },
  {
    id: 'tafkhim',
    entry: 7,
    english: 'Heavy letters (tafkhim)',
    arabic: 'تفخيم',
    colorName: {english: 'Dark blue', arabic: 'أزرق داكن'},
  },
  {
    id: 'silent',
    entry: 1,
    english: 'Silent letters',
    arabic: 'حروف لا تُنطق',
    colorName: {english: 'Grey', arabic: 'رمادي'},
  },
];

/**
 * CPAL entries 1 and 3-9 of the font's six base palettes, as the font carries them (identical in the
 * page fonts 1, 3, 300 and 604): what a theme that does not override an entry paints it with.
 */
const BASE_PALETTES: readonly Readonly<Record<number, string>>[] = [
  {1: '#a5a5a5', 3: '#b50000', 4: '#ff7b00', 5: '#ce9e00', 6: '#09b000', 7: '#3f48e6', 8: '#2fadff', 9: '#f40000'},
  {1: '#9d9999', 3: '#e30000', 4: '#ff8e3b', 5: '#ffc1e0', 6: '#26b55d', 7: '#3c84d5', 8: '#00deff', 9: '#ff5e8e'},
  {1: '#afabab', 3: '#b7001c', 4: '#e67b00', 5: '#c09725', 6: '#09b000', 7: '#134fe1', 8: '#00b4e0', 9: '#ff0000'},
  {1: '#000000', 3: '#000000', 4: '#000000', 5: '#000000', 6: '#000000', 7: '#000000', 8: '#000000', 9: '#000000'},
  {1: '#ffffff', 3: '#ffffff', 4: '#ffffff', 5: '#ffffff', 6: '#ffffff', 7: '#ffffff', 8: '#ffffff', 9: '#ffffff'},
  {1: '#000000', 3: '#000000', 4: '#000000', 5: '#000000', 6: '#000000', 7: '#000000', 8: '#000000', 9: '#000000'},
];

// The package's colour parts that reach these entries (its registry's `colorParts` for the V4 tajweed set).
const PART_ENTRIES: Readonly<Record<string, readonly number[]>> = {silent: [1], rules: [3, 4, 5, 6, 7, 8, 9]};
const LEGEND_ENTRIES = [1, 3, 4, 5, 6, 7, 8, 9] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const badTheme = (value: unknown): never => {
  throw new MushafStudioError(
    'BAD_STUDIO_PROP',
    `theme must be 'plain', a preset (${Object.keys(MUSHAF_THEMES).join(', ')}) or {base, colors?}, got ${describeValue(value)}.`,
    {prop: 'theme'},
  );
};

const resolveEntries = (selection: unknown, depth: number): Map<number, string> => {
  if (selection === 'plain') return new Map(LEGEND_ENTRIES.map((entry) => [entry, 'currentColor']));
  const preset = typeof selection === 'string' ? (MUSHAF_THEMES as Record<string, unknown>)[selection] : undefined;
  const theme = preset ?? selection;
  if (!isRecord(theme) || depth > 2) return badTheme(selection);
  const {base, colors} = theme;
  let entries: Map<number, string>;
  if (typeof base === 'number' && Number.isInteger(base) && BASE_PALETTES[base]) {
    entries = new Map(Object.entries(BASE_PALETTES[base]!).map(([entry, color]) => [Number(entry), color]));
  } else if (typeof base === 'string' && base !== 'plain' && base in MUSHAF_THEMES) {
    entries = resolveEntries(base, depth + 1);
  } else {
    return badTheme(selection);
  }
  if (isRecord(colors)) {
    const numeric: [number, string][] = [];
    for (const [key, color] of Object.entries(colors)) {
      if (typeof color !== 'string') continue;
      if (PART_ENTRIES[key]) for (const entry of PART_ENTRIES[key]!) entries.set(entry, color);
      else if (/^\d+$/.test(key) && entries.has(Number(key))) numeric.push([Number(key), color]);
    }
    for (const [entry, color] of numeric) entries.set(entry, color);
  }
  return entries;
};

/** A legend row: the rule and the CSS colour the theme paints it with. */
export type TajweedLegendItem = TajweedRule & {readonly color: string};

/**
 * The legend of a theme: the seven rules (and the silent letters with `silent`) with the colours
 * the theme paints them in. A preset name reads the package's `MUSHAF_THEMES`, a custom theme
 * starts from its base palette (the font's own colours, or a preset's) and applies its `rules`
 * and `silent` parts, then its numeric entries; `'plain'` (and `normal`'s rules) give
 * `'currentColor'`, the text colour. Colours are not validated here: the line itself does that.
 * Throws `BAD_STUDIO_PROP` for anything that is not a theme.
 */
export const tajweedLegend = (
  theme: MushafThemeSelection,
  options: {readonly silent?: boolean | undefined} = {},
): readonly TajweedLegendItem[] => {
  const entries = resolveEntries(theme, 0);
  return TAJWEED_RULES.filter((rule) => options.silent === true || rule.id !== 'silent').map((rule) => ({
    ...rule,
    color: entries.get(rule.entry) ?? 'currentColor',
  }));
};

/**
 * Whether a theme tells the rules apart: `false` for `'plain'`, `normal`, `black` and the base
 * palettes 3-5, which paint every rule one colour, so a legend has nothing to say.
 */
export const themeHasTajweedColors = (theme: MushafThemeSelection): boolean =>
  new Set(tajweedLegend(theme).map((item) => item.color.toLowerCase())).size > 1;

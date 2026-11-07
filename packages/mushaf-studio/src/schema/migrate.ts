// Props saved before the render design (docs/mushaf-studio/render-design.md, section 7) are migrated,
// never rejected. One pure, idempotent function maps every removed option to its nearest equivalent,
// clamps numbers into their new ranges, replaces the old default font stacks that were never loaded,
// and fills what a group lacks from its defaults; a value that is still valid is never replaced. It
// runs first in every `calculateMetadata()` and slot resolver, so a CLI, Lambda or Laravel render
// of old props (Remotion does not validate input props against the schema) renders the new design.
import {defaultBackground, LEGACY_KEN_BURNS} from '../background/schema';
import {defaultPageView} from '../page/view';
import {
  defaultAnimation,
  defaultHighlight,
  defaultLayout,
  defaultLegend,
  defaultOverlay,
  defaultText,
  LEGACY_HIGHLIGHT_STYLES,
} from './index';

/**
 * Why `migrateMushafProps()` changed a field, in English, by code: `{name}` stands for a
 * `MigrationNote.params` value. The panel shows a note through its own dictionaries, under
 * `upgrade.reason.<code>`, in its language.
 */
export const MIGRATION_REASONS = {
  clamped: 'outside the new range {min}–{max}: clamped',
  filled: 'missing: filled with its default',
  changed: 'changed by the migration',
  inkUpcoming: 'dimming the words still to come is the ink mark',
  restUpcoming: 'the dimming of the words still to come, inside 0.5-0.85',
  inkOthers: 'dimming the other words is the ink mark',
  restOthers: 'the dimming of the other words, inside 0.5-0.85',
  glowTint: 'the glow is removed: the nearest mark is a tint',
  colorTint: 'renamed: a tint',
  markerWash: 'the marker box is removed: the nearest mark is a faint wash (one device, no dimming)',
  noneMode: 'style none marked nothing: nothing follows the recitation',
  noneStyle: 'style none is removed',
  karaokeGold: 'the Karaoke yellow becomes the antique gold',
  dimOthersRemoved: 'removed: restOpacity under the ink mark replaces it',
  dimUpcomingRemoved: 'removed: the ink mark only dims what is still to come',
  linesFrom: 'from {field} {value}',
  tempoCalm: 'the scroll curve is removed: one calm tempo',
  entranceRemoved: 'removed: lines replaces enter and exit',
  scrollRemoved: 'removed: the window scrolls on the calm curve',
  frameNew: 'new: no border',
  fontNeverLoaded: 'the old default font stack was never loaded: auto loads the design’s font',
  pansSlowZoom: 'the pans are removed: a very slow zoom',
  glowVignette: 'the glow is removed: a vignette keeps the light on the lines',
  vignetteNew: 'new: no vignette',
  glowRemoved: 'removed: nothing follows the audio level',
  gradientReset: 'not painted (the kind is not gradient): the new default gradient',
  underlineBand: 'the underline is removed: a faint band',
  ornamentsRule: 'the corner ornaments are removed: the double rule',
  slideFade: 'the slide is removed: a dissolve',
} as const;

/** The code of a migration's reason (`MIGRATION_REASONS`). */
export type MigrationReason = keyof typeof MIGRATION_REASONS;

/** The values a reason's text names (`{min}`, `{max}`, `{field}`, `{value}`). */
export type MigrationReasonParams = Readonly<Record<string, string | number>>;

/** One change `migrateMushafProps()` makes: where, the value before and after (`undefined`: absent), and why. */
export type MigrationNote = {
  /** Dotted path from the props' root, e.g. `highlight.style`. */
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
  /** Why, in English: `MIGRATION_REASONS[code]` with `params` filled in. */
  readonly reason: string;
  /** Why, as a code, for a host that words it in its own language. */
  readonly code: MigrationReason;
  /** The values the reason names: `{min, max}` for `clamped`, `{field, value}` for `linesFrom`, else `{}`. */
  readonly params: MigrationReasonParams;
};

/** A reason's English text, its `{name}` placeholders filled from `params`. */
export const migrationReasonText = (code: MigrationReason, params: MigrationReasonParams = {}): string =>
  MIGRATION_REASONS[code].replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });

export type MigrateOptions = {
  /**
   * The composition's own defaults (`defaultMushafAyahTextProps`, ...), to fill a group's missing
   * fields from; a group they do not hold fills from the shared `default*` objects.
   */
  readonly defaults?: Readonly<Record<string, unknown>> | undefined;
};

type Plain = Record<string, unknown>;

const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Why a field changed: a reason's code and the values it names. */
type Why = {readonly code: MigrationReason; readonly params?: MigrationReasonParams};

/** The reasons a migrator records, by field. */
type Reasons = Map<string, Why>;

/** What a group's migrator returns: the new group, and why a field changed where the reason is not the default one. */
type Migrated = {readonly value: Plain; readonly reasons: ReadonlyMap<string, Why>};

type GroupMigrator = (group: Plain, defaults: Plain) => Migrated;

/** Two decimals: a clamped or rounded number without float noise. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Fills the fields `group` lacks from `defaults`, without touching what it has. */
const filled = (group: Plain, defaults: Plain): Plain => {
  const out: Plain = {...group};
  for (const [key, value] of Object.entries(defaults)) if (!(key in out)) out[key] = value;
  return out;
};

/** Clamps `out[key]` into `[min, max]` when it is a number outside, recording why. */
const clampField = (out: Plain, key: string, min: number, max: number, reasons: Reasons): void => {
  const value = out[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  const clamped = Math.min(max, Math.max(min, value));
  if (clamped !== value) {
    out[key] = clamped;
    reasons.set(key, {code: 'clamped', params: {min, max}});
  }
};

/** Replaces `out[key]` when it is exactly one of `from` (a removed value), recording why. */
const mapValue = (
  out: Plain,
  key: string,
  from: Readonly<Record<string, unknown>>,
  reasons: Reasons,
  code: MigrationReason,
): void => {
  const value = out[key];
  if (typeof value === 'string' && Object.hasOwn(from, value)) {
    out[key] = from[value];
    reasons.set(key, {code});
  }
};

const removeField = (out: Plain, key: string, reasons: Reasons, code: MigrationReason): void => {
  if (!(key in out)) return;
  delete out[key];
  reasons.set(key, {code});
};

/** The opacity a dimming of `dimOthers` becomes as ink: to the 0.05 step, inside 0.5-0.85. */
const restFromDim = (dim: number): number => round2(Math.min(0.85, Math.max(0.5, Math.round(dim / 0.05) * 0.05)));

const KARAOKE_YELLOW = '#ffd166';

const migrateHighlight: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, Why>();
  const out = filled(group, defaults);
  const style = group.style;
  const legacy =
    (typeof style === 'string' && (LEGACY_HIGHLIGHT_STYLES as readonly string[]).includes(style)) ||
    'dimOthers' in group ||
    'dimUpcomingOnly' in group;
  if (legacy) {
    const dim = typeof group.dimOthers === 'number' ? group.dimOthers : 1;
    const upcoming = group.dimUpcomingOnly === true;
    let restSet = false;
    if (dim < 1 && upcoming) {
      out.style = 'ink';
      out.restOpacity = restFromDim(dim);
      restSet = true;
      reasons.set('style', {code: 'inkUpcoming'});
      reasons.set('restOpacity', {code: 'restUpcoming'});
    } else if (style === 'color' || style === 'glow') {
      out.style = 'tint';
      reasons.set('style', {code: style === 'glow' ? 'glowTint' : 'colorTint'});
    } else if (style === 'marker') {
      out.style = 'wash';
      reasons.set('style', {code: 'markerWash'});
    } else if (style === 'none' && dim < 1) {
      out.style = 'ink';
      out.restOpacity = restFromDim(dim);
      restSet = true;
      reasons.set('style', {code: 'inkOthers'});
      reasons.set('restOpacity', {code: 'restOthers'});
    } else if (style === 'none') {
      out.mode = 'none';
      out.style = 'ink';
      reasons.set('mode', {code: 'noneMode'});
      reasons.set('style', {code: 'noneStyle'});
    }
    if (!restSet && typeof group.restOpacity !== 'number') out.restOpacity = defaults.restOpacity ?? 0.6;
    if (typeof out.color === 'string' && out.color.toLowerCase() === KARAOKE_YELLOW) {
      out.color = defaultHighlight.color;
      reasons.set('color', {code: 'karaokeGold'});
    }
    removeField(out, 'dimOthers', reasons, 'dimOthersRemoved');
    removeField(out, 'dimUpcomingOnly', reasons, 'dimUpcomingRemoved');
  }
  clampField(out, 'restOpacity', 0.5, 0.85, reasons);
  return {value: out, reasons};
};

/** `enter` / `exit` values and the line motion they become. */
const LINES_FROM_ENTRANCE: Readonly<Record<string, string>> = {
  'slide-fade': 'rise',
  fade: 'fade',
  'reveal-rtl': 'fade',
  none: 'cut',
};

const migrateAnimation: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, Why>();
  const out = filled(group, defaults);
  const legacy = 'enter' in group || 'exit' in group || 'scroll' in group;
  if (legacy) {
    if (!('lines' in group)) {
      const enter = group.enter;
      const exit = group.exit;
      const source = enter === 'none' && typeof exit === 'string' && exit !== 'none' ? exit : (enter ?? exit);
      const lines = typeof source === 'string' ? LINES_FROM_ENTRANCE[source] : undefined;
      if (lines !== undefined) {
        out.lines = lines;
        reasons.set('lines', {
          code: 'linesFrom',
          params: {field: enter === source ? 'enter' : 'exit', value: JSON.stringify(source)},
        });
      }
    }
    if (!('tempo' in group)) {
      out.tempo = 'calm';
      reasons.set('tempo', {code: 'tempoCalm'});
    }
    removeField(out, 'enter', reasons, 'entranceRemoved');
    removeField(out, 'exit', reasons, 'entranceRemoved');
    removeField(out, 'scroll', reasons, 'scrollRemoved');
  }
  clampField(out, 'leadInSeconds', 0, 2, reasons);
  return {value: out, reasons};
};

const migrateLayout: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, Why>();
  const out = filled(group, defaults);
  if (!('frame' in group)) reasons.set('frame', {code: 'frameNew'});
  clampField(out, 'neighbourOpacity', 0.15, 0.5, reasons);
  return {value: out, reasons};
};

/** The old default font stacks, never loaded as web fonts: `'auto'` loads one. */
const OLD_TRANSLATION_FONT = 'Georgia, "Noto Serif", serif';
const OLD_GLOSS_FONT = '"Noto Sans", "Helvetica Neue", Arial, sans-serif';

const migrateText: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, Why>();
  const out = filled(group, defaults);
  mapValue(out, 'translationFont', {[OLD_TRANSLATION_FONT]: 'auto'}, reasons, 'fontNeverLoaded');
  mapValue(out, 'glossFont', {[OLD_GLOSS_FONT]: 'auto'}, reasons, 'fontNeverLoaded');
  return {value: out, reasons};
};

const migrateOverlay: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, Why>();
  const out = filled(group, defaults);
  clampField(out, 'introSeconds', 2, 6, reasons);
  mapValue(out, 'font', {[OLD_TRANSLATION_FONT]: 'auto'}, reasons, 'fontNeverLoaded');
  return {value: out, reasons};
};

const migrateLegend: GroupMigrator = (group, defaults) => ({value: filled(group, defaults), reasons: new Map()});

const migrateBackground: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, Why>();
  const out = filled(group, defaults);
  const kenBurns = group.kenBurns;
  const legacy =
    'glow' in group ||
    !('vignette' in group) ||
    (typeof kenBurns === 'string' && (LEGACY_KEN_BURNS as readonly string[]).includes(kenBurns)) ||
    (typeof group.kenBurnsScale === 'number' && group.kenBurnsScale > 1.05);
  mapValue(out, 'kenBurns', {'pan-left': 'slow-zoom', 'pan-right': 'slow-zoom'}, reasons, 'pansSlowZoom');
  clampField(out, 'kenBurnsScale', 1, 1.05, reasons);
  const glow = group.glow;
  if (isPlain(glow) && glow.enabled === true) {
    const vignette = typeof group.vignette === 'number' ? group.vignette : 0;
    out.vignette = Math.max(vignette, 0.15);
    reasons.set('vignette', {code: 'glowVignette'});
  } else if (!('vignette' in group)) {
    reasons.set('vignette', {code: 'vignetteNew'});
  }
  removeField(out, 'glow', reasons, 'glowRemoved');
  // An old gradient that was never painted (the kind is not gradient) is the old teal: the new
  // default replaces it, so picking the gradient kind later starts from the ground's own shade.
  if (
    legacy &&
    out.kind !== 'gradient' &&
    JSON.stringify(out.gradient) !== JSON.stringify(defaultBackground.gradient)
  ) {
    out.gradient = defaultBackground.gradient;
    reasons.set('gradient', {code: 'gradientReset'});
  }
  return {value: out, reasons};
};

const migratePageView: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, Why>();
  const out = filled(group, defaults);
  mapValue(out, 'lineHighlight', {underline: 'band'}, reasons, 'underlineBand');
  mapValue(out, 'frame', {ornate: 'simple'}, reasons, 'ornamentsRule');
  mapValue(out, 'turn', {slide: 'fade'}, reasons, 'slideFade');
  clampField(out, 'turnSeconds', 0.6, 1.5, reasons);
  clampField(out, 'dimOtherLines', 0.5, 1, reasons);
  return {value: out, reasons};
};

/** The groups that migrate, with their migrator and the shared defaults they fill from. */
const GROUPS: ReadonlyArray<readonly [key: string, migrate: GroupMigrator, defaults: () => Plain]> = [
  ['layout', migrateLayout, () => defaultLayout],
  ['background', migrateBackground, () => defaultBackground],
  ['animation', migrateAnimation, () => defaultAnimation],
  ['highlight', migrateHighlight, () => defaultHighlight],
  ['text', migrateText, () => defaultText],
  ['overlay', migrateOverlay, () => defaultOverlay],
  ['legend', migrateLegend, () => defaultLegend],
  ['pageView', migratePageView, () => defaultPageView],
];

/** The migrated props and every change, in one pass. */
const migrate = (
  props: unknown,
  options: MigrateOptions,
): {readonly props: unknown; readonly notes: MigrationNote[]} => {
  if (!isPlain(props)) return {props, notes: []};
  const out: Plain = {...props};
  const notes: MigrationNote[] = [];
  for (const [key, migrateGroup, sharedDefaults] of GROUPS) {
    const group = props[key];
    // Only a group the props have, in its object form: MushafThumbnail's `background` is a colour.
    if (!isPlain(group)) continue;
    const own = options.defaults?.[key];
    const {value, reasons} = migrateGroup(group, isPlain(own) ? own : sharedDefaults());
    for (const field of new Set([...Object.keys(group), ...Object.keys(value)])) {
      const from = group[field];
      const to = value[field];
      if (JSON.stringify(from) === JSON.stringify(to)) continue;
      const why: Why = reasons.get(field) ?? {code: from === undefined ? 'filled' : 'changed'};
      const params = why.params ?? {};
      notes.push({
        path: `${key}.${field}`,
        from,
        to,
        reason: migrationReasonText(why.code, params),
        code: why.code,
        params,
      });
    }
    out[key] = value;
  }
  return {props: notes.length === 0 ? props : out, notes};
};

/**
 * Props saved by an earlier Mushaf Studio, in the current shape: removed options mapped to their
 * nearest equivalent (`highlight.style: 'marker'` → `'wash'`, `animation.enter: 'slide-fade'` →
 * `lines: 'rise'`, an enabled `background.glow` → a vignette, ...), numbers outside their new
 * range clamped, the old default font stacks (never loaded) replaced by `'auto'`, and the fields a
 * group lacks filled from `options.defaults` (the composition's own) or the shared defaults, so a
 * payload that sends a group in the old shape, or only part of one, comes out complete. Pure and
 * idempotent; props that need nothing come back as the same object. Anything that is not an object
 * passes through.
 *
 * ```ts
 * migrateMushafProps<MushafRecitationProps>(saved, {defaults: defaultMushafRecitationProps});
 * ```
 */
export const migrateMushafProps = <P>(props: unknown, options: MigrateOptions = {}): P =>
  migrate(props, options).props as P;

/**
 * What `migrateMushafProps()` changes in `props`, field by field (`{path, from, to, reason, code,
 * params}`), for the panel's "What changes" list. Empty for props in the current shape.
 */
export const describeMushafMigration = (props: unknown, options: MigrateOptions = {}): readonly MigrationNote[] =>
  migrate(props, options).notes;

/** Whether `migrateMushafProps()` would change `props`: they were saved by an earlier Mushaf Studio, or lack fields. */
export const mushafPropsNeedMigration = (props: unknown, options: MigrateOptions = {}): boolean =>
  migrate(props, options).notes.length > 0;

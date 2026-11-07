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

/** One change `migrateMushafProps()` makes: where, the value before and after (`undefined`: absent), and why. */
export type MigrationNote = {
  /** Dotted path from the props' root, e.g. `highlight.style`. */
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
  readonly reason: string;
};

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

/** What a group's migrator returns: the new group, and why a field changed where the reason is not the default one. */
type Migrated = {readonly value: Plain; readonly reasons: ReadonlyMap<string, string>};

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
const clampField = (out: Plain, key: string, min: number, max: number, reasons: Map<string, string>): void => {
  const value = out[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  const clamped = Math.min(max, Math.max(min, value));
  if (clamped !== value) {
    out[key] = clamped;
    reasons.set(key, `outside the new range ${min}–${max}: clamped`);
  }
};

/** Replaces `out[key]` when it is exactly one of `from` (a removed value), recording why. */
const mapValue = (
  out: Plain,
  key: string,
  from: Readonly<Record<string, unknown>>,
  reasons: Map<string, string>,
  reason: string,
): void => {
  const value = out[key];
  if (typeof value === 'string' && Object.hasOwn(from, value)) {
    out[key] = from[value];
    reasons.set(key, reason);
  }
};

const removeField = (out: Plain, key: string, reasons: Map<string, string>, reason: string): void => {
  if (!(key in out)) return;
  delete out[key];
  reasons.set(key, reason);
};

/** The opacity a dimming of `dimOthers` becomes as ink: to the 0.05 step, inside 0.5-0.85. */
const restFromDim = (dim: number): number => round2(Math.min(0.85, Math.max(0.5, Math.round(dim / 0.05) * 0.05)));

const KARAOKE_YELLOW = '#ffd166';

const migrateHighlight: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, string>();
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
      reasons.set('style', 'dimming the words still to come is the ink mark');
      reasons.set('restOpacity', 'the dimming of the words still to come, inside 0.5-0.85');
    } else if (style === 'color' || style === 'glow') {
      out.style = 'tint';
      reasons.set('style', style === 'glow' ? 'the glow is removed: the nearest mark is a tint' : 'renamed: a tint');
    } else if (style === 'marker') {
      out.style = 'wash';
      reasons.set('style', 'the marker box is removed: the nearest mark is a faint wash (one device, no dimming)');
    } else if (style === 'none' && dim < 1) {
      out.style = 'ink';
      out.restOpacity = restFromDim(dim);
      restSet = true;
      reasons.set('style', 'dimming the other words is the ink mark');
      reasons.set('restOpacity', 'the dimming of the other words, inside 0.5-0.85');
    } else if (style === 'none') {
      out.mode = 'none';
      out.style = 'ink';
      reasons.set('mode', 'style none marked nothing: nothing follows the recitation');
      reasons.set('style', 'style none is removed');
    }
    if (!restSet && typeof group.restOpacity !== 'number') out.restOpacity = defaults.restOpacity ?? 0.6;
    if (typeof out.color === 'string' && out.color.toLowerCase() === KARAOKE_YELLOW) {
      out.color = defaultHighlight.color;
      reasons.set('color', 'the Karaoke yellow becomes the antique gold');
    }
    removeField(out, 'dimOthers', reasons, 'removed: restOpacity under the ink mark replaces it');
    removeField(out, 'dimUpcomingOnly', reasons, 'removed: the ink mark only dims what is still to come');
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
  const reasons = new Map<string, string>();
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
        reasons.set('lines', `from ${enter === source ? 'enter' : 'exit'} ${JSON.stringify(source)}`);
      }
    }
    if (!('tempo' in group)) {
      out.tempo = 'calm';
      reasons.set('tempo', 'the scroll curve is removed: one calm tempo');
    }
    removeField(out, 'enter', reasons, 'removed: lines replaces enter and exit');
    removeField(out, 'exit', reasons, 'removed: lines replaces enter and exit');
    removeField(out, 'scroll', reasons, 'removed: the window scrolls on the calm curve');
  }
  clampField(out, 'leadInSeconds', 0, 2, reasons);
  return {value: out, reasons};
};

const migrateLayout: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, string>();
  const out = filled(group, defaults);
  if (!('frame' in group)) reasons.set('frame', 'new: no border');
  clampField(out, 'neighbourOpacity', 0.15, 0.5, reasons);
  return {value: out, reasons};
};

/** The old default font stacks, never loaded as web fonts: `'auto'` loads one. */
const OLD_TRANSLATION_FONT = 'Georgia, "Noto Serif", serif';
const OLD_GLOSS_FONT = '"Noto Sans", "Helvetica Neue", Arial, sans-serif';
const NEVER_LOADED = 'the old default font stack was never loaded: auto loads the design’s font';

const migrateText: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, string>();
  const out = filled(group, defaults);
  mapValue(out, 'translationFont', {[OLD_TRANSLATION_FONT]: 'auto'}, reasons, NEVER_LOADED);
  mapValue(out, 'glossFont', {[OLD_GLOSS_FONT]: 'auto'}, reasons, NEVER_LOADED);
  return {value: out, reasons};
};

const migrateOverlay: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, string>();
  const out = filled(group, defaults);
  clampField(out, 'introSeconds', 2, 6, reasons);
  mapValue(out, 'font', {[OLD_TRANSLATION_FONT]: 'auto'}, reasons, NEVER_LOADED);
  return {value: out, reasons};
};

const migrateLegend: GroupMigrator = (group, defaults) => ({value: filled(group, defaults), reasons: new Map()});

const migrateBackground: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, string>();
  const out = filled(group, defaults);
  const kenBurns = group.kenBurns;
  const legacy =
    'glow' in group ||
    !('vignette' in group) ||
    (typeof kenBurns === 'string' && (LEGACY_KEN_BURNS as readonly string[]).includes(kenBurns)) ||
    (typeof group.kenBurnsScale === 'number' && group.kenBurnsScale > 1.05);
  mapValue(
    out,
    'kenBurns',
    {'pan-left': 'slow-zoom', 'pan-right': 'slow-zoom'},
    reasons,
    'the pans are removed: a very slow zoom',
  );
  clampField(out, 'kenBurnsScale', 1, 1.05, reasons);
  const glow = group.glow;
  if (isPlain(glow) && glow.enabled === true) {
    const vignette = typeof group.vignette === 'number' ? group.vignette : 0;
    out.vignette = Math.max(vignette, 0.15);
    reasons.set('vignette', 'the glow is removed: a vignette keeps the light on the lines');
  } else if (!('vignette' in group)) {
    reasons.set('vignette', 'new: no vignette');
  }
  removeField(out, 'glow', reasons, 'removed: nothing follows the audio level');
  // An old gradient that was never painted (the kind is not gradient) is the old teal: the new
  // default replaces it, so picking the gradient kind later starts from the ground's own shade.
  if (
    legacy &&
    out.kind !== 'gradient' &&
    JSON.stringify(out.gradient) !== JSON.stringify(defaultBackground.gradient)
  ) {
    out.gradient = defaultBackground.gradient;
    reasons.set('gradient', 'not painted (the kind is not gradient): the new default gradient');
  }
  return {value: out, reasons};
};

const migratePageView: GroupMigrator = (group, defaults) => {
  const reasons = new Map<string, string>();
  const out = filled(group, defaults);
  mapValue(out, 'lineHighlight', {underline: 'band'}, reasons, 'the underline is removed: a faint band');
  mapValue(out, 'frame', {ornate: 'simple'}, reasons, 'the corner ornaments are removed: the double rule');
  mapValue(out, 'turn', {slide: 'fade'}, reasons, 'the slide is removed: a dissolve');
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
      const reason =
        reasons.get(field) ?? (from === undefined ? 'missing: filled with its default' : 'changed by the migration');
      notes.push({path: `${key}.${field}`, from, to, reason});
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
 * What `migrateMushafProps()` changes in `props`, field by field (`{path, from, to, reason}`), for
 * the panel's "What changes" list. Empty for props in the current shape.
 */
export const describeMushafMigration = (props: unknown, options: MigrateOptions = {}): readonly MigrationNote[] =>
  migrate(props, options).notes;

/** Whether `migrateMushafProps()` would change `props`: they were saved by an earlier Mushaf Studio, or lack fields. */
export const mushafPropsNeedMigration = (props: unknown, options: MigrateOptions = {}): boolean =>
  migrate(props, options).notes.length > 0;

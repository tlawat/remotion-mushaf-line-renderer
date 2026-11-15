// Looks: one-click style presets. A look is a ground, an ink, one metal and one mark: a nested
// partial of the style groups only (theme, customTheme, layout, animation, highlight, text, overlay,
// legend, background), never of the content (audio, timings, ayah range, splits, the files the text
// group points at), so applying one changes how a video looks and nothing of what it says. The frame
// shape is the separate Format control (`MUSHAF_FORMATS`, `applyFormat()`), and look and format
// commute. Pure data and pure functions: the panel's Look tab applies them through
// `saveDefaultProps`, a developer can apply them to props in code (render-design.md section 6).
import type {Background} from '../background/schema';
import {MushafStudioError} from '../errors';
import type {Animation, CustomTheme, Highlight, Layout, Legend, Overlay, RecitationText, ThemeName} from '../schema';

/** The compositions a look can be applied to. */
export type MushafLookKind = 'recitation' | 'ayah-text' | 'passage';

/** The prop groups a look may set, in the order the Props sidebar shows them. */
export const LOOK_GROUPS = [
  'theme',
  'customTheme',
  'layout',
  'animation',
  'highlight',
  'text',
  'overlay',
  'legend',
  'background',
] as const;

/**
 * What a look sets: any field of the style groups. The file fields of `text` (`translationFile`,
 * `glossFile`, `transliterationFile`) and the translation layers are content and are left out of
 * the type; of `overlay`, `legend` and `background` only the colours, the font, the legend's place
 * and the vignette are a look's.
 */
export type MushafLookPatch = {
  readonly theme?: ThemeName | undefined;
  readonly customTheme?:
    | (Partial<Omit<CustomTheme, 'override'>> & {readonly override?: Partial<CustomTheme['override']> | undefined})
    | undefined;
  readonly layout?: Partial<Layout> | undefined;
  readonly animation?: Partial<Animation> | undefined;
  readonly highlight?: Partial<Highlight> | undefined;
  readonly text?:
    | Partial<Omit<RecitationText, 'translationFile' | 'glossFile' | 'transliterationFile' | 'translations'>>
    | undefined;
  readonly overlay?: Partial<Pick<Overlay, 'color' | 'font'>> | undefined;
  readonly legend?: Partial<Pick<Legend, 'show' | 'position' | 'names'>> | undefined;
  readonly background?: Partial<Pick<Background, 'color' | 'vignette'>> | undefined;
};

/** A named style preset, named and described in English and in Arabic. */
export type MushafLook = {
  readonly id: string;
  readonly name: string;
  /** The Arabic name, shown with the English one (in Amiri). */
  readonly nameAr: string;
  /** One sentence, shown under the name. */
  readonly description: string;
  /** The same sentence in Arabic, for the panel in Arabic. */
  readonly descriptionAr: string;
  /** The compositions the look is designed for; the panel shows a look only on these. */
  readonly applies: readonly MushafLookKind[];
  readonly patch: MushafLookPatch;
};

/**
 * The fields a look never sets: where the lines and the translation sit (`layout.verticalAlign`,
 * `layout.offsetY`, `layout.marginX`, `text.translationOffsetY`) is the user's to place, and a frame
 * look applied after it would move it.
 */
export const LOOK_POSITION_FIELDS = [
  'layout.verticalAlign',
  'layout.offsetY',
  'layout.marginX',
  'text.translationOffsetY',
] as const;

/** What a look over `theme: 'custom'` keeps of the custom theme: its own ink, silent and rule colours; the rosettes repainted. */
const ROSETTE_OVERRIDE: CustomTheme['override'] = {
  ink: false,
  silent: false,
  rules: false,
  frame: true,
  accent: true,
  detail: true,
  background: true,
};

/**
 * The rosettes of a custom look: their outline and jewel in `metal`, their petals in `petals`, the
 * number disc the ground (`'transparent'` lets whatever is behind the rosette show, a wash included).
 */
const rosettes = (metal: string, petals: string, ground: string): NonNullable<MushafLookPatch['customTheme']> => ({
  base: 'normal',
  frame: metal,
  accent: petals,
  detail: metal,
  background: ground,
  override: ROSETTE_OVERRIDE,
});

/** The fields every look sets alike: the calm dissolve, the loaded fonts, no legacy page image. */
const SHARED = {
  animation: {lines: 'fade'},
  text: {translationFont: 'auto', glossFont: 'auto'},
  overlay: {font: 'auto'},
  layout: {backgroundImage: ''},
} as const satisfies MushafLookPatch;

/**
 * The five looks of the render design (6.2), in the order the panel shows them. The first, Mushaf,
 * is the defaults: `defaultMushafRecitationProps` already looks like it. Each sets only style
 * fields, never the frame shape, `visibleLines`, `leadInSeconds` or what the user positioned
 * (`LOOK_POSITION_FIELDS`). A field a composition does not have (`theme` and `legend` on
 * `<MushafAyahText>`, `highlight` on `<MushafPassage>`) is skipped when the look is applied to it.
 */
export const MUSHAF_LOOKS: readonly MushafLook[] = [
  {
    id: 'mushaf',
    name: 'Mushaf',
    nameAr: 'مصحف',
    description: 'A printed Madinah page: ivory paper, gold-line rosettes, the ink filling in behind the reciter.',
    descriptionAr: 'صفحة مصحف المدينة المطبوع: ورقٌ عاجيّ، وزخارف بخطّ الذهب، والمداد يكتمل خلف القارئ.',
    applies: ['recitation', 'ayah-text', 'passage'],
    patch: {
      theme: 'custom',
      customTheme: rosettes('#8c6c26', '#efe3c4', '#f8f3e6'),
      layout: {...SHARED.layout, background: '#f8f3e6', color: '#1c1a16', neighbourOpacity: 0.3, frame: 'none'},
      animation: {...SHARED.animation, tempo: 'calm'},
      highlight: {mode: 'word', style: 'ink', color: '#b8913a', restOpacity: 0.6},
      text: {...SHARED.text, translationColor: '#5a554c', glossColor: '#6b6458'},
      overlay: {...SHARED.overlay, color: '#5a554c'},
      background: {color: '#f8f3e6', vignette: 0},
    },
  },
  {
    id: 'haram-night',
    name: 'Haram night',
    nameAr: 'ليل الحرم',
    description: 'Warm ivory on charcoal, the ayah held in a faint gold band, slow and still.',
    descriptionAr: 'عاجيّ دافئ على فحميّ، والآية في شريطٍ ذهبيّ خافت، بهدوء وسكون.',
    applies: ['recitation', 'ayah-text', 'passage'],
    patch: {
      theme: 'custom',
      // Petals and disc left clear: the ayah's wash passes behind the rosette (render-design.md V10).
      customTheme: rosettes('#d8b56a', 'transparent', 'transparent'),
      layout: {...SHARED.layout, background: '#121416', color: '#f1eadb', neighbourOpacity: 0.25, frame: 'none'},
      animation: {...SHARED.animation, tempo: 'slow'},
      highlight: {mode: 'ayah', style: 'wash', color: '#d8b56a', restOpacity: 0.6},
      text: {...SHARED.text, translationColor: '#b9b1a2', glossColor: '#8f897d'},
      overlay: {...SHARED.overlay, color: '#b9b1a2'},
      background: {color: '#121416', vignette: 0.22},
    },
  },
  {
    id: 'madinah-green',
    name: 'Madinah green',
    nameAr: 'أخضر المدينة',
    description: "Ivory on the deep green of the Prophet's Mosque, inside a thin gold rule; the ayah followed in ink.",
    descriptionAr: 'عاجيّ على الأخضر العميق داخل إطارٍ ذهبيّ رفيع، والآية تُتابَع بالمداد.',
    applies: ['recitation', 'ayah-text', 'passage'],
    patch: {
      theme: 'custom',
      customTheme: rosettes('#cfae63', '#163225', '#10241b'),
      layout: {...SHARED.layout, background: '#10241b', color: '#eee7d6', neighbourOpacity: 0.25, frame: 'hairline'},
      animation: {...SHARED.animation, tempo: 'calm'},
      highlight: {mode: 'ayah', style: 'ink', color: '#cfae63', restOpacity: 0.6},
      text: {...SHARED.text, translationColor: '#b5ae9c', glossColor: '#8e978c'},
      overlay: {...SHARED.overlay, color: '#b5ae9c'},
      background: {color: '#10241b', vignette: 0.2},
    },
  },
  {
    id: 'tajweed',
    name: 'Tajweed',
    nameAr: 'تجويد',
    description:
      'The tajweed colours untouched on warm paper; the words still to come rest lighter; the legend in its own band.',
    descriptionAr: 'ألوان التجويد كما هي على ورقٍ دافئ، والكلمات القادمة أخفّ، ودليل الألوان في شريطه.',
    applies: ['recitation', 'passage'],
    patch: {
      // The tajweed colours of `light`, its letters untouched; only the rosettes are the gold line
      // drawings of the other looks (they are no reading aid, and pink and mint fills are not gold line work).
      theme: 'custom',
      customTheme: {...rosettes('#8c6c26', '#efe3c4', '#fbf7ee'), base: 'light'},
      layout: {...SHARED.layout, background: '#fbf7ee', color: '#1c1a16', neighbourOpacity: 0.3, frame: 'none'},
      animation: {...SHARED.animation, tempo: 'calm'},
      highlight: {mode: 'word', style: 'ink', color: '#b8913a', restOpacity: 0.7},
      text: {...SHARED.text, translationColor: '#5a554c', glossColor: '#6b6458'},
      overlay: {...SHARED.overlay, color: '#5a554c'},
      legend: {show: true, position: 'bottom-left', names: 'both'},
      background: {color: '#fbf7ee', vignette: 0},
    },
  },
  {
    id: 'learning',
    name: 'Learning',
    nameAr: 'تعلّم',
    description: 'For study: each word turns antique gold as it is recited, with its meaning beneath it.',
    descriptionAr: 'للدراسة: تتلوّن كلّ كلمة بالذهبيّ العتيق عند تلاوتها، ومعناها تحتها.',
    applies: ['recitation', 'passage'],
    patch: {
      theme: 'custom',
      customTheme: rosettes('#8c6c26', '#efe3c4', '#f8f3e6'),
      layout: {...SHARED.layout, background: '#f8f3e6', color: '#1c1a16', neighbourOpacity: 0.4, frame: 'none'},
      animation: {...SHARED.animation, tempo: 'calm'},
      highlight: {mode: 'word', style: 'tint', color: '#b8913a', restOpacity: 0.6},
      text: {
        ...SHARED.text,
        translationPosition: 'below',
        glossPosition: 'interlinear',
        translationColor: '#4a463e',
        glossColor: '#6b6458',
      },
      overlay: {...SHARED.overlay, color: '#5a554c'},
      background: {color: '#f8f3e6', vignette: 0},
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Formats

/** The frame shapes of the Format control, in the order the panel shows them. */
export type MushafFormatId = 'landscape' | 'vertical' | 'square' | 'portrait';

/** A frame shape and the positions that suit it: what the Format control sets. */
export type MushafFormat = {
  readonly id: MushafFormatId;
  readonly name: string;
  readonly nameAr: string;
  readonly aspect: Layout['aspect'];
  /** The side margins this frame reads best with. */
  readonly marginX: number;
  /** Where the lines sit top to bottom in this frame. */
  readonly verticalAlign: number;
};

/** The four formats (render-design.md 6.3): landscape 16:9, vertical 9:16, square 1:1, portrait 4:5. */
export const MUSHAF_FORMATS: readonly MushafFormat[] = [
  {id: 'landscape', name: 'Landscape', nameAr: 'أفقي', aspect: '16:9', marginX: 190, verticalAlign: 0.5},
  {id: 'vertical', name: 'Vertical', nameAr: 'عمودي', aspect: '9:16', marginX: 90, verticalAlign: 0.45},
  {id: 'square', name: 'Square', nameAr: 'مربّع', aspect: '1:1', marginX: 90, verticalAlign: 0.48},
  {id: 'portrait', name: 'Portrait', nameAr: 'طولي', aspect: '4:5', marginX: 90, verticalAlign: 0.47},
];

/** The format of an id, or `null`. */
export const formatById = (id: string): MushafFormat | null => MUSHAF_FORMATS.find((f) => f.id === id) ?? null;

/** The format whose aspect the props have, or `null` for an aspect no format has. */
export const formatOf = (props: {readonly layout?: Pick<Layout, 'aspect'> | undefined}): MushafFormat | null =>
  props.layout === undefined ? null : (MUSHAF_FORMATS.find((f) => f.aspect === props.layout!.aspect) ?? null);

/**
 * What `applyFormat()` changes in `props`: `layout.aspect`, and `layout.marginX` and
 * `layout.verticalAlign` only while they still hold the previous format's recommended values (the
 * format of the props' current aspect), so a position the user chose is kept. `{}` without a layout.
 * `formatId` that names no format is `BAD_STUDIO_PROP`.
 */
export const formatPatchFor = (
  props: {readonly layout?: Pick<Layout, 'aspect' | 'marginX' | 'verticalAlign'> | undefined},
  formatId: string,
): MushafLookPatch => {
  const next = formatById(formatId);
  if (next === null) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `There is no format ${JSON.stringify(formatId)}; pick one of ${MUSHAF_FORMATS.map((f) => f.id).join(', ')}.`,
      {prop: 'format', value: formatId},
    );
  }
  const layout = props.layout;
  if (layout === undefined) return {};
  const previous = formatOf(props);
  return {
    layout: {
      aspect: next.aspect,
      ...(previous !== null && layout.marginX === previous.marginX ? {marginX: next.marginX} : {}),
      ...(previous !== null && layout.verticalAlign === previous.verticalAlign
        ? {verticalAlign: next.verticalAlign}
        : {}),
    },
  };
};

/**
 * `props` in the format `formatId` (`formatPatchFor()`): the aspect, and the margins and the
 * vertical place where the user had not moved them. It never sets `visibleLines` or anything a
 * look sets, so `applyFormat(applyLook(p, look), f)` equals `applyLook(applyFormat(p, f), look)`.
 *
 * ```ts
 * applyFormat(defaultMushafRecitationProps, 'vertical').layout; // 9:16, marginX 90, verticalAlign 0.45
 * ```
 */
export const applyFormat = <P extends Plain>(props: P, formatId: string): P =>
  merge(props, formatPatchFor(props as never, formatId) as Plain) as P;

// ---------------------------------------------------------------------------------------------
// Looks by id, the old ones included

/** The looks before the render design, by id: the look (or, for the two frame looks, the format) each became. */
export const LEGACY_LOOK_IDS: Readonly<Record<string, string>> = {
  classic: 'mushaf',
  'tajweed-light': 'tajweed',
  night: 'haram-night',
  'black-gold': 'haram-night',
  sepia: 'mushaf',
  study: 'learning',
  karaoke: 'mushaf',
  reel: 'vertical',
  square: 'square',
};

/** A format as a look: its recommended aspect, margins and vertical place, for `lookById()` of a frame look. */
const formatAsLook = (format: MushafFormat): MushafLook => ({
  id: format.id,
  name: format.name,
  nameAr: format.nameAr,
  description: `The ${format.name.toLowerCase()} ${format.aspect} frame (a format: applyFormat() keeps a position you chose).`,
  descriptionAr: `الإطار ${format.nameAr} ${format.aspect}.`,
  applies: ['recitation', 'ayah-text', 'passage'],
  patch: {layout: {aspect: format.aspect, marginX: format.marginX, verticalAlign: format.verticalAlign}},
});

/**
 * The look of `id`, an old look's id mapped to what replaced it (`LEGACY_LOOK_IDS`) with one
 * `console.warn` naming both: `classic` is Mushaf, `night` Haram night, ... `reel` and `square`
 * were frame shapes and return their format's patch as a look (prefer `applyFormat()`, which keeps a
 * position the user chose). `null` for an id that is neither.
 *
 * ```ts
 * applyLook(props, lookById('haram-night')!);
 * ```
 */
export const lookById = (id: string): MushafLook | null => {
  const look = MUSHAF_LOOKS.find((entry) => entry.id === id);
  if (look !== undefined) return look;
  const replacement = LEGACY_LOOK_IDS[id];
  if (replacement === undefined) return null;
  const format = formatById(replacement);
  // The one notice an old id gets, so a saved preset name keeps working.
  console.warn(
    `The look "${id}" was replaced by the ${format === null ? 'look' : 'format'} "${replacement}" (Mushaf Studio 0.2.0).`,
  );
  return format === null ? (MUSHAF_LOOKS.find((entry) => entry.id === replacement) ?? null) : formatAsLook(format);
};

/** The looks designed for a composition, in `MUSHAF_LOOKS` order. */
export const looksFor = (kind: MushafLookKind): readonly MushafLook[] =>
  MUSHAF_LOOKS.filter((look) => look.applies.includes(kind));

/**
 * `look` as a drop-in slot applies it: without `layout.aspect`, since the template's box decides the
 * slot's size (a slot resolver returns none). The look itself when it sets no aspect (none of the
 * five does; a format's look from `lookById('reel')` does).
 *
 * ```ts
 * lookInBox(lookById('reel')!).patch.layout; // {marginX, verticalAlign}: not its 9:16 frame
 * ```
 */
export const lookInBox = (look: MushafLook): MushafLook => {
  const layout = look.patch.layout;
  if (layout === undefined || !('aspect' in layout)) return look;
  const {aspect: _aspect, ...rest} = layout;
  const {layout: _layout, ...others} = look.patch;
  return {...look, patch: Object.keys(rest).length > 0 ? {...others, layout: rest} : others};
};

type Plain = Readonly<Record<string, unknown>>;

const isPlainObject = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `patch` without the keys `base` does not have, at every depth: what the composition can take of it. */
const restrict = (base: Plain, patch: Plain): Record<string, unknown> => {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !(key in base)) continue;
    const current = base[key];
    if (isPlainObject(value)) {
      if (isPlainObject(current)) kept[key] = restrict(current, value);
      continue;
    }
    kept[key] = value;
  }
  return kept;
};

const merge = (base: Plain, patch: Plain): Record<string, unknown> => {
  const merged: Record<string, unknown> = {...base};
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key];
    merged[key] = isPlainObject(current) && isPlainObject(value) ? merge(current, value) : value;
  }
  return merged;
};

/** `props`' own values at every path `patch` sets. */
const pick = (props: Plain, patch: Plain): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const current = props[key];
    picked[key] = isPlainObject(value) && isPlainObject(current) ? pick(current, value) : current;
  }
  return picked;
};

const equal = (props: Plain, patch: Plain): boolean =>
  Object.entries(patch).every(([key, value]) => {
    const current = props[key];
    if (isPlainObject(value)) return isPlainObject(current) && equal(current, value);
    return JSON.stringify(current) === JSON.stringify(value);
  });

/**
 * What of `look` applies to these props: its patch without the fields the composition does not
 * have. `<MushafAyahText>` has no `theme` or `legend`, so Haram night gives it only the page, ink,
 * mark and labels.
 */
export const lookPatchFor = (props: Plain, look: MushafLook): MushafLookPatch =>
  restrict(props, look.patch as Plain) as MushafLookPatch;

/**
 * `props` with the look applied: its patch merged in group by group (`{layout: {aspect}}` keeps
 * the other layout fields), skipping fields the composition does not have. A new object; `props`
 * is not changed.
 *
 * ```ts
 * const night = applyLook(defaultMushafRecitationProps, lookById('haram-night')!);
 * ```
 */
export const applyLook = <P extends Plain>(props: P, look: MushafLook): P =>
  merge(props, lookPatchFor(props, look) as Plain) as P;

/** Whether `props` already look like `look`: every field it sets (that the composition has) is equal. */
export const lookMatches = (props: Plain, look: MushafLook): boolean => {
  const patch = lookPatchFor(props, look) as Plain;
  return Object.keys(patch).length > 0 && equal(props, patch);
};

/**
 * The props' current values of every field `look` would change: applied after the look, this
 * patch puts the props back as they were (the panel's Undo).
 */
export const lookUndoPatch = (props: Plain, look: MushafLook): MushafLookPatch =>
  pick(props, lookPatchFor(props, look) as Plain) as MushafLookPatch;

/** `patch` with only the leaves at which `props` still hold `applied`'s value (`applied` gives the paths). */
const stillHeld = (props: Plain, applied: Plain, patch: Plain): Record<string, unknown> | null => {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(applied)) {
    if (!(key in patch)) continue;
    const current = props[key];
    const before = patch[key];
    if (isPlainObject(value)) {
      if (!isPlainObject(current) || !isPlainObject(before)) continue;
      const nested = stillHeld(current, value, before);
      if (nested !== null) kept[key] = nested;
    } else if (JSON.stringify(current) === JSON.stringify(value)) {
      kept[key] = before;
    }
  }
  return Object.keys(kept).length === 0 ? null : kept;
};

/**
 * What undoing a look applied earlier puts back: `before` (its `lookUndoPatch()`, taken before it was
 * applied) at only the fields that still hold what the look set (`applied`, its `lookPatchFor()`),
 * so a field changed since (in the Props sidebar, by another look) keeps its new value. `null` when
 * every field the look set has changed since: there is nothing of it left to undo.
 */
export const lookRevertPatch = (
  props: Plain,
  applied: MushafLookPatch,
  before: MushafLookPatch,
): MushafLookPatch | null => stillHeld(props, applied as Plain, before as Plain) as MushafLookPatch | null;

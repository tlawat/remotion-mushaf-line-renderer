// Looks: one-click style presets. A look is a nested partial of the style groups only (theme,
// customTheme, layout, animation, highlight, text), never of the content (audio, timings, ayah
// range, splits, the files the text group points at), so applying one changes how a video looks
// and nothing of what it says. Pure data and pure functions: the panel's Look tab applies them
// through `saveDefaultProps`, a developer can apply them to props in code.
import type {Animation, CustomTheme, Highlight, Layout, Text, ThemeName} from '../schema';

/** The compositions a look can be applied to. */
export type MushafLookKind = 'recitation' | 'ayah-text' | 'passage';

/** The prop groups a look may set, in the order the Props sidebar shows them. */
export const LOOK_GROUPS = ['theme', 'customTheme', 'layout', 'animation', 'highlight', 'text'] as const;

/**
 * What a look sets: any field of the style groups. The file fields of `text` (`translationFile`,
 * `glossFile`, `transliterationFile`) and the translation layers are content and are left out of the type.
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
    | Partial<Omit<Text, 'translationFile' | 'glossFile' | 'transliterationFile' | 'translations'>>
    | undefined;
};

/** A named style preset. */
export type MushafLook = {
  readonly id: string;
  readonly name: string;
  /** One sentence, shown under the name. */
  readonly description: string;
  /** The compositions the look is designed for; the panel shows a look only on these. */
  readonly applies: readonly MushafLookKind[];
  readonly patch: MushafLookPatch;
};

/**
 * The looks the panel offers. Each is a whole design rather than a single setting, and sets only
 * what that design needs: a look that changes the frame leaves the colours alone, and the reverse.
 * A field a composition does not have (`theme` on `<MushafAyahText>`, `highlight` on
 * `<MushafPassage>`) is skipped when the look is applied to it.
 */
export const MUSHAF_LOOKS: readonly MushafLook[] = [
  {
    id: 'classic',
    name: 'Classic page',
    description: 'Ink on a cream page, the current word in gold, three lines on screen.',
    applies: ['recitation', 'ayah-text', 'passage'],
    patch: {
      theme: 'plain',
      layout: {visibleLines: 3, neighbourOpacity: 0.45, background: '#fbf7ee', color: '#1b1b1b', backgroundImage: ''},
      animation: {enter: 'slide-fade', exit: 'slide-fade'},
      highlight: {mode: 'word', style: 'color', color: '#c8a45c', dimOthers: 1, dimUpcomingOnly: false},
      text: {translationColor: '#4a4a4a', glossColor: '#6a6a6a'},
    },
  },
  {
    id: 'tajweed-light',
    name: 'Tajweed light',
    description: 'The tajweed colours on a white page; the words still to come are dimmed instead of a coloured mark.',
    applies: ['recitation', 'passage'],
    patch: {
      theme: 'light',
      layout: {background: '#ffffff', color: '#1b1b1b', backgroundImage: ''},
      highlight: {mode: 'word', style: 'none', dimOthers: 0.4, dimUpcomingOnly: true},
      text: {translationColor: '#4a4a4a', glossColor: '#6a6a6a'},
    },
  },
  {
    id: 'night',
    name: 'Night',
    description: 'The dark tajweed theme on a deep blue-black page, the current word glowing.',
    applies: ['recitation', 'ayah-text', 'passage'],
    patch: {
      theme: 'dark',
      layout: {background: '#101418', color: '#e8e2d6', backgroundImage: ''},
      highlight: {mode: 'word', style: 'glow', color: '#f2c66d', dimOthers: 1},
      text: {translationColor: '#b8b2a6', glossColor: '#8e98a3'},
    },
  },
  {
    id: 'black-gold',
    name: 'Black & gold',
    description: 'Warm white on black, the ayah rosettes and the current word in gold.',
    applies: ['recitation', 'ayah-text', 'passage'],
    patch: {
      theme: 'custom',
      customTheme: {
        base: 'normal',
        frame: '#d4af37',
        accent: '#d4af37',
        detail: '#d4af37',
        override: {ink: false, silent: false, rules: false, frame: true, accent: true, detail: true, background: false},
      },
      layout: {background: '#000000', color: '#f5efe0', backgroundImage: ''},
      highlight: {mode: 'word', style: 'color', color: '#d4af37', dimOthers: 1},
      text: {translationColor: '#d9c58f', glossColor: '#a89a74'},
    },
  },
  {
    id: 'sepia',
    name: 'Sepia',
    description: 'The sepia tajweed theme on an old-paper page, a soft marker behind the current word.',
    applies: ['recitation', 'ayah-text', 'passage'],
    patch: {
      theme: 'sepia',
      layout: {background: '#f3e6cc', color: '#3b2a1a', backgroundImage: ''},
      highlight: {mode: 'word', style: 'marker', color: '#c8964a', dimOthers: 1},
      text: {translationColor: '#5a4632', glossColor: '#7a6650'},
    },
  },
  {
    id: 'reel',
    name: 'Reel 9:16',
    description: 'A vertical frame for reels and stories: one line at a time, wide margins, the translation below.',
    applies: ['recitation', 'ayah-text', 'passage'],
    patch: {
      layout: {aspect: '9:16', visibleLines: 0, marginX: 140, verticalAlign: 0.45, offsetY: 0},
      animation: {enter: 'fade', exit: 'fade'},
      text: {translationPosition: 'below', translationSize: 44, translationOffsetY: 0},
    },
  },
  {
    id: 'square',
    name: 'Square post 1:1',
    description: 'A square frame for a feed post: three lines, the neighbours faint, the translation below.',
    applies: ['recitation', 'ayah-text', 'passage'],
    patch: {
      layout: {aspect: '1:1', visibleLines: 3, neighbourOpacity: 0.35, marginX: 80, verticalAlign: 0.45, offsetY: 0},
      text: {translationPosition: 'below', translationSize: 36, translationOffsetY: 0},
    },
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    description: 'A bright marker that walks word by word, the other words dimmed.',
    applies: ['recitation', 'ayah-text'],
    patch: {
      highlight: {mode: 'word', style: 'marker', color: '#ffd166', dimOthers: 0.35, dimUpcomingOnly: false},
      animation: {enter: 'fade', exit: 'fade'},
    },
  },
  {
    id: 'study',
    name: 'Study',
    description: 'For learning: the translation below, a readable gloss strip, the current word in teal.',
    applies: ['recitation', 'passage'],
    patch: {
      layout: {visibleLines: 3, neighbourOpacity: 0.6},
      highlight: {mode: 'word', style: 'color', color: '#1f7a8c', dimOthers: 1},
      text: {
        translationPosition: 'below',
        translationSize: 36,
        translationColor: '#3d3d3d',
        glossSize: 30,
        glossColor: '#1f7a8c',
      },
    },
  },
];

/** The looks designed for a composition, in `MUSHAF_LOOKS` order. */
export const looksFor = (kind: MushafLookKind): readonly MushafLook[] =>
  MUSHAF_LOOKS.filter((look) => look.applies.includes(kind));

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
 * have. `<MushafAyahText>` has no `theme`, so Night gives it only the page, ink and highlight.
 */
export const lookPatchFor = (props: Plain, look: MushafLook): MushafLookPatch =>
  restrict(props, look.patch as Plain) as MushafLookPatch;

/**
 * `props` with the look applied: its patch merged in group by group (`{layout: {aspect}}` keeps
 * the other layout fields), skipping fields the composition does not have. A new object; `props`
 * is not changed.
 *
 * ```ts
 * const reel = applyLook(defaultMushafRecitationProps, MUSHAF_LOOKS.find((l) => l.id === 'reel')!);
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

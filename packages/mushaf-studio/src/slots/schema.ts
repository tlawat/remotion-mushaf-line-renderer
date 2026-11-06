// The drop-in slots' props: a composition's own schema made nullable (a template holds `null` until
// a recitation is picked), and defaults that paint nothing behind the text, since the template
// paints its own background.
import {defaultBackground} from '../background/schema';
import {
  defaultMushafRecitationProps,
  type MushafRecitationProps,
  mushafRecitationSchema,
} from '../compositions/recitation/schema';
import {defaultMushafPageProps, type MushafPageProps, mushafPageSchema} from '../page/schema';
import {defaultMushafAyahTextProps, type MushafAyahTextProps, mushafAyahTextSchema} from '../unicode/schema';

/** The compositions a slot can hold: `<MushafRecitation>`, `<MushafAyahText>` or `<MushafPage>`. */
export type MushafSlotKind = 'recitation' | 'ayah-text' | 'page';

/** The props each kind of slot holds. */
export type MushafSlotPropsOf = {
  readonly recitation: MushafRecitationProps;
  readonly 'ayah-text': MushafAyahTextProps;
  readonly page: MushafPageProps;
};

/**
 * A template's field for `<MushafRecitationSlot>`: `<MushafRecitation>`'s props, or `null` while no
 * recitation is picked (the panel then opens on Source, and its first save writes complete props).
 *
 * ```ts
 * const templateSchema = z.object({title: z.string(), mushaf: mushafRecitationSlotSchema});
 * ```
 */
export const mushafRecitationSlotSchema = mushafRecitationSchema.nullable();

/** A template's field for `<MushafAyahTextSlot>`: `<MushafAyahText>`'s props, or `null`. */
export const mushafAyahTextSlotSchema = mushafAyahTextSchema.nullable();

/** A template's field for `<MushafPageSlot>`: `<MushafPage>`'s props, or `null`. */
export const mushafPageSlotSchema = mushafPageSchema.nullable();

/** No page colour, no background: what the slot paints behind the text is the template's. */
const TRANSPARENT = 'transparent';
const transparentBackground = {...defaultBackground, kind: 'color' as const, color: TRANSPARENT};

/**
 * `defaultMushafRecitationProps` with transparent backgrounds (`layout.background` and
 * `background.color`): the slot's box shows the template behind the lines. The sample recitation is
 * kept, so a template that starts from these shows something at once.
 */
export const defaultMushafRecitationSlotProps: MushafRecitationProps = {
  ...defaultMushafRecitationProps,
  layout: {...defaultMushafRecitationProps.layout, background: TRANSPARENT},
  background: transparentBackground,
};

/** `defaultMushafAyahTextProps` with transparent backgrounds, as `defaultMushafRecitationSlotProps`. */
export const defaultMushafAyahTextSlotProps: MushafAyahTextProps = {
  ...defaultMushafAyahTextProps,
  layout: {...defaultMushafAyahTextProps.layout, background: TRANSPARENT},
  background: transparentBackground,
};

/** `defaultMushafPageProps` with transparent backgrounds, as `defaultMushafRecitationSlotProps`. */
export const defaultMushafPageSlotProps: MushafPageProps = {
  ...defaultMushafPageProps,
  layout: {...defaultMushafPageProps.layout, background: TRANSPARENT},
  background: transparentBackground,
};

/** The slot defaults of each kind. */
export const MUSHAF_SLOT_DEFAULTS: {readonly [K in MushafSlotKind]: MushafSlotPropsOf[K]} = {
  recitation: defaultMushafRecitationSlotProps,
  'ayah-text': defaultMushafAyahTextSlotProps,
  page: defaultMushafPageSlotProps,
};

/**
 * What a slot of `kind` holds before its first source: the slot defaults with no audio, timings or
 * text file, so a first save of anything (a look, say) writes complete props that show nothing
 * until a recitation is picked, rather than the sample.
 */
export const emptySlotPropsFor = <K extends MushafSlotKind>(kind: K): MushafSlotPropsOf[K] => {
  const defaults = MUSHAF_SLOT_DEFAULTS[kind];
  return {
    ...defaults,
    audioFile: '',
    timingsFile: '',
    ...('textFile' in defaults ? {textFile: ''} : {}),
    resolved: null,
  };
};

// Drop-in slots: a recitation, an ayah text or a page inside a template's own composition. The
// nullable schemas and transparent defaults (schema.ts), the resolvers a template's
// `calculateMetadata()` calls (resolve.ts) and the slot components (MushafSlot.tsx).
export {
  MushafAyahTextSlot,
  type MushafAyahTextSlotProps,
  MushafPageSlot,
  type MushafPageSlotProps,
  MushafRecitationSlot,
  type MushafRecitationSlotProps,
  type MushafSlotOptions,
} from './MushafSlot';
export {
  type ResolvedSlot,
  type ResolveSlotOptions,
  resolveMushafAyahTextSlot,
  resolveMushafPageSlot,
  resolveMushafRecitationSlot,
  type SlotResolutionError,
  slotDurationOf,
  slotErrorOf,
} from './resolve';
export {
  defaultMushafAyahTextSlotProps,
  defaultMushafPageSlotProps,
  defaultMushafRecitationSlotProps,
  emptySlotPropsFor,
  MUSHAF_SLOT_DEFAULTS,
  type MushafSlotKind,
  type MushafSlotPropsOf,
  mushafAyahTextSlotSchema,
  mushafPageSlotSchema,
  mushafRecitationSlotSchema,
} from './schema';

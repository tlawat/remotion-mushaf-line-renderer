// The recitation composition (workstream 4): the Zod schema and defaults (schema.ts), the content
// resolver (resolve.ts), `calculateMetadata` (calculate-metadata.ts) and the component.
export {calculateMushafRecitationMetadata, recitationDuration, STUDIO_FPS} from './calculate-metadata';
export {MushafRecitation} from './MushafRecitation';
export {
  type ResolveRecitationOptions,
  readTimings,
  resolveRecitation,
  type StudioResolvedRecitation,
  trimTimings,
} from './resolve';
export type {MushafRecitationProps} from './schema';
export {defaultMushafRecitationProps, mushafRecitationSchema} from './schema';

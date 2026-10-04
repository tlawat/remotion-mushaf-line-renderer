// The recitation composition (workstream 4): the Zod schema and defaults (schema.ts), the content
// resolver (resolve.ts), `calculateMetadata` (calculate-metadata.ts) and the component.
export type {ResolvedRecitation} from '../../types';
export {STUDIO_FPS} from '../shared';
export {
  calculateMushafRecitationMetadata,
  enterSeconds,
  recitationDuration,
  withRecitationAudio,
} from './calculate-metadata';
export {MushafRecitation} from './MushafRecitation';
export {
  audioOffsetFor,
  playableTimings,
  type ResolvedRecitationWithClips,
  type ResolveRecitationOptions,
  readTimings,
  resolveRecitation,
  shiftTimings,
  skipRecitationStart,
  timingsInRange,
  trimTimings,
} from './resolve';
export type {MushafRecitationProps} from './schema';
export {defaultMushafRecitationProps, mushafRecitationSchema} from './schema';

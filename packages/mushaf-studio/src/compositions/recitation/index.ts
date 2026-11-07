// The recitation composition (workstream 4): the Zod schema and defaults (schema.ts), the content
// resolver (resolve.ts), `calculateMetadata` (calculate-metadata.ts) and the component.
export type {ResolvedRecitation} from '../../types';
export {STUDIO_FPS} from '../shared';
export {
  type AyahRef,
  ayahKeysOf,
  crossesSurahs,
  type PassageSpan,
  passageSpan,
  surahOfAyah,
} from '../timings';
export {
  calculateMushafRecitationMetadata,
  enterSeconds,
  firstWordSeconds,
  introDelaySeconds,
  type ResolvedProps,
  type ResolvePropsOptions,
  recitationContentFrames,
  recitationDuration,
  resolveRecitationProps,
  withIntroDelay,
  withRecitationAudio,
} from './calculate-metadata';
export {MushafRecitation} from './MushafRecitation';
export {
  audioOffsetFor,
  delayRecitationStart,
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
export {
  type AyahChange,
  type AyahChangeOptions,
  ayahChanges,
  type BoundaryInputs,
  firstAppearance,
  type LinePlan,
  type LinePlanOptions,
  linesEndFrame,
  linesPresence,
  oneLinePlan,
  recitationEndSeconds,
  type ShownAyah,
  shownAyahAt,
  slotEnd,
} from './transitions';

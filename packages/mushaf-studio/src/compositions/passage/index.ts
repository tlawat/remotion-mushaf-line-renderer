// The passage composition (workstream 4): a text-only passage, no audio. Each line holds
// `holdSeconds`, entering and leaving with the chosen animation, in a window or one at a time.
export {MushafPassage} from './MushafPassage';
export {
  calculateMushafPassageMetadata,
  passageDuration,
  type ResolvedPassage,
  type ResolvePassageOptions,
  resolvePassage,
} from './resolve';
export type {MushafPassageProps} from './schema';
export {defaultMushafPassageProps, mushafPassageSchema} from './schema';

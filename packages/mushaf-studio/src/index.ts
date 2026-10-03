// @tlawat/mushaf-studio: compositions, schemas and the Mushaf panel for Remotion Studio.

// Compositions
export {
  calculateMushafPassageMetadata,
  defaultMushafPassageProps,
  MushafPassage,
  type MushafPassageProps,
  mushafPassageSchema,
} from './compositions/passage';
export {
  calculateMushafRecitationMetadata,
  defaultMushafRecitationProps,
  MushafRecitation,
  type MushafRecitationProps,
  mushafRecitationSchema,
  resolveRecitation,
} from './compositions/recitation';
// Errors
export {isMushafStudioError, MushafStudioError, type MushafStudioErrorCode} from './errors';
// Fonts
export * from './fonts';
// Lines
export {applySplits, doubtfulWords, splitLineAt, wordIdAt} from './lines';
// QUD
export * from './qud';
// Schema
export * from './schema';
// Studio
export {isInStudio, MushafStudioPanel, type MushafStudioPanelProps} from './studio';
// Translations
export * from './translations';
// Types
export type * from './types';

// The translations module (workstream 3): QUL's translation shapes and the studio envelope
// (parse.ts), the open quran.com v4 API (quran-com.ts), the file loader (load.ts) and the two
// components that paint a translation under the lines (one, or a stack of up to three).

export {GlossStrip, type GlossStripProps} from './GlossStrip';
export {loadTranslation} from './load';
export {ayahKeyOf, parseTranslationFile, serialiseTranslation, stripFootnotes} from './parse';
export {
  DEFAULT_QURAN_COM_API,
  fetchQuranComTranslation,
  fetchQuranComWordGloss,
  listQuranComTranslations,
  type QuranComOptions,
  type QuranComResource,
} from './quran-com';
export {TranslationBlock, type TranslationBlockProps} from './TranslationBlock';
export {
  MAX_TRANSLATION_LAYERS,
  type TranslationLayer,
  TranslationStack,
  type TranslationStackProps,
} from './TranslationStack';

// Interlinear glosses: each word's gloss (and transliteration) under that word of the printed line,
// measured from the package's DOM (measure.ts), placed by pure arithmetic (layout.ts), hidden with
// their words under the memorisation modes (visibility.ts) and portalled into each line's row by
// <InterlinearGlosses>.
export {InterlinearGlosses, type InterlinearGlossesProps} from './InterlinearGlosses';
export {
  fitLabelSize,
  INTERLINEAR_MIN_FIT,
  INTERLINEAR_ROW_HEIGHT,
  INTERLINEAR_SIZE_SHARE,
  interlinearExtraHeight,
  interlinearFontSize,
  interlinearLineShift,
  interlinearRowHeight,
  interlinearRows,
  interlinearTop,
  type LabelPlacement,
  placeLabels,
  type WordBox,
} from './layout';
export {isRowVisible, measureRow, ROW_SELECTOR, rowNameOf} from './measure';
export {type GlossVisibility, type GlossVisibilityOptions, glossVisibilityFrom} from './visibility';

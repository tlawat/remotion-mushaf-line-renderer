// The page composition: the whole printed page a recitation is on, followed line by line. The Zod
// schema and defaults (schema.ts), the resolver (resolve.ts), `calculateMetadata`
// (calculate-metadata.ts), the page's geometry (geometry.ts) and the component.
export {calculateMushafPageMetadata, withPageAudio} from './calculate-metadata';
export {
  LINES_PER_PAGE,
  type PageBox,
  type PageGeometry,
  pageBox,
  pageGeometry,
  rowOf,
} from './geometry';
export {MushafPage, OUTSIDE_OPACITY, turnStyle} from './MushafPage';
export {PageFrame, type PageFrameProps} from './PageFrame';
export {
  inRange,
  inRanges,
  PAGE_LEAD_IN_SECONDS,
  type PageLineSlot,
  type PageSlot,
  pageLineAt,
  pageLineSlots,
  type ResolvedPage,
  type ResolvePageOptions,
  rangesOf,
  resolvePage,
  schedulePages,
  skipPageStart,
} from './resolve';
export {
  defaultMushafPageProps,
  defaultPageText,
  defaultPageView,
  LINE_HIGHLIGHTS,
  type MushafPageProps,
  mushafPageSchema,
  PAGE_FRAMES,
  PAGE_TRANSLATION_POSITIONS,
  PAGE_TURNS,
  type PageText,
  type PageView,
  pageTextSchema,
  pageViewSchema,
} from './schema';

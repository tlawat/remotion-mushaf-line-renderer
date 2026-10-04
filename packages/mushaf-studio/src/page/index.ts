// The page composition: the whole printed page a recitation is on, followed line by line. The Zod
// schema and defaults (schema.ts), the resolver (resolve.ts), `calculateMetadata`
// (calculate-metadata.ts), the page's geometry (geometry.ts) and the component.
export {calculateMushafPageMetadata} from './calculate-metadata';
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
  type PageLineSlot,
  type PageSlot,
  pageLineAt,
  pageLineSlots,
  type ResolvedPage,
  type ResolvePageOptions,
  resolvePage,
  schedulePages,
} from './resolve';
export {
  defaultMushafPageProps,
  defaultPageView,
  LINE_HIGHLIGHTS,
  type MushafPageProps,
  mushafPageSchema,
  PAGE_FRAMES,
  PAGE_TURNS,
  type PageView,
  pageViewSchema,
} from './schema';

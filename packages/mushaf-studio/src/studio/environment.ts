import {getRemotionEnvironment, useRemotionEnvironment} from 'remotion';

/** The three flags that tell the Studio's preview from everything else. */
export type StudioEnvironment = Pick<
  ReturnType<typeof getRemotionEnvironment>,
  'isStudio' | 'isRendering' | 'isClientSideRendering'
>;

/**
 * Whether an environment is Remotion Studio's preview: `isStudio` without `isRendering` (the Render
 * button runs the composition with both set) and without `isClientSideRendering` (the Studio's
 * in-browser render through `@remotion/web-renderer`). Not a `<Player>`, not a server. Everything
 * Studio-only in the package is behind this check.
 */
export const isStudioPreview = (environment: StudioEnvironment): boolean =>
  environment.isStudio && !environment.isRendering && !environment.isClientSideRendering;

/**
 * `isStudioPreview()` of the page's globals, for code outside a component (the store, the Studio
 * API wrappers). A component uses `useInStudio()` instead: the Studio's in-browser render says
 * `isClientSideRendering` only through the context that hook reads, never through the globals.
 */
export const isInStudio = (): boolean => isStudioPreview(getRemotionEnvironment());

/** `isStudioPreview()` of `useRemotionEnvironment()`: what a component asks before rendering anything Studio-only. */
export const useInStudio = (): boolean => isStudioPreview(useRemotionEnvironment());

import {getRemotionEnvironment} from 'remotion';

/**
 * `true` inside Remotion Studio's preview: not while the Studio renders (the Render button runs
 * with `isStudio` and `isRendering` both set), not in a `<Player>`, not on a server. Everything
 * Studio-only in the package is behind this check.
 */
export const isInStudio = (): boolean => {
  const environment = getRemotionEnvironment();
  return environment.isStudio && !environment.isRendering;
};

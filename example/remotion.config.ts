/**
 * Applies to the Remotion CLI only (`remotion studio`, `remotion render`, `remotion still`).
 * The render tests use the Node APIs and pass the same options directly.
 *
 * Fonts come from QUL's CDN on first use (70-115 KB per page), and from the fonts packages the
 * compositions import when the CDN fails (the `fonts` prop: 'fallback', 'cdn' or 'package'). For
 * renders that never contact the CDN:
 *   npx remotion render ThreeLines --props='{"fonts":"package"}'
 */
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// The fonts packages reference their files as `new URL('./fonts/p1.woff2', import.meta.url)`, which
// webpack emits as assets. In development Remotion names an asset by its path, which for a package
// outside the project root (a workspace link, as here) starts with `../`, a path the Studio cannot
// serve, so the fallback never worked in the Studio while the CDN was down. A content hash keeps
// every asset under the bundle, in the Studio and in renders.
Config.overrideWebpackConfig((config) => ({
  ...config,
  output: {...config.output, assetModuleFilename: 'assets/[name].[contenthash:8][ext]'},
}));

/**
 * Applies to the Remotion CLI only (`remotion studio`, `remotion render`, `remotion still`).
 * The render tests use the Node APIs and pass the same options directly.
 *
 * Fonts come from QUL's CDN on first use (~300 KB per page). If a cold CDN makes the
 * "waiting for font" delayRender() time out, raise the budget for that render:
 *   npx remotion render ThreeLines --timeout=60000
 * or pin the fonts from the public folder via the `fontFilePattern` prop (see `bun run qul fonts`).
 */
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

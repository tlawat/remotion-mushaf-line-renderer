/**
 * Applies to the Remotion CLI only (`remotion studio`, `remotion render`, `remotion still`).
 *
 * Page fonts come from QUL's CDN on first use (70-115 KB per page), and from the fonts packages the
 * Root registers when the CDN fails (the `fonts` prop: 'fallback', 'cdn' or 'package'). For renders
 * that never contact the CDN:
 *   npx remotion render MushafRecitation --props='{"fonts":"package"}'
 */
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

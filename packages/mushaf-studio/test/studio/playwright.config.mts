import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';

const here = fileURLToPath(new URL('.', import.meta.url));
const appDir = fileURLToPath(new URL('../../../../apps/mushaf-studio/', import.meta.url));

/** The port the smoke test starts the Studio on (not 3000, so a developer's own Studio can stay up). */
export const STUDIO_PORT = 3123;

// Studio smoke suite: starts the end-user app's Remotion Studio headless (both packages must be
// built: `bun run build`; the fonts packages filled: `bun run fonts-packages:fill`) and checks in
// the preinstalled Chromium that the compositions mount and the Mushaf panel is there.
export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: {timeout: 30_000},
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: fileURLToPath(new URL('../../test-results/studio', import.meta.url)),
  use: {
    baseURL: `http://localhost:${STUDIO_PORT}`,
    browserName: 'chromium',
    viewport: {width: 1600, height: 1000},
    launchOptions: {args: ['--enable-features=CanvasDrawElement', '--font-render-hinting=none']},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `bunx remotion studio --no-open --port ${STUDIO_PORT}`,
    cwd: appDir,
    url: `http://localhost:${STUDIO_PORT}/`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});

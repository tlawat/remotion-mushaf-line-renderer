import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';

const here = fileURLToPath(new URL('.', import.meta.url));
const exampleDir = fileURLToPath(new URL('../../../../example/', import.meta.url));

// Browser suite: drives the example's <Player> harness (example/player) in the preinstalled
// Chromium. `pnpm build` must have produced the package's dist first (the example consumes it).
export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: {timeout: 10_000},
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    viewport: {width: 1280, height: 800},
    launchOptions: {
      // The same feature Remotion's renderer enables: canvas presentations need it to call back.
      args: ['--enable-features=CanvasDrawElement', '--font-render-hinting=none'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `bun run --cwd "${exampleDir}" player`,
    url: 'http://localhost:4173/player/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';

const here = fileURLToPath(new URL('.', import.meta.url));
const appDir = fileURLToPath(new URL('..', import.meta.url));

/** The port the suite serves the built page on (not 4174, so a developer's own `preview` can stay up). */
export const WEB_PORT = 4179;

/**
 * A full Chromium, not Playwright's headless shell: the render needs WebCodecs' `VideoEncoder`.
 * `MUSHAF_WEB_CHROMIUM` names another build; without either, Playwright's own Chromium runs.
 */
const chromium = process.env.MUSHAF_WEB_CHROMIUM ?? '/opt/pw-browsers/chromium';

// Web render suite: builds the browser app (`vite build`, the packages' dist/ must exist: `bun run
// build` at the root), serves it with `vite preview` and renders a short recitation to a video file
// in Chromium with `@remotion/web-renderer`, as a visitor's Export step does. See web-render.spec.ts.
export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.ts$/,
  // The render runs frame by frame on the CPU: a dozen seconds of 1080p video takes minutes headless.
  timeout: 1_500_000,
  expect: {timeout: 30_000},
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: fileURLToPath(new URL('../test-results/playwright', import.meta.url)),
  use: {
    baseURL: `http://localhost:${WEB_PORT}/`,
    browserName: 'chromium',
    viewport: {width: 1440, height: 1000},
    acceptDownloads: true,
    launchOptions: {
      ...(existsSync(chromium) ? {executablePath: chromium} : {}),
      // HTTP/2 through a TLS-intercepting proxy stalls on the CDNs' long font and data responses.
      args: ['--disable-http2'],
    },
    // A sandbox that reaches the internet through a proxy (HTTPS_PROXY) hands it to Chromium too, so
    // the catalogue, Tarteel's CDN and QUL's fonts are reachable from the page as from a shell; the
    // page itself (localhost) is not proxied.
    ...(process.env.HTTPS_PROXY
      ? {proxy: {server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1'}, ignoreHTTPSErrors: true}
      : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `bun run build && bun run preview --port ${WEB_PORT} --strictPort`,
    cwd: appDir,
    url: `http://localhost:${WEB_PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});

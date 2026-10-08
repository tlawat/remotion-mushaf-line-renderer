// Web render suite: proves the browser app finishes a real in-browser render. It picks a short
// recitation (Al-Ikhlas, 4 ayahs) in step 1, keeps the default look and no translation, runs the
// Export step's render (`@remotion/web-renderer`, WebCodecs, in the page) and checks the file it
// offers: an MP4 or WebM of more than 50 kB, with a video and an audio track, as long as the page
// said, with the recitation audible in it.
//
// The QUD answers come from a local copy. QUD is slow or out at times (the catalogue can take half
// a minute, the `include_timestamps=true` segments route can end in Cloudflare's 524 after 125 s)
// and the clip streams from a Hugging Face Space that headless Chromium cannot fetch through a
// proxy. So the test downloads the three once (Playwright's request client, which takes the proxy;
// Node's own fetch ignores HTTPS_PROXY) into test-results/web-render/, kept between runs, and answers
// the page's requests for them from there, Range requests and CORS included. The plain segments
// route carries the same word times as the timestamped one. Everything else is live: Tarteel's CDN
// for the mushaf data, QUL's CDN for the page fonts. Without the downloads the test skips, saying why.
// The downloads verify TLS, proxy or not: they are cached and reused, so a tampered answer must not
// get in. Behind a proxy that re-signs HTTPS, give its CA bundle through NODE_EXTRA_CA_CERTS.
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {type BrowserContext, expect, type Route, request, test} from '@playwright/test';

const QUD_API = 'https://aligner.qud.dev/api/v1';
/** The page's default reciter (`DEFAULT_RECITATION_SLUG` in src/sources.ts). */
const SLUG = 'abdul_hamid_ghraio_2025_yt';
/** Al-Ikhlas: four short ayahs, about 11 s of recitation. */
const SURAH = 112;
const CACHE = fileURLToPath(new URL('../test-results/web-render/', import.meta.url));
/** How long the render itself may take: a dozen seconds of 1080p take a few minutes headless. */
const RENDER_TIMEOUT = 1_200_000;

type Fixture = {
  readonly catalogue: Buffer;
  readonly segments: Buffer;
  readonly clip: Buffer;
  /** Where the catalogue says the clip is: the page asks for this URL. */
  readonly clipUrl: URL;
};

// No ignoreHTTPSErrors: a proxy's own CA comes in through NODE_EXTRA_CA_CERTS, which Node (and so
// Playwright's request client) reads at start-up.
const proxied = process.env.HTTPS_PROXY ? {proxy: {server: process.env.HTTPS_PROXY}} : {};

/** What to do about a certificate the downloads could not verify, when that is the failure. */
const certificateHint = (message: string): string =>
  /certificate|self[- ]signed|UNABLE_TO_VERIFY|CERT_/i.test(message) && !process.env.NODE_EXTRA_CA_CERTS
    ? ' (behind a proxy that re-signs HTTPS, set NODE_EXTRA_CA_CERTS to its CA bundle)'
    : '';

/** Downloads `url` into the cache once (written whole, then renamed, so a cut download is not kept). */
const cached = async (
  api: Awaited<ReturnType<typeof request.newContext>>,
  name: string,
  url: string,
  timeout: number,
): Promise<Buffer> => {
  const file = join(CACHE, name);
  if (existsSync(file)) return readFileSync(file);
  const response = await api.get(url, {timeout, failOnStatusCode: false});
  if (!response.ok()) throw new Error(`${url} answered HTTP ${response.status()}`);
  const body = await response.body();
  writeFileSync(`${file}.part`, body);
  renameSync(`${file}.part`, file);
  return body;
};

/** The catalogue, surah 112's segments and its audio clip, from the cache or downloaded; a string says why not. */
const loadFixture = async (): Promise<Fixture | string> => {
  mkdirSync(CACHE, {recursive: true});
  const api = await request.newContext(proxied);
  try {
    const catalogue = await cached(api, 'recitations.json', `${QUD_API}/recitations`, 120_000);
    const segments = await cached(
      api,
      `${SLUG}-${SURAH}.segments.json`,
      `${QUD_API}/recitations/${SLUG}/chapters/${SURAH}/segments`,
      120_000,
    );
    const chapter = JSON.parse(segments.toString('utf8')) as {audio_url?: unknown; segments?: unknown};
    if (typeof chapter.audio_url !== 'string' || !Array.isArray(chapter.segments))
      return `the segments of ${SLUG} ${SURAH} have no audio_url or segments`;
    const clip = await cached(api, `${SLUG}-${SURAH}.mp3`, chapter.audio_url, 180_000);
    const mp3 = clip.subarray(0, 3).toString('latin1') === 'ID3' || (clip[0] === 0xff && (clip[1]! & 0xe0) === 0xe0);
    if (clip.length < 10_000 || !mp3) return `${chapter.audio_url} is not an MP3 clip (${clip.length} bytes)`;
    return {catalogue, segments, clip, clipUrl: new URL(chapter.audio_url)};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${message}${certificateHint(message)}`;
  } finally {
    await api.dispose();
  }
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type',
};

/** Answers a request with `body` as a static server would: CORS, a preflight, and `Range: bytes=…`. */
const serve = (route: Route, body: Buffer, contentType: string): Promise<void> => {
  const req = route.request();
  if (req.method() === 'OPTIONS')
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-allow-headers': '*',
        'access-control-max-age': '600',
      },
    });
  const headers = {...CORS, 'content-type': contentType, 'accept-ranges': 'bytes'};
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers().range ?? '');
  if (!range || (range[1] === '' && range[2] === '')) return route.fulfill({status: 200, headers, body});
  const size = body.length;
  const start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
  const end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(size - 1, Number(range[2]));
  if (start >= size || start > end)
    return route.fulfill({status: 416, headers: {...headers, 'content-range': `bytes */${size}`}});
  return route.fulfill({
    status: 206,
    headers: {...headers, 'content-range': `bytes ${start}-${end}/${size}`},
    body: body.subarray(start, end + 1),
  });
};

/** Routes the page's QUD requests to the fixture; returns how many clip requests it answered. */
const routeQud = async (context: BrowserContext, fixture: Fixture): Promise<{clipRequests: number}> => {
  const counts = {clipRequests: 0};
  await context.route(`${QUD_API}/recitations`, (route) => serve(route, fixture.catalogue, 'application/json'));
  await context.route(
    (url) => url.href.startsWith(`${QUD_API}/recitations/${SLUG}/chapters/${SURAH}/segments`),
    (route) => serve(route, fixture.segments, 'application/json'),
  );
  await context.route(
    (url) => url.hostname === fixture.clipUrl.hostname && url.pathname === fixture.clipUrl.pathname,
    (route) => {
      counts.clipRequests++;
      return serve(route, fixture.clip, 'audio/mpeg');
    },
  );
  return counts;
};

test('the Export step renders surah 112 to a video file in the page', async ({page, context}, testInfo) => {
  test.setTimeout(RENDER_TIMEOUT + 600_000);
  const fixture = await loadFixture();
  if (typeof fixture === 'string') {
    const reason = `No local copy of the QUD catalogue and the surah ${SURAH} clip: ${fixture}`;
    console.log(`[web-render] skipped: ${reason}`);
    test.skip(true, reason);
    return;
  }
  const served = await routeQud(context, fixture);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');

  // Step 1: the reciter, then the surah; the range opens on every ayah.
  const reciter = page.getByRole('combobox', {name: 'Reciter'});
  await expect(reciter).toBeEnabled({timeout: 60_000});
  await reciter.selectOption(SLUG);
  await page.getByRole('combobox', {name: 'Surah'}).selectOption(String(SURAH));
  await expect(page.getByRole('spinbutton', {name: 'From'})).toHaveValue('1', {timeout: 60_000});
  await expect(page.getByRole('spinbutton', {name: 'To'})).toHaveValue('4');

  // The page resolves the video (Tarteel's CDN), then the preview draws the first line (QUL's fonts).
  const exportStep = page.getByRole('region', {name: /Export/});
  const summary = exportStep.getByText(/^\d+×\d+, \d+ fps, \d+:\d{2}\.$/);
  await expect(summary).toBeVisible({timeout: 300_000});
  const [, width, height, fps, minutes, seconds] = /^(\d+)×(\d+), (\d+) fps, (\d+):(\d{2})\.$/
    .exec(await summary.innerText())!
    .map(Number);
  const expectedSeconds = minutes! * 60 + seconds!;
  await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 180_000});

  // Step 4: the format this Chromium can encode (MP4 where it has H.264, else WebM), then the render.
  const renderButton = exportStep.getByRole('button', {name: /^Render (MP4|WEBM) in this browser$/});
  await expect(renderButton).toBeVisible({timeout: 120_000});
  const started = Date.now();
  await renderButton.click();
  const progress = exportStep.getByText(/^Rendering… \d+%$/);
  const ticker = setInterval(() => {
    progress.textContent({timeout: 1_000}).then(
      (text) => console.log(`[web-render] ${Math.round((Date.now() - started) / 1000)} s: ${text}`),
      () => undefined,
    );
  }, 30_000);
  const link = exportStep.getByRole('link', {name: /^Download .+\.(mp4|webm)$/});
  const failure = exportStep.getByText(/^The render failed/);
  try {
    await expect(link.or(failure)).toBeVisible({timeout: RENDER_TIMEOUT});
  } finally {
    clearInterval(ticker);
  }
  if (await failure.isVisible()) throw new Error(await failure.innerText());
  const renderSeconds = Math.round((Date.now() - started) / 1000);

  // The file as a visitor gets it: the download link's blob, saved.
  const href = (await link.getAttribute('href'))!;
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const name = download.suggestedFilename();
  const file = testInfo.outputPath(name);
  await download.saveAs(file);
  const bytes = readFileSync(file);
  const extension = name.slice(name.lastIndexOf('.') + 1);
  expect(bytes.length, `${name} is ${bytes.length} bytes`).toBeGreaterThan(50_000);
  if (extension === 'webm') {
    expect([...bytes.subarray(0, 4)], 'a WebM file starts with the EBML magic').toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(bytes.includes('V_VP'), 'a VP8 or VP9 video track').toBe(true);
    expect(bytes.includes('A_OPUS') || bytes.includes('A_VORBIS'), 'an Opus or Vorbis audio track').toBe(true);
  } else {
    expect(extension).toBe('mp4');
    expect(bytes.subarray(4, 8).toString('latin1'), 'an MP4 file starts with an ftyp box').toBe('ftyp');
    expect(bytes.includes('avc1'), 'an H.264 video track').toBe(true);
    expect(bytes.includes('mp4a') || bytes.includes('Opus'), 'an AAC or Opus audio track').toBe(true);
  }

  // Chromium reads the file back: its length and size, and the recitation's loudness in its audio.
  const media = await page.evaluate(async (url) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`the video does not load: ${video.error?.message ?? 'no detail'}`));
    });
    const data = await (await fetch(url)).arrayBuffer();
    const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(data);
    const samples = audio.getChannelData(0);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      audioSeconds: audio.duration,
      rms: Math.sqrt(sum / samples.length),
    };
  }, href);

  const report = {
    file: name,
    bytes: bytes.length,
    duration: Number(media.duration.toFixed(3)),
    expectedSeconds,
    size: `${media.width}×${media.height}`,
    fps,
    audioSeconds: Number(media.audioSeconds.toFixed(3)),
    audioRms: Number(media.rms.toFixed(4)),
    clipRequests: served.clipRequests,
    renderSeconds,
  };
  console.log(`[web-render] ${JSON.stringify(report)}`);
  await testInfo.attach('web-render.json', {body: JSON.stringify(report, null, 2), contentType: 'application/json'});

  expect(served.clipRequests, 'the page asked for the recitation clip').toBeGreaterThan(0);
  expect(media.width).toBe(width);
  expect(media.height).toBe(height);
  // The page shows the length rounded to the second.
  expect(Math.abs(media.duration - expectedSeconds), `${media.duration} s against ${expectedSeconds} s`).toBeLessThan(
    1,
  );
  expect(media.duration).toBeGreaterThan(5);
  expect(media.audioSeconds).toBeGreaterThan(expectedSeconds - 1);
  // Silence decodes to an RMS of 0: a recitation is well above it.
  expect(media.rms, 'the recitation is audible in the file').toBeGreaterThan(0.005);
  expect(errors, errors.join('\n')).toHaveLength(0);
});

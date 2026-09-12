// Render suite: bundles the example with @remotion/bundler and renders the LineHarness composition
// with @remotion/renderer in the preinstalled Chromium (or MUSHAF_BROWSER_EXECUTABLE). Covers
// determinism across independent renders, settled frames after the entrance, the failure paths, and
// a Lambda-style bundle served under a non-root publicPath.
import {bundle} from '@remotion/bundler';
import {renderFrames, renderStill, selectComposition} from '@remotion/renderer';
import {chromium} from '@playwright/test';
import {createServer, type Server} from 'node:http';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {getMushafLine} from '../../src/get-mushaf-line';
import type {MushafLineData} from '../../src/types';
import {syntheticLine} from '../fixtures/synthetic-lines';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.resolve(here, '../../../../example');
const FIXTURE_FONT = 'fonts/qpc-v4-tajweed/p10.ttf';
const hasFixtureFont = existsSync(path.join(exampleDir, 'public', FIXTURE_FONT));
/** The example's mirror of QUL's two exports (`node scripts/fetch-qul.mjs --data`), served like any public file. */
const MIRROR = {words: 'data/qpc-v4/words.json.zip', layout: 'data/qpc-v4/layout.db.zip'};
const hasMirror = existsSync(path.join(exampleDir, 'public', MIRROR.words)) && existsSync(path.join(exampleDir, 'public', MIRROR.layout));

type ChromeMode = 'headless-shell' | 'chrome-for-testing';

/** Playwright's headless shell next to its Chromium (the same kind of binary Remotion downloads). */
const findHeadlessShell = (chromiumPath: string): string | null => {
  const parts = chromiumPath.split(path.sep);
  const i = parts.findIndex((p) => /^chromium-\d+$/.test(p));
  if (i < 0) return null;
  const root = parts.slice(0, i + 1).join(path.sep).replace(/chromium-(\d+)$/, 'chromium_headless_shell-$1');
  const search = (dir: string, depth: number): string | null => {
    if (depth > 3 || !existsSync(dir)) return null;
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && /^headless_shell(\.exe)?$/.test(entry.name)) return full;
      if (entry.isDirectory()) {
        const found = search(full, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return search(root, 0);
};

// Browser: MUSHAF_BROWSER_EXECUTABLE (+ MUSHAF_CHROME_MODE) if set; else Playwright's headless shell
// (Remotion's default mode); else Playwright's full Chromium in new-headless mode; else let Remotion
// download its own Chrome Headless Shell.
const pickBrowser = (): {browserExecutable: string | null; chromeMode: ChromeMode} => {
  if (process.env.MUSHAF_BROWSER_EXECUTABLE) {
    return {browserExecutable: process.env.MUSHAF_BROWSER_EXECUTABLE, chromeMode: (process.env.MUSHAF_CHROME_MODE as ChromeMode | undefined) ?? 'headless-shell'};
  }
  const full = chromium.executablePath();
  if (!existsSync(full)) return {browserExecutable: null, chromeMode: 'headless-shell'};
  const shell = findHeadlessShell(full);
  return shell ? {browserExecutable: shell, chromeMode: 'headless-shell'} : {browserExecutable: full, chromeMode: 'chrome-for-testing'};
};

const renderer = {...pickBrowser(), logLevel: 'error' as const, chromiumOptions: {}};

type EnterName = 'plain' | 'none' | 'fade' | 'slide' | 'reveal' | 'soft-reveal' | 'slide-fade' | 'dissolve';

type HarnessProps = {
  lines: unknown[];
  enter: EnterName;
  enterFrames: number;
  exit: EnterName;
  exitFrames: number;
  from: number;
  stagger: number;
  durationInFrames: number | null;
  premountFor: number;
  slot: 'stack' | 'same';
  fit: 'line' | 'mushaf';
  fontFile: string | null;
  fontUrl: string | null;
  fontSize: number | null;
  lineHeight: number | null;
  activeWordId: string | number | null;
  dimOthersTo: number | null;
  color: string;
  slice: {ayah?: number; fromAyah?: number; toAyah?: number} | null;
  sliceOnData: boolean;
};

const harnessProps = (overrides: Partial<HarnessProps> = {}): HarnessProps => ({
  lines: [syntheticLine(2, 3), syntheticLine(1, 2), syntheticLine(3, 1)],
  enter: 'plain',
  enterFrames: 20,
  exit: 'plain',
  exitFrames: 20,
  from: 0,
  stagger: 0,
  durationInFrames: null,
  premountFor: 0,
  slot: 'stack',
  fit: 'mushaf', // synthetic lines: keep the fixed type size so frames stay comparable
  fontFile: FIXTURE_FONT,
  fontUrl: null,
  fontSize: null,
  lineHeight: null,
  activeWordId: null,
  dimOthersTo: null,
  color: '#000000',
  slice: null,
  sliceOnData: false,
  ...overrides,
});

let workDir: string;
let serveUrl: string;

const still = async (url: string, inputProps: HarnessProps, frame = 0, timeoutInMilliseconds = 30_000): Promise<Buffer> => {
  const composition = await selectComposition({serveUrl: url, id: 'LineHarness', inputProps, timeoutInMilliseconds, ...renderer});
  const {buffer} = await renderStill({composition, serveUrl: url, inputProps, frame, imageFormat: 'png', output: null, timeoutInMilliseconds, ...renderer});
  if (!buffer) throw new Error('renderStill returned no buffer');
  return buffer;
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.zip': 'application/zip',
  '.db': 'application/vnd.sqlite3',
};

/** Serves `dir` under `prefix` (e.g. /sites/abc/), the way Lambda serves a site bundle. */
const serveUnder = (dir: string, prefix: string): Promise<{server: Server; origin: string}> =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!url.pathname.startsWith(prefix)) {
        res.writeHead(404).end();
        return;
      }
      let file = path.join(dir, decodeURIComponent(url.pathname.slice(prefix.length)));
      if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream'});
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({server, origin: `http://127.0.0.1:${port}`});
    });
  });

/** The example's public folder served at the root, so Node can fetch the mirror by absolute URL. */
let publicServer: {server: Server; origin: string} | null = null;
/** Page 10 line 3 of the tajweed set, resolved once through the runtime loader from the mirror. */
let realLine: MushafLineData | null = null;

describe.skipIf(!hasFixtureFont)('rendering the example with @remotion/renderer', () => {
  beforeAll(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'mushaf-render-'));
    serveUrl = await bundle({
      entryPoint: path.join(exampleDir, 'src/index.ts'),
      publicDir: path.join(exampleDir, 'public'),
      outDir: path.join(workDir, 'bundle'),
    });
    if (hasMirror) {
      publicServer = await serveUnder(path.join(exampleDir, 'public'), '/');
      realLine = await getMushafLine({mushaf: 'qpc-v4-tajweed', page: 10, line: 3, data: {words: `${publicServer.origin}/${MIRROR.words}`, layout: `${publicServer.origin}/${MIRROR.layout}`}});
    }
  });

  afterAll(() => {
    publicServer?.server.close();
    if (workDir) rmSync(workDir, {recursive: true, force: true});
  });

  it('renders a still deterministically across two independent renders, and not blank', async () => {
    const props = harnessProps();
    const a = await still(serveUrl, props);
    const b = await still(serveUrl, props);
    expect(a.equals(b)).toBe(true);
    const blank = await still(serveUrl, harnessProps({lines: []}));
    expect(a.equals(blank)).toBe(false);
    expect(a.length).toBeGreaterThan(blank.length);
    writeFileSync(path.join(here, 'last-still.png'), a);
  });

  it('renders the fade entrance frame by frame, settles, then leaves through the exit', async () => {
    // Sequence of 14 frames: entrance over 0-9, settled at 10, exit over 10-13, gone from 14 on.
    const inputProps = harnessProps({enter: 'fade', enterFrames: 10, exit: 'fade', exitFrames: 4, durationInFrames: 14});
    const composition = await selectComposition({serveUrl, id: 'LineHarness', inputProps, ...renderer});
    const outputDir = path.join(workDir, 'frames');
    await renderFrames({
      composition,
      serveUrl,
      inputProps,
      imageFormat: 'png',
      outputDir,
      frameRange: [0, 16],
      concurrency: 2,
      onStart: () => undefined,
      onFrameUpdate: () => undefined,
      ...renderer,
    });
    const files = readdirSync(outputDir)
      .filter((f) => f.endsWith('.png'))
      .sort((x, y) => Number(x.match(/\d+/)?.[0]) - Number(y.match(/\d+/)?.[0]));
    expect(files).toHaveLength(17);
    const frames = files.map((f) => readFileSync(path.join(outputDir, f)));
    // Frame 0 is fully transparent for the line (opacity 0): identical to an empty harness.
    const blank = await still(serveUrl, harnessProps({lines: []}));
    expect(frames[0]!.equals(blank)).toBe(true);
    // Mid-entrance frames differ from each other and from the settled state.
    expect(frames[3]!.equals(frames[6]!)).toBe(false);
    expect(frames[6]!.equals(frames[10]!)).toBe(false);
    // Settled frame: identical to a plain render of the same lines (the presentations are at rest).
    const plain = await still(serveUrl, harnessProps());
    expect(frames[10]!.equals(plain)).toBe(true);
    // Exit: frame 12 is half faded, and once the Sequence has ended the frames equal the blank one.
    expect(frames[12]!.equals(plain)).toBe(false);
    expect(frames[12]!.equals(blank)).toBe(false);
    for (let i = 14; i < frames.length; i++) expect(frames[i]!.equals(blank)).toBe(true);
  });

  it('renders the smooth defaults deterministically: monotonic, then perfectly still', async () => {
    // slideFade over 10 frames, then 6 settled frames: the frames must change while it moves and be
    // byte-identical once it has arrived (any drift would show up as a different PNG).
    const inputProps = harnessProps({lines: [syntheticLine(2, 3)], enter: 'slide-fade', enterFrames: 10});
    const composition = await selectComposition({serveUrl, id: 'LineHarness', inputProps, ...renderer});
    const outputDir = path.join(workDir, 'smooth');
    await renderFrames({
      composition,
      serveUrl,
      inputProps,
      imageFormat: 'png',
      outputDir,
      frameRange: [0, 15],
      concurrency: 2,
      onStart: () => undefined,
      onFrameUpdate: () => undefined,
      ...renderer,
    });
    const frames = readdirSync(outputDir)
      .filter((f) => f.endsWith('.png'))
      .sort((x, y) => Number(x.match(/\d+/)?.[0]) - Number(y.match(/\d+/)?.[0]))
      .map((f) => readFileSync(path.join(outputDir, f)));
    expect(frames).toHaveLength(16);
    // Moving: every frame of the entrance differs from the one before it.
    for (let i = 1; i <= 9; i++) expect(frames[i]!.equals(frames[i - 1]!)).toBe(false);
    // Settled: frame 10 onwards is exactly the resting render, over and over.
    const settled = await still(serveUrl, harnessProps({lines: [syntheticLine(2, 3)]}));
    for (let i = 10; i < frames.length; i++) expect(frames[i]!.equals(settled)).toBe(true);
    // The first frame is fully transparent, like any other entrance.
    expect(frames[0]!.equals(await still(serveUrl, harnessProps({lines: []})))).toBe(true);
  });

  it('a slice is the same picture as its words set as a centred line, and never changes their size', async () => {
    // Synthetic page 3 line 2 carries 2:3 and 2:4. At fit: 'mushaf' both sides are at the base size,
    // so "collapse and centre" has an exact witness: the kept words, alone, as a centred line.
    const line = syntheticLine(3, 2);
    const sliced = await still(serveUrl, harnessProps({lines: [line], slice: {ayah: 4}}));
    const band = {...line, centered: true, words: line.words.filter((w) => w.ayah === 4)};
    expect(sliced.equals(await still(serveUrl, harnessProps({lines: [band]})))).toBe(true);
    expect(sliced.equals(await still(serveUrl, harnessProps({lines: [line]})))).toBe(false);
    // Carried by the data, the slice paints the same.
    expect(sliced.equals(await still(serveUrl, harnessProps({lines: [{...line, slice: {ayah: 4}}]})))).toBe(true);
  });

  it('a missing font fails the render fast with FONT_HTTP', async () => {
    const started = Date.now();
    await expect(still(serveUrl, harnessProps({fontFile: 'fonts/qpc-v4-tajweed/missing.woff2'}))).rejects.toThrow(/FONT_HTTP|404/);
    expect(Date.now() - started).toBeLessThan(25_000);
  });

  it('an HTML response for the font fails with FONT_INVALID', async () => {
    // The bundle's own index.html, served at the site root.
    await expect(still(serveUrl, harnessProps({fontFile: null, fontUrl: '/index.html'}))).rejects.toThrow(/FONT_INVALID|not a font/);
  });

  it('a stalled font server times out with the labelled delayRender()', async () => {
    const stalled = createServer(() => undefined);
    await new Promise<void>((r) => stalled.listen(0, '127.0.0.1', r));
    const address = stalled.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      await expect(still(serveUrl, harnessProps({fontFile: null, fontUrl: `http://127.0.0.1:${port}/p1.woff2`}), 0, 9_000)).rejects.toThrow(/waiting for font|FONT_TIMEOUT|timed out|timeout/i);
    } finally {
      stalled.close();
    }
  }, 120_000);

  it('a Lambda-style bundle under a non-root publicPath renders the same still', async () => {
    const reference = await still(serveUrl, harnessProps());
    const outDir = path.join(workDir, 'site');
    await bundle({
      entryPoint: path.join(exampleDir, 'src/index.ts'),
      publicDir: path.join(exampleDir, 'public'),
      outDir,
      publicPath: '/sites/abc/',
    });
    const {server, origin} = await serveUnder(outDir, '/sites/abc/');
    try {
      const fromSite = await still(`${origin}/sites/abc/`, harnessProps());
      expect(fromSite.equals(reference)).toBe(true);
    } finally {
      server.close();
    }
  });

  describe.skipIf(!hasMirror)('with the mirrored KFGQPC V4 exports', () => {
    it('renders page 10 line 3 with the fixture font (saved next to this file for visual comparison)', async () => {
      const line = realLine!;
      expect(line.words.length).toBeGreaterThan(3);
      const png = await still(serveUrl, harnessProps({lines: [line], fit: 'line'}));
      writeFileSync(path.join(here, 'p10-l3.png'), png);
      expect(png.length).toBeGreaterThan(1000);
    });

    it('slices a fitted line without changing its size, deterministically', async () => {
      // 2:62 ends and 2:63 begins on page 10 line 3.
      const line = realLine!;
      const whole = await still(serveUrl, harnessProps({lines: [line], fit: 'line'}));
      const sliced = await still(serveUrl, harnessProps({lines: [line], fit: 'line', slice: {ayah: 63}}));
      writeFileSync(path.join(here, 'p10-l3-slice.png'), sliced);
      expect(sliced.equals(whole)).toBe(false);
      expect((await still(serveUrl, harnessProps({lines: [line], fit: 'line', slice: {ayah: 63}}))).equals(sliced)).toBe(true);
      // A slice that keeps every word is the printed line, to the byte.
      expect((await still(serveUrl, harnessProps({lines: [line], fit: 'line', slice: {fromAyah: 62}}))).equals(whole)).toBe(true);
    });

    it('renders the mandala palette and its colours, the letters following CSS color', async () => {
      const line = realLine!;
      const tajweed = await still(serveUrl, harnessProps({lines: [line], fit: 'line'}));
      // The palette and its colours ride on the data, so the renderer needs nothing else; the
      // letters take the page's colour through the palette, exactly as plain glyphs would.
      const mandala = await still(serveUrl, harnessProps({lines: [{...line, palette: 3, paletteColors: {ink: 'currentColor'}}], fit: 'line', color: 'rgb(27, 111, 63)'}));
      writeFileSync(path.join(here, 'p10-l3-mandala.png'), mandala);
      expect(mandala.equals(tajweed)).toBe(false);
      expect(mandala.length).toBeGreaterThan(1000);
      // Same line, same palette, another page colour: a different picture, so `color` really reaches
      // the glyphs of a colour font.
      const black = await still(serveUrl, harnessProps({lines: [{...line, palette: 3, paletteColors: {ink: 'currentColor'}}], fit: 'line', color: '#000000'}));
      expect(black.equals(mandala)).toBe(false);
      // ... and so does a recoloured rosette.
      const gold = await still(serveUrl, harnessProps({lines: [{...line, palette: 3, paletteColors: {ink: 'currentColor', accent: '#c8a45c'}}], fit: 'line', color: '#000000'}));
      expect(gold.equals(black)).toBe(false);
    });
  });
});

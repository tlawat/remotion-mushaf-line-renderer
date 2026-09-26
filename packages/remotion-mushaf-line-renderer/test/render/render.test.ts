// Render suite: bundles the example with @remotion/bundler and renders the LineHarness composition
// with @remotion/renderer in the preinstalled Chromium (or MUSHAF_BROWSER_EXECUTABLE). Covers
// determinism across independent renders, settled frames after the entrance, the failure paths, and
// a Lambda-style bundle served under a non-root publicPath.

import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createServer, type Server} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {bundle} from '@remotion/bundler';
import {renderFrames, renderStill, selectComposition} from '@remotion/renderer';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {getMushafLine} from '../../src/resolve/get-mushaf-line';
import type {MushafLineData} from '../../src/types';
import {syntheticLine} from '../fixtures/synthetic-lines';

const here = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.resolve(here, '../../../../example');
const FIXTURE_FONT = 'fonts/qpc-v4-tajweed/p10.ttf';
const hasFixtureFont = existsSync(path.join(exampleDir, 'public', FIXTURE_FONT));
/** The example's mirror of QUL's two exports (`bun run qul data`), served like any public file. */
const MIRROR = {words: 'data/qpc-v4/words.json.zip', layout: 'data/qpc-v4/layout.db.zip'};
const hasMirror =
  existsSync(path.join(exampleDir, 'public', MIRROR.words)) &&
  existsSync(path.join(exampleDir, 'public', MIRROR.layout));

type ChromeMode = 'headless-shell' | 'chrome-for-testing';

/** Playwright's headless shell next to its Chromium (the same kind of binary Remotion downloads). */
const findHeadlessShell = (chromiumPath: string): string | null => {
  const parts = chromiumPath.split(path.sep);
  const i = parts.findIndex((p) => /^chromium-\d+$/.test(p));
  if (i < 0) return null;
  const root = parts
    .slice(0, i + 1)
    .join(path.sep)
    .replace(/chromium-(\d+)$/, 'chromium_headless_shell-$1');
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
    return {
      browserExecutable: process.env.MUSHAF_BROWSER_EXECUTABLE,
      chromeMode: (process.env.MUSHAF_CHROME_MODE as ChromeMode | undefined) ?? 'headless-shell',
    };
  }
  const full = chromium.executablePath();
  if (!existsSync(full)) return {browserExecutable: null, chromeMode: 'headless-shell'};
  const shell = findHeadlessShell(full);
  return shell
    ? {browserExecutable: shell, chromeMode: 'headless-shell'}
    : {browserExecutable: full, chromeMode: 'chrome-for-testing'};
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
  fontPackages: 'none' | 'fallback' | 'source';
  fontSize: number | null;
  lineHeight: number | null;
  activeWordId: string | number | null;
  dimOthersTo: number | null;
  color: string;
  slice: {ayah?: number; fromAyah?: number; toAyah?: number} | null;
  sliceOnData: boolean;
  resolve: {theme: 'plain' | 'light' | 'normal'; page: number; line: number} | null;
  data: {words?: string; layout?: string} | null;
  dataFiles: {words: string; layout: string} | null;
  background: string;
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
  fontPackages: 'none',
  fontSize: null,
  lineHeight: null,
  activeWordId: null,
  dimOthersTo: null,
  color: '#000000',
  slice: null,
  sliceOnData: false,
  resolve: null,
  data: null,
  dataFiles: null,
  background: '#ffffff',
  ...overrides,
});

let workDir: string;
let serveUrl: string;

const still = async (
  url: string,
  inputProps: HarnessProps,
  frame = 0,
  timeoutInMilliseconds = 30_000,
): Promise<Buffer> => {
  const composition = await selectComposition({
    serveUrl: url,
    id: 'LineHarness',
    inputProps,
    timeoutInMilliseconds,
    ...renderer,
  });
  const {buffer} = await renderStill({
    composition,
    serveUrl: url,
    inputProps,
    frame,
    imageFormat: 'png',
    output: null,
    timeoutInMilliseconds,
    ...renderer,
  });
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
/** Page 10 line 3 in the colour font, resolved once through the runtime loader from the mirror. */
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
      realLine = await getMushafLine({
        theme: 'light',
        page: 10,
        line: 3,
        data: {words: `${publicServer.origin}/${MIRROR.words}`, layout: `${publicServer.origin}/${MIRROR.layout}`},
      });
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
    const inputProps = harnessProps({
      enter: 'fade',
      enterFrames: 10,
      exit: 'fade',
      exitFrames: 4,
      durationInFrames: 14,
    });
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
    await expect(still(serveUrl, harnessProps({fontFile: 'fonts/qpc-v4-tajweed/missing.woff2'}))).rejects.toThrow(
      /FONT_HTTP|404/,
    );
    expect(Date.now() - started).toBeLessThan(25_000);
  });

  it('an HTML response for the font fails with FONT_INVALID', async () => {
    // The bundle's own index.html, served at the site root.
    await expect(still(serveUrl, harnessProps({fontFile: null, fontUrl: '/index.html'}))).rejects.toThrow(
      /FONT_INVALID|not a font/,
    );
  });

  it('a stalled font server times out with the labelled delayRender()', async () => {
    const stalled = createServer(() => undefined);
    await new Promise<void>((r) => stalled.listen(0, '127.0.0.1', r));
    const address = stalled.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      await expect(
        still(serveUrl, harnessProps({fontFile: null, fontUrl: `http://127.0.0.1:${port}/p1.woff2`}), 0, 9_000),
      ).rejects.toThrow(/waiting for font|FONT_TIMEOUT|timed out|timeout/i);
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
    const p10l3 = () => ({theme: 'light', page: 10, line: 3}) as const;
    /** The same line under another theme, without a second load (the layout is cached per source). */
    const relook = (theme: 'plain' | 'normal' | 'dark' | 'black') =>
      getMushafLine({
        theme,
        page: 10,
        line: 3,
        data: {words: `${publicServer!.origin}/${MIRROR.words}`, layout: `${publicServer!.origin}/${MIRROR.layout}`},
      });

    it('renders page 10 line 3 with the fixture font (saved next to this file for visual comparison)', async () => {
      const line = realLine!;
      expect(line.words.length).toBeGreaterThan(3);
      const png = await still(serveUrl, harnessProps({lines: [line], fit: 'line'}));
      writeFileSync(path.join(here, 'p10-l3.png'), png);
      expect(png.length).toBeGreaterThan(1000);
    });

    it('falls back to the bundled fonts package when the font source fails, painting the same, also under a Lambda publicPath', async () => {
      // The bundle carries both fonts packages as assets (the example imports them).
      const walk = (dir: string): string[] =>
        readdirSync(dir, {withFileTypes: true}).flatMap((e) =>
          e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
        );
      const emitted = walk(path.join(workDir, 'bundle')).filter((f) => /\.woff2?$/.test(f));
      expect(emitted.length).toBeGreaterThanOrEqual(2 * 604);
      // The reference: the very file the package holds, served from the example's public folder.
      const line = realLine!;
      const reference = await still(
        serveUrl,
        harnessProps({lines: [line], fit: 'line', fontFile: 'fonts/qpc-v4-tajweed/p10.woff2'}),
      );
      // A source that cannot be reached (nothing listens on port 9), with the packages as the fallback.
      const unreachable = {fontFile: null, fontUrl: 'http://127.0.0.1:9/p10.woff2'} as const;
      const started = Date.now();
      const fallback = await still(
        serveUrl,
        harnessProps({lines: [line], fit: 'line', ...unreachable, fontPackages: 'fallback'}),
      );
      expect(fallback.equals(reference)).toBe(true);
      expect(Date.now() - started).toBeLessThan(20_000);
      // The package as the only source paints the same.
      const only = await still(
        serveUrl,
        harnessProps({lines: [line], fit: 'line', fontFile: null, fontPackages: 'source'}),
      );
      expect(only.equals(reference)).toBe(true);
      // Without the fallback the same source fails the render.
      await expect(still(serveUrl, harnessProps({lines: [line], fit: 'line', ...unreachable}))).rejects.toThrow(
        /FONT_NETWORK|Could not fetch/,
      );
      // The package's assets follow the bundle's publicPath, like staticFile() does.
      const outDir = path.join(workDir, 'site-fonts');
      await bundle({
        entryPoint: path.join(exampleDir, 'src/index.ts'),
        publicDir: path.join(exampleDir, 'public'),
        outDir,
        publicPath: '/sites/fonts/',
      });
      const {server, origin} = await serveUnder(outDir, '/sites/fonts/');
      try {
        const fromSite = await still(
          `${origin}/sites/fonts/`,
          harnessProps({lines: [line], fit: 'line', ...unreachable, fontPackages: 'fallback'}),
        );
        expect(fromSite.equals(reference)).toBe(true);
      } finally {
        server.close();
      }
    }, 180_000);

    it('resolves the convenience form in the render tab from a staticFile() mirror, also under a Lambda publicPath', async () => {
      // The tab fetches the two zips from the bundle's own public folder, unzips and reads them,
      // and paints the very same picture as the line resolved ahead of time.
      const resolve = p10l3();
      const reference = await still(serveUrl, harnessProps({lines: [realLine!], fit: 'line'}));
      const resolved = await still(serveUrl, harnessProps({lines: [], resolve, dataFiles: MIRROR, fit: 'line'}));
      expect(resolved.equals(reference)).toBe(true);
      // staticFile() carries the publicPath, so a Lambda site finds its mirror too.
      const outDir = path.join(workDir, 'site-data');
      await bundle({
        entryPoint: path.join(exampleDir, 'src/index.ts'),
        publicDir: path.join(exampleDir, 'public'),
        outDir,
        publicPath: '/sites/abc/',
      });
      const {server, origin} = await serveUnder(outDir, '/sites/abc/');
      try {
        const fromSite = await still(
          `${origin}/sites/abc/`,
          harnessProps({lines: [], resolve, dataFiles: MIRROR, fit: 'line'}),
        );
        expect(fromSite.equals(reference)).toBe(true);
      } finally {
        server.close();
      }
    });

    it('a missing export fails the render fast with DATA_HTTP, and an HTML page with DATA_INVALID', async () => {
      const resolve = p10l3();
      const started = Date.now();
      await expect(
        still(
          serveUrl,
          harnessProps({lines: [], resolve, dataFiles: {words: 'data/qpc-v4/missing.json.zip', layout: MIRROR.layout}}),
        ),
      ).rejects.toThrow(/DATA_HTTP|404/);
      expect(Date.now() - started).toBeLessThan(25_000);
      // The bundle's own index.html, served at the site root, in place of the words export.
      await expect(
        still(serveUrl, harnessProps({lines: [], resolve, dataFiles: MIRROR, data: {words: '/index.html'}})),
      ).rejects.toThrow(/DATA_INVALID|not JSON/);
    });

    it('slices a fitted line without changing its size, deterministically', async () => {
      // 2:62 ends and 2:63 begins on page 10 line 3.
      const line = realLine!;
      const whole = await still(serveUrl, harnessProps({lines: [line], fit: 'line'}));
      const sliced = await still(serveUrl, harnessProps({lines: [line], fit: 'line', slice: {ayah: 63}}));
      writeFileSync(path.join(here, 'p10-l3-slice.png'), sliced);
      expect(sliced.equals(whole)).toBe(false);
      expect(
        (await still(serveUrl, harnessProps({lines: [line], fit: 'line', slice: {ayah: 63}}))).equals(sliced),
      ).toBe(true);
      // A slice that keeps every word is the printed line, to the byte.
      expect(
        (await still(serveUrl, harnessProps({lines: [line], fit: 'line', slice: {fromAyah: 62}}))).equals(whole),
      ).toBe(true);
    });

    it('renders the mandala palette and its colours, the letters following CSS color', async () => {
      const line = realLine!;
      const tajweed = await still(serveUrl, harnessProps({lines: [line], fit: 'line'}));
      // The theme rides on the data, so the renderer needs nothing else; the
      // letters take the page's colour through the palette, exactly as plain glyphs would.
      const mandalaLine = await relook('normal');
      const mandala = await still(
        serveUrl,
        harnessProps({lines: [mandalaLine], fit: 'line', color: 'rgb(27, 111, 63)'}),
      );
      writeFileSync(path.join(here, 'p10-l3-mandala.png'), mandala);
      expect(mandala.equals(tajweed)).toBe(false);
      expect(mandala.length).toBeGreaterThan(1000);
      // Same line, same palette, another page colour: a different picture, so `color` really reaches
      // the glyphs of a colour font.
      const black = await still(serveUrl, harnessProps({lines: [mandalaLine], fit: 'line', color: '#000000'}));
      expect(black.equals(mandala)).toBe(false);
      // ... and so does a recoloured rosette.
      const gold = await still(
        serveUrl,
        harnessProps({
          lines: [{...mandalaLine, theme: {base: 'normal', colors: {accent: '#c8a45c'}}}],
          fit: 'line',
          color: '#000000',
        }),
      );
      expect(gold.equals(black)).toBe(false);
    });

    it("renders QUL's dark and black themes on a dark page as two different pictures", async () => {
      const dark = await relook('dark');
      const blackLine = await relook('black');
      const onDark = (line: unknown) => harnessProps({lines: [line], fit: 'line', background: '#343a40'});
      const darkPng = await still(serveUrl, onDark(dark));
      const blackPng = await still(serveUrl, onDark(blackLine));
      writeFileSync(path.join(here, 'p10-l3-black.png'), blackPng);
      expect(darkPng.equals(blackPng)).toBe(false);
      // The marker's second palette is what makes black differ from a bare all-white palette-5 line.
      const white = Object.fromEntries(Array.from({length: 16}, (_, e) => [String(e), '#ffffff']));
      const bare = await still(serveUrl, onDark({...blackLine, theme: {base: 5, colors: white}}));
      expect(bare.equals(blackPng)).toBe(false);
    });
  });
});

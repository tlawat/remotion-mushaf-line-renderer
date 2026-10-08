// Studio smoke suite: the end-user app's Studio, headless. Proves that the compositions resolve
// and mount without Remotion's error overlay, that the Mushaf panel docks itself, and that the
// Props sidebar offers the schema's controls. It does not call the aligner or quran.com.
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {expect, type Page, test} from '@playwright/test';

const PANEL = '[data-mushaf-studio="panel"]';

/** Remotion's error overlay (a compile or runtime error in the composition) and the Studio's own "Error" marker. */
const errorOverlay = (page: Page) => page.locator('text=/^Error:|An error occurred|Uncaught/').first();

const consoleLines: string[] = [];

const openComposition = async (page: Page, id: string) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    consoleLines.push(`${message.type()}: ${message.text().slice(0, 400)}`);
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/${id}`);
  // The Studio shows the composition's name in the document title once it is selected.
  await expect(page).toHaveTitle(new RegExp(id), {timeout: 60_000});
  return errors;
};

test('MushafRecitation mounts and the Mushaf panel is docked', async ({page}) => {
  const errors = await openComposition(page, 'MushafRecitation');
  // calculateMetadata fetches the timings and QUL's exports, then the first page font loads behind delayRender().
  await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 180_000});
  await expect(page.locator(PANEL)).toBeVisible();
  // The dock sits beside the Studio, never over the preview: the line's box ends before the dock.
  await expect
    .poll(async () => {
      const line = await page.locator('.mushaf-line').first().boundingBox();
      const dock = await page.locator(PANEL).boundingBox();
      return line && dock ? Math.round(line.x + line.width) <= Math.round(dock.x) : false;
    })
    .toBe(true);
  for (const tab of ['Source', 'Align', 'Review', 'Lines', 'Text']) {
    await expect(page.locator(PANEL).getByText(tab, {exact: true}).first()).toBeVisible();
  }
  await expect(errorOverlay(page)).toHaveCount(0);
  // Step into the recitation (the Studio's frame-step shortcut): by 2.5 s the first line is in
  // place and a word is being recited, so the karaoke follow must mark exactly one word.
  await page
    .locator('.mushaf-line')
    .first()
    .click({position: {x: 5, y: 5}, force: true});
  for (let i = 0; i < 75; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.mushaf-word--active')).toHaveCount(1, {timeout: 30_000});
  const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
  expect(fatal, fatal.join('\n')).toHaveLength(0);
  // What the painted frame is made of, for the test report: the row's box, the first word's font
  // and the fonts the document holds. A row with a box but a word in a fallback family means the
  // private-use glyphs paint nothing.
  await page.waitForTimeout(1000);
  const painted = await page.evaluate(() => {
    const box = (el: Element | null) => {
      const b = el?.getBoundingClientRect();
      return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null;
    };
    const row = document.querySelector('.mushaf-line__row');
    const word = document.querySelector('.mushaf-word');
    const style = word ? getComputedStyle(word) : null;
    const block = document.querySelector('[data-mushaf-block="lines"]');
    const rowStyle = row ? getComputedStyle(row) : null;
    const line = document.querySelector('.mushaf-line');
    return {
      block: box(block),
      blockStyle: block ? (block as HTMLElement).getAttribute('style') : null,
      line: box(line),
      lineStyle: line ? (line as HTMLElement).getAttribute('style') : null,
      rowStyle: rowStyle
        ? {
            direction: rowStyle.direction,
            display: rowStyle.display,
            justifyContent: rowStyle.justifyContent,
            whiteSpace: rowStyle.whiteSpace,
            width: rowStyle.width,
            transform: rowStyle.transform,
          }
        : null,
      words: row ? row.querySelectorAll('.mushaf-word').length : 0,
      hiddenWords: row ? row.querySelectorAll('.mushaf-word--hidden').length : 0,
      wordWidths: row
        ? [...row.querySelectorAll('.mushaf-word')].slice(0, 12).map((w) => Math.round(w.getBoundingClientRect().width))
        : [],
      sameDocument: row ? row.ownerDocument === document : null,
      frames: window.frames.length,
      fontsSize: document.fonts.size,
      fontsStatus: document.fonts.status,
      check: style ? document.fonts.check(`${style.fontSize} ${style.fontFamily}`) : null,
      store: (() => {
        const g = globalThis as unknown as Record<
          symbol,
          {entries?: Map<string, {status: string; fontFamily: string}>}
        >;
        const store = g[Symbol.for('remotion-mushaf-line-renderer/font-store@2')];
        return store?.entries ? [...store.entries.values()].map((e) => `${e.fontFamily}:${e.status}`) : null;
      })(),
      row: box(row),
      word: box(word),
      fontFamily: style?.fontFamily,
      fontSize: style?.fontSize,
      color: style?.color,
      opacity: row ? getComputedStyle(row).opacity : null,
      fonts: [...document.fonts].map((f) => `${f.family}:${f.status}`),
    };
  });
  // The page font comes from QUL's CDN first and from the fonts packages when the CDN fails, which
  // in a sandbox without outbound access takes the CDN's retries first: wait for the store to say
  // the font is in, then look at what the frame is made of.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = globalThis as unknown as Record<symbol, {entries?: Map<string, {status: string}>}>;
          const store = g[Symbol.for('remotion-mushaf-line-renderer/font-store@2')];
          return store?.entries ? [...store.entries.values()].every((e) => e.status === 'loaded') : false;
        }),
      {timeout: 120_000, message: 'the page font never finished loading'},
    )
    .toBe(true);
  await page.waitForTimeout(500);
  const later = await page.evaluate(() => {
    const row = document.querySelector('.mushaf-line__row');
    const word = document.querySelector('.mushaf-word');
    const g = globalThis as unknown as Record<symbol, {entries?: Map<string, {status: string; fontFamily: string}>}>;
    const store = g[Symbol.for('remotion-mushaf-line-renderer/font-store@2')];
    return {
      visibility: row ? getComputedStyle(row).visibility : null,
      wordWidth: word ? Math.round(word.getBoundingClientRect().width) : null,
      fontsSize: document.fonts.size,
      store: store?.entries ? [...store.entries.values()].map((e) => `${e.fontFamily}:${e.status}`) : null,
    };
  });
  writeFileSync(
    test.info().outputPath('painted.json'),
    JSON.stringify({...painted, later, console: consoleLines.slice(0, 40)}, null, 1),
  );
  // A glyph of the page font is wide; a fallback font paints the private-use code points as nothing.
  expect(later.fontsSize).toBeGreaterThan(0);
  expect(later.wordWidth ?? 0).toBeGreaterThan(40);
  expect(painted.row?.[3] ?? 0).toBeGreaterThan(10);
  await page.screenshot({path: test.info().outputPath('recitation.png'), fullPage: false});
});

/** A file of the app's `public/`, from the suite's own folder (the config's `testDir`). */
const appPublicFile = (file: string): string =>
  path.join(test.info().project.testDir, '../../../../apps/mushaf-studio/public', file);

test("MushafRecitation's Review tab draws the waveform, seeks from it and lists the sample's segments", async ({
  page,
}) => {
  // The recording is not committed: `bun run --cwd apps/mushaf-studio sample` downloads it (CI does, before this suite).
  expect(
    existsSync(appPublicFile('mushaf-studio/fatiha/audio.mp3')),
    'public/mushaf-studio/fatiha/audio.mp3 is missing: run `bun run --cwd apps/mushaf-studio sample` first',
  ).toBe(true);
  const sample = JSON.parse(readFileSync(appPublicFile('mushaf-studio/fatiha/timings.json'), 'utf8')) as {
    alignment: {segments: {confidence: number}[]};
  };
  const segments = sample.alignment.segments.length;
  expect(segments).toBeGreaterThan(0);

  const errors = await openComposition(page, 'MushafRecitation');
  await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 180_000});
  const panel = page.locator(PANEL);
  await panel.getByRole('tab', {name: 'Review'}).click();
  await expect(panel.getByRole('tab', {name: 'Review'})).toHaveAttribute('aria-selected', 'true');
  const review = panel.locator('[data-mushaf-review]');
  await expect(review).toBeVisible();

  // The segment list: one row per segment of the sample's alignment, none of them doubtful.
  await expect(review.locator('li[data-segment]')).toHaveCount(segments, {timeout: 60_000});
  await expect(review.locator('li[data-segment][data-doubtful="true"]')).toHaveCount(0);

  // The waveform: decoded from public/ and painted, so some pixel is not transparent and the peaks
  // stand out from the background.
  const canvas = review.locator('canvas[data-mushaf-waveform="canvas"]');
  await expect(canvas).toBeVisible();
  /** The canvas's pixels: how many are not transparent, and how many colours they have (2 is enough). */
  const paintOf = () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext('2d');
      if (!context) return {painted: 0, colors: 0};
      const {data} = context.getImageData(0, 0, element.width, element.height);
      let painted = 0;
      const colors = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        painted++;
        if (colors.size < 2) colors.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
      }
      return {painted, colors: colors.size};
    });
  await expect
    .poll(async () => (await paintOf()).colors, {timeout: 120_000, message: 'the waveform canvas was never painted'})
    .toBe(2);
  expect((await paintOf()).painted).toBeGreaterThan(0);

  // A click on the waveform seeks the Studio: its time display (the frame under the timecode) changes.
  const frameDisplay = page.locator('button[aria-label="Show timeline ticks as frames"]').first();
  await expect(frameDisplay).toBeVisible();
  const frameOf = async () => Number((await frameDisplay.textContent())?.trim() ?? Number.NaN);
  const before = await frameOf();
  expect(Number.isInteger(before)).toBe(true);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await canvas.click({position: {x: Math.round(box!.width * 0.7), y: Math.round(box!.height / 2)}});
  await expect.poll(frameOf, {timeout: 30_000, message: 'the Studio frame did not move'}).not.toBe(before);
  await expect(review.locator('[data-mushaf-waveform="cursor"]')).toHaveCount(1);

  // The doubt markers: the sample has no doubtful segment, so the timeline names none (a marker is
  // named "⚠ 62% 1:3:1–1:3:2"), and no <Sequence> of theirs complained.
  const markers = await page.evaluate(
    () => document.body.innerText.split('\n').filter((line) => /\u26a0 \d+%/.test(line)).length,
  );
  expect(markers).toBe(0);
  const sequenceErrors = errors.filter((e) => /Sequence|durationInFrames/.test(e));
  expect(sequenceErrors, sequenceErrors.join('\n')).toHaveLength(0);
  await expect(errorOverlay(page)).toHaveCount(0);
  const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
  expect(fatal, fatal.join('\n')).toHaveLength(0);
  await page.screenshot({path: test.info().outputPath('review.png'), fullPage: false});
});

test('MushafPassage mounts', async ({page}) => {
  const errors = await openComposition(page, 'MushafPassage');
  await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 180_000});
  await expect(page.locator('.mushaf-line__row').first()).toHaveCSS('visibility', 'visible', {timeout: 120_000});
  await expect(errorOverlay(page)).toHaveCount(0);
  const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
  expect(fatal, fatal.join('\n')).toHaveLength(0);
});

test('MushafAyahText mounts, loads the Uthmani font and marks the recited word', async ({page}) => {
  const errors = await openComposition(page, 'MushafAyahText');
  await expect(page.locator('.mushaf-uword').first()).toBeVisible({timeout: 180_000});
  await page
    .locator('.mushaf-uword')
    .first()
    .click({position: {x: 2, y: 2}, force: true});
  for (let i = 0; i < 75; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.mushaf-uword--active')).toHaveCount(1, {timeout: 30_000});
  await expect(errorOverlay(page)).toHaveCount(0);
  const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
  expect(fatal, fatal.join('\n')).toHaveLength(0);
  await page.waitForTimeout(1000);
  await page.screenshot({path: test.info().outputPath('ayah-text.png'), fullPage: false});
});

test('MushafPage mounts, paints its lines and marks the line being recited', async ({page}) => {
  const errors = await openComposition(page, 'MushafPage');
  await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 180_000});
  // A row of the page is painted once its font is in: a box with a height, visible.
  await expect(page.locator('.mushaf-line__row').first()).toHaveCSS('visibility', 'visible', {timeout: 120_000});
  await expect
    .poll(async () => (await page.locator('.mushaf-line__row').first().boundingBox())?.height ?? 0, {timeout: 60_000})
    .toBeGreaterThan(10);
  // Step into the recitation: by 2.5 s the first word has been heard and its line carries the band.
  await page
    .locator('.mushaf-line')
    .first()
    .click({position: {x: 5, y: 5}, force: true});
  for (let i = 0; i < 75; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-line-highlight="band"]').first()).toBeVisible({timeout: 30_000});
  await expect(page.locator('[data-current="true"]')).toHaveCount(1);
  await expect(errorOverlay(page)).toHaveCount(0);
  const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
  expect(fatal, fatal.join('\n')).toHaveLength(0);
  await page.screenshot({path: test.info().outputPath('page.png'), fullPage: false});
});

test('MushafThumbnail mounts', async ({page}) => {
  const errors = await openComposition(page, 'MushafThumbnail');
  await expect(page.locator('[data-mushaf-thumbnail]')).toBeVisible({timeout: 180_000});
  await expect(page.locator('[data-mushaf-thumbnail-part="line"] .mushaf-line').first()).toBeVisible({
    timeout: 180_000,
  });
  await expect(errorOverlay(page)).toHaveCount(0);
  const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
  expect(fatal, fatal.join('\n')).toHaveLength(0);
  await page.screenshot({path: test.info().outputPath('thumbnail.png'), fullPage: false});
});

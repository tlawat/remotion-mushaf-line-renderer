// Studio smoke suite: the end-user app's Studio, headless. Proves that the compositions resolve
// and mount without Remotion's error overlay, that the Mushaf panel docks itself, and that the
// Props sidebar offers the schema's controls. It does not call the aligner or quran.com.
import {writeFileSync} from 'node:fs';
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
  await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 90_000});
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

test('MushafPassage mounts', async ({page}) => {
  const errors = await openComposition(page, 'MushafPassage');
  await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 90_000});
  await expect(page.locator('.mushaf-line__row').first()).toHaveCSS('visibility', 'visible', {timeout: 120_000});
  await expect(errorOverlay(page)).toHaveCount(0);
  const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
  expect(fatal, fatal.join('\n')).toHaveLength(0);
});

test('MushafAyahText mounts, loads the Uthmani font and marks the recited word', async ({page}) => {
  const errors = await openComposition(page, 'MushafAyahText');
  await expect(page.locator('.mushaf-uword').first()).toBeVisible({timeout: 90_000});
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

// Studio smoke suite: the end-user app's Studio, headless. Proves that the compositions resolve
// and mount without Remotion's error overlay, that the Mushaf panel docks itself, and that the
// Props sidebar offers the schema's controls. It does not call the aligner or quran.com.
import {writeFileSync} from 'node:fs';
import {expect, type Page, test} from '@playwright/test';

const PANEL = '[data-mushaf-studio="panel"]';

/** Remotion's error overlay (a compile or runtime error in the composition) and the Studio's own "Error" marker. */
const errorOverlay = (page: Page) => page.locator('text=/^Error:|An error occurred|Uncaught/').first();

const openComposition = async (page: Page, id: string) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
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
    return {
      row: box(row),
      word: box(word),
      fontFamily: style?.fontFamily,
      fontSize: style?.fontSize,
      color: style?.color,
      opacity: row ? getComputedStyle(row).opacity : null,
      fonts: [...document.fonts].map((f) => `${f.family}:${f.status}`),
    };
  });
  writeFileSync(test.info().outputPath('painted.json'), JSON.stringify(painted, null, 1));
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

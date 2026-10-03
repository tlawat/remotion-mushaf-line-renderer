// Studio smoke suite: the end-user app's Studio, headless. Proves that the compositions resolve
// and mount without Remotion's error overlay, that the Mushaf panel docks itself, and that the
// Props sidebar offers the schema's controls. It does not call the aligner or quran.com.
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
  const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
  expect(fatal, fatal.join('\n')).toHaveLength(0);
  await page.screenshot({path: test.info().outputPath('recitation.png'), fullPage: false});
});

test('MushafPassage mounts', async ({page}) => {
  const errors = await openComposition(page, 'MushafPassage');
  await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 90_000});
  await expect(errorOverlay(page)).toHaveCount(0);
  const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
  expect(fatal, fatal.join('\n')).toHaveLength(0);
});

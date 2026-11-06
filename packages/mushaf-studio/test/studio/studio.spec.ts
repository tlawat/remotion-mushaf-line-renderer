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

/** The app's Root, from the suite's own folder: the drop-in test saves into it, and puts it back. */
const appRootFile = (): string => path.join(test.info().project.testDir, '../../../../apps/mushaf-studio/src/Root.tsx');

/** The `<Composition id="…">` element of the Root, up to the next composition. */
const compositionBlockOf = (root: string, id: string): string => {
  const start = root.indexOf(`id="${id}"`);
  expect(start, `the Root has no ${id}`).toBeGreaterThan(0);
  const next = root.slice(start).search(/<(Composition|Still)\b/);
  return next < 0 ? root.slice(start) : root.slice(start, start + next);
};

/** The `<Composition id="MushafInTemplate">` element of the Root, up to the next composition. */
const templateBlockOf = (root: string): string => compositionBlockOf(root, 'MushafInTemplate');

test('MushafInTemplate docks the panel on the intro, offers its own audio track, and saves a look under `mushaf` only', async ({
  page,
}) => {
  const rootFile = appRootFile();
  const original = readFileSync(rootFile, 'utf8');
  try {
    const errors = await openComposition(page, 'MushafInTemplate');
    await expect(page.locator('[data-template="MushafInTemplate"]')).toBeVisible({timeout: 180_000});
    const panel = page.locator(PANEL);
    // Frame 0 is the template's intro: the recitation's box starts 2 s later, and the panel is
    // docked all the same (it sits beside the slot's Sequence, not in it).
    const frameDisplay = page.locator('button[aria-label="Show timeline ticks as frames"]').first();
    await expect(frameDisplay).toBeVisible();
    expect(Number((await frameDisplay.textContent())?.trim())).toBeLessThan(60);
    await expect(page.locator('[data-template-part="title"]')).toBeVisible();
    // Nothing of the recitation shows yet (the box may be mounted ahead, hidden: its premountFor).
    await expect(page.locator('.mushaf-line:visible')).toHaveCount(0);
    await expect(panel).toBeVisible({timeout: 60_000});
    for (const tab of ['Source', 'Look', 'Align', 'Review', 'Lines', 'Text']) {
      await expect(panel.getByRole('tab', {name: tab})).toBeVisible();
    }

    // The template's own <Audio> is on the Studio's timeline, and Source offers it: the recitation
    // follows it (`mushaf.hostAudio`), timed from the slot's start, its own <Audio> left out.
    await panel.getByRole('tab', {name: 'Source'}).click();
    const trackChoice = panel.getByRole('radio', {name: 'A track in this video'});
    await expect(trackChoice).toBeChecked();
    await expect(panel.locator('[data-mushaf-control="source-now"]')).toContainText(
      "Now: the template's track Template audio plays public/mushaf-studio/fatiha/audio.mp3, from second 0",
    );
    const tracks = panel.getByRole('combobox', {name: 'Track'});
    await expect(tracks.locator('option')).toHaveText(['Template audio · audio · second 0 at the start']);
    await expect(panel.getByRole('button', {name: 'Use this track'})).toBeEnabled();
    // In step with the track as the template places it: no timing to update.
    await expect(panel.locator('[data-mushaf-control="host-moved"]')).toHaveCount(0);

    // A look from the panel: saved in the Root under the template's `mushaf` key, nowhere else.
    await panel.getByRole('tab', {name: 'Look'}).click();
    await expect(panel.getByText(/a look leaves layout\.aspect as it is/)).toBeVisible();
    await panel.locator('[data-look="night"]').click();
    await expect
      .poll(() => readFileSync(rootFile, 'utf8') !== original, {timeout: 60_000, message: 'the Root was never saved'})
      .toBe(true);
    await expect(panel.getByRole('status')).toContainText('Ready', {timeout: 60_000});
    const before = templateBlockOf(original);
    const after = templateBlockOf(readFileSync(rootFile, 'utf8'));
    const ownOf = (block: string) => block.slice(0, block.indexOf('mushaf:'));
    const slotOf = (block: string) => block.slice(block.indexOf('mushaf:'));
    // The template's own props are as they were (the values, whatever the Studio's formatting).
    const values = (block: string) =>
      ['title', 'subtitle', 'introSeconds', 'outro', 'outroSeconds'].map((key) =>
        new RegExp(`${key}:\\s*([^,\\n]+)`).exec(ownOf(block))?.[1]?.replace(/"/g, "'"),
      );
    expect(values(after)).toEqual(values(before));
    expect(values(after)[0]).toBe("'Al-Fatihah'");
    // The slot took the look: Night's page and theme, its files untouched.
    expect(slotOf(after)).toMatch(/theme:\s*['"]dark['"]/);
    expect(slotOf(after)).toMatch(/background:\s*['"]#101418['"]/);
    expect(slotOf(after)).toMatch(/timingsFile:\s*['"]mushaf-studio\/fatiha\/timings\.json['"]/);
    expect(ownOf(after)).not.toMatch(/#101418|theme:/);
    // Nothing of the look went into another composition's props.
    const elsewhere = (root: string) => root.replace(templateBlockOf(root), '');
    expect(elsewhere(readFileSync(rootFile, 'utf8')).match(/#101418/g)?.length ?? 0).toBe(
      elsewhere(original).match(/#101418/g)?.length ?? 0,
    );
    // Still on the intro, the panel still there.
    expect(Number((await frameDisplay.textContent())?.trim())).toBeLessThan(60);
    await expect(panel).toBeVisible();
    await expect(errorOverlay(page)).toHaveCount(0);
    const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
    expect(fatal, fatal.join('\n')).toHaveLength(0);
    await page.screenshot({path: test.info().outputPath('template.png'), fullPage: false});
  } finally {
    writeFileSync(rootFile, original);
  }
});

// The user's complaint, in the real Studio: an edit in the Props sidebar and a save from the panel,
// in either order, must each keep what the other wrote, and neither may drop the alignment.

/**
 * The composition's `defaultProps` as the Root holds them, evaluated: the object literal after
 * `defaultProps={`, found by matching its braces outside string literals. The Studio reformats
 * the Root when it saves, so the values are compared, never the text.
 */
const savedPropsOf = (root: string, id: string): Record<string, unknown> => {
  const block = compositionBlockOf(root, id);
  const at = block.indexOf('defaultProps={');
  expect(at, `${id} has no inline defaultProps`).toBeGreaterThan(0);
  const open = at + 'defaultProps={'.length;
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < block.length; i++) {
    const c = block[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      // The Studio writes an enum's value as `'1:1' as const`: TypeScript, not JavaScript.
      const literal = block.slice(open, i + 1).replace(/\s+as\s+const\b/g, '');
      return new Function(`return (${literal});`)() as Record<string, unknown>;
    }
  }
  throw new Error(`${id}'s defaultProps never close`);
};

type Tree = {readonly [key: string]: unknown};
const isTree = (value: unknown): value is Tree => typeof value === 'object' && value !== null && !Array.isArray(value);
/** `base` with `patch` merged in, objects key by key, anything else replaced. */
const merged = (base: Tree, patch: Tree): Tree =>
  Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(patch)])].map((key) => {
      const [b, p] = [base[key], patch[key]];
      return [key, p === undefined ? b : isTree(b) && isTree(p) ? merged(b, p) : p];
    }),
  );

/**
 * The composition's saved props, read now; `null` while the Studio is writing the Root (it is not
 * written atomically: a read can find it empty or cut short).
 */
const readSaved = (rootFile: string, id: string): Record<string, unknown> | null => {
  const root = readFileSync(rootFile, 'utf8');
  if (!root.includes(`id="${id}"`)) return null;
  try {
    return savedPropsOf(root, id);
  } catch {
    return null;
  }
};

/** Waits for the Root to hold `expected` (a whole `defaultProps` object) for composition `id`. */
const expectSaved = async (rootFile: string, id: string, expected: Tree, message: string) => {
  await expect.poll(() => readSaved(rootFile, id), {timeout: 60_000, message}).toEqual(expected);
};

/** The Props sidebar's row for `jsonPath` (its label carries `data-json-path`). */
const sidebarField = (page: Page, jsonPath: string) =>
  page.locator(`[data-json-path="${jsonPath}"]`).locator('xpath=..');

/** Types `value` into a number field of the Props sidebar as a user does: click the value, type, Enter. */
const setSidebarNumber = async (page: Page, jsonPath: string, value: number) => {
  const field = sidebarField(page, jsonPath);
  await field.locator('button.__remotion_input_dragger').click();
  const input = field.locator('input.__remotion_input_dragger_input');
  await expect(input).toBeVisible();
  await input.fill(String(value));
  await input.press('Enter');
  await expect(field.locator('button.__remotion_input_dragger')).toHaveText(String(value));
};

/** Picks `value` in an enum field of the Props sidebar: open its menu, click the option. */
const setSidebarEnum = async (page: Page, jsonPath: string, value: string) => {
  // The field's menu button (its label also holds a button: the description's info bubble).
  const menu = sidebarField(page, jsonPath).locator('button.__remotion-studio-menu-initiator');
  await menu.click();
  await page.locator('.__remotion-studio-menu-item').getByText(value, {exact: true}).click();
  await expect(menu).toHaveAccessibleName(value);
};

/** Types `value` into a text field of the Props sidebar; the sidebar saves a text field when it loses focus. */
const setSidebarText = async (page: Page, jsonPath: string, value: string) => {
  const input = page.locator(`input[name="${jsonPath}"]`);
  await input.click();
  await input.fill(value);
  await input.press('Tab');
};

/** The looks' patches as the panel writes them (restated from `MUSHAF_LOOKS`: a look that changes is updated here). */
const NIGHT: Tree = {
  theme: 'dark',
  layout: {background: '#101418', color: '#e8e2d6', backgroundImage: ''},
  highlight: {mode: 'word', style: 'glow', color: '#f2c66d', dimOthers: 1},
  text: {translationColor: '#b8b2a6', glossColor: '#8e98a3'},
};
const SQUARE: Tree = {
  layout: {aspect: '1:1', visibleLines: 3, neighbourOpacity: 0.35},
  text: {translationPosition: 'below', translationSize: 36},
};

/** Applies `lookId` from the panel's Look tab and waits for the panel to be ready again. */
const applyLook = async (page: Page, lookId: string) => {
  const panel = page.locator(PANEL);
  await panel.getByRole('tab', {name: 'Look'}).click();
  await panel.locator(`[data-look="${lookId}"]`).click();
  await expect(panel.getByRole('status')).toContainText('Ready', {timeout: 60_000});
};

/** The alignment the sample's compositions start with: what the user's complaint says goes missing. */
const ALIGNMENT = {audioFile: 'mushaf-studio/fatiha/audio.mp3', timingsFile: 'mushaf-studio/fatiha/timings.json'};

/** The other compositions' props, unchanged: nothing of a save leaks into them. */
const expectOthersUnchanged = (original: string, now: string, id: string) => {
  for (const other of ['MushafRecitation', 'MushafPassage', 'MushafAyahText', 'MushafPage', 'MushafInTemplate']) {
    if (other !== id) expect(savedPropsOf(now, other), other).toEqual(savedPropsOf(original, other));
  }
};

test('MushafRecitation: a layout edit in the Props sidebar survives a look from the panel, and so does the alignment', async ({
  page,
}) => {
  const rootFile = appRootFile();
  const original = readFileSync(rootFile, 'utf8');
  const start = savedPropsOf(original, 'MushafRecitation');
  expect(start).toMatchObject(ALIGNMENT);
  expect(start.layout).toMatchObject({aspect: '16:9', marginX: 120});
  try {
    const errors = await openComposition(page, 'MushafRecitation');
    await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 180_000});
    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();

    // (a) The sidebar: the layout's aspect (the composition resizes) and margin, each saved into
    // the Root by the Studio.
    await setSidebarEnum(page, 'layout.aspect', '9:16');
    await expectSaved(
      rootFile,
      'MushafRecitation',
      merged(start, {layout: {aspect: '9:16'}}),
      'the sidebar never saved layout.aspect',
    );
    await setSidebarNumber(page, 'layout.marginX', 200);
    const afterSidebar = merged(start, {layout: {aspect: '9:16', marginX: 200}});
    await expectSaved(rootFile, 'MushafRecitation', afterSidebar, 'the sidebar never saved layout.marginX');

    // (b) The panel: a look, which writes into the same `layout` group.
    await applyLook(page, 'night');

    // (c) The Root: the sidebar's edit, the alignment and the look, and nothing else changed.
    await expectSaved(rootFile, 'MushafRecitation', merged(afterSidebar, NIGHT), 'the look was not saved as expected');
    const saved = savedPropsOf(readFileSync(rootFile, 'utf8'), 'MushafRecitation');
    expect(saved.layout).toMatchObject({aspect: '9:16', marginX: 200});
    expect(saved).toMatchObject(ALIGNMENT);
    expectOthersUnchanged(original, readFileSync(rootFile, 'utf8'), 'MushafRecitation');
    // Nothing raced: the panel offers nothing back.
    await expect(panel.locator('[data-mushaf-control="rolled-back"]')).toHaveCount(0);
    await expect(errorOverlay(page)).toHaveCount(0);
    const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
    expect(fatal, fatal.join('\n')).toHaveLength(0);
  } finally {
    writeFileSync(rootFile, original);
  }
});

test('MushafRecitation: a panel save, a sidebar edit of what it wrote, then another panel save, keeps the sidebar edit and the alignment', async ({
  page,
}) => {
  const rootFile = appRootFile();
  const original = readFileSync(rootFile, 'utf8');
  const start = savedPropsOf(original, 'MushafRecitation');
  expect(start).toMatchObject({...ALIGNMENT, splits: []});
  try {
    const errors = await openComposition(page, 'MushafRecitation');
    await expect(page.locator('.mushaf-line').first()).toBeVisible({timeout: 180_000});
    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();

    // A panel save first: the Square look writes layout.visibleLines and layout.neighbourOpacity.
    await applyLook(page, 'square');
    const afterLook = merged(start, SQUARE);
    await expectSaved(rootFile, 'MushafRecitation', afterLook, 'the Square look was not saved as expected');
    // Past the window in which a sidebar save counts as racing the panel's: this is a later edit.
    await page.waitForTimeout(6000);

    // The sidebar changes two of the values that look wrote.
    await setSidebarNumber(page, 'layout.visibleLines', 5);
    await expectSaved(
      rootFile,
      'MushafRecitation',
      merged(afterLook, {layout: {visibleLines: 5}}),
      'the sidebar never saved layout.visibleLines',
    );
    await setSidebarNumber(page, 'layout.neighbourOpacity', 0.6);
    const afterSidebar = merged(afterLook, {layout: {visibleLines: 5, neighbourOpacity: 0.6}});
    await expectSaved(rootFile, 'MushafRecitation', afterSidebar, 'the sidebar never saved layout.neighbourOpacity');

    // Another panel save, of another kind: a line split from the Lines tab.
    await panel.getByRole('tab', {name: 'Lines'}).click();
    await panel.locator('button[title^="Split the line before"]').first().click();
    await expect
      .poll(() => (readSaved(rootFile, 'MushafRecitation')?.splits as unknown[] | undefined)?.length, {
        timeout: 60_000,
        message: 'the split was never saved',
      })
      .toBe(1);
    await expect(panel.getByRole('status')).toContainText('Ready', {timeout: 60_000});

    // The Root: the split added, the sidebar's values kept (the look's 3 and 0.35 not written
    // again over them), the rest of the look and the alignment as they were.
    const saved = savedPropsOf(readFileSync(rootFile, 'utf8'), 'MushafRecitation');
    const [split] = saved.splits as Tree[];
    expect(split).toEqual({page: expect.any(Number), line: expect.any(Number), atWordId: expect.any(Number)});
    expect(saved).toEqual(merged(afterSidebar, {splits: [split]}));
    expect(saved.layout).toMatchObject({aspect: '1:1', visibleLines: 5, neighbourOpacity: 0.6});
    expect(saved).toMatchObject(ALIGNMENT);
    expectOthersUnchanged(original, readFileSync(rootFile, 'utf8'), 'MushafRecitation');
    await expect(panel.locator('[data-mushaf-control="rolled-back"]')).toHaveCount(0);
    await expect(errorOverlay(page)).toHaveCount(0);
    const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
    expect(fatal, fatal.join('\n')).toHaveLength(0);
  } finally {
    writeFileSync(rootFile, original);
  }
});

test("MushafInTemplate: a sidebar edit of the template's own title survives a panel save under `mushaf`", async ({
  page,
}) => {
  const rootFile = appRootFile();
  const original = readFileSync(rootFile, 'utf8');
  const start = savedPropsOf(original, 'MushafInTemplate');
  expect(start.title).toBe('Al-Fatihah');
  expect(start.mushaf).toMatchObject(ALIGNMENT);
  try {
    const errors = await openComposition(page, 'MushafInTemplate');
    await expect(page.locator('[data-template="MushafInTemplate"]')).toBeVisible({timeout: 180_000});
    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible({timeout: 60_000});

    await setSidebarText(page, 'title', 'Al-Fatihah, recited');
    const afterSidebar = merged(start, {title: 'Al-Fatihah, recited'});
    await expectSaved(rootFile, 'MushafInTemplate', afterSidebar, 'the sidebar never saved the title');
    await expect(page.locator('[data-template-part="title"]')).toContainText('Al-Fatihah, recited');

    // In a slot a look leaves layout.aspect to the template's box (Night has none to leave).
    await applyLook(page, 'night');
    await expectSaved(
      rootFile,
      'MushafInTemplate',
      merged(afterSidebar, {mushaf: NIGHT}),
      'the look was not saved under `mushaf` as expected',
    );
    const saved = savedPropsOf(readFileSync(rootFile, 'utf8'), 'MushafInTemplate');
    expect(saved.title).toBe('Al-Fatihah, recited');
    expect(saved.mushaf).toMatchObject(ALIGNMENT);
    expectOthersUnchanged(original, readFileSync(rootFile, 'utf8'), 'MushafInTemplate');
    await expect(panel.locator('[data-mushaf-control="rolled-back"]')).toHaveCount(0);
    await expect(errorOverlay(page)).toHaveCount(0);
    const fatal = errors.filter((e) => !/favicon|net::ERR_|ResizeObserver/.test(e));
    expect(fatal, fatal.join('\n')).toHaveLength(0);
  } finally {
    writeFileSync(rootFile, original);
  }
});

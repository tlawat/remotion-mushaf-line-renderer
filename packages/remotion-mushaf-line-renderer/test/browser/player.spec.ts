// Browser suite against the example's <Player> harness (example/player). Synthetic lines are
// rendered with the page-10 tajweed fixture font (test/fixtures/fonts, example/public/fonts).
import {expect, test, type Page} from '@playwright/test';
import {existsSync} from 'node:fs';
import path from 'node:path';

type Box = {x: number; y: number; width: number; height: number};

/** The example's mirror of QUL's two exports (`node scripts/fetch-qul.mjs --data`), served by Vite with the rest of public/. */
const MIRROR = {words: 'http://localhost:4173/data/qpc-v4/words.json.zip', layout: 'http://localhost:4173/data/qpc-v4/layout.db.zip'};
// Resolved from the config's rootDir (this folder): Playwright's loader has no import.meta.url to offer.
const hasMirror = () => existsSync(path.resolve(test.info().config.rootDir, '../../../../example/public/data/qpc-v4/layout.db.zip'));
const NO_MIRROR = 'QUL\'s exports are not mirrored under example/public/data (node scripts/fetch-qul.mjs --data)';

const ROW = '.mushaf-line__row';
const ROOT = '.mushaf-line';

const open = async (page: Page, scenario: string, extra = '') => {
  await page.goto(`/player/?scenario=${scenario}${extra}`);
  await page.waitForFunction(() => Boolean((window as unknown as {__harness?: unknown}).__harness));
};

const seek = async (page: Page, frame: number) => {
  await page.evaluate((f) => (window as unknown as {__harness: {seekTo: (n: number) => void}}).__harness.seekTo(f), frame);
  await page.waitForFunction((f) => (window as unknown as {__harness: {getCurrentFrame: () => number}}).__harness.getCurrentFrame() === f, frame);
  // Let React commit the new frame.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};

const rowsVisible = async (page: Page, count: number) => {
  await expect(page.locator(ROW)).toHaveCount(count);
  for (let i = 0; i < count; i++) {
    await expect(page.locator(ROW).nth(i)).toHaveCSS('visibility', 'visible');
  }
};

const box = async (page: Page, selector: string, nth = 0): Promise<Box> => {
  const b = await page.locator(selector).nth(nth).boundingBox();
  if (!b) throw new Error(`${selector}[${nth}] has no box`);
  return b;
};

const wordBoxes = (page: Page, lineIndex: number) =>
  page.locator(ROOT).nth(lineIndex).locator('.mushaf-word').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {x: r.x, width: r.width, right: r.right, position: Number(el.getAttribute('data-position')), kind: el.getAttribute('data-kind')};
    }),
  );

/** The `@font-palette-values` rule an ident names, as the browser parsed it. */
const paletteRule = async (page: Page, ident: string): Promise<string> => {
  const rule = await page.evaluate((wanted) => {
    for (const sheet of Array.from(document.styleSheets)) {
      for (const r of Array.from(sheet.cssRules)) {
        if (r.cssText.startsWith('@font-palette-values') && r.cssText.includes(wanted)) return r.cssText;
      }
    }
    return null;
  }, ident);
  if (rule === null) throw new Error(`no @font-palette-values rule for ${ident}`);
  return rule;
};

// A loaded FontFace with that family is in document.fonts. (`document.fonts.check()` is not usable
// here: it also answers true while no face of the family is registered yet.)
const fontsLoaded = (page: Page, families: string[]) =>
  page.evaluate((fams) => {
    const faces = Array.from(document.fonts);
    return fams.every((f) => faces.some((face) => face.family.replace(/^"|"$/g, '') === f && face.status === 'loaded'));
  }, families);

test.describe('static line', () => {
  test('renders three lines with the page font, one element per word, real widths, no overflow', async ({page}) => {
    await open(page, 'static');
    await rowsVisible(page, 3);
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-p1', 'mushaf-qpc-v4-p2', 'mushaf-qpc-v4-p3'])).toBe(true);

    // DOM contract.
    const roots = page.locator(ROOT);
    await expect(roots.nth(0)).toHaveAttribute('data-page', '2');
    await expect(roots.nth(0)).toHaveAttribute('data-line', '3');
    await expect(roots.nth(0)).toHaveAttribute('data-line-type', 'ayah');
    await expect(roots.nth(0)).toHaveAttribute('data-centered', 'false');
    await expect(roots.nth(1)).toHaveAttribute('data-centered', 'true');
    await expect(roots.nth(0).locator('.mushaf-word')).toHaveCount(4);
    await expect(roots.nth(0).locator('.mushaf-word--end')).toHaveCount(1);
    await expect(roots.nth(0).locator('.mushaf-word').first()).toHaveAttribute('data-location', '2:1:1');
    await expect(page.locator(ROW).first()).toHaveCSS('direction', 'rtl');

    for (let i = 0; i < 3; i++) {
      const root = await box(page, ROOT, i);
      const words = await wordBoxes(page, i);
      expect(words.length).toBeGreaterThan(0);
      for (const w of words) {
        expect(w.width).toBeGreaterThan(5);
        expect(w.x).toBeGreaterThanOrEqual(root.x - 1);
        expect(w.right).toBeLessThanOrEqual(root.x + root.width + 1);
      }
      // Reading direction: DOM order (wordId order) runs right to left.
      for (let k = 1; k < words.length; k++) expect(words[k]!.x).toBeLessThan(words[k - 1]!.x);
      // No horizontal overflow of the row inside the root.
      const overflow = await page.locator(ROW).nth(i).evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }

    // At a fixed type size (fit: 'mushaf') the line starts at the right margin and ends wherever its
    // own advances end — nothing is stretched to reach the left margin. Centred line: equal gaps.
    const justifiedRoot = await box(page, ROOT, 0);
    const justified = await wordBoxes(page, 0);
    const rightmost = Math.max(...justified.map((w) => w.right));
    const leftmost = Math.min(...justified.map((w) => w.x));
    expect(Math.abs(rightmost - (justifiedRoot.x + justifiedRoot.width))).toBeLessThanOrEqual(1.5);
    expect(leftmost).toBeGreaterThanOrEqual(justifiedRoot.x - 1.5);
    // Words sit at their own advances: neighbouring words touch, no distributed gap between them.
    const gaps = justified.slice(1).map((w, k) => justified[k]!.x - w.right);
    for (const gap of gaps) expect(Math.abs(gap)).toBeLessThanOrEqual(1.5);
    const centeredRoot = await box(page, ROOT, 1);
    const centered = await wordBoxes(page, 1);
    const gapLeft = Math.min(...centered.map((w) => w.x)) - centeredRoot.x;
    const gapRight = centeredRoot.x + centeredRoot.width - Math.max(...centered.map((w) => w.right));
    expect(gapLeft).toBeGreaterThan(20);
    expect(Math.abs(gapLeft - gapRight)).toBeLessThanOrEqual(2);
  });

  test('a two-code-point word renders as one glyph run', async ({page}) => {
    await open(page, 'static');
    await rowsVisible(page, 3);
    const words = await wordBoxes(page, 2);
    // 2:3:1 is both the rub-el-hizb marker and the first (two-code-point) word; pick the word.
    const two = await page.locator(ROOT).nth(2).locator('.mushaf-word[data-kind="word"][data-position="1"][data-ayah="3"]').evaluate((el) => ({
      text: el.textContent ?? '',
      width: el.getBoundingClientRect().width,
    }));
    expect([...two.text].length).toBe(2);
    expect(two.width).toBeGreaterThan(5);
    expect(words.length).toBe(4);
  });

  test('never shows the row before the font is in document.fonts', async ({page}) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => {
      release = r;
    });
    await page.route('**/fonts/qpc-v4-tajweed/p10.ttf', async (route) => {
      await held;
      await route.continue();
    });
    await open(page, 'static');
    await expect(page.locator(ROW)).toHaveCount(3);
    for (let i = 0; i < 8; i++) {
      for (let r = 0; r < 3; r++) await expect(page.locator(ROW).nth(r)).toHaveCSS('visibility', 'hidden');
      expect(await fontsLoaded(page, ['mushaf-qpc-v4-p1'])).toBe(false);
      await page.waitForTimeout(100);
    }
    release();
    await rowsVisible(page, 3);
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-p1', 'mushaf-qpc-v4-p2', 'mushaf-qpc-v4-p3'])).toBe(true);
  });

  test('a remount is visible on its first paint (no hidden frame)', async ({page}) => {
    await open(page, 'static');
    await rowsVisible(page, 3);
    await page.evaluate(() => {
      const log: string[] = [];
      (window as unknown as {__rowLog: string[]}).__rowLog = log;
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (!(n instanceof HTMLElement)) continue;
            const rows = n.matches('.mushaf-line__row') ? [n] : Array.from(n.querySelectorAll<HTMLElement>('.mushaf-line__row'));
            for (const r of rows) log.push(r.style.visibility);
          }
        }
      }).observe(document.body, {childList: true, subtree: true});
      (window as unknown as {__harness: {remount: () => void}}).__harness.remount();
    });
    await expect(page.locator('[data-mount="1"]')).toHaveCount(1);
    await rowsVisible(page, 3);
    const log = await page.evaluate(() => (window as unknown as {__rowLog: string[]}).__rowLog);
    expect(log.length).toBe(3);
    expect(log).toEqual(['visible', 'visible', 'visible']);
  });

  test('ignores hostile page CSS', async ({page}) => {
    await open(page, 'static');
    await rowsVisible(page, 3);
    const clean = await wordBoxes(page, 0);
    await open(page, 'static', '&hostile=1');
    await rowsVisible(page, 3);
    const hostile = await wordBoxes(page, 0);
    expect(hostile.map((w) => Math.round(w.width))).toEqual(clean.map((w) => Math.round(w.width)));
    const style = await page.locator(ROW).first().evaluate((el) => {
      const s = getComputedStyle(el);
      return {letterSpacing: s.letterSpacing, wordSpacing: s.wordSpacing, fontWeight: s.fontWeight, fontStyle: s.fontStyle, textTransform: s.textTransform, fontFamily: s.fontFamily};
    });
    expect(['0px', 'normal']).toContain(style.letterSpacing);
    expect(['0px', 'normal']).toContain(style.wordSpacing);
    expect(style.fontWeight).toBe('400');
    expect(style.fontStyle).toBe('normal');
    expect(style.textTransform).toBe('none');
    expect(style.fontFamily).toContain('mushaf-qpc-v4-p2');
  });

  test('four stacked lines never overflow their boxes', async ({page}) => {
    await open(page, 'overflow');
    await rowsVisible(page, 4);
    for (let i = 0; i < 4; i++) {
      const root = await box(page, ROOT, i);
      for (const w of await wordBoxes(page, i)) {
        expect(w.x).toBeGreaterThanOrEqual(root.x - 1);
        expect(w.right).toBeLessThanOrEqual(root.x + root.width + 1);
      }
    }
    // Stacked roots do not overlap.
    const a = await box(page, ROOT, 0);
    const b = await box(page, ROOT, 1);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 0.5);
  });
});

test.describe('entrances', () => {
  const presented = (page: Page, i = 0) => page.locator(ROOT).nth(i).locator(':scope > *').first();

  test('fade: opacity follows the timing over the local frame', async ({page}) => {
    await open(page, 'static');
    await rowsVisible(page, 3);
    const staticBox = await box(page, ROOT, 0);
    await open(page, 'fade');
    await rowsVisible(page, 3);
    expect(await box(page, ROOT, 0)).toEqual(staticBox);
    await seek(page, 0);
    await expect(presented(page)).toHaveCSS('opacity', '0');
    await seek(page, 10);
    expect(Number(await presented(page).evaluate((el) => getComputedStyle(el).opacity))).toBeCloseTo(0.5, 1);
    await seek(page, 20);
    await expect(presented(page)).toHaveCSS('opacity', '1');
    await seek(page, 90);
    await expect(presented(page)).toHaveCSS('opacity', '1');
  });

  test('slide: the line moves in from the right and the root box is presentation-independent', async ({page}) => {
    await open(page, 'static');
    await rowsVisible(page, 3);
    const staticBox = await box(page, ROOT, 0);
    const staticWords = await wordBoxes(page, 0);
    await open(page, 'slide');
    await rowsVisible(page, 3);
    await seek(page, 0);
    expect(await box(page, ROOT, 0)).toEqual(staticBox);
    const atStart = await wordBoxes(page, 0);
    expect(atStart[0]!.x - staticWords[0]!.x).toBeGreaterThan(staticBox.width * 0.9);
    await seek(page, 20);
    const atEnd = await wordBoxes(page, 0);
    expect(atEnd.map((w) => Math.round(w.x))).toEqual(staticWords.map((w) => Math.round(w.x)));
  });

  test('revealRtl: clip-path opens from the right edge', async ({page}) => {
    await open(page, 'reveal');
    await rowsVisible(page, 3);
    await seek(page, 0);
    await expect(presented(page)).toHaveCSS('clip-path', 'inset(-100% 0px -100% 100%)');
    await seek(page, 10);
    await expect(presented(page)).toHaveCSS('clip-path', 'inset(-100% 0px -100% 50%)');
    await seek(page, 20);
    await expect(presented(page)).toHaveCSS('clip-path', 'inset(-100% 0px -100% 0%)');
  });

  test('none: renders like a plain line', async ({page}) => {
    await open(page, 'static');
    await rowsVisible(page, 3);
    const staticWords = await wordBoxes(page, 0);
    await open(page, 'none');
    await rowsVisible(page, 3);
    await seek(page, 0);
    expect((await wordBoxes(page, 0)).map((w) => Math.round(w.x))).toEqual(staticWords.map((w) => Math.round(w.x)));
  });

  test('premountFor loads the font before the sequence starts', async ({page}) => {
    await open(page, 'premount');
    await seek(page, 20);
    await expect(page.locator(ROOT)).toHaveCount(0);
    await seek(page, 40); // premounted: mounted but hidden by Remotion
    await expect(page.locator(ROOT)).toHaveCount(3);
    await expect(page.locator(ROW).first()).toHaveCSS('visibility', 'visible');
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-p1', 'mushaf-qpc-v4-p2', 'mushaf-qpc-v4-p3'])).toBe(true);
    const hiddenByRemotion = await page.locator(ROOT).first().evaluate((el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (getComputedStyle(node).opacity === '0') return true;
      }
      return false;
    });
    expect(hiddenByRemotion).toBe(true);
    await seek(page, 60); // sequence start: the fade begins at opacity 0
    await expect(presented(page)).toHaveCSS('opacity', '0');
    const stillHidden = await page.locator(ROOT).first().evaluate((el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (getComputedStyle(node).opacity === '0') return true;
      }
      return false;
    });
    expect(stillHidden).toBe(false);
    await seek(page, 80);
    await expect(presented(page)).toHaveCSS('opacity', '1');
  });

  test('a canvas presentation fails loudly', async ({page}) => {
    await open(page, 'dissolve');
    const supported = await page.evaluate(() => 'drawElementImage' in CanvasRenderingContext2D.prototype);
    if (supported) {
      // Chrome >= 148 with HTML-in-canvas: the presentation mounts and the line rejects it.
      await expect(page.locator('[data-error="CANVAS_PRESENTATION"]')).toBeVisible();
      await expect(page.locator('[data-error="CANVAS_PRESENTATION"]')).toContainText('fade()');
    } else {
      // Older browsers: @remotion/transitions itself throws before the line mounts.
      await expect(page.locator('[data-error]')).toBeVisible();
      await expect(page.locator('[data-error]')).toContainText('HTML in Canvas is not supported');
    }
    await expect(page.locator(ROOT)).toHaveCount(0);
  });
});

test.describe('exits and replacing', () => {
  const wrappers = (page: Page, i = 0) =>
    page.locator(ROOT).nth(i).evaluate((root) => {
      const outer = root.children[0] as HTMLElement | undefined;
      const inner = outer?.children[0] as HTMLElement | undefined;
      return {outer: outer?.style.opacity ?? null, inner: inner?.style.opacity ?? null, innerIsRow: inner?.classList.contains('mushaf-line__row') ?? false};
    });

  test('exit fade runs over the last frames of the sequence and the line leaves with it', async ({page}) => {
    await open(page, 'exit-fade');
    await rowsVisible(page, 1);
    await seek(page, 20);
    expect((await wrappers(page)).outer).toBe('1');
    await seek(page, 50);
    expect(Number((await wrappers(page)).outer)).toBeCloseTo(0.5, 5);
    await seek(page, 59);
    expect(Number((await wrappers(page)).outer)).toBeCloseTo(0.05, 5);
    await seek(page, 60);
    await expect(page.locator(ROOT)).toHaveCount(0); // the Sequence ended
  });

  test('exit slide pushes the line out to the left', async ({page}) => {
    await open(page, 'exit-slide');
    await rowsVisible(page, 1);
    await seek(page, 20);
    const root = await box(page, ROOT, 0);
    const before = await wordBoxes(page, 0);
    await seek(page, 50);
    const after = await wordBoxes(page, 0);
    for (let k = 0; k < before.length; k++) expect(before[k]!.x - after[k]!.x).toBeGreaterThan(root.width * 0.4);
  });

  test('replacing: the next line enters while the previous one leaves, in one slot', async ({page}) => {
    await open(page, 'replace');
    await seek(page, 30);
    await expect(page.locator(ROOT)).toHaveCount(1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-line', '3');
    await rowsVisible(page, 1);
    await seek(page, 50); // frame 10 of the overlap: the old line is half gone, the new one half in
    await expect(page.locator(ROOT)).toHaveCount(2);
    await rowsVisible(page, 2);
    const old = await wrappers(page, 0);
    const next = await wrappers(page, 1);
    expect(Number(old.outer)).toBeCloseTo(0.5, 5); // exit wrapper (outer) fading out ...
    expect(old.inner).toBe('1'); // ... around a finished entrance
    expect(next.outer).toBe('1'); // exit not started ...
    expect(Number(next.inner)).toBeCloseTo(0.5, 5); // ... entrance half way
    const a = await box(page, ROOT, 0);
    const b = await box(page, ROOT, 1);
    expect(b.y).toBeCloseTo(a.y, 0); // same slot
    await seek(page, 70);
    await expect(page.locator(ROOT)).toHaveCount(1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-line', '2');
    expect((await wrappers(page, 0)).inner).toBe('1');
  });
});

test.describe('the smooth defaults', () => {
  const wrapper = (page: Page, i = 0) =>
    page.locator(ROOT).nth(i).evaluate((root) => {
      const outer = root.children[0] as HTMLElement | undefined;
      const inner = outer?.children[0] as HTMLElement | undefined;
      return {outerOpacity: outer?.style.opacity ?? null, outerTransform: outer?.style.transform ?? null, innerOpacity: inner?.style.opacity ?? null, innerTransform: inner?.style.transform ?? null};
    });

  test('slideFade fades before it settles, and travels a fraction of the line box', async ({page}) => {
    await open(page, 'slide-fade');
    await rowsVisible(page, 1);
    const root = await box(page, ROOT, 0);
    await seek(page, 0);
    const start = await wrapper(page);
    expect(Number(start.innerOpacity)).toBe(0);
    // 28 % of the line box below its slot — a quarter of a line, not half the screen.
    const startY = (await box(page, ROW, 0)).y;
    await seek(page, 20); // settled
    const settledY = (await box(page, ROW, 0)).y;
    expect(startY - settledY).toBeGreaterThan(root.height * 0.2);
    expect(startY - settledY).toBeLessThan(root.height * 0.35);
    // Fully opaque before the movement ends: at 75 % of the window it is already 1 while still moving.
    await seek(page, 15);
    expect(Number((await wrapper(page)).innerOpacity)).toBe(1);
    expect((await box(page, ROW, 0)).y).toBeGreaterThan(settledY);
    // Every settled frame is identical (nothing keeps drifting).
    await seek(page, 25);
    expect((await box(page, ROW, 0)).y).toBeCloseTo(settledY, 1);
  });

  test('a fade-through replace never shows two half-visible lines at once', async ({page}) => {
    await open(page, 'fade-through');
    // Line 1 runs 0-39 (exit over 20-39), line 2 starts at 40.
    for (const frame of [10, 20, 25, 30, 35, 39]) {
      await seek(page, frame);
      await expect(page.locator(ROOT)).toHaveCount(1);
    }
    await seek(page, 40);
    await expect(page.locator(ROOT)).toHaveCount(1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-line', '2');
    // Both lines occupy the same slot, so the switch is in place, not a jump.
    await seek(page, 60);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-line', '2');
    expect(Number((await wrapper(page)).innerOpacity)).toBe(1);
  });

  test('revealRtl can fade its edge instead of cutting it', async ({page}) => {
    await open(page, 'soft-reveal');
    await rowsVisible(page, 1);
    await seek(page, 10);
    const style = await page.locator(ROOT).first().evaluate((root) => {
      const fill = root.children[0] as HTMLElement;
      return {mask: fill.style.maskImage || fill.style.webkitMaskImage, clip: fill.style.clipPath};
    });
    expect(style.clip).toBe('');
    expect(style.mask).toContain('linear-gradient');
    expect(style.mask).toContain('transparent');
  });
});

test.describe('colour and per-word hooks', () => {
  test('the plain glyph set follows CSS color; the tajweed one carries its own', async ({page}) => {
    await open(page, 'plain');
    await rowsVisible(page, 1);
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-p2'])).toBe(true);
    // Nothing in the package paints the line: the words inherit the page's colour.
    const colours = await page.locator('.mushaf-word').evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
    expect(new Set(colours)).toEqual(new Set(['rgb(0, 0, 0)']));
    await open(page, 'static');
    await rowsVisible(page, 3);
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-tajweed-p2'])).toBe(false);
  });

  test('mandala paints palette 3 with the ink in the inherited CSS color', async ({page}) => {
    await open(page, 'mandala');
    await rowsVisible(page, 1);
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-tajweed-p2'])).toBe(true);
    // The row selects the palette and the words inherit it (font-palette is an inherited property).
    const ident = await page.locator(ROW).evaluate((row) => getComputedStyle(row).fontPalette);
    expect(ident).toMatch(/^--mushaf-qpc-v4-tajweed-p2-palette-3-[0-9a-f]{8}$/);
    await expect(page.locator('.mushaf-word').first()).toHaveCSS('font-palette', ident);
    // ... and the rule it names is in the document, carrying the page's colour for everything
    // written — the letters and the rosette's frame and number (13) — and nothing for the
    // ornaments (10, 11) or the disc (12).
    const rule = await paletteRule(page, ident);
    expect(rule).toContain('base-palette: 3');
    expect(rule).toContain('mushaf-qpc-v4-tajweed-p2');
    expect(rule).toContain('0 rgb(27, 111, 63)');
    expect(rule).toContain('13 rgb(27, 111, 63)');
    expect(rule).toContain('15 rgb(27, 111, 63)');
    expect(rule).not.toMatch(/1[0-2] rgb\(27/);
    // The palette reaches the glyphs, not just the CSSOM: the same line at the font's default
    // palette (the full tajweed colours) paints different pixels.
    const mandala = await page.locator(ROW).screenshot();
    await open(page, 'tajweed');
    await rowsVisible(page, 1);
    await expect(page.locator(ROW)).toHaveCSS('font-palette', 'normal');
    expect(mandala.equals(await page.locator(ROW).screenshot())).toBe(false);
  });

  test('every part of the mandala takes a CSS colour', async ({page}) => {
    await open(page, 'mandala-gold');
    await rowsVisible(page, 1);
    const ident = await page.locator(ROW).evaluate((row) => getComputedStyle(row).fontPalette);
    const rule = await paletteRule(page, ident);
    // One entry per part: ink (letters, and 13 = frame + number), detail (10 = jewel),
    // accent (11 = petals), background (12 = the disc).
    expect(rule).toContain('0 rgb(27, 27, 27)');
    expect(rule).toContain('13 rgb(27, 27, 27)');
    expect(rule).toContain('10 rgb(27, 111, 63)');
    expect(rule).toContain('11 rgb(200, 164, 92)');
    expect(rule).toContain('12 transparent');
    // A recoloured rosette is a different picture from the font's own.
    const gold = await page.locator(ROW).screenshot();
    await open(page, 'mandala');
    await rowsVisible(page, 1);
    expect(gold.equals(await page.locator(ROW).screenshot())).toBe(false);
  });

  test('activeWordId and wordStyle reach exactly one word', async ({page}) => {
    await open(page, 'highlight');
    await rowsVisible(page, 1);
    const active = page.locator('[data-active="true"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute('data-location', '2:1:2');
    await expect(active).toHaveClass(/mushaf-word--active/);
    await expect(active).toHaveCSS('color', 'rgb(179, 0, 0)');
    await expect(active).toHaveCSS('opacity', '1');
    const others = page.locator('.mushaf-word:not([data-active])');
    await expect(others).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(others.nth(i)).toHaveCSS('opacity', '0.35');
    // The pinned row layout still governs the words.
    await expect(page.locator('.mushaf-word').first()).toHaveCSS('display', 'block');
  });
});

test.describe('font failures', () => {
  test('404 fails fast with FONT_HTTP', async ({page}) => {
    await open(page, 'font-404');
    const err = page.locator('[data-error="FONT_HTTP"]');
    await expect(err).toBeVisible();
    await expect(err).toContainText('404');
    await expect(err).toContainText('missing.woff2');
  });

  test('an HTML response is rejected with FONT_INVALID', async ({page}) => {
    await open(page, 'font-html');
    const err = page.locator('[data-error="FONT_INVALID"]');
    await expect(err).toBeVisible();
    await expect(err).toContainText('not a font');
  });
});

test.describe('real data', () => {
  // Runs once QUL's exports are mirrored (scripts/fetch-qul.mjs --data or the QUL assets workflow).
  test('page 10 line 3 renders every word right to left, justified, with the ayah marker', async ({page}) => {
    test.skip(!hasMirror(), NO_MIRROR);
    // Through the built package (plain ESM), which is what the harness consumes too: Node fetches
    // the mirror from the Vite server and builds the layout the same way a browser would.
    const pkg = (await import('../../dist/esm/index.mjs')) as typeof import('../../src/index');
    const line = await pkg.getMushafLine({mushaf: 'qpc-v4-tajweed', page: 10, line: 3, data: MIRROR});
    expect(line.words.length).toBeGreaterThan(5);
    expect(line.words[0]!.id).toBe('2:62:18'); // ... عِندَ | رَبِّهِمْ وَلَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ (62) وَإِذْ أَخَذْنَا
    expect(line.words.some((w) => w.kind === 'end' && w.ayah === 62)).toBe(true);
    expect(line.words.at(-1)!.id).toBe('2:63:2');

    await open(page, 'static');
    await rowsVisible(page, 3);
    await page.evaluate(
      (data) => (window as unknown as {__harness: {setProps: (p: unknown) => void}}).__harness.setProps({lines: [{...data, fontUrl: '/fonts/qpc-v4-tajweed/p10.woff2'}], fit: 'line'}),
      line,
    );
    await rowsVisible(page, 1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-page', '10');
    await expect(page.locator(ROOT).first().locator('.mushaf-word')).toHaveCount(line.words.length);
    await expect(page.locator(ROOT).first().locator('.mushaf-word').first()).toHaveAttribute('data-location', '2:62:18');
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-tajweed-p10'])).toBe(true);

    const root = await box(page, ROOT, 0);
    const words = await wordBoxes(page, 0);
    for (let k = 1; k < words.length; k++) expect(words[k]!.x).toBeLessThan(words[k - 1]!.x);
    // fit: 'line' — a real line fills its box exactly, and it does so at the font's own advances:
    // every neighbouring pair of words touches, so no gap is inflated to make the line reach.
    expect(Math.abs(Math.max(...words.map((w) => w.right)) - (root.x + root.width))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(Math.min(...words.map((w) => w.x)) - root.x)).toBeLessThanOrEqual(1.5);
    for (let k = 1; k < words.length; k++) expect(Math.abs(words[k - 1]!.x - words[k]!.right)).toBeLessThanOrEqual(1.5);
    for (const w of words) expect(w.width).toBeGreaterThan(5);
  });
});

test.describe('data', () => {
  test('the convenience form fetches, unzips and reads QUL\'s exports in the browser, once per tab', async ({page}) => {
    test.skip(!hasMirror(), NO_MIRROR);
    const downloads: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/data/qpc-v4/')) downloads.push(request.url());
    });
    const words = page.waitForResponse('**/data/qpc-v4/words.json.zip');
    await open(page, 'resolve-data');
    expect((await words).status()).toBe(200);
    await rowsVisible(page, 1);
    const root = page.locator(ROOT).first();
    await expect(root).toHaveAttribute('data-page', '10');
    await expect(root).toHaveAttribute('data-line', '3');
    await expect(root.locator('.mushaf-word').first()).toHaveAttribute('data-location', '2:62:18');
    await expect(root.locator('.mushaf-word').last()).toHaveAttribute('data-location', '2:63:2');
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-tajweed-p10'])).toBe(true);
    // Both exports were fetched exactly once...
    expect(downloads.filter((u) => u.endsWith('words.json.zip'))).toHaveLength(1);
    expect(downloads.filter((u) => u.endsWith('layout.db.zip'))).toHaveLength(1);
    // ... and a remount resolves from the cache, without a second download.
    await page.evaluate(() => (window as unknown as {__harness: {remount: () => void}}).__harness.remount());
    await page.waitForFunction(() => document.querySelector('[data-mount="1"]') !== null);
    await rowsVisible(page, 1);
    await expect(page.locator(ROOT).first().locator('.mushaf-word').first()).toHaveAttribute('data-location', '2:62:18');
    expect(downloads.filter((u) => u.endsWith('words.json.zip'))).toHaveLength(1);
  });

  test('failures name their cause: a missing export, an HTML page, a relative path', async ({page}) => {
    test.skip(!hasMirror(), NO_MIRROR);
    await open(page, 'data-404');
    const http = page.locator('[data-error="DATA_HTTP"]');
    await expect(http).toBeVisible();
    await expect(http).toContainText('HTTP 404 for the mushaf words export');
    await open(page, 'data-html');
    const invalid = page.locator('[data-error="DATA_INVALID"]');
    await expect(invalid).toBeVisible();
    await expect(invalid).toContainText('is not JSON');
    await open(page, 'data-relative');
    const bad = page.locator('[data-error="BAD_DATA_URL"]');
    await expect(bad).toBeVisible();
    await expect(bad).toContainText('relative to the bundle is ambiguous');
  });
});

test.describe('slicing', () => {
  const slicedAttr = (page: Page) => page.locator(ROOT).first().getAttribute('data-sliced');
  const rowFontSize = (page: Page) => page.locator(ROW).first().evaluate((row) => getComputedStyle(row).fontSize);

  test('shows only the ayah, centred, at the printed advances and the whole line\'s size', async ({page}) => {
    await open(page, 'two-ayahs');
    await rowsVisible(page, 1);
    const whole = await wordBoxes(page, 0);
    await open(page, 'slice-ayah');
    await rowsVisible(page, 1);
    expect(await slicedAttr(page)).toBe('19-20');
    await expect(page.locator(ROW)).toHaveCSS('justify-content', 'center');
    const root = await box(page, ROOT, 0);
    const words = await wordBoxes(page, 0);
    // Every span is still there; the hidden ones take no space, the shown ones are exactly 2:4's.
    expect(words).toHaveLength(4);
    expect(words.slice(0, 2).every((w) => w.width === 0)).toBe(true);
    await expect(page.locator('.mushaf-word').first()).toHaveAttribute('data-hidden', 'true');
    await expect(page.locator('.mushaf-word').first()).toHaveCSS('display', 'none');
    await expect(page.locator('.mushaf-word').nth(2)).not.toHaveAttribute('data-hidden', /.*/);
    const shown = words.slice(2);
    for (const w of shown) expect(w.width).toBeGreaterThan(5);
    // Centred in the measure, with the same tolerance as a centred line.
    const gapLeft = Math.min(...shown.map((w) => w.x)) - root.x;
    const gapRight = root.x + root.width - Math.max(...shown.map((w) => w.right));
    expect(gapLeft).toBeGreaterThan(20);
    expect(Math.abs(gapLeft - gapRight)).toBeLessThanOrEqual(2);
    // At the printed advances: the two words still touch, and each is exactly as wide as in the whole
    // line — nothing was rescaled or re-spaced.
    expect(Math.abs(shown[0]!.x - shown[1]!.right)).toBeLessThanOrEqual(1.5);
    expect(shown.map((w) => Math.round(w.width))).toEqual(whole.slice(2).map((w) => Math.round(w.width)));
  });

  test('a slice that keeps every word is the printed line; one that keeps none is a blank slot', async ({page}) => {
    await open(page, 'two-ayahs');
    await rowsVisible(page, 1);
    const whole = await wordBoxes(page, 0);
    await open(page, 'slice-all');
    await rowsVisible(page, 1);
    expect(await slicedAttr(page)).toBeNull();
    await expect(page.locator(ROW)).toHaveCSS('justify-content', 'flex-start');
    const same = await wordBoxes(page, 0);
    expect(same.map((w) => [Math.round(w.x), Math.round(w.width)])).toEqual(whole.map((w) => [Math.round(w.x), Math.round(w.width)]));
    await open(page, 'slice-empty');
    await rowsVisible(page, 1);
    expect(await slicedAttr(page)).toBe('empty');
    await expect(page.locator('.mushaf-word')).toHaveCount(4);
    expect((await wordBoxes(page, 0)).every((w) => w.width === 0)).toBe(true);
    const root = await box(page, ROOT, 0);
    expect(root.height).toBeGreaterThan(100);
  });

  test('a slice the line data carries applies on its own', async ({page}) => {
    await open(page, 'slice-data');
    await rowsVisible(page, 1);
    expect(await slicedAttr(page)).toBe('19-20');
    const words = await wordBoxes(page, 0);
    expect(words.map((w) => w.width > 0)).toEqual([false, false, true, true]);
  });

  test('revealRtl still sweeps the whole measure over a centred slice', async ({page}) => {
    await open(page, 'slice-reveal');
    await rowsVisible(page, 1);
    await seek(page, 10);
    await expect(page.locator(ROOT).first().locator('> *').first()).toHaveCSS('clip-path', 'inset(-100% 0px -100% 50%)');
    expect(await slicedAttr(page)).toBe('19-20');
  });

  test('with fit="line" a slice keeps the size the whole line was fitted to, frame after frame', async ({page}) => {
    test.skip(!hasMirror(), NO_MIRROR);
    const pkg = (await import('../../dist/esm/index.mjs')) as typeof import('../../src/index');
    const line = await pkg.getMushafLine({mushaf: 'qpc-v4-tajweed', page: 10, line: 3, data: MIRROR});
    // ... رَبِّهِمْ وَلَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ (62) وَإِذْ أَخَذْنَا — 2:62 ends, 2:63 begins.
    const data = {...line, fontUrl: '/fonts/qpc-v4-tajweed/p10.woff2'};
    const setProps = (overrides: unknown) => page.evaluate((p) => (window as unknown as {__harness: {setProps: (p: unknown) => void}}).__harness.setProps(p), overrides);
    await open(page, 'static');
    await rowsVisible(page, 3);
    await setProps({lines: [data], fit: 'line'});
    await rowsVisible(page, 1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-page', '10');
    const fitted = await rowFontSize(page);
    const whole = await wordBoxes(page, 0);
    const root = await box(page, ROOT, 0);

    const centredBand = async (ayah: number) => {
      const words = await wordBoxes(page, 0);
      const shown = words.filter((w) => w.width > 0);
      expect(shown.length).toBe(line.words.filter((w) => w.ayah === ayah).length);
      expect(shown.length).toBeLessThan(words.length);
      // Same size as the whole line: every shown word is as wide as it was un-sliced.
      const byPosition = new Map(whole.map((w) => [`${w.kind}:${w.position}`, Math.round(w.width)]));
      for (const w of shown) expect(Math.round(w.width)).toBe(byPosition.get(`${w.kind}:${w.position}`));
      const gapLeft = Math.min(...shown.map((w) => w.x)) - root.x;
      const gapRight = root.x + root.width - Math.max(...shown.map((w) => w.right));
      expect(Math.abs(gapLeft - gapRight)).toBeLessThanOrEqual(2);
    };

    await setProps({lines: [data], fit: 'line', slice: {ayah: 63}});
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-sliced', /^\d+-\d+$/);
    await rowsVisible(page, 1);
    expect(await rowFontSize(page)).toBe(fitted);
    await centredBand(63);
    // Another slice on the same mounted line: no re-measure, same size, new band.
    await setProps({lines: [data], fit: 'line', slice: {ayah: 62}});
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-sliced', /^\d+-\d+$/);
    await rowsVisible(page, 1);
    expect(await rowFontSize(page)).toBe(fitted);
    await centredBand(62);
  });
});

test.describe('network', () => {
  const CDN = 'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/woff2/p1.woff2?v=3.1';

  test('@network loads page 1 of qpc-v4-tajweed from QUL\'s CDN', async ({page}) => {
    let reachable = false;
    try {
      const res = await fetch(CDN, {method: 'HEAD', signal: AbortSignal.timeout(5000)});
      reachable = res.ok;
    } catch {
      reachable = false;
    }
    test.skip(!reachable, `${CDN} is not reachable from this environment`);
    // The CDN answers CORS headers only to requests that carry an Origin, like a browser's.
    const res = await fetch(CDN, {headers: {origin: 'https://example.com'}, signal: AbortSignal.timeout(20_000)});
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const head = new Uint8Array(await res.arrayBuffer()).slice(0, 4);
    expect(String.fromCharCode(...head)).toBe('wOF2');
    await open(page, 'cdn');
    await rowsVisible(page, 1);
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-tajweed-p1'])).toBe(true);
  });
});

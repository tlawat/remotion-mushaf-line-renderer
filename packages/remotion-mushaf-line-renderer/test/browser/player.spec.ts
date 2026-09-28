// Browser suite against the example's <Player> harness (example/player). Synthetic lines are
// rendered with the page-10 tajweed fixture font (test/fixtures/fonts, example/public/fonts).
import {existsSync} from 'node:fs';
import path from 'node:path';
import {expect, type Page, test} from '@playwright/test';

type Box = {x: number; y: number; width: number; height: number};

/** The example's mirror of QUL's two exports (`bun run qul data`), served by Vite with the rest of public/. */
const MIRROR = {
  words: 'http://localhost:4173/data/qpc-v4/words.json.zip',
  layout: 'http://localhost:4173/data/qpc-v4/layout.db.zip',
};
// Resolved from the config's rootDir (this folder): Playwright's loader has no import.meta.url to offer.
const hasMirror = () =>
  existsSync(path.resolve(test.info().config.rootDir, '../../../../example/public/data/qpc-v4/layout.db.zip'));
const NO_MIRROR = "QUL's exports are not mirrored under example/public/data (bun run qul data)";

const ROW = '.mushaf-line__row';
const ROOT = '.mushaf-line';
/** The shared fonts, mirrored by `bun run qul fonts` into example/public/fonts/<id>/. */
const hasSharedFonts = () =>
  existsSync(
    path.resolve(test.info().config.rootDir, '../../../../example/public/fonts/surah-names-v4/surah_names.woff2'),
  );
const NO_SHARED_FONTS = 'the shared fonts are not mirrored under example/public/fonts (bun run qul fonts 10)';

const open = async (page: Page, scenario: string, extra = '') => {
  await page.goto(`/player/?scenario=${scenario}${extra}`);
  await page.waitForFunction(() => Boolean((window as unknown as {__harness?: unknown}).__harness));
};

const seek = async (page: Page, frame: number) => {
  await page.evaluate(
    (f) => (window as unknown as {__harness: {seekTo: (n: number) => void}}).__harness.seekTo(f),
    frame,
  );
  await page.waitForFunction(
    (f) => (window as unknown as {__harness: {getCurrentFrame: () => number}}).__harness.getCurrentFrame() === f,
    frame,
  );
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
  page
    .locator(ROOT)
    .nth(lineIndex)
    .locator('.mushaf-word')
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.x,
          width: r.width,
          right: r.right,
          position: Number(el.getAttribute('data-position')),
          kind: el.getAttribute('data-kind'),
        };
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

// A loaded FontFace of that page font is in document.fonts: the family itself, or the family with
// the suffix a source other than the plain CDN adds (the scenarios pin their fixture font through
// `fontSrc`). (`document.fonts.check()` is not usable here: it also answers true while no face of
// the family is registered yet.)
const fontsLoaded = (page: Page, families: string[]) =>
  page.evaluate((fams) => {
    const faces = Array.from(document.fonts);
    return fams.every((f) =>
      faces.some((face) => {
        const family = face.family.replace(/^"|"$/g, '');
        return (family === f || new RegExp(`^${f}-[0-9a-z]+$`).test(family)) && face.status === 'loaded';
      }),
    );
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
      const overflow = await page
        .locator(ROW)
        .nth(i)
        .evaluate((el) => el.scrollWidth - el.clientWidth);
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
    const two = await page
      .locator(ROOT)
      .nth(2)
      .locator('.mushaf-word[data-kind="word"][data-position="1"][data-ayah="3"]')
      .evaluate((el) => ({
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
            const rows = n.matches('.mushaf-line__row')
              ? [n]
              : Array.from(n.querySelectorAll<HTMLElement>('.mushaf-line__row'));
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
    const style = await page
      .locator(ROW)
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          letterSpacing: s.letterSpacing,
          wordSpacing: s.wordSpacing,
          fontWeight: s.fontWeight,
          fontStyle: s.fontStyle,
          textTransform: s.textTransform,
          fontFamily: s.fontFamily,
        };
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
    const hiddenByRemotion = await page
      .locator(ROOT)
      .first()
      .evaluate((el) => {
        for (let node = el.parentElement; node; node = node.parentElement) {
          if (getComputedStyle(node).opacity === '0') return true;
        }
        return false;
      });
    expect(hiddenByRemotion).toBe(true);
    await seek(page, 60); // sequence start: the fade begins at opacity 0
    await expect(presented(page)).toHaveCSS('opacity', '0');
    const stillHidden = await page
      .locator(ROOT)
      .first()
      .evaluate((el) => {
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
    page
      .locator(ROOT)
      .nth(i)
      .evaluate((root) => {
        const outer = root.children[0] as HTMLElement | undefined;
        const inner = outer?.children[0] as HTMLElement | undefined;
        return {
          outer: outer?.style.opacity ?? null,
          inner: inner?.style.opacity ?? null,
          innerIsRow: inner?.classList.contains('mushaf-line__row') ?? false,
        };
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
    page
      .locator(ROOT)
      .nth(i)
      .evaluate((root) => {
        const outer = root.children[0] as HTMLElement | undefined;
        const inner = outer?.children[0] as HTMLElement | undefined;
        return {
          outerOpacity: outer?.style.opacity ?? null,
          outerTransform: outer?.style.transform ?? null,
          innerOpacity: inner?.style.opacity ?? null,
          innerTransform: inner?.style.transform ?? null,
        };
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
    const style = await page
      .locator(ROOT)
      .first()
      .evaluate((root) => {
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
    const colours = await page
      .locator('.mushaf-word')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
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
    expect(ident).toMatch(/^--mushaf-qpc-v4-tajweed-p2(-[0-9a-z]+)?-palette-3-[0-9a-f]{8}$/);
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
    // The light theme is QUL's Light rule: base palette 0 with every entry written out.
    const light = await page.locator(ROW).evaluate((row) => getComputedStyle(row).fontPalette);
    expect(light).toMatch(/^--mushaf-qpc-v4-tajweed-p2(-[0-9a-z]+)?-palette-0-[0-9a-f]{8}$/);
    expect(await paletteRule(page, light)).toContain('base-palette: 0');
    expect(mandala.equals(await page.locator(ROW).screenshot())).toBe(false);
  });

  test('every part of the mandala takes a CSS colour', async ({page}) => {
    await open(page, 'mandala-gold');
    await rowsVisible(page, 1);
    const ident = await page.locator(ROW).evaluate((row) => getComputedStyle(row).fontPalette);
    const rule = await paletteRule(page, ident);
    // One entry per part: ink (letters), frame (13 = frame + number), detail (10 = jewel),
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

  test("QUL's dark and sepia themes write their own colours for every entry", async ({page}) => {
    await open(page, 'dark');
    await rowsVisible(page, 1);
    const darkIdent = await page.locator(ROW).evaluate((row) => getComputedStyle(row).fontPalette);
    expect(darkIdent).toMatch(/^--mushaf-qpc-v4-tajweed-p2(-[0-9a-z]+)?-palette-5-[0-9a-f]{8}$/);
    const dark = await paletteRule(page, darkIdent);
    expect(dark).toContain('base-palette: 5');
    expect(dark).toContain('0 rgb(232, 232, 232)'); // #e8e8e8, the letters
    expect(dark).toContain('7 rgb(77, 150, 255)'); // #4d96ff, the 2-vowel prolongation
    expect(dark).toContain('12 rgb(52, 58, 64)'); // #343a40, the disc matches the page
    const darkShot = await page.locator(ROW).screenshot();
    await open(page, 'sepia');
    await rowsVisible(page, 1);
    const sepiaIdent = await page.locator(ROW).evaluate((row) => getComputedStyle(row).fontPalette);
    const sepia = await paletteRule(page, sepiaIdent);
    expect(sepia).toContain('base-palette: 2');
    expect(sepia).toContain('0 rgb(61, 41, 20)'); // #3d2914
    expect(darkShot.equals(await page.locator(ROW).screenshot())).toBe(false);
  });

  test("QUL's black theme paints everything white and the ayah number black, through a second palette", async ({
    page,
  }) => {
    await open(page, 'black');
    await rowsVisible(page, 1);
    const rowIdent = await page.locator(ROW).evaluate((row) => getComputedStyle(row).fontPalette);
    const rowRule = await paletteRule(page, rowIdent);
    for (const entry of [0, 7, 12, 13]) expect(rowRule).toContain(`${entry} rgb(255, 255, 255)`);
    // Ordinary words inherit the row's palette; the marker glyph names its own rule, black at 13.
    await expect(page.locator('.mushaf-word[data-kind="word"]').first()).toHaveCSS('font-palette', rowIdent);
    const marker = page.locator('.mushaf-word--end').first();
    const markerIdent = await marker.evaluate((el) => getComputedStyle(el).fontPalette);
    expect(markerIdent).not.toBe(rowIdent);
    const markerRule = await paletteRule(page, markerIdent);
    expect(markerRule).toContain('13 rgb(0, 0, 0)');
    // The synthetic lines borrow arbitrary page-10 glyphs, so the pixels of the second palette are
    // checked with a real ayah marker in the render suite (test/render, "dark and black themes").
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

test.describe('line window', () => {
  const WINDOW = '.mushaf-line-window';
  const SLOT = '.mushaf-line-window__slot';
  type Slot = {index: number; y: number; height: number; opacity: string; lineOpacity: string; current: boolean};
  const slots = (page: Page): Promise<Slot[]> =>
    page.locator(SLOT).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const line = el.querySelector<HTMLElement>('.mushaf-line');
        return {
          index: Number(el.getAttribute('data-index')),
          y: r.y,
          height: r.height,
          opacity: getComputedStyle(el).opacity,
          lineOpacity: line ? getComputedStyle(line).opacity : '',
          current: el.getAttribute('data-current') === 'true',
        };
      }),
    );
  const position = async (page: Page) => Number(await page.locator(WINDOW).getAttribute('data-position'));

  test('three slots a line-height apart, the current line centred, only the mounted pages loaded', async ({page}) => {
    await open(page, 'window');
    await rowsVisible(page, 3); // lines 0 and 1 in the window, line 2 preloaded below it
    const win = await box(page, WINDOW);
    const all = await slots(page);
    const lineHeight = all[0]!.height;
    expect(win.height).toBeCloseTo(3 * lineHeight, 0);
    expect(all.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(all[0]!.y - win.y).toBeCloseTo(lineHeight, 0); // the middle slot
    expect(all[1]!.y - all[0]!.y).toBeCloseTo(lineHeight, 0);
    expect(all[2]!.y - all[1]!.y).toBeCloseTo(lineHeight, 0);
    expect(all.map((s) => s.current)).toEqual([true, false, false]);
    expect(all.map((s) => s.opacity)).toEqual(['1', '1', '0']); // the preloaded line is outside the window
    expect(all.map((s) => s.lineOpacity)).toEqual(['1', '1', '1']); // neighbourOpacity 1: no dimming
    await expect(page.locator(WINDOW)).toHaveAttribute('data-position', '0.0000');
    await expect(page.locator(WINDOW)).toHaveCSS('overflow', 'hidden');
    // The five lines sit on pages 2, 2, 1, 3, 3: page 3 is not mounted yet, so its font is not asked for.
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-p2', 'mushaf-qpc-v4-p1'])).toBe(true);
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-p3'])).toBe(false);
  });

  test('a step moves every line together by exactly one line-height, fading the edges', async ({page}) => {
    await open(page, 'window');
    await rowsVisible(page, 3);
    const before = await slots(page);
    const lineHeight = before[0]!.height;
    const yBefore = new Map(before.map((s) => [s.index, s.y]));
    await seek(page, 15); // half way through the first step
    expect(await position(page)).toBeCloseTo(0.5, 5);
    const mid = await slots(page);
    expect(mid.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    for (const s of mid) {
      const y = yBefore.get(s.index);
      if (y !== undefined) expect(y - s.y).toBeCloseTo(lineHeight / 2, 0); // the same travel for every line
    }
    expect(mid.map((s) => s.current)).toEqual([false, true, false, false]);
    expect(Number(mid[2]!.opacity)).toBeCloseTo(0.5, 5); // line 2 fading in at the bottom edge
    expect(mid[3]!.opacity).toBe('0');
    await seek(page, 20); // the step: line 1 is exactly where line 0 was
    await expect(page.locator(WINDOW)).toHaveAttribute('data-position', '1.0000');
    const after = await slots(page);
    expect(after.find((s) => s.index === 1)!.y).toBeCloseTo(yBefore.get(0)!, 0);
    expect(after.find((s) => s.index === 0)!.y).toBeCloseTo(yBefore.get(0)! - lineHeight, 0);
    expect(after.map((s) => s.opacity)).toEqual(['1', '1', '1', '0']);
    await seek(page, 40); // line 2 centred: line 0 has left the window and is unmounted
    await expect(page.locator(WINDOW)).toHaveAttribute('data-position', '2.0000');
    expect((await slots(page)).map((s) => s.index)).toEqual([1, 2, 3, 4]);
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-p3'])).toBe(true);
  });

  test('steps closer than the scroll blend into one non-decreasing movement', async ({page}) => {
    await open(page, 'window-overlap'); // steps 30 and 35 with a 10-frame scroll
    await rowsVisible(page, 3);
    let previous = 0;
    for (let frame = 20; frame <= 40; frame++) {
      await seek(page, frame);
      const p = await position(page);
      expect(p).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(p - previous).toBeLessThanOrEqual(0.2 + 1e-9);
      previous = p;
    }
    await seek(page, 30);
    expect(await position(page)).toBeCloseTo(1.5, 5); // ahead of its step by the overlap
    await seek(page, 35);
    await expect(page.locator(WINDOW)).toHaveAttribute('data-position', '2.0000');
  });

  test('a first step in the future lets the first line rise from below into the centre', async ({page}) => {
    await open(page, 'window-first-scroll');
    await rowsVisible(page, 2);
    const win = await box(page, WINDOW);
    const start = await slots(page);
    expect(await position(page)).toBe(-1);
    expect(start.map((s) => s.index)).toEqual([0, 1]);
    expect(start[0]!.y - win.y).toBeCloseTo(2 * start[0]!.height, 0); // the bottom slot
    expect(start[0]!.opacity).toBe('1');
    await seek(page, 20);
    await expect(page.locator(WINDOW)).toHaveAttribute('data-position', '0.0000');
    expect((await slots(page))[0]!.y - win.y).toBeCloseTo(start[0]!.height, 0); // centred
  });

  test('dims the neighbours, takes a position directly, and enters as one', async ({page}) => {
    await open(page, 'window-dim');
    await rowsVisible(page, 3);
    await seek(page, 20);
    expect((await slots(page)).map((s) => s.lineOpacity)).toEqual(['0.45', '1', '0.45', '0.45']);
    await open(page, 'window-position'); // 1.25: lines 0-3 are within a line-height of the window, line 4 preloaded
    await rowsVisible(page, 5);
    await expect(page.locator(WINDOW)).toHaveAttribute('data-position', '1.2500');
    expect((await slots(page)).map((s) => s.current)).toEqual([false, true, false, false, false]);
    await open(page, 'window-enter');
    await rowsVisible(page, 3);
    const wrapper = page.locator(`${WINDOW} > [data-absolute-fill], ${WINDOW} > div`).first();
    await expect(wrapper).toHaveCSS('opacity', '0');
    await seek(page, 10);
    expect(Number(await wrapper.evaluate((el) => getComputedStyle(el).opacity))).toBeCloseTo(0.5, 5);
    await seek(page, 20);
    await expect(wrapper).toHaveCSS('opacity', '1');
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
  // Runs once QUL's exports are mirrored (`bun run qul data` or the QUL assets workflow).
  test('page 10 line 3 renders every word right to left, justified, with the ayah marker', async ({page}) => {
    test.skip(!hasMirror(), NO_MIRROR);
    // Through the built package (plain ESM), which is what the harness consumes too: Node fetches
    // the mirror from the Vite server and builds the layout the same way a browser would.
    const pkg = (await import('../../dist/esm/index.mjs')) as unknown as typeof import('../../src/index');
    const line = await pkg.getMushafLine({theme: 'light', page: 10, line: 3, data: MIRROR});
    expect(line.words.length).toBeGreaterThan(5);
    expect(line.words[0]!.id).toBe('2:62:18'); // ... عِندَ | رَبِّهِمْ وَلَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ (62) وَإِذْ أَخَذْنَا
    expect(line.words.some((w) => w.kind === 'end' && w.ayah === 62)).toBe(true);
    expect(line.words.at(-1)!.id).toBe('2:63:2');

    await open(page, 'static');
    await rowsVisible(page, 3);
    await page.evaluate(
      (data) =>
        (window as unknown as {__harness: {setProps: (p: unknown) => void}}).__harness.setProps({
          lines: [data],
          fontUrl: '/fonts/qpc-v4-tajweed/p10.woff2',
          fit: 'line',
        }),
      line,
    );
    await rowsVisible(page, 1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-page', '10');
    await expect(page.locator(ROOT).first().locator('.mushaf-word')).toHaveCount(line.words.length);
    await expect(page.locator(ROOT).first().locator('.mushaf-word').first()).toHaveAttribute(
      'data-location',
      '2:62:18',
    );
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
  test("the convenience form fetches, unzips and reads QUL's exports in the browser, once per tab", async ({page}) => {
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
    await expect(page.locator(ROOT).first().locator('.mushaf-word').first()).toHaveAttribute(
      'data-location',
      '2:62:18',
    );
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

test.describe('surah names and juz names', () => {
  type Glyph = {glyph: string; font: string; text: string; fontSize: number; lineHeight: number; shiftEm: number};
  /** The glyph spans of the first element: what they set, in which font, at what size and shift. */
  const glyphsOf = (page: Page, root: string) =>
    page
      .locator(root)
      .first()
      .locator('.mushaf-glyph')
      .evaluateAll((els) =>
        els.map((el) => {
          const e = el as HTMLElement;
          const m = /translateY\((-?[\d.]+)em\)/.exec(e.style.transform);
          return {
            glyph: e.dataset.glyph ?? '',
            font: e.dataset.font ?? '',
            text: e.textContent ?? '',
            fontSize: Number.parseFloat(e.style.fontSize),
            lineHeight: Number.parseFloat(e.style.lineHeight),
            shiftEm: m ? Number(m[1]) : 0,
          } satisfies Glyph;
        }),
      );
  /** The width of a glyph's advance, as laid out (a Range around the text; the span itself fills the row). */
  const inkWidth = (page: Page, root: string, nth: number) =>
    page
      .locator(root)
      .first()
      .locator('.mushaf-glyph')
      .nth(nth)
      .evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return {x: r.x, width: r.width, right: r.right};
      });
  /**
   * Where the ink of a glyph lands in its box, in composition pixels, from the browser's own
   * measure of the loaded face (canvas measureText): the baseline the pinned metrics put in a line
   * box of `lineHeight`, the shift the package applies, and the ink's extent around the baseline.
   */
  const inkCentreOffset = (page: Page, root: string, nth: number, ascent: number, descent: number, upem: number) =>
    page
      .locator(root)
      .first()
      .locator('.mushaf-glyph')
      .nth(nth)
      .evaluate(
        (el, {ascent, descent, upem}) => {
          const e = el as HTMLElement;
          const size = Number.parseFloat(e.style.fontSize);
          const lineHeight = Number.parseFloat(e.style.lineHeight);
          const family = getComputedStyle(e).fontFamily;
          const ctx = document.createElement('canvas').getContext('2d')!;
          ctx.font = `${size}px ${family}`;
          const metrics = ctx.measureText(e.textContent ?? '');
          const m = /translateY\((-?[\d.]+)em\)/.exec(e.style.transform);
          const shift = (m ? Number(m[1]) : 0) * size;
          const content = ((ascent - descent) / upem) * size;
          const baseline = (lineHeight - content) / 2 + (ascent / upem) * size + shift;
          const top = baseline - metrics.actualBoundingBoxAscent;
          const bottom = baseline + metrics.actualBoundingBoxDescent;
          return {offset: (top + bottom) / 2 - lineHeight / 2, size, lineHeight, family};
        },
        {ascent, descent, upem},
      );

  test('a surah_name line sets the name in its frame, both spanning the measure, centred', async ({page}) => {
    test.skip(!hasSharedFonts(), NO_SHARED_FONTS);
    await open(page, 'header');
    await rowsVisible(page, 1);
    const root = page.locator(ROOT).first();
    await expect(root).toHaveAttribute('data-line-type', 'surah_name');
    await expect(root).toHaveAttribute('data-surah', '2');
    await expect(root).toHaveAttribute('data-framed', 'true');
    await expect(root).toHaveAttribute('data-font-origin', 'custom');
    await expect(root.locator('.mushaf-word')).toHaveCount(0);
    expect(await fontsLoaded(page, ['mushaf-surah-names-v4', 'mushaf-quran-common'])).toBe(true);
    const glyphs = await glyphsOf(page, ROOT);
    expect(glyphs.map((g) => [g.glyph, g.font, g.text])).toEqual([
      ['frame', 'quran-common', '\uE000'],
      ['surah-name', 'surah-names-v4', '\uFC46'],
    ]);
    // The frame is as wide as the widest line of the mushaf at the page's type size: the measure.
    const rootBox = await box(page, ROOT, 0);
    const frame = await inkWidth(page, ROOT, 0);
    expect(Math.abs(frame.width - rootBox.width)).toBeLessThanOrEqual(rootBox.width * 0.01 + 1);
    expect(Math.abs(frame.x - rootBox.x)).toBeLessThanOrEqual(rootBox.width * 0.005 + 1);
    // The name sits inside it, centred.
    const name = await inkWidth(page, ROOT, 1);
    expect(name.width).toBeGreaterThan(rootBox.width * 0.1);
    expect(name.width).toBeLessThan(rootBox.width * 0.4);
    expect(Math.abs(name.x + name.width / 2 - (rootBox.x + rootBox.width / 2))).toBeLessThanOrEqual(2);
    // Vertically: the ink of each glyph is centred in the line box (the surah-name font's band is the
    // median over the 114 names, so a name may sit a few per cent off; the frame is exact).
    const nameInk = await inkCentreOffset(page, ROOT, 1, 3940, -2520, 2500);
    expect(Math.abs(nameInk.offset)).toBeLessThanOrEqual(nameInk.size * 0.12);
    const frameInk = await inkCentreOffset(page, ROOT, 0, 819, -205, 1024);
    expect(Math.abs(frameInk.offset)).toBeLessThanOrEqual(frameInk.size * 0.03);
    // Without the frame: the name alone, same place.
    await open(page, 'header-plain');
    await rowsVisible(page, 1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-framed', 'false');
    expect((await glyphsOf(page, ROOT)).map((g) => g.glyph)).toEqual(['surah-name']);
    const alone = await inkWidth(page, ROOT, 0);
    expect(Math.abs(alone.x - name.x)).toBeLessThanOrEqual(1);
    expect(await fontsLoaded(page, ['mushaf-quran-common'])).toBe(false);
  });

  test('a basmallah line sets the four glyphs of the surah-name font on the baseline, centred', async ({page}) => {
    test.skip(!hasSharedFonts(), NO_SHARED_FONTS);
    await open(page, 'basmalah');
    await rowsVisible(page, 1);
    const root = page.locator(ROOT).first();
    await expect(root).toHaveAttribute('data-line-type', 'basmallah');
    await expect(root).toHaveAttribute('data-centered', 'true');
    const glyphs = await glyphsOf(page, ROOT);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]).toMatchObject({
      glyph: 'basmalah',
      font: 'surah-names-v4',
      text: '\uFCAA\uFCAB\uFCAE\uFCB4',
      shiftEm: 0,
    });
    const rootBox = await box(page, ROOT, 0);
    const ink = await inkWidth(page, ROOT, 0);
    // 28,014 units of 2,500 per em: about 11.2 em, two thirds of the 17 em measure.
    expect(ink.width / (rootBox.width / 17)).toBeGreaterThan(10.5);
    expect(ink.width / (rootBox.width / 17)).toBeLessThan(11.9);
    expect(Math.abs(ink.x + ink.width / 2 - (rootBox.x + rootBox.width / 2))).toBeLessThanOrEqual(2);
  });

  test('a page stacks its header, basmalah and ayah lines in one grid', async ({page}) => {
    test.skip(!hasSharedFonts(), NO_SHARED_FONTS);
    await open(page, 'page-2');
    await rowsVisible(page, 4);
    const types = await page.locator(ROOT).evaluateAll((els) => els.map((el) => el.getAttribute('data-line-type')));
    expect(types).toEqual(['surah_name', 'basmallah', 'ayah', 'ayah']);
    const boxes = [];
    for (let i = 0; i < 4; i++) boxes.push(await box(page, ROOT, i));
    for (let i = 1; i < 4; i++) {
      expect(boxes[i]!.height).toBeCloseTo(boxes[0]!.height, 0);
      expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height - 0.5);
    }
    await expect(page.locator(ROOT).nth(2).locator('.mushaf-word')).toHaveCount(4);
    expect(await fontsLoaded(page, ['mushaf-surah-names-v4', 'mushaf-quran-common', 'mushaf-qpc-v4-p2'])).toBe(true);
  });

  test('standalone names: a framed surah name and a juz name, centred', async ({page}) => {
    test.skip(!hasSharedFonts(), NO_SHARED_FONTS);
    await open(page, 'surah-name');
    const NAME = '.mushaf-surah-name';
    await expect(page.locator(`${NAME}__row`)).toHaveCSS('visibility', 'visible');
    await expect(page.locator(NAME)).toHaveAttribute('data-surah', '9');
    await expect(page.locator(NAME)).toHaveAttribute('data-framed', 'true');
    expect((await glyphsOf(page, NAME)).map((g) => g.text)).toEqual(['\uE000', '\uFC52']);
    await expect(page.locator(ROOT)).toHaveCount(0);

    await open(page, 'juz');
    const JUZ = '.mushaf-juz-name';
    await expect(page.locator(`${JUZ}__row`)).toHaveCSS('visibility', 'visible');
    await expect(page.locator(JUZ)).toHaveAttribute('data-juz', '1');
    const [ordinal] = await glyphsOf(page, JUZ);
    expect(ordinal).toMatchObject({glyph: 'juz-name', font: 'quran-common', text: '\uE001'});
    const rootBox = await box(page, JUZ, 0);
    const ink = await inkWidth(page, JUZ, 0);
    expect(ink.width).toBeGreaterThan(rootBox.width * 0.1);
    expect(Math.abs(ink.x + ink.width / 2 - (rootBox.x + rootBox.width / 2))).toBeLessThanOrEqual(2);
    const centred = await inkCentreOffset(page, JUZ, 0, 819, -205, 1024);
    expect(Math.abs(centred.offset)).toBeLessThanOrEqual(centred.size * 0.1);
    expect(await fontsLoaded(page, ['mushaf-surah-names-v4'])).toBe(false);
  });

  test('a header enters like a line, and a missing shared font fails loudly', async ({page}) => {
    test.skip(!hasSharedFonts(), NO_SHARED_FONTS);
    await open(page, 'header-enter');
    await rowsVisible(page, 1);
    const wrapper = page.locator(ROOT).first().locator(':scope > *').first();
    await seek(page, 0);
    await expect(wrapper).toHaveCSS('opacity', '0');
    await seek(page, 30);
    await expect(wrapper).toHaveCSS('opacity', '1');
    await open(page, 'header-404');
    const err = page.locator('[data-error="FONT_HTTP"]');
    await expect(err).toBeVisible();
    await expect(err).toContainText('404');
    await expect(err).toContainText('surah_names.woff2');
  });
});

test.describe('slicing', () => {
  const slicedAttr = (page: Page) => page.locator(ROOT).first().getAttribute('data-sliced');
  const rowFontSize = (page: Page) =>
    page
      .locator(ROW)
      .first()
      .evaluate((row) => getComputedStyle(row).fontSize);

  test("shows only the ayah, centred, at the printed advances and the whole line's size", async ({page}) => {
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
    expect(same.map((w) => [Math.round(w.x), Math.round(w.width)])).toEqual(
      whole.map((w) => [Math.round(w.x), Math.round(w.width)]),
    );
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
    await expect(page.locator(ROOT).first().locator('> *').first()).toHaveCSS(
      'clip-path',
      'inset(-100% 0px -100% 50%)',
    );
    expect(await slicedAttr(page)).toBe('19-20');
  });

  test('with fit="line" a slice keeps the size the whole line was fitted to, frame after frame', async ({page}) => {
    test.skip(!hasMirror(), NO_MIRROR);
    const pkg = (await import('../../dist/esm/index.mjs')) as unknown as typeof import('../../src/index');
    const line = await pkg.getMushafLine({theme: 'light', page: 10, line: 3, data: MIRROR});
    // ... رَبِّهِمْ وَلَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ (62) وَإِذْ أَخَذْنَا — 2:62 ends, 2:63 begins.
    const data = line;
    const fontUrl = '/fonts/qpc-v4-tajweed/p10.woff2';
    const setProps = (overrides: unknown) =>
      page.evaluate(
        (p) => (window as unknown as {__harness: {setProps: (p: unknown) => void}}).__harness.setProps(p),
        overrides,
      );
    await open(page, 'static');
    await rowsVisible(page, 3);
    await setProps({lines: [data], fontUrl, fit: 'line'});
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

    await setProps({lines: [data], fontUrl, fit: 'line', slice: {ayah: 63}});
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-sliced', /^\d+-\d+$/);
    await rowsVisible(page, 1);
    expect(await rowFontSize(page)).toBe(fitted);
    await centredBand(63);
    // Another slice on the same mounted line: no re-measure, same size, new band.
    await setProps({lines: [data], fontUrl, fit: 'line', slice: {ayah: 62}});
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-sliced', /^\d+-\d+$/);
    await rowsVisible(page, 1);
    expect(await rowFontSize(page)).toBe(fitted);
    await centredBand(62);
  });
});

test.describe('fonts package fallback', () => {
  // The line resolves from the mirror of QUL's exports; the font comes from "QUL's CDN", which each
  // test controls with page.route(): taken down, answering HTML, or serving the real file. The
  // fonts packages are workspace dependencies of the example, filled by `bun run fonts-packages:fill`.
  const CDN_P10 = 'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/woff2/p10.woff2?v=3.1';
  const fromRoot = (p: string) => path.resolve(test.info().config.rootDir, p);
  const mirrorP10 = () => fromRoot('../../../../example/public/fonts/qpc-v4-tajweed/p10.woff2');
  const packaged = () => existsSync(fromRoot('../../../fonts-qpc-v4-tajweed/fonts/p10.woff2'));
  const NO_PACKAGE = 'the fonts packages are not filled (bun run fonts-packages:fill)';

  const rowShot = (page: Page) => page.locator(ROW).first().screenshot();

  test('paints from the package when the CDN is unreachable, exactly as from the CDN', async ({page}) => {
    test.skip(!hasMirror() || !packaged(), `${NO_MIRROR}, or ${NO_PACKAGE}`);
    const warnings: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning') warnings.push(m.text());
    });
    await page.route('https://static-cdn.tarteel.ai/**', (route) => route.abort('internetdisconnected'));
    await open(page, 'fallback');
    await rowsVisible(page, 1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-font-origin', 'package');
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-tajweed-p10'])).toBe(true);
    expect(warnings.some((w) => w.includes('loaded from @tlawat/mushaf-fonts-qpc-v4-tajweed@'))).toBe(true);
    const fromPackage = await rowShot(page);

    // The same line with the CDN up (serving the very file the package holds).
    const cdn = await page.context().newPage();
    await cdn.route(CDN_P10, (route) =>
      route.fulfill({path: mirrorP10(), contentType: 'font/woff2', headers: {'access-control-allow-origin': '*'}}),
    );
    await open(cdn, 'fallback');
    await rowsVisible(cdn, 1);
    await expect(cdn.locator(ROOT).first()).toHaveAttribute('data-font-origin', 'cdn');
    expect(Buffer.compare(fromPackage, await rowShot(cdn))).toBe(0);
  });

  test('falls back when the CDN answers with an HTML page', async ({page}) => {
    test.skip(!hasMirror() || !packaged(), `${NO_MIRROR}, or ${NO_PACKAGE}`);
    await page.route('https://static-cdn.tarteel.ai/**', (route) =>
      route.fulfill({status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html>blocked</html>'}),
    );
    await open(page, 'fallback');
    await rowsVisible(page, 1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-font-origin', 'package');
  });

  test('uses the package alone as fontSrc: the CDN is never asked', async ({page}) => {
    test.skip(!hasMirror() || !packaged(), `${NO_MIRROR}, or ${NO_PACKAGE}`);
    const cdnRequests: string[] = [];
    await page.route('https://static-cdn.tarteel.ai/**', (route) => {
      cdnRequests.push(route.request().url());
      return route.abort();
    });
    await open(page, 'package-only');
    await rowsVisible(page, 1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-font-origin', 'package');
    expect(cdnRequests).toEqual([]);
  });

  test('fails with FONT_UNAVAILABLE, naming both sources, when the package file is missing too', async ({page}) => {
    test.skip(!hasMirror() || !packaged(), `${NO_MIRROR}, or ${NO_PACKAGE}`);
    await page.route('https://static-cdn.tarteel.ai/**', (route) => route.abort('internetdisconnected'));
    await page.route('**/fonts-qpc-v4-tajweed/fonts/p10.woff2*', (route) => route.fulfill({status: 404, body: ''}));
    await open(page, 'fallback');
    const err = page.locator('[data-error="FONT_UNAVAILABLE"]');
    await expect(err).toBeVisible();
    await expect(err).toContainText("QUL's CDN");
    await expect(err).toContainText('@tlawat/mushaf-fonts-qpc-v4-tajweed@');
  });
});

test.describe('network', () => {
  const CDN = 'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/woff2/p1.woff2?v=3.1';

  test("@network loads page 1 of the colour font from QUL's CDN", async ({page}) => {
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

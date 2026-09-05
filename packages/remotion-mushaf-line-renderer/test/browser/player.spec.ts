// Browser suite against the example's <Player> harness (example/player). Synthetic lines are
// rendered with the page-10 tajweed fixture font (test/fixtures/fonts, example/public/fonts).
import {expect, test, type Page} from '@playwright/test';

type Box = {x: number; y: number; width: number; height: number};

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

    // Justified line: first and last word touch the edges; centred line: equal gaps.
    const justifiedRoot = await box(page, ROOT, 0);
    const justified = await wordBoxes(page, 0);
    const rightmost = Math.max(...justified.map((w) => w.right));
    const leftmost = Math.min(...justified.map((w) => w.x));
    expect(Math.abs(rightmost - (justifiedRoot.x + justifiedRoot.width))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(leftmost - justifiedRoot.x)).toBeLessThanOrEqual(1.5);
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
  // Runs once the layout module has been compiled (scripts/fetch-qul.mjs or the QUL assets workflow).
  test('page 10 line 3 renders every word right to left, justified, with the ayah marker', async ({page}) => {
    // Through the built package (plain ESM), which is what the harness consumes too.
    const pkg = (await import('../../dist/esm/index.mjs')) as typeof import('../../src/index');
    const line = await pkg.getMushafLine({mushaf: 'qpc-v4-tajweed', page: 10, line: 3}).catch((e: {code?: string}) => {
      test.skip(e.code === 'DATA_NOT_COMPILED', 'the layout data is not compiled');
      throw e;
    });
    expect(line.words.length).toBeGreaterThan(5);
    expect(line.words[0]!.id).toBe('2:62:18'); // ... عِندَ | رَبِّهِمْ وَلَا خَوْفٌ عَلَيْهِمْ وَلَا هُمْ يَحْزَنُونَ (62) وَإِذْ أَخَذْنَا
    expect(line.words.some((w) => w.kind === 'end' && w.ayah === 62)).toBe(true);
    expect(line.words.at(-1)!.id).toBe('2:63:2');

    await open(page, 'static');
    await rowsVisible(page, 3);
    await page.evaluate((data) => (window as unknown as {__harness: {setProps: (p: unknown) => void}}).__harness.setProps({lines: [{...data, fontUrl: '/fonts/qpc-v4-tajweed/p10.woff2'}]}), line);
    await rowsVisible(page, 1);
    await expect(page.locator(ROOT).first()).toHaveAttribute('data-page', '10');
    await expect(page.locator(ROOT).first().locator('.mushaf-word')).toHaveCount(line.words.length);
    await expect(page.locator(ROOT).first().locator('.mushaf-word').first()).toHaveAttribute('data-location', '2:62:18');
    expect(await fontsLoaded(page, ['mushaf-qpc-v4-tajweed-p10'])).toBe(true);

    const root = await box(page, ROOT, 0);
    const words = await wordBoxes(page, 0);
    for (let k = 1; k < words.length; k++) expect(words[k]!.x).toBeLessThan(words[k - 1]!.x);
    expect(Math.abs(Math.max(...words.map((w) => w.right)) - (root.x + root.width))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(Math.min(...words.map((w) => w.x)) - root.x)).toBeLessThanOrEqual(1.5);
    for (const w of words) expect(w.width).toBeGreaterThan(5);
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

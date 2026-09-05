# remotion-mushaf-line-renderer

A [Remotion](https://www.remotion.dev) package that renders a single line of the Quran exactly as it is
printed in the KFGQPC V4 (1441H) mushaf, using the per-page glyph fonts published by the
[Quranic Universal Library (QUL)](https://qul.tarteel.ai), with an entrance animation expressed in
`@remotion/transitions` vocabulary.

- Package: [`packages/remotion-mushaf-line-renderer`](packages/remotion-mushaf-line-renderer) (README there once published)
- Example Remotion project and `<Player>` page: [`example`](example)
- Implementation notes on the fonts: [`docs/kfgqpc-v4-rendering-notes.md`](docs/kfgqpc-v4-rendering-notes.md)

## Data pipeline (run once, locally)

The layout data is compiled from QUL's public mushaf-layout preview pages (layout 19, KFGQPC V4). The
compiler is a zero-dependency Node script (Node 18+), so it runs without installing the workspace:

```bash
node scripts/fetch-qul.mjs --from-pages --fonts 1,10,604 --etags
```

What it does:

1. Downloads the 604 preview pages (cached under `.cache/qul/19/`, so re-runs are free) and parses
   every line and word.
2. Validates the result against the invariants the renderer relies on (9,046 lines, 83,668 words,
   contiguous word ids, one ayah marker per ayah, the known page shapes) and refuses to write on any
   mismatch.
3. Writes `packages/remotion-mushaf-line-renderer/src/data/qpc-v4.generated.ts` (ASCII-only, commit it).
4. `--fonts 1,10,604` downloads those page fonts (plain and tajweed sets, woff2 + ttf) into gitignored
   fixture folders, checks that the two sets agree glyph for glyph, and checks that no standalone word
   has zero advance.
5. `--etags` records the ETag of every CDN font in `scripts/cdn-etags.json` (commit it) so later runs
   of `node scripts/verify-cdn.mjs` can detect a republished font.

If QUL rejects the requests (bot protection), retry later or use an official QUL export:
`node scripts/fetch-qul.mjs --layout-sqlite pages.db --words qpc-v4.json` (Node 22.13+ for SQLite input).

Fonts are fetched at render time from `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/…` and are
never committed to this repository.

## Development

```bash
pnpm install
pnpm test            # compiler tests + package unit tests (vitest, jsdom)
pnpm build           # ESM + CJS + bundled declarations for the package
pnpm test:types      # tsc over the package sources and every test, incl. compile-time API assertions
pnpm check:package   # exports map, chunk sizes, both builds load in Node, pnpm pack + attw
pnpm test:browser    # Playwright against the example's <Player> harness (needs `pnpm build` and the p10 fixture font)
pnpm test:render     # @remotion/bundler + @remotion/renderer renders of the example (same prerequisites)
```

The browser and render suites need `example/public/fonts/qpc-v4-tajweed/p10.ttf` (downloaded by
`node scripts/fetch-qul.mjs --fonts 10`); they skip or fail loudly without it. They use the Chromium
that `@playwright/test` installed (`npx playwright install chromium` if missing); set
`MUSHAF_BROWSER_EXECUTABLE` (and `MUSHAF_CHROME_MODE=headless-shell|chrome-for-testing`) to use
another browser for the render suite. `pnpm --filter remotion-mushaf-line-renderer-example dev`
opens the Remotion Studio on the example.

# remotion-mushaf-line-renderer

A [Remotion](https://www.remotion.dev) package that renders a single line of the Quran exactly as it is
printed in the KFGQPC V4 (1441H) mushaf, using the per-page glyph fonts published by the
[Quranic Universal Library (QUL)](https://qul.tarteel.ai), with an entrance animation expressed in
`@remotion/transitions` vocabulary.

- Package: [`packages/remotion-mushaf-line-renderer`](packages/remotion-mushaf-line-renderer) (README there once published)
- Example Remotion project and `<Player>` page: [`example`](example)
- Implementation notes on the fonts: [`docs/kfgqpc-v4-rendering-notes.md`](docs/kfgqpc-v4-rendering-notes.md)
- Handoff notes from an earlier project on the same fonts: [`docs/qul-fonts-lessons-learned.md`](docs/qul-fonts-lessons-learned.md)

## Fonts and data via GitHub Actions

The layout data is compiled from QUL's public mushaf-layout preview pages (layout 19, KFGQPC V4) and
the page fonts come from QUL's CDN. Neither is part of this repository's source; the **QUL assets**
workflow (`.github/workflows/qul-assets.yml`) fetches both on a GitHub runner and commits the results
to the branch it was started on:

1. Actions tab → *QUL assets* → *Run workflow* (or `gh workflow run "QUL assets" --ref <branch>`),
   inputs: `fonts` (pages whose fonts to download, default `1,10,187,604`, or `all`), `compile`
   (default on), `commit` (default on).
2. The run compiles and validates the layout, downloads the fonts with the parity and glyph checks,
   records the CDN ETags, checks the CDN (both font sets, CORS), runs the package's data tests, and
   commits `packages/remotion-mushaf-line-renderer/src/data/qpc-v4.generated.ts`,
   `scripts/cdn-etags.json` and the fixture fonts of pages 1, 10, 187 and 604.
3. Pull the branch; the browser and render suites now run offline, and the render suite writes
   `test/render/p10-l3.png` for a visual check against the printed page.

### Mirror every page locally

To work offline on any page (the Studio, the `Recitation` composition, your own renders), pull the
whole mirror on a machine that can reach QUL. Node 18+ and git are all it needs:

```bash
bash scripts/pull-all-assets.sh
```

It downloads both font sets of every page (woff2 and ttf; where the CDN has no woff2, page 328 of the
tajweed set, the woff it serves instead), refreshes `scripts/cdn-etags.json`, commits what
`.gitignore` admits (every page's woff2, about 95 MB, plus the fixture pages' ttf) and pushes the
current branch. `FONTS=187-207` limits the pages, `PUSH=0` commits without pushing, `COMPILE=1`
recompiles the layout as well. Point the example at the mirror with `fontFile` (`ThreeLines`) or
`fontFilePattern` (`Recitation`), both `'fonts/{mushaf}/p{page}.woff2'`.

Licence rule: the fonts are King Fahd Complex fonts published by QUL and are **not redistributed** by
this project. The fixture fonts of four pages, and the example's mirror if you pulled it, are
committed during development only, so the suites run without network access; the npm package never
contains fonts (`pnpm check:package` fails if the tarball does) and the package code never depends
on committed fonts (CDN by default, an explicit `fontUrl` pin when you host them yourself). Release
checklist: delete the `!**/…/p1.*`-style negation lines and the two `!example/public/fonts/**` lines
from `.gitignore`, run
`git rm -r --cached example/public/fonts packages/remotion-mushaf-line-renderer/test/fixtures/fonts`,
commit; CI keeps working because it downloads the page-10 fixture font itself when it is missing.

`.github/workflows/ci.yml` runs on every push: unit tests, typechecks, build, packaging checks, the
Playwright suite (including the CDN test) and the Remotion render suite.

## Data pipeline (the same script, run locally)

The compiler is a zero-dependency Node script (Node 18+), so it also runs without installing the
workspace, on any machine that can reach `qul.tarteel.ai` and `static-cdn.tarteel.ai`:

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
4. `--fonts 1,10,604` (or `all`) downloads those page fonts (plain and tajweed sets, woff2 + ttf) into
   `example/public/fonts/<mushaf>/` and, for the fixture pages 1, 10, 187 and 604, the package's
   `test/fixtures/fonts/<mushaf>/` (what git sees is governed by `.gitignore`), reports where the two
   sets differ, and checks that no standalone word has zero advance.
5. `--etags` records the ETag of every CDN font in `scripts/cdn-etags.json` (commit it) so later runs
   of `node scripts/verify-cdn.mjs` can detect a republished font.

If QUL rejects the requests (bot protection), retry later or use an official QUL export:
`node scripts/fetch-qul.mjs --layout-sqlite pages.db --words qpc-v4.json` (Node 22.13+ for SQLite input).

At render time the package fetches fonts from `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/…`
unless a line carries an explicit `fontUrl`.

## Real-life example: a recited passage

`example/src/Recitation.tsx` uses the package the way a recitation app would. A JSON listing the ayat
of a passage with their timeframes (and, optionally, per-word times) drives which printed line is on
screen while the audio plays:

- `calculateMetadata()` reads the JSON (`timingsFile` in the public folder, or `timings` inline) and
  asks the package for the lines carrying those ayahs — `getMushafLines({surah, fromAyah, toAyah,
  fontUrl})`, which finds the page itself and pins the mirrored fonts — then schedules one
  `<Sequence>` per line: the line is fully in place when its first word is heard (`leadInSeconds`
  early) and its exit finishes exactly where the next line's entrance starts.
- Every line is one `<MushafLine line enter exit>` with the package's `slideFade()` presentation and
  its default timings (0.5 s decelerating in, 0.32 s accelerating out).
- `cutAtSeconds: 60` stops after the last ayah that ends before the minute (`null` plays everything),
  so the video ends at an ayah end.

```bash
cd example && pnpm exec remotion render Recitation out/recitation.mp4 \
  --props='{"fontFilePattern":"fonts/{mushaf}/p{page}.woff2"}'
```

The timings of the committed example (`example/public/audio/tawbah-timings.json`, At-Tawbah 9:1-11)
were produced by `example/tools/align-recitation.py`: pause detection, Whisper (medium, via
sherpa-onnx) on each segment, and an alignment of the recognised words to the reference text in
`example/tools/tawbah-9-1-13.json`. It is a development tool with the accuracy of that model, not part
of the package. The audio itself is the reciter's and is not committed: put your recording at
`example/public/audio/tawbah.mp3` (or change `audioFile`) before rendering.

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

The browser and render suites need `example/public/fonts/qpc-v4-tajweed/p10.ttf` (committed during
development by the QUL assets workflow, or downloaded by `node scripts/fetch-qul.mjs --fonts 10`);
they skip or fail loudly without it. They use the Chromium
that `@playwright/test` installed (`npx playwright install chromium` if missing); set
`MUSHAF_BROWSER_EXECUTABLE` (and `MUSHAF_CHROME_MODE=headless-shell|chrome-for-testing`) to use
another browser for the render suite. `pnpm --filter remotion-mushaf-line-renderer-example dev`
opens the Remotion Studio on the example.

History is linear: no merge commits. Rebase onto `main` (`git pull --rebase`) and push fast-forward
only; the commits the QUL assets workflow pushes are plain commits on the branch it ran on, so
rebase over them the same way. `git config pull.ff only` and `git config merge.ff only` in a clone
make git refuse anything else.

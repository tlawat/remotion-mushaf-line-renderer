# Contributing

Thanks for helping. This page covers the toolchain, the test suites, the data pipeline and the one
rule that needs care: the fonts.

## Prerequisites

- [Bun](https://bun.sh) 1.2 or newer: package manager and script runner.
- [Node.js](https://nodejs.org) 20 or newer (22 is what CI uses, see `.node-version`): vitest,
  Playwright, tsup and the Remotion renderer run under Node.
- git.

## Setup

```bash
git clone https://github.com/tlawat/remotion-mushaf-line-renderer.git
cd remotion-mushaf-line-renderer
bun install
bun run build
```

## Scripts

Everything runs from the repository root.

| Command                 | What it does                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `bun run dev`           | Opens the Remotion Studio on the example project.                                                       |
| `bun run build`         | Builds the package (ESM + CJS + bundled declarations) into `packages/*/dist`.                           |
| `bun run check`         | Biome: formatting and lint, the way CI runs it.                                                         |
| `bun run format`        | Biome: fix formatting and safe lint issues in place.                                                    |
| `bun run test`          | Unit tests: the data compiler and the package (vitest, jsdom).                                          |
| `bun run test:watch`    | The same, watching.                                                                                     |
| `bun run test:types`    | `tsc` over the package sources and every test, including compile-time API assertions.                   |
| `bun run typecheck`     | `tsc` over the package and the example (the example consumes the built package, so build first).        |
| `bun run check:package` | Exports map, chunk sizes, both builds load in Node, tarball contents, `@arethetypeswrong/cli`.          |
| `bun run test:browser`  | Playwright against the example's `<Player>` harness (needs `bun run build` and the page-10 fixture font). |
| `bun run test:render`   | `@remotion/bundler` + `@remotion/renderer` renders of the example (same prerequisites).                  |
| `bun run qul <command>` | The QUL data pipeline, see below.                                                                       |
| `bun run fonts`         | Shortcut for `bun run qul fonts 1,10,187,604`: the fixture fonts.                                        |

Before you push, run what CI runs: `bun run check && bun run test && bun run build && bun run test:types && bun run typecheck && bun run check:package`.
The browser and render suites take a minute or two each; run them when you touch rendering, fonts,
animation or the example.

## Test suites

- **Unit** (`packages/*/test/unit`, `scripts/test`): fast, no browser. The component tests mock
  `remotion` and the font APIs; the resolvers run against a small synthetic mushaf (three pages) so
  they do not depend on the compiled data. The compiled data itself is validated by `data.test.ts`.
- **Types** (`packages/*/test/types/api.test-d.tsx`): compiles with `@ts-expect-error` markers; a
  prop that should not be accepted is a failing test.
- **Browser** (`packages/*/test/browser`): Playwright drives `example/player`, a Vite page that mounts
  the `LineHarness` composition in a `<Player>` with a scenario from the URL. Checks the DOM
  contract, real glyph widths, palettes, entrances and exits frame by frame, and failure paths.
- **Render** (`packages/*/test/render`): bundles the example with `@remotion/bundler` and renders
  stills and frame ranges with `@remotion/renderer`. Checks determinism across renders, settled
  frames, exits, the mandala palette and a Lambda-style bundle under a non-root `publicPath`. It
  writes `test/render/p10-l3*.png` for a visual check against the printed page.

The browser and render suites use the Chromium that `@playwright/test` installs
(`bunx playwright install chromium` if missing). Set `MUSHAF_BROWSER_EXECUTABLE` (and
`MUSHAF_CHROME_MODE=headless-shell|chrome-for-testing`) to use another browser for the render suite.

## The QUL data pipeline

The package ships the layout of every page as a compiled module
(`packages/remotion-mushaf-line-renderer/src/data/qpc-v4.generated.ts`, about 1 MB of ASCII). It is
generated from QUL's public mushaf-layout preview pages by the `qul` CLI, a zero-dependency Node
script:

```bash
bun run qul compile                     # 604 preview pages (cached under .cache/qul), validate, write the module
bun run qul fonts 1,10,604 --etags      # download page fonts (both sets, woff2 + ttf) and record CDN ETags
bun run qul verify --pages 1,10,604     # fetch fonts cross-origin like a render and check CORS, bytes, ETags
bun run qul mirror                      # development only: every page's fonts, committed and pushed
bun run qul --help
```

`compile` validates the result against the invariants the renderer relies on (9,046 lines, 83,668
words, contiguous word ids, one ayah marker per ayah, the known page shapes) and refuses to write on
any mismatch. If QUL rejects the requests (bot protection), retry later or use an official QUL export:
`bun run qul compile --layout-sqlite pages.db --words qpc-v4.json` (Node 22.13+ for SQLite input).

Some networks cannot reach `qul.tarteel.ai`. The **QUL assets** GitHub workflow
(`.github/workflows/qul-assets.yml`) runs the same commands on a GitHub runner and commits the
results to the branch it was started on: Actions tab, *QUL assets*, *Run workflow*, with the pages
whose fonts to download (`1,10,187,604` by default, or `all`).

## Fonts: the rule

The fonts are King Fahd Complex fonts published by QUL and are **not redistributed** by this project.
The npm package never contains fonts (`bun run check:package` fails if the tarball does) and the
package code never depends on committed fonts: it fetches from QUL's CDN by default and takes an
explicit `fontUrl` when you host them yourself.

During development, four pages' fonts (1, 10, 187, 604) are committed as test fixtures so the
browser and render suites run without network access, and the example's mirror of every page may be
committed as well (`bun run qul mirror`). `.gitignore` spells out the exceptions.

**Release checklist, before the repository goes public:** delete the `!**/…/p1.*`-style negation
lines and the two `!example/public/fonts/**` lines from `.gitignore`, run

```bash
git rm -r --cached example/public/fonts packages/remotion-mushaf-line-renderer/test/fixtures/fonts
```

and commit. CI keeps working because it downloads the page-10 fixture font itself when it is missing.
Note that the fonts remain in the git history; purging them needs a history rewrite, which is a
separate decision.

## Project layout

```
packages/remotion-mushaf-line-renderer/
  src/
    index.ts              public exports
    types.ts              public types (MushafLineData, props, options)
    errors.ts             MushafError and its codes
    mushaf/               the registry (mushaf definition, font sets, looks) and colour validation
    data/                 compiled layout format, lazy loader, the generated data module
    resolve/              getMushafLine, getMushafLines, getMushafLocation, line data validation
    fonts/                font loading, the font store, the @font-palette-values store
    animation/            timings, entrance/exit progress, the slideFade and revealRtl presentations
    component/            <MushafLine>, its hooks (font gate, fit, palette rule, canvas guard), the row and words
  test/                   unit, types, browser and render suites, fixtures
  scripts/check-package.mjs
example/                  Remotion project, <Player> harness, recitation tool
scripts/                  the qul CLI and its library, compiler tests
docs/                     architecture and font notes
```

[docs/architecture.md](docs/architecture.md) walks through how these pieces fit together.

## Code style

Biome formats and lints everything (`biome.json`): single quotes, no bracket spacing, 120 columns.
Run `bun run format` before committing; CI runs `bun run check`. There is no other formatter or
linter to configure in your editor, and `.editorconfig` carries the basics for editors without a
Biome plugin.

A few conventions the code follows:

- Every user-facing failure is a `MushafError` with a documented code and a message that names the
  offending value and the fix.
- Public option types accept `undefined` explicitly for optional fields, so callers can forward
  props under `exactOptionalPropertyTypes` without gymnastics.
- Optional keys of `MushafLineData` are omitted rather than set to `undefined`, so JSON round-trips
  are byte-identical.
- Anything that must be true before the first paint (font loaded, line fitted, palette rule in the
  document) lives in a hook under `src/component/hooks` with the reasoning in its doc comment.

## Git

History is linear: no merge commits. Rebase onto `main` (`git pull --rebase`) and push fast-forward
only; the commits the QUL assets workflow pushes are plain commits on the branch it ran on, so
rebase over them the same way. `git config pull.ff only` and `git config merge.ff only` in a clone
make git refuse anything else.

Write commit messages that say what changed and why; the changelog is written from them.

## Publishing (maintainers)

Publishing is manual for now.

1. Update `version` in `packages/remotion-mushaf-line-renderer/package.json` and move the
   *Unreleased* section of its `CHANGELOG.md` under the new version.
2. `bun run build && bun run check:package` from the root; `prepublishOnly` runs the same.
3. `cd packages/remotion-mushaf-line-renderer && npm publish --access public` (or `bun publish`).
4. Tag the commit (`git tag v0.3.0`) and push the tag.

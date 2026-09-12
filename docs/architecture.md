# Architecture

How a line gets from QUL's exports to a pixel-identical frame, and where each step lives.

## 1. The data (`src/data/`, `scripts/`)

The package ships no mushaf data. QUL publishes two raw exports of its mushaf layout 19 (KFGQPC V4):
the words of the script as JSON and the line layout as a SQLite file, each a zip on Tarteel's CDN,
pinned by URL in the registry's dataset descriptor. At render time `loadLayout()`
(`src/data/load-layout.ts`) fetches both in parallel, unzips them (`zip.ts`, a small reader over
`DecompressionStream`), reads the `pages` table (`sqlite.ts`, a b-tree reader), joins the two
(`qul-export.ts`, applying the `centeredPages` rule for the framed opening pages) and compiles them
(`compile.ts`) into a compact per-page format: one first word id, the glyph text of every word, one
kind character per word, the ayah runs as flat quadruples and the lines as flat triples. Everything
else (positions, locations, line membership) is reconstructed from those. `checkLayout()` then
verifies the invariants the renderer relies on (line and word counts, contiguous ids, one ayah marker
per ayah, the known page shapes) and refuses the data on any mismatch. One layout per dataset and
source pair is cached on `globalThis`; a failed load is forgotten so the next call retries.

`scripts/lib/compile.mjs` is the same compiler for the dev tools, and a unit test holds the two to
identical output. The `qul` CLI mirrors the exports (`qul data`, into `example/public/data/`, for
the suites, the Studio and offline renders), validates a mirror or other export files
(`qul check`), compares QUL's preview pages with the exports (`qul compare`), downloads page fonts
(`qul fonts`), records the CDN's ETags (`qul etags`, into `scripts/cdn-etags.json`, which a unit
test checks against the registry's URLs) and probes the CDN the way a render would (`qul verify`).

## 2. The registry (`src/mushaf/registry.ts`)

`MUSHAFS` describes each supported mushaf: its QUL layout id, page count, lines per page, font
metrics, the invariants of its data, and its two font sets (the plain monochrome fonts and the
COLR/CPAL colour fonts) with their CDN URLs, family names and CPAL palette roles. `DATASETS`
describes what the lines are built from: the pinned export URLs, the page count and the
`centeredPages` rule.

`resolveSelection({mushaf, theme})` is the one place that turns the public selection into a
definition, a font set and a resolved theme: `'plain'` uses the monochrome set and needs no palette;
anything else uses the colour set, and `resolveTheme()` (`src/mushaf/themes.ts`) expands the preset
or custom theme into a CPAL base palette plus `override-colors` by entry, exactly what QUL writes into
its `@font-palette-values` rules (the presets are QUL's own colours). Every resolver, the font loader
and the component go through it.

## 3. Resolving lines (`src/resolve/`)

Every resolver starts with `loadLayout()` (section 1), with the `data` source it was given or the
registry's default. `indexPage()` (`src/data/format.ts`) expands a compiled page into line ranges and
ayah runs and memoises the result; `indexAyahs()` maps every ayah to the page that carries its first
word.

`getMushafLine()` produces one `MushafLineData`: plain JSON with the page, line, theme, font set,
family name and the words in reading order. `getMushafLines()` does the same for a whole page or for
an ayah range (locating the first ayah, then walking pages until every word is past the range); with
`slice: true` it records the range on the lines it cuts. `slice.ts` holds the slicing vocabulary:
`assertSlice()` validates a selector, `resolveSlice()` turns it into the band of word ids a line
keeps (or `'empty'`, or `null` when it keeps everything), `sliceWords()` is the public helper.
`assertLineData()` validates data coming back in through props, field by field, because it may have
been persisted by an older version.

## 4. Fonts (`src/fonts/`)

`loadPageFont()` fetches the font bytes itself (precise HTTP errors, magic-byte check, retries sized
to the render's `--timeout`), registers a `FontFace` with the mushaf's metrics pinned, and adds it to
`document.fonts`. The font store (`font-store.ts`) keeps one entry per font set and page on
`globalThis`, so Studio fast-refresh and duplicate package copies share one registry, and lets React
subscribe to its status with `useSyncExternalStore`. Source rules are order-independent: an explicit
URL replaces an implicit CDN one, two different explicit URLs conflict.

The palette store (`palette-store.ts`) owns the `@font-palette-values` rules a colour-font line
needs: CSS has no inline way to say "palette 3, ink green", so the rule is written into one shared
`<style>` element, named by a hash of its colours, before the line is painted. A theme with `marker`
colours gets a second rule that only the ayah-number glyph names (QUL's `.char-end` trick).

## 5. The component (`src/component/`)

`<MushafLine>` validates its props and picks a path: `line={data}` renders `LineRenderer` directly;
`page` + `line` goes through `ResolveLine`, which resolves the data behind a `delayRender()` handle
first. `LineRenderer` composes four hooks, each owning one thing that must be true before the first
paint:

| Hook              | Owns                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `useFontGate`     | The font status, the `delayRender()` handle from first render to the visible row's commit, the font load.    |
| `useLineFit`      | Measuring the row once the font is in and scaling the base size so the line fills its box (`fit="line"`).    |
| `usePaletteRule`  | Resolving `currentColor` from the row's computed colour and registering the palette rule(s), in a layout effect. |
| `useCanvasGuard`  | Refusing presentations that paint the line into a canvas, before a blank frame could be captured.            |

The row is `visibility: hidden` until all three are ready, then the words are laid out as a flex row
in `direction: rtl` with every metric-affecting CSS property pinned (`styles.ts`), each word one
`<span>` (`Word.tsx`) that reads the per-word hooks from `LineContext`. A slice is applied only on
the commits where the fit is already known, which are exactly the commits the fit effect does not
measure on: the measured width is always the whole line's, a slice never changes the type size, and
the hidden words (`display: none`) let the row centre the ones that remain.

## 6. Animation (`src/animation/`)

`enter` and `exit` are rendered exactly as `<TransitionSeries>` renders the entering and exiting side
of a scene (`Presented.tsx`): the exiting presentation wraps the entering one, and each receives its
progress from `animation-state.ts`, entrance progress over the local frame of the Sequence and exit
progress over its last frames. `timings.ts` provides the eased defaults and the spring variant;
`presentations/` the package's own `slideFade` and `revealRtl`, plain functions of progress so they
are unit-tested frame by frame.

## 7. Packaging

`tsup` emits ESM (`dist/esm/index.mjs`) and CJS (`dist/cjs/index.js`) with bundled declarations.
`scripts/check-package.mjs` verifies the exports map, that the entries stay small and embed no data,
that both builds load in Node, fail fast on an unreachable data source and resolve a line through the
runtime loader from the example's mirror, that the tarball ships no fonts, data or tests, and runs
`@arethetypeswrong/cli` on it.

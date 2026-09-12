# Architecture

How a line gets from QUL's website to a pixel-identical frame, and where each step lives.

## 1. Data pipeline (`scripts/`)

`bun run qul compile` downloads QUL's 604 public mushaf-layout preview pages (layout 19, KFGQPC V4),
parses every line and word (`scripts/lib/qul-html.mjs`) and compiles them into a compact per-page
format (`scripts/lib/compile.mjs`): one first word id, the glyph text of every word, one kind
character per word, the ayah runs as flat quadruples and the lines as flat triples. Everything else
(positions, locations, line membership) is reconstructed at runtime from those.

`validateLayout()` checks the invariants the renderer relies on (line and word counts, contiguous
ids, one ayah marker per ayah, centred lines only at surah ends, the known page shapes) and the
compiler refuses to write on any mismatch. The output is
`packages/remotion-mushaf-line-renderer/src/data/qpc-v4.generated.ts`, an ASCII-only module holding
the layout as a JSON string (so no editor, formatter or Unicode normalisation can alter the glyph
code points).

The same CLI downloads page fonts (`qul fonts`), records the CDN's ETags (`qul etags`, into
`scripts/cdn-etags.json`, which a unit test checks against the registry's URLs) and probes the CDN
the way a render would (`qul verify`).

## 2. The registry (`src/mushaf/registry.ts`)

`MUSHAFS` describes each supported mushaf: its QUL layout id, page count, lines per page, font
metrics, the invariants of its data, and its two font sets (the plain monochrome fonts and the
COLR/CPAL colour fonts) with their CDN URLs, family names and CPAL palette roles.

`resolveSelection({mushaf, look, colors})` is the one place that turns the public selection into a
definition, a look and a font set: `plain` uses the monochrome set, `tajweed` and `mandala` the colour
set, and `mandala` adds `{ink: 'currentColor', ...colors}`. Every resolver, the font loader and the
component go through it.

## 3. Resolving lines (`src/resolve/`)

`loadLayout()` (`src/data/load-layout.ts`) imports the generated module lazily, once per tab, through
one literal `import()`; the build (`tsup.config.ts`) turns that into a separate 1 MB chunk in both the
ESM and the CJS output so the main entry stays small. `indexPage()` (`src/data/format.ts`) expands a
compiled page into line ranges and ayah runs and memoises the result; `indexAyahs()` maps every ayah
to the page that carries its first word.

`getMushafLine()` produces one `MushafLineData`: plain JSON with the page, line, look, font set,
family name and the words in reading order. `getMushafLines()` does the same for a whole page or for
an ayah range (walking pages from `getMushafLocation()` until every word is past the range).
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
`<style>` element, named by a hash of its colours, before the line is painted.

## 5. The component (`src/component/`)

`<MushafLine>` validates its props and picks a path: `line={data}` renders `LineRenderer` directly;
`page` + `line` goes through `ResolveLine`, which resolves the data behind a `delayRender()` handle
first. `LineRenderer` composes four hooks, each owning one thing that must be true before the first
paint:

| Hook              | Owns                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `useFontGate`     | The font status, the `delayRender()` handle from first render to the visible row's commit, the font load.    |
| `useLineFit`      | Measuring the row once the font is in and scaling the base size so the line fills its box (`fit="line"`).    |
| `usePaletteRule`  | Resolving `currentColor` from the row's computed colour and registering the palette rule, in a layout effect. |
| `useCanvasGuard`  | Refusing presentations that paint the line into a canvas, before a blank frame could be captured.            |

The row is `visibility: hidden` until all three are ready, then the words are laid out as a flex row
in `direction: rtl` with every metric-affecting CSS property pinned (`styles.ts`), each word one
`<span>` (`Word.tsx`) that reads the per-word hooks from `LineContext`.

## 6. Animation (`src/animation/`)

`enter` and `exit` are rendered exactly as `<TransitionSeries>` renders the entering and exiting side
of a scene (`Presented.tsx`): the exiting presentation wraps the entering one, and each receives its
progress from `animation-state.ts`, entrance progress over the local frame of the Sequence and exit
progress over its last frames. `timings.ts` provides the eased defaults and the spring variant;
`presentations/` the package's own `slideFade` and `revealRtl`, plain functions of progress so they
are unit-tested frame by frame.

## 7. Packaging

`tsup` emits ESM (`dist/esm/index.mjs`) and CJS (`dist/cjs/index.js`) with bundled declarations, and
the data chunk beside each. `scripts/check-package.mjs` verifies the exports map, the chunk sizes,
that both builds load in Node and resolve the data chunk, that the tarball ships no fonts or tests,
and runs `@arethetypeswrong/cli` on it.

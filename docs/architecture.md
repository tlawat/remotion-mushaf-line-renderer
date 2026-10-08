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
metrics, the invariants of its data, its two font sets (the plain monochrome fonts and the
COLR/CPAL colour fonts) with their CDN URLs, family names and CPAL palette roles, its two shared
fonts (QUL's surah-name font, resource 237, and `quran-common`, resource 459: one file each, with
their CDN URLs, families and metrics) and its glyph tables: the code point of every surah name (read
from the surah-name font's cmap), the basmalah's four glyphs, the juz names (the `liga` ligatures of
`quran-common`, addressed by their private-use code points), the header frame and, for each, where
its ink sits relative to the baseline. `DATASETS` describes what the lines are built from: the pinned
export URLs, the page count and the `centeredPages` rule.

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
family name (the page font's for an ayah line, the surah-name font's for a header or basmalah line)
and the words in reading order. `getMushafLines()` does the same for a whole page or for
an ayah range (locating the first ayah, then walking pages until every word is past the range); with
`slice: true` it records the range on the lines it cuts. `slice.ts` holds the slicing vocabulary:
`assertSlice()` validates a selector, `resolveSlice()` turns it into the band of word ids a line
keeps (or `'empty'`, or `null` when it keeps everything; a word band, `{fromWordId, toWordId}`,
resolves to itself clipped to the line), `sliceWords()` is the public helper.
`assertLineData()` validates data coming back in through props, field by field, because it may have
been persisted by an older version.

## 4. Recitation timings (`src/recitation/`)

Following a recording is the resolvers' job seen from the audio's side. `RecitationTimings` is the
package's one input for it: a versioned JSON of ayah spans with optional per-word times, keyed by
`MushafWord.id`, so a producer never touches text and the package never depends on a speech model.
It is a union of two versions: version 1 holds one surah (`surah` at the top), version 2 any run of
surahs (each ayah names its surah, in recitation order). `parseRecitationTimings()` validates a file
field by field, as `assertLineData()` does for line data, version 1 exactly as it always has.
`normalizeTimings()` reads either version as version 2 (memoised per object), and everything that
looks an ayah up goes through one index keyed by `ayahKey(surah, ayah)`, so `scheduleLines()`,
`wordTiming()` and `wordAt()` never confuse ayah 2 of one surah with ayah 2 of the next.

`recitedRange()` gives `getMushafLines()` its range for one surah; `recitedRanges()` gives one range
per surah, and `getMushafLinesForRanges()` (in `src/resolve/get-mushaf-lines.ts`, on the same range
walk as `getMushafLines()`) joins them: between two surahs it inserts the later one's header lines,
found by walking back from the line of its first ayah over the `surah_name` and `basmallah` lines
that carry its number, and it keeps each line once, by page and line, merging the slices of the
ranges that reach it. A line one range cuts alone on a line of its own surah gets the ayah form, as
`slice: true` records it; anything else (two ranges, or another surah's words on the line) gets the
word band from the first kept word to the last, since an ayah slice selects by ayah number only.
`scheduleLines()` turns the lines and the timings into `{index, start, end}` slots (a line starts at
its first timed word, by `occurrence` for repeated words, interpolated by position when the file has
no time for it, and the words a line's `slice` hides are skipped through `resolveSlice()`); header
lines carry no word, so they get no slot. `wordAt()` answers `activeWordId`. The aligners that write
the file are examples in `example/tools/`, not part of the package.

## 5. Fonts (`src/fonts/`)

A load is described by a `FontTarget` (`font-file.ts`): a page font (a set and a page) or a shared
font, with the file a resolver receives, the family and store key under the default source, the
metrics to pin and, for a page font, the set a fonts package must hold. `planFontSource()`
(`font-source.ts`) turns a target's `fontSrc` and `fontFallback` into the steps of one load: QUL's
CDN (or the fonts package, or the resolver's URLs, or the package a resolver returns for a page
file), then the fallback package whose font set matches the line. It validates both (`BAD_FONT_SRC`,
`BAD_FONT_FALLBACK`) during render, so a mistake shows up before an outage does, and names the load:
a store key and a family, one per source (`mushaf-<set>-p<page>` and `mushaf-<shared font>` for the
CDN, a hash suffix for anything else). The fonts packages hold page fonts only: a package as the
source of a shared font is refused, and no fallback step is planned for one.

`loadPageFont()` and `loadSharedFont()` are `loadFont()` on the two kinds of target; it runs the
steps in order. Each step fetches the bytes itself (precise HTTP errors,
magic-byte check, retries), checks a package file against its declared size and SHA-256, and
registers a `FontFace` with the mushaf's metrics pinned; the first step that succeeds wins, and a
failed step falls through to the next. While rendering the whole load has a deadline inside the
`delayRender` timeout, and the primary source's budget leaves 6 s for a fallback package
(`getFontStepBudget()` in `fetch-budget.ts`). The font store (`font-store.ts`) keeps one entry per
source key on `globalThis`, so Studio fast-refresh and duplicate package copies share one registry,
and lets React subscribe to its status with `useSyncExternalStore`. Because each source has its own
entry and family, no load can replace another: a line's font depends only on its own props.

The fonts packages (`packages/fonts-<set>/`) are data, not code the package imports: their default
export lists every page as `new URL('./fonts/p<page>.woff2', import.meta.url)`, which bundlers turn
into emitted assets, plus each file's size and SHA-256. `scripts/fonts-package.mjs` generates that
entry from the committed manifest, fills `fonts/` from the example's mirror, and checks the tarball.

The palette store (`palette-store.ts`) owns the `@font-palette-values` rules a colour-font line
needs: CSS has no inline way to say "palette 3, ink green", so the rule is written into one shared
`<style>` element, named by a hash of its colours, before the line is painted. A theme with `marker`
colours gets a second rule that only the ayah-number glyph names (QUL's `.char-end` trick).

## 6. The component (`src/component/`)

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

A `surah_name` or `basmallah` line takes another path (`HeaderLine`, on the `GlyphRenderer` that
`<MushafSurahName>` and `<MushafJuzName>` share): `useSharedFontGate` holds one `delayRender()`
handle until every shared font the glyphs need is in `document.fonts`, and each glyph fills the row
as an absolutely positioned span, centred by `text-align` and one line box the height of the row,
then shifted by its ink band so the ink, not the em box, is centred; the basmalah is left on the
page baseline, as a line of text. The frame's type size follows the line's: it spans the widest line
of the mushaf (`referenceLineWidth`) at that size, so it fills the measure like a justified line.

The row is `visibility: hidden` until all three are ready, then the words are laid out as a flex row
in `direction: rtl` with every metric-affecting CSS property pinned (`styles.ts`), each word one
`<span>` (`Word.tsx`) that reads the per-word hooks from `LineContext`. A slice is applied only on
the commits where the fit is already known, which are exactly the commits the fit effect does not
measure on: the measured width is always the whole line's, a slice never changes the type size, and
the hidden words (`display: none`) let the row centre the ones that remain.

## 7. Animation (`src/animation/`)

`enter` and `exit` are rendered exactly as `<TransitionSeries>` renders the entering and exiting side
of a scene (`Presented.tsx`): the exiting presentation wraps the entering one, and each receives its
progress from `animation-state.ts`, entrance progress over the local frame of the Sequence and exit
progress over its last frames. `timings.ts` provides the eased defaults and the spring variant;
`presentations/` the package's own `slideFade` and `revealRtl`, plain functions of progress so they
are unit-tested frame by frame.

## 8. Packaging

`tsup` emits ESM (`dist/esm/index.mjs`) and CJS (`dist/cjs/index.js`) with bundled declarations.
`scripts/check-package.mjs` verifies the exports map, that the entries stay small and embed no data,
that both builds load in Node, fail fast on an unreachable data source and resolve a line through the
runtime loader from the example's mirror, that the tarball ships no fonts, data or tests, that the
fonts packages stay optional peers the code never imports, and runs `@arethetypeswrong/cli` on it.
`scripts/fonts-package.mjs check` does the same for the fonts packages: the entry matches the
manifest, and `npm pack` would publish exactly the manifest's 604 files plus the metadata.

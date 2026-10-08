# Changelog

## Unreleased

- **Recitations that cross surahs.** `RecitationTimings` is now `RecitationTimingsV1 | RecitationTimingsV2`:
  version 2, `{version: 2, ayat: [{surah, ayah, start, end, complete?, words?}]}` in recitation order,
  holds a juz-length recording, each word checked against its own entry's surah; version 1 files parse
  and behave exactly as before. New `normalizeTimings()` (either version as version 2),
  `recitedRanges()` (one range per surah; `recitedRange()` throws `BAD_RECITATION_TIMINGS` for
  timings that cross surahs) and `getMushafLinesForRanges(ranges, {slice?})`, which joins the ranges
  with each later surah's printed header lines, slices the ends of every range and keeps a line two
  ranges share once (a word band when it carries both). `scheduleLines()`, `wordTiming()` and
  `wordAt()` look ayahs up by surah and number, so they take either version. Code that reads
  `timings.surah` narrows on `version` first (or types its timings `RecitationTimingsV1`).
- **Slices by word.** `slice` (the prop and `line.slice`) takes a third form, `{fromWordId, toWordId?}`:
  a band of `MushafWord.wordId`, inclusive, open-ended without `toWordId`, clipped to each line like
  the ayah forms (a band that keeps every word changes nothing, one that keeps none paints nothing).
  It can cut inside an ayah, so a line splits into two slots by appearing twice in `lines` with two
  bands; `sliceWords()`, `assertLineData()`, `<MushafLineWindow>` and `scheduleLines()` take it as
  they take the others. The forms do not mix; `BAD_SLICE` names the field and the value.
- **Several lines at once.** New `<MushafLineWindow lines steps>`: a window of `visibleLines` slots
  (default 3) onto a stack of lines, the current line in the middle, that scrolls up by exactly one
  line-height in one shared movement when the current line changes. `steps` is the local frame at
  which each line becomes current (one per line; from `scheduleLines()` and the fps); the new
  `scrollPosition({frame, fps, steps, timing?, anchor?})` turns them into a fractional line index
  (the sum of each step's eased progress, so overlapping steps blend and rest positions are exact
  integers), `scrollTiming` (default `enterTiming()`) and `anchor: 'end' | 'start'` shape one scroll,
  and `position` drives the window directly instead. Lines fade over the window edge, the lines that
  are not current are dimmed to `neighbourOpacity` (default 0.45) through the default of the new
  per-line paint hooks `lineStyle(line, ctx)` / `lineClassName(line, ctx)` (a `LineWindowContext`
  with `index`, `position`, `distance`, `current`), and `windowLineOpacity()` exposes that number.
  Only the lines that can be in the window (plus `preloadLines`) are mounted. The word hooks, sizing
  and font props are forwarded to every line; `enter` / `exit` animate the whole window. New errors
  `BAD_STEPS`, `BAD_WINDOW_PROP`. The example's `Recitation` shows the passage through it
  (`visibleLines`, `neighbourOpacity`; `null` keeps one line at a time).
- **The rings around the small connective letters are gone from the presets.** The colour font draws
  a thin box around each small connective letter and an ellipse around its vowel (CPAL entry 14:
  3,065 layers over the 604 page fonts, every one a stroked ring and never a letter), which the
  printed page does not show. Entry 14 is now its own part, `outline`, and `light`, `dark`, `sepia`,
  `black` and `normal` paint it `'transparent'`; `ink` is entry 0 alone. `{colors: {outline: 'currentColor'}}`
  brings the rings back, and `p1`–`p5` still show the font untouched.
- **Recitation timings.** A neutral, versioned JSON input for following a recording
  (`RecitationTimings`: `{version: 1, surah, ayat: [{ayah, start, end, complete?, words?: [{id, start, end}]}]}`,
  seconds, word ids as `MushafWord.id`) and pure helpers over it: `parseRecitationTimings()`
  (validation, `BAD_RECITATION_TIMINGS`), `recitedRange()` (the range for `getMushafLines()`),
  `scheduleLines()` (one `{index, start, end}` per line, with `occurrence: 'first' | 'last'` for words
  the reciter repeats), `wordAt()` (the current word, for `activeWordId`) and `wordTiming()`. The
  package ships no aligner: the example's tools produce the file from the QUD Universal Aligner API
  or from Whisper.
- **Surah names, the basmalah and juz names**, from the two fonts QUL publishes next to the page
  fonts: the V4 surah-name font ([QUL resource 237](https://qul.tarteel.ai/resources/font/237))
  and `quran-common` ([resource 459](https://qul.tarteel.ai/resources/font/459)).
  - `surah_name` and `basmallah` lines now render through `<MushafLine>` instead of throwing
    `UNSUPPORTED_LINE_TYPE`: the surah's name inside its printed ornamental frame (spanning the
    widest line of the mushaf at the line's type size), and the basmalah on the page baseline. The
    new `framed` prop (default `true`) sets the name alone. Both take the CSS `color`.
  - New components `<MushafSurahName surah framed?>` and `<MushafJuzName juz>`: the same glyphs
    standalone, in a block of the line grid, with the line's sizing, animation and font props.
  - The fonts load like page fonts, behind `delayRender()`, from QUL's CDN by default; `fontSrc`
    resolvers receive them as `MushafFontFile` with `kind: 'shared'` (`font`, `fileName`, `cdnUrl`),
    and `getMushafFontFile({font})`, `loadSharedFont({font})` describe and warm them. The fonts
    packages hold page fonts only: a package as `fontSrc` is refused with `BAD_FONT_SRC` where a
    shared font is needed, and `fontFallback` does not apply to them. A resolver may now return a
    fonts package for a page file, so one resolver serves pages from a package and the shared fonts
    from your own URLs.
  - New errors `UNKNOWN_FONT`, `SURAH_OUT_OF_RANGE`, `JUZ_OUT_OF_RANGE`; new types
    `MushafSharedFont`, `MushafPageFontFile`, `MushafSharedFontFile`, `MushafSurahNameProps`,
    `MushafJuzNameProps`, `LoadSharedFontOptions`, `LoadedMushafFont`.
  - `MushafLineData.fontFamily` of a `surah_name` or `basmallah` line is now the surah-name font's
    family (`mushaf-surah-names-v4`); persisted header lines from 0.4 (which could not render) are
    refused with `BAD_LINE_DATA` and must be resolved again. `surahNumber` is required on
    `surah_name` lines.
- The example project gains a `SurahOpening` composition, and `bun run qul fonts` downloads and
  checks the two shared fonts into `example/public/fonts/<id>/`.

## 0.4.1 (2026-09-28)

- No code changes. First version published by the Release workflow, with provenance.

## 0.4.0 (2026-09-28)

- **Fonts packages as the fallback when QUL's CDN fails.** The page fonts still load from QUL's CDN
  by default. Two new npm packages, `@tlawat/mushaf-fonts-qpc-v4` (the `'plain'` theme, 43 MB) and
  `@tlawat/mushaf-fonts-qpc-v4-tajweed` (every other theme, 51 MB), ship all 604 page fonts of a set,
  unmodified, as a snapshot of QUL's CDN (versioned `1.<YYYYMMDD>.<patch>`). Pass one to
  `<MushafLine fontFallback>` (or `loadPageFont({fallback})`): the CDN is tried first, and the package
  is used only when it fails (an outage, a firewall, a VPC, a timeout); while rendering the CDN's
  budget leaves 6 s of the `delayRender` timeout for it. Pass it as `fontSrc` to never contact the
  CDN. The packages list each page as `new URL(file, import.meta.url)`, so the bundler emits the
  files as assets: no copy step, nothing downloaded unless a line needs it. They are optional peers.
- **`fontSrc`** on `<MushafLine>` and `loadPageFont()`: `'cdn'` (default), a fonts package, or a
  resolver `(file) => url | url[]` receiving a `MushafFontFile` (`getMushafFontFile()` returns the
  same). Each source loads its own font face under its own family, so lines with different sources
  never affect each other and the result does not depend on which line loaded first.
- **The line root carries `data-font-origin`** (`cdn`, `package`, `custom`) once its font has loaded;
  `loadPageFont()` returns `origin()` too.
- **New errors:** `BAD_FONT_SRC`, `BAD_FONT_FALLBACK` (a fallback without the line's font set is
  reported the first time the line renders), `FONT_FALLBACK_INVALID` (package bytes that differ from
  the declared size or SHA-256) and `FONT_UNAVAILABLE` (the source and the fallback both failed; the
  message lists every attempt).
- **Removed** (the package is still unpublished): `MushafLineData.fontUrl`, `getMushafLines({fontUrl})`,
  `loadPageFont({url})`, the `MushafFontUrl` type and the errors `BAD_FONT_URL`, `FONT_URL_CONFLICT`
  and `FONT_SUPERSEDED`. Each old option is refused with a message naming its replacement:

  ```tsx
  // 0.3
  getMushafLines({page: 10, theme, fontUrl: (page, fontSet) => staticFile(`fonts/${fontSet}/p${page}.woff2`)});
  // 0.4
  <MushafLine line={line} fontSrc={(f) => staticFile(`fonts/${f.fontSet}/${f.fileName}`)} />
  // or drop the mirror and keep a fallback:
  <MushafLine line={line} fontFallback={tajweedFonts} />
  ```

## 0.3.0

The API was redesigned for the open-source release. The package is not published yet, so nothing
depends on the old shapes; data resolved by 0.2 (`version: 1`) must be resolved again.

- **Themes, the way QUL colours its pages.** `mushaf` / `tajweed` / `mandala` are replaced by one
  `theme` option: `'plain'` (the monochrome font, follows CSS `color`), a preset, or a custom
  `{base, colors?, marker?}`. The presets are the ten options of QUL's own preview page, colour for
  colour: `light`, `dark`, `sepia`, `black`, `normal`, and the raw palettes `p1`–`p5` (`p6` is not
  offered: the font has no palette 6). A custom theme starts from a palette or a preset and recolours
  by part (`ink`, `silent`, `rules`, `frame`, `accent`, `detail`, `background`) or by CPAL entry;
  `marker` colours the ayah-number glyph alone, which is how `black` keeps its number readable. The
  same option works on `getMushafLine()`, `getMushafLines()`, `loadPageFont()` and the convenience
  form of `<MushafLine>`. `MUSHAF_THEMES` and `MUSHAF_THEME_NAMES` are exported. Errors: `BAD_THEME`
  (unknown preset, base or entry) and `BAD_COLOR`.
- **Line data version 3.** `mushaf` is the layout id only (`'qpc-v4'`); the appearance is `theme` (a
  preset name, or a custom theme resolved to entries) + `fontSet` (`'qpc-v4' | 'qpc-v4-tajweed'`,
  what `fontUrl(page, fontSet)` receives). The root element carries `data-theme`; the ayah marker
  carries its own `font-palette` when the theme colours it apart.
- **The package ships no mushaf data.** The layout is built at render time from QUL's two raw
  exports, the words of the QPC V4 script (JSON) and the 15-line layout (SQLite), each a zip on
  Tarteel's CDN, fetched, unzipped, read and compiled in memory by the package itself, the way the
  fonts are already fetched. What a line is does not change: same words, ids and lines as the
  compiled module the package used to carry. What changes: resolving a line needs the network (or a
  mirror) the first time per tab; the `data` option on `getMushafLine()`, `getMushafLines()`,
  `getMushafLocation()` and the `<MushafLine page line>` form names other sources (`{words?,
  layout?}`: absolute URLs, `staticFile()` paths or root-relative paths), which is how a mirror in
  `public/` makes renders independent of the CDN; `loadMushafData({mushaf?, data?})` warms the
  cache for a `<Player>`; the error codes `BAD_DATA_URL`, `DATA_HTTP`, `DATA_NETWORK`,
  `DATA_TIMEOUT` and `DATA_INVALID` say what went wrong, and `DATA_NOT_COMPILED` is gone. Node
  callers (scripts, tests) need Node 20.12 or newer to inflate the zips, or a `data` source
  pointing at the unzipped files. The tarball is about 1 MB lighter.
- **Line slicing.** `slice={{ayah}}` / `slice={{fromAyah, toAyah?}}` on `<MushafLine>` shows only
  those ayahs of a line, collapsed and centred in the measure, so each slice reads as a line of its
  own. The fit is measured from the whole line before the slice is applied, so a slice never changes
  the type size (two slices of one line render at one size) and can change on every frame for free;
  the kept words sit at their printed advances, and every word span stays in the DOM (hidden ones
  carry `data-hidden` / `.mushaf-word--hidden`). A slice that keeps every word changes nothing; one
  that keeps none paints nothing. `getMushafLines({surah, fromAyah, toAyah, slice: true})` records
  the range as `line.slice` on the lines it cuts, so a passage carries its own slicing through
  `inputProps` (the prop wins, `slice={null}` cancels); `sliceWords(line, slice?)` lists the kept
  words; `wordStyle`'s context gains `inSlice`. New error code `BAD_SLICE`.
- **Presentations from the root entry.** `slideFade`, `revealRtl` and their pure `*Style`
  functions are exported from `@tlawat/remotion-mushaf-line`; the `./presentations/*` subpaths
  are removed. `isMushafError()` is exported.
- **Option types accept `undefined`** for every optional field, so props can be forwarded under
  `exactOptionalPropertyTypes`.
- What used to be `tajweed: true` is `theme: 'light'`; what used to be `mandala` is `theme: 'normal'`
  (`{base: 'normal', colors: {...}}` with colours).
- **Repository:** Bun replaces pnpm, Biome formats and lints, the three pipeline scripts are one
  `qul` CLI (`data`, `check`, `compare`, `fonts`, `etags`, `verify`, `mirror`), the package sources
  are grouped by concern and the renderer is split into four hooks. Public README, CONTRIBUTING and architecture
  notes.

Also new since 0.2.0 (developed before the redesign, never released on their own; described here
in the 0.3.0 vocabulary):

- **The normal theme, in CSS colours.** `theme: 'normal'` keeps the ayah-end rosette in its colours
  and writes the line in the inherited CSS `color`, the way most printed mushafs read outside a
  tajweed edition. It is the colour font at CPAL palette 3, so nothing extra is downloaded.
  `'currentColor'` (what it paints the writing with) is resolved from the line's computed colour and
  written into a `@font-palette-values` rule before the line is painted. New error code `BAD_COLOR`.
- **Fixed: the word gaps were too wide.** A line was set at a size derived from a 42,501-unit
  reference while real lines are around 40,000 units, and `justify-content: space-between` then
  spread the leftover into the gaps between words. Words now sit at the font's own advances, and the
  new `fit` prop (default `'line'`) scales the line so it fills its box exactly. Measured against a
  photo of the printed page, ink coverage goes from 88.5 % to 93.6 % where the print is 94.1 %.
  `fit="mushaf"` keeps one type size for every line, with short lines stopping short of the margin.

## 0.2.0

- **Plain black by default.** `mushaf` now defaults to `'qpc-v4'`, the monochrome glyph set that
  follows CSS `color`, and colour is a flag: `tajweed: true` on `<MushafLine>` (convenience form),
  `getMushafLine()`, `getMushafLines()` and `loadPageFont()` selects QUL's COLR/CPAL font. The
  `'qpc-v4-tajweed'` id keeps working, and data produced by 0.1 renders unchanged.
- **Several lines at once.** `getMushafLines({page})` returns a whole page; `getMushafLines({surah,
  fromAyah, toAyah})` returns the lines that carry an ayah range and finds the page itself, so no
  caller has to know where a surah starts. `getMushafLocation({surah, ayah})` answers that question
  directly, `lineAyahs(line)` says which ayahs a line holds, and `fontUrl` pins a mirror on every
  line returned.
- **Per-word hooks.** `activeWordId` + `activeWordStyle` mark the current word (`data-active`,
  `.mushaf-word--active`); `wordStyle(word, ctx)` and `wordClassName(word, ctx)` style words
  individually — for a karaoke-style follow, or to dim the ayahs outside a range.
- **Sizing helpers.** `fontSizeForWidth(width, mushaf?)` and `lineHeightForFontSize(fontSize)` are
  exported (the numbers `<MushafLine>` computes by default), for lines that sit inside margins.
- **Smoother animation.** `enterTiming()` (0.5 s, decelerating) and `exitTiming()` (0.32 s,
  accelerating) are the new defaults, `springyTiming()` is there for a physical settle, and `timing`
  is optional: `enter={slideFade()}` is enough. New `slideFade()` presentation (subpath
  `@tlawat/remotion-mushaf-line/presentations/slide-fade`) fades before it settles and travels a
  quarter of a line box; `revealRtl({softness})` can fade its edge instead of cutting it. Explicit
  `{presentation, timing}` pairs behave exactly as before.
- New error codes `BAD_TAJWEED` and `AYAH_NOT_FOUND`.

## 0.1.0

First release.

- `<MushafLine>` renders one `ayah` line of the KFGQPC V4 (1441H) mushaf with QUL's per-page glyph
  fonts, one DOM element per word, justified or centred exactly as printed.
- `enter` and `exit` take any DOM presentation from `@remotion/transitions` (`fade`, `slide`,
  `wipe`, `flip`, `clockWipe`, `iris`, `pushCut`, `none`) plus the bundled `revealRtl`; timing comes
  from the enclosing `<Sequence>`: the entrance runs from its start, the exit over its last frames, so
  overlapping Sequences replace lines in place.
- `getMushafLine()` resolves plain JSON line data for `calculateMetadata()`. The bundled layout is
  compiled from QUL's mushaf layout 19: 604 pages, 9,046 lines, 83,668 words, 6,236 ayahs, 30
  centred lines, validated structurally on every rebuild.
- `loadPageFont()` loads a page font google-fonts style with `delayRender()` handled internally.
- Two mushaf ids: `qpc-v4` (plain glyphs, follow CSS `color`) and `qpc-v4-tajweed` (COLR/CPAL
  tajweed colours).
- Nothing is painted before the page font is loaded; renders never capture a fallback font.
- Every failure is a `MushafError` with a stable `code`.

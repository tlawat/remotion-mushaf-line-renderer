# Changelog

## Unreleased

- **Breaking: the package ships no mushaf data.** The layout is built at render time from QUL's
  two raw exports — the words of the QPC V4 script (JSON) and the 15-line layout (SQLite), each a
  zip on Tarteel's CDN — fetched, unzipped, read and compiled in memory by the package itself, the
  way the fonts are already fetched. Nothing changes in what a line is: same words, ids and lines
  as the compiled module the package used to carry. What changes: resolving a line needs the
  network (or a mirror) the first time per tab; the `data` option on `getMushafLine()`,
  `getMushafLines()`, `getMushafLocation()` and the `<MushafLine page line>` form names other
  sources (`{words?, layout?}`: absolute URLs, `staticFile()` paths or root-relative paths), which
  is how a mirror in `public/` makes renders independent of the CDN; `loadMushafData({mushaf?,
  data?})` warms the cache for a `<Player>`; the error codes `BAD_DATA_URL`, `DATA_HTTP`,
  `DATA_NETWORK`, `DATA_TIMEOUT` and `DATA_INVALID` say what went wrong, and `DATA_NOT_COMPILED` is
  gone. Node callers (scripts, tests) need Node 20.12 or newer to inflate the zips, or a `data`
  source pointing at the unzipped files. The tarball is about 1 MB lighter.

- **Line slicing.** `slice={{ayah}}` / `slice={{fromAyah, toAyah?}}` on `<MushafLine>` shows only
  those ayahs of a line, collapsed and centred in the measure — each slice reads as a line of its
  own. The fit is measured from the whole line before the slice is applied, so a slice never changes
  the type size (two slices of one line render at one size) and can change on every frame for free;
  the kept words sit at their printed advances, and every word span stays in the DOM (hidden ones
  carry `data-hidden` / `.mushaf-word--hidden`). A slice that keeps every word changes nothing; one
  that keeps none paints nothing. `getMushafLines({surah, fromAyah, toAyah, slice: true})` records
  the range as `line.slice` on the lines it cuts, so a passage carries its own slicing through
  `inputProps` (the prop wins, `slice={null}` cancels); `sliceWords(line, slice?)` lists the kept
  words; `wordStyle`'s context gains `inSlice`. New error code `BAD_SLICE`.

- **Mandala colouring, in CSS colours.** `mandala` — on `<MushafLine>` (convenience form),
  `getMushafLine()`, `getMushafLines()` and `loadPageFont()` — keeps the ayah-end rosette in its
  colours and writes the line in the inherited CSS `color`, the way most printed mushafs read
  outside a tajweed edition. It is the tajweed font at CPAL palette 3, so nothing extra is
  downloaded. Four colours paint everything the font paints — `ink` (everything written: the letters
  and the rosette's frame, curls and ayah number, which the font paints in the letter colour),
  `accent` (the petals), `detail` (the jewel) and `background` (the disc behind the number):
  `mandala={{ink: 'rgb(27 111 63)', accent: '#c8a45c', background: 'transparent'}}`. COLR glyphs
  ignore CSS `color`, so `'currentColor'` (the default for `ink`) is resolved from the line's
  computed colour and written into the palette; that is per line, so per-word colours still need the
  plain set. The look is recorded on the resolved data as `palette`
  and `paletteColors` and travels through `inputProps` like the rest of the line, and
  `<MushafLine>` declares the `@font-palette-values` rule before it paints, keeping the line hidden
  until the rule is in the document. New error codes `BAD_MANDALA` and `BAD_COLOR`.

- **Fixed: the word gaps were too wide.** A line was set at a size derived from a 42,501-unit
  reference while real lines are around 40,000 units, and `justify-content: space-between` then
  spread the leftover 4–8 % of the measure into the gaps between words — every gap came out roughly
  1.5× the printed one. Words now sit at the font's own advances (`flex-start`), and the new `fit`
  prop (default `'line'`) scales the line so it fills its box exactly. Measured against a photo of
  the printed page, ink coverage goes from 88.5 % to 93.6 % where the print is 94.1 %, and the gaps
  match it to within a tenth of a per cent. `fit="mushaf"` keeps one type size for every line, with
  short lines stopping short of the margin.

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
  `remotion-mushaf-line-renderer/presentations/slide-fade`) fades before it settles and travels a
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

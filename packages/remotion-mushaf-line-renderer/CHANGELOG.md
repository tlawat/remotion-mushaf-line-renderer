# Changelog

## 0.3.0

The API was redesigned for the open-source release. The package is not published yet, so nothing
depends on the old shapes; data resolved by 0.2 (`version: 1`) must be resolved again.

- **One `look` instead of three flags.** `mushaf` / `tajweed` / `mandala` are replaced by
  `look: 'plain' | 'tajweed' | 'mandala'` and, for mandala, `colors: {ink, accent, detail,
  background}`. The same two options work on `getMushafLine()`, `getMushafLines()`, `loadPageFont()`
  and the convenience form of `<MushafLine>`. `colors` with any other look is refused (`BAD_COLOR`);
  a wrong look is `BAD_LOOK`. `MUSHAF_LOOKS` lists the looks for Studio schemas.
- **Line data version 2.** `mushaf` is the layout id only (`'qpc-v4'`); the appearance is `look` +
  `fontSet` (`'qpc-v4' | 'qpc-v4-tajweed'`, what `fontUrl(page, fontSet)` receives) + `colors`.
  `palette` stays as an advanced override. `paletteColors` is gone. The root element carries
  `data-look`.
- **Presentations from the root entry.** `slideFade`, `revealRtl` and their pure `*Style`
  functions are exported from `remotion-mushaf-line-renderer`; the `./presentations/*` subpaths
  are removed. `isMushafError()` is exported.
- **Option types accept `undefined`** for every optional field, so props can be forwarded under
  `exactOptionalPropertyTypes`.
- **Repository:** Bun replaces pnpm, Biome formats and lints, the three pipeline scripts are one
  `qul` CLI (`compile`, `fonts`, `etags`, `verify`, `mirror`), the package sources are grouped by
  concern and the renderer is split into four hooks. Public README, CONTRIBUTING and architecture
  notes.

Also new since 0.2.0 (developed before the redesign, never released on their own; described here
in the 0.3.0 vocabulary):

- **The mandala look, in CSS colours.** `look: 'mandala'` keeps the ayah-end rosette in its colours
  and writes the line in the inherited CSS `color`, the way most printed mushafs read outside a
  tajweed edition. It is the colour font at CPAL palette 3, so nothing extra is downloaded. Four
  `colors` paint everything the font paints: `ink` (everything written, including the rosette's
  frame and the ayah number), `accent` (the petals), `detail` (the jewel) and `background` (the disc
  behind the number). `'currentColor'` (the default `ink`) is resolved from the line's computed
  colour and written into a `@font-palette-values` rule before the line is painted. New error code
  `BAD_COLOR`.
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

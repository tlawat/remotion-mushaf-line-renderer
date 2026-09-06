<!--
Handoff notes from an earlier project that built a Mushaf-line slide generator on the same QUL fonts
(Tlawat). Kept verbatim; the appendix points into that repository, not this one.

What this package already follows: one fixed scale from the widest line (42,501 units, §2d — see
`fontSizeForWidth()`); ordering words by the global sequential id and not by position-in-ayah (§2c —
`MushafWord.wordId`); never adding a gap between words, because the glyph advances already include
the spacing (§2b/§2 — the row is a flex row with no whitespace); ayah-end markers travelling with
their ayah as ordinary words (§7 — `kind: 'end'`); and slicing at whole words or ayah groups, never
by clipping geometry (§7a — one DOM element per word, `data-*` per word).

Where it differs on purpose: this package does not outline the glyphs at all. It lets the browser
render real text with the page font, so §1 (COLR layers are colour masks, never extra geometry)
matters only if you ever pre-extract paths — with `font-palette` the same font gives a plain look.
§5 and §6 (the surah-name and quran-common fonts) are the recipe for the `surah_name` and
`basmallah` lines this version does not render yet.
-->

# QUL / QPC V4 Tajweed Fonts — Lessons Learned

> Handoff notes for anyone who has to read, outline, lay out or slice the QUL
> (Quranic Universal Library / Tarteel) QPC V4 Tajweed Mushaf fonts, in any
> language or renderer. Everything below was learned the hard way while building
> a Mushaf-line slide generator. The notes are stack-agnostic; Appendix A points
> at where each rule is implemented in the Tlawat repo if you want the source.

## 0. The font family at a glance

| Font | Content | Addressing | Gotcha |
|---|---|---|---|
| `p1.ttf` … `p604.ttf` (QPC V4 Tajweed) | One font **per Mushaf page**. One glyph per **word**. Ayah-end markers, waqf (pause) signs and quarter-hizb markers are extra glyphs, sometimes appended to a word's code. | Private Use Area code points, meaningful **only inside that page's font**. | COLR/CPAL colour font. Outlining it naively produces garbage (§1). |
| `surah-name-v4.ttf` | 114 "سورة …" header glyphs, basmalah parts, Kaaba / ornament icons | Arabic Presentation Forms code points (U+FB50–FCBE) | Code point order ≠ surah order (§5). |
| `quran-common.ttf` | Surah header frame, 30 juz names, ayah-bracket variants, Makkah/Madinah marks | Glyph names via **GSUB ligature** substitution; cmap is useless | Resolve through the GSUB table (§6). |
| Layout data (QUL "15-lines" layout, JSON/CSV/SQLite) | For every word: page, line, surah, ayah, the PUA string to look up, and line type (`ayah`, `surah_name`, `basmallah`) | Word ids are **globally sequential** through the whole Quran | Header and basmalah lines have **no word rows**. |

Fonts are served from `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/ttf/p{page}.ttf`.
Any font-parsing library that can walk `cmap`, `hmtx`, `glyf`, `COLR`, `GSUB` and
emit an outline (fontTools, opentype.js, HarfBuzz, FreeType, fontkit…) is enough.

Our end-to-end approach: extract every word's outline **once** into path data +
metrics, store them, and compose lines by placing paths. No font is loaded at
render time; the paths *are* the text. This sidesteps every shaping/PUA problem
downstream (browsers, After Effects, headless Chrome, video encoders).

## 1. The headline trap: COLR layers are colour *masks*, not extra geometry

**Symptom.** Words render with stray filled circles, doubled strokes and small
squares under diacritics (a square under the kasra in «فيه» was the giveaway).
Ayah-end ornaments come out as solid discs or double rings.

**Cause.** The page fonts are COLR/CPAL colour fonts. For every base glyph the
`COLR` table lists *layer glyphs* whose only purpose is to say "this region of the
base glyph is tajweed-coloured like so". A real colour-font renderer paints
`layer ∩ base` in the CPAL colour. Anything that flattens the font to outlines
(an SVG-path pen, Illustrator "Create Outlines", After Effects "Create Shapes from
Text", "convert text to path" in any tool) sees the layers as free-standing closed
shapes and fills them solid.

**What we tried, in order:**

1. Assumed the diacritics lived only in the layers, so we **unioned all layer
   paths into the base path**, with a "if a layer is about the same size as the
   base it's decorative, skip it" heuristic. Wrong premise; produced the blobs.
2. Added a "drop short line-only paths" filter for the highlight rectangles.
   Removed the squares, not the circles.
3. **Final:** the base glyph already contains the complete outline, every
   diacritic included. Ignore `COLR` completely and draw the base glyph only.
   All layer handling was deleted.

**Rules:**

- Monochrome output → **base glyph only**. Never union COLR layers into the outline.
- Want tajweed colours → paint the base glyph in the text colour, then for each
  COLR layer paint **layer clipped by the base outline** in its CPAL colour
  (SVG: `<clipPath>` holding the base path, layer paths inside it; Canvas/Skia: set
  the base path as clip, fill the layer). Never paint a layer unclipped.
- Do not outline these fonts inside a design tool and expect a clean result. Use
  pre-extracted paths, or let a genuine colour-font renderer (browser text) draw them.
- Layer glyph names and counts differ between page fonts. Never hard-code them.

## 2. Spacing between shapes — three different bugs, three different fixes

They all *look* like "wrong spacing". Diagnose which one you have.

**2a. Shapes overlap inside one word.** A word's code may be several PUA
characters (word + ۞, word + ayah marker). Each sub-glyph must be translated by
the **accumulated advance width** of the glyphs before it. Our first translate
helper was a stub that returned the path unchanged, so every sub-glyph sat at x=0.

```
x = 0
for char in glyph_code:
    outline = glyph(char).outline translated by (x, 0)
    x += glyph(char).advance_width        # from hmtx, may be 0
word.width = x
```

**2b. Gaps after pause marks.** Waqf signs are **zero-advance overlay glyphs**;
they sit on top of the previous glyph and are not supposed to move the cursor.
We had a fallback "advance 0 → use 1000" that punched a 1000-unit hole after every
waqf. Use the real advance width, including 0. Fall back only for glyphs that have
no outline *and* no metrics at all.

**2c. Words in the wrong order / RTL placement.** Two rules:

- Inside a multi-char word code the characters are stored in visual **LTR** order;
  iterate them **reversed** so the first-read character ends up at the highest X.
- On a line, order words by their **global sequential word id**, not by a
  "position within ayah" field (that restarts at every ayah and will interleave two
  ayahs sharing a line). Start the cursor at the right edge and subtract each
  word's width.

```
x = right_edge
for word in line_words sorted by id:
    x -= word.width * scale
    place(word.path, translate=(x, y_offset), scale=scale)
```

**Advance vs ink.** Per word store both the **advance width** (sum of `hmtx`
advances — this already includes the font's inter-word spacing) and the **ink
bounds** (xMin/yMin/xMax/yMax of the drawn outline). Advance drives the cursor;
ink bounds drive vertical centring and viewBox maths only. Do not add a word gap
of your own, and never advance by ink width.

**2d. Scale — the "first thing we came up with" vs what we kept.**

- First: scale each line to *fill* the slide width
  (`scale = available_width / line_total_width`). Glyph size then changed from line
  to line and short lines came out enormous. Obvious the moment two consecutive
  lines were shown.
- Kept: **one fixed scale for every text line**,
  `scale = available_width / WIDEST_LINE_WIDTH`, where the widest line in the
  whole Mushaf measured 42 501 font units in this layout. Every line then has the
  same glyph size and shorter lines simply stop short of the margin, exactly like
  the printed page. Slide height had to grow (250 → 360 px at 1920 wide) to fit
  the tallest line at that scale.
- Centred special lines (basmalah, surah header) use `min(scale_x, scale_y)`
  inside their own nested viewport so they can never overflow.

## 3. Coordinate system

- Font outlines are Y-up, screen/SVG is Y-down. When you negate Y you must also
  **flip the sweep flag of every arc command** (`A`/`a`) or arcs mirror.
  Béziers need no special handling beyond negating their Y control points.
- Decide *where* the flip happens and store bounds consistently. We stored
  **pre-flip** bounds and negate them at composition time
  (`min_y = -max(y_max)`, `max_y = -min(y_min)`); mixing conventions produced lines
  drawn off-canvas.
- Keep paths in raw font units and apply `translate + scale` per word at
  composition time; round the transform numbers (2 dp is plenty). A full line is
  tens of KB of path data — keep it out of small text columns / row-size-limited
  stores, or better, out of the database entirely.

## 4. Per-page fonts and the PUA

- A word on page 604 **must** be looked up in `p604.ttf`; the same code point in
  any other page font is a different glyph. Group words by page and open each
  font once; cache the glyph set and cmap per font instead of per word.
- Extraction over 83 668 words × 604 fonts is memory-hungry. Limit parallelism
  (we run 2 workers) and give the process a generous, explicit memory budget and
  timeout; our first queue-driven run was OOM-killed at a 60 s default timeout.
- Some image libraries (ImageMagick's font-metrics query, notably) choke on PUA
  characters. Raster text rendering with these fonts is a dead end anyway; extract
  outlines instead.
- Shipping the fonts with an application is 160 MB. Download on demand and cache.

## 5. `surah-name-v4.ttf` — code point order is not surah order

Two ranges, both with gaps, and the numerically **higher** range holds the
**lower** surahs:

| Code points | Surahs |
|---|---|
| U+FC45 … U+FC64 | 1 – 21 |
| U+FB51 … U+FBEB | 22 – 114 |

Sorting all mapped code points numerically gives a +21 offset (Al-Fatiha renders
as Al-Hajj). Sort each range separately, concatenate FC-range first, and assert
exactly 114. U+FC8A–FC9E are Kaaba icons and ornaments, not names.

The **CDN build** of this font is a different binary (PUA E001–E072 reached via
GSUB ligatures named `surah001…`, 140 vs 166 glyphs, different outlines and scale).
Glyph indices cannot be cross-matched between the two builds. Rendering a handful
of glyphs in a browser and reading them was the only reliable verification.

Basmalah: compose it from the **four** glyphs U+FCAA, U+FCAB, U+FCAE, U+FCB4 of this
font. The single U+FDFD glyph in `quran-common.ttf` was rejected on visual review.
Header glyphs are drawn at a much larger design size (~9600 × 3300 units); wrap
them in their own scaled, centred viewport or they dwarf the text lines.

## 6. `quran-common.ttf` — reach glyphs through GSUB, not cmap

Juz names, the surah header frame and ayah-bracket variants have no meaningful
code points. Resolve a trigger string (e.g. `j001` → glyph `uniE900`, `header` →
`uniE000`) by walking the GSUB LookupList, lookup type 4 (ligature substitution),
matching the component glyph sequence. The header frame's first sub-path is the
inner white box; place the surah name inside it with ~18 % inner padding.

## 7. Slicing a line when the recitation starts or ends mid-line

The rule: **never cut path geometry. Slice at word or ayah granularity, by id,
then hide or omit whole elements.** Because every word is its own path with its
own translate, dropping a word never disturbs its neighbours.

Two mechanisms, pick by need:

**7a. Ayah-level, position-preserving (what consumers use).** When composing the
full line, wrap each ayah's words in a group carrying its identity
(`<g id="ayah-{surah}-{ayah}" data-surah data-ayah>` in SVG; a named layer or node
anywhere else). To show ayahs *n…m* of a surah:

```
words   = all words where surah = S and n <= ayah <= m, ordered by id
lines   = distinct (page, line) over words, in id order
for each line:
    in_range  = ayahs of `words` on this line
    all_ayahs = ayahs of *every* word on this line
    is_full_line = (in_range == all_ayahs)
    emit { line asset URL, in_range, all_ayahs, is_full_line }
```

The consumer loads the cached full-line asset and hides the groups not in
`in_range`. Words keep their exact page position and the asset URL stays
cacheable across every render.

**7b. Word-level, re-composed.** Given a contiguous span of word ids, re-run the
line composer on just those words with the **same fixed scale** (§2d). Because ids
are globally sequential, any contiguous recited span is a contiguous id range, so
`from_id <= id <= to_id` is exact. Glyph size matches full lines, but the fragment
is re-centred, so it will not overlay a full-line slide pixel-for-pixel, and the
result is render-specific (uncacheable).

Why the boundaries are mistake-free: the ayah-end marker is **part of the last
word's glyph code**, not a separate word, so it always travels with its ayah.
Two things to respect:

- Header and basmalah lines have no word rows, and for surahs ≥ 2 the basmalah is
  not a word at all. Alignment/timing data never references them, so slicing never
  has to consider them.
- If your data layer keys words by (page, line) rather than a single id, do not
  bulk eager-load words for many lines through that composite key; it misfilters.
  Query per line or by id range.

Design decision we made for time-synced video (v1): when a recording starts or
ends mid-line, show the **full** line and only record `is_full_line`. A viewer of a
physical Mushaf sees the whole line anyway, full-line assets are stable and
cacheable, and partial slides would need per-render rasterisation. Partial slides
remain the documented future option, localised behind that flag.

## 8. Publishing the slides

- Treat rendered slides as immutable, long-cached objects. Never overwrite in
  place; change a version prefix in the key when output changes.
- Renderers (After Effects, headless Chrome, etc.) should consume the finished
  slide over a URL; do not push font files or raw paths into render payloads.

## 9. Checklist before touching the fonts again

- [ ] Outlining QPC glyphs? **Base glyph only**; COLR layers are clip regions, never fills.
- [ ] Advancing the cursor? `hmtx` advance width, including 0; never ink width; no added gaps.
- [ ] Multi-char word codes? Reverse for RTL and translate sub-paths by accumulated advance.
- [ ] Word order? Global sequential id, not per-ayah position.
- [ ] Scale? One fixed scale from the widest line for text; fit-in-box for centred lines.
- [ ] Y-flip with arc sweep flags flipped; know whether stored bounds are pre- or post-flip.
- [ ] Surah names? FC45–FC64 first, then FB51–FBEB; verify visually.
- [ ] Slicing? Whole words / whole ayah groups by id. Never clip paths.
- [ ] Changed output? New version prefix, not overwrite.

---

## Appendix A — where this lives in the Tlawat repo (reference only)

| Topic | Location |
|---|---|
| Word outline extraction (base-glyph-only rule, advance widths, RTL reversal) | `database/seeders/MushafLayoutData/extract_glyphs.py`; commits `c6ef482` → `eb6f708` → `7fb16e1` (COLR), `a6351d5`, `249dbef`, `a60c2f6` |
| Path maths (Y-flip with arc sweep, translate) | `database/seeders/MushafLayoutData/svg_path_utils.py` |
| Surah-name font code point ordering, 4-glyph basmalah | `extract_surah_names.py`; commits `7a20d72`, `a9ecdaf`; `.ai/agents_plans/session_summary_2026_02_05.md` |
| GSUB ligature resolution for juz names / header frame | `extract_juzz_names.py`, `quran_commen_ligatures.json` |
| Line composition, fixed reference scale (42501), ayah groups, partial lines | `app/Services/Quran/SlideGenerator.php`; `config/quran.php` (`reference_line_width`); commits `8439551`, `667179b`, `c417f68` |
| Ayah-range / partial slicing endpoints | `app/Http/Controllers/Api/QuranSlideController.php` (`byAyahRange`, `partial`), `routes/api.php` `quran/slides/*`; commit `a3570da` |
| Composite-key words relation caveat | `app/Models/MushafLayoutLine.php` (`words()` vs `getWordsInRange()`) |
| Full-line-in-v1 decision for time-synced slides | `.ai/agents_plans/plan_31_*.md` (D1/D2) |
| Storage move off MySQL to R2, version-prefix invalidation | commits `8c0c8dd`, `0ec17f5`; plan 23 |

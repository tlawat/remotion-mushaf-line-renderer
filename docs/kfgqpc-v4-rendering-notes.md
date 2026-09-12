# KFGQPC V4 (QPC V4 Tajweed) — notes for rendering Mushaf lines from the CDN

Distilled from the Tlawat render-farm slide system (SlideGenerator, extract_glyphs.py,
the 15-line layout DB) plus a fresh probe of the Tarteel CDN and the font tables
(2026-09-05). Everything below was verified against the real files unless marked "assumed".

---

## 1. Mental model

- The V4 Mushaf is **604 pages × 15 lines** (pages 1 and 2 have only 8 lines). Total **83,668 "words"**.
- **One font per page** (`p1.ttf` … `p604.ttf`). Each word is a single pre-shaped, pre-justified glyph.
  There is no Arabic shaping, no kashida logic, no justification for you to do. The glyph advance
  widths are already tuned so every full line on a page sums to (nearly) the same width.
- The word "text" in the V4 data is **not Arabic text**. It is a code point in
  **U+FC41 … U+FCFC** (188 distinct values) that is *reused on every page*: `U+FC41` is
  بِسۡمِ on page 1 and a completely different word on page 3. A code point only means something
  together with its page font. (This is sometimes called "PUA" — it is not; it is the
  Arabic Presentation Forms-A block, which matters, see §4.)
- Ayah-end markers are **words** in the data: the last word of every ayah is the marker
  (e.g. `1:1:5` is "١"). Keep them; they carry the line's width.
- Font metrics (identical across pages): `unitsPerEm 2500`, ascent `3940`, descent `-2520`,
  lineGap `0` → natural line box **6460 units = 2.584 em**. Glyph bboxes stay inside that box
  (max seen yMax 3420, yMin -1823), so `line-height: normal` never clips.
- Family names are `QCF4{page:03d}_COLOR` (tajweed) / `QCF4{page:03d}_X` (plain). Do not rely on
  them from CSS; declare your own family per page in `@font-face`.

## 2. The CDN

Base: `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/`

| Path | Status | Notes |
|---|---|---|
| `v4-tajweed/ttf/p{N}.ttf` | 200 | COLR/CPAL colour font. 80 KB (p1) – 300 KB (p3). What a path pipeline uses. |
| `v4-tajweed/woff2/p{N}.woff2` | 200 | ~27 KB for p1. Use this in browsers. |
| `v4-tajweed/woff/p{N}.woff` | 200 | fallback |
| `v4/ttf/p{N}.ttf`, `v4/woff2/p{N}.woff2` | 200 | Plain black variant, no COLR (~half the size). |
| `v4-tajweed/otf/…` | 404 | |
| `surah-name-v4.ttf` (any guessed path) | 404 | Surah-name / basmalah / juz fonts are **not on this CDN path** — bundle them (see §6). |

Headers observed:
- `access-control-allow-origin: *` on both ttf and woff2 → cross-origin `@font-face` works.
- `cache-control: max-age=14400` (4 h) and Cloudflare `cf-cache-status: MISS` on first hit →
  cold pages are slow-ish; **preload the pages you are about to show**, and consider mirroring to
  your own R2/S3 with `immutable` caching (that is what we did for the rendered slides).
- `content-type: font/ttf` / `font/woff2` correct. ETag present.
- No versioning in the URL. If Tarteel republishes a font, the layout can silently shift.
  Pin by mirroring, or at least store the ETag you validated against.

## 3. Layout data you need alongside the fonts

From QUL (Tarteel) downloads. (The
`remotion-mushaf-line-renderer` package reads exactly these two files — the layout SQLite and the
`qpc-v4.json` words — at render time, straight from QUL's exports on Tarteel's CDN; the URLs it pins
live in `scripts/lib/datasets.mjs` and `src/mushafs.ts`, and `bun run qul data`
mirrors and validates them.)

1. **`qpc-v4-tajweed-15-lines.db`** (SQLite, 236 KB) — table `pages`:
   `page_number, line_number, line_type, is_centered, first_word_id, last_word_id, surah_number`
   - `line_type` ∈ `ayah` (8,820 lines) | `surah_name` (114) | `basmallah` (112).
   - `surah_number` is only set on `surah_name` lines. For other lines derive it by carrying the
     last seen header forward.
   - `first_word_id`/`last_word_id` are **inclusive** global word ids (1…83,668), empty for
     header/basmalah lines.
   - `is_centered`: all 114 headers, all 112 basmalahs, and **29 ayah lines** (pages 1–2, and the
     short last line of some surahs on pages 255, 528, 534, 545, 586, 593, 594, 600, 602–604).
     The print (and QUL's own preview) centres **30**: the export leaves page 2 line 5 (2:3:6)
     flagged as justified, so the package's readers centre every line of pages 1–2 by rule
     (`centeredPages` in `scripts/lib/datasets.mjs` / `src/mushafs.ts`); with that rule the
     exports compile to exactly the layout the preview pages compile to.
     A centered line must be centered, not stretched — its glyph sum is far below full width
     (e.g. p1 l8 = 14,573 units vs ~40,600 for a full line).
2. **`qpc-v4.csv` / `qpc-v4.json`** — `id, surah, ayah, word, location ("s:a:w"), text(code point)`.
   `word` is the position **inside the ayah**, not on the line. **Order words on a line by `id`**,
   never by `word`.
3. **`qpc-hafs-word-by-word.csv`** — same ids, real Uthmani text. Use for search/alt text only.
4. `quran-metadata-surah-name.json` (has `bismillah_pre`), `quran-metadata-ayah.json`, juz metadata.

Multi-character entries: **4,514 words have 2 code points** (e.g. `4:1:17` = `U+FC51 U+FC52`).
They are stored in **visual LTR order**. Cases: a zero-width waqf/pause mark that overlays the
word (advance 0 — never substitute a fallback width), or a side-by-side pair (rubʿ/hizb marker +
word). In a browser you just render the string; in a path pipeline you must reverse the order
and place by advance (see §5).

Quick structural facts worth hard-coding as tests:
- Pages 1 and 2: 8 lines, every line centered.
- Page 187: surah 9 (At-Tawbah) header with **no basmalah** line.
- Page 255: header + basmalah in the **middle** of the page (lines 3–4).
- Pages 603/604: **three surahs per page** (header + basmalah + 2–3 ayah lines, repeated).
- Every page in the DB has exactly 15 rows except 1 and 2.

## 4. Rendering with the font in a browser (recommended when you control the DOM)

```css
@font-face {
  font-family: "qpc-p3";
  src: url("https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/woff2/p3.woff2") format("woff2");
  font-display: block;            /* see fallback note */
  unicode-range: U+FC41-FCFC;
}
.page[data-page="3"] { font-family: "qpc-p3"; }
.line { direction: rtl; white-space: nowrap; line-height: normal; }
.line.centered { text-align: center; }
.line:not(.centered) { text-align: right; }
```

Rules learned the hard way:

- **Never normalize the strings.** U+FC41… are real Unicode ligature code points; NFKC/NFC,
  Arabic reshapers, "remove tashkeel" utilities, and some templating escapers will convert or
  drop them. Treat the word text as opaque bytes. Also ensure the DB column is `utf8mb4` and
  that nothing HTML-escapes them into numeric entities differently than you expect.
- **Fallback fonts render garbage, not blanks.** Because the range is Presentation Forms-A,
  a system Arabic font will happily draw "ﱁ" as a lam-alef ligature. Use `font-display: block`
  (or hide the line until `document.fonts.load()` resolves) so a slow page font never shows a
  wrong-text flash.
- **Font size from width, not from height.** All full lines on a page sum to ~40,400–41,300
  units; the widest line in the whole Mushaf is **42,501 units** (that is our
  `reference_line_width`). So `font-size = containerWidth / (42501 / 2500) ≈ containerWidth / 17`
  gives every page the same type size with no overflow. Do not `text-align: justify` — the
  glyphs already fill the measure; justify would insert visible gaps.
- Words don't need spaces between them (the glyph advances include the gap); the page font's
  space glyph is 100 units, so a space per word adds ~1.5 % width if you do use one. Be consistent.
- **Line height / page aspect.** 15 lines × 2.584 em; at `font-size = W/17` a page is about
  2.28 × W tall. The printed Madinah Mushaf is squatter, so most viewers set
  `line-height` around 1.9–2.2 em. Glyph extremes are +1.37 em / −0.73 em from the baseline,
  so anything below ~2.1 em risks overlap between a line's superscript marks and the line above.
- **Tajweed colours are free**: the font is COLR v0 + CPAL and every modern browser renders
  it. The 6 palettes are (verified from the tables):
  | index | meaning |
  |---|---|
  | 0 | tajweed, black base (light theme) |
  | 1 | tajweed, white base (dark theme) |
  | 2 | tajweed alt colour set, black base |
  | 3 | **no tajweed**, black text, coloured ayah markers |
  | 4 | no tajweed, white text (dark) |
  | 5 | no tajweed, black, alt marker colours |
  Switch with `@font-palette-values --plain { font-family: "qpc-p3"; base-palette: 3; }` and
  `font-palette: --plain`. `color:` does not affect COLR glyphs; if you want the text to follow
  `currentColor`, use the plain `v4/` fonts, or override the entries with the computed colour.
  The 16 CPAL entries, from the CPAL/COLR tables and QUL's own palette rules (`app/views/shared/_page_font.html.erb`):
  | entry | paints | palette 0 |
  |---|---|---|
  | 0, 14 | letters | `#000000` |
  | 1, 2, 15 | silent letters (grey) | `#a5a5a5` |
  | 3–9 | the tajweed rule colours (7, the 2-vowel prolongation, is by far the most used) | `#b50000 #ff7b00 #ce9e00 #09b000 #3f48e6 #2fadff #f40000` |
  | 10 | rosette jewel | `#2ca4ab` |
  | 11 | rosette petals | `#ff0080` |
  | 12 | disc behind the ayah number | `#d8e9d8` |
  | 13 | rosette frame, curls and the ayah number | `#000000` |
  QUL's preview page offers ten themes as such rules: Light (base 0), Dark (base 5), Sepia (base 2),
  Black (base 5, all white, plus `13 black` on the ayah-marker glyph only), and P1–P6 (the raw
  palettes; P6 does not exist, so it falls back to the default). Its overrides for entries 16–18 are
  no-ops: the font has 16 entries.
- Kerning: GPOS `kern` exists but is negligible (6 pairs on p3). Advance-width layout is safe.
- `unicode-range` also lets you declare all 604 faces under one family name if you prefer, but
  since every page reuses the same code points, you **must** keep one family per page.
- Preload strategy: `<link rel="preload" as="font" crossorigin>` for the current page ±1.
  Fonts are 25–100 KB each in woff2; the whole Mushaf is roughly 20–30 MB.

## 5. Rendering as vectors (SVG/canvas/video) with a path pipeline

Use this when there is no text engine (After Effects, ffmpeg overlays, PDF generation,
non-browser renderers) or when you want pixel-identical output everywhere.

Pipeline: `fontTools` → SVG path per word → compose lines by advance width.

- Extract with `TTFont(path).getGlyphSet()`, `SVGPathPen` for the outline, `BoundsPen` for
  bounds, `glyph.width` for advance. Cache `glyph_set` and `cmap` per font (83k lookups).
- **Use the base glyph outline only.** The COLR layers are *colour masks* that intersect the
  base outline; extracting layers as shapes gives duplicate circles/overlaps, and some layers
  are plain rectangles (highlight boxes) that render as black squares. The base outline already
  contains all tashkeel.
- **Flip Y.** Font coordinates are y-up, SVG is y-down. Either rewrite the path (negate y in
  every command, and flip the sweep flag of arcs) or, simpler, wrap in
  `transform="scale(1,-1)"`. Bounds stored pre-flip must be negated when you use them.
- **Zero-width glyphs**: waqf marks have advance 0 — keep it 0 (an advance of 1000 puts a hole
  after every pause mark).
- **Multi-char words**: iterate the code points in **reverse** (data is LTR-visual, layout is
  RTL by advance), translate each subsequent sub-glyph by the accumulated advance.
- **Line composition**: cursor starts at the right edge (`startX = (W + totalWidth·scale)/2`
  for centering, or the right margin), subtract each word's `advance·scale`, emit
  `<path d transform="translate(x,y) scale(s)">`. Group paths as
  `<g id="ayah-{s}-{a}" data-surah data-ayah>` so a consumer can show only part of a line
  (mid-line ayah start/stop) with CSS or by deleting groups.
- **Fixed scale** across the Mushaf: `scale = availableWidth / 42501`. Do not fit-to-line, or
  short centered lines blow up.
- Vertical placement: centre the actual glyph bbox of the line inside a fixed-height slide
  (for example 1920×360 per line with 100 px side / 40 px top padding); a fixed height keeps every
  line asset the same size for the video template.
- Output sizes: all 83,668 word paths as JSON ≈ **490 MB**; per-line SVGs 20–150 KB. Store the finished line SVGs on object storage with
  `Cache-Control: public, max-age=31536000, immutable` under a versioned prefix
  (`slides/v1/p{page}_l{line}.svg`) and bump the prefix instead of overwriting.
- Extraction takes minutes with `ProcessPoolExecutor`; keep the worker count low in a small
  container and download fonts with retries and a temporary cache.
- Colours: the outline-only approach loses tajweed. If you need coloured vectors you must
  intersect layer masks with the base outline (clipPath per layer using CPAL palette index),
  or rasterise via a browser (headless Chrome renders COLR correctly — this is why the Remotion
  engine can just use the font).

## 6. Headers, basmalah, juz names, ornaments

These are NOT in the page fonts (page fonts only contain that page's words + ayah markers).

- **`surah-name-v4.ttf`** (from the QUL download bundle, 1.1 MB, upem 2500): 114 glyphs
  "سورة …" at **U+FC45–U+FC64 for surahs 1–21** and **U+FB51–U+FBEB for 22–114**, both ranges
  with gaps — discover them from the cmap (`sorted(cp for cp in cmap if lo <= cp <= hi)`)
  and assert the count is 114. Basmalah is the 4-glyph sequence
  `U+FCAA U+FCAB U+FCAE U+FCB4` from the same font. Rendered name bbox is ~9,600×3,100 units.
- **`quran-common.ttf`** (upem 1024, GSUB only): decorative header border `uniE000`
  (viewBox `-100 -928 8440 1216`, first subpath is the white box `0..8240 × -828..188` you
  centre the name into), juz names `uniE900–uniE91D`, plus markers (`marker-half`,
  `marker-full`, `s1open/s1close`…). Glyphs are reached through GSUB ligature names
  (`quran_commen_ligatures.json` maps `"juz-1-number" → "juz001"` etc.).
- The header on a real page occupies one 15-line slot; the basmalah another; both flagged
  `is_centered`. Surah 9 has no basmalah; surah 1's basmalah is ayah 1 (a normal word line).

## 7. An API shape that works for consumers

Public, cacheable endpoints, as a template:

- `GET /slides/{page}/{line}` → metadata + `svg_url`
- `GET /slides/by-ayah/{surah}/{ayah}` → lines touched by the ayah with `word_range {first,last}`
- `GET /slides/by-ayah-range/{surah}/{from}/{to}` → per line: `is_full_line`, `ayahs`,
  `all_ayahs`, `svg_url` — lets the client hide `#ayah-s-a` groups on partial lines
- `GET /slides/{page}/{line}/partial?from={wordId}&to={wordId}` → on-the-fly sliced SVG

Key indices: `(page_number, line_number)` on both lines and words, `(sorah_number, aya_number)`
on words. An ayah can span lines and pages; always resolve ayah → words → distinct
(page, line) rather than assuming one line.

## 8. Numbers to keep at hand

| Thing | Value |
|---|---|
| pages / lines per page / words | 604 / 15 (p1–p2: 8) / 83,668 |
| line types | 8,820 ayah · 114 surah_name · 112 basmallah |
| centered ayah lines | 29 |
| code point range in word data | U+FC41–U+FCFC (188 distinct, reused per page) |
| multi-code-point words | 4,514 |
| unitsPerEm / ascent / descent | 2500 / 3940 / −2520 |
| widest line (font units) | 42,501 (typical full line 40,400–41,300) |
| space glyph advance | 100 |
| CPAL palettes | 6 (0 light tajweed, 1 dark tajweed, 3 plain black, 4 plain white) |
| woff2 / ttf per page | ~25–100 KB / ~50–300 KB |
| CDN cache | `max-age=14400`, CORS `*` |

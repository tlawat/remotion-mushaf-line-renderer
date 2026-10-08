# QPC V1, QPC V2 and Indopak layouts: research

Verified from this container on 2026-10-08. Facts only, each with the URL or command it comes from (curl, then Python
over the saved responses; the scratch scripts are not committed, every request can be repeated as written).

## 1. Data sources

**quran.com API v4** (no key, 200; `cache-control: public, max-age=691200`, Cloudflare).
- `GET https://api.quran.com/api/v4/verses/by_page/3?words=true&word_fields=code_v1,code_v2,line_number,page_number,v1_page,v2_page,line_v1,line_v2,location&per_page=50`
  returns per word: `id, position, char_type_name (word|end), code_v1, code_v2, line_number, page_number, v1_page,
  v2_page, line_v1, line_v2, location, verse_key, text, audio_url, translation, transliteration`.
- v4 ignores `mushaf`: `by_page/3?...&mushaf=N` for N = 1, 2, 3, 4, 5, 6, 7, 8, 11, 19 gave byte-identical bodies
  (md5 `33ffc134…`). `page_number`/`line_number` equal `v2_page`/`line_v2` for every word.
- Full pass (`/api/v4/verses/by_chapter/{1..114}`, 190 requests, 32 MB): 83,665 words = 77,429 `word` + 6,236 `end`.

**quran.com QDC API** (what quran.com's site calls; undocumented, unversioned; `max-age=604800`).
- `GET https://api.qurancdn.com/api/qdc/verses/by_page/3?words=true&per_page=all&mushaf=M&filter_page_words=true`
  honours `mushaf`: 1 = V2 (`text` = `code_v2`), 2 = V1 (`text` = `code_v1`), 3 = Indopak text on the 604-page V2
  pagination, 6 = Indopak 15 lines, 7 = Indopak 16 lines. Page of 114:6 (`by_chapter/114`): 604, 604, 604, 610, 548.
- Pages 3+: QDC `line_number` for mushaf 1 / 2 equals v4 `line_v2` / `line_v1`. Pages 1-2 differ: QDC puts the words
  on lines 9-15 / 10-15, v4 on 2-8 / 3-8 (QUL agrees with v4, below).

**QUL** (`https://qul.tarteel.ai/resources/mushaf-layout`, 12 layouts listed). Layout ids: **15 = KFGQPC V1 (1405H)**,
**10 = KFGQPC V2 (1421H)**, 19 = V4, 12 = Indopak 15 lines (Qudratullah), 11 = Indopak 16 lines (Taj company),
8 = KFGQPC Nastaleeq 15 lines, 236 and 313 = Indopak 13 lines, 21 = Digital Khatt (V2 print).
- Downloads need a login: on `/resources/mushaf-layout/{15,10,12,11}`, `/resources/quran-script/57` (QPC V1 glyphs,
  word by word), `/resources/quran-script/61` (QPC V2) and `/resources/font/242`, every "Download sqlite/json/docx/woff"
  button is `href="#_" data-url="/users/sign_in?modal=true&user_return_to=…"`.
- The export bucket cannot be listed: `?list-type=2&prefix=qul-exports/mushaf-layout/` on
  `https://s3.us-east-1.wasabisys.com/static-cdn.tarteel.ai` → 403 `AccessDenied`. A known export URL is public (HEAD
  of the pinned V4 `.db.zip` → 200), so V1/V2 export URLs can only come from someone who logs in.
- Previews are public: `GET https://qul.tarteel.ai/resources/mushaf-layout/{id}?page={n}` (200, ~150 KB) lists the
  15 lines with classes `line--surah-name`, `line--bismillah`, `line--center`, and each word as
  `<span class="char   char-word|char-end …" data-word-id data-location="s:a:w">GLYPH</span>` (a run of spaces, an
  optional `mr15` class). The `/mushaf_layouts/{id}?page_number=` preview the dev tools use for V4 is another id space:
  `/mushaf_layouts/10` is "Quran Academy wbw Tajweed Images", `/mushaf_layouts/15` "QPC Hafs Nastaleeq 16 lines wbw".
- QUL vs quran.com: for V1 (15) and V2 (10), on pages 3, 76, 589 and the 98 pages per layout that carry a surah's end,
  every word's page, line and glyph equals quran.com's except **84:21:7**: QUL V2 page 589 line 14, quran.com `line_v2`
  13, which breaks reading order (84:21:6 is on line 14). Indopak: layout 12 page 3 = QDC mushaf 6 page 3 (135 words
  incl. 11 `end`, same lines and text); layout 11 page 3 = QDC mushaf 7 (165 words).

**Fonts** (QUL CDN, no login).
- `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v1-optimized/woff2/p{n}.woff2?v=3.1` and
  `…/quran_fonts/v2/woff2/p{n}.woff2?v=3.1`: HEAD → 200 `font/woff2` for all 604 pages of both sets (1,208 HEADs;
  p3: 66,024 and 150,620 bytes). QUL's previews declare these (`src: local(QCF_P003)` / `local(QCF2003)`, then woff2,
  woff, ttf). A non-optimized `…/quran_fonts/v1/woff2/p3.woff2` also answers 200 (76,604 bytes).
- TTF tables (p3, p300 of each): V1 unitsPerEm 2048, hhea 2362/−1169 (p3) and 2295/−1072 (p300); V2 unitsPerEm 2500,
  hhea 2809/−1301 and 3000/−1500. Neither set has COLR/CPAL: monochrome only.
- Codes: V1 `code_v1` U+FB51-U+FC33 (194 distinct), V2 `code_v2` U+FC41-U+FCFC (188). 198 words hold two glyphs
  separated by U+0020 (first: 2:26:1); without spaces a word is 1-3 code points. No two words of a page share a code.
- Headers: QUL's V1/V2 previews draw surah names with the V4 surah-name ligatures
  (`<span class="surah-name-v4-icon">surah004</span>`) in the `quran-common` header frame, the basmala as U+FDFD.
- Indopak: `/resources/font/242` preloads
  `https://static-cdn.tarteel.ai/qul/fonts/nastaleeq/Hanafi/normal-v4.2.2/with-waqf-lazmi/font.ttf` (200, 310,912 B;
  `font.woff2` beside it: 78,672 B). "AlQuran IndoPak by QuranWBW", unitsPerEm 2048, GSUB/GPOS. Its cmap covers every
  code point of QDC mushaf 6 and 7 page 3, incl. the PUA ayah numbers U+F504-U+F510, U+F64A, U+F652 (fontTools).

## 2. V1 vs V2 layout (all 83,665 words, v4 `v1_page/line_v1` vs `v2_page/line_v2`)

- Same frame: 604 pages × 15 lines; pages 1-2 are 8-line pages (surah name on line 1, page 2 basmala on line 2, words
  on 2-8 / 3-8; QUL's preview leaves lines 9-15 empty), 8,820 word lines each.
- **Not one layout**: 361 words sit on a different page; 25 pages start on a different word (121, 122, 123, 145, 532,
  533, 534, 565, 568, 570, …); 565 of 604 pages put a word on a different line; 75,690 words share page and line.
- Header lines are derivable: every line without words is the surah name / basmala just before a surah's first word
  (surah 9: name only). When the first ayah is on line 2, the name is on line 15 of the previous page (V1: 21 surahs,
  V2: 18; e.g. surah 4: name 76:15, basmala 77:1). Equal to QUL's classes on all 196 fetched pages; 114 + 112.
- Centred ayah lines (only in QUL markup, `line--center`, on the 98 fetched pages each): V1 20 (13 on pages 1-2, then
  600:9, 602:5, 602:15, 603:10, 604:9, 604:14, 604:15 as page:line), V2 30 (13 + 17, e.g. 255:2, 528:9, 534:6).
- Dry-run compile into `CompiledPage` (`t,k,a,l`): lines 9,046, ayah lines 8,820, surah names 114, basmalas 112 (the
  V4 numbers), words 83,665 (V4: 83,668); JSON ≈745 KB, gzip ≈56 KB per set.

## 3. Design that fits the renderer

Registry (`packages/remotion-mushaf-line-renderer/src/mushaf/registry.ts`):
- `DatasetId` gains `'qpc-v1' | 'qpc-v2'`; `DATASETS` rows: `layoutId` 15 / 10, `pages: 604`,
  `linesOnPage: (p) => (p <= 2 ? 8 : 15)`, `centeredPages: [1, 2]`, data URLs of the mirror below.
- `MUSHAFS` rows reuse `V4_SHARED_FONTS` and `V4_GLYPHS` (as QUL does); `fontSets.plain` = `v1-optimized` / `v2` with
  `?v=3.1`. `MushafDefinition.fontSets.color` is required today: make it optional and have `resolveSelection` throw a
  `MushafError` naming `theme: 'plain'` for these two. `MushafFontSet` gains `'qpc-v1' | 'qpc-v2'`.
- `metrics`: unitsPerEm 2048 / 2500; ascent/descent vary per page, so pin one pair (faces get `ascentOverride` /
  `descentOverride` from `metrics`, `load-page-font.ts:282`), e.g. the max over the 604 fonts; `referenceLineWidth` =
  the widest line in font units (hmtx advances of its glyphs), measured by the build over the 604 fonts.
- `compile.ts` hard-codes U+FC41-U+FCFC (`CODE_POINT_MIN/MAX`; `format.ts` doc too): per dataset (V1 U+FB51-U+FC33).

Data (the exports are login-gated, so build from public sources):
1. A dev-tools command (`scripts/qul.mjs data --dataset qpc-v1|qpc-v2`, next to V4's) fetches the v4 `by_chapter`
   pass (190 requests) and the 604 QUL previews `/resources/mushaf-layout/{15|10}?page=n`.
2. It builds `ParsedPage[]` (header lines by the rule in section 2, pages 1-2 cut to 8 lines, `centered` from QUL,
   spaces stripped from codes, QUL winning where the two disagree) and runs the existing `compileLayout` +
   `checkLayout` (`scripts/lib/compile.mjs`, held equal to `src/data/compile.ts` by a unit test).
3. It writes `qpc-v1.layout.json` / `qpc-v2.layout.json` (`CompiledLayout`, `format: 1`, `source` naming both origins)
   with a sha256, published as a data package or a static mirror. `MushafDataSource` today takes only the two QUL
   exports (`load-layout.ts` `resolveDataUrls`), so add a `{compiled: url}` source checked by `checkLayout`. Option
   with no runtime change: emit QUL-shaped files (words JSON with `text`, a SQLite `pages` table via `bun:sqlite`)
   that the current parser reads (`qul-export.ts` aliases `code_v2` but not `code_v1`).

Invariants (build gate and unit test, per set): 604 pages; 8 lines on pages 1-2, 15 elsewhere; lines 9,046; ayah
lines 8,820; surah names 114; basmalas 112; centred ayah lines 20 (V1) / 30 (V2); words 83,665 = 77,429 + 6,236
markers; one `end` per ayah at its last position; contiguous ids; reading order (catches 84:21:7); 1-3 code points per
word inside the set's range; every code in its page font's cmap; every word equal to QUL's preview (page, line, glyph)
with an allow-list of known differences. Spot checks (page:line): 1:1 surah 1; 2:2 basmala; 76:15 surah 4;
77:1 basmala; 187:1 surah 9 with no basmala (9:1:1 is on 187:2 in both).

**Indopak** does not fit this model: the text is Unicode (spaces inside words, waqf marks, PUA ayah numbers) in one
shaped font, so glyph advances do not carry the line's spacing (`styles.ts` lays words at their advances, no
justification) and `checkLayout`'s 1-4 PUA code points rule fails. It needs a line mode that justifies each line to
the measure, fed from QDC mushaf 6 (610 pages × 15) or 7 (548 × 16) plus QUL previews 12 / 11 for centring.

## 4. Effort and risks

- Effort (estimate): V1 + V2 ≈ 3-4 agent-days (command and preview parser, registry rows, per-dataset code range,
  optional colour set, compiled-source loader, metrics and width over 2 × 604 fonts, tests). Indopak ≈ 1-2 weeks
  (justified line mode, data path, visual review against QUL's pages).
- QDC is undocumented and v4 silently ignores `mushaf`: pin the field names, fail the build on any shape change.
- quran.com is not authoritative (84:21:7): keep the QUL cross-check in the build.
- Preview scraping depends on QUL's HTML (spaces in classes, `mr15`): the parser must fail loudly, as `qul-html.mjs`.
- Per-page fonts with differing vertical metrics; V1 has two CDN variants (`v1-optimized`, `v1`).
- Terms: KFGQPC fonts per `docs/mushaf-studio/licensing.md`; redistributing data from quran.com/QUL: terms not checked.

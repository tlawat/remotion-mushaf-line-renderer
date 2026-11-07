# Mushaf Studio: render design (highlight, motion, looks)

Status: implemented (stages R1-R4), with the deviations recorded at the end of this page. It is
the contract for reworking how `@tlawat/mushaf-studio` marks the recitation, moves its text, and
dresses the frame, and for the small, additive changes this needs in `@tlawat/remotion-mushaf-line`.
Every value below is decided.
Where something must be checked in a render before it is frozen, section 12 names the still and
the pass criterion, and section 13 says what to do if it fails.

The request it answers: rework the render options, including the highlight, so that marking and
motion are subtle and simple (not the TikTok subtitle grammar), and make the result فخم
(majestic, refined, dignified) and appropriate to the Quran.

References: `R:` is `packages/remotion-mushaf-line-renderer/src`, `S:` is
`packages/mushaf-studio/src`. Every composition runs at 30 fps; frame counts below are at 30 fps,
and at another rate a duration is `round(seconds × fps)` frames.

Contents

1. Principles
2. What changes at a glance
3. Tokens: colour, motion, geometry
4. The timing model
5. Option groups (Zod, defaults, descriptions, visual and motion specs)
6. Looks and the Format control
7. Migration of saved props
8. Renderer changes (`@tlawat/remotion-mushaf-line`)
9. Studio implementation map
10. Look tab and panel UI
11. Documentation and changelog
12. Visual verification
13. Risks and contingencies
14. Rejected ideas

---

## 1. Principles

1. **The frame is a printed mushaf leaf.** The KFGQPC line is shown exactly as printed. Nothing
   scales, skews, rotates, bounces, wipes, blurs or springs a glyph, and no partial word is ever on
   screen. Only four things animate: the opacity of a line, a whole-line rise of at most 0.12 em
   on entry, the ink (opacity or colour) of a whole word, and a faint band painted behind a word.
2. **One mark at a time.** A video marks the recitation with exactly one device: *ink* (the text
   still to come rests lighter and fills in behind the reciter), *tint* (the word's own ink turns
   antique gold) or *wash* (a faint, soft-ended band behind the word or ayah). Never a box, halo,
   glow, underline, or two devices together.
3. **The voice leads, the eye follows.** No line, scroll, translation, page or ayah changes before
   the reciter has finished the last word on it. A transition may be late; it is never early.
4. **Never an empty frame, never two Arabic lines at reading strength.** Line changes are
   sequential dissolves: the outgoing line is under 0.25 opacity before the incoming one starts,
   and at no frame are both above 0.2.
5. **The recited word never loses contrast.** A tinted word reads at 5:1 or better on its ground
   (the accent is corrected automatically). Resting text stays at 0.5 opacity or more (0.65 on
   tajweed themes). Dimming never compounds: a word's rest opacity and its line's neighbour
   opacity are never multiplied.
6. **Tajweed colour is a reading aid and is never repainted.** On a theme with tajweed colours,
   the mark is ink or wash; a tint is shown as a wash there, and the panel says so.
7. **Stillness is the norm.** While a line is recited, the only change on screen is the mark.
   Nothing reacts to loudness, nothing pans, and the background zoom, if any, is at most 5 % over
   the whole video.
8. **Gold is a line, never a fill.** Rosettes, cartouche, rules and the jadwal border are flat gold
   line work (no metallic gradients), covering at most about 5 % of the frame. Grounds are ivory,
   charcoal or Madinah green, never `#ffffff` or `#000000`. One metal per video.
9. **The Quran is the only large, centred, full-ink element.** The translation of the meanings is
   at most 0.5 × the Arabic glyph size, centred under it, in a loaded book serif (EB Garamond) and
   muted ink, never truncated and never timed in pieces. Labels are small caps or Amiri, at about
   60 % ink, inside a 5 % safe area, and never over the text.
10. **Every option is dignified by construction.** Each enum value is a finished design, each
    number is clamped to a dignified range, and alphas of washes are internal. No combination of
    options produces a pale page, a neon word or a swimming background.
11. **Defaults are the finished design.** A new project that touches nothing gets the *Mushaf* look:
    ivory page, gold-line rosettes, ink filling in word by word, three lines, calm dissolves.
12. **Saved work is respected.** Old props are migrated, never rejected; a still-valid value is never
    silently replaced by a new default; what changed is listed in the panel and the changelog.

## 2. What changes at a glance

| Area | Before | After |
|---|---|---|
| Mark | `style`: color, glow, marker, none; `dimOthers`; `dimUpcomingOnly` | `style`: ink, tint, wash; `restOpacity`; one accent `color`, contrast-corrected |
| Mark motion | instant switches | eased in 5 f, out 10 f with a soft trail; released 0.25 s after the ayah |
| Mark on colour themes | `color` did nothing | ink and wash work everywhere; tint repaints only the ink palette entries, or shows as wash on tajweed themes |
| Lines | `enter` / `exit` (slide-fade, fade, reveal-rtl, none), `scroll` (ease, spring) | `lines`: fade, rise, cut; `tempo`: calm, slow |
| Line timing | lines left up to 1.2 s before their last word ended | late-not-early rule (section 4.3) |
| Window scroll | spring or 15 f ease, anchored at the end | 24 f in-out, anchored at the start, after the last word |
| Intro card | cut to one frame when the first word was early | adds its time; the recitation waits for it |
| Ending | lines exited under the end card | hold 1.5 s, fade 1 s, then the end card dissolves in |
| Translation | Georgia (never loaded), left-aligned, 40 px | EB Garamond 500 (loaded), centred, ≤ 0.5 × Arabic, changes after the ayah ends |
| Labels | Times fallback, pill counter | EB Garamond small caps, Amiri, plain "2 / 3" |
| Legend | a card over the text | a reserved band; the text is laid out around it |
| Background | audio-reactive glow, Ken Burns pans to 1.3, teal gradient | vignette, slow zoom ≤ 1.05, ground-dark gradient |
| Rosettes | solid gold or pink and mint fills | gold line drawings with a vellum fill |
| Page | slide turn, ornate dots, underline, jumping band | dissolve turn, double rule, band cross-fade |
| Looks | 9, mixing palettes and frame shapes | 5 palettes + a separate Format control |

Removed outright from the Studio schema (the renderer keeps its exports; see section 8):
`glow` and `marker` marks, the free `none` style, `dimOthers`, `dimUpcomingOnly`, `enter`, `exit`,
`scroll`, `slide-fade`, `reveal-rtl`, the spring scroll, `background.glow`, the `pan-left` and
`pan-right` Ken Burns, `pageView` `underline`, `ornate` and `slide`, and the looks Classic,
Tajweed light, Night, Black & gold, Sepia, Reel, Square, Karaoke and Study (mapped in 7.4).

## 3. Tokens

All tokens live in one Studio module, `S:schema/tokens.ts` (exported from the package index), and
the motion curves also in the renderer (section 8.1), so code users get the same values.

### 3.1 Colour

**Grounds and inks** (used by the looks; the user can pick any colour, and the guards in 3.1.3
keep it readable).

| Name | Ground | Ink | Contrast | Secondary ink (translation) | Contrast | Metal |
|---|---|---|---|---|---|---|
| Ivory | `#f8f3e6` | `#1c1a16` | 15.7:1 | `#5a554c` | 6.7:1 | `#8c6c26` (rosette) / `#b8913a` (accent) |
| Warm paper (tajweed) | `#fbf7ee` | `#1c1a16` | 16.3:1 | `#5a554c` | 6.9:1 | QUL tajweed colours |
| Charcoal | `#121416` | `#f1eadb` | 15.4:1 | `#b9b1a2` | 8.7:1 | `#d8b56a` |
| Madinah green | `#10241b` | `#eee7d6` | 13.2:1 | `#b5ae9c` | 7.4:1 | `#cfae63` |

Gloss ink: `#6b6458` on ivory (5.3:1), `#8f897d` on charcoal (5.3:1), `#8e978c` on green (5.4:1).

#### 3.1.1 Light or dark ground

`isLightGround(c) = relativeLuminance(c) > 0.35` (WCAG relative luminance). Ivory is 0.90,
charcoal 0.007. Every rule below that differs by ground uses this test on `layout.background`
(for an image or video background: on `layout.color`, inverted, i.e. light ink means dark ground).

#### 3.1.2 `legibleAccent(color, ground)`: the tint colour

Pure function in `S:schema/color.ts`:

1. Convert `color` to OKLCH. Cap chroma at **0.09** (neon yellows become antique gold; a teal stays
   a quiet teal).
2. While `contrast(result, ground) < 5.0`, move L by 0.01 toward the ink side (darker on a light
   ground, lighter on a dark one), keeping hue and the capped chroma. Stop at L 0 or 1.
3. Return the hex.

Resulting values (these are test fixtures):

| `color` | on ivory `#f8f3e6` | on paper `#fbf7ee` | on charcoal `#121416` | on green `#10241b` |
|---|---|---|---|---|
| `#b8913a` (default) | `#806321` (5.1:1) | `#836625` | `#b19353` (6.3:1) | `#b19353` (5.6:1) |
| `#c8a45c` (old default) | `#816321` | | | |
| `#ffd166` (old Karaoke) | `#7d621f` | | | |
| `#d8b56a` | | | `#d4b675` (9.5:1) | |
| `#cfae63` | | | | `#ccaf6e` (7.7:1) |
| `#1f7a8c` (old Study) | `#107183` | | | |

#### 3.1.3 Other colour guards (render time, never written back)

- `washAlpha(ground) = isLightGround(ground) ? 0.10 : 0.13`. The wash colour is `color` with its
  OKLCH chroma capped at 0.09 (no lightness change), painted at that alpha. Never user-set.
- Translation, gloss and overlay colours: if `contrast(c, ground) < 4.5`, use
  `mix(ink, ground, 0.32)` (sRGB mix, 68 % ink) instead.
- `restOpacity` is raised to at least **0.65** when `themeHasTajweedColors(theme)` is true.
- In a line window under the ink mark, the effective neighbour opacity is
  `min(layout.neighbourOpacity, restOpacity − 0.2)`, so neighbour lines always sit below the current
  line's resting words.

#### 3.1.4 The metal

`metalOf(props)`: when `theme` is `custom` and `customTheme.override.frame` is on,
`customTheme.frame`; otherwise `#b8913a` on a light ground and `#d4b46a` on a dark one. Used by the
jadwal (`layout.frame`), the intro hairline and lozenge, the end card's hairline, and MushafPage's
double rule.

### 3.2 Motion

**Curves**

| Token | Curve | Use |
|---|---|---|
| `SOFT` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | arrivals: mark in, ink fill, fade-ins |
| `INOUT` | `cubic-bezier(0.45, 0, 0.55, 1)` | mark out, ayah mark, window scroll, page band |
| `SINE` | `cubic-bezier(0.37, 0, 0.63, 1)` | fade-outs, cards, background zoom |
| `ARRIVE` | `cubic-bezier(0.33, 0, 0.2, 1)` | the 0.12 em rise of an entering line |

Sampled (for tests): `SOFT` over 5 f: 0, .30, .68, .89, .98, 1. `INOUT` over 24 f reaches .003 at
f1, .50 at f12, .997 at f23 (no lurch, no overshoot).

**Durations** (frames at 30 fps; `tempo: 'slow'` multiplies the starred rows by 1.4, rounded)

| Token | calm | slow | |
|---|---|---|---|
| `markIn` (word tint/wash in) | 5 (0.17 s) | 5 | |
| `markOut` (word tint/wash out) | 10 (0.33 s) | 10 | |
| `inkFill` (word rest → full) | 6 (0.20 s) | 6 | |
| `ayahMark` (ayah in or out) * | 14 (0.47 s) | 20 | |
| `lineDissolve` D, one-line mode * | 20 (0.67 s) | 28 | |
| `ayahDissolve` D, MushafAyahText * | 27 (0.90 s) | 38 | |
| `translationDissolve` D * | 18 (0.60 s) | 25 | |
| `scroll`, window * | 24 (0.80 s) | 34 | |
| `windowIn`, first appearance * | 24 (0.80 s) | 34 | |
| `endHold` | 45 (1.5 s) | 45 | |
| `endFade` * | 30 (1.0 s) | 42 | |
| `cardIn` (intro content) * | 24 (0.8 s) | 34 | |
| `cardOut` (intro content) * | 21 (0.7 s) | 30 | |
| `labelChange` (corner number, counter) | 12 (0.4 s) | 12 | |
| `glossOut` / `glossIn` (strip) | 3 / 6 | 3 / 6 | |
| `reveal` (memorise) | 7 (0.24 s) | 7 | |
| `rehide` (memorise blank-all) | 12 (0.4 s) | 12 | |
| `Dmin` (shortest compressed transition) | 10 (0.33 s) | 10 | |

The word marks never scale with tempo: they must stay in sync with the voice.

**The staggered dissolve** (one shape for every text change: lines, ayah text, translation, end
card, page turn). For a duration D frames, from the transition's start frame `t0`:

- outgoing opacity: `1 − SINE(clamp(f / o))`, with `o = round(0.45 · D)`;
- incoming opacity: `SOFT(clamp((f − i) / (D − i)))`, with `i = round(0.30 · D)`.

For D = 20: out over f0–f9, in over f6–f20. Measured: at no frame are both above 0.2; the dimmest
frame (f8) shows 0.03 + 0.17 of ink (a soft dip, never empty). Same property holds for D = 12, 18,
27, 28 and 30 (computed in section 12's unit tests).

### 3.3 Geometry

Sizes follow the renderer: glyph size = `floor(measure × 2500 / 42501)`, line box = `round(2.2 ×
glyph)`.

| Frame | `marginX` | Measure | Glyph | Line box |
|---|---|---|---|---|
| 16:9, 1920×1080 | 190 | 1540 | 90 px | 198 px |
| 9:16, 1080×1920 | 90 | 900 | 52 px | 114 px |
| 1:1, 1080×1080 | 90 | 900 | 52 px | 114 px |
| 4:5, 1080×1350 | 90 | 900 | 52 px | 114 px |

- **Safe area**: 5 % of the short side, i.e. 54 px at every format. Every non-Quran element
  (labels, counter, legend, jadwal, cards' text) is inside it. At 9:16, furniture also stays out of
  the top 12 % (230 px) and bottom 18 % (346 px) where platform buttons sit.
- **Label size** `L = min(0.024 × height, 0.034 × width)`: 26 px at 16:9, 37 px at 9:16, 26 px at
  1:1, 32 px at 4:5.
- **Scale unit** `u = shortSide / 1080` (1 at every format here) for hairline thicknesses.

## 4. The timing model

Pure functions in `S:schema/marks.ts` (new), unit-tested against the bundled Al-Fatihah timings.

### 4.1 Word spans

For every timed word `w` (its first or last recitation, per `highlight.occurrence`):

- `start(w)` = its start time.
- `end(w)` = the start of the next timed word in the same ayah. For the last word of an ayah:
  `release(a) = min(nextAyah.start, ayah.end + 0.25 s)` (the mark lets go in the breath instead of
  holding the last word lit until the next ayah).
- **Anti-flicker**: a word whose span is shorter than 4 frames (0.133 s) gets no tint or wash of its
  own; it is dropped from the span list, and the previous kept word's `end` becomes the dropped
  word's `end`. Its ink still fills.
- A word without a time of its own (the aligner missed it) gets no tint or wash; for ink it counts
  as starting at its ayah's start (the ayah-end rosette at its ayah's end), as today.
- If the timings file has no per-word times at all, `mode: 'word'` behaves as `mode: 'ayah'`.

### 4.2 Emphasis

- Word emphasis `e(w, t) = SOFT(clamp((t − start) / markIn)) × (1 − INOUT(clamp((t − end) /
  markOut)))`. Two neighbouring words are briefly both partly marked: the trail reads as a glide,
  but the mark itself never travels.
- Ayah emphasis `E(a, t) = INOUT(clamp((t − a.start) / ayahMark)) × (1 − INOUT(clamp((t −
  release(a)) / ayahMark)))`.
- Ink fill `k(w, t) = SOFT(clamp((t − start(w)) / inkFill))` (stays 1 once heard).
- No lead: a mark starts at its word's time, never before it.

### 4.3 Transitions: late, never early

For a boundary between an outgoing unit and an incoming one (a printed line or split segment in
one-line mode; a line of the window; an ayah in MushafAyahText; the ayah of a translation; a page):

- `E` = the end of the outgoing unit's last word (its timing `end`; if absent, the next word's
  start; if the unit ends at an ayah end, that ayah's end). If the file has ayah times only and the
  unit ends mid-ayah, `E = F`.
- `F` = the start of the incoming unit's first word.
- `D` = the element's dissolve or scroll duration (3.2).
- `D_eff = clamp(F − E, Dmin, D)` for dissolves; `D_eff = D` for the window scroll.
- **Start** `t0 = max(E, F − leadInSeconds − D_eff)`.

So a change never starts before the outgoing unit has been recited. With a pause, the incoming unit
is settled `leadInSeconds` before its first word. With continuous recitation (Hadr), the change
takes `Dmin` (10 f) and overlaps the incoming first word; the incoming text is at 0.5 opacity by
its 6th frame. Late is accepted; early is a bug (test: for every boundary, `t0 ≥ E`).

## 5. Option groups

Conventions kept from the codebase (`S:schema/index.ts` header and
`test/unit/schema/descriptions.test.ts`):

- Plain `z.object` / `z.enum` / `z.number`, no `z.preprocess` and no `.default()` in the schemas
  the Props sidebar sees. Defaults are the exported `default*` objects. Migration is a separate
  function (section 7).
- A colour field is a bare `zColor()` with no `.describe()` (the sidebar draws its picker only
  then); what it does goes in its doc comment.
- Every description is at most 200 characters; where two options overlap it says which wins.

### 5.1 `highlight`: what follows the recitation and how it is marked

Field names `mode`, `style`, `color` and `occurrence` are kept (smallest diff, Laravel payloads keep
their keys); the enum values of `style` change; `restOpacity` replaces `dimOthers` and
`dimUpcomingOnly`.

```ts
export const HIGHLIGHT_STYLES = ['ink', 'tint', 'wash'] as const;
/** The `style` values saved before this design; `migrateHighlight()` maps them. */
export const LEGACY_HIGHLIGHT_STYLES = ['color', 'glow', 'marker', 'none'] as const;

export const highlightSchema = z.object({
  mode: z
    .enum(['word', 'ayah', 'none'])
    .describe(
      'What follows the recitation: each word, the whole ayah, or nothing. Word falls back to ayah when the timings have no word times',
    ),
  style: z
    .enum(HIGHLIGHT_STYLES)
    .describe(
      'One mark: ink (text still to come rests lighter), tint (the ink turns the accent; a wash on tajweed themes) or wash (a faint band behind). Ignored when mode is none',
    ),
  /**
   * The accent of tint and wash. A tint is darkened or lightened until it reads at 5:1 on the page
   * (`legibleAccent()`), and its chroma is capped so a bright colour becomes antique gold; a wash
   * paints it at a fixed faint strength. Ignored by ink.
   */
  color: zColor(),
  restOpacity: z
    .number()
    .min(0.5)
    .max(0.85)
    .step(0.05)
    .describe('Ink only: opacity of the words not yet marked on the current line (at least 0.65 on tajweed themes)'),
  occurrence: z.enum(['first', 'last']).describe('For a repeated word: follow its first or its last recitation'),
});

export const defaultHighlight: Highlight = {
  mode: 'word',
  style: 'ink',
  color: '#b8913a',
  restOpacity: 0.6,
  occurrence: 'first',
};
```

`memorizeSchema.mode`'s description changes its last sentence to "Its hiding wins over
highlight.restOpacity" (and the test regex with it).

#### 5.1.1 `style: 'ink'` (default), Arabic label مداد

Opacity only, so it works on every theme, the tajweed and `p1`–`p5` palettes included.

- `mode: 'word'`: on the current line, a word not yet heard is at `restOpacity`; it fills to 1 as it
  is recited: `opacity = rest + (1 − rest) · k(w, t)` (4.2). Heard words stay at 1. The frontier
  between full and resting ink is the cue; the current word has no other decoration.
- `mode: 'ayah'`: every word of the current ayah (its rosette included) is at 1; every other ayah on
  the line, heard or to come, rests: `opacity = rest + (1 − rest) · E(ayah, t)`.
- **Which line is current** is geometric, so nothing jumps during a scroll: with the renderer's
  `linePosition` p (section 8.3; 0 in the centre slot, −1 one slot above, +1 below, and 0 for every
  line in one-line mode), the word's final opacity is `1 − (1 − inkOpacity) · (1 − clamp01(|p|))`.
  A neighbour line therefore shows its words at 1 and only the window's (clamped) neighbour
  opacity: final opacity is never `rest × neighbourOpacity`.
- Header lines (surah name, basmalah) are never dimmed by ink.

#### 5.1.2 `style: 'tint'`, Arabic label تذهيب

The current word's (or ayah's) ink becomes `legibleAccent(color, ground)`, mixed by the emphasis
`e` (word) or `E` (ayah). No other word is dimmed. The ayah-end rosette (`kind: 'end'`) is never
tinted: it keeps its own palette.

Which path paints it, decided per line by `tintPath(theme)`:

1. **The theme's ink follows `currentColor`** (`plain`, `normal`, and `custom` on base `normal`
   with `override.ink` off: the Mushaf and Learning looks): CSS `color =
   interpolateColors(e, [0, 1], [layout.color, tint])`.
2. **The theme has tajweed colours** (`themeHasTajweedColors(theme)`: `light`, `dark`, `sepia`,
   `p1`, `p2`, or custom palettes built on them that keep the rules apart): the tint is **shown as a
   wash** (5.1.3) with the same `color`. The saved value is kept; the panel shows "Shown as a wash:
   a tint would repaint the tajweed colours" (section 10).
3. **Any other fixed palette** (`black`, `p3`–`p5`, a custom palette whose ink is overridden): only
   the theme's ink CPAL entries (`colorParts.ink`) are repainted, through the renderer's tint
   palettes (section 8.4). `font-palette` is quantised to 5 steps: amount 0 (the row's palette),
   0.25, 0.5, 0.75, 1, nearest to `e`.

#### 5.1.3 `style: 'wash'`, Arabic label ظلّ

A faint, soft-ended band behind the word, or behind the ayah's run of words on each line,
painted as a paint-only `background` on the word spans (allowed by the `wordStyle` contract; the
printed words abut with no gaps, `R:component/styles.ts:65`, so the bands join into one run with
no seam).

- **Colour** `C = rgba(color with chroma ≤ 0.09, washAlpha(ground) × e × f)` where `e` is `e(w, t)`
  in word mode and `E(a, t)` in ayah mode, and `f` is the neighbour factor (5.1.4). Hard cap 0.16.
- **Vertical profile** (each word span is a 2.2 em line box): a band 1.55 em tall centred at 54 %
  of the box, feathered 0.22 em at top and bottom. It covers the letter bodies and vowel marks and
  keeps 0.32 em clear of the lines above and below.
- **Ends**: the first and last word of a run on its line (the rightmost and leftmost in RTL; a lone
  word in word mode is both) get a soft half-ellipse cap of width `c = min(0.35em, 50%)` on their
  outer side, so the band is never a box.
- **Ayah mode** includes the ayah-end rosette. A run that crosses a line break is one band per line.
- **Motion**: in word mode the outgoing band fades out (`markOut`) while the incoming one fades in
  (`markIn`); the band never slides between words. It holds through pauses inside an ayah and lets
  go 0.25 s after the ayah ends (4.1).

Exact CSS (S:schema/wash.ts, `washStyle({color, alpha, cap})`; `cap` is `'start' | 'end' | 'both'
| 'none'`, where `start` is the right edge in RTL):

```ts
const band = (C: string) =>
  `linear-gradient(to bottom, transparent 0, ${C} 0.22em, ${C} calc(100% - 0.22em), transparent 100%)`;
const capAt = (C: string, inner: 'left' | 'right') =>
  `radial-gradient(farthest-side at ${inner} center, ${C} 72%, transparent 100%)`;
// cap 'none': one layer
{backgroundImage: band(C), backgroundSize: '100% 1.55em',
 backgroundPosition: 'center 54%', backgroundRepeat: 'no-repeat'}
// cap 'start' (outer edge on the right): cap tile at the right, body shortened by c
{backgroundImage: `${capAt(C, 'left')}, ${band(C)}`,
 backgroundSize: `${c} 1.55em, calc(100% - ${c}) 1.55em`,
 backgroundPosition: 'right 54%, left 54%', backgroundRepeat: 'no-repeat'}
// cap 'end' mirrors it (capAt(C, 'right') at the left); 'both' has three layers:
// right cap, body calc(100% - 2 * c) at center, left cap.
```

The cap tile's ellipse spans its full width and 1.55 em height; the `72 %` stop makes its solid
core end where the body's feather begins, so cap and body meet without a notch.

#### 5.1.4 Neighbour lines carry no mark

In a window, tint and wash are multiplied by `f = p < 0 ? clamp01(1 + p) : 1`: a line leaving
upward loses its mark as it leaves the centre slot, and the incoming line's first word is marked at
full strength while it scrolls in. Because the scroll starts only after the outgoing line's last
word (4.3), that word's mark is already fading by then. A marked word never sits in the dimmed
slot above.

#### 5.1.5 Other marks that follow the same tokens

- **Interlinear gloss**: labels rest at 0.7 of the gloss ink; the active word's label goes to 1 and
  to `legibleAccent(color, ground)` with the word emphasis `e`. Labels shrink to 70 % to fit their
  word, then wrap onto a second row at line-height 1.0; never an ellipsis. The gloss row grows to
  two rows on a line only where a label needs it.
- **Gloss strip**: the text changes at each kept word span (4.1): out over `glossOut` (3 f), in over
  `glossIn` (6 f) starting 2 f after the change.
- **Review (doubt underline)**: unchanged, Studio preview only, never in a render.

### 5.2 `animation`: how lines give way (panel label "Motion" / الحركة)

```ts
export const LINE_MOTIONS = ['fade', 'rise', 'cut'] as const;
export const TEMPOS = ['calm', 'slow'] as const;
/** @deprecated The `enter` / `exit` values saved before this design; `migrateAnimation()` maps them. */
export const ENTRANCES = ['slide-fade', 'fade', 'reveal-rtl', 'none'] as const;

export const animationSchema = z.object({
  lines: z
    .enum(LINE_MOTIONS)
    .describe(
      'How a line or ayah gives way to the next, always after its last word: a dissolve, a dissolve with a slight rise, or a cut',
    ),
  tempo: z.enum(TEMPOS).describe('Pace of every change: calm, or slow (1.4× longer). The word mark keeps its pace'),
  leadInSeconds: z
    .number()
    .min(0)
    .max(2)
    .step(0.1)
    .describe('Longest a new line waits, settled, before its first word (it never comes before the last line ends)'),
});

export const defaultAnimation: Animation = {lines: 'fade', tempo: 'calm', leadInSeconds: 0.4};
```

`S:unicode/schema.ts`'s `ayahAnimationSchema` becomes `animationSchema` itself (same three fields).

**One-line mode** (`visibleLines: 0`): each line is its own `<Sequence>`; consecutive Sequences
overlap so the staggered dissolve (3.2) runs between them, with D = `lineDissolve`, compressed to
`D_eff` and started at `t0` (4.3):

- outgoing Sequence ends at `t0 + round(0.45 · D_eff)`, with an exit of `fade()` (exiting side
  faded) on `exitTiming({durationInFrames: round(0.45 · D_eff), easing: SINE})`;
- incoming Sequence starts at `t0 + round(0.30 · D_eff)`, with an entrance of `fade()` on
  `enterTiming({durationInFrames: D_eff − round(0.30 · D_eff), easing: SOFT})`;
- `rise`: the entrance is the renderer's new `fadeRise({distance})` (section 8.2) with
  `distance = min(12, round(0.12 × glyph))` px (11 px at 16:9, 6 px at 9:16); translate on
  `ARRIVE`, opacity on `SOFT`. The exiting line never moves;
- `cut`: no presentations; the incoming Sequence starts at `t0` and the outgoing ends there. Marks
  still ease (a flickering mark is worse than a soft one). This is the reduce-motion path.

**Window mode** (`visibleLines` 1–7): lines never fade individually. One track, scrolled one line
box per step by `scrollPosition` with `anchor: 'start'` (already supported, `R:animation/
scroll-position.ts`) and `scrollTiming = enterTiming({durationInFrames: scroll, easing: INOUT})`.
`steps[j] = max(E(j−1), F(j) − leadInSeconds − scroll)` in frames. Steps closer than one scroll
blend, as the renderer already does. `fade`, `rise` and `cut` affect only the window's own entrance
and exit; with `cut` the scroll duration is 0 (a jump).

- First appearance: the whole window fades in over `windowIn` on `SINE` (with `rise`: plus the
  rise), starting at `max(0, F(0) − leadInSeconds − windowIn)`, or at the end of the intro card.
- End: the window holds `endHold` after the last word's end, then fades out over `endFade` on
  `SINE`. This now happens before the end card, not under it.
- Memorise repeats scroll back with the same token.

**MushafAyahText**: one ayah at a time; the staggered dissolve with D = `ayahDissolve` at each ayah
boundary, timed by 4.3 with `E` = the ayah's last word end. `rise` moves `min(12, round(0.12 ×
fontSize))` px (12 px at 96 px). The translation inside the block moves with it, never separately.

**MushafPassage** (no audio): `t0` of a boundary is the incoming line's hold start; D as above. The
window's `steps` are the line start frames with `anchor: 'start'`.

### 5.3 `layout`

```ts
export const LAYOUT_FRAMES = ['none', 'hairline'] as const;

// changed fields only; the others are as today
neighbourOpacity: z
  .number()
  .min(0.15)
  .max(0.5)
  .step(0.05)
  .describe('Opacity of the lines around the current one (under ink, kept 0.2 below restOpacity)'),
frame: z
  .enum(LAYOUT_FRAMES)
  .describe('A thin gold double rule inside the safe area, as on a printed page (none: no border)'),
```

`frame` is added after `color`. `marginX` keeps its schema (0–400, step 10); its description
becomes 'Side margins in px (about 10 % of the width reads best at 16:9)'.

```ts
export const defaultLayout: Layout = {
  aspect: '16:9',
  visibleLines: 3,
  neighbourOpacity: 0.3,
  marginX: 190,
  background: '#f8f3e6',
  color: '#1c1a16',
  backgroundImage: '',
  verticalAlign: 0.5,
  offsetY: 0,
  frame: 'none',
};
```

MushafAyahText's layout default keeps `aspect: '9:16'`, `marginX: 90`, background `#121416`,
color `#f1eadb`.

**The jadwal** (`frame: 'hairline'`): two rectangular rules, square corners, no corner pieces,
inset at the safe area (54 px): the outer 2 u px, then a 6 u px gap, then the inner 1 u px, in
`metalOf(props)` at opacity 0.55 on a light ground and 0.45 on a dark one. Drawn above the
background and below everything else.

### 5.4 `theme` and `customTheme`

The enum and fields are unchanged. New defaults for new projects (Recitation, Page, Passage,
Thumbnail): `theme: 'custom'` with

```ts
export const defaultCustomTheme: CustomTheme = {
  base: 'normal',
  ink: '#1c1a16',
  silent: '#8a8478',
  rules: '#1b6f3f',
  frame: '#8c6c26',     // rosette outline and numeral: gold line (4.4:1 on ivory)
  accent: '#efe3c4',    // rosette petals: vellum, a shade off the ground
  detail: '#8c6c26',    // the jewel: gold
  background: '#f8f3e6', // the number disc: the ground (removes the mint centre)
  override: {ink: false, silent: false, rules: false, frame: true, accent: true, detail: true, background: true},
};
```

This makes every rosette a gold line drawing on vellum, never a solid coin and never the pink and
mint fills of `normal`. The part mapping (which CPAL entries are outline and which are fill) must be
confirmed by still V6 (section 12); if the parts turn out swapped, swap `frame` and `accent` values
in every look before freezing.

The panel groups the theme select as *Mushaf* (`custom`), *Tajweed* (`light`, `dark`, `sepia`),
*Advanced* (`plain`, `normal`, `black`, `p1`–`p5`); the schema enum order is unchanged.

### 5.5 `text`: translation of the meanings and gloss

Changed fields only:

```ts
translationFont: z
  .string()
  .describe('Single translation: “auto” (EB Garamond for Latin scripts, the language’s own font otherwise) or a CSS font family (ignored once translations has a layer)'),
translationSize: z
  .number().int().min(12).max(120)
  .describe('Single translation: size in px, never drawn larger than half the Arabic (ignored once translations has a layer)'),
glossFont: z
  .string()
  .describe('MushafRecitation only: “auto” (EB Garamond italic) or a CSS font family of the gloss'),
glossSize: z
  .number().int().min(12).max(120)
  .describe('MushafRecitation only: gloss size in px (interlinear: at most 0.3 of the Arabic)'),
```

`translationLayerSchema.fontSize` description: 'Size in px (never drawn larger than half the
Arabic)'.

Defaults: `translationFont: 'auto'`, `translationSize: 36`, `translationColor: '#5a554c'`,
`glossFont: 'auto'`, `glossSize: 30`, `glossColor: '#6b6458'`, `glossPosition: 'strip'`;
`defaultTranslationLayer` = `{file: '', font: 'auto', fontSize: 36, color: '#5a554c'}`.
MushafAyahText: `translationColor: '#b9b1a2'`, `translationSize: 40`.

**Fonts actually loaded.** `S:content/script-fonts.ts`: the `latin` script's families become
`['EB Garamond', 'Noto Serif', 'Lora']` (EB Garamond covers Latin, Latin-ext, Cyrillic, Greek and
Vietnamese). A new `useStudioFonts()` (S:compositions/fonts.ts) loads, through the existing
`useWebFonts()` and its `delayRender` gate, EB Garamond 400, 400 italic, 500 and Amiri 400, and is
used by every composition. `'auto'` resolves to EB Garamond 500 for the translation, EB Garamond
400 italic for the gloss, EB Garamond 500 for Latin labels and Amiri 400 for Arabic labels. Other
scripts keep their per-language fonts.

**Translation layout** (MushafRecitation, MushafPassage, MushafPage's `below`; AyahText's block):

- Drawn size `s = min(size, 0.5 × glyph)`: 36 px at 16:9 stays 36 (cap 45); 36 at 9:16 becomes 26
  (cap 26). AyahText's cap is `0.5 × fontSize` (48).
- Centred on the Arabic's axis; width `min(0.72 × measure, 60ch)`; `text-wrap: balance`;
  line-height 1.45; weight 500.
- At most 2 lines. If the ayah's translation needs more at `s`, it is drawn at `0.85 s`; if still
  more, it may take 3 or 4 lines at `0.85 s` and the block grows. It is never truncated, never split
  into timed chunks. Measured with the loaded font on a canvas 2D context after the font gate.
- `below`: its top is `0.4 × lineBox` under the window block; `above`: its bottom is the same gap
  over it, mirrored (no longer in the top-left corner).
- Stacked layers: 0.5 em apart, separated by a centred hairline 1 u px tall, `0.12 × measure` wide,
  in the translation ink at 0.3 opacity.
- It changes at the ayah boundary by the staggered dissolve, `translationDissolve`, timed by 4.3
  with `E` = the outgoing ayah's last word end (not at the next ayah's first word).
- The translation is credited once as "Translation of the meanings · <name>" on the intro card, or
  in the end card's credits when there is no intro card.

### 5.6 `overlay`: intro card and corner label

Changed fields only:

```ts
introSeconds: z
  .number().min(2).max(6).step(0.5)
  .describe('Seconds the intro card stays; the recitation starts after it (the video grows to fit)'),
font: z
  .string()
  .describe('“auto”: EB Garamond small caps, Amiri for Arabic; or a CSS font family for the title texts'),
cornerSize: z
  .number().int().min(0).max(60)
  .describe('Size of the corner label in px (0: auto, 2.4 % of the frame height)'),
```

The overlay group's doc comment changes "Nothing is shifted for the card" to "The card adds its
seconds: the recording starts after it". Defaults: `introSeconds: 3`, `color: '#5a554c'`, `font:
'auto'`, `cornerSize: 0`, `corner: 'top-right'`.

**The intro adds time.** In `calculateMetadata()`, when `title` is `intro` or `both`:
`introDelaySeconds = max(0, introSeconds + cardIn/fps + leadInSeconds − firstWordStart)` (cardIn in
seconds: 0.8 calm, 1.13 slow). It is applied in one place: `resolved.timings` are shifted by it
(after the existing `audioOffsetSeconds` skip), the audio `<Sequence>` starts at it, the duration
grows by it, and `resolved.introDelaySeconds` is exposed so a host (the Laravel side) can map video
time to recording time. Memorise clips and header spacing read the shifted timings.

Timeline: frame 0 is the bare ground (never an empty-looking still: the ground is the page colour);
the card's content fades in over `cardIn` on `SINE` from 0.2 s; holds; fades out over `cardOut`
ending at `introSeconds`; the lines (or window) start their entrance at `introSeconds`.

Card layout (centred, on the ground):

1. The framed surah name (`<MushafSurahName framed>`), 46 % of the measure wide at 16:9, 72 % at
   the other formats, centred at 44 % of the height, in the theme's colours.
2. `0.9 × lineBox` below it: the hairline, `0.18 × measure` wide, 1.5 u px, metal at 0.7, with a
   7 u px lozenge (a filled square rotated 45°) at its centre.
3. The Arabic range in Amiri at `1.1 L`, ink at 0.75, in an RTL isolate (`dir="rtl"`, wrapped in
   U+2067…U+2069): «الآيات ٢–٧», or «الآية ٥» for one ayah. Arabic-Indic digits. In RTL the first
   ayah is the rightmost numeral, which is how an Arabic reader reads it. The Latin range is not
   repeated on this line.
4. `Āyāt 2–7` (or `Āyah 5`) in EB Garamond 500 all-small-caps, letter-spacing 0.08 em, at `L`, 60 %
   ink.
5. When set: the reciter's name, EB Garamond italic at `0.95 L`, 55 % ink.
6. When a translation is shown: "Translation of the meanings · Saheeh International" at `0.8 L`,
   50 % ink.

**Corner label**: `AL-FĀTIḤAH · 3` (the surah's transliteration and the ayah being heard) in EB
Garamond 500 all-small-caps, letter-spacing 0.08 em, tabular figures, size `cornerSize || L`, at
the label colour's 60 %, in the chosen corner inside the safe area (at 9:16 below the top 12 % or
above the bottom 18 %). The reciter is no longer joined in. It fades in over 24 f starting
`introSeconds + 0.4 s` (0.5 s without a card); only the number changes, by a `labelChange`
staggered dissolve at the translation's `t0`. Over an image or video background it gets
`text-shadow: 0 0 0.6em <ground at 0.5>`; on a flat ground nothing.

### 5.7 `memorize`

Fields unchanged; visuals reworked (`S:memorize/visibility.ts`, `RepeatCounter.tsx`):

- A hidden word reveals 0 → 1 over `reveal` (7 f) on `SOFT` at its own start, never early.
- The `first-letters` ghost on printed lines: 0.14 on a light ground, 0.20 on a dark one (was 0.12);
  it reveals with the same fade.
- `blank-all`: a word heard in the previous play fades back to hidden over `rehide` (12 f) when the
  next play starts.
- Order: memorisation decides hidden, ghost or shown; ink applies to shown words; tint and wash on
  top. Memorisation's hiding wins.
- Counter: plain text `2 / 3` in the label style (EB Garamond small caps, tabular figures, size L,
  60 % ink), no pill, in the corner opposite the corner label (top-left when there is no label),
  inside the safe area. It changes by a `labelChange` dissolve at the clip boundary.

### 5.8 `legend`

```ts
position: z
  .enum(OVERLAY_CORNERS)
  .describe('Band of the legend: top-* above the lines, bottom-* below them. Space is reserved, so it never covers the text'),
orientation: z
  .enum(['row', 'column'])
  .describe('Ignored: the legend is one centred row in its band (kept for saved props)'),
```

Default `{show: false, position: 'bottom-left', orientation: 'row', names: 'both'}`.

The legend is a single centred row in a reserved band: swatches are 0.5 em circles, names in EB
Garamond small caps (English) and Amiri (Arabic) at `0.8 L`, 1 em between entries, each entry laid
out as one unbreakable unit (`white-space: nowrap`), no card or background, 60 % ink. The band's
height (`1.6 × 0.8 L`, wrapped rows included) plus `0.5 × lineBox` is subtracted from the area the
lines (or the page) are fitted and centred in. At 9:16 the bottom band sits above the bottom 18 %.
Drawn only when the theme has tajweed colours, as today.

### 5.9 `endCard`

Fields unchanged. Rendering (`S:content/EndCard.tsx`):

- On the same ground (no colour jump). It starts after the lines' `endFade`; its content dissolves
  in over 30 f on `SOFT`; it holds `seconds`; its last 1.0 s fades to the ground on `SINE`.
- Title: the framed surah-name glyph at 30 % of the measure (replaces the system-font Arabic), then
  the hairline and lozenge as on the intro card. The title block appears once (fixes the doubled
  chapter-info title).
- Body (tafsir or chapter info): EB Garamond 400 at `0.95 L`, 75 % ink, at most 62 ch per line,
  line-height 1.5, `text-wrap: pretty`.
- Credits (`attributionLines()`, with "Translation of the meanings · …" when a translation was
  shown and there was no intro card): small caps at `0.75 L`, 55 % ink.

### 5.10 `background`

```ts
export const BACKGROUND_KINDS = ['color', 'image', 'video', 'gradient'] as const;
export const KEN_BURNS = ['none', 'slow-zoom'] as const;
/** @deprecated The values saved before this design; `migrateBackground()` maps them to slow-zoom. */
export const LEGACY_KEN_BURNS = ['pan-left', 'pan-right'] as const;

export const backgroundSchema = z.object({
  kind, color, src, fit, videoSeconds, blur,   // unchanged
  dim: z
    .number().min(0).max(1).step(0.05)
    .describe('Darken the background (image and video keep at least 0.45 under light ink, a 0.55 page veil under dark ink)'),
  vignette: z
    .number().min(0).max(0.4).step(0.02)
    .describe('Soft darkening toward the edges, like the fall-off of a page (0: none)'),
  kenBurns: z.enum(KEN_BURNS).describe('Image or video: a very slow zoom over the whole video (none: still)'),
  kenBurnsScale: z
    .number().min(1).max(1.05).step(0.01)
    .describe('Image or video: the zoom at the end of slow-zoom (at most 1.05)'),
  gradient: gradientSchema.describe('Gradient: its two colours and direction'),
});

export const defaultBackground: Background = {
  kind: 'color', color: '#f8f3e6', src: '', fit: 'cover', videoSeconds: 0, blur: 0, dim: 0,
  vignette: 0, kenBurns: 'none', kenBurnsScale: 1.04,
  gradient: {from: '#14191d', to: '#0b0e10', angle: 180},
};
```

`glow` is removed from the group. `glowSchema` stays exported, `@deprecated`, unused, until the
next breaking release. Nothing reacts to the audio level any more; `calculateMetadata()` skips the
loudness analysis unless something else needs it (`S:compositions/extras.ts:129`).

- **Vignette** (`v > 0`): a layer above the background,
  `radial-gradient(ellipse 120% 100% at 50% 48%, transparent 55%, rgba(R, G, B, v) 100%)`, where RGB
  is black on a dark ground and the ground with OKLCH L − 0.12 on a light one (a warm page edge).
  Over it, an SVG `feTurbulence` noise layer (baseFrequency 0.9, one octave, fixed seed 7) at 1.5 %
  opacity dithers the gradient against banding at video bitrates. Deterministic.
- **Dim floor** (image and video): with light ink (`luminance(layout.color) > 0.5`) a black layer
  at `max(dim, 0.45)`; with dark ink a layer of `layout.background` at `max(dim, 0.55)`. The color
  and gradient kinds use `dim` as set.
- **Slow zoom**: scale from 1 to `kenBurnsScale` over the whole video on `SINE`, centred.
- The README's background section gains the guidance: abstract, sky, water or landscape; no people,
  faces or animals in focus; nothing underfoot (floors, roads, carpets); no music or sound effects
  with the recitation.

### 5.11 `pageView` (MushafPage)

```ts
export const LINE_HIGHLIGHTS = ['none', 'band'] as const;
export const PAGE_FRAMES = ['none', 'simple'] as const;
export const PAGE_TURNS = ['cut', 'fade'] as const;

lineHighlight: z
  .enum(LINE_HIGHLIGHTS)
  .describe('How the line being recited is marked: a faint band behind it (it wins over highlight.style on the page), or none'),
/** The band's colour; it is painted at a fixed faint strength (its own alpha is ignored). */
lineHighlightColor: zColor(),
dimOtherLines: z.number().min(0.5).max(1).step(0.05)
  .describe('Opacity of the other lines (1: none; at least 0.5)'),
frame: z.enum(PAGE_FRAMES).describe('Page border: a thin double rule in the rosettes’ gold, or none'),
turn: z.enum(PAGE_TURNS).describe('How the page changes, after its last word: a dissolve or a cut'),
turnSeconds: z.number().min(0.6).max(1.5).step(0.1).describe('Seconds a page dissolve takes'),
```

Defaults: `{lineHighlight: 'band', lineHighlightColor: '#b8913a', dimOtherLines: 1, frame:
'simple', pageNumber: true, turn: 'fade', turnSeconds: 0.9}`.

- **Band**: the colour's RGB (chroma ≤ 0.09) at `washAlpha(ground)`, radius 0.3 em. Between lines
  it cross-fades: old band out over `markOut` on `INOUT`, new band in over `markIn` on `SOFT`, at the
  new line's first word. It no longer jumps.
- With `lineHighlight: 'band'` the band is the page's one mark: `highlight.style` is not painted on
  the page. With `'none'`, `highlight` marks words as in 5.1.
- Words outside the followed ayahs rest at 0.5 (was 0.35).
- **Turn** `fade`: the staggered dissolve with D = `turnSeconds`, timed by 4.3 (pages end on an ayah,
  so it lands in the breath). `cut` changes at `t0`.
- **Frame** `simple`: the double rule (outer 0.08 em, inner 0.04 em) in `metalOf(props)`.
- Page number in Amiri (loaded) at 0.6 em, 60 % ink.
- Fit: at 16:9 the page is scaled to 92 % of the frame height; at 9:16 to 84 % of the width.

### 5.12 MushafAyahText specifics

- No theme: tint is always CSS colour; wash is drawn on each word span. Words become `display:
  inline-block` so the span is the 1.9 em line box; band geometry `100% 1.35em` at 55 %, same
  feather and caps.
- `mode: 'ayah'` marks nothing visible (the ayah on screen is the ayah being recited), ink included.
- `wordSpacing` 0.25 em → 0.1 em; the block gets `text-wrap: balance` and a width of 78 % of the
  frame, so no word is left alone on the last line.

### 5.13 Thumbnail, slots, template example

- MushafThumbnail uses the new theme defaults and the loaded fonts; no motion.
- Slot schemas inherit every group change; slot resolvers call `migrateMushafProps()` (section 7).
- `apps/mushaf-studio/src/MushafInTemplate.tsx` (the example template): its frosted-glass card is
  replaced by a plain safe-area block with no fill and no border, and its `#f2c14e` highlight by the
  default look.

## 6. Looks and the Format control

### 6.1 Rules

- A look is ground + ink + one metal + one mark. It sets only style fields; never content, aspect,
  `visibleLines`, `leadInSeconds`, or the position fields (`LOOK_POSITION_FIELDS`, unchanged).
- `LOOK_GROUPS = ['theme', 'customTheme', 'layout', 'animation', 'highlight', 'text', 'overlay',
  'legend', 'background']`. `MushafLookPatch` gains `overlay?: Partial<Pick<Overlay, 'color' |
  'font'>>`, `legend?: Partial<Pick<Legend, 'show' | 'position' | 'names'>>` and `background?:
  Partial<Pick<Background, 'color' | 'vignette'>>`.
- `MushafLook` gains `nameAr: string` and `descriptionAr: string`.
- `lookPatchFor()` keeps skipping fields a composition does not have (AyahText has no theme or
  legend; Passage no highlight).

### 6.2 The five looks

Shared by every look unless its row says otherwise: `animation.lines: 'fade'`, `text.translationFont:
'auto'`, `text.glossFont: 'auto'`, `overlay.font: 'auto'`, `layout.backgroundImage: ''`, and
`customTheme.override = {ink: false, silent: false, rules: false, frame: true, accent: true, detail:
true, background: true}` with `base: 'normal'` wherever `theme` is `custom`.

**1. Mushaf** · «مصحف» · id `mushaf` · applies: recitation, ayah-text, passage. The default:
`default*` objects equal this look at 16:9.
EN: "A printed Madinah page: ivory paper, gold-line rosettes, the ink filling in behind the
reciter." AR: «صفحة مصحف المدينة المطبوع: ورقٌ عاجيّ، وزخارف بخطّ الذهب، والمداد يكتمل خلف القارئ.»

| Group | Values |
|---|---|
| theme | `custom` |
| customTheme | frame `#8c6c26`, accent `#efe3c4`, detail `#8c6c26`, background `#f8f3e6` |
| layout | background `#f8f3e6`, color `#1c1a16`, neighbourOpacity 0.3, frame `none` |
| animation | lines `fade`, tempo `calm` |
| highlight | mode `word`, style `ink`, color `#b8913a`, restOpacity 0.6 |
| text | translationColor `#5a554c`, glossColor `#6b6458` |
| overlay | color `#5a554c` |
| background | color `#f8f3e6`, vignette 0 |

**2. Haram night** · «ليل الحرم» · id `haram-night` · applies: recitation, ayah-text, passage.
EN: "Warm ivory on charcoal, the ayah held in a faint gold band, slow and still." AR: «عاجيّ دافئ على
فحميّ، والآية في شريطٍ ذهبيّ خافت، بهدوء وسكون.»

| Group | Values |
|---|---|
| theme | `custom` |
| customTheme | frame `#d8b56a`, accent `#1a1d20`, detail `#d8b56a`, background `#121416` |
| layout | background `#121416`, color `#f1eadb`, neighbourOpacity 0.25, frame `none` |
| animation | lines `fade`, tempo `slow` |
| highlight | mode `ayah`, style `wash`, color `#d8b56a`, restOpacity 0.6 |
| text | translationColor `#b9b1a2`, glossColor `#8f897d` |
| overlay | color `#b9b1a2` |
| background | color `#121416`, vignette 0.22 |

**3. Madinah green** · «أخضر المدينة» · id `madinah-green` · applies: recitation, ayah-text,
passage.
EN: "Ivory on the deep green of the Prophet's Mosque, inside a thin gold rule; the ayah followed in
ink." AR: «عاجيّ على الأخضر العميق داخل إطارٍ ذهبيّ رفيع، والآية تُتابَع بالمداد.»

| Group | Values |
|---|---|
| theme | `custom` |
| customTheme | frame `#cfae63`, accent `#163225`, detail `#cfae63`, background `#10241b` |
| layout | background `#10241b`, color `#eee7d6`, neighbourOpacity 0.25, frame `hairline` |
| animation | lines `fade`, tempo `calm` |
| highlight | mode `ayah`, style `ink`, color `#cfae63`, restOpacity 0.6 |
| text | translationColor `#b5ae9c`, glossColor `#8e978c` |
| overlay | color `#b5ae9c` |
| background | color `#10241b`, vignette 0.2 |

**4. Tajweed** · «تجويد» · id `tajweed` · applies: recitation, passage.
EN: "The tajweed colours untouched on warm paper; the words still to come rest lighter; the legend in
its own band." AR: «ألوان التجويد كما هي على ورقٍ دافئ، والكلمات القادمة أخفّ، ودليل الألوان في
شريطه.»

| Group | Values |
|---|---|
| theme | `light` (customTheme untouched) |
| layout | background `#fbf7ee`, color `#1c1a16`, neighbourOpacity 0.3, frame `none` |
| animation | lines `fade`, tempo `calm` |
| highlight | mode `word`, style `ink`, color `#b8913a`, restOpacity 0.7 |
| text | translationColor `#5a554c`, glossColor `#6b6458` |
| overlay | color `#5a554c` |
| legend | show `true`, position `bottom-left`, names `both` |
| background | color `#fbf7ee`, vignette 0 |

**5. Learning** · «تعلّم» · id `learning` · applies: recitation, passage.
EN: "For study: each word turns antique gold as it is recited, with its meaning beneath it." AR:
«للدراسة: تتلوّن كلّ كلمة بالذهبيّ العتيق عند تلاوتها، ومعناها تحتها.»

| Group | Values |
|---|---|
| theme | `custom` |
| customTheme | as Mushaf |
| layout | background `#f8f3e6`, color `#1c1a16`, neighbourOpacity 0.4, frame `none` |
| animation | lines `fade`, tempo `calm` |
| highlight | mode `word`, style `tint`, color `#b8913a` (drawn `#806321`), restOpacity 0.6 |
| text | translationPosition `below`, glossPosition `interlinear`, translationColor `#4a463e` (8.5:1), glossColor `#6b6458` |
| overlay | color `#5a554c` |
| background | color `#f8f3e6`, vignette 0 |

### 6.3 Format (separate control)

`MUSHAF_FORMATS` and `applyFormat(props, formatId)` in `S:presets/index.ts`. A format sets
`layout.aspect`, and sets `layout.marginX` and `layout.verticalAlign` only while they still hold the
previous format's recommended values (so a position the user chose is kept). It never sets
`visibleLines` or anything a look sets, so look and format commute.

| id | Label EN / AR | aspect | marginX | verticalAlign |
|---|---|---|---|---|
| `landscape` | Landscape / أفقي | `16:9` | 190 | 0.5 |
| `vertical` | Vertical / عمودي | `9:16` | 90 | 0.45 |
| `square` | Square / مربّع | `1:1` | 90 | 0.48 |
| `portrait` | Portrait / طولي | `4:5` | 90 | 0.47 |

"Previous format" is the format whose aspect equals the props' current aspect. In a slot the Format
row is hidden (the template's box decides the size, as `lookInBox()` does today).

## 7. Migration of saved props

### 7.1 Mechanism

- `S:schema/migrate.ts` exports `migrateMushafProps<P>(props: unknown): P`, pure and idempotent
  (`migrate(migrate(x))` deep-equals `migrate(x)`; a new-shape object passes through unchanged),
  plus `describeMushafMigration(props): readonly MigrationNote[]` (`{path, from, to, reason}`) and
  `mushafPropsNeedMigration(props): boolean`.
- Each group's migrator fills fields the input lacks from that group's `default*` object, then maps
  legacy fields and deletes them. So a Laravel payload that sends a whole group in the old shape,
  or only part of a group, comes out complete.
- It runs first in every `calculateMetadata()` (Recitation, AyahText, Page, Passage, Thumbnail,
  InTemplate) and in the slot resolvers, which return the migrated props as `props`. Remotion
  4.0.539's renderer does not Zod-validate input props (no `safeParse` in `remotion/dist`), so CLI,
  Lambda and Laravel renders receive raw props and are migrated there.
- In the Studio, the sidebar validates the Root's saved defaults; an old Root fails on the changed
  fields until it is upgraded. The Mushaf panel shows the upgrade banner (section 10.3), which saves
  `migrateMushafProps(props)` through `saveDefaultProps`. The preview renders the migrated props in
  the meantime (through `calculateMetadata`).
- **Policy**: a value that is still valid is never replaced by a new default. Values change only
  when (a) the option was removed (mapped to its nearest equivalent), (b) the number is outside the
  new range (clamped), (c) the value is an exact old default font stack that was never loaded
  (bug fix), or (d) the value is invisible in the render (e.g. the gradient when the kind is not
  gradient). The banner offers a separate, opt-in "Also apply the Mushaf look" button.

### 7.2 Per group

| Group | Old | New |
|---|---|---|
| highlight | `mode` | kept |
| | `dimOthers < 1` and `dimUpcomingOnly: true` | `style: 'ink'`, `restOpacity = clamp(round(dimOthers / 0.05) × 0.05, 0.5, 0.85)` |
| | otherwise `style: 'color'` or `'glow'` | `style: 'tint'` |
| | otherwise `style: 'marker'` | `style: 'wash'` (any dimming dropped: one device) |
| | otherwise `style: 'none'` with `dimOthers < 1` | `style: 'ink'`, `restOpacity` as above |
| | otherwise `style: 'none'` | `mode: 'none'`, `style: 'ink'` (it marked nothing before) |
| | `restOpacity` when not set above | 0.6 |
| | `color: '#ffd166'` (Karaoke yellow) | `#b8913a`; any other colour kept (tint corrects it at render) |
| | `dimOthers`, `dimUpcomingOnly` | deleted |
| animation | `enter` (or `exit` when `enter` is `none` and `exit` is not) | `lines`: `slide-fade` → `rise`, `fade` → `fade`, `reveal-rtl` → `fade`, `none` → `cut` |
| | `scroll` | deleted; `tempo: 'calm'` |
| | `leadInSeconds` | clamped to 0–2 |
| layout | `neighbourOpacity` | clamped to 0.15–0.5 |
| | `frame` missing | `'none'` |
| text | `translationFont: 'Georgia, "Noto Serif", serif'` exactly | `'auto'` |
| | `glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif'` exactly | `'auto'` |
| overlay | `introSeconds` | clamped to 2–6 |
| | `font: 'Georgia, "Noto Serif", serif'` exactly | `'auto'` |
| legend | (none) | unchanged; `orientation` now ignored |
| background | `kenBurns: 'pan-left' / 'pan-right'` | `'slow-zoom'` |
| | `kenBurnsScale` | clamped to 1–1.05 |
| | `glow.enabled: true` | `vignette = max(vignette, 0.15)`; `glow` deleted |
| | `vignette` missing | 0 (or the value above) |
| | `gradient` while `kind !== 'gradient'` | the new default gradient |
| pageView | `lineHighlight: 'underline'` | `'band'` |
| | `frame: 'ornate'` | `'simple'` |
| | `turn: 'slide'` | `'fade'` |
| | `turnSeconds`, `dimOtherLines` | clamped to 0.6–1.5, 0.5–1 |
| ayahAnimation | as animation | as animation |
| theme, customTheme, memorize, endCard, header, review | | unchanged |

### 7.3 Behaviour that changes for existing saves (release notes)

- Old gold `color` highlights become tints that now read at 5:1 (darker gold on cream) and now show
  on colour themes too.
- Glow, marker and Karaoke users get a quieter mark.
- Every save gains the late-not-early timing, the intro delay (when the intro card is on), the end
  hold and the loaded fonts; durations change accordingly.
- Translations larger than half the Arabic are drawn at half (visible at 9:16).

### 7.4 Looks

`applyLook()` keeps taking a look object. A new `lookById(id)` maps legacy ids with one
`console.warn`: `classic` → `mushaf`, `tajweed-light` → `tajweed`, `night` → `haram-night`,
`black-gold` → `haram-night`, `sepia` → `mushaf`, `study` → `learning`, `karaoke` → `mushaf`,
`reel` → format `vertical`, `square` → format `square` (the last two return the format's patch).

### 7.5 Code users

`Highlight` and `Animation` types change shape: `@tlawat/mushaf-studio` goes 0.1.0 → 0.2.0 (a
breaking change before 1.0). `activeWordStyleFrom()` stays as a `@deprecated` wrapper: it migrates
its argument and returns the style at full emphasis (ink: `undefined`; tint: `{color:
legibleAccent(...)}`; wash: `washStyle({cap: 'both'})`). `scrollTimingFrom()` is deprecated and
returns the calm scroll timing. `animationFrom()` takes the new `Animation` and the boundary
timing it needs.

## 8. Renderer changes (`@tlawat/remotion-mushaf-line` 0.5.0 → 0.6.0)

All additive: no export changes signature or default behaviour, and the DOM contract is unchanged
when the new props are absent.

### 8.1 Calm motion constants (`R:animation/timings.ts`)

```ts
export const CALM_EASINGS = {
  soft: Easing.bezier(0.25, 0.1, 0.25, 1),
  inOut: Easing.bezier(0.45, 0, 0.55, 1),
  sine: Easing.bezier(0.37, 0, 0.63, 1),
  arrive: Easing.bezier(0.33, 0, 0.2, 1),
} as const;
```

`enterTiming()`, `exitTiming()`, `ENTER_EASING`, `EXIT_EASING` unchanged. `springyTiming()` gets
`@deprecated` ("overshoot-free but starts early; not recommended for Quranic text").

### 8.2 `fadeRise({distance, easing?, riseEasing?})` (`R:animation/presentations/fade-rise.tsx`)

Entering side: opacity on `easing` (default `CALM_EASINGS.soft`) and `translateY(distance px → 0)`
on `riseEasing` (default `CALM_EASINGS.arrive`). Exiting side: opacity only (`1 − progress`).
`distance` is in px, so it is the same in one-line mode and in a window. `slideFade` and
`revealRtl` stay exported; both get `@deprecated`, `revealRtl`'s noting it shows partial words.

### 8.3 `WordContext.linePosition?: number`

The signed distance of the word's line from the window's centre slot: `index − position`
(0 centre, −1 one slot above, +0.4 on its way in from below). `<MushafLineWindow>` provides it
through `LineContext`; a lone `<MushafLine>` gives 0. It is the same number the window already uses
for `windowEmphasisOpacity()` (`R:component/styles.ts:231`), signed.

### 8.4 Tint palettes: `inkTint` prop and `WordContext.inkPalette`

- `MushafLineCommonProps.inkTint?: string` (a CSS colour), forwarded by the window to every line.
- When set and the theme's ink entries are a fixed palette colour (not `currentColor`), the line's
  existing palette layout effect (`use-palette-rule.ts`, before the ready gate) also registers four
  `@font-palette-values` rules through `registerPalette()`: the row's palette with every
  `colorParts.ink` entry (for custom themes: the entries the custom ink would override) set to
  `mix(themeInk, inkTint, k)` for k = 0.25, 0.5, 0.75, 1.
- `WordContext.inkPalette?: (amount: number) => string | undefined` returns the ident of the
  nearest step (`undefined` for an amount under 0.125, i.e. the row's own palette). It is
  `undefined` itself when `inkTint` is absent or the ink follows `currentColor` (the caller then
  uses CSS `color`).
- `fontPalette` joins the documented paint-only `wordStyle` properties (`color`, `opacity`,
  `filter`, `background`, `textShadow`). It is ignored on `kind: 'end'` words, which keep their
  marker palette.

### 8.5 Docs (`packages/remotion-mushaf-line-renderer/README.md`)

Sections "Entrances and exits" and "Several lines at once": `CALM_EASINGS`, `fadeRise`,
`linePosition`, `inkTint` / `inkPalette`, `fontPalette` in the paint-only list, and a short "Motion
etiquette for Quranic text" (no scale, no wipe through words, no overshoot, transitions after the
last word).

## 9. Studio implementation map

| File | Change |
|---|---|
| `S:schema/index.ts` | groups and defaults of section 5; exports of tokens, migrate, marks |
| `S:schema/tokens.ts` (new) | colours, curves, durations, `tempoFrames()` |
| `S:schema/color.ts` (new) | `relativeLuminance`, `contrast`, `isLightGround`, OKLCH, `legibleAccent`, `washAlpha`, `readableInk` |
| `S:schema/marks.ts` (new) | `wordSpans`, `wordEmphasis`, `ayahEmphasis`, `inkFill`, `boundaryStart` (4.3) |
| `S:schema/wash.ts` (new) | `washStyle()` |
| `S:schema/highlight.ts` | `wordStyleFrom()` rewritten around ink/tint/wash, `linePosition`, `inkPalette`; `activeWordStyleFrom` deprecated |
| `S:schema/animation.ts` | `animationFrom()` per boundary; `scrollStepsFrom()`; `scrollTimingFrom` deprecated |
| `S:schema/migrate.ts` (new) | section 7 |
| `S:background/*` | vignette, dim floor, slow zoom only; glow removed |
| `S:compositions/recitation/*` | overlapping one-line Sequences, start-anchored steps, intro delay, end hold, translation timing |
| `S:compositions/fonts.ts` (new) | `useStudioFonts()` |
| `S:content/script-fonts.ts` | EB Garamond first for Latin |
| `S:translations/TranslationStack.tsx` | centred layout, cap, wrap rule, dissolve, hairline |
| `S:interlinear/*` | no ellipsis, two-row wrap, accent label |
| `S:overlay/TitleOverlay.tsx` | card timeline and layout, corner label |
| `S:memorize/*` | reveal and re-hide fades, ghost opacities, counter |
| `S:content/TajweedLegend.tsx`, `parts.tsx` | reserved band layout |
| `S:content/EndCard.tsx` | section 5.9 |
| `S:page/*` | section 5.11 |
| `S:unicode/*` | section 5.12, shared animation schema |
| `S:presets/index.ts` | five looks, formats, `lookById` |
| `S:studio/tabs/LookTab.tsx`, `S:studio/i18n.ts`, `MushafStudioPanel.tsx` | section 10 |
| `apps/mushaf-studio/src/Root.tsx` | literals rewritten to the new defaults (the demo app) |
| tests | section 12.1 |

## 10. Look tab and panel UI

### 10.1 Look tab, top to bottom

1. **Format** (hidden in a slot): a segmented row of four buttons, each a small frame-shape glyph
   with its label (Landscape · Vertical · Square · Portrait / أفقي · عمودي · مربّع · طولي). The
   current aspect is selected. Under Vertical, a hint: "Printed lines are small in a vertical frame;
   the Ayah text composition suits reels better." / «الأسطر المطبوعة صغيرة في الإطار العمودي؛
   تركيب نصّ الآية أنسب للمقاطع القصيرة.»
2. **Looks**: one card per look for this composition, in the order of 6.2. Each card shows the
   English and Arabic names together (Arabic in Amiri), the one-sentence intent in the panel
   language, and four chips: *Page* (layout.background), *Ink* (layout.color), *Metal*
   (`metalOf()`), *Mark* (the effective mark colour: for tint `legibleAccent()`, for wash the
   capped colour, for ink the ink at `restOpacity`). A check mark when `lookMatches()`; Apply and
   Undo as today.
3. **Mark summary** (new, read-only, one line): "Follows each word · Ink" / «تتبع كل كلمة · مداد»,
   with two conditional notes:
   - when `style` is tint and the colour was corrected: "Tint shown as #806321 so it reads on this
     page" / «يظهر التذهيب بلون ‎#806321‎ ليُقرأ على هذه الصفحة»;
   - when `style` is tint on a tajweed theme: "Shown as a wash: a tint would repaint the tajweed
     colours" / «يظهر ظلًّا: التذهيب سيغيّر ألوان التجويد».

### 10.2 Props sidebar labels (via i18n where the panel shows them)

`highlight.style` values: ink مداد · tint تذهيب · wash ظلّ. `highlight.mode`: word كلمة · ayah آية ·
none بلا. `animation.lines`: fade ذوبان · rise ذوبان مع ارتفاع · cut قطع. `animation.tempo`: calm هادئ
· slow متأنٍّ. The group `animation` is shown as "Motion" / «الحركة» in the panel's own headings.

### 10.3 Upgrade banner (every tab, top)

Shown when `mushafPropsNeedMigration(props)`:
"These props were saved by an earlier Mushaf Studio. [Upgrade] [What changes]" / «حُفظت هذه
الخصائص بإصدار سابق من استوديو المصحف. [ترقية] [ما الذي يتغيّر]». *What changes* lists
`describeMushafMigration()` notes (path, before, after, reason). *Upgrade* saves the migrated props;
a second button, "Upgrade and apply the Mushaf look" / «ترقية وتطبيق مظهر المصحف», also applies
the Mushaf look and the Landscape format's recommended positions. After saving, a notice: "Upgraded:
N settings changed. The changelog lists the visual differences."

### 10.4 i18n keys (EN and AR, in `S:studio/i18n.ts`)

`look.format`, `look.format.{landscape,vertical,square,portrait}`, `look.format.verticalHint`,
`look.chip.metal`, `look.chip.mark`, `look.mark.summary`, `look.mark.adjusted`,
`look.mark.washOnTajweed`, `look.name.<id>`, `look.description.<id>` (from the look objects),
`upgrade.banner`, `upgrade.button`, `upgrade.withLook`, `upgrade.details`, `upgrade.done`,
`highlight.style.{ink,tint,wash}`, `highlight.mode.{word,ayah,none}`,
`animation.lines.{fade,rise,cut}`, `animation.tempo.{calm,slow}`, `group.motion`. The old
`look.chip.currentWord` and `look.chip.rosette` are removed.

## 11. Documentation and changelog

- `packages/mushaf-studio/README.md`: rewrite "Looks", "Highlight" and "Animation" around this
  design; add "Backgrounds: what to use", "Timing: late, never early", "Intro delay and
  `resolved.introDelaySeconds`" (for hosts that sync externally), and "Upgrading saved props".
- `packages/mushaf-studio/CHANGELOG.md` 0.2.0: Breaking (types, removed options and looks, with the
  7.2 mapping), Changed visuals (7.3), Fixed (colour themes, early exits, intro cut to one frame,
  reversed range, legend over text, ellipsis glosses, doubled end-card title, fonts never loaded).
- `packages/remotion-mushaf-line-renderer/CHANGELOG.md` 0.6.0: Added (8.1–8.4), Deprecated
  (`slideFade`, `revealRtl`, `springyTiming`).
- This page: the status line becomes "implemented", with any deviation recorded at the end.

## 12. Visual verification

### 12.1 Unit tests (vitest, `packages/mushaf-studio/test/unit/`)

- `schema/color.test.ts`: the `legibleAccent` table of 3.1.2 (±1 per channel); `washAlpha`;
  `isLightGround`; `readableInk`.
- `schema/marks.test.ts`: on the bundled Al-Fatihah timings: anti-flicker drop; release at
  `ayah.end + 0.25 s`; `e` sampled per frame; for every line boundary `boundaryStart ≥ E`; `D_eff`
  floor of 10 f.
- `schema/dissolve.test.ts`: for D ∈ {12, 18, 20, 27, 28, 30}: no frame with both opacities > 0.2;
  at every frame `max(out, in) ≥ 0.15`.
- `schema/migrate.test.ts`: golden fixtures for the old Root defaults of every composition and every
  old look patch → expected new props; idempotence; partial groups filled; new-shape passthrough.
- `schema/descriptions.test.ts`: still passes (colour pickers, 200 characters), with the new
  "wins over highlight.restOpacity" and "wins over highlight.style on the page" regexes.
- `presets/looks.test.ts`: `applyLook ∘ applyFormat` equals `applyFormat ∘ applyLook` for every look
  and format; the Mushaf look applied to `defaultMushafRecitationProps` changes nothing.

### 12.2 Stills and strips

Build once, then render with the documented command. Props per case come from a dev-only script,
`apps/mushaf-studio/scripts/design-stills.ts` (new), which builds the style groups with
`applyFormat(applyLook(defaultMushafRecitationProps, look), format)` plus the case's overrides,
writes them (style groups only, whole groups) to `<case>.json`, and runs:

```bash
cd /home/user/remotion-mushaf-line-renderer/apps/mushaf-studio
bunx remotion still src/index.ts MushafRecitation out/<case>.png --frame=<N> \
  --props=out/<case>.json --scale=0.5 --browser-executable=/opt/pw-browsers/chromium
# strips: bunx remotion render src/index.ts MushafRecitation out/<case>.mp4 --frames=a-b ... then
# extract every frame with ffmpeg -i out/<case>.mp4 out/<case>-%03d.png
```

Frame references (bundled Al-Fatihah, no intro): ayah 2 runs 0.33–3.53 s; word 1:2:4 (الْعَالَمِينَ)
runs f58–f102; line 2's first word is about f106. A checker script (`scripts/design-check.py`, dev
only) samples pixels for the numeric criteria.

| # | Case | Frames | Must look like (pass criteria) |
|---|---|---|---|
| V1 | Mushaf, 16:9 | f60 | Ivory `#f8f3e6` page; three centred lines, margins 190 px (95 at half scale); words after 1:2:4 on line 1 at 0.6 (sampled ink ≈ `#74716a` ±6); 1:2:1–1:2:4 full ink; line 2 at 0.3; nothing coloured |
| V2 | Mushaf, ink fill strip | f56–f66 | 1:2:4 goes from rest to full over f58–f64, monotonic, no other change on screen |
| V3 | Mushaf, window scroll strip | f96–f140 | The track does not move before 1:2:4 has ended (f102); scroll lasts 24 f; no frame where a word above the centre slot is marked |
| V4 | Mushaf + `visibleLines: 0`, strip | f96–f130 | Line 1 still fully visible at f102; dissolve after it; no frame with both lines > 0.2 (checker: mean ink of each line's bbox); no blank frame (max of the two ≥ 0.15) |
| V5 | `rise`, one-line strip | as V4 | Incoming line rises ≤ 6 px at half scale (11 px full); outgoing line does not move |
| V6 | Rosettes, Mushaf / Haram / Green, crop of an ayah end and the surah header, scale 1 | f60 | Rosette outline and numerals in gold line; petals vellum (or the ground on dark); no pink, no mint, no solid gold coin. If outline and fill are swapped, swap `frame`/`accent` in the looks (5.4) |
| V7 | Learning (tint, plain path) | f60, f63 | 1:2:4 drawn `#806321` (checker: darkest pixel of its bbox within ΔE2000 5); at f63 previous word 1:2:3 still partly tinted (trail) |
| V8 | Tint on theme `light` | f60 | No word recoloured; a wash behind 1:2:4; tajweed colours intact |
| V9 | Tint on theme `black` (palette path) | f60 | 1:2:4 letters in `#b19353`-ish gold; rosettes and other words untouched |
| V10 | Haram night (ayah wash), 16:9 and 9:16 | f60 | One continuous band over all of ayah 2 on its line, rosette included; soft rounded ends; no visible seam between words (checker: band luminance varies < 1 % along its centre row); band clear of the lines above and below |
| V11 | Wash on dense pages: MushafPassage p.48 (2:282) and p.106, word wash on a word with kasra/tanween, 16:9 and 9:16, scale 1 | any | Diacritics below the letters stay inside the band's feather; the band never touches the next line's marks. If it clips, raise the band to 1.65 em at 55 % |
| V12 | Madinah green | f60 | Jadwal double rule at the safe area in gold at 0.45; ayah 2 full, other ayat at 0.6 |
| V13 | Tajweed, Recitation and Page | f60 | Legend as one centred row in a band under the lines; nothing overlapped; pastels not washed out (rest 0.7) |
| V14 | Mushaf + translation (Saheeh), 16:9 and 9:16 | f60, f110 | Centred EB Garamond 500, 36 px at 16:9 and 26 px at 9:16; at most 2 lines; at f110 still the ayah 2 translation if ayah 2 is not finished, otherwise mid-dissolve |
| V15 | Intro card (`title: 'both'`, reciter, translation) | f0, f30, f90, first word frame | f0 bare ground; f30 cartouche, hairline with lozenge, «الآيات ٢–٧» with ٢ on the right, "Āyāt 2–7", reciter, attribution; at the first word the card is gone and the lines are settled; duration grew by `introDelaySeconds` |
| V16 | Corner label and counter (`memorize: repeat`) | f150 | "AL-FĀTIḤAH · 2" small caps inside the safe area; "2 / 3" opposite, no pill |
| V17 | End (`endCard: credits`) | last word + 0.5 s, + 2 s, + 3 s | Lines held, then fading, then the credits card on the same ground; surah-name glyph title once |
| V18 | MushafPage default, 16:9 | f60, a turn | Page 92 % of the height; band cross-fades between lines; turn is a dissolve after the page's last word; double rule, no corner dots |
| V19 | Background image, light ink, vignette 0.2, slow zoom | f0, last frame | Image dimmed ≥ 0.45; vignette visible without banding; zoom ≤ 1.05 at the end |
| V20 | AyahText, Haram night, word wash | f60, f700 | Wash per word, no lone word on the last line, word spacing 0.1 em; ayah dissolve without blank frame |

All cases are re-run for `tempo: 'slow'` on V3, V4 and V10 (durations × 1.4, same criteria).

### 12.3 Review

The stills V1, V6, V10, V12, V13, V14 and V15 at full scale are reviewed side by side with a
physical Madinah mushaf (page 1 and a regular page) before the palette values are frozen; any value
changed by that review is changed here first.

## 13. Risks and contingencies

1. **Sidebar validation of old Roots.** Until upgraded, an old Root shows validation errors in
   Remotion's Props sidebar; the preview still renders through `calculateMetadata`'s migration. If
   the Studio refuses to render an invalid Root in 4.0.539, keep the old fields as hidden
   `.optional()` fields described "(legacy, migrated on save)" for one minor version.
2. **Wash seams or clipping.** If V10 shows seams (side bearings) or V11 clipping, add a renderer
   `marks` element (one absolutely positioned band per line, measured once per line after fit,
   behind the row, behind the ready gate) as a phase-2 change; the band geometry above stays.
3. **Tint palettes in headless Chromium.** If V9 fails or a 30 s clip renders more than 10 % slower,
   path 3 of 5.1.2 falls back to path 2 (shown as wash) and the panel note says so.
4. **CPAL part mapping** (V6): fix the looks' `frame`/`accent` values, not the design.
5. **Intro delay** changes durations and every video timestamp: hosts must read
   `resolved.introDelaySeconds` (documented, and in the changelog).
6. **Fast continuous recitation**: transitions compress to 10 f and overlap the first word by design;
   if review finds lines lagging, lower `Dmin` to 8 f, never start before `E`.
7. **Fonts from Google Fonts at render time**: render machines need network access, as for `'auto'`
   translation fonts today; the README notes the offline path (`useWebFonts` sources).
8. **Contrast correction changes a user's chosen colour on screen**; the panel shows the effective
   hex (10.1), and the saved value is never rewritten.

## 14. Rejected ideas

| Idea | Why not |
|---|---|
| Underline or hairline rule under the word | KFGQPC kasra and tanween reach about −0.73 em: a rule collides with them or reads as the next line's; it looks like a hyperlink and clashes with the Studio's dotted doubt underline |
| A wash that glides from word to word | A travelling selection box is caption karaoke; the mark cross-fades in place |
| Glow, marker box, scale or bounce of the active word | The subtitle grammar the request rejects; a halo blurs the one word that must be sharpest |
| `reveal-rtl` | Shows half-words and sliced rosettes |
| Carmine or red accent | Reads as an error mark; on tajweed themes red is a rule colour (madd) |
| Translation split into timed chunks | Can show a meaning against the wrong words |
| A `heard: rest` option, three tempos, separate enter/exit, accent enum plus custom colour | Option sprawl that allows undignified combinations |
| Ayah follow as the default | Calm, but listeners and learners lose their place; it is a first-class option and two looks use it |
| Audio-reactive glow, Ken Burns pans, zoom beyond 1.05 | Pumps like a volume meter; the background must not compete |
| A new `scrollSteps` API | `scrollPosition` already supports `anchor: 'start'` |
| A window "jump dissolve" for memorise repeats, a codemod CLI | Scope beyond the request; the scroll token and the upgrade banner cover them |
| Lozenge row repeat counter, Lapis look, a ground toggle | One ornament or layer more than needed |

## Deviations

Recorded while implementing; each is the closest faithful alternative to what is written above.

Stage R1 (tokens, timing model, highlight, migration, renderer):

1. **The staggered dissolve's outgoing share is 48 %, not 45 %, and "never empty" is measured as
   the ink on screen.** With 45 % the 12-frame (`labelChange`) and 25-frame (slow
   `translationDissolve`) dissolves leave a frame with 0.09 and 0.12 of ink. And `max(out, in) ≥
   0.15` at every frame cannot hold together with "never both above 0.2" and "the outgoing line is
   under 0.25 before the incoming one starts" for any pair of shares with these curves (searched
   0.35-0.65 × 0.10-0.45). The criterion is therefore `out + in ≥ 0.15`, the measure 3.2 itself
   uses ("0.03 + 0.17 of ink"). With `o = round(0.48 · D)` and `i = round(0.30 · D)`, all three
   hold at 12, 18, 20, 27, 28 and 30 frames and at every dissolving token at both tempos. For D = 20
   the outgoing text goes over f0-f10. This governs every 0.45 above: in 3.2, in 5.2's one-line
   Sequences (the outgoing Sequence ends at `t0 + round(0.48 · D_eff)` with an exit that long) and
   in 12.2. `dissolveShares(D)` (S:schema/tokens.ts) returns both shares, `{out, in}`; `dissolve()`
   takes them from it, and the timing stage's overlapping Sequences are to, so they cannot drift.
2. **A tint goes through CSS `color` only under `plain`.** Under `normal`, and a custom palette on
   `normal`, the ink follows the text colour only as the row's palette rule resolves it, once.
   Chromium drops `currentColor` inside `override-colors`, so a word's own `color` never reaches the
   glyphs. Still V7 showed no tint on the Mushaf palette. `tintPath()` is therefore `'css'` for
   `plain`, `'wash'` on tajweed colours, and `'palette'` for every other colour theme. To match,
   the renderer's `inkTint` (8.4) registers its four palettes for an ink that follows
   `currentColor` too, mixing from the row's resolved colour. `WordContext.inkPalette` is
   `undefined` only without `inkTint` or under `plain`.
3. **`cardOut` slow is 30 frames, as the table says** (1.4 × 21 would round to 29). `DURATIONS`
   stores both columns, so the table is the source.
4. **The anti-flicker floor is 4/30 s at any frame rate** (the flicker is in time, not frames).
5. **The migration resets an unpainted gradient, and maps `#ffd166`, only in groups saved in the
   old shape**: a background with `glow`, without `vignette`, with a pan or a scale over 1.05; a
   highlight with an old style or `dimOthers` / `dimUpcomingOnly`. A group in the new shape always
   passes through unchanged (7.1).
6. **`migrateMushafProps(props, {defaults})`** takes the composition's own defaults as an optional
   second argument to fill missing fields from (AyahText's dark page, a recitation's
   `glossPosition`). Without it the shared `default*` objects are used. `describeMushafMigration`
   and `mushafPropsNeedMigration` take the same option.
7. **Schema parts of later sections changed now, so every migrated value validates.** These are
   `pageView` (5.11: enums, ranges, defaults), the `'auto'` default and description of
   `text.translationFont`, `text.glossFont` and `overlay.font`, and `overlay.introSeconds` 2-6.
   Until `useStudioFonts()` loads EB Garamond, `'auto'` gloss and label fonts resolve to
   `"EB Garamond", Georgia, "Noto Serif", serif`. The rest of the page's rendering (band
   cross-fade, metal rule, 0.5 outside opacity, fit) waits for its stage. Its band already uses
   `washColor()`, and the removed underline, corner ornaments and slide are gone.
8. **The nine old looks stay until the five looks of 6.2 replace them.** They are written in the
   new vocabulary, as `migrateMushafProps()` maps their old values (Study's `neighbourOpacity`
   0.6 is clamped to 0.5).
9. **Interim motion until the timing stage.** `animationFrom()` maps `lines` to `fade()` /
   `fadeRise()` / nothing on the old lengths (15 frames in, 10 out), so the old schedules hold.
   MushafRecitation's window already scrolls as 5.2 says, because a 24-frame scroll on the old end
   anchor started while the outgoing line's last word was still heard, and the neighbour factor
   (5.1.4) then took that word's mark away: `scrollTimingFrom(tempo)` (24 frames on `INOUT`) with
   `anchor: 'start'` and `steps[j] = max(E(j−1), F(j) − leadIn − scroll)` from
   `windowScrollStarts()` (S:compositions/recitation/scroll.ts, built on `boundaryStart()` and
   `outgoingEnd()`, the word ends moved onto their clips when ayahs repeat). The window's first
   appearance (`windowIn`), its end hold, MushafPassage's steps and the overlapping one-line
   Sequences come with the timing stage.
10. **Gloss marks (5.1.5): the labels' rest (0.7), their accent and emphasis, and the strip's
    3 + 6 frame change are in.** The no-ellipsis two-row wrap of interlinear labels is layout work
    and waits for the interlinear stage.
11. **MushafAyahText's marks follow 5.12** (ayah mode marks nothing; a word wash at 1.35 em and
    55 %). Its words do not become `inline-block`, its word spacing is not 0.1 em and its block
    width is not set yet: that waits for its stage.
12. **`washStyle({color, cap, height?, y?})`, not `washStyle({color, alpha, cap})`.** The colour
    comes from `washColor(color, alpha)` with its alpha already in, so the chroma cap and the 0.16
    cap are applied in one place. `height` and `y` (default `1.55em`, `54%`) carry MushafAyahText's
    band (`1.35em` at `55%`, 5.12). The CSS is otherwise exactly 5.1.3's, pinned literally in
    `test/unit/schema/wash.test.ts`.
13. **The ground of a composition is `groundFor(background, layout)`** (S:background/compat.ts):
    `groundOf()` of the kind `backgroundFor()` paints, so props whose image is still in
    `layout.backgroundImage` (kind `'color'`) count as an image background (3.1.1).
14. **A rosette the timings time as a word of its own is not a word span (4.1).** The Studio's
    bundled Al-Fatihah gives each ayah's marker an entry (1:2:5 over 3.391-3.533 s). `wordSpans()`
    and `wordStyleFrom()` take `markers` (`markerIds(lines)`, the `kind: 'end'` words), so the last
    word holds to `release(a)` and the gloss strip keeps its gloss until the next ayah.
15. **V10 fails: the wash shows faint seams where two tiles meet.** Chromium antialiases each
    background tile at its own fractional edge, and two partly covering tiles of one colour leave
    the shared pixel about 25 % weaker (measured on the Haram-night ayah wash at 9:16: band
    `(39,38,33)`, seam columns `(34,34,30)` and `(31,31,28)`, on a `(18,20,22)` ground). It happens
    where two words meet and where a cap tile meets its body, at some fractional positions and not
    others. Overhanging the tiles by 0.5 px each way (negative margin and padding, or
    `border-image-outset`) doubles the alpha instead: on a test row of the same band, a brighter
    line, `(57,50,37)` against `(39,36,30)`. Nothing a
    paint-only word style can do joins the tiles, so the seams stay until 13.2's phase-2 band (one
    shape per run on a line, drawn by the renderer behind the row) lands; the band geometry above
    stays as it is for it.

Stage R2 (timing, intro, translation, labels, memorisation, legend, end card):

16. **The intro delay is MushafRecitation's (and its slot's), and not under `hostAudio`.** There the
    template's track decides when the recording is heard, so nothing can wait for the card; the
    card then covers the start in the page colour, as below. `MushafPassage` already starts its
    lines after the card (`passageTimeline()`), so its card is drawn on the bare ground too.
    `MushafAyahText` and `MushafPage` keep the card over their start, covering the text in the page
    colour (`introCoverOpacity()`), until it goes 0.3 s before the first word: their timing is
    their stages' (5.11, 5.12). In the Studio, `audioOffsetOf()` takes `introDelaySeconds` back
    off, so the Review tab and the waveform stay on the recording's clock.
17. **A change waits for the one before it.** In one-line mode and for the ayah on screen, a
    change that `boundaryStart()` would start before the previous change (or the first appearance)
    is over starts when it is over: late, never early, and a line always reaches full ink. A header
    line whose next change would start before its own entrance is over is left out (the existing
    "squeezed out" rule, now measured on the dissolves).
18. **The translation comes and goes with the lines.** It fades in with their first appearance
    (`windowIn` on `SINE`) and out with their `endFade` (`linesPresence()`), so it is never on
    screen under the intro card or after the lines.
19. **The corner label's surah has no diacritics.** It reads "AL-FATIHAH · 3": the transliterations
    are the panel's one table (`SURAH_NAMES`), which has none. The card's own Latin line is "Āyāt
    2–7" as written.
20. **The legend band's reserve at 9:16 also counts the platform band.** `0.5 × lineBox` plus the
    band is subtracted from the frame, and at 9:16 the band sits above the bottom 18 %; subtracting
    only the two would let the lines run under the band. The reserve is the band, the inset beyond
    the safe area (292 px at 9:16, 0 elsewhere) and half a line box (`legendBand()`). `MushafPage`
    draws the band but does not yet fit the page around it (5.11).
21. **`endCard.seconds` is the card's whole length**, its 30-frame dissolve in and its last second
    included, so the field keeps its meaning ("added to the video"). The card keeps the range in
    small caps and the reciter in italic under the title.
22. **The gloss is italic in the strip only.** The interlinear labels keep their upright face
    until the interlinear stage, whose two-row wrap is measured in the face it draws.
23. **The audio offset of a later first ayah still leaves room for the package's 0.5 s entrance**
    (`audioOffsetFor()`, shared with `MushafPage` and `MushafAyahText`). With `fromAyah` set, the
    window's 0.8 s first appearance may then start at frame 0 and settle less than
    `leadInSeconds` before the first word: late, never early.

Stage R2 review:

24. **The card's Latin range reads "Ayat 2–7", without the macrons.** EB Garamond as Google Fonts
    serves it (400 and 500 alike) sets the macron of a capital Ā beside the letter, not over it,
    whether the capital is real or the font's small cap, precomposed or decomposed, letter-spaced
    or not; only a lowercase ā is drawn right. Small caps set every letter as a capital, so the
    range (on the intro card and on the end card's range line) is drawn through
    `smallCapsLabel()`, which takes the marks off, as the corner label's names have none (19).
    `latinRangeText()` still returns "Āyāt 2–7".
25. **The legend's names are drawn smaller when an entry does not fit the safe area.** Each entry
    stays one unbreakable unit (5.8), measured as drawn: the English in small caps on the canvas
    (`fontVariantCaps`), with its 0.08 em letter-spacing, in `overlay.font`'s face; the Arabic in
    Amiri. When the widest entry is wider than `width − 2 × safe` (the "Connected or separated
    prolongation" rule with both names at 9:16), the band's type size is `floor(0.8 L × room /
    widest)` rather than 0.8 L, so every row fits (`legendBand().rowWidths`).
26. **With the intro card on, the header lines count in the intro delay** (5.6):
    `introSeconds + cardIn + headers × headerSeconds + leadInSeconds − firstWord`, and their slots
    are laid out again on the moved schedule (`withHeaderSlots()` before the first ayah's line),
    so each holds its spacing after the card instead of being clamped against it.
27. **The end hold counts from the last word's own end** (5.2), not from the last ayah's `end`: an
    ayah-end rosette the timings time as a word (14) is left out (`recitationEndSeconds(timings,
    clips, markers)`). Without word times, the ayah's end.
28. **MushafPassage runs the whole of 5.2 and 5.5.** Its window (and its first and last line in
    one-line mode) appears over `windowIn` on `SINE` at the first hold, after the intro card (the
    window no longer starts under the card), and fades over `endFade` after the last hold; the
    video grows by the fade (`passageEndFade()`, 0 under `cut`). The translation and the corner
    number dissolve at each line's hold start (`passageAyahChanges()`, `translationDissolve` and
    `labelChange`), the first ayah after header lines from nothing, and come and go with the lines.
29. **Under repeats nothing changes in one frame as a play starts.** The recording's clock goes back
    to the ayah's start, so the current line's ink goes from the previous play's over `rehide` on
    `SINE`, the mark the previous play ended on lets go over `markOut`, and a word the previous
    play ended with hidden that this play shows (the next ayah once `revealAfterRepeats` is over)
    comes in over `reveal` on `SOFT` from the play's start (5.7).

Stage R3 (background, page, ayah text, looks, Look tab):

30. **`layout.verticalAlign` steps by 0.01, not 0.05.** The Format table places the lines at 0.47
    (portrait) and 0.48 (square), which the schema's 0.05 step refused (the Props sidebar and every
    render that validates). The step is the only change; the range and the default are as before.
31. **"Upgrade and apply the Mushaf look" sets the positions the props' own format recommends**
    (the Landscape format's at 16:9, as 10.3 says), not always Landscape's: a 9:16 ayah text would
    otherwise get 190 px margins. In a slot it sets no position and no aspect (`lookInBox()`), as
    the box decides them. It is `upgradeWithLook()` (S:studio/MushafStudioPanel.tsx).
32. **The banner reads the Root, not the rendered props.** The composition renders props
    `calculateMetadata()` has already migrated, so `mushafPropsNeedMigration()` of them is always
    false; the banner reads the Studio's live Root values for the target (a slot's under its key)
    with the composition's (or the slot's) defaults. Its saves replace the target's props whole
    (`replaceTargetProps()`, S:studio/studio-api.ts): a merge through `saveDefaultProps` cannot
    delete the fields an earlier version saved. The notice counts the migration's notes.
33. **`lookById('reel')` and `lookById('square')` return their format as a look** whose patch is
    the format's aspect, margins and vertical place (`{layout: {aspect, marginX, verticalAlign}}`),
    for a code user who stored the id; `applyFormat()` is the path that keeps a position the user
    chose, and the panel uses it.
34. **MushafPage is no longer fitted from `layout.marginX`.** `pageGeometry(size, reserve)` fits
    the page box in 84 % of the width and 92 % of the height less the legend's band
    (`legendReserve()`), which also closes deviation 20's gap (the page now fits around the band).
    `marginX` still places a `beside` translation. With whole-px type sizes the page comes out a
    step under the cap (at 16:9, 957 of the 993 px). The turn is timed in the component
    (`pageTurns()`: `E` the end of the last word the passage recites on the outgoing page, `F` the
    next page's first line, `leadInSeconds` the recitation's default as the page has no
    `animation`, calm tempo; a cut at `max(E, F − leadIn)`); `PageSlot.start` from `resolvePage()`
    keeps its old meaning. `dimOtherLines` eases with the band (`pageLineEmphasis()`), so the other
    lines do not jump either.
35. **MushafAyahText's ayah dissolve (5.2) is done here**, as deviation 16 left it to this stage:
    `ayahTextPlan()` on `ayahChanges({token: 'ayahDissolve'})`. 5.2 gives the ayah text no first
    appearance or ending, so it takes the window's: the first ayah appears over `windowIn` on
    `SINE` settled `leadInSeconds` before its first word, and the last holds `endHold` after the
    last word and fades over `endFade` before the end card; the duration grows to it
    (`ayahTextContentFrames()`), as for the recitation. The block is `min(78 % of the frame, the
    measure between the margins)` wide. Its intro card still covers the start (deviation 16).
36. **The noise is grey and opaque before the layer's 1.5 %.** `feTurbulence` alone gives coloured
    noise with a noisy alpha, so its strength would be about half the 1.5 % and tinted; an
    `feColorMatrix` averages the channels and sets alpha 1. Base frequency 0.9, one octave, seed 7,
    as written.
37. **The Look tab shows the motion under the mark** ("Motion: Dissolve · Calm"), the one place the
    panel names the `animation` group, so `group.motion` and the `animation.*` labels of 10.2 are
    shown. Keys beyond 10.4: `look.mark.title`, `look.mark.follows.{word,ayah,none}` (the summary's
    first half: "Follows each word"), `look.mark.motion`, `look.format.busy`, `upgrade.hideDetails`,
    `upgrade.detailsTitle`, `upgrade.busy`. `look.chip.translation` went with the old chips. The
    look names and descriptions are dictionary keys pinned to the look objects by a test; a look a
    code user adds shows its own `name`/`nameAr` and `description`/`descriptionAr`.
38. **The example template's "plain safe-area block"** is the slot's box itself, moved to the safe
    area's sides (54 px, 972 px wide) with nothing drawn around it; its slot's mark is the default
    look's (ink, `#b8913a`, a fade). The template's own gradient and title are its own and stay.

Stage R3 review:

39. **The Format control's vertical hint is not shown on MushafAyahText.** The hint recommends the
    Ayah text composition for reels; on that composition it would point at itself, so the Look tab
    shows it under Vertical on the printed-line compositions only.
40. **With the jadwal drawn, the furniture moves inside its inner rule.** 3.3 and 5.3 put the corner
    label, the repetition counter and the legend's band at the safe area, which is where the jadwal's
    outer rule is, so their glyphs crossed the gold. `frameGeometry(width, height, {jadwal: true})`
    gives insets of at least the inner rule's inside edge plus `0.5 L` (76 px at 16:9; 82 px at the
    sides of 9:16, whose platform bands are already further in), and the three take it when
    `layout.frame` is `'hairline'`. The legend's reserve grows by the same amount, so the lines keep
    their gap to it. The end card's ground covers the jadwal and the intro card is centred, so neither
    moves.
41. **MushafPage draws one border.** Its own double rule (`pageView.frame: 'simple'`) is its jadwal,
    so `layout.frame: 'hairline'` draws nothing more there; with the page border off, the jadwal is
    drawn and the page is fitted inside it. `pageReserve()` (S:page/MushafPage.tsx) reserves, from each
    edge, the larger of the page's own 4 % margin, the jadwal's inside plus `0.5 L`, and on the
    legend's edge its band plus half the page's line box, so the page number no longer sits against
    the legend's first row and a band at one edge does not push the page against the other.
42. **The vignette's ellipse is 60 % × 50 % of the frame** (`radial-gradient(ellipse 60% 50% at 50%
    48%, ...)`), the ellipse 120 % of the width and 100 % of the height across, as 5.10's figures
    read as its size. Taken as radii they put the 100 % stop far outside the frame: the middle of
    every edge stayed under the clear 55 % and the corners got a quarter of `v` (0.06 at Haram
    night). Now the sides take about 0.6 of `v`, the top 0.9 and the corners all of it.
43. **The anti-banding noise is centred on 50 % grey and laid on with `mix-blend-mode: overlay`.**
    Composited normally, the grey grain (about 85 % after the linearRGB conversion) lifted a dark
    ground by about 3 levels. The filter now works in sRGB (`color-interpolation-filters`), so the
    averaged turbulence is centred on 50 %, where overlay changes nothing: the ground keeps its colour
    (Haram night measures within 0.5 of `#121416`), and the 1.5 % opacity is as written.
44. **The page's dimming eases in at the first word, and never compounds.** `pageDimPresence()` rises
    over `markIn` on `SOFT` from the first word, and a line's opacity is `1 − (1 − dimOtherLines) ×
    max(0, presence − emphasis)` (`pageLineDim()`), so the first recited line stays at full ink and
    the others ease down with the band. A word's own opacity (outside the ranges, or at the ink's rest)
    and its line's are not multiplied: the word shows at the lower of the two, and another surah's
    header at `min(dimOtherLines, 0.5)`.
45. **A migration note carries its reason as a code** (`code`, `params`, with `MIGRATION_REASONS` and
    `migrationReasonText()`), and the panel words it through `upgrade.reason.<code>` in English and
    Arabic. `reason` keeps the English text for code users. These keys go beyond 10.4's list.

Stage R4 (documentation, the demo Root, the design stills):

46. **The example template's slot keeps light ink, in the dark ground's tokens.** Its `mushaf` is
    `defaultMushafRecitationSlotProps` written out, except where it sits on the template's own dark
    gradient: ink `#f1eadb`, the translation and labels `#b9b1a2`, the gloss `#8f897d`, and the
    rosettes in Haram night's metal (`frame` and `detail` `#d8b56a`, `accent` `#1a1d20`) with a
    transparent disc. `marginX` stays the template's 40 (the slot's box is 972 px wide, so a
    format's 190 would crowd the line), and the Root keeps leaving out the optional `hostAudio` of
    the three compositions, as before.
47. **The checker is TypeScript, and strips are PNG sequences.** `apps/mushaf-studio/scripts/
    design-check.ts` (run with bun) stands for 12.2's `design-check.py`, with its measures in
    `design-image.ts` and the cases in `design-cases.ts`. A strip is rendered with `remotion render
    --sequence --image-format=png`, not to an MP4 that ffmpeg splits: the measures read what was
    drawn, not a codec's approximation of it. The round bundles the app with `--public-dir` pointing
    at a copy of `public/` that adds the files the cases read, so nothing is written into the app.
48. **Cases measured as the sample allows.** V1's resting ink is sampled on 1:2:4 at f56 (line 1
    holds ayah 2 alone, so no word after 1:2:4 rests at f60). V3's scroll starts at f106, the end of
    ayah 2, which is the `E` of 4.3 for a line that ends on an ayah; the criterion "not before f102"
    holds. V7 and V9 are measured at f63 against the same props without a mark, 1:2:3 placed by
    f56; V9's gold is `#806321`, the tint on this ivory page (`#b19353` is the charcoal value). V10's
    "varies < 1 %" is read as 1 % of the 0-255 range (2.55 levels) of the band's lift over the
    unmarked frame, along its middle row from the rosette's right edge (the rosette's disc, in the
    ground's colour, covers the band) to the left cap; V10's slow re-run is V10 itself, as Haram
    night is slow. V11 is a word wash on Al-Fatihah's 1:2:4 (a kasra under its mīm) at f66, at 16:9
    and 9:16: `MushafPassage` has no highlight, and the sample has no timings for 2:282 or p.106.
    V15's "lines settled" is the line in place at rest (0.6) at the first word. V18 has no turn (the
    sample is one page); its band's cross-fade is measured on f100-f114 against the page without the
    band and the word mark. V19 uses a generated backdrop (a sky with two thin stripes whose
    distance gives the zoom). V20's dissolve is measured on f96-f130.
49. **Releases.** The changelogs' sections are "0.2.0 (unreleased)" and "0.6.0 (unreleased)": the
    versions in `package.json` and the studio's peer range on `@tlawat/remotion-mushaf-line` (still
    `>=0.4.1`, though the studio now needs 0.6.0) move in the release commits, as for earlier
    releases. The studio's earlier unreleased entries sit under "0.1.0 (unreleased)".
50. **Found, not done in this stage.** (a) The interlinear labels still shrink to 70 % and are then
    cut with an ellipsis: 5.1.5's two-row wrap never landed (deviations 10 and 22), so the changelog
    does not list it as fixed. (b) EB Garamond and Amiri have no offline source: every composition
    waits for them from Google Fonts and stops with `FONT_NETWORK` without a network (13.7); both
    READMEs say so. (c) The review of 12.3 against a physical mushaf is a person's to do.
51. **The design stills, round r4** (`bun run --cwd apps/mushaf-studio design`): 27 of 28 measured
    cases pass. V10 at 16:9 fails on its seams (lift 14.7-19.7 levels along the band: deviation 15,
    the phase-2 band of 13.2); V10 at 9:16 passes at f60 (the seams come and go with where the tiles
    fall on the pixel grid). The criteria an eye must judge (the rosettes drawn in line, the card's range order, no lone
    word on the last line, no banding) are listed as "look" in the report.

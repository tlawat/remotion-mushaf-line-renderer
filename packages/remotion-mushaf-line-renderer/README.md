# @tlawat/remotion-mushaf-line

Render lines of the Quran in [Remotion](https://www.remotion.dev) exactly as they are printed in the
KFGQPC V4 (1441H) mushaf, with entrances and exits written in `@remotion/transitions` vocabulary.

![Page 10, line 3 of the mushaf in the normal theme](https://raw.githubusercontent.com/tlawat/remotion-mushaf-line-renderer/main/docs/assets/p10-l3-mandala.png)

- **Printed fidelity.** Every line is set with the per-page glyph fonts published by the
  [Quranic Universal Library (QUL)](https://qul.tarteel.ai) and the line breaks of the printed page.
  One DOM element per word, word gaps exactly as the font defines them.
- **Remotion-native.** Timing comes from the enclosing `<Sequence>`. Entrances and exits are
  `{presentation, timing}` pairs (`fade()`, `slide()`, the package's own `slideFade()`, ...). Fonts
  load behind `delayRender()`. Line data is plain JSON, made for `calculateMetadata()`.
- **Deterministic.** Nothing is painted before the page font is loaded, so a render never captures a
  fallback font, and every settled frame is byte-identical across render workers.
- **Code only, with a fallback.** The mushaf data (QUL's two open exports: the words of the script
  and the line layout) and the page fonts are fetched from Tarteel's CDN at render time. The fonts
  also ship on npm in two separate packages, for when the CDN fails (see
  [When the CDN fails](#when-the-cdn-fails)). This package's tarball holds no data and no fonts.
- **QUL's themes.** Plain glyphs that follow CSS `color`, or the colour font with the ten themes QUL's
  own preview page offers (light, dark, sepia, black, normal, the raw palettes) and custom themes
  down to single palette entries.
- **Surah names and juz names.** Header lines set the surah's name in its printed ornamental frame
  and basmalah lines the basmalah, from QUL's surah-name and `quran-common` fonts; `<MushafSurahName>`
  and `<MushafJuzName>` set them on their own (see [Surah names and juz names](#surah-names-and-juz-names)).
- **Loud.** Every failure is a `MushafError` with a stable `code` and a message that names the fix.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [`<MushafLine>`](#mushafline)
- [Resolving lines](#resolving-lines)
- [Themes](#themes)
- [Sizing](#sizing)
- [Slicing a line](#slicing-a-line)
- [Entrances and exits](#entrances-and-exits)
- [Surah names and juz names](#surah-names-and-juz-names)
- [Fonts](#fonts)
- [When the CDN fails](#when-the-cdn-fails)
- [Data](#data)
- [Per-word hooks](#per-word-hooks)
- [DOM contract](#dom-contract)
- [Environments](#environments)
- [Errors](#errors)
- [Roadmap](#roadmap)
- [Data and licences](#data-and-licences)

## Install

```bash
bun add @tlawat/remotion-mushaf-line
# or: npm install @tlawat/remotion-mushaf-line
```

Peer dependencies: `remotion` and `@remotion/transitions` (4.0.374 or newer) and `react` (18 or newer).

Optional: the fonts for when QUL's CDN fails, `@tlawat/mushaf-fonts-qpc-v4-tajweed` for the colour
themes or `@tlawat/mushaf-fonts-qpc-v4` for `'plain'` (see [When the CDN fails](#when-the-cdn-fails)):

```bash
bun add @tlawat/mushaf-fonts-qpc-v4-tajweed
```

## Quick start

Resolve the line data once in `calculateMetadata()` and pass it to the component. It then runs once
per render instead of once per browser tab, the Studio shows the resolved props, and a `<Player>`
(which never runs `calculateMetadata`) can receive the same JSON.

```tsx
import {AbsoluteFill, Composition, Sequence, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {MushafLine, getMushafLines, slideFade, type MushafLineData} from '@tlawat/remotion-mushaf-line';
// Optional: used only if QUL's CDN fails (see "When the CDN fails").
import tajweedFonts from '@tlawat/mushaf-fonts-qpc-v4-tajweed';

type Props = {lines: MushafLineData[] | null};

const HOLD = 60; // frames each line stays on screen

const calculateMetadata: CalculateMetadataFunction<Props> = async ({props}) => {
  // Every line that carries At-Tawbah 9:1-11, wherever it is printed (the package finds the page).
  const lines = props.lines ?? (await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, theme: 'normal'}));
  return {props: {lines}, durationInFrames: HOLD * lines.length};
};

const Passage: React.FC<Props> = ({lines}) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee', color: '#1b1b1b', justifyContent: 'center'}}>
      {lines!.map((line, i) => (
        <Sequence key={line.line} from={i * HOLD} durationInFrames={HOLD} premountFor={fps} layout="none">
          <MushafLine line={line} enter={slideFade()} exit={slideFade()} fontFallback={tajweedFonts} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const Root = () => (
  <Composition id="Passage" component={Passage} calculateMetadata={calculateMetadata} width={1920} height={1080} fps={30} durationInFrames={1} defaultProps={{lines: null}} />
);
```

A complete project with three compositions, a `<Player>` page and a recitation synced to audio lives
in [`example/`](https://github.com/tlawat/remotion-mushaf-line-renderer/tree/main/example).

## How it works

The V4 mushaf is 604 pages of 15 lines (8 on the first two). QUL publishes one font per page in which
every word is a single pre-shaped glyph; a line is a sequence of code points that only mean something
together with that page's font. This package builds the layout of every page (which words are on
which line) from QUL's exports the first time a line is resolved, and, at render time, fetches the
page font (from QUL's CDN, or from a fonts package when the CDN fails), waits for it, and lays the
words out at the font's own advances. There is no shaping, no
justification and no line breaking to get wrong.

Two things flow through your code:

- **`MushafLineData`**, the plain JSON description of one line (page, line, theme, words). You get it
  from `getMushafLine()` / `getMushafLines()`, ideally in `calculateMetadata()`, and pass it to the
  component. It is safe to store, send through `inputProps` and render on Lambda.
- **`<MushafLine>`**, which renders one `MushafLineData` inside the enclosing `<Sequence>`.

## `<MushafLine>`

```tsx
<MushafLine line={data} />                                              // resolved data (recommended)
<MushafLine page={10} line={3} theme={{base: 'normal', colors: {accent: '#c8a45c'}}} />  // resolved at render time
```

| Prop                     | Type                                               | Notes                                                                                                                                                              |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `line`                   | `MushafLineData`                                   | From `getMushafLine()` / `getMushafLines()`. The recommended form.                                                                                                 |
| `page` + `line`          | `number`, `number`                                 | Convenience form: resolves the line at render time behind its own `delayRender()`. `mushaf` and `theme` pick the appearance, as in `getMushafLine()`.      |
| `theme`                  | see [Themes](#themes)                              | Convenience form only. Resolved data already carries its theme.                                                                                                     |
| `data`                   | `{words?, layout?}`                                | Convenience form only. Where to fetch QUL's two exports from (a mirror via `staticFile()`); default Tarteel's CDN. See [Data](#data).                               |
| `enter`                  | `{presentation, timing?}` or a bare presentation   | Entrance animation. Runs over the local frame of the enclosing `<Sequence>`. `timing` defaults to `enterTiming()`.                                                 |
| `exit`                   | same shape as `enter`                              | Exit animation: the presentation's exiting side over the last `timing.getDurationInFrames()` frames of the enclosing `<Sequence>`. Defaults to `exitTiming()`.      |
| `fit`                    | `'line'` (default) \| `'mushaf'`                   | `'line'` scales the line so it fills its box at the font's own word gaps; `'mushaf'` keeps one type size for every line. See [Sizing](#sizing).                     |
| `slice`                  | `{ayah}` \| `{fromAyah, toAyah?}` \| `null`        | Show only these ayahs of the line, collapsed and centred, at the line's own size. Wins over `line.slice`; `null` cancels it. See [Slicing a line](#slicing-a-line). |
| `fontSize`               | `number` (px)                                      | The base size; default `fontSizeForWidth(useVideoConfig().width)`.                                                                                                 |
| `lineHeight`             | `number` (px)                                      | Default `lineHeightForFontSize(fontSize)`, the height of the root element.                                                                                         |
| `style`, `className`     |                                                    | Applied to the root element. The line inherits its CSS `color` from here.                                                                                          |
| `activeWordId`           | `string \| number \| null`                         | Marks one word as current (`word.id` like `"9:1:3"`, or `word.wordId`). See [Per-word hooks](#per-word-hooks).                                                     |
| `activeWordStyle`        | `CSSProperties`                                    | Applied to that word. Paint properties only.                                                                                                                       |
| `wordStyle`              | `(word, ctx) => CSSProperties`                     | Per-word style, called for every word on every frame with `{line, frame, fps, active, inSlice}`. Paint properties only.                                            |
| `wordClassName`          | `(word, ctx) => string`                            | Appended to `mushaf-word mushaf-word--<kind>`.                                                                                                                     |
| `name`                   | `string`                                           | Wraps the line in `<Sequence layout="none" name>` so it gets a label in the Studio timeline.                                                                       |
| `framed`                 | `boolean` (default `true`)                         | `surah_name` lines only: the name inside its printed ornamental frame, or alone. See [Surah names and juz names](#surah-names-and-juz-names).                      |
| `fontSrc`                | `'cdn'` (default) \| fonts package \| `(file) => url \| url[] \| package` | Where the fonts come from. See [Fonts](#fonts).                                                                                                          |
| `fontFallback`           | fonts package \| fonts package[]                    | Where the page font comes from when `fontSrc` fails. See [When the CDN fails](#when-the-cdn-fails).                                                                 |

There is no start-time prop: place the line in a `<Sequence from>`. There is no `layout` prop: the
root element is a normal-flow block of `width: 100%` and `height: lineHeight`; position it with
`style` or with the enclosing `<Sequence style>`.

Every line type renders: `ayah` lines with the page font, `surah_name` lines as the surah's name in
its printed frame and `basmallah` lines as the basmalah, both from QUL's shared fonts (see
[Surah names and juz names](#surah-names-and-juz-names)). The word props (`slice`, `activeWordId`,
`wordStyle`, ...) apply to ayah lines, which are the only ones with words.

## Resolving lines

All resolvers are pure and Remotion-free: safe in `calculateMetadata()`, in a Node script that
prepares `inputProps`, or in a `<Player>` host. They all take the same optional selection,
`{mushaf?, theme?}` (see [Themes](#themes)) and the same optional `data` source (see [Data](#data)).
The first call per tab fetches the mushaf data; every later call reads the cached layout.

### `getMushafLine({page, line, ...selection}): Promise<MushafLineData>`

One line. Pages are `1..604`, lines `1..15` (`1..8` on pages 1 and 2).

### `getMushafLines(options): Promise<MushafLineData[]>`

Several lines at once, in reading order. Two shapes:

```ts
// Every line of a page, `surah_name` and `basmallah` lines included (they carry no words).
await getMushafLines({page: 187});
// Every line that carries a word of these ayahs, wherever they are printed.
await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11});
// Both shapes take the selection (mushaf and theme).
await getMushafLines({surah: 2, theme: 'light'});
// `slice: true` records the range on the lines it cuts, so <MushafLine> shows only those ayahs.
await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, slice: true});
// `data` builds the lines from your own mirror of QUL's exports instead of Tarteel's CDN.
await getMushafLines({page: 187, data: {words: staticFile('data/qpc-v4/words.json.zip'), layout: staticFile('data/qpc-v4/layout.db.zip')}});
```

The ayah shape finds the page itself, so nothing has to know that At-Tawbah starts on page 187.
`fromAyah` defaults to 1 and `toAyah` to the last ayah of the surah. The first and last lines usually
carry neighbouring ayahs too, because that is how the mushaf is printed; `lineAyahs(line)` says which
ayahs a line holds. Pass `slice: true` to show only the ayahs you asked for (the lines at either end
collapse to their words of the range, centred, and the lines in between stay whole; see
[Slicing a line](#slicing-a-line)), or keep the whole line and mark the range with `wordStyle`, whose
context says whether a word is `inSlice`.

### `getMushafLocation({surah, ayah?, mushaf?, data?}): Promise<{page, line}>`

Where a surah (or one of its ayahs) is printed. `AYAH_NOT_FOUND` names the last ayah of the surah
when you ask for one past its end.

### `sliceWords(line, slice?): MushafWord[]`

The words a slice keeps: the line's own `slice` by default, `null` for the whole line. Use it to skip
a line the range never reaches, or to join word timings to what is on screen.

### `lineAyahs(line): number[]`

The ayahs a line carries, ascending. Synchronous, from `line.words`.

### `MushafLineData`

```ts
type MushafLineData = {
  version: 3;
  mushaf: 'qpc-v4';
  theme: 'plain' | MushafThemeName | MushafTheme;  // a preset by name, or a custom theme resolved to entries
  fontSet: 'qpc-v4' | 'qpc-v4-tajweed';  // the font files the theme needs
  page: number;
  line: number;
  type: 'ayah' | 'surah_name' | 'basmallah';
  centered: boolean;          // centred as printed (last line of a surah, pages 1-2)
  fontFamily: string;         // "mushaf-<fontSet>-p<page>" (ayah lines) or "mushaf-surah-names-v4" (the others): the family under the default font source
  slice?: {ayah: number} | {fromAyah: number; toAyah?: number};  // the ayahs to show, see Slicing a line
  surahNumber?: number;       // surah_name lines (the header's surah) and basmallah lines (carried forward)
  words: Array<{
    id: string;               // "surah:ayah:position", QUL's location key
    wordId: number;           // sequential index in reading order, the ordering key
    surah: number; ayah: number; position: number;
    kind: 'word' | 'end' | 'pause' | 'sajdah' | 'rub-el-hizb';
    text: string;             // 1-4 private-use code points; only meaningful with fontFamily
  }>;
};
```

`words[].id` is the join key for word timestamps. `kind: 'end'` is the ayah-number marker, a real word
with a real width. Standalone marker glyphs (`pause`, `sajdah`, `rub-el-hizb`) are words too; one may
share the location of the word it precedes, so key elements by `wordId`. Never normalise `text`.

## Themes

The `theme` decides how a line is coloured. It is an option of every resolver and of the convenience
form of `<MushafLine>`, and it is recorded on the data, so a line carries its own appearance through
`inputProps` and every render worker. The presets are the ten options QUL offers on its own preview
page (minus `p6`, which the font has no palette for), reproduced colour for colour:

| Theme               | QUL's button | What you get                                                                                              | Background it was made for |
| ------------------- | ------------ | -------------------------------------------------------------------------------------------------------- | -------------------------- |
| `'plain'` (default) |              | The monochrome glyph set. The words take the inherited CSS `color`, so you paint them like any other text. | any                        |
| `'light'`           | Light        | The full tajweed colours: red, orange, blue, green for the recitation rules, grey for silent letters.      | white                      |
| `'dark'`            | Dark         | The tajweed colours re-tuned for a dark page, light letters.                                              | `#343a40`                  |
| `'sepia'`           | Sepia        | The tajweed colours in sepia tones.                                                                       | `#fff7ea`                  |
| `'black'`           | Black        | Everything white, the ayah number black on the marker: a dark-page look without tajweed.                  | `#343a40`                  |
| `'normal'`          | (default)    | The writing in the inherited CSS `color`, the ayah rosette in the font's own colours: how most printed mushafs read. | any               |
| `'p1'`–`'p5'`       | P1–P5        | The font's own CPAL palettes 1–5, untouched (1 is tajweed on dark, 3 is normal in hard black, 4 its white counterpart, 5 an alternative marker colouring). | as the palette |

```tsx
<AbsoluteFill style={{backgroundColor: '#fbf7ee', color: '#1b1b1b'}}>
  <MushafLine page={10} line={3} />                   {/* plain: follows CSS `color` */}
  <MushafLine page={10} line={3} theme="light" />     {/* QUL's tajweed colours */}
  <MushafLine page={10} line={3} theme="normal" />    {/* CSS-coloured writing, coloured ayah rosettes */}
</AbsoluteFill>
<AbsoluteFill style={{backgroundColor: '#343a40'}}>
  <MushafLine page={10} line={3} theme="dark" />      {/* tajweed for a dark page */}
  <MushafLine page={10} line={3} theme="black" />     {/* white writing, black ayah number */}
</AbsoluteFill>
```

![Page 10, line 3 in the black theme](https://raw.githubusercontent.com/tlawat/remotion-mushaf-line-renderer/main/docs/assets/p10-l3-black.png)

Everything but `'plain'` uses QUL's COLR/CPAL colour font, whose glyphs carry their colours in the
font: CSS `color` does not reach them. A theme is exactly what QUL writes into a
`@font-palette-values` rule, a CPAL base palette plus override colours per entry, and the package
declares that rule before the line is painted.

### Custom themes

A custom theme is `{base, colors?, marker?}`: start from a base palette of the font (0–5) or from a
preset (its colours come first), then recolour by **part** or by **CPAL entry**:

```tsx
{/* gold petals on a plain disc */}
<MushafLine page={187} line={2} theme={{base: 'normal', colors: {accent: '#c8a45c', background: 'transparent'}}} />
{/* tajweed switched off, letters in the page colour */}
<MushafLine page={187} line={2} theme={{base: 'light', colors: {rules: 'currentColor'}}} />
{/* one rule colour at a time, by entry */}
<MushafLine page={187} line={2} theme={{base: 'light', colors: {'7': '#1b6f3f'}}} />
{/* the font's own white-text palette, ayah number in gold on the marker only */}
<MushafLine page={187} line={2} theme={{base: 4, marker: {frame: '#c8a45c'}}} />
```

| Part         | CPAL entries        | Paints                                                                                            |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| `ink`        | 0, 14               | The letters                                                                                       |
| `silent`     | 1, 2, 15            | The greyed letters that are written but not pronounced                                            |
| `rules`      | 3, 4, 5, 6, 7, 8, 9 | The seven tajweed rule colours (prolongations, ghunnah, qalqalah, ...); 7 is the 2-vowel prolongation |
| `frame`      | 13                  | The ayah-end rosette's frame and curls, and the ayah number inside it                             |
| `accent`     | 11                  | The petal flourishes above and below the rosette                                                  |
| `detail`     | 10                  | The small jewel at the top of the rosette                                                         |
| `background` | 12                  | The disc behind the ayah number                                                                   |

A numeric key (`'7'`) wins over a part that contains that entry, whatever the order. `marker`
colours apply to the ayah-number marker glyph only, over `colors`; that is how `'black'` keeps its
number readable. Values are ordinary CSS colours (`'#1b6f3f'`, `'rgb(27 111 63)'`,
`'hsl(150 60% 27%)'`, `'crimson'`, `'transparent'`) plus `'currentColor'`, the inherited CSS `color`,
which the package resolves from the line's computed colour at render time. That resolution is per
line, not per word: to colour words individually (`wordStyle`, `activeWordStyle`), use `'plain'`.

Anything wrong is loud: an unknown preset, a base the font does not have, an entry outside 0–15 or
an unknown part is `BAD_THEME`; a value that is not a colour is `BAD_COLOR`. `MUSHAF_THEMES` exports
the presets as theme objects and `MUSHAF_THEME_NAMES` their names, for Studio schemas.

On the data, a preset is recorded by name and a custom theme resolved down to its base and entries,
so it is self-contained:

```ts
const line = await getMushafLine({page: 187, line: 2, theme: {base: 'normal', colors: {accent: '#c8a45c'}}});
// line.theme === {base: 3, colors: {0: 'currentColor', 1: 'currentColor', ..., 11: '#c8a45c', ...}}
```

`font-palette` shipped in Chrome 101, Safari 15.4 and Firefox 107; in anything older a colour-font
line paints the font's default palette (the tajweed colours) and everything else still works.

## Sizing

The fonts have `unitsPerEm = 2500` and the widest line of the mushaf is 42,501 units, so every line
fits a box of width `W` at roughly `W / 17`. That is the base size, computed from
`useVideoConfig().width`, and `lineHeight` defaults to `2.2 em`, which keeps the glyph extremes
(`+1.37 em` above and `−0.73 em` below the baseline) inside the box so stacked lines never collide.

`fontSizeForWidth(width, mushaf?)` and `lineHeightForFontSize(fontSize)` are the two numbers
`<MushafLine>` computes by default, exported for when a line sits inside margins:
`fontSizeForWidth(width - 2 * margin)`.

The printed lines are not all the same width (full lines run from about 39,000 to 43,700 units), so
the base size alone cannot make each one reach the margin. `fit` decides what happens with the
difference:

| `fit`              | What you get                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `'line'` (default) | The line is scaled so it fills its box exactly, at the word gaps the page font defines. This is the printed page. |
| `'mushaf'`         | One type size for every line; a line narrower than the base simply stops short of the left margin.             |

The word gaps are never touched. The glyph advances of these fonts already include the spacing between
words, so the row places each word at its own advance from the right margin and nothing is distributed
between them. Stretching a line with `justify-content: space-between` would inflate every gap.
Centred lines (the last line of a surah, pages 1-2) are centred and never stretched under either `fit`.

Fitting measures the row once, after the page font has loaded and before the first frame is painted,
so it is deterministic. Where there is no layout to measure (a server render, a zero-width box), the
base size stands.

## Slicing a line

A printed line often carries the tail of one ayah and the start of the next; 44 % of the ayah lines
of this mushaf hold more than one ayah. `slice` shows only the ayahs you name:

```tsx
<MushafLine line={line} slice={{ayah: 2}} />                   {/* one ayah */}
<MushafLine line={line} slice={{fromAyah: 2, toAyah: 4}} />    {/* a range */}
<MushafLine line={line} slice={{fromAyah: 2}} />               {/* from 2 to the end of the line */}
```

The words of the other ayahs are hidden and the words that remain are **centred in the measure**, so
each slice reads as a line of its own. Three things are kept exactly:

- **The type size.** The fit is measured from the whole line before the slice is applied, so a slice
  is never zoomed to fill the measure and two slices of one line render at one size. This is why
  `slice` and `fit` are independent, and why a slice can change on every frame at no cost.
- **The printed advances.** The kept words sit at the font's own spacing, exactly as on the page.
- **The DOM.** Every word span stays in the document (a hidden one carries `data-hidden="true"`,
  `.mushaf-word--hidden` and `display: none`), so `.mushaf-word` selectors and word counts still hold.

A slice that keeps every word of a line changes nothing (the interior lines of a sliced passage
render as printed) and one that keeps none paints nothing and throws nothing, so one selector can be
applied to a whole run of lines. The ayah-end rosette goes with the ayah it closes. `wordStyle` is
still called for every word with `inSlice` in its context, but cannot re-show a hidden one;
`activeWordId` may name a hidden word (it stays current, just unpainted). `revealRtl` sweeps the
whole measure, so a centred slice appears as the sweep reaches it.

The range is `{ayah}` or `{fromAyah, toAyah?}`, never a list: a line's ayahs are contiguous, so a
list would only mean its outer range, and hiding an ayah *between* two kept ones would put words
side by side that the mushaf never printed together.

`getMushafLines({surah, fromAyah, toAyah, slice: true})` records the range as `line.slice` on the
lines it cuts (the first and/or last of the passage, when they carry words of other ayahs), so a
resolved passage carries its own slicing through `inputProps`; the lines in between carry no slice.
The `slice` prop wins over it, and `slice={null}` cancels it.

## Entrances and exits

`enter` takes the entering side, and `exit` the exiting side, of any DOM presentation from
`@remotion/transitions` or from this package:

| Presentation                                          | Works                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `slideFade()`, `revealRtl()` (this package)           | yes                                                                                                                      |
| `fade()`, `slide()`, `wipe()`, `flip()`               | yes                                                                                                                      |
| `clockWipe({width, height})`, `iris({width, height})` | yes, pass the line box size                                                                                              |
| `pushCut()`, `none()`                                 | yes                                                                                                                      |
| `dissolve()`, `ripple()`, `crosswarp()`, `crossZoom()`, `swap()`, `bookFlip()`, `zoomBlur()`, `dreamyZoom()`, `filmBurn()`, `linearBlur()`, `zoomInOut()` | no: these capture the scene to a canvas and need an exiting scene. The line throws `CANVAS_PRESENTATION`. |

`timing` is optional: `enter` defaults to `enterTiming()` and `exit` to `exitTiming()`, and a bare
presentation is accepted as shorthand, so `enter={slideFade()}` means
`enter={{presentation: slideFade(), timing: enterTiming()}}`.

### The package's presentations and timings

- **`slideFade(props?)`**: a short vertical slide combined with a fade, the one to reach for when a
  line replaces another. The line is fully opaque at 75 % of an entrance (the rest is a pure settle)
  and fully gone at 70 % of an exit, and it travels 28 % of a line box rather than half the screen.
  Props: `{direction: 'up' | 'down', distance, enterOpacityAt, exitOpacityAt, exitDistanceScale, enterStyle, exitStyle}`.
- **`revealRtl(props?)`**: reveals the line in reading direction (right to left). `softness` (in % of
  the line, default `0`) fades the edge with a `mask-image` gradient instead of cutting it with a
  `clip-path`. Same shape as `fade()`, so it also works inside a real `<TransitionSeries>`.
- **`enterTiming(options?)`**: 0.5 s on `Easing.bezier(0.2, 0, 0, 1)`. It eases out of nothing,
  covers the distance in the middle and decelerates for a long time into place, so both ends are
  gentle. A linear timing starts and stops abruptly, and abrupt is what reads as mechanical.
- **`exitTiming(options?)`**: 0.32 s on `Easing.bezier(0.4, 0, 1, 1)`, accelerating away. Exits are
  shorter than entrances on purpose.
- **`springyTiming(options?)`**: a spring instead of a curve, for a physical settle
  (`{config: {damping: 200}}` does not overshoot).

Options: `{seconds?, durationInFrames?, easing?}`. `seconds` is resolved against the composition's
fps at render time, so one timing object suits 24, 30 and 60 fps. They are ordinary
`TransitionTiming`s and work in a `<TransitionSeries.Transition>` too.

### How progress is computed

Entrance progress is `timing.getProgress({frame: localFrame, fps})`, clamped to `1` after
`timing.getDurationInFrames({fps})`. The exit runs over the last `getDurationInFrames` frames of the
enclosing `<Sequence>` (its `durationInFrames`) and is `0` before that window, so there is no extra
timeline prop: a line leaves because its Sequence ends. Both sides are rendered exactly as
`<TransitionSeries>` renders them, so custom presentations written for it work unchanged.

Exiting sides of the stock presentations: `slide` pushes the line out, `wipe`, `flip`, `clockWipe` and
`iris` uncover or fold it away, `revealRtl` hides it in reading direction, `none` does nothing, and
`fade()` keeps the exiting line fully visible unless you ask for `fade({shouldFadeOutExitingScene: true})`.

### Replacing lines

To show one line after another in the same place, give every line one slot of `HOLD` frames: its
entrance runs over the first `enterTiming()` frames, its exit over the last `exitTiming()` frames, and
the next line's Sequence begins exactly where this one ends.

```tsx
{lines.map((line, i) => (
  <Sequence key={line.line} from={i * HOLD} durationInFrames={HOLD} premountFor={fps} style={{top, height: lineHeight}}>
    <MushafLine line={line} enter={slideFade()} exit={slideFade()} />
  </Sequence>
))}
```

That is a *fade through*: the slot is briefly empty rather than holding two half-visible lines, which
for text reads far better than a cross-fade where both lines are legible at once and neither is
readable. Overlapping the Sequences (`durationInFrames={HOLD + ENTER}`, next line at `i * HOLD`)
gives the cross-fade instead, which suits `slide()`. `<TransitionSeries>` works too: put each
`<MushafLine>` (without `enter`/`exit`) in a `<TransitionSeries.Sequence>` and let the series drive
both sides.

## Surah names and juz names

The page fonts hold a page's words only. Two more fonts QUL publishes hold what is printed around
them, and the package draws from both:

| Font                                                              | Holds                                                                                        | Size (woff2) |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------ |
| `surah-names-v4` ([QUL resource 237](https://qul.tarteel.ai/resources/font/237), the V4 surah-name font) | The 114 surah names as written above their first ayah, and the basmalah.       | 830 KB       |
| `quran-common` ([QUL resource 459](https://qul.tarteel.ai/resources/font/459), the juz-name font)      | The 30 juz names, in two forms, and the ornamental frame a surah name is printed in. | 67 KB      |

They are fetched from QUL's CDN by default, like the page fonts, behind `delayRender()`, and nothing
is painted before they are in. Their glyphs are plain outlines in Chromium (so in every Remotion
render): they take the inherited CSS `color`, whatever the theme. (The surah-name font also carries
SVG colour glyphs, which Firefox and Safari paint in the font's own colours.)

### Header and basmalah lines

A `surah_name` line from `getMushafLines({page})` renders as printed: the name of the surah
(`line.surahNumber`) inside the frame, which spans the widest line of the mushaf at the line's type
size, so it fills the measure the way a justified line does. A `basmallah` line renders the basmalah
on the page baseline, centred. Both take the same props as an ayah line; `framed={false}` sets the
name without its frame:

```tsx
// Every line of page 187, At-Tawbah's header first.
const lines = await getMushafLines({page: 187});
{lines.map((line, i) => (
  <Sequence key={line.line} from={i * HOLD} durationInFrames={HOLD}>
    <MushafLine line={line} enter={slideFade()} />   {/* header, then ayah lines: one component */}
  </Sequence>
))}
<MushafLine line={header} framed={false} />          {/* the name alone */}
```

### `<MushafSurahName surah>` and `<MushafJuzName juz>`

The same glyphs as standalone elements, for a title card or a label: a block of `width: 100%` and
height `lineHeight` (default `2.2 × fontSize`, the line grid), the glyph centred in it, with the
line's sizing, animation and font props (`fontSize`, `lineHeight`, `style`, `className`, `enter`,
`exit`, `name`, `fontSrc`, `fontFallback`; `mushaf` selects the mushaf):

```tsx
<MushafSurahName surah={36} />                       {/* Ya-Sin, in its frame, spanning the width */}
<MushafSurahName surah={36} framed={false} fontSize={160} lineHeight={300} enter={slideFade()} />
<MushafJuzName juz={22} />                           {/* "the twenty-second juz", written out */}
<MushafJuzName juz={1} variant="opening" />          {/* the juz by its first words: "Alif Lam Mim" */}
```

`surah` is 1–114 (`SURAH_OUT_OF_RANGE` otherwise) and `juz` 1–30 (`JUZ_OUT_OF_RANGE`). The layout
data carries no juz boundaries, so which juz a line belongs to is yours to say.

### Loading and mirroring the shared fonts

- **Fonts.** `fontSrc` reaches these fonts too: a resolver receives a `MushafFontFile` with
  `kind: 'shared'`, `font` (`'surah-names-v4'` or `'quran-common'`), `fileName` (`surah_names.woff2`,
  `quran-common.woff2`) and `cdnUrl`. The fonts packages hold page fonts only, so a package as
  `fontSrc` is refused with `BAD_FONT_SRC` by anything that needs a shared font, and `fontFallback`
  never applies to them. To serve them yourself, put the two files in `public/` (this repository's
  `bun run qul fonts` downloads them, and the CDN URLs are in `getMushafFontFile({font})`) and
  resolve them there; a resolver may return a fonts package for the page files, so one resolver
  covers everything:

  ```tsx
  <MushafLine line={line} fontSrc={(f) => (f.kind === 'page' ? tajweedFonts : staticFile(`fonts/${f.font}/${f.fileName}`))} />
  ```

- **`loadSharedFont({font, fontSrc?})`** warms a shared font the way `loadPageFont()` warms a page
  font, for a `<Player>`: `loadSharedFont({font: 'surah-names-v4'}).waitUntilDone()`.
- **Sizes.** The surah-name font is 830 KB, a page font's tenfold: warm it, or give the first header
  a `premountFor` of a second or two.

### DOM contract

```html
<div class="mushaf-line" data-line-type="surah_name" data-surah="9" data-framed="true" data-centered="true" data-page="187" data-line="1" data-font-origin="cdn|package|custom" ...>
  <div class="mushaf-line__row" style="position:absolute;inset:0;visibility:hidden|visible">
    <span class="mushaf-glyph mushaf-glyph--frame" data-glyph="frame" data-font="quran-common">&#xE000;</span>       <!-- unless framed={false} -->
    <span class="mushaf-glyph mushaf-glyph--surah-name" data-glyph="surah-name" data-font="surah-names-v4">&#xFC52;</span>
  </div>
</div>
<div class="mushaf-line" data-line-type="basmallah" ...><div class="mushaf-line__row"><span class="mushaf-glyph mushaf-glyph--basmalah" ...>...</span></div></div>
<div class="mushaf-surah-name" data-surah="9" data-framed="true" ...><div class="mushaf-surah-name__row">...</div></div>
<div class="mushaf-juz-name" data-juz="22" data-variant="ordinal" ...><div class="mushaf-juz-name__row"><span class="mushaf-glyph mushaf-glyph--juz-name" ...>&#xE016;</span></div></div>
```

Each glyph fills its row and is centred in it by `text-align` and a single line box; a `transform`
on the span shifts it so the ink, not the em box, is centred. Do not change their font or size.

## Fonts

Each page has its own font: 71 KB (monochrome) or 85 KB (colour) as woff2 for a typical page, 114 KB
at most. By default it is fetched from QUL's CDN
(`https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/{v4|v4-tajweed}/woff2/p{N}.woff2`, CORS `*`),
checked for its magic bytes, registered with `new FontFace()` with the mushaf's metrics pinned, and
only then is the line painted. Renders wait for it behind a labelled `delayRender()`.

Where the font comes from is `fontSrc`, a prop of `<MushafLine>` (and an option of `loadPageFont()`):

| `fontSrc`                                   | The font comes from                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `'cdn'` (default)                           | QUL's CDN.                                                                                                        |
| a fonts package (`import fonts from '…'`)   | The package only, bundled with your code: the CDN is never contacted. Page fonts only: see [Surah names and juz names](#surah-names-and-juz-names). |
| `(file) => url` or `(file) => [url, …]`     | Your own URLs, tried in order. `file` is a `MushafFontFile`: `{kind: 'page', fontSet, page, format, fileName, cdnUrl, …}` for a page font, `{kind: 'shared', font, fileName, cdnUrl, …}` for a shared font. For a page file the resolver may return a fonts package instead. |

`fontFallback` adds a fonts package after the source: it is used only when the source fails.

```tsx
// Your own mirror in public/ (copy the files there yourself): note page 328 of the colour set is .woff.
<MushafLine line={line} fontSrc={(f) => staticFile(`fonts/${f.kind === 'page' ? f.fontSet : f.font}/${f.fileName}`)} />
// A mirror, then QUL's CDN.
<MushafLine line={line} fontSrc={(f) => [`https://fonts.example.com/${f.kind === 'page' ? f.fontSet : f.font}/${f.fileName}`, f.cdnUrl]} />
```

`getMushafFontFile({page, theme?, mushaf?})` and `getMushafFontFile({font})` return the same
`MushafFontFile` a resolver receives.

- **One face per source.** Lines with different sources never share a font face: each source loads
  its own, under its own family (`mushaf-<fontSet>-p<page>` for the CDN, with a suffix for anything
  else), so a line's font depends only on its own props and every render tab paints the same.
- **Slow or cold CDN during a render:** raise the render budget, `npx remotion render --timeout=60000`
  (or `timeoutInMilliseconds` in the Node APIs). The fetch budget adapts to it. Or pass a fallback.
- **CDN gaps:** the registry knows the pages whose woff2 is missing on the CDN (page 328 of the
  colour set is served as woff) and fetches the format that exists.
- **`<Player>` warm-up:** the Player does not run `calculateMetadata`, and a line mounted at frame 0
  would show nothing until its font arrives. Call `loadPageFont({page, theme, fontSrc, fallback})`
  with the same sources as the line when your page loads, or mount the line early with
  `<Sequence premountFor>`.
- **`premountFor`:** Remotion 4 does not premount by default. Give each `<Sequence>` a `premountFor`
  of a second or so; the font then loads while the line is still hidden and the entrance starts on
  time, both in the Player and in renders.

### `loadPageFont({page, theme?, mushaf?, fontSrc?, fallback?}): {fontFamily, waitUntilDone, origin}`
### `loadSharedFont({font, mushaf?, fontSrc?}): {fontFamily, waitUntilDone, origin}`

Google-fonts style loader. Idempotent; wraps `delayRender()` / `cancelRender()` internally; a no-op
during server rendering. `<MushafLine>` calls it for you. Call it yourself to warm a font in a
`<Player>` before the line mounts, with the sources the line will use:

```ts
const font = loadPageFont({theme: 'light', page: 10, fallback: tajweedFonts});
await font.waitUntilDone();
font.origin(); // 'cdn' | 'package' | 'custom'
```

## When the CDN fails

By default every page font comes from QUL's CDN. When the CDN is unreachable (an outage, a firewall,
a cloud render in a VPC with no outbound access) or keeps timing out, the render fails after its
retries with `FONT_HTTP`, `FONT_NETWORK` or `FONT_TIMEOUT`. For those cases the fonts ship on npm,
unmodified, in two packages:

| Package                                  | For                                                                    | Size  |
| ---------------------------------------- | ---------------------------------------------------------------------- | ----- |
| `@tlawat/mushaf-fonts-qpc-v4`           | the `'plain'` theme (monochrome glyphs that follow CSS `color`)        | 43 MB |
| `@tlawat/mushaf-fonts-qpc-v4-tajweed`   | every other theme (the colour font)                                    | 51 MB |

Install the one your theme uses (or both) and pass it as `fontFallback`:

```bash
npm i @tlawat/mushaf-fonts-qpc-v4-tajweed
```

```tsx
import tajweedFonts from '@tlawat/mushaf-fonts-qpc-v4-tajweed';

<MushafLine line={line} fontFallback={tajweedFonts} />
// Both sets, when themes vary: the line picks the one its theme uses.
<MushafLine line={line} fontFallback={[plainFonts, tajweedFonts]} />
```

- **The CDN is still tried first,** with its usual retries. Only when it fails is the page loaded
  from the package; a warning is logged (once per font set) and the line root gets
  `data-font-origin="package"`. While rendering, the CDN's budget leaves at least 6 s of the
  `delayRender` timeout for the fallback.
- **Nothing to copy, no script to run.** The package lists every page as
  `new URL('./fonts/p<page>.woff2', import.meta.url)`, so the bundler emits the files as assets:
  Remotion's bundler (the Studio, `bundle()`, the CLI, Lambda and Cloud Run sites, including under a
  non-root `publicPath`), Vite and Next.js (Turbopack and webpack) all serve them. A page is only
  downloaded when a line needs it.
- **Checked before use.** Each file's size and SHA-256 are compared with what the package declares
  (SHA-256 needs a secure context: https or localhost); a mismatch is `FONT_FALLBACK_INVALID`, never
  masked by another source. When the package fails too, `FONT_UNAVAILABLE` lists every attempt.
- **Offline or reproducible renders:** pass the package as the only source,
  `fontSrc={tajweedFonts}`: the CDN is never contacted and every frame uses the same files.
- **A wrong set is caught early.** A fallback that does not hold the line's font set throws
  `BAD_FONT_FALLBACK` the first time the line renders, not during an outage.
- **Page fonts only.** The surah-name and juz fonts are not in the packages: header lines,
  `<MushafSurahName>` and `<MushafJuzName>` fetch them from the CDN, or from the URLs a `fontSrc`
  resolver gives (see [Surah names and juz names](#surah-names-and-juz-names)).
- **Cost.** Importing a package puts all of its files in every bundle you build (43 or 51 MB of
  assets; the JavaScript only grows by the list of URLs). A Lambda site uploads them once and
  afterwards only when they change.
- **Snapshots.** A package holds QUL's fonts as of its version date (`1.<YYYYMMDD>.<patch>`). QUL
  occasionally rebuilds pages in place; if the CDN has a newer build than your package, pages that
  fall back are drawn from the older one. Keep the package current, or use `fontSrc={pkg}` when every
  frame must come from the same files.
- **Player hosts** serve the package's assets like any other import. With a Content Security Policy,
  allow `connect-src https://static-cdn.tarteel.ai` for the CDN (the package's files are same-origin).
- **Licence.** The fonts are © King Fahd Glorious Qur'an Printing Complex, redistributed unmodified
  as QUL publishes them; they are not open source. See each package's `LICENSE.md`.

## Data

The package carries no mushaf data. A line is built from QUL's two raw exports, fetched the first
time a line is resolved in a tab (or in a Node script) and cached from then on:

- the words of the QPC V4 script (`qpc-v4.json`, one entry per word: surah, ayah, position and the
  one to four private-use code points the page font renders);
- the 15-line layout (`qpc-v4-tajweed-15-lines.db`, a SQLite `pages` table: page, line, type,
  centred, first and last word).

Both are zips on Tarteel's CDN, `https://s3.us-east-1.wasabisys.com/static-cdn.tarteel.ai/qul-exports/…`,
pinned to one publication each (QUL publishes every export under a new prefix; the repository's
`bun run qul data` mirrors, records and validates the pinned ones). The package unzips them, reads
the SQLite file and joins the two in memory, about 1.2 MB over the wire and a few hundred
milliseconds, once per tab, then checks the result structurally: page count, lines per page,
contiguous word ids, one ayah marker per ayah, glyph texts in the fonts' range.

- **`data`** on `getMushafLine()`, `getMushafLines()`, `getMushafLocation()`, `loadMushafData()`
  and the `<MushafLine page line>` form names other sources: `{words?, layout?}`, each an absolute
  URL, a `staticFile()` result or a root-relative path, zipped or unzipped (the words as JSON, the
  layout as SQLite or as a JSON array of its rows). Anything left out comes from the CDN.
- **Mirror the exports** for renders that must not depend on the CDN (every render tab and every
  Lambda chunk fetches them otherwise): put the two zips in `public/` (`bun run qul data` in this
  repository writes them to `example/public/data/qpc-v4/`) and resolve with

  ```ts
  const data = {words: staticFile('data/qpc-v4/words.json.zip'), layout: staticFile('data/qpc-v4/layout.db.zip')};
  const lines = await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, data});
  ```

  in `calculateMetadata()`, so every tab gets the same JSON and nothing is fetched at render time
  but the fonts. `staticFile()` carries a non-root `publicPath`, so Lambda sites find their mirror.
  The exports are open data; mirroring them is fine.
- **CORS:** a browser tab (the Studio, the Player and every renderer, `calculateMetadata()`
  included) fetches cross-origin, so a mirror on another origin must send
  `Access-Control-Allow-Origin`; a mirror in `public/` needs nothing.
- **`<Player>` warm-up:** the Player never runs `calculateMetadata`, so either pass resolved lines
  or call `loadMushafData()` when the page loads.
- **Slow or cold CDN during a render:** raise the render budget (`--timeout`), as for the fonts; the
  fetch budget adapts to it.
- **Node:** a script that prepares `inputProps` needs Node 20.12 or newer to inflate the zips
  (`DecompressionStream`), or a `data` source pointing at the unzipped files; and it needs absolute
  URLs, since a root-relative path means nothing outside a browser.

### `loadMushafData({mushaf?, data?}): Promise<void>`

Loads the mushaf data ahead of time: the same load `getMushafLine()` makes, cached once per source,
so calling both costs nothing extra. For a `<Player>`, which never runs `calculateMetadata`, call it
when the page loads so the first line resolves without a round trip. Pure and Remotion-free.

## Per-word hooks

Every word is its own element, and three props let you drive them, for a karaoke-style follow or to
dim the ayahs outside a range:

```tsx
<MushafLine
  line={line}
  activeWordId={currentWordId}                       // "9:1:3" or a wordId
  activeWordStyle={{color: '#b30000'}}
  wordStyle={(word, {active}) => ({opacity: active || word.ayah === 5 ? 1 : 0.35})}
  wordClassName={(word) => `ayah-${word.ayah}`}
/>
```

The active word gets `data-active="true"`, the class `mushaf-word--active` and `activeWordStyle`.
`wordStyle` and `wordClassName` are called for every word on every frame with
`{line, frame, fps, active, inSlice}`; keep them pure so renders stay deterministic. Use paint properties only
(`color`, `opacity`, `filter`, `background`, `textShadow`): anything that changes glyph metrics would
break the printed line breaks and is overridden by the pinned row style. Under any theme but
`'plain'` the glyph colours come from the font, so per-word `color` only reaches the plain theme.

## DOM contract

```html
<div class="mushaf-line" data-mushaf="qpc-v4" data-theme="plain" data-page="10" data-line="3" data-line-type="ayah" data-centered="false" data-font-origin="cdn|package|custom" data-sliced="<first>-<last>|empty" style="position:relative;width:100%;height:<lineHeight>px">
  <!-- data-font-origin is present once the page font has loaded; data-sliced only while a slice is in effect -->
  <!-- presentation wrapper when `enter` / `exit` is set (an AbsoluteFill for the stock presentations) -->
  <!-- font-palette is set on the row for every theme but plain; the ayah marker gets its own when the theme colours it apart -->
  <div class="mushaf-line__row" style="position:absolute;inset:0;display:flex;direction:rtl;...;visibility:hidden|visible">
    <span class="mushaf-word mushaf-word--word" data-word-id="1234" data-location="2:62:1" data-surah="2" data-ayah="62" data-position="1" data-kind="word">ﱁ</span>
    <span class="mushaf-word mushaf-word--word mushaf-word--active" ... data-active="true">ﱂ</span>
    <span class="mushaf-word mushaf-word--word mushaf-word--hidden" ... data-hidden="true" style="display:none">ﱃ</span>  <!-- outside the slice -->
    ...
    <span class="mushaf-word mushaf-word--end" ...>ﱊ</span>
  </div>
</div>
```

Word elements are stable hooks for your own CSS (`.mushaf-word--end { opacity: .8 }`). Do not change
their font, spacing or `direction`.

## Environments

Works in the Studio, `renderMedia()` / `renderStill()` / the CLI, Lambda and the `<Player>`:

- Every browser tab creates and releases its own `delayRender()` handles; concurrency is safe.
- The mushaf data is fetched once per tab, the first time a line is resolved, from Tarteel's CDN or
  from the `data` source given (a mirror pinned through `staticFile()` follows a non-root
  `publicPath` on Lambda sites), and compiled in memory; see [Data](#data).
- Under `<Sequence premountFor>` the font loads while the line is hidden; the row is never visible
  with a wrong font, not even for one frame after a remount.
- The line ignores hostile page CSS (`letter-spacing`, `font-weight`, `text-transform`, ...).

## Errors

Every failure is a `MushafError` (`{code, message, details?}`); `isMushafError(e)` recognises one
across package copies.

| Code                                     | Meaning and fix                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN_MUSHAF`                         | `mushaf` is not `'qpc-v4'`.                                                                                                                    |
| `UNKNOWN_FONT`                           | `font` is not `'surah-names-v4'` or `'quran-common'`.                                                                                          |
| `SURAH_OUT_OF_RANGE`, `JUZ_OUT_OF_RANGE` | `surah` must be `1..114`, `juz` `1..30` (and `variant` `'ordinal'` or `'opening'`).                                                            |
| `BAD_THEME`                              | `theme` must be `'plain'`, a preset name or `{base, colors?, marker?}`; a base the font lacks, an entry outside 0–15 or an unknown part. |
| `BAD_COLOR`                              | A theme colour is not a CSS colour.                                                                                                            |
| `BAD_SLICE`                              | `slice` must be `{ayah}` or `{fromAyah, toAyah?}` with positive integers (`toAyah` not before `fromAyah`); `slice: true` only on the ayah form of `getMushafLines()`. |
| `AYAH_NOT_FOUND`                         | `getMushafLines({surah, ...})` / `getMushafLocation()` was asked for a surah or ayah the mushaf does not have; the message names the last ayah. |
| `PAGE_OUT_OF_RANGE`, `LINE_OUT_OF_RANGE` | Pages are `1..604`; lines `1..15` (`1..8` on pages 1 and 2). The message names the page's line count.                                          |
| `BAD_LINE_PROP`                          | Pass `line={MushafLineData}` or `page` + `line={number}`, and `theme` / `mushaf` / `data` only with the second form.                           |
| `BAD_LINE_DATA`                          | `line` is not a `MushafLineData` from this package version (the message names the field). Older data must be re-resolved.                      |
| `UNSUPPORTED_LINE_TYPE`                  | An internal renderer was given a line of another type; `<MushafLine>` never raises it.                                                          |
| `BAD_ENTER`, `BAD_EXIT`                  | `enter` / `exit` must be a presentation or `{presentation, timing?}` with a `TransitionTiming`; `BAD_EXIT` also when the Sequence has no finite length. |
| `BAD_SIZE`                               | `fontSize` / `lineHeight` must be positive finite numbers.                                                                                     |
| `BAD_DATA_URL`                           | `data.words` / `data.layout` is not an absolute URL, a `staticFile()` path or a root-relative path, or is root-relative in Node, where only an absolute URL can be fetched. |
| `DATA_HTTP`                              | An export URL answered with an HTTP error (404: QUL re-published under a new prefix, or your mirror path is wrong). The message names the pinned URL. |
| `DATA_NETWORK`                           | The fetch failed (offline, CORS on a mirror, blocked host). Mirror the exports into `public/` and pass them as `data`.                         |
| `DATA_TIMEOUT`                           | The fetch did not finish within the render budget: raise `--timeout` or mirror the exports.                                                    |
| `DATA_INVALID`                           | The response is not the export (an HTML page, a truncated zip, another mushaf, a broken reading order). The message names the file and the first problem. |
| `DATA_LOAD_FAILED`                       | Something unexpected while loading the data (the message carries it), or a page or line the loaded layout does not have.                       |
| `BAD_FONT_SRC`                           | `fontSrc` is not `'cdn'`, a fonts package or a resolver, a resolver returned no URL, a package holds the other font set, a package was given for a shared font (the packages hold page fonts only), or a removed option (`url`, `fontUrl`) was passed. |
| `BAD_FONT_FALLBACK`                      | `fontFallback` is not a fonts package (or an array of them), or none of them holds the line's font set. Install the package the message names. |
| `FONT_HTTP`                              | The font URL answered with an HTTP error (404: check the page number and the CDN path or your mirror).                                         |
| `FONT_NETWORK`                           | The fetch failed (offline, CORS on a mirror, blocked host). Pass a fonts package as `fontFallback`.                                            |
| `FONT_TIMEOUT`                           | The fetch did not finish within the render budget: raise `--timeout`, or pass a fonts package as `fontFallback`.                               |
| `FONT_INVALID`                           | The response is not a font file (an HTML error page, for example). The message shows the first bytes.                                          |
| `FONT_PARSE`, `FONT_NOT_AVAILABLE`       | The browser rejected the font bytes or did not register the face; the file is corrupt or not a WOFF2/WOFF/TTF/OTF.                             |
| `FONT_FALLBACK_INVALID`                  | A fonts package served other bytes than it declares (size or SHA-256). Reinstall it; make sure nothing in your build rewrites font files.     |
| `FONT_UNAVAILABLE`                       | The source and the fallback both failed; the message lists every attempt. Check that the fonts package is imported where the composition is defined. |
| `CANVAS_PRESENTATION`                    | The presentation captures the scene to a canvas; use a DOM presentation.                                                                       |

The delayRender label `<MushafLine> page N line M: waiting for font ...` appearing in a timeout means
the font never arrived within `--timeout`; the error code above tells you why when the fetch itself
failed.

## Roadmap

Additions planned without breaking the API: the shared fonts in the fonts packages (today they come
from the CDN or your own URLs), a Studio-editable wrapper with a Zod schema, further mushaf layouts
from QUL.

## Data and licences

The lines are built at render time from QUL's exports of mushaf layout 19 (KFGQPC V4, 1441H), the
words of the script and the line layout, open data published by [QUL](https://qul.tarteel.ai), and
checked against the printed page's invariants (9,046 lines, 83,668 words, one ayah marker per ayah)
both at load time and by the repository's `qul` CLI. The fonts are the King Fahd Complex fonts as
published by QUL (the page fonts, the surah-name font and `quran-common`), fetched from QUL's CDN at
render time, and the page fonts are redistributed unmodified in the two fonts packages (see their
`LICENSE.md`). Neither the data nor the fonts are
part of this package. Please respect the terms of the [King Fahd Complex](https://qurancomplex.gov.sa)
and of QUL when distributing renders, and remember that a bundle you deploy with a fonts package in
it serves the fonts too.

Package code: [MIT](./LICENSE).

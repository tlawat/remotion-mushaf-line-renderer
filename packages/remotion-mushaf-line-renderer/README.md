# remotion-mushaf-line-renderer

Render lines of the Quran in [Remotion](https://www.remotion.dev) exactly as they are printed in the
KFGQPC V4 (1441H) mushaf, with entrances and exits written in `@remotion/transitions` vocabulary.

![Page 10, line 3 of the mushaf in the mandala look](https://raw.githubusercontent.com/tlawat/remotion-mushaf-line-renderer/main/docs/assets/p10-l3-mandala.png)

- **Printed fidelity.** Every line is set with the per-page glyph fonts published by the
  [Quranic Universal Library (QUL)](https://qul.tarteel.ai) and the line breaks of the printed page.
  One DOM element per word, word gaps exactly as the font defines them.
- **Remotion-native.** Timing comes from the enclosing `<Sequence>`. Entrances and exits are
  `{presentation, timing}` pairs (`fade()`, `slide()`, the package's own `slideFade()`, ...). Fonts
  load behind `delayRender()`. Line data is plain JSON, made for `calculateMetadata()`.
- **Deterministic.** Nothing is painted before the page font is loaded, so a render never captures a
  fallback font, and every settled frame is byte-identical across render workers.
- **Three looks.** Plain black glyphs that follow CSS `color`, QUL's tajweed colours, or the
  "mandala" look most printed mushafs use: plain writing with coloured ayah rosettes, in any colours.
- **Loud.** Every failure is a `MushafError` with a stable `code` and a message that names the fix.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [`<MushafLine>`](#mushafline)
- [Resolving lines](#resolving-lines)
- [Looks and colours](#looks-and-colours)
- [Sizing](#sizing)
- [Entrances and exits](#entrances-and-exits)
- [Fonts](#fonts)
- [Per-word hooks](#per-word-hooks)
- [DOM contract](#dom-contract)
- [Environments](#environments)
- [Errors](#errors)
- [Roadmap](#roadmap)
- [Data and licences](#data-and-licences)

## Install

```bash
bun add remotion-mushaf-line-renderer
# or: npm install remotion-mushaf-line-renderer
```

Peer dependencies: `remotion` and `@remotion/transitions` (4.0.374 or newer) and `react` (18 or newer).

## Quick start

Resolve the line data once in `calculateMetadata()` and pass it to the component. It then runs once
per render instead of once per browser tab, the Studio shows the resolved props, and a `<Player>`
(which never runs `calculateMetadata`) can receive the same JSON.

```tsx
import {AbsoluteFill, Composition, Sequence, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {MushafLine, getMushafLines, slideFade, type MushafLineData} from 'remotion-mushaf-line-renderer';

type Props = {lines: MushafLineData[] | null};

const HOLD = 60; // frames each line stays on screen

const calculateMetadata: CalculateMetadataFunction<Props> = async ({props}) => {
  // Every line that carries At-Tawbah 9:1-11, wherever it is printed (the package finds the page).
  const lines = props.lines ?? (await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, look: 'mandala'}));
  return {props: {lines}, durationInFrames: HOLD * lines.length};
};

const Passage: React.FC<Props> = ({lines}) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee', color: '#1b1b1b', justifyContent: 'center'}}>
      {lines!.map((line, i) => (
        <Sequence key={line.line} from={i * HOLD} durationInFrames={HOLD} premountFor={fps} layout="none">
          <MushafLine line={line} enter={slideFade()} exit={slideFade()} />
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
together with that page's font. This package ships the compiled layout of every page (which words are
on which line) and, at render time, fetches the page font, waits for it, and lays the words out at the
font's own advances. There is no shaping, no justification and no line breaking to get wrong.

Two things flow through your code:

- **`MushafLineData`**, the plain JSON description of one line (page, line, look, words). You get it
  from `getMushafLine()` / `getMushafLines()`, ideally in `calculateMetadata()`, and pass it to the
  component. It is safe to store, send through `inputProps` and render on Lambda.
- **`<MushafLine>`**, which renders one `MushafLineData` inside the enclosing `<Sequence>`.

## `<MushafLine>`

```tsx
<MushafLine line={data} />                                              // resolved data (recommended)
<MushafLine page={10} line={3} look="mandala" colors={{accent: '#c8a45c'}} />  // resolved at render time
```

| Prop                     | Type                                               | Notes                                                                                                                                                              |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `line`                   | `MushafLineData`                                   | From `getMushafLine()` / `getMushafLines()`. The recommended form.                                                                                                 |
| `page` + `line`          | `number`, `number`                                 | Convenience form: resolves the line at render time behind its own `delayRender()`. `mushaf`, `look` and `colors` pick the appearance, as in `getMushafLine()`.      |
| `look`, `colors`         | see [Looks and colours](#looks-and-colours)        | Convenience form only. Resolved data already carries its look.                                                                                                     |
| `enter`                  | `{presentation, timing?}` or a bare presentation   | Entrance animation. Runs over the local frame of the enclosing `<Sequence>`. `timing` defaults to `enterTiming()`.                                                 |
| `exit`                   | same shape as `enter`                              | Exit animation: the presentation's exiting side over the last `timing.getDurationInFrames()` frames of the enclosing `<Sequence>`. Defaults to `exitTiming()`.      |
| `fit`                    | `'line'` (default) \| `'mushaf'`                   | `'line'` scales the line so it fills its box at the font's own word gaps; `'mushaf'` keeps one type size for every line. See [Sizing](#sizing).                     |
| `fontSize`               | `number` (px)                                      | The base size; default `fontSizeForWidth(useVideoConfig().width)`.                                                                                                 |
| `lineHeight`             | `number` (px)                                      | Default `lineHeightForFontSize(fontSize)`, the height of the root element.                                                                                         |
| `style`, `className`     |                                                    | Applied to the root element. The line inherits its CSS `color` from here.                                                                                          |
| `activeWordId`           | `string \| number \| null`                         | Marks one word as current (`word.id` like `"9:1:3"`, or `word.wordId`). See [Per-word hooks](#per-word-hooks).                                                     |
| `activeWordStyle`        | `CSSProperties`                                    | Applied to that word. Paint properties only.                                                                                                                       |
| `wordStyle`              | `(word, ctx) => CSSProperties`                     | Per-word style, called for every word on every frame. Paint properties only.                                                                                       |
| `wordClassName`          | `(word, ctx) => string`                            | Appended to `mushaf-word mushaf-word--<kind>`.                                                                                                                     |
| `name`                   | `string`                                           | Wraps the line in `<Sequence layout="none" name>` so it gets a label in the Studio timeline.                                                                       |

There is no start-time prop: place the line in a `<Sequence from>`. There is no `layout` prop: the
root element is a normal-flow block of `width: 100%` and `height: lineHeight`; position it with
`style` or with the enclosing `<Sequence style>`.

Only `ayah` lines render in this version. `surah_name` and `basmallah` lines are returned by the
resolvers with `words: []` and throw `UNSUPPORTED_LINE_TYPE` when passed to the component; skip them
or draw your own header.

## Resolving lines

All resolvers are pure and Remotion-free: safe in `calculateMetadata()`, in a Node script that
prepares `inputProps`, or in a `<Player>` host. They all take the same optional selection,
`{mushaf?, look?, colors?}` (see [Looks and colours](#looks-and-colours)).

### `getMushafLine({page, line, ...selection}): Promise<MushafLineData>`

One line. Pages are `1..604`, lines `1..15` (`1..8` on pages 1 and 2).

### `getMushafLines(options): Promise<MushafLineData[]>`

Several lines at once, in reading order. Two shapes:

```ts
// Every line of a page, `surah_name` and `basmallah` lines included (they carry no words).
await getMushafLines({page: 187});
// Every line that carries a word of these ayahs, wherever they are printed.
await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11});
// Both shapes take the selection, and `fontUrl` pins a mirror on every line they return.
await getMushafLines({surah: 2, look: 'tajweed', fontUrl: (page, fontSet) => staticFile(`fonts/${fontSet}/p${page}.woff2`)});
```

The ayah shape finds the page itself, so nothing has to know that At-Tawbah starts on page 187.
`fromAyah` defaults to 1 and `toAyah` to the last ayah of the surah. The first and last lines usually
carry neighbouring ayahs too, because that is how the mushaf is printed; `lineAyahs(line)` says which
ayahs a line holds, and `wordStyle` can dim the words outside your range instead of dropping them.

### `getMushafLocation({surah, ayah?, mushaf?}): Promise<{page, line}>`

Where a surah (or one of its ayahs) is printed. `AYAH_NOT_FOUND` names the last ayah of the surah
when you ask for one past its end.

### `lineAyahs(line): number[]`

The ayahs a line carries, ascending. Synchronous, from `line.words`.

### `MushafLineData`

```ts
type MushafLineData = {
  version: 2;
  mushaf: 'qpc-v4';
  look: 'plain' | 'tajweed' | 'mandala';
  fontSet: 'qpc-v4' | 'qpc-v4-tajweed';  // the font files the look needs
  page: number;
  line: number;
  type: 'ayah' | 'surah_name' | 'basmallah';
  centered: boolean;          // centred as printed (last line of a surah, pages 1-2)
  fontFamily: string;         // "mushaf-<fontSet>-p<page>"
  fontUrl?: string;           // optional font source pin, see Fonts
  colors?: {ink?, accent?, detail?, background?};  // mandala lines only
  palette?: number;           // advanced: a CPAL base palette override
  surahNumber?: number;       // surah_name and basmallah lines
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

## Looks and colours

The `look` decides how a line is coloured. It is an option of every resolver and of the convenience
form of `<MushafLine>`, and it is recorded on the data, so a line carries its own appearance through
`inputProps` and every render worker.

```tsx
<AbsoluteFill style={{color: '#1b1b1b'}}>
  <MushafLine page={10} line={3} />                    {/* plain: follows CSS `color` */}
  <MushafLine page={10} line={3} look="tajweed" />     {/* QUL's tajweed colours */}
  <MushafLine page={10} line={3} look="mandala" />     {/* CSS-coloured writing, coloured ayah rosettes */}
</AbsoluteFill>
```

| Look                | What you get                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `'plain'` (default) | The monochrome glyph set. The words take the inherited CSS `color`, so you paint them like any other text.               |
| `'tajweed'`         | QUL's COLR/CPAL colour font at its own palette: the tajweed colours, baked into the font. CSS `color` does not apply.      |
| `'mandala'`         | The same colour font at its "no tajweed" palette: the writing follows CSS `color`, the ayah-end rosette keeps its colours. |

### Mandala colours

Mandala is how most printed mushafs read outside a tajweed edition. It needs no extra download (it is
the tajweed font painted from a different palette) and every part of it takes a CSS colour:

```tsx
<AbsoluteFill style={{color: '#1b1b1b'}}>
  {/* written in #1b1b1b (the inherited `color`), rosette as the font paints it */}
  <MushafLine page={187} line={2} look="mandala" />
  {/* an explicit ink colour instead */}
  <MushafLine page={187} line={2} look="mandala" colors={{ink: 'rgb(27 111 63)'}} />
  {/* gold petals on a plain disc */}
  <MushafLine page={187} line={2} look="mandala" colors={{accent: '#c8a45c', background: 'transparent'}} />
</AbsoluteFill>
```

| Part         | Paints                                                                                   | Default                 |
| ------------ | ---------------------------------------------------------------------------------------- | ----------------------- |
| `ink`        | Everything written: the letters, and the rosette's frame, curls and ayah number           | `'currentColor'`        |
| `accent`     | The petal flourishes above and below the rosette                                         | the font's pink         |
| `detail`     | The small jewel at the top of the rosette                                                | the font's teal         |
| `background` | The disc behind the ayah number                                                          | the font's pale green   |

Values are ordinary CSS colours (`'#1b6f3f'`, `'rgb(27 111 63)'`, `'hsl(150 60% 27%)'`, `'crimson'`,
`'transparent'`, `'currentColor'`). Anything left out keeps the font's own colour. A value that is not
a colour is a `BAD_COLOR` error, and `colors` with any look other than `mandala` is refused for the
same reason: on the plain look they would do nothing, on the tajweed look they would paint over the
tajweed colours.

COLR glyphs ignore CSS `color`, so the package resolves `'currentColor'` from the line's computed
colour at render time and writes it into a `@font-palette-values` rule before the line is painted.
That is per line, not per word: to colour words individually (`wordStyle`, `activeWordStyle`), use the
plain look.

### Advanced: other palettes

The colour font carries six CPAL palettes: 0-2 are tajweed sets, 3 is the mandala look, 4 its
white-text counterpart and 5 an alternative marker colouring. Every one of them is reachable through
`look` and `colors` except the two alternative tajweed sets. For those, set `palette` on the resolved
data of a tajweed line (`{...line, palette: 1}`), or declare your own `@font-palette-values` rule and
set `font-palette` on an ancestor: it is inherited, and the row only pins it when the data asks for
a palette.

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

## Fonts

Each page has its own font (about 300 KB as woff2). By default it is fetched from QUL's CDN
(`https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/{v4|v4-tajweed}/woff2/p{N}.woff2`, CORS `*`),
checked for its magic bytes, registered with `new FontFace()` with the mushaf's metrics pinned, and
only then is the line painted. Renders wait for it behind a labelled `delayRender()`.

- **Slow or cold CDN during a render:** raise the render budget, `npx remotion render --timeout=60000`
  (or `timeoutInMilliseconds` in the Node APIs). The fetch budget adapts to it.
- **CDN gaps:** the registry knows the pages whose woff2 is missing on the CDN (page 328 of the
  colour set is served as woff) and fetches the format that exists.
- **Mirror the fonts** for offline, faster or reproducible renders: download them into `public/`
  and pin them where the data is resolved, so every render worker gets the same JSON:

  ```ts
  const lines = await getMushafLines({page: 10, fontUrl: (page, fontSet) => staticFile(`fonts/${fontSet}/p${page}.woff2`)});
  ```

  `fontUrl` also accepts any URL of your own mirror. Mirroring is for your own renders: the fonts are
  King Fahd Complex fonts published by QUL, so do not redistribute them (in a public site or a
  package) unless their licence allows it.
- **`<Player>` warm-up:** the Player does not run `calculateMetadata`, and a line mounted at frame 0
  would show nothing until its font arrives. Call `loadPageFont({page, look})` when your page loads,
  or mount the line early with `<Sequence premountFor>`.
- **`premountFor`:** Remotion 4 does not premount by default. Give each `<Sequence>` a `premountFor`
  of a second or so; the font then loads while the line is still hidden and the entrance starts on
  time, both in the Player and in renders.

### `loadPageFont({page, look?, mushaf?, url?}): {fontFamily, waitUntilDone}`

Google-fonts style loader. Idempotent; wraps `delayRender()` / `cancelRender()` internally; a no-op
during server rendering. `<MushafLine>` calls it for you. Call it yourself to warm a font in a
`<Player>` before the line mounts, or to register a font source once for the whole page:

```ts
loadPageFont({look: 'tajweed', page: 10, url: staticFile('fonts/qpc-v4-tajweed/p10.woff2')});
```

Source rules are order-independent, so every Lambda chunk behaves the same: no `url` adopts whatever
source is registered for that page (else the CDN); an explicit `url` replaces an implicit CDN
registration; two different explicit urls throw `FONT_URL_CONFLICT`.

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
`{line, frame, fps, active}`; keep them pure so renders stay deterministic. Use paint properties only
(`color`, `opacity`, `filter`, `background`, `textShadow`): anything that changes glyph metrics would
break the printed line breaks and is overridden by the pinned row style. On the tajweed and mandala
looks the glyph colours come from the font, so per-word `color` only reaches the plain look.

## DOM contract

```html
<div class="mushaf-line" data-mushaf="qpc-v4" data-look="plain" data-page="10" data-line="3" data-line-type="ayah" data-centered="false" style="position:relative;width:100%;height:<lineHeight>px">
  <!-- presentation wrapper when `enter` / `exit` is set (an AbsoluteFill for the stock presentations) -->
  <!-- font-palette is set on the row only for mandala lines and explicit palettes -->
  <div class="mushaf-line__row" style="position:absolute;inset:0;display:flex;direction:rtl;...;visibility:hidden|visible">
    <span class="mushaf-word mushaf-word--word" data-word-id="1234" data-location="2:62:1" data-surah="2" data-ayah="62" data-position="1" data-kind="word">ﱁ</span>
    <span class="mushaf-word mushaf-word--word mushaf-word--active" ... data-active="true">ﱂ</span>
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
- The layout data (about 1 MB, ASCII) ships as a separate lazy chunk that is fetched once per tab,
  only when a line is resolved at runtime; bundles with a non-root `publicPath` (Lambda sites) resolve
  it correctly.
- Under `<Sequence premountFor>` the font loads while the line is hidden; the row is never visible
  with a wrong font, not even for one frame after a remount.
- The line ignores hostile page CSS (`letter-spacing`, `font-weight`, `text-transform`, ...).

## Errors

Every failure is a `MushafError` (`{code, message, details?}`); `isMushafError(e)` recognises one
across package copies.

| Code                                     | Meaning and fix                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN_MUSHAF`                         | `mushaf` is not `'qpc-v4'`.                                                                                                                    |
| `BAD_LOOK`                               | `look` must be `'plain'`, `'tajweed'` or `'mandala'`.                                                                                          |
| `BAD_COLOR`                              | A colour is not a CSS colour, names a part the font does not paint, or `colors` was given with a look other than `mandala`.                    |
| `AYAH_NOT_FOUND`                         | `getMushafLines({surah, ...})` / `getMushafLocation()` was asked for a surah or ayah the mushaf does not have; the message names the last ayah. |
| `PAGE_OUT_OF_RANGE`, `LINE_OUT_OF_RANGE` | Pages are `1..604`; lines `1..15` (`1..8` on pages 1 and 2). The message names the page's line count.                                          |
| `BAD_LINE_PROP`                          | Pass `line={MushafLineData}` or `page` + `line={number}`, and `look` / `colors` only with the second form.                                     |
| `BAD_LINE_DATA`                          | `line` is not a `MushafLineData` from this package version (the message names the field). Data from 0.2 (`version: 1`) must be re-resolved.    |
| `UNSUPPORTED_LINE_TYPE`                  | A `surah_name` or `basmallah` line; only `ayah` lines render in this version.                                                                  |
| `BAD_ENTER`, `BAD_EXIT`                  | `enter` / `exit` must be a presentation or `{presentation, timing?}` with a `TransitionTiming`; `BAD_EXIT` also when the Sequence has no finite length. |
| `BAD_SIZE`                               | `fontSize` / `lineHeight` must be positive finite numbers.                                                                                     |
| `DATA_NOT_COMPILED`, `DATA_LOAD_FAILED`  | The layout chunk is missing or broken; check the bundle / `publicPath`, or run `bun run qul compile` when building from source.                |
| `BAD_FONT_URL`                           | `url` / `fontUrl` is not a non-empty string.                                                                                                   |
| `FONT_HTTP`                              | The font URL answered with an HTTP error (404: check the page number and the CDN path or your mirror).                                         |
| `FONT_NETWORK`                           | The fetch failed (offline, CORS on a mirror, blocked host).                                                                                    |
| `FONT_TIMEOUT`                           | The fetch did not finish within the render budget: raise `--timeout` or mirror the fonts.                                                      |
| `FONT_INVALID`                           | The response is not a font file (an HTML error page, for example). The message shows the first bytes.                                          |
| `FONT_PARSE`, `FONT_NOT_AVAILABLE`       | The browser rejected the font bytes or did not register the face; the file is corrupt or not a WOFF2/WOFF/TTF/OTF.                             |
| `FONT_URL_CONFLICT`                      | Two different explicit sources for one page in the same document. Use one.                                                                     |
| `FONT_SUPERSEDED`                        | An explicit `url` replaced a pending CDN load; the caller of the old load sees this, the line simply reloads.                                  |
| `CANVAS_PRESENTATION`                    | The presentation captures the scene to a canvas; use a DOM presentation.                                                                       |

The delayRender label `<MushafLine> page N line M: waiting for font ...` appearing in a timeout means
the font never arrived within `--timeout`; the error code above tells you why when the fetch itself
failed.

## Roadmap

Additions planned without breaking the API: header (`surah_name`) and basmallah lines (they need
QUL's `surah-name-v4` and `quran-common` fonts), a Studio-editable wrapper with a Zod schema, further
mushaf layouts from QUL.

## Data and licences

The layout data is compiled from QUL's public mushaf layout 19 (KFGQPC V4, 1441H) by the `qul` CLI in
the repository and validated against the printed page's invariants (9,046 lines, 83,668 words, one
ayah marker per ayah). The fonts are the King Fahd Glyph Complex fonts as published by QUL and are
fetched from QUL's CDN at render time; they are not part of this package. Please respect the licences
of the [King Fahd Complex](https://qurancomplex.gov.sa) and of [QUL](https://qul.tarteel.ai) when
distributing renders or mirroring fonts.

Package code: [MIT](./LICENSE).

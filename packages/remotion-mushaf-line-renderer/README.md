# remotion-mushaf-line-renderer

Render one line of the Quran in [Remotion](https://www.remotion.dev), exactly as it is printed in the
KFGQPC V4 (1441H) mushaf, with an entrance animation written in `@remotion/transitions` vocabulary.

- Word-for-word, glyph-for-glyph fidelity: the line is set with the per-page glyph fonts published by
  the [Quranic Universal Library (QUL)](https://qul.tarteel.ai) and the line breaks of the printed page.
  One DOM element per word.
- Remotion-native: timing comes from the enclosing `<Sequence>`, entrances and exits are
  `{presentation, timing}` pairs (`fade()`, `slide()`, `linearTiming()`, ...), fonts are loaded behind
  `delayRender()`, line data is plain JSON for `calculateMetadata()`.
- Deterministic: nothing is painted before the page font is loaded, so a render never captures a
  fallback font, and every frame after the entrance is byte-identical.
- Code only: the mushaf data — QUL's two open exports, the words of the script and the line layout —
  and the fonts are fetched from Tarteel's CDN at render time, or from a mirror you point it at.
- Loud: every failure is a `MushafError` with a stable `code` and a message that names the fix.

```tsx
import {Sequence} from 'remotion';
import {linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {MushafLine} from 'remotion-mushaf-line-renderer';

<Sequence from={30} premountFor={30}>
  <MushafLine page={10} line={3} enter={{presentation: fade(), timing: linearTiming({durationInFrames: 20})}} />
</Sequence>;
```

## Install

```bash
npm i remotion-mushaf-line-renderer
```

Peer dependencies (no version pins beyond `>=4.0.374`): `remotion`, `@remotion/transitions`, `react`.

## Quick start

Resolve the line data once in `calculateMetadata()` and pass it to the component. This runs once per
render instead of once per browser tab, the Studio shows the resolved props, and a `<Player>` (which
never runs `calculateMetadata`) can receive the same JSON.

```tsx
import {AbsoluteFill, Composition, Sequence, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {MushafLine, getMushafLine, type MushafLineData} from 'remotion-mushaf-line-renderer';
import {revealRtl} from 'remotion-mushaf-line-renderer/presentations/reveal-rtl';

type Props = {lines: MushafLineData[] | null};

const calculateMetadata: CalculateMetadataFunction<Props> = async ({props}) => {
  const lines = props.lines ?? (await Promise.all([3, 4, 5].map((line) => getMushafLine({mushaf: 'qpc-v4-tajweed', page: 10, line}))));
  return {props: {lines}, durationInFrames: 45 * lines.length + 60};
};

const ThreeLines: React.FC<Props> = ({lines}) => {
  const {fps, width} = useVideoConfig();
  const fontSize = Math.floor((width * 2500) / 42501); // the default: one size fits every line of the mushaf
  const lineHeight = Math.round(2.2 * fontSize);
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee'}}>
      {lines!.map((line, i) => (
        <Sequence key={line.line} from={i * 45} premountFor={fps} name={`line ${line.line}`} style={{top: 200 + i * lineHeight, height: lineHeight}}>
          <MushafLine line={line} enter={{presentation: i === 2 ? revealRtl() : fade(), timing: linearTiming({durationInFrames: 30})}} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const Root = () => <Composition id="Passage" component={Passage} calculateMetadata={calculateMetadata} width={1920} height={1080} fps={30} durationInFrames={200} defaultProps={{lines: null}} />;
```

A complete project with this composition, a `<Player>` page and the test harness lives in
[`example/`](../../example).

## API

### `<MushafLine>`

| Prop                       | Type                                                          | Notes                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `line`                     | `MushafLineData`                                              | From `getMushafLine()` / `getMushafLines()`. Preferred.                                                                                                                     |
| `page` + `line`            | `number`, `number`                                            | Convenience form: resolves the line at render time behind its own `delayRender()`. Add `mushaf` / `tajweed` / `mandala` to pick the colouring.                              |
| `tajweed`                  | `boolean`                                                     | Convenience form only. `false` (default) renders plain black glyphs that follow CSS `color`; `true` uses QUL's tajweed colour font. See [Colour](#colour).                  |
| `mandala`                  | `boolean \| MushafColors`                                     | Convenience form only. The ayah-end rosette in its colours with the writing in the inherited CSS `color` — the colour font at palette 3. `{ink, accent, detail, background}` recolours it. `tajweed` wins if both are set. See [Colour](#colour). |
| `data`                     | `{words?, layout?}`                                           | Convenience form only. Where to fetch QUL's two exports from (a mirror via `staticFile()`); default Tarteel's CDN. See [Data](#data).                                       |
| `enter`                    | `{presentation, timing?}` or a bare `TransitionPresentation`  | Entrance animation. Progress runs over the local frame of the enclosing `<Sequence>`; the presentation stays mounted for the whole sequence. `timing` defaults to `enterTiming()`. |
| `exit`                     | same shape as `enter`                                         | Exit animation: the presentation's **exiting** side over the last `timing.getDurationInFrames()` frames of the enclosing `<Sequence>` (`exitTiming()` by default). A line leaves because its Sequence ends. |
| `activeWordId`             | `string \| number \| null`                                    | Marks one word as current (`word.id` like `"9:1:3"`, or `word.wordId`): it gets `data-active="true"`, `.mushaf-word--active` and `activeWordStyle`.                          |
| `activeWordStyle`          | `CSSProperties`                                               | Applied to that word. Paint properties only (see `wordStyle`).                                                                                                             |
| `wordStyle`                | `(word, {line, frame, fps, active, inSlice}) => CSSProperties` | Per-word style, called for every word on every frame — keep it pure. Paint only: `color`, `opacity`, `filter`, `background`, `textShadow`. Anything that changes glyph metrics would break the printed line breaks. |
| `wordClassName`            | `(word, ctx) => string`                                       | Appended to `mushaf-word mushaf-word--<kind>`.                                                                                                                             |
| `fit`                      | `'line'` \| `'mushaf'`                                        | `'line'` (default) scales the line so it fills its box at the font's own word gaps; `'mushaf'` keeps one type size for every line. See [Sizing](#sizing).                    |
| `slice`                    | `{ayah}` \| `{fromAyah, toAyah?}` \| `null`                  | Show only these ayahs of the line, collapsed and centred, at the line's own size. Wins over `line.slice`; `null` cancels it. See [Slicing a line](#slicing-a-line).          |
| `fontSize`                 | `number` (px)                                                 | The base size; default `fontSizeForWidth(useVideoConfig().width)`. Under `fit="line"` the box decides the final size, see [Sizing](#sizing).                                |
| `lineHeight`               | `number` (px)                                                 | Default `lineHeightForFontSize(fontSize)`. The height of the root element.                                                                                                 |
| `style`, `className`       |                                                               | Applied to the root element. Colour is inherited from here (plain fonts only).                                                                                              |
| `name`                     | `string`                                                      | Wraps the line in `<Sequence layout="none" name>` so it gets a label in the Studio timeline.                                                                                |

There is no start-time prop: place the line in a `<Sequence from>`. There is no `layout` prop: the
root element is a normal-flow block of `width: 100%` and `height: lineHeight`; position it with
`style` or with the enclosing `<Sequence style>`.

Only `ayah` lines render in this version. `surah_name` and `basmallah` lines are returned by
`getMushafLine()` with `words: []` and throw `UNSUPPORTED_LINE_TYPE` when passed to the component;
skip them or draw your own header.

### `getMushafLine({page, line, mushaf?, tajweed?, mandala?, data?}): Promise<MushafLineData>`

Pure and Remotion-free: safe in `calculateMetadata()`, in a Node script that prepares `inputProps`,
or in a `<Player>` host. Pages are `1..604`, lines `1..15` (`1..8` on pages 1 and 2). `mushaf`
defaults to the plain `'qpc-v4'`; `tajweed: true` resolves the colour set instead, and `mandala` the
colour set at palette 3 with the colours you asked for (the returned `mushaf`, `palette` and
`paletteColors` are the resolved look, so the data alone decides how the line is painted). The first
call per tab fetches the mushaf data — QUL's two exports, from Tarteel's CDN unless `data` names
another source (see [Data](#data)); every later call reads the cached layout.

```ts
type MushafLineData = {
  version: 1;
  mushaf: 'qpc-v4' | 'qpc-v4-tajweed';
  page: number;
  line: number;
  type: 'ayah' | 'surah_name' | 'basmallah';
  centered: boolean;          // centred as printed (last line of a surah, pages 1-2)
  fontFamily: string;         // "mushaf-<mushaf>-p<page>"
  fontUrl?: string;           // optional font source pin, see Fonts
  palette?: number;           // CPAL palette of the colour font (3 = mandala), see Colour
  paletteColors?: {ink?: string; accent?: string; detail?: string; background?: string};  // CSS colours over that palette
  slice?: {ayah: number} | {fromAyah: number; toAyah?: number};  // the ayahs to show, see Slicing a line
  surahNumber?: number;       // headers and basmallah lines
  words: Array<{id: string /* "surah:ayah:position" */; wordId: number; surah: number; ayah: number; position: number; kind: 'word' | 'end' | 'pause' | 'sajdah' | 'rub-el-hizb'; text: string}>;
};
```

`words[].id` is QUL's location key (`2:62:1`), the join key for word timestamps. `kind: 'end'` is the
ayah-number marker, a real word with a real width. Standalone marker glyphs (`pause`, `sajdah`,
`rub-el-hizb`) are words too, numbered where they appear; one may share the location of the word it
precedes, so key elements by `wordId`. `text` is one to four private-use code points that only mean
something together with `fontFamily`; never normalise it.

### `getMushafLines(options): Promise<MushafLineData[]>`

Several lines at once, in reading order — the two questions an app actually asks:

```ts
// Every line of a page, `surah_name` and `basmallah` lines included (they carry no words).
await getMushafLines({page: 187});
// Every line that carries a word of these ayahs, wherever they are printed.
await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11});
// Both forms take mushaf/tajweed, and `fontUrl` pins a mirror on every line it returns.
await getMushafLines({surah: 2, tajweed: true, fontUrl: (page, mushaf) => staticFile(`fonts/${mushaf}/p${page}.woff2`)});
// `slice: true` records the range on the lines it cuts, so <MushafLine> shows only those ayahs.
await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, slice: true});
// `data` builds the lines from your own mirror of QUL's exports instead of Tarteel's CDN.
await getMushafLines({page: 187, data: {words: staticFile('data/qpc-v4/words.json.zip'), layout: staticFile('data/qpc-v4/layout.db.zip')}});
```

The ayah form finds the page itself (through an index over the compiled data), so nothing has to
know that At-Tawbah starts on page 187. `fromAyah` defaults to 1 and `toAyah` to the last ayah of the
surah. The first and last lines usually carry neighbouring ayahs too — that is how the mushaf is
printed; `lineAyahs(line)` says which ayahs a line holds. Pass `slice: true` to show only the ayahs
you asked for — the lines at either end collapse to their words of the range, centred, and the lines
in between stay whole (see [Slicing a line](#slicing-a-line)) — or keep the whole line and mark the
range with `wordStyle` (its context says whether a word is `inSlice`).

### `getMushafLocation({surah, ayah?, mushaf?, data?}): Promise<{page, line}>`

Where a surah (or one of its ayahs) is printed. `AYAH_NOT_FOUND` names the last ayah of the surah
when you ask for one past its end.

### `sliceWords(line, slice?): MushafWord[]`

The words a slice keeps — the line's own `slice` by default, `null` for the whole line. Use it to
skip a line the range never reaches, or to join word timings to what is on screen.

### `lineAyahs(line): number[]`

The ayahs a line carries, ascending. Synchronous, from `line.words`.

### `fontSizeForWidth(width, mushaf?)` and `lineHeightForFontSize(fontSize)`

The two numbers `<MushafLine>` computes by default, exported for when a line sits inside margins:
`fontSizeForWidth(width - 2 * margin)`. See [Sizing](#sizing).

### `loadPageFont({page, url?, mushaf?, tajweed?, mandala?}): {fontFamily, waitUntilDone}`

Google-fonts style loader. Idempotent; wraps `delayRender()` / `cancelRender()` internally; a no-op
during server rendering. `<MushafLine>` calls it for you. Call it yourself to warm a font in a
`<Player>` before the line mounts, or to register a font source once for the whole page:

```ts
loadPageFont({mushaf: 'qpc-v4-tajweed', page: 10, url: staticFile('fonts/qpc-v4-tajweed/p10.woff2')});
```

Source rules are order-independent, so every Lambda chunk behaves the same: no `url` adopts whatever
source is registered for that page (else the CDN); an explicit `url` replaces an implicit CDN
registration; two different explicit urls throw `FONT_URL_CONFLICT`.

### `loadMushafData({mushaf?, data?}): Promise<void>`

Loads the mushaf data ahead of time — the same load `getMushafLine()` makes, cached once per
source, so calling both costs nothing extra. For a `<Player>`, which never runs `calculateMetadata`,
call it when the page loads so the first line resolves without a round trip. Pure and
Remotion-free; both V4 ids share one dataset, so `mushaf` rarely matters.

### `slideFade(props?)` from `remotion-mushaf-line-renderer/presentations/slide-fade`

A vertical slide combined with a fade — the package's own presentation, and the one to reach for when
a line replaces another. `{direction: 'up' | 'down', distance, enterOpacityAt, exitOpacityAt,
exitDistanceScale, enterStyle, exitStyle}`; the defaults are described under
[Entrances and exits](#entrances-and-exits).

### `revealRtl(props?)` from `remotion-mushaf-line-renderer/presentations/reveal-rtl`

Reveals the line in reading direction (right to left). `softness` (in % of the line, default `0`)
fades the edge with a `mask-image` gradient instead of cutting it with a `clip-path`. Same shape as
`fade()` from `@remotion/transitions/fade`, so it also works inside a real `<TransitionSeries>`.
Optional `enterStyle` / `exitStyle` are merged into the wrapper.

### `enterTiming(options?)`, `exitTiming(options?)`, `springyTiming(options?)`

The default timings, and ordinary `TransitionTiming`s (they work in a `<TransitionSeries.Transition>`
too). Options: `{seconds?, durationInFrames?, easing?}` — `seconds` is resolved against the
composition's fps at render time, so one timing object suits 24, 30 and 60 fps.

### `MushafError`

`class MushafError extends Error {code: MushafErrorCode; details?: Record<string, unknown>}`. See
[Troubleshooting](#troubleshooting-by-error-code).

## Sizing

The fonts have `unitsPerEm = 2500` and the mushaf's lines are close to 40,000 units wide, so a line
fits a box of width `W` at roughly `W / 17`. That is the base size, computed from
`useVideoConfig().width` (or `fontSizeForWidth(measure)` for a line inside margins), and
`lineHeight` defaults to `2.2 em`, which keeps the glyph extremes (`+1.37 em` above and `−0.73 em`
below the baseline) inside the box so stacked lines never collide.

The printed lines are not all the same width — full lines run from about 39,000 to 43,700 units — so
the base size alone cannot make each one reach the margin. `fit` decides what happens with the
difference:

| `fit`      | What you get                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `'line'` (default) | The line is scaled so it fills its box exactly, at the word gaps the page font defines. This is the printed page. |
| `'mushaf'` | One type size for every line; a line narrower than the base simply stops short of the left margin.  |

**The word gaps are never touched.** The glyph advances of these fonts already include the spacing
between words, so the row places each word at its own advance from the right margin
(`justify-content: flex-start`) and nothing is distributed between them. Stretching a line to the
margin with `space-between` inflates every gap by whatever the line falls short — a few per cent of
the measure is enough to look visibly loose next to the print. Centred lines (the last line of a
surah, pages 1–2) are centred and never stretched under either `fit`.

Fitting measures the row once, after the page font has loaded and before the first frame is painted,
so it is deterministic: the same font at the same size gives the same measurement in every render
tab. Where there is no layout to measure (a server render, a zero-width box), the base size stands.

## Slicing a line

A printed line often carries the tail of one ayah and the start of the next — 44 % of the ayah lines
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

A slice that keeps every word of a line changes nothing — the interior lines of a sliced passage
render as printed — and one that keeps none paints nothing and throws nothing, so one selector can
be applied to a whole run of lines. The ayah-end rosette goes with the ayah it closes. `wordStyle`
is still called for every word with `inSlice` in its context, but cannot re-show a hidden one;
`activeWordId` may name a hidden word (it stays current, just unpainted). `revealRtl` sweeps the
whole measure, so a centred slice appears as the sweep reaches it.

The range is `{ayah}` or `{fromAyah, toAyah?}`, never a list: a line's ayahs are contiguous, so a
list would only mean its outer range, and hiding an ayah *between* two kept ones would put words
side by side that the mushaf never printed together.

`getMushafLines({surah, fromAyah, toAyah, slice: true})` records the range as `line.slice` on the
lines it cuts — the first and/or last of the passage, when they carry words of other ayahs — so a
resolved passage carries its own slicing through `inputProps`; the lines in between carry no slice.
The `slice` prop wins over it, and `slice={null}` cancels it.

## Entrances and exits

`enter` takes the entering side, and `exit` the exiting side, of any DOM presentation from
`@remotion/transitions`:

| Presentation                                   | Works |
| ---------------------------------------------- | ----- |
| `fade()`, `slide()`, `wipe()`, `flip()`        | yes   |
| `clockWipe({width, height})`, `iris({width, height})` | yes, pass the line box size |
| `pushCut()`, `none()`                          | yes   |
| `revealRtl()` (this package)                   | yes   |
| `dissolve()`, `ripple()`, `crosswarp()`, `crossZoom()`, `swap()`, `bookFlip()`, `zoomBlur()`, `dreamyZoom()`, `filmBurn()`, `linearBlur()`, `zoomInOut()` | no: these capture the scene to a canvas and need an exiting scene. The line throws `CANVAS_PRESENTATION`. |

`timing` is optional: `enter` defaults to `enterTiming()` and `exit` to `exitTiming()`, and a bare
presentation is accepted as shorthand — `enter={slideFade()}` is `enter={{presentation: slideFade(),
timing: enterTiming()}}`.

**The defaults, and why.** `enterTiming()` is 0.5 s on `Easing.bezier(0.2, 0, 0, 1)`: it eases out of
nothing, covers the distance in the middle and decelerates for a long time into place, so both ends
are gentle and the entrance settles instead of stopping. `exitTiming()` is 0.32 s on
`Easing.bezier(0.4, 0, 1, 1)`, accelerating away — something leaving has nothing to land on, and
exits shorter than entrances is the usual asymmetry. A linear timing in both directions (what
`linearTiming()` gives you) starts and stops abruptly, and abrupt is what reads as mechanical. `springyTiming({config:
{damping: 200}})` is there when you want a physical settle instead of a curve.

`slideFade()` shapes each property over a different part of that window: the line is fully opaque at
75 % of an entrance (the rest is a pure settle) and fully gone at 70 % of an exit, and it travels
28 % of a line box rather than half the screen — a shorter travel at the same duration is what stops
the eye from tracking the motion instead of reading the words. Two lines of text should never
cross-fade through each other, whatever the curves: schedule the outgoing line's exit to *finish*
where the next line's entrance starts (see [Replacing lines](#replacing-lines)).

Entrance progress is `timing.getProgress({frame: localFrame, fps})`, clamped to `1` after
`timing.getDurationInFrames({fps})`. The exit runs over the last `getDurationInFrames` frames of the
enclosing `<Sequence>` (its `durationInFrames`, which `useVideoConfig()` reports inside the Sequence)
and is `0` before that window, so there is no extra timeline prop: a line leaves because its Sequence
ends. Both sides are rendered exactly as `<TransitionSeries>` renders them (`presentationDirection`,
`passedProps`, the exiting presentation wrapped around the entering one), so custom presentations
written for `TransitionSeries` work unchanged.

Exiting sides of the stock presentations: `slide` pushes the line out, `wipe`, `flip`, `clockWipe` and
`iris` uncover or fold it away, `revealRtl` hides it in reading direction, `none` does nothing, and
`fade()` keeps the exiting line fully visible unless you ask for `fade({shouldFadeOutExitingScene:
true})`.

### Replacing lines

To show one line after another in the same place, overlap the Sequences: each line's exit window is
the next line's entrance window.

```tsx
const HOLD = 60; // frames a line is on screen before the next one takes the slot

{lines.map((line, i) => (
  <Sequence key={line.line} from={i * HOLD} durationInFrames={HOLD} premountFor={fps} style={{top, height: lineHeight}}>
    <MushafLine line={line} enter={slideFade()} exit={slideFade()} />
  </Sequence>
))}
```

Every line owns one slot for `HOLD` frames: its entrance runs over the first `enterTiming()` frames,
its exit over the last `exitTiming()` frames, and the next line's Sequence begins exactly where this
one ends. That is a *fade through* — the slot is briefly empty rather than holding two half-visible
lines — and for text it reads far better than a cross-fade, where both lines are legible at once and
neither is readable.

Overlapping the Sequences (`durationInFrames={HOLD + ENTER}`, next line at `i * HOLD`) gives the
cross-fade instead, which suits `slide()` — the outgoing line is pushed out of the box rather than
faded through. The example's `ThreeLines` composition does that in its `replace` mode (slide+fade,
fade, slide and a soft revealRtl in turn); its `Recitation` composition does the fade-through.
`<TransitionSeries>` from `@remotion/transitions` works too: put each `<MushafLine>` (without
`enter`/`exit`) in a `<TransitionSeries.Sequence>` and let the series drive both sides.

## Fonts

Each page has its own font (about 300 KB as woff2). By default it is fetched from QUL's CDN,
`https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/{v4|v4-tajweed}/woff2/p{N}.woff2` (CORS `*`),
parsed with a magic-byte check, registered with `new FontFace()` with the mushaf's metrics pinned, and
only then is the line painted. Renders wait for it behind a labelled `delayRender()` (`<MushafLine>
page 10 line 3: waiting for font ...`).

- **Slow or cold CDN during a render:** raise the render budget, `npx remotion render --timeout=60000`
  (or `timeoutInMilliseconds` in the Node APIs). The fetch budget adapts to it.
- **CDN gaps:** the registry knows the pages whose woff2 is missing on the CDN (page 328 of the
  tajweed set is served as woff) and fetches the format that exists; a survey of all 1,208 URLs is
  kept in the repository and checked by the unit tests.
- **Mirror the fonts** for offline, faster or reproducible renders: download them into `public/`
  (`bun run qul fonts 10` in this repository does that for both sets) and pin them
  in `calculateMetadata()` so every render tab gets the same JSON:

  ```ts
  const lines = resolved.map((line) => ({...line, fontUrl: staticFile(`fonts/${line.mushaf}/p${line.page}.woff2`)}));
  ```

  `fontUrl` is an explicit source; it also works with any URL of your own mirror. Mirroring is for
  your own renders: the fonts are King Fahd Complex fonts published by QUL, so do not redistribute
  them (in a public site or a package) unless their licence allows it.
- **`<Player>` warm-up:** the Player does not run `calculateMetadata`, and a line mounted at frame 0
  would show nothing until its font arrives. Call `loadPageFont({mushaf, page})` when your page loads
  (or use `preloadFont()` from `@remotion/preload` with the CDN URL), or mount the line early with
  `<Sequence premountFor>`.
- **`premountFor`:** Remotion 4 does not premount by default. Give each `<Sequence>` a `premountFor`
  of a second or so; the font then loads while the line is still hidden and the entrance starts on
  time, both in the Player and in renders.

## Data

The package carries no mushaf data. A line is built from QUL's two raw exports, fetched the first
time a line is resolved in a tab (or in a Node script) and cached from then on:

- the words of the QPC V4 script (`qpc-v4.json`, one entry per word: surah, ayah, position and the
  one to four private-use code points the page font renders);
- the 15-line layout (`qpc-v4-tajweed-15-lines.db`, a SQLite `pages` table: page, line, type,
  centred, first and last word).

Both are zips on Tarteel's CDN, `https://s3.us-east-1.wasabisys.com/static-cdn.tarteel.ai/qul-exports/…`,
pinned to one publication each (QUL publishes every export under a new prefix; the repository's
`bun run qul data` mirrors, records and validates the pinned ones). The package unzips
them, reads the SQLite file and joins the two in memory — about 1.2 MB over the wire and a few
hundred milliseconds, once per tab — then checks the result structurally: page count, lines per
page, contiguous word ids, one ayah marker per ayah, glyph texts in the fonts' range.

- **`data`** on `getMushafLine()`, `getMushafLines()`, `getMushafLocation()`, `loadMushafData()`
  and the `<MushafLine page line>` form names other sources: `{words?, layout?}`, each an absolute
  URL, a `staticFile()` result or a root-relative path, zipped or unzipped (the words as JSON, the
  layout as SQLite or as a JSON array of its rows). Anything left out comes from the CDN.
- **Mirror the exports** for renders that must not depend on the CDN — every render tab and every
  Lambda chunk fetches them otherwise: put the two zips in `public/` (`node bun run qul
  --data` in this repository writes them to `example/public/data/qpc-v4/`) and resolve with

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

## Colour

Lines are **plain black by default**: the plain glyph set is a monochrome outline font, so the words
take the inherited CSS `color` and you paint them like any other text.

```tsx
<AbsoluteFill style={{color: '#1b1b1b'}}>
  <MushafLine line={line} />                        {/* plain, follows `color` */}
  <MushafLine page={10} line={3} tajweed />         {/* QUL's tajweed colour font */}
  <MushafLine page={10} line={3} mandala />         {/* CSS-coloured text, coloured ayah rosettes */}
</AbsoluteFill>
```

`tajweed` and `mandala` are switches on the convenience form, and options on `getMushafLine()` /
`getMushafLines()` / `loadPageFont()` when you resolve data yourself. Resolved data already carries
its font set and palette, so `<MushafLine line={data} tajweed>` is refused: pass the flag where the
data is made.

| Colouring       | What it looks like                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| plain (default) | Monochrome outlines (`v4`). Follows CSS `color`, so it inherits from `style` or any ancestor.                                                |
| `tajweed`       | The COLR/CPAL colour font (`v4-tajweed`) at its own palette: the tajweed colours, baked into the font.                                       |
| `mandala`       | The same colour font at palette 3: the ayah-end rosette in its colours, everything written in the inherited CSS `color`. Every part is recolourable. |

### Mandala

Mandala is how most printed mushafs read outside a tajweed edition. It needs no extra download — it
is the tajweed font painted from a different CPAL palette — and the whole look is CSS colours:

```tsx
<AbsoluteFill style={{color: '#1b1b1b'}}>
  {/* written in #1b1b1b (the inherited `color`), rosette as the font paints it */}
  <MushafLine page={187} line={2} mandala />

  {/* an explicit ink colour instead */}
  <MushafLine page={187} line={2} mandala={{ink: 'rgb(27 111 63)'}} />

  {/* gold petals on a plain disc */}
  <MushafLine page={187} line={2} mandala={{accent: '#c8a45c', background: 'transparent'}} />
</AbsoluteFill>
```

COLR glyphs ignore CSS `color` — the colours live in the font — so `mandala` resolves the inherited
`color` at render time and writes it into the palette instead. That is per line, not per word: to
colour words individually (`wordStyle`, `activeWordStyle`), use the plain set.

Four colours paint everything the font can paint:

| Part         | Paints                                                                                  | Default                 |
| ------------ | ---------------------------------------------------------------------------------------- | ----------------------- |
| `ink`        | Everything written: the letters, and the rosette's frame, curls and ayah number (CPAL 0-9, 13, 14, 15) | `'currentColor'`        |
| `accent`     | The petal flourishes above and below the rosette (11)                                   | the font's pink         |
| `detail`     | The small jewel at the top of the rosette (10)                                          | the font's teal         |
| `background` | The disc behind the ayah number (12)                                                    | the font's pale green   |

The frame and the number are `ink` rather than ornament because that is how the font paints them —
black in palette 3, white in palette 4, always the letter colour — so text and frame stay together
when you recolour either.

Values are ordinary CSS colours — `'#1b6f3f'`, `'#1b6f3fcc'`, `'rgb(27 111 63)'`, `'hsl(150 60% 27%)'`,
`'crimson'`, `'transparent'`, `'currentColor'`. Anything left out keeps the font's own colour, which is
what makes a mandala line a coloured rosette on plainly written text. A value that is not a colour is
a `BAD_COLOR` error, not a silently dropped rule.

The choice is recorded on the resolved data, so a line carries its own look through `inputProps` and
every render tab:

```ts
const line = await getMushafLine({page: 187, line: 2, mandala: {accent: '#c8a45c'}});
// {mushaf: 'qpc-v4-tajweed', palette: 3, paletteColors: {ink: 'currentColor', accent: '#c8a45c'}, ...}
```

`<MushafLine>` declares the `@font-palette-values` rule those colours need before it paints the line,
and keeps the line hidden until it is in the document, so no frame is ever captured with the wrong
palette.

### Palettes

The two font sets share one layout dataset, and the mushaf ids `'qpc-v4'` / `'qpc-v4-tajweed'` still
name them (data made by earlier versions keeps working); the flags decide when both are given, and
`tajweed` wins over `mandala`.

The colour font carries six palettes: 0-2 are tajweed sets, 3 is the mandala look, 4 its white-text
counterpart and 5 an alternative marker colouring. `palette` on the line data takes any of them (on a
colour-set line — the plain set has no palettes and rejects one), and `paletteColors` recolours it:

```tsx
<MushafLine line={{...line, palette: 5, paletteColors: {ink: 'currentColor'}}} />
```

For anything finer — one CPAL entry at a time, say the rosette's frame (13) apart from the letters —
declare your own palette and set `font-palette` on an ancestor; it is inherited, and the row only
pins it when the data asks for a palette:

```css
@font-palette-values --mushaf-ink {
  font-family: mushaf-qpc-v4-tajweed-p10;
  base-palette: 3;
  override-colors: 0 #1b1b1b;
}
```

```tsx
<MushafLine line={line} style={{fontPalette: '--mushaf-ink'}} />
```

`font-palette` shipped in Chrome 101, Safari 15.4 and Firefox 107; in anything older a colour-font
line paints the font's default palette (the tajweed colours) and everything else still works.

## DOM contract

```html
<div class="mushaf-line" data-mushaf="qpc-v4" data-page="10" data-line="3" data-line-type="ayah" data-centered="false" data-sliced="<first>-<last>|empty" style="position:relative;width:100%;height:<lineHeight>px">
  <!-- data-sliced is present only while a slice is in effect -->
  <!-- presentation wrapper when `enter` is set (an AbsoluteFill for the stock presentations) -->
  <!-- font-palette is set on the row only when the line data carries a `palette` (see Colour) -->
  <div class="mushaf-line__row" style="position:absolute;inset:0;display:flex;direction:rtl;...;visibility:hidden|visible">
    <span class="mushaf-word mushaf-word--word" data-word-id="1234" data-location="2:62:1" data-surah="2" data-ayah="62" data-position="1" data-kind="word">ﱁ</span>
    <span class="mushaf-word mushaf-word--word mushaf-word--active" ... data-active="true">ﱂ</span>  <!-- when activeWordId names it -->
    <span class="mushaf-word mushaf-word--word mushaf-word--hidden" ... data-hidden="true" style="display:none">ﱃ</span>  <!-- outside the slice -->
    ...
    <span class="mushaf-word mushaf-word--end" ...>ﱊ</span>
  </div>
</div>
```

Word elements are stable hooks for your own CSS (`.mushaf-word--end { opacity: .8 }`) and for
future highlighting APIs. Do not change their font, spacing or `direction`.

## Environments

Works in the Studio, `renderMedia()` / `renderStill()` / the CLI, Lambda and the `<Player>`:

- Every browser tab creates and releases its own `delayRender()` handles; concurrency is safe.
- The mushaf data is fetched once per tab, the first time a line is resolved — from Tarteel's CDN
  or from the `data` source given (a mirror pinned through `staticFile()` follows a non-root
  `publicPath` on Lambda sites) — and compiled in memory; see [Data](#data).
- Under `<Sequence premountFor>` the font loads while the line is hidden; the row is never visible
  with a wrong font, not even for one frame after a remount.
- The line ignores hostile page CSS (`letter-spacing`, `font-weight`, `text-transform`, ...).

## Troubleshooting by error code

| Code                     | Meaning and fix                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN_MUSHAF`         | `mushaf` is not `qpc-v4` or `qpc-v4-tajweed`.                                                                                                     |
| `BAD_TAJWEED`, `BAD_MANDALA` | `tajweed` must be `true` or `false`; `mandala` also takes an object of colours.                                                                |
| `BAD_COLOR`              | A colour is not a CSS colour, or names a part the font does not paint. The message names the part.                                                |
| `BAD_SLICE`              | `slice` must be `{ayah}` or `{fromAyah, toAyah?}` with positive integers (`toAyah` not before `fromAyah`); `slice: true` only on the ayah form of `getMushafLines()`. |
| `AYAH_NOT_FOUND`         | `getMushafLines({surah, ...})` / `getMushafLocation()` was asked for a surah or ayah the mushaf does not have; the message names the last ayah.    |
| `PAGE_OUT_OF_RANGE`, `LINE_OUT_OF_RANGE` | Pages are `1..604`; lines `1..15` (`1..8` on pages 1 and 2). The message names the page's line count.                             |
| `BAD_LINE_PROP`          | Pass `line={MushafLineData}` or `page` + `line={number}` — and `tajweed` / `mandala` only with the second form.                                   |
| `BAD_LINE_DATA`          | `line` is not a `MushafLineData` from this package version (the message names the field).                                                        |
| `UNSUPPORTED_LINE_TYPE`  | A `surah_name` or `basmallah` line; only `ayah` lines render in this version.                                                                     |
| `BAD_ENTER`              | `enter` must be a presentation (`{component, props}`) or `{presentation, timing?}` with a `TransitionTiming`.                                     |
| `BAD_EXIT`               | Same for `exit`; also raised when the enclosing Sequence has no finite length to count back from.                                                 |
| `BAD_SIZE`               | `fontSize` / `lineHeight` must be positive finite numbers.                                                                                        |
| `BAD_DATA_URL`           | `data.words` / `data.layout` is not an absolute URL, a `staticFile()` path or a root-relative path — or is root-relative in Node, where only an absolute URL can be fetched. |
| `DATA_HTTP`              | An export URL answered with an HTTP error (404: QUL re-published under a new prefix, or your mirror path is wrong). The message names the pinned URL.            |
| `DATA_NETWORK`           | The fetch failed (offline, CORS on a mirror, blocked host). Mirror the exports into `public/` and pass them as `data`.                                            |
| `DATA_TIMEOUT`           | The fetch did not finish within the render budget: raise `--timeout` or mirror the exports.                                                                      |
| `DATA_INVALID`           | The response is not the export (an HTML page, a truncated zip, another mushaf, a broken reading order). The message names the file and the first problem.        |
| `DATA_LOAD_FAILED`       | Something unexpected while loading the data (the message carries it), or a page or line the loaded layout does not have.                                          |
| `BAD_FONT_URL`           | `url` / `fontUrl` is not an absolute URL, a `staticFile()` path or a root-relative path.                                                          |
| `FONT_HTTP`              | The font URL answered with an HTTP error (404: check the page number and the CDN path or your mirror).                                            |
| `FONT_NETWORK`           | The fetch failed (offline, CORS on a mirror, blocked host).                                                                                       |
| `FONT_TIMEOUT`           | The fetch did not finish within the render budget: raise `--timeout` or mirror the fonts.                                                         |
| `FONT_INVALID`           | The response is not a font file (an HTML error page, for example). The message shows the first bytes.                                             |
| `FONT_PARSE`, `FONT_NOT_AVAILABLE` | The browser rejected the font bytes or did not register the face; the file is corrupt or not a WOFF2/WOFF/TTF/OTF.                      |
| `FONT_URL_CONFLICT`      | Two different explicit sources for one page in the same document. Use one.                                                                        |
| `FONT_SUPERSEDED`        | An explicit `url` replaced a pending CDN load; the caller of the old load sees this, the line simply reloads.                                     |
| `CANVAS_PRESENTATION`    | The presentation captures the scene to a canvas; use a DOM presentation (see [Entrances](#entrances)).                                            |

The delayRender label `<MushafLine> page N line M: waiting for font ...` appearing in a timeout means
the font never arrived within `--timeout`; the error code above tells you why when the fetch itself
failed.

## Roadmap

Additions planned without breaking the API: header (`surah_name`) and basmallah lines (they need
QUL's `surah-name-v4` and `quran-common` fonts, whose CDN build is reached through GSUB ligatures), a
Studio-editable wrapper via `Interactive.withSchema`, further mushaf layouts from QUL.

## Data and licences

The lines are built at render time from QUL's exports of mushaf layout 19 (KFGQPC V4, 1441H) — the
words of the script and the line layout, open data published by [QUL](https://qul.tarteel.ai) — and
checked against the printed page's invariants (9,046 lines, 83,668 words, one ayah marker per
ayah) by the repository's `bun run qul`. The fonts are the King Fahd Glyph Complex fonts
as published by QUL and are fetched from QUL's CDN at render time. Neither is part of this package.
Please respect the licences of the [King Fahd Complex](https://qurancomplex.gov.sa) and of QUL when
distributing renders or mirroring fonts.

Package code: MIT.

# remotion-mushaf-line-renderer

Render one line of the Quran in [Remotion](https://www.remotion.dev), exactly as it is printed in the
KFGQPC V4 (1441H) mushaf, with an entrance animation written in `@remotion/transitions` vocabulary.

- Word-for-word, glyph-for-glyph fidelity: the line is set with the per-page glyph fonts published by
  the [Quranic Universal Library (QUL)](https://qul.tarteel.ai) and the line breaks of the printed page.
  One DOM element per word.
- Remotion-native: timing comes from the enclosing `<Sequence from>`, animations are
  `{presentation, timing}` pairs (`fade()`, `slide()`, `linearTiming()`, ...), fonts are loaded behind
  `delayRender()`, line data is plain JSON for `calculateMetadata()`.
- Deterministic: nothing is painted before the page font is loaded, so a render never captures a
  fallback font, and every frame after the entrance is byte-identical.
- Loud: every failure is a `MushafError` with a stable `code` and a message that names the fix.

```tsx
import {Sequence} from 'remotion';
import {linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {MushafLine} from 'remotion-mushaf-line-renderer';

<Sequence from={30} premountFor={30}>
  <MushafLine mushaf="qpc-v4-tajweed" page={10} line={3} enter={{presentation: fade(), timing: linearTiming({durationInFrames: 20})}} />
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

export const Root = () => <Composition id="ThreeLines" component={ThreeLines} calculateMetadata={calculateMetadata} width={1920} height={1080} fps={30} durationInFrames={200} defaultProps={{lines: null}} />;
```

A complete project with this composition, a `<Player>` page and the test harness lives in
[`example/`](../../example).

## API

### `<MushafLine>`

| Prop                       | Type                                                          | Notes                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `line`                     | `MushafLineData`                                              | From `getMushafLine()`. Preferred.                                                                                                                                          |
| `mushaf` + `page` + `line` | `MushafId`, `number`, `number`                                | Convenience form: resolves the line at render time behind its own `delayRender()`.                                                                                          |
| `enter`                    | `{presentation: TransitionPresentation, timing: TransitionTiming}` | Entrance animation. Progress runs over the local frame of the enclosing `<Sequence>`; the presentation stays mounted for the whole sequence.                          |
| `fontSize`                 | `number` (px)                                                 | Default `floor(useVideoConfig().width × 2500 / 42501)`, see [Sizing](#sizing).                                                                                              |
| `lineHeight`               | `number` (px)                                                 | Default `round(2.2 × fontSize)`. The height of the root element.                                                                                                            |
| `style`, `className`       |                                                               | Applied to the root element. Colour is inherited from here (plain fonts only).                                                                                              |
| `name`                     | `string`                                                      | Wraps the line in `<Sequence layout="none" name>` so it gets a label in the Studio timeline.                                                                                |

There is no start-time prop: place the line in a `<Sequence from>`. There is no `layout` prop: the
root element is a normal-flow block of `width: 100%` and `height: lineHeight`; position it with
`style` or with the enclosing `<Sequence style>`.

Only `ayah` lines render in this version. `surah_name` and `basmallah` lines are returned by
`getMushafLine()` with `words: []` and throw `UNSUPPORTED_LINE_TYPE` when passed to the component;
skip them or draw your own header.

### `getMushafLine({mushaf, page, line}): Promise<MushafLineData>`

Pure and Remotion-free: safe in `calculateMetadata()`, in a Node script that prepares `inputProps`,
or in a `<Player>` host. Pages are `1..604`, lines `1..15` (`1..8` on pages 1 and 2).

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
  surahNumber?: number;       // headers and basmallah lines
  words: Array<{id: string /* "surah:ayah:position" */; wordId: number; surah: number; ayah: number; position: number; kind: 'word' | 'end' | 'pause' | 'sajdah' | 'rub-el-hizb'; text: string}>;
};
```

`words[].id` is QUL's location key (`2:62:1`), the join key for word timestamps. `kind: 'end'` is the
ayah-number marker, a real word with a real width. `text` is one or two private-use code points that
only mean something together with `fontFamily`; never normalise it.

### `loadPageFont({mushaf, page, url?}): {fontFamily, waitUntilDone}`

Google-fonts style loader. Idempotent; wraps `delayRender()` / `cancelRender()` internally; a no-op
during server rendering. `<MushafLine>` calls it for you. Call it yourself to warm a font in a
`<Player>` before the line mounts, or to register a font source once for the whole page:

```ts
loadPageFont({mushaf: 'qpc-v4-tajweed', page: 10, url: staticFile('fonts/qpc-v4-tajweed/p10.woff2')});
```

Source rules are order-independent, so every Lambda chunk behaves the same: no `url` adopts whatever
source is registered for that page (else the CDN); an explicit `url` replaces an implicit CDN
registration; two different explicit urls throw `FONT_URL_CONFLICT`.

### `revealRtl(props?)` from `remotion-mushaf-line-renderer/presentations/reveal-rtl`

Reveals the line in reading direction (right to left) with a `clip-path`. Same shape as `fade()` from
`@remotion/transitions/fade`, so it also works inside a real `<TransitionSeries>`. Optional
`enterStyle` / `exitStyle` are merged into the wrapper.

### `MushafError`

`class MushafError extends Error {code: MushafErrorCode; details?: Record<string, unknown>}`. See
[Troubleshooting](#troubleshooting-by-error-code).

## Sizing

The fonts have `unitsPerEm = 2500`, and the widest line of the mushaf is 42,501 units wide, so a full
line fits in a box of width `W` at `fontSize = W × 2500 / 42501` (about `W / 17`). That is the default,
computed from `useVideoConfig().width`, and it is the same size for every line of the mushaf, so
stacked lines look like a page. The default `lineHeight` of `2.2 em` keeps the glyph extremes
(`+1.37 em` above and `−0.73 em` below the baseline) inside the box, so stacked lines never collide.

If the line does not span the whole composition width, pass `fontSize` yourself (apply the same rule to
the inset measure, as the example does) or render it inside a `<Sequence width={measure}>`. A
`fontSize` larger than the rule allows can overflow on the widest lines; the root has
`overflow: visible`, so nothing is clipped, but check the result.

Justified lines (all but the centred ones) fill the box exactly as printed: the words are laid out with
`justify-content: space-between`, which only distributes the small slack the printed page also
distributes. Centred lines use `justify-content: center`.

## Entrances

`enter` takes the entering side of any DOM presentation from `@remotion/transitions`:

| Presentation                                   | Works |
| ---------------------------------------------- | ----- |
| `fade()`, `slide()`, `wipe()`, `flip()`        | yes   |
| `clockWipe({width, height})`, `iris({width, height})` | yes, pass the line box size |
| `pushCut()`, `none()`                          | yes   |
| `revealRtl()` (this package)                   | yes   |
| `dissolve()`, `ripple()`, `crosswarp()`, `crossZoom()`, `swap()`, `bookFlip()`, `zoomBlur()`, `dreamyZoom()`, `filmBurn()`, `linearBlur()`, `zoomInOut()` | no: these capture the scene to a canvas and need an exiting scene. The line throws `CANVAS_PRESENTATION`. |

Progress is `timing.getProgress({frame: localFrame, fps})`, clamped to `1` after
`timing.getDurationInFrames({fps})`. The presentation is rendered exactly as `<TransitionSeries>`
renders its entering side (`presentationDirection="entering"`, `passedProps`, and so on), so custom
presentations written for `TransitionSeries` work unchanged.

## Fonts

Each page has its own font (about 300 KB as woff2). By default it is fetched from QUL's CDN,
`https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/{v4|v4-tajweed}/woff2/p{N}.woff2` (CORS `*`),
parsed with a magic-byte check, registered with `new FontFace()` with the mushaf's metrics pinned, and
only then is the line painted. Renders wait for it behind a labelled `delayRender()` (`<MushafLine>
page 10 line 3: waiting for font ...`).

- **Slow or cold CDN during a render:** raise the render budget, `npx remotion render --timeout=60000`
  (or `timeoutInMilliseconds` in the Node APIs). The fetch budget adapts to it.
- **Mirror the fonts** for offline, faster or reproducible renders: download them into `public/`
  (`node scripts/fetch-qul.mjs --fonts 10` in this repository does that for both sets) and pin them
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

## Mushaf ids

| id                | Font set          | Colour                                                                                                                     |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `qpc-v4`          | `v4` (plain)      | Follows CSS `color` (set it on `style` or an ancestor).                                                                    |
| `qpc-v4-tajweed`  | `v4-tajweed` (COLR/CPAL) | Tajweed colours baked into the font (palette 0). CSS `color` does not apply to these glyphs.                        |

Both ids share one layout dataset. The tajweed fonts carry six palettes; palette 3 is plain black
with coloured ayah markers and palette 4 is plain white, so one font can also give a plain look:

```css
@font-palette-values --mushaf-plain {
  font-family: mushaf-qpc-v4-tajweed-p10;
  base-palette: 3;
  /* override-colors: 0 #1b1b1b; */
}
```

```tsx
<MushafLine line={line} style={{fontPalette: '--mushaf-plain'}} />
```

(`font-palette` is inherited, so setting it on the root element reaches the glyphs.)

## DOM contract

```html
<div class="mushaf-line" data-mushaf="qpc-v4-tajweed" data-page="10" data-line="3" data-line-type="ayah" data-centered="false" style="position:relative;width:100%;height:<lineHeight>px">
  <!-- presentation wrapper when `enter` is set (an AbsoluteFill for the stock presentations) -->
  <div class="mushaf-line__row" style="position:absolute;inset:0;display:flex;direction:rtl;...;visibility:hidden|visible">
    <span class="mushaf-word mushaf-word--word" data-word-id="1234" data-location="2:62:1" data-surah="2" data-ayah="62" data-position="1" data-kind="word">ﱁ</span>
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
- The layout data (about 1 MB, ASCII) ships as a separate lazy chunk that is fetched once per tab,
  only when a line is resolved at runtime; bundles with a non-root `publicPath` (Lambda sites) resolve
  it correctly.
- Under `<Sequence premountFor>` the font loads while the line is hidden; the row is never visible
  with a wrong font, not even for one frame after a remount.
- The line ignores hostile page CSS (`letter-spacing`, `font-weight`, `text-transform`, ...).

## Troubleshooting by error code

| Code                     | Meaning and fix                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN_MUSHAF`         | `mushaf` is not `qpc-v4` or `qpc-v4-tajweed`.                                                                                                     |
| `PAGE_OUT_OF_RANGE`, `LINE_OUT_OF_RANGE` | Pages are `1..604`; lines `1..15` (`1..8` on pages 1 and 2). The message names the page's line count.                             |
| `BAD_LINE_PROP`          | Pass `line={MushafLineData}` or `mushaf` + `page` + `line={number}`.                                                                              |
| `BAD_LINE_DATA`          | `line` is not a `MushafLineData` from this package version (the message names the field).                                                        |
| `UNSUPPORTED_LINE_TYPE`  | A `surah_name` or `basmallah` line; only `ayah` lines render in this version.                                                                     |
| `BAD_ENTER`              | `enter.presentation` must be `{component, props}` and `enter.timing` a `TransitionTiming`.                                                        |
| `BAD_SIZE`               | `fontSize` / `lineHeight` must be positive finite numbers.                                                                                        |
| `DATA_NOT_COMPILED`, `DATA_LOAD_FAILED` | The layout chunk is missing or broken; check the bundle / `publicPath`, or re-run the data script when building from source.       |
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

Additions planned without changing the v0.1 API: per-word highlighting (`highlight` / `renderWord`
props over the existing word elements and `words[].id`), an `exit` animation using the same
presentation machinery, header (`surah_name`) and basmallah lines, a Studio-editable wrapper via
`Interactive.withSchema`, further mushaf layouts from QUL.

## Data and licences

The layout data is compiled from QUL's public mushaf layout 19 (KFGQPC V4, 1441H) with
`scripts/fetch-qul.mjs` in the repository and validated against the printed page's invariants
(9,046 lines, 83,668 words, one ayah marker per ayah). The fonts are the King Fahd Glyph Complex fonts
as published by QUL and are fetched from QUL's CDN at render time; they are not part of this package.
Please respect the licences of the [King Fahd Complex](https://qurancomplex.gov.sa) and of
[QUL](https://qul.tarteel.ai) when distributing renders or mirroring fonts.

Package code: MIT.

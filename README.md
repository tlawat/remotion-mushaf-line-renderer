# remotion-mushaf-line-renderer

[![CI](https://github.com/tlawat/remotion-mushaf-line-renderer/actions/workflows/ci.yml/badge.svg)](https://github.com/tlawat/remotion-mushaf-line-renderer/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Render lines of the KFGQPC V4 (1441H) mushaf in [Remotion](https://www.remotion.dev), using QUL's
per-page fonts and 15-line layout.

![Page 10, line 3 of the mushaf in the normal theme](docs/assets/p10-l3-mandala.png)

## Install

The package is published on npm as
[`@tlawat/remotion-mushaf-line`](https://www.npmjs.com/package/@tlawat/remotion-mushaf-line). Install
it in an existing Remotion project (or one created with `npx create-video@latest`):

```bash
npm install @tlawat/remotion-mushaf-line
# or
bun add @tlawat/remotion-mushaf-line
pnpm add @tlawat/remotion-mushaf-line
yarn add @tlawat/remotion-mushaf-line
```

It needs three peer dependencies, which a Remotion project usually has already:

| Peer dependency         | Version          | Notes                                                        |
| ----------------------- | ---------------- | ------------------------------------------------------------ |
| `remotion`              | ≥ 4.0.374        |                                                              |
| `@remotion/transitions` | ≥ 4.0.374        | Must be the **same version** as `remotion`.                  |
| `react`                 | ≥ 18             |                                                              |

If your project does not have `@remotion/transitions` yet, add it at the version of `remotion` in your
`package.json`:

```bash
npm install @remotion/transitions@"$(npm pkg get dependencies.remotion | tr -d '"')"
```

Optional, for when QUL's CDN is unreachable (an outage, a firewall, a cloud render with no outbound
access): the page fonts as npm packages. Install the one your theme uses and pass it as
`fontFallback` (see [Usage](#usage) below):

```bash
npm install @tlawat/mushaf-fonts-qpc-v4-tajweed   # colour themes: 'light', 'dark', 'sepia', 'black', 'normal', 'p1'–'p5'
npm install @tlawat/mushaf-fonts-qpc-v4           # the 'plain' theme (monochrome, follows CSS `color`)
```

They are large (43 MB and 51 MB) and go into every bundle you build, so skip them until you need
them. The package itself ships no data and no fonts.

Requirements: Node ≥ 20. The package ships ESM and CommonJS builds with TypeScript types.

## Usage

### 1. Resolve the lines in `calculateMetadata()`

The mushaf is 604 pages of 15 lines. A line is described by plain JSON (`MushafLineData`), which you
get from `getMushafLines()`. Call it in the composition's `calculateMetadata()` so the data is fetched
once per render, the Studio shows the resolved props, and a `<Player>` can receive the same JSON.

```tsx
import type {CalculateMetadataFunction} from 'remotion';
import {getMushafLines, type MushafLineData} from '@tlawat/remotion-mushaf-line';

type Props = {lines: MushafLineData[] | null};

const HOLD = 60; // frames each line stays on screen

export const calculateMetadata: CalculateMetadataFunction<Props> = async ({props}) => {
  // Every printed line that carries At-Tawbah 9:1-11; the package finds the page itself.
  const lines = props.lines ?? (await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, theme: 'normal'}));
  return {props: {lines}, durationInFrames: HOLD * lines.length};
};
```

Other ways to pick lines:

```ts
await getMushafLines({page: 187});                                   // every line of a page
await getMushafLine({page: 10, line: 3});                            // one line
await getMushafLines({surah: 2, theme: 'light'});                    // a whole surah, in the tajweed theme
await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, slice: true}); // trim the first/last line to the range
await getMushafLocation({surah: 9, ayah: 1});                        // {page, line} where an ayah starts
```

### 2. Render each line inside a `<Sequence>`

`<MushafLine>` renders one line. It has no start-time prop: its timing comes from the enclosing
`<Sequence>`, and the page font loads behind `delayRender()` so no frame is ever painted with a
fallback font. `enter` and `exit` take any DOM presentation from `@remotion/transitions` or the
package's own `slideFade()` / `revealRtl()`.

```tsx
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {MushafLine, slideFade} from '@tlawat/remotion-mushaf-line';

export const Passage: React.FC<Props> = ({lines}) => {
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
```

### 3. Register the composition

```tsx
import {Composition} from 'remotion';

export const Root = () => (
  <Composition
    id="Passage"
    component={Passage}
    calculateMetadata={calculateMetadata}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={1} // replaced by calculateMetadata
    defaultProps={{lines: null}}
  />
);
```

Then preview and render as with any Remotion composition:

```bash
npx remotion studio
npx remotion render Passage out/passage.mp4
```

### 4. Pick a theme

`theme` is an option of every resolver (and of the `<MushafLine page line>` form) and is recorded on
the line data. `'plain'` (the default) follows CSS `color`; the others use QUL's colour font:

```tsx
<MushafLine page={10} line={3} />                  {/* plain: follows CSS `color` */}
<MushafLine page={10} line={3} theme="light" />    {/* QUL's tajweed colours, for a white page */}
<MushafLine page={10} line={3} theme="normal" />   {/* CSS-coloured writing, coloured ayah rosettes */}
<MushafLine page={10} line={3} theme="dark" />     {/* tajweed for a dark page */}
<MushafLine page={10} line={3} theme={{base: 'normal', colors: {accent: '#c8a45c'}}} />  {/* custom */}
```

### 5. Highlight the word being recited

`activeWordId` marks one word (ids look like `"9:1:3"`, surah:ayah:position) and `wordStyle` styles
every word per frame, for karaoke-style recitation videos:

```tsx
<MushafLine
  line={line}
  activeWordId={currentWordId}
  activeWordStyle={{color: '#c8a45c'}}
/>
```

### 6. Survive a CDN outage (optional)

Fonts and data are fetched from QUL's CDN at render time. Pass a fonts package as `fontFallback` and
the line falls back to it when the CDN fails; pass it as `fontSrc` to never contact the CDN:

```tsx
import tajweedFonts from '@tlawat/mushaf-fonts-qpc-v4-tajweed';

<MushafLine line={line} fontFallback={tajweedFonts} />   // CDN first, package on failure
<MushafLine line={line} fontSrc={tajweedFonts} />        // package only: offline, reproducible
```

### Using it in a `<Player>`

The `<Player>` never runs `calculateMetadata`, so resolve the lines yourself and pass them as
`inputProps`, or call `loadMushafData()` and `loadPageFont()` when the page loads so the first line
resolves without a round trip.

A complete project with three compositions, a `<Player>` page and a recitation synced to audio lives
in [`example/`](example).

## Mushaf Studio

Mushaf Studio makes word-synced recitation videos with the package, without writing code. You
pick a recitation (a reviewed one from the QUD aligner's catalogue, or your own recording aligned
with the [QUD Universal Aligner](https://aligner.qud.dev)), check the alignment word by word, split
long lines, pick a look, add translations, and render the video. It is a proof of concept, in two
apps on one package:

- [`apps/mushaf-studio`](apps/mushaf-studio): a ready-made Remotion project. Remotion Studio, plus a
  Mushaf panel docked beside the preview (Source, Look, Align, Review, Lines, Text), five
  compositions, and `bun run make` to go from a catalogue recitation to a video on the command line.
  [README](apps/mushaf-studio/README.md): the panel, the props, rendering, privacy, licences.
- [`apps/mushaf-web`](apps/mushaf-web): one static page that does the catalogue path in the browser,
  with nothing to install: a recitation, a look, a translation, a `<Player>` preview, and an
  in-browser render to a file. No own recordings, alignment or review.
  [README](apps/mushaf-web/README.md).
- [`packages/mushaf-studio`](packages/mushaf-studio): `@tlawat/mushaf-studio`, the compositions, Zod
  schemas and panel both apps use, for your own Remotion project.
  [README](packages/mushaf-studio/README.md).
- [docs/mushaf-studio/plan.md](docs/mushaf-studio/plan.md): the design, its decisions and the roadmap.

From a clone of this repository:

```bash
bun install
bun run studio                            # build, fill the page fonts and fetch the sample (once), then the Studio
bun run build && bun run --cwd apps/mushaf-web dev   # the web app, at http://localhost:5174
```

## API

| Export                                   | Does                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `getMushafLines({page})`                 | Every line of a page, as JSON.                                                |
| `getMushafLines({surah, fromAyah, toAyah})` | The lines that carry an ayah range. `slice: true` trims the first/last line to the range. |
| `getMushafLine({page, line})`            | One line.                                                                     |
| `getMushafLocation({surah, ayah})`       | `{page, line}` where an ayah starts.                                          |
| `<MushafLine line={data} />`             | Renders a line. Waits for the page font behind `delayRender()`.               |
| `parseRecitationTimings(json)`, `recitedRange()` | Validates a recording's timings JSON (ayah and word times, any aligner); the range to resolve lines for. |
| `scheduleLines(lines, timings)`          | When each line is on screen, from the timings: `[{index, start, end}]` in seconds.        |
| `wordAt(timings, seconds)`               | The word being recited at a moment, for `activeWordId`.                       |
| `<MushafLine page={10} line={3} />`      | Same, resolving the line at render time. Header and basmalah lines render too. |
| `<MushafSurahName surah={9} />`          | A surah's name in its printed frame, from QUL's surah-name font.               |
| `<MushafJuzName juz={1} />`              | A juz's name, from QUL's `quran-common` font.                                  |
| `slideFade()`, `revealRtl()`             | Presentations for `enter` / `exit`. Any DOM presentation from `@remotion/transitions` works too. |
| `loadPageFont()`, `loadSharedFont()`, `loadMushafData()` | Preload a font or the data, e.g. for a `<Player>`.                    |
| `getMushafFontFile({page, theme})`       | A font's file name, format and CDN URL, for a `fontSrc` resolver (`{font}` for the shared fonts). |

Main `<MushafLine>` props: `theme` (`'plain'` follows CSS `color`; `'light'`, `'dark'`, `'sepia'`,
`'black'`, `'normal'`, `'p1'`–`'p5'` or a custom palette), `slice`, `fit`, `fontSize`, `enter`,
`exit`, `activeWordId`, `wordStyle`, `framed` (header lines), `fontSrc` (`'cdn'`, a fonts package
or your own URLs) and `fontFallback` (a fonts package, used when the CDN fails).

Full reference: [package README](packages/remotion-mushaf-line-renderer/README.md).

## Limitations

- Only the KFGQPC V4 15-line mushaf.
- Data (~1.2 MB, once per tab) and fonts (70–115 KB per page; 830 KB for the surah-name font) are
  fetched from QUL's CDN at render time. Pass `data` to use a mirror of the data in `public/`, and a
  fonts package as `fontFallback` (or `fontSrc`) for the page fonts; see
  [When the CDN fails](packages/remotion-mushaf-line-renderer/README.md#when-the-cdn-fails). The
  surah-name and juz fonts are not in the fonts packages: serve them yourself through `fontSrc`, see
  [Surah names and juz names](packages/remotion-mushaf-line-renderer/README.md#surah-names-and-juz-names).

## Development

Requires Bun ≥ 1.2 and Node ≥ 20.

```bash
bun install
bun run build   # build the packages (the renderer, then Mushaf Studio's)
bun run dev     # fill the fonts packages (from QUL's CDN on first run), then Remotion Studio on example/
bun run studio  # Mushaf Studio (apps/mushaf-studio): build, fill the fonts, fetch the sample, open the Studio
bun run test    # unit tests
```

| Path                                                                               | Contents                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------- |
| [`packages/remotion-mushaf-line-renderer`](packages/remotion-mushaf-line-renderer) | The package                               |
| [`packages/fonts-qpc-v4`](packages/fonts-qpc-v4), [`packages/fonts-qpc-v4-tajweed`](packages/fonts-qpc-v4-tajweed) | The page fonts as npm packages (the CDN fallback) |
| [`packages/mushaf-studio`](packages/mushaf-studio)                                 | `@tlawat/mushaf-studio`: compositions, Zod schemas and the Mushaf panel for Remotion Studio |
| [`apps/mushaf-studio`](apps/mushaf-studio)                                         | Mushaf Studio, the ready-made Remotion project (`bun run studio`) |
| [`apps/mushaf-web`](apps/mushaf-web)                                               | Mushaf Studio Web: the catalogue path and an in-browser render, as one static page |
| [`example`](example)                                                               | Example Remotion project and test harness |
| [`scripts`](scripts)                                                               | `qul` CLI: mirror and check QUL's data and fonts; the fonts packages' tool |
| [`docs`](docs)                                                                     | Architecture and font notes; Mushaf Studio's plan |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the test suites and checks CI runs.

## Licence

Code: [MIT](LICENSE). The package ships no data and no fonts. The data is open data from
[QUL](https://qul.tarteel.ai); the fonts (the page fonts, the surah-name font and `quran-common`)
belong to the [King Fahd Complex](https://qurancomplex.gov.sa) and are not open source. The two
fonts packages redistribute the page fonts unmodified, as QUL publishes them; see each package's
`LICENSE.md` and `NOTICE.md`.

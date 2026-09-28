# remotion-mushaf-line-renderer

[![CI](https://github.com/tlawat/remotion-mushaf-line-renderer/actions/workflows/ci.yml/badge.svg)](https://github.com/tlawat/remotion-mushaf-line-renderer/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Render lines of the KFGQPC V4 (1441H) mushaf in [Remotion](https://www.remotion.dev), using QUL's
per-page fonts and 15-line layout.

![Page 10, line 3 of the mushaf in the normal theme](docs/assets/p10-l3-mandala.png)

## Install

```bash
npm install @tlawat/remotion-mushaf-line
```

Peer dependencies: `remotion` and `@remotion/transitions` ≥ 4.0.374, `react` ≥ 18.

Optional, for when QUL's CDN fails: `@tlawat/mushaf-fonts-qpc-v4-tajweed` (colour themes) or
`@tlawat/mushaf-fonts-qpc-v4` (`'plain'`), the page fonts as npm packages.

## Usage

```tsx
import {MushafLine, getMushafLines, slideFade} from '@tlawat/remotion-mushaf-line';

// calculateMetadata(): the printed lines that carry At-Tawbah 9:1-11
const lines = await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11});

// composition: one <Sequence> per line
{lines.map((line, i) => (
  <Sequence key={line.line} from={i * 60} durationInFrames={60} premountFor={fps}>
    <MushafLine line={line} enter={slideFade()} exit={slideFade()} />
  </Sequence>
))}
```

## API

| Export                                   | Does                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `getMushafLines({page})`                 | Every line of a page, as JSON.                                                |
| `getMushafLines({surah, fromAyah, toAyah})` | The lines that carry an ayah range. `slice: true` trims the first/last line to the range. |
| `getMushafLine({page, line})`            | One line.                                                                     |
| `getMushafLocation({surah, ayah})`       | `{page, line}` where an ayah starts.                                          |
| `<MushafLine line={data} />`             | Renders a line. Waits for the page font behind `delayRender()`.               |
| `<MushafLine page={10} line={3} />`      | Same, resolving the line at render time.                                      |
| `slideFade()`, `revealRtl()`             | Presentations for `enter` / `exit`. Any DOM presentation from `@remotion/transitions` works too. |
| `loadPageFont()`, `loadMushafData()`     | Preload a font or the data, e.g. for a `<Player>`.                            |
| `getMushafFontFile({page, theme})`       | The page font's file name, format and CDN URL, for a `fontSrc` resolver.      |

Main `<MushafLine>` props: `theme` (`'plain'` follows CSS `color`; `'light'`, `'dark'`, `'sepia'`,
`'black'`, `'normal'`, `'p1'`–`'p5'` or a custom palette), `slice`, `fit`, `fontSize`, `enter`,
`exit`, `activeWordId`, `wordStyle`, `fontSrc` (`'cdn'`, a fonts package or your own URLs) and
`fontFallback` (a fonts package, used when the CDN fails).

Full reference: [package README](packages/remotion-mushaf-line-renderer/README.md).

## Limitations

- Only `ayah` lines render. Surah-name and basmalah lines come back with no words and throw
  `UNSUPPORTED_LINE_TYPE` in `<MushafLine>`.
- Only the KFGQPC V4 15-line mushaf.
- Data (~1.2 MB, once per tab) and fonts (70–115 KB per page) are fetched from QUL's CDN at render
  time. Pass `data` to use a mirror of the data in `public/`, and a fonts package as `fontFallback`
  (or `fontSrc`) for the fonts; see
  [When the CDN fails](packages/remotion-mushaf-line-renderer/README.md#when-the-cdn-fails).

## Development

Requires Bun ≥ 1.2 and Node ≥ 20.

```bash
bun install
bun run build   # build the package
bun run dev     # fill the fonts packages (from QUL's CDN on first run), then Remotion Studio on example/
bun run test    # unit tests
```

| Path                                                                               | Contents                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------- |
| [`packages/remotion-mushaf-line-renderer`](packages/remotion-mushaf-line-renderer) | The package                               |
| [`packages/fonts-qpc-v4`](packages/fonts-qpc-v4), [`packages/fonts-qpc-v4-tajweed`](packages/fonts-qpc-v4-tajweed) | The page fonts as npm packages (the CDN fallback) |
| [`example`](example)                                                               | Example Remotion project and test harness |
| [`scripts`](scripts)                                                               | `qul` CLI: mirror and check QUL's data and fonts; the fonts packages' tool |
| [`docs`](docs)                                                                     | Architecture and font notes               |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the test suites and checks CI runs.

## Licence

Code: [MIT](LICENSE). The package ships no data and no fonts. The data is open data from
[QUL](https://qul.tarteel.ai); the fonts belong to the [King Fahd Complex](https://qurancomplex.gov.sa)
and are not open source. The two fonts packages redistribute them unmodified, as QUL publishes them;
see each package's `LICENSE.md` and `NOTICE.md`.

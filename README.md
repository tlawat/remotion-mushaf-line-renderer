# remotion-mushaf-line-renderer

[![CI](https://github.com/tlawat/remotion-mushaf-line-renderer/actions/workflows/ci.yml/badge.svg)](https://github.com/tlawat/remotion-mushaf-line-renderer/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Render lines of the KFGQPC V4 (1441H) mushaf in [Remotion](https://www.remotion.dev), using QUL's
per-page fonts and 15-line layout.

![Page 10, line 3 of the mushaf in the normal theme](docs/assets/p10-l3-mandala.png)

## Install

Not on npm yet. Until the first release, build it from this repository (see [Development](#development)).

```bash
npm install remotion-mushaf-line-renderer
```

Peer dependencies: `remotion` and `@remotion/transitions` ≥ 4.0.374, `react` ≥ 18.

## Usage

```tsx
import {MushafLine, getMushafLines, slideFade} from 'remotion-mushaf-line-renderer';

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

Main `<MushafLine>` props: `theme` (`'plain'` follows CSS `color`; `'light'`, `'dark'`, `'sepia'`,
`'black'`, `'normal'`, `'p1'`–`'p5'` or a custom palette), `slice`, `fit`, `fontSize`, `enter`,
`exit`, `activeWordId`, `wordStyle`.

Full reference: [package README](packages/remotion-mushaf-line-renderer/README.md).

## Limitations

- Only `ayah` lines render. Surah-name and basmalah lines come back with no words and throw
  `UNSUPPORTED_LINE_TYPE` in `<MushafLine>`.
- Only the KFGQPC V4 15-line mushaf.
- Data (~1.2 MB, once per tab) and fonts (~300 KB per page) are fetched from QUL's CDN at render time.
  Pass `data` and `fontUrl` to use a mirror in `public/` instead.

## Development

Requires Bun ≥ 1.2 and Node ≥ 20.

```bash
bun install
bun run build   # build the package
bun run dev     # Remotion Studio on example/
bun run test    # unit tests
```

| Path                                                                               | Contents                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------- |
| [`packages/remotion-mushaf-line-renderer`](packages/remotion-mushaf-line-renderer) | The package                               |
| [`example`](example)                                                               | Example Remotion project and test harness |
| [`scripts`](scripts)                                                               | `qul` CLI: mirror and check QUL's data and fonts |
| [`docs`](docs)                                                                     | Architecture and font notes               |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the test suites and checks CI runs.

## Licence

Code: [MIT](LICENSE). The package ships no data and no fonts. The data is open data from
[QUL](https://qul.tarteel.ai); the fonts belong to the [King Fahd Complex](https://qurancomplex.gov.sa)
and must not be redistributed unless their licence allows it.

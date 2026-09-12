# remotion-mushaf-line-renderer

[![CI](https://github.com/tlawat/remotion-mushaf-line-renderer/actions/workflows/ci.yml/badge.svg)](https://github.com/tlawat/remotion-mushaf-line-renderer/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Render lines of the Quran in [Remotion](https://www.remotion.dev) videos exactly as they are printed
in the KFGQPC V4 (1441H) mushaf: the same page fonts, the same line breaks, the same word spacing,
with entrances and exits in `@remotion/transitions` vocabulary.

![Page 10, line 3 of the mushaf in the mandala look](docs/assets/p10-l3-mandala.png)

```tsx
import {MushafLine, getMushafLines, slideFade} from 'remotion-mushaf-line-renderer';

// in calculateMetadata(): every line that carries At-Tawbah 9:1-11
const lines = await getMushafLines({surah: 9, fromAyah: 1, toAyah: 11, look: 'mandala'});

// in the composition: one <Sequence> per line
<Sequence from={i * 60} durationInFrames={60} premountFor={fps}>
  <MushafLine line={line} enter={slideFade()} exit={slideFade()} />
</Sequence>;
```

## Why

Quran text cannot be typeset like other text. The [Quranic Universal Library (QUL)](https://qul.tarteel.ai)
publishes one font per page of the printed mushaf in which every word is a single pre-shaped glyph,
plus the layout data that says which words sit on which line. This package turns that into a Remotion
component: you ask for a page, a line, a surah or an ayah range, and get frames that match the print.

- **Faithful.** One DOM element per word, at the font's own advances. No shaping, no justification, no
  line breaking to get wrong. Nothing is painted before the page font has loaded.
- **Remotion-native.** Timing from the enclosing `<Sequence>`, `delayRender()` for the fonts, plain
  JSON line data for `calculateMetadata()`, works in the Studio, the CLI, Lambda and the `<Player>`.
- **Three looks.** Plain black glyphs that follow CSS `color`, QUL's tajweed colours, or "mandala":
  plain writing with coloured ayah rosettes, recolourable part by part.
- **Motion that reads well.** `slideFade()` and `revealRtl()` presentations, eased default timings,
  and every DOM presentation from `@remotion/transitions`.
- **Loud errors.** Every failure is a `MushafError` with a stable code and a message that names the fix.

## Get started

```bash
bun add remotion-mushaf-line-renderer   # or npm install
```

Then read the **[package documentation](packages/remotion-mushaf-line-renderer/README.md)**: quick
start, the full `<MushafLine>` API, looks and colours, sizing, animation, fonts, per-word hooks,
errors. It is what npm shows too.

## In this repository

| Path                                                                       | What it is                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`packages/remotion-mushaf-line-renderer`](packages/remotion-mushaf-line-renderer) | The npm package: the component, the resolvers, the font loader, the compiled layout data.  |
| [`example`](example)                                                       | A Remotion project: three lines of a page, a recitation synced to audio, and a `<Player>` harness. |
| [`scripts`](scripts)                                                       | The `qul` CLI that compiles QUL's layout data and mirrors the page fonts.                          |
| [`docs`](docs)                                                             | Architecture notes and what we learned about the QUL fonts.                                       |

Try the example:

```bash
git clone https://github.com/tlawat/remotion-mushaf-line-renderer.git
cd remotion-mushaf-line-renderer
bun install && bun run build
bun run dev          # opens the Remotion Studio on the example
```

## Documentation

- [Package README](packages/remotion-mushaf-line-renderer/README.md): install, API, guides, errors.
- [Example README](example/README.md): the compositions, their props, mirroring fonts, recitation timings.
- [Architecture](docs/architecture.md): how the data pipeline, the resolvers and the component fit together.
- [KFGQPC V4 rendering notes](docs/kfgqpc-v4-rendering-notes.md).
- [Changelog](packages/remotion-mushaf-line-renderer/CHANGELOG.md).

## Contributing

Bug reports, questions and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains
the toolchain (Bun, Biome, vitest, Playwright), the test suites, the data pipeline and the rules
around the fonts.

## Licences

The code is [MIT](LICENSE). The layout data is compiled from QUL's public mushaf layout. The fonts
are King Fahd Glyph Complex fonts published by QUL: the package fetches them from QUL's CDN at render
time and never redistributes them. Please respect the licences of the
[King Fahd Complex](https://qurancomplex.gov.sa) and of [QUL](https://qul.tarteel.ai) when you
distribute renders or mirror the fonts.

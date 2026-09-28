# Example project

A Remotion project that uses `remotion-mushaf-line-renderer` the way an app would, plus the `<Player>`
harness the browser tests drive. Run it from the repository root after `bun install && bun run build`:

```bash
bun run dev                    # Remotion Studio with the three compositions
bun run --cwd example player   # the <Player> harness at http://localhost:4173/player/?scenario=fade
```

## Compositions

### `ThreeLines`

Three consecutive lines of one page, each with a different entrance/exit pair (`slideFade`, `fade`,
`slide`, a soft `revealRtl`). In `replace` mode the lines share one slot and each leaves as the next
enters; in `stack` mode they stack down the page and stay.

| Prop              | Default     | Meaning                                                                                      |
| ----------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `theme`           | `'plain'`   | `'plain'`, a preset (`light`, `dark`, `sepia`, `black`, `normal`, `p1`–`p5`) or `{base, colors, marker}`. |
| `page`            | `10`        | The page.                                                                                    |
| `lineNumbers`     | `[3, 4, 5]` | Which lines of it (ayah lines only).                                                         |
| `fonts`           | `'fallback'` | `'fallback'`: QUL's CDN, then the fonts packages; `'cdn'`: the CDN only; `'package'`: the packages only. |
| `dataFiles`       | `null`      | `{words, layout}` paths of the mirrored exports in `public/`; `null` fetches them from Tarteel's CDN. |
| `mode`            | `'replace'` | `'replace'` or `'stack'`.                                                                    |
| `lines`           | `null`      | Filled in by `calculateMetadata`; a `<Player>` host passes resolved lines here.               |

```bash
cd example && bunx remotion render ThreeLines out/three-lines.mp4 --props='{"theme":"normal"}'
```

### `Recitation`

A recited passage: the printed lines follow the audio. A timings JSON lists the ayat of a passage
with their timeframes (and, optionally, per-word times); `calculateMetadata` asks the package for the
lines that carry those ayahs (`getMushafLines({surah, fromAyah, toAyah})`, which finds the page
itself) and schedules one `<Sequence>` per line so that the line is fully in place when its first
word is heard (`leadInSeconds` early) and its exit finishes exactly where the next line's entrance
starts.

| Prop              | Default                      | Meaning                                                                          |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `theme`           | `'plain'`                    | As above.                                                                        |
| `timingsFile`     | `'audio/tawbah-timings.json'` | Timings JSON in `public/`; or pass `timings` inline.                            |
| `audioFile`       | `'audio/tawbah.mp3'`         | Audio in `public/`. Not committed: put your recording there before rendering.    |
| `fonts`           | `'fallback'`                 | As above.                                                                        |
| `dataFiles`       | `null`                       | As above.                                                                        |
| `cutAtSeconds`    | `60`                         | Stop after the last ayah that ends before this; `null` plays everything.         |
| `leadInSeconds`   | `0.4`                        | Seconds a line is on screen before its first word is heard.                      |
| `slice`           | `true`                       | Show only the recited ayahs on the first and last lines (`getMushafLines({slice: true})`). |

```bash
cd example && bunx remotion render Recitation out/recitation.mp4 \
  --props='{"fonts":"package","dataFiles":{"words":"data/qpc-v4/words.json.zip","layout":"data/qpc-v4/layout.db.zip"}}'
```

The committed timings (`public/audio/tawbah-timings.json`, At-Tawbah 9:1-11) were produced by
`tools/align-recitation.py`: pause detection, Whisper (medium, via sherpa-onnx) on each segment, and
an alignment of the recognised words to the reference text in `tools/tawbah-9-1-13.json`. It is a
development tool with the accuracy of that model, not part of the package.

### `LineHarness`

The test harness: explicit lines or one line resolved in the tab from a `data` source, one
entrance/exit for all of them, font and data source knobs, slicing, page colour and background,
highlighting scenarios. Used by `player/` (the `<Player>` page, scenarios in `player/scenarios.ts`) and by the
package's browser and render suites.

## Fonts

The page fonts come from QUL's CDN on first use (70–115 KB per page). The example also depends on
both fonts packages (`remotion-mushaf-fonts-qpc-v4` and `-qpc-v4-tajweed`, workspace packages here)
and passes them as `fontFallback`, so a render still finishes when the CDN is down; the `fonts` prop
switches to the CDN alone or to the packages alone (offline, reproducible):

```bash
bunx remotion render ThreeLines out/three-lines.mp4 --props='{"fonts":"package"}'
```

In this repository the packages' `fonts/` folders are filled by `bun run fonts-packages:fill` (from
`public/fonts/` when a page is there, else from QUL's CDN), which `bun run dev` runs first; run it
yourself before rendering with the CLI. `bun run qul fonts 10` downloads one page into `public/fonts/`.
Nothing under `public/fonts/` is committed.

## Data

The lines are built from QUL's two exports, fetched from Tarteel's CDN the first time a line is
resolved. The repository keeps a mirror of them under `public/data/qpc-v4/` (committed; refresh it
with `bun run qul data`), and `dataFiles` points the compositions at it, so renders and the Studio
do not depend on the CDN and Lambda sites find the mirror through `staticFile()`.

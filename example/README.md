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
| `look`            | `'plain'`   | `'plain'`, `'tajweed'` or `'mandala'`.                                                       |
| `colors`          | `null`      | Mandala only: `{ink, accent, detail, background}`.                                            |
| `page`            | `10`        | The page.                                                                                    |
| `lineNumbers`     | `[3, 4, 5]` | Which lines of it (ayah lines only).                                                         |
| `fontFilePattern` | `null`      | `'fonts/{fontSet}/p{page}.woff2'` to serve the fonts from `public/`; `null` uses QUL's CDN.   |
| `mode`            | `'replace'` | `'replace'` or `'stack'`.                                                                    |
| `lines`           | `null`      | Filled in by `calculateMetadata`; a `<Player>` host passes resolved lines here.               |

```bash
cd example && bunx remotion render ThreeLines out/three-lines.mp4 --props='{"look":"mandala"}'
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
| `look`, `colors`  | `'plain'`, `null`            | As above.                                                                        |
| `timingsFile`     | `'audio/tawbah-timings.json'` | Timings JSON in `public/`; or pass `timings` inline.                            |
| `audioFile`       | `'audio/tawbah.mp3'`         | Audio in `public/`. Not committed: put your recording there before rendering.    |
| `fontFilePattern` | `null`                       | As above.                                                                        |
| `cutAtSeconds`    | `60`                         | Stop after the last ayah that ends before this; `null` plays everything.         |
| `leadInSeconds`   | `0.4`                        | Seconds a line is on screen before its first word is heard.                      |

```bash
cd example && bunx remotion render Recitation out/recitation.mp4 --props='{"fontFilePattern":"fonts/{fontSet}/p{page}.woff2"}'
```

The committed timings (`public/audio/tawbah-timings.json`, At-Tawbah 9:1-11) were produced by
`tools/align-recitation.py`: pause detection, Whisper (medium, via sherpa-onnx) on each segment, and
an alignment of the recognised words to the reference text in `tools/tawbah-9-1-13.json`. It is a
development tool with the accuracy of that model, not part of the package.

### `LineHarness`

The test harness: explicit lines, one entrance/exit for all of them, font-source knobs, highlighting
scenarios. Used by `player/` (the `<Player>` page, scenarios in `player/scenarios.ts`) and by the
package's browser and render suites.

## Fonts

By default the fonts come from QUL's CDN on first use (about 300 KB per page). To work offline or to
make renders reproducible, mirror them into `public/fonts/` and point the compositions at them with
`fontFilePattern`:

```bash
bun run qul fonts 10          # one page, both sets
bun run qul mirror            # every page (development only; see CONTRIBUTING.md about the fonts)
```

If a cold CDN makes the "waiting for font" `delayRender()` time out, raise the budget for that
render: `bunx remotion render ThreeLines --timeout=60000`.

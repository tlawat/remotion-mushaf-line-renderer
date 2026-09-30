# Example project

A Remotion project that uses `@tlawat/remotion-mushaf-line` the way an app would, plus the `<Player>`
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

A recited passage: the printed lines follow the audio. A recitation timings JSON (the package's
`RecitationTimings`: the ayat of a passage with their timeframes and, optionally, per-word times) is
validated with `parseRecitationTimings()`; `calculateMetadata` asks the package for the lines that
carry those ayahs (`getMushafLines(recitedRange(timings))`, which finds the page itself), lets
`scheduleLines()` say when each line is on screen, and places one `<Sequence>` per line so that the
line is fully in place when its first word is heard (`leadInSeconds` early) and its exit finishes
exactly where the next line's entrance starts.

| Prop              | Default                      | Meaning                                                                          |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `theme`           | `'plain'`                    | As above.                                                                        |
| `timingsFile`     | `'audio/tawbah-timings-qud.json'` | Timings JSON in `public/`; or pass `timings` inline.                        |
| `audioFile`       | `'audio/tawbah.mp3'`         | Audio in `public/`. Not committed: put your recording there before rendering.    |
| `fonts`           | `'fallback'`                 | As above.                                                                        |
| `dataFiles`       | `null`                       | As above.                                                                        |
| `cutAtSeconds`    | `null`                       | Stop after the last ayah that ends before this; `null` plays everything.         |
| `leadInSeconds`   | `0.4`                        | Seconds a line is on screen before its first word is heard.                      |
| `slice`           | `true`                       | Show only the recited ayahs on the first and last lines (`getMushafLines({slice: true})`). |
| `occurrence`      | `'first'`                    | When the reciter repeats a word after a pause: change lines when it is first heard, or (`'last'`) at its final recitation. |
| `visibleLines`    | `3`                          | Lines on screen at once through one `<MushafLineWindow>`, the current line in the middle and the whole stack scrolling by a line as the recitation moves on; `null` shows one line at a time, replaced in place. |
| `neighbourOpacity`| `0.45`                       | In the window: opacity of the lines around the current one.                      |

```bash
cd example && bunx remotion render Recitation out/recitation.mp4 \
  --props='{"fonts":"package","dataFiles":{"words":"data/qpc-v4/words.json.zip","layout":"data/qpc-v4/layout.db.zip"}}'
```

The timings file is the package's neutral format; nothing in the package produces it. `tools/` holds
three example producers, all development tools with the accuracy of their model, none part of the
package. The two committed files are the same recording of At-Tawbah through each, kept to 9:1-5
(about 1:54; the whole recitation is the reciter's). Ayah 5 shares its last printed line with ayah 6,
so the passage ends on a sliced line: only 9:5's words, centred, the way `slice` is meant to be used.

- `tools/align-with-qud.ts` writes `public/audio/tawbah-timings-qud.json` from the
  [QUD Universal Aligner](https://aligner.qud.dev) API (`qud-aligner.ts` holds the client and the
  converter): the recording is uploaded, cut at the reciter's pauses, matched to the Quran text with
  no reference needed, and timed word by word; a repeated word comes back once per occurrence and
  each segment carries a confidence. No key; the free daily GPU quota falls back to the CPU. The audio
  leaves the machine and the output is CC-BY-4.0.

  ```bash
  bun tools/align-with-qud.ts --audio audio/tawbah.mp3 --out public/audio/tawbah-timings-qud.json --to-ayah 5
  ```

- `tools/align-with-mfa.py` writes the same format offline with the
  [Montreal Forced Aligner](https://montreal-forced-aligner.readthedocs.io) and Quran-Lab's
  [Hafs acoustic model](https://huggingface.co/Quran-Lab/mfa-quran-hafs) (Apache-2.0, trained on
  recitation: long madd, ghunna, mosque reverb). The audio never leaves the machine. MFA only times a
  text it is given, and a reciter who pauses and repeats says words the text does not have, so the
  tool works in two passes. It cuts the recording in the middle of the reciter's pauses, finds which
  words each phrase holds by aligning it (through kalpy, MFA's Kaldi bindings) against a graph of the
  passage that may start at any word, so a phrase that starts before the previous one ended is a
  repeat, and verifies every repeat against a continuous reading of the same audio (a quiet ghunna
  can split one word into two phrases that both claim it). Then `mfa align`, with the model card's
  beams (40/160), times the words of each stretch of continuous reading. A repeated word comes back
  once per occurrence; a complete ayah gets its ayah-end marker, as with the QUD tool. The Uthmani text
  comes from [quran-transcript](https://github.com/obadx/quran-transcript), the text the model's
  dictionary was built from (every word of the Quran is in it); its words match QUL's word ids in every
  ayah but 37:130. The model (62 MB) is downloaded from Hugging Face on first use, pinned to a revision
  and checked against its SHA-256.

  MFA needs Kaldi, OpenFst and OpenGrm from conda-forge (about 2 GB), so the tool runs in its own
  environment, described in `tools/mfa-environment.yml`:

  ```bash
  micromamba create -n mfa-quran -f tools/mfa-environment.yml
  micromamba run -n mfa-quran python tools/align-with-mfa.py \
      --audio audio/tawbah.mp3 --surah 9 --out public/audio/tawbah-timings-mfa.json --to-ayah 5
  # --from-ayah N        the first ayah recited (default 1; the recording must start there)
  # --report r.json      phrases, repeats and warnings, for a check before rendering
  # --intro none         no isti'adha/basmala expected (by default an optional one is allowed and dropped)
  # --model-dir DIR      where the model is cached (default ~/.cache/mfa-quran-hafs)
  ```

  Unlike the QUD tool it has to be told the surah and the first ayah; it does not find the passage
  itself. Hafs only. A repeat without a pause in front of it is not detected (the phrase is forced
  onto the text). Warnings (a skipped word, a phrase that fits the text poorly, an ayah only partly
  heard) go to stderr and to `--report`; read them before trusting a file. On a 3:39 recording of
  At-Tawbah 9:1-11 it ran in about 45 s on 4 CPU cores, found the same four repeats as the QUD tool,
  and its line changes were within 0.41 s of the QUD tool's (median 0.05 s). The larger differences
  are a convention, not an error: where a ghunna joins two words (`بَرَآءَةٌۭ مِّنَ`), the model's
  dictionary gives the merged sound to the second word, which then starts up to half a second
  earlier. MFA 3.4's `align` skips its speaker-adaptation pass, so the timing pass is not
  speaker-adapted.

- `tools/align-recitation.py` writes `public/audio/tawbah-timings.json` offline: pause detection,
  Whisper (medium, via sherpa-onnx) on each segment, and an alignment of the recognised words to the
  reference text in `tools/tawbah-9-1-13.json`, which has to name the passage in advance (the
  committed file was then cut to 9:1-5).

### `SurahOpening`

The opening of a surah as a title card: the juz it starts in (`<MushafJuzName>`), its header (the
name in its printed frame), its basmalah when it has one and its first ayah lines, all from one
`getMushafLines({page})` call and one `<MushafLine>`, entering one after the other.

| Prop         | Default      | Meaning                                                                                   |
| ------------ | ------------ | ----------------------------------------------------------------------------------------- |
| `theme`      | `'normal'`   | As above.                                                                                 |
| `surah`      | `36`         | The surah, 1–114.                                                                         |
| `ayahLines`  | `2`          | How many ayah lines follow the header and the basmalah.                                   |
| `juz`        | `22`         | The juz shown above the header (the data carries no juz boundaries); `null` shows none.   |
| `framed`     | `true`       | The surah name in its frame, or alone.                                                    |
| `fonts`, `dataFiles` | as above | In `'package'` mode the shared fonts come from `public/fonts/<id>/` (`bun run qul fonts`). |

```bash
cd example && bunx remotion render SurahOpening out/surah-opening.mp4 --props='{"surah":9,"juz":10}'
```

### `LineHarness`

The test harness: explicit lines or one line resolved in the tab from a `data` source, one
entrance/exit for all of them, font and data source knobs, slicing, page colour and background,
highlighting scenarios. Used by `player/` (the `<Player>` page, scenarios in `player/scenarios.ts`) and by the
package's browser and render suites.

## Fonts

The page fonts come from QUL's CDN on first use (70–115 KB per page), and so do the surah-name and
juz fonts a header, a basmalah or a juz name needs (830 KB and 67 KB). The example also depends on
both fonts packages (`@tlawat/mushaf-fonts-qpc-v4` and `-qpc-v4-tajweed`, workspace packages here)
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

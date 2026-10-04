# Mushaf Studio

Mushaf Studio is a Remotion project for making recitation videos of the KFGQPC V4 mushaf without
writing code. You open it in Remotion Studio, pick a recitation (a reviewed one from the QUD
aligner's catalogue, or your own recording), and the printed lines of the mushaf follow the audio
word by word, the current word highlighted, with a translation under the lines if you want one.
The video is rendered from the Studio's Render button or from the command line.

Three compositions come ready: `MushafRecitation` (the printed lines of the mushaf follow the
audio, one line at a time or through a window of lines), `MushafAyahText` (one ayah at a time as
Unicode text in QUL's Uthmani Hafs font, a 9:16 reel by default, same audio, timings and
highlighting) and `MushafPassage` (printed lines without audio, each held for a few seconds).

It is Remotion Studio as it comes (the preview, the timeline, the Props sidebar, the Render button)
plus a **Mushaf panel** docked over the preview, which does what the Props sidebar cannot: it
fetches a recitation, aligns it with the [QUD Universal Aligner](https://aligner.qud.dev), shows
where the alignment is doubtful and lets you fix it, splits long printed lines, and fetches
translations. Everything the panel and the sidebar change is saved as the composition's props in
`src/Root.tsx`, and the files those props point to live in `public/`, so the preview, the Render
button and the CLI always render the same thing. The compositions and the panel come from
[`@tlawat/mushaf-studio`](../../packages/mushaf-studio); the lines are drawn by
[`@tlawat/remotion-mushaf-line`](../../packages/remotion-mushaf-line-renderer).

## Requirements

- [Bun](https://bun.sh) 1.2 or newer and [Node.js](https://nodejs.org) 20 or newer.
- A browser for the Studio. The tajweed colour themes need `font-palette` (Chrome 101, Safari 15.4,
  Firefox 107 or newer).
- For rendering, Chrome Headless Shell: Remotion downloads it on the first render, or ahead of time
  with `bunx remotion browser ensure` (run in this folder). On Linux it needs the usual Chromium
  system libraries.
- A network connection: the page fonts come from QUL's CDN (and from the fonts packages when it
  fails), the catalogue and the aligner from `aligner.qud.dev`, translations from `api.quran.com`.

## Install and start

From the repository root:

```bash
bun install
bun run build                 # the two packages the app imports, into packages/*/dist
bun run fonts-packages:fill   # once: the page fonts (about 94 MB) from QUL's CDN into the fonts packages
bun run studio                # Remotion Studio on this project, in your browser
```

The Root imports both fonts packages (the fallback when QUL's CDN fails), so their `fonts/` folders
must be filled before the Studio can bundle the project; `fonts-packages:fill` checks every file
against the packages' manifests and only downloads what is missing.

The Studio opens on `MushafRecitation` with the committed sample: Al-Fatihah 1:2-7 recited by Abdul
Hamid Ghraio, the audio streamed from the catalogue's clip URL and the timings in
`public/mushaf-studio/fatiha/timings.json`. Press play.

| Composition        | What it is                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `MushafRecitation` | A recited passage: the printed lines follow the audio, word by word. The panel works on this one. |
| `MushafPassage`    | A passage without audio: each line stays `holdSeconds`, then gives way to the next. Set the surah and the ayahs in the Props sidebar. |

## The Mushaf panel

The panel is docked over the preview of `MushafRecitation`, with five tabs. Every change it makes
goes the same way: it writes its files into `public/mushaf-studio/default/`, saves the
composition's props into `src/Root.tsx`, and re-runs the composition's
`calculateMetadata()`, so the preview, the video's duration and the Props sidebar follow. The panel
exists in the Studio only: it is never in a rendered video.

### Source

Where the recitation comes from.

- **Catalogue.** The aligner's catalogue lists about ninety reviewed recitations (reciter, riwayah,
  style) and the chapters each covers. Pick one, a surah and an ayah range: the panel fetches the
  reviewed segments with their word times, downloads the catalogue's clip of exactly that range,
  writes both into the project's folder and points `audioFile` and `timingsFile` at them (if the
  download fails, `audioFile` streams the clip from the catalogue instead). Nothing is uploaded and
  there is nothing to align; go to Review.
- **Own recording.** Pick an audio file, or one already in `public/`. The panel copies it into the
  project's folder and sets `audioFile`. It stays on your machine until you press Align.

### Align

Sends your recording to the QUD Universal Aligner, which cuts it at the reciter's pauses,
recognises each phrase, matches it to the Quran text (it finds the surah and the ayahs itself) and
times every word. You choose the model (`Base` or `Large`), the device (GPU or CPU) and the riwayah
(Hafs, Warsh, Qalun, Shu'bah); progress shows as it runs (queued, segmenting, transcribing,
matching, recovering, building). The panel then writes the timings file: the ayahs and words with
their times (a word the reciter repeated comes back once per recitation) and, next to them, the
aligner's segments with their confidence.

Use is free: a daily GPU quota, then the CPU, rate limited. A Hugging Face token spends your own GPU
quota; the panel keeps it for the browser tab only and never writes it to a file or to the props.
Before the first upload the panel says that the audio is about to leave the machine (see
[Privacy](#privacy)).

### Review

The segments and their words, with each segment's confidence. A word is marked doubtful when its
segment's confidence is under the threshold (`review.confidenceThreshold`, 0.8 by default), when
its segment reports missing words or an error, when its ayah was not heard in full, or when the
reciter repeated it. Click a segment or a word to move the playhead there and listen.

To fix what you hear: nudge a word's start or end. For a recording you aligned (the aligner keeps
its session for a few hours), you can also split segments (by verses, by words, by duration, or
only at stop signs) and re-align them, or re-align over boundaries you set. Doubtful
words are also painted in the preview (`review.showDoubtful`), never in a render. Every edit is
logged in the timings file, so the file says where its numbers come from.

To use the timings outside the composition, export them. For `<name>.timings.json`, **SRT** writes
`<name>.srt` into the project's folder and **Captions JSON** writes `<name>.captions.json`, the
`Caption[]` that Remotion's caption tooling (`@remotion/captions`) reads. Both have one caption per
word, timed to the audio file (every ayah of the timings file, whatever range the composition
plays); the ayah markers are left out unless you tick *include ayah markers*.

### Lines

The printed lines the passage resolves to, and when each is on screen. A long line can be split at
a word into two timed segments: its first part is on screen alone, then its second, each centred
like a sliced line. The split is stored in the `splits` prop as `{page, line, atWordId}`; remove the
entry to undo it.

### Text

An ayah translation under (or above) the lines, and a word-by-word gloss of the current word.

- **From quran.com**: choose a translation by language, or the per-word translation or
  transliteration for the gloss. The panel saves it as a JSON file in the project's folder, so
  renders never call quran.com.
- **From QUL**: download a translation or a word-by-word file from
  [QUL](https://qul.tarteel.ai/resources/translation) (a QUL login is needed), put it in `public/`
  and pick it. Every shape QUL publishes is read (key/value, nested arrays, footnotes as tags,
  inline footnotes, text chunks, word by word); footnotes are dropped.

The files go to `text.translationFile`, `text.glossFile` and `text.transliterationFile`; how they
look is in the `text` group of the Props sidebar.

**Quran text** is what `MushafAyahText` sets, one ayah at a time. Pick the script (`uthmani` or
`indopak`) and fetch the text of this passage: the panel saves it from quran.com as
`text-<script>-<surah>-<from>-<to>.json` in the project's folder and, in `MushafAyahText`, makes it
the `textFile` when the font sets that script (the Uthmani Hafs font sets `uthmani`). In
`MushafRecitation`, whose printed lines need no text, it only saves the file and names it.

## The Props sidebar

Remotion's Props sidebar edits everything about how the video looks. Changes apply to the preview at
once; the sidebar's save button writes them into `src/Root.tsx`.

| Props                    | What they set                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `audioFile`, `timingsFile`, `fromAyah`, `toAyah`, `slice`, `splits` | The content, which the panel sets. `fromAyah`/`toAyah` 0 keep the timings' range; `slice` hides the neighbouring ayahs' words on the first and last lines. |
| `theme`, `customTheme`   | `plain` (monochrome, in `layout.color`), QUL's ten colour themes (`light`, `dark`, `sepia`, `black`, `normal`, `p1`–`p5`), or `custom`: a theme to start from and your own colour for each part (letters, silent letters, tajweed rules, the ayah-end rosette, its petals, its jewel, its disc), each with a switch. |
| `fonts`                  | Where the page fonts come from: QUL's CDN with the fonts packages as fallback (`fallback`, the default), the CDN only (`cdn`), or the packages only (`package`, offline). |
| `data`                   | The mushaf's words and line layout: the mirror committed in `public/data/qpc-v4/` (`mirror`, the default) or QUL's exports on Tarteel's CDN (`cdn`). |
| `layout`                 | The frame (16:9, 9:16 for reels, 1:1, 4:5; it sets the video's size), the lines on screen at once (0: one line, replaced in place; up to 7 in a scrolling window), the opacity of the lines around the current one, side margins, page and ink colours, a background image in `public/`, the vertical position. |
| `animation`              | How a line comes in and goes out (`slide-fade`, `fade`, `reveal-rtl`, `none`), the seconds it is on screen before its first word, the window's scroll curve. |
| `highlight`              | What follows the recitation (the word, the whole ayah, nothing), how the current word is marked (ink colour, a glow, a marker behind it) and in which colour, the dimming of the other words (all of them, or only those still to come), and which recitation of a repeated word moves the highlight. |
| `text`                   | The translation and gloss files; the translation's position, font, size, colour and writing direction; the gloss's font, size and colour. |
| `review`                 | Studio only: mark the doubtful words, the confidence threshold, the mark's colour.                |
| `resolved`               | Filled by `calculateMetadata()` (the lines, the schedule, the timings, the translation). Leave it `null`. |

`MushafPassage` has `surah`, `fromAyah`, `toAyah` (0: to the end of the surah), `slice` and
`holdSeconds`, and the same `theme`, `fonts`, `data`, `layout`, `animation` and `text` groups.

## Rendering

### From the Studio

The Render button (top right) opens Remotion's render dialog with the props as they are in the
preview. Pick the codec and the file name; the render runs in the Studio's queue and the video goes
to `apps/mushaf-studio/out/`.

### From the command line

The CLI renders the props saved in `src/Root.tsx`, so save in the Studio first:

```bash
cd apps/mushaf-studio
bun run render            # MushafRecitation -> out/recitation.mp4
bun run render:passage    # MushafPassage -> out/passage.mp4
bun run render:ayah       # MushafAyahText -> out/ayah-text.mp4
bunx remotion render MushafRecitation out/fatiha-light.mp4 --props='{"theme":"light"}'
bunx remotion render MushafRecitation out/offline.mp4 --props='{"fonts":"package","data":"mirror"}'
bunx remotion render MushafRecitation out/reel.mp4 --props=./reel.json
```

`--props` replaces whole props, not single fields: `{"layout": {"aspect": "9:16"}}` drops the rest
of the `layout` group and fails the schema. Pass a group whole (copy it from `src/Root.tsx`), most
easily from a JSON file as in the last line. `fonts: 'package'` with `data: 'mirror'` renders
without QUL's CDN; the audio still comes from wherever `audioFile` points.

## Where the files go

```
apps/mushaf-studio/
  src/Root.tsx                      the two compositions and their props: what the Studio saves, what the CLI renders
  public/data/qpc-v4/               QUL's two exports (the words, the line layout), committed: data 'mirror'
  public/mushaf-studio/fatiha/      the sample the default props point at
  public/mushaf-studio/default/     what the panel writes (below)
  out/                              rendered videos (not committed)
```

In `public/mushaf-studio/default/` the panel writes `<reciter>-<surah>-<from>-<to>.mp3` and
`.timings.json` for a catalogue pick, your recording and its `<name>.timings.json` after Align, and
`translation-<id>.json` and the gloss files from the Text tab. A new pick writes new files next to
the old ones; the props say which are in use.

The timings file is the package's recitation timings (see
[Following a recording](../../packages/remotion-mushaf-line-renderer/README.md#following-a-recording))
with one more key, `alignment`, that keeps the aligner's segments, their confidence, each word's
text and your edits. Recordings under `public/mushaf-studio/` are ignored by git (they are the
reciter's); the JSON files can be committed with the Root.

## Privacy

- Your recording leaves the machine only when you press **Align**: it is uploaded to
  `aligner.qud.dev`, which keeps it for a few hours so that a split or a re-align does not upload it
  again. A catalogue recitation uploads nothing; its clip is downloaded from the catalogue.
- A Hugging Face token, if you give one, stays in the browser tab (`sessionStorage`) and is sent
  only to the aligner.
- Besides that, the Studio downloads: the page fonts from QUL's CDN (unless `fonts` is `package`),
  the mushaf data from Tarteel's CDN when `data` is `cdn`, the catalogue from `aligner.qud.dev` and
  translations from `api.quran.com`. These are plain downloads; none of them carries your audio.

## Licences

- **Code**: MIT, like the rest of the repository.
- **Fonts**: the page fonts, the surah-name font and `quran-common` are King Fahd Complex fonts as
  published by [QUL](https://qul.tarteel.ai). They are not open source. The fonts packages
  redistribute the page fonts unmodified; see their `LICENSE.md` and `NOTICE.md`. A bundle you
  deploy with a fonts package in it serves the fonts too.
- **Mushaf data**: the words of the KFGQPC V4 script and the 15-line layout are open data from QUL.
- **Alignments**: the QUD Universal Aligner's output (the segments and word times, so the timings
  files the panel writes from it) is under CC-BY-4.0, which asks for attribution. The catalogue's
  audio belongs to its reciters and their publishers.
- **Translations**: each quran.com translation is under its own terms, set by its translator or
  publisher (named in the resource list the panel shows); check them before publishing a video.

## Troubleshooting

- **QUL's CDN is down** (fonts fail to load, `FONT_*` errors): with `fonts: 'fallback'` (the
  default) the page fonts come from the fonts packages after the CDN fails; with `fonts: 'package'`
  the CDN is never asked. Both need `bun run fonts-packages:fill` to have run once. The mushaf data
  is read from the committed mirror as long as `data` is `mirror`. The surah-name and juz fonts are
  not in the fonts packages.
- **`Can't resolve './fonts/p1.woff2'`** when the Studio bundles: the fonts packages are empty. Run
  `bun run fonts-packages:fill` from the repository root.
- **The Studio is on another port**: it starts at 3000 and takes the next free port up to 3100 when
  3000 is busy (the terminal says which). To choose one:
  `bun run --cwd apps/mushaf-studio studio --port=3200`.
- **The panel cannot reach the aligner or the catalogue** (a CORS error in the browser console):
  open the Studio at `http://localhost:<port>`. The aligner accepts browser requests from
  `localhost` origins, not from a LAN address or a tunnel.
- **No sound, or a render that times out on the audio**: the committed sample (and a catalogue
  pick whose download failed) streams its clip from a Hugging Face Space, which can be asleep or
  down. Wait and reload, or pick the recitation again in the Source tab, which downloads the clip
  into `public/`.
- **The aligner says the quota is spent** (`QUD_RATE_LIMITED`): the free GPU quota and the CPU rate
  limit are both used up; retry after the time the panel shows, or give a Hugging Face token.

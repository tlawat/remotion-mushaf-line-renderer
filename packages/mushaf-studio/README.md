# @tlawat/mushaf-studio

Compositions, Zod schemas and a Studio panel for making word-synced recitation videos of the KFGQPC
V4 mushaf inside [Remotion Studio](https://www.remotion.dev/docs/studio), built on
[`@tlawat/remotion-mushaf-line`](../remotion-mushaf-line-renderer).

- **Two compositions.** `<MushafRecitation>`: the printed lines of a recited passage follow the
  audio, word by word, with an ayah translation and a word gloss. `<MushafPassage>`: a passage
  without audio, one line after the other.
- **Every option in the Props sidebar.** Theme, fonts, layout, animation, highlighting and text are
  Zod schemas, so the Studio shows them as typed controls, saves them to your Root file and passes
  them to the Render dialog and the CLI.
- **A Mushaf panel** docked over the preview, in the Studio only: pick a recitation from the QUD
  aligner's catalogue or align your own recording, review the doubtful words, split long lines,
  fetch translations.
- **Usable without the compositions.** The QUD client, the translation loaders, the line splitting
  and the QUL font catalogue are plain functions.

For a ready-made project that needs no code, see [`apps/mushaf-studio`](../../apps/mushaf-studio). The
design and its roadmap are in [docs/mushaf-studio/plan.md](../../docs/mushaf-studio/plan.md).

## Contents

- [Install](#install)
- [Register the compositions](#register-the-compositions)
- [The Mushaf panel](#the-mushaf-panel)
- [Props](#props)
- [Data contract](#data-contract)
- [Modules without the compositions](#modules-without-the-compositions)
- [Errors](#errors)
- [Roadmap](#roadmap)
- [Licences](#licences)

## Install

In an existing Remotion project:

```bash
npm i @tlawat/mushaf-studio @tlawat/remotion-mushaf-line @remotion/studio @remotion/zod-types zod
```

Remotion's packages are released together and must all be the version of `remotion` in your
project, 4.0.521 or newer: `@remotion/studio`, `@remotion/zod-types`, and `@remotion/transitions`
(which the main package needs too). If npm picks a newer one, pin it to yours:

```bash
npm i @remotion/studio@"$(npm pkg get dependencies.remotion | tr -d '"')" \
      @remotion/zod-types@"$(npm pkg get dependencies.remotion | tr -d '"')" \
      @remotion/transitions@"$(npm pkg get dependencies.remotion | tr -d '"')"
```

`zod` must be 4 or newer; React 18 or newer.

Optional: the page fonts as npm packages, for when QUL's CDN is unreachable (43 MB and 51 MB, and
they go into every bundle you build):

```bash
npm i @tlawat/mushaf-fonts-qpc-v4-tajweed   # the colour themes
npm i @tlawat/mushaf-fonts-qpc-v4           # the 'plain' theme
```

The studio package never imports them itself; your Root registers them (below).

## Register the compositions

Declare the compositions in your own Root file, with their `defaultProps` written out as an inline
object literal:

```tsx
// src/Root.tsx
import plainFonts from '@tlawat/mushaf-fonts-qpc-v4';
import tajweedFonts from '@tlawat/mushaf-fonts-qpc-v4-tajweed';
import {
  calculateMushafRecitationMetadata,
  MushafRecitation,
  mushafRecitationSchema,
  registerMushafFonts,
} from '@tlawat/mushaf-studio';
import {Composition} from 'remotion';

// The fonts the compositions fall back to (fonts: 'fallback') or use alone (fonts: 'package').
registerMushafFonts({plain: plainFonts, tajweed: tajweedFonts});

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MushafRecitation"
    component={MushafRecitation}
    schema={mushafRecitationSchema}
    calculateMetadata={calculateMushafRecitationMetadata}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={300}
    defaultProps={{
      audioFile:
        'https://hetchyy-quranic-universal-aligner.hf.space/preload-audio/abdul_hamid_ghraio_2025_yt/1.mp3?start_ms=2909&end_ms=30695',
      timingsFile: 'mushaf-studio/fatiha/timings.json',
      fromAyah: 0,
      toAyah: 0,
      slice: true,
      splits: [],
      theme: 'plain',
      customTheme: {
        base: 'normal',
        ink: '#1b1b1b',
        silent: '#8a8a8a',
        rules: '#1b6f3f',
        frame: '#1b1b1b',
        accent: '#c8a45c',
        detail: '#c8a45c',
        background: 'transparent',
        override: {ink: false, silent: false, rules: false, frame: false, accent: true, detail: true, background: false},
      },
      fonts: 'fallback',
      data: 'mirror',
      layout: {
        aspect: '16:9',
        visibleLines: 3,
        neighbourOpacity: 0.45,
        marginX: 120,
        background: '#fbf7ee',
        color: '#1b1b1b',
        backgroundImage: '',
        verticalAlign: 0.5,
      },
      animation: {enter: 'slide-fade', exit: 'slide-fade', leadInSeconds: 0.4, scroll: 'ease'},
      highlight: {
        mode: 'word',
        style: 'color',
        color: '#c8a45c',
        dimOthers: 1,
        dimUpcomingOnly: false,
        occurrence: 'first',
      },
      text: {
        translationFile: '',
        translationPosition: 'below',
        translationFont: 'Georgia, "Noto Serif", serif',
        translationSize: 40,
        translationColor: '#4a4a4a',
        translationDirection: 'ltr',
        glossFile: '',
        transliterationFile: '',
        glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
        glossSize: 34,
        glossColor: '#6a6a6a',
      },
      review: {showDoubtful: true, confidenceThreshold: 0.8, doubtColor: '#d94848'},
      resolved: null,
    }}
  />
);
```

Why it has to look like this:

- **The Studio writes edits back to this file.** The Props sidebar's save button and the Mushaf
  panel both go through Remotion's `saveDefaultProps()`, which rewrites the `defaultProps` of the
  `<Composition>` in the file that declares it. Remotion can only do that when the value is a
  static literal (strings, numbers, booleans, `null`, arrays, objects, `staticFile('...')`) in a
  TypeScript file: `defaultProps={defaultMushafRecitationProps}` or a spread renders fine but
  cannot be saved, and the panel then has nowhere to put the recitation it picked. That is why the
  package exports the compositions, schemas and defaults, but no ready-made Root.
- The Studio formats what it saves with Prettier, using the Prettier config it finds from the
  directory it runs in, and writes one long JSON line when there is none. If a formatter or linter
  checks your Root, give the project a Prettier config in your style (the app's
  [`.prettierrc.json`](../../apps/mushaf-studio/.prettierrc.json) matches this repository's Biome
  settings).
- The literal above is `defaultMushafRecitationProps` written out. `MushafPassage` is declared the
  same way with `mushafPassageSchema`, `calculateMushafPassageMetadata` and
  `defaultMushafPassageProps`; [`apps/mushaf-studio/src/Root.tsx`](../../apps/mushaf-studio/src/Root.tsx)
  has both.
- `width`, `height` and `durationInFrames` are placeholders: `calculateMetadata()` sets the size from
  `layout.aspect` and the duration from the timings.
- `registerMushafFonts()` runs once, at module level. Leave it out (and use `fonts: 'cdn'`) if you
  do not install the fonts packages.
- The defaults point at two things the app keeps in its `public/` folder: the sample timings
  (`public/mushaf-studio/fatiha/timings.json`) and the mirror of QUL's data
  (`public/data/qpc-v4/words.json.zip` and `layout.db.zip`, for `data: 'mirror'`). Copy both from
  [`apps/mushaf-studio/public`](../../apps/mushaf-studio/public) into your project's `public/`, or
  pick a recitation in the panel (it writes its own timings) and set `data` to `'cdn'`.

## The Mushaf panel

`<MushafRecitation>` renders `<MushafStudioPanel>` itself. Outside the Studio (a render, a
`<Player>`, a server) the panel renders nothing and does nothing; it never calls `delayRender()` and
never re-renders with the frame. In the Studio it docks over the preview with five tabs:

| Tab        | What it does                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **Source** | The QUD catalogue's reviewed recitations (reciter, riwayah, style, chapters), or a recording of your own.          |
| **Align**  | Uploads the recording to the [QUD Universal Aligner](https://aligner.qud.dev) with streaming progress, then fetches the word times. Says first that the audio leaves the machine. |
| **Review** | The segments and their words with confidence; click to seek; nudge a word, split a segment, re-align.            |
| **Lines**  | The resolved lines and their time slots; split a line at a word into two timed segments.                        |
| **Text**   | Ayah translations and word-by-word glosses from quran.com, or a QUL file in `public/`.                           |

Every change goes through the same path: write the file(s) into `public/mushaf-studio/<project>/`
(`default` for `<MushafRecitation>`; `writeStaticFile()`), save the composition's content props (`saveDefaultProps()`), then
`reevaluateComposition()` so `calculateMetadata()` runs again. Large data never sits in the props:
the props hold paths, and the files are fetched through `staticFile()`, so the Render dialog, the
CLI and Lambda see the same inputs.

To put the panel in a composition of your own, render it there with the composition's id and props:

```tsx
<MushafStudioPanel compositionId="MyRecitation" props={props} project="surah-yasin" />
```

## Props

The schemas' descriptions are what the Props sidebar shows; the defaults are
`defaultMushafRecitationProps` and `defaultMushafPassageProps`. The content props (the first table)
are what the panel sets; the groups below are style, set in the sidebar.

### `MushafRecitation`

| Prop          | Type                        | Default                       | Description                                                  |
| ------------- | --------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `audioFile`   | string                      | the catalogue clip of 1:1-7   | Audio: a path in `public/` or an https URL.                  |
| `timingsFile` | string                      | `'mushaf-studio/fatiha/timings.json'` | Timings JSON in `public/` (see [Data contract](#data-contract)). |
| `fromAyah`    | 0–286                       | `0`                           | First ayah to show (0: as the timings say).                  |
| `toAyah`      | 0–286                       | `0`                           | Last ayah to show (0: as the timings say).                   |
| `slice`       | boolean                     | `true`                        | Hide the neighbours' words on the first and last lines.      |
| `splits`      | `{page, line, atWordId}[]`  | `[]`                          | Printed lines split into two timed segments; `atWordId` is the `MushafWord.wordId` that starts the second. |
| `theme`       | `'plain'`, `'light'`, `'dark'`, `'sepia'`, `'black'`, `'normal'`, `'p1'`–`'p5'`, `'custom'` | `'plain'` | Colour theme of the mushaf line; `'custom'` uses `customTheme`. |
| `customTheme` | object                      | see below                     | A preset and a colour per part.                              |
| `fonts`       | `'fallback'`, `'cdn'`, `'package'` | `'fallback'`           | Where the page fonts come from: QUL's CDN with the fonts packages as fallback, the CDN only, or the packages only (offline). |
| `data`        | `'mirror'`, `'cdn'`         | `'mirror'`                    | The mushaf data: the mirror in `public/data/qpc-v4/` through `staticFile()`, or QUL's exports on Tarteel's CDN. |
| `layout`, `animation`, `highlight`, `text`, `review` | objects | see below | The style groups.                                       |
| `resolved`    | `ResolvedRecitation \| null` | `null`                       | Filled by `calculateMetadata()`: the timings, the lines (splits applied), the schedule, the translation, the gloss, the doubtful words. Leave it `null`. |

### `MushafPassage`

| Prop          | Type      | Default    | Description                                    |
| ------------- | --------- | ---------- | ---------------------------------------------- |
| `surah`       | 1–114     | `9`        | Surah.                                         |
| `fromAyah`    | 1–286     | `1`        | First ayah.                                    |
| `toAyah`      | 0–286     | `5`        | Last ayah (0: to the end of the surah).        |
| `slice`       | boolean   | `true`     | Hide the neighbours' words on the first and last lines. |
| `holdSeconds` | 0.5–30    | `4`        | Seconds each line stays.                       |
| `theme`, `customTheme`, `fonts`, `data`, `layout`, `animation`, `text` | | `theme: 'normal'`, the rest as for `MushafRecitation` | As above. |
| `resolved`    |           | `null`     | Filled by `calculateMetadata()`.               |

### `customTheme`

| Field        | Type    | Default        | Description                                          |
| ------------ | ------- | -------------- | ---------------------------------------------------- |
| `base`       | a preset (`'light'` … `'p5'`) | `'normal'` | Preset to start from.                     |
| `ink`        | colour  | `'#1b1b1b'`    | The letters.                                         |
| `silent`     | colour  | `'#8a8a8a'`    | Letters written but not pronounced.                  |
| `rules`      | colour  | `'#1b6f3f'`    | The seven tajweed rule colours (one colour for all). |
| `frame`      | colour  | `'#1b1b1b'`    | The ayah-end rosette and its number.                 |
| `accent`     | colour  | `'#c8a45c'`    | The rosette's petals.                                |
| `detail`     | colour  | `'#c8a45c'`    | The jewel at the top of the rosette.                 |
| `background` | colour  | `'transparent'` | The disc behind the ayah number.                    |
| `override`   | `{ink, silent, rules, frame, accent, detail, background}` booleans | `accent` and `detail` on | Which parts the colours above override; the others keep the preset's colours. |

### `layout`

| Field              | Type                                 | Default     | Description                                                         |
| ------------------ | ------------------------------------ | ----------- | ------------------------------------------------------------------- |
| `aspect`           | `'16:9'`, `'9:16'`, `'1:1'`, `'4:5'` | `'16:9'`    | Frame shape: 1920×1080, 1080×1920 (reels), 1080×1080, 1080×1350.    |
| `visibleLines`     | 0–7                                  | `3`         | Lines on screen at once (0: one line, replaced in place).           |
| `neighbourOpacity` | 0–1                                  | `0.45`      | Opacity of the lines around the current one.                        |
| `marginX`          | 0–400 px                             | `120`       | Side margins, at the composition's width.                           |
| `background`       | colour                               | `'#fbf7ee'` | Page colour.                                                        |
| `color`            | colour                               | `'#1b1b1b'` | Ink colour (the plain theme, and every part a theme paints in `currentColor`). |
| `backgroundImage`  | string                               | `''`        | Background image in `public/` (empty: none).                        |
| `verticalAlign`    | 0–1                                  | `0.5`       | Vertical position of the lines (0 top, 1 bottom).                   |

### `animation`

| Field           | Type                                           | Default        | Description                                     |
| --------------- | ---------------------------------------------- | -------------- | ----------------------------------------------- |
| `enter`         | `'slide-fade'`, `'fade'`, `'reveal-rtl'`, `'none'` | `'slide-fade'` | How a line comes in.                         |
| `exit`          | the same                                       | `'slide-fade'` | How a line goes out.                            |
| `leadInSeconds` | 0–3                                            | `0.4`          | Seconds a line is on screen before its first word. |
| `scroll`        | `'ease'`, `'spring'`                           | `'ease'`       | Curve of the window's scroll between lines.     |

### `highlight` (`MushafRecitation` only)

| Field             | Type                                     | Default     | Description                                                     |
| ----------------- | ---------------------------------------- | ----------- | --------------------------------------------------------------- |
| `mode`            | `'word'`, `'ayah'`, `'none'`             | `'word'`    | What follows the recitation: the word, the whole ayah, or nothing. |
| `style`           | `'color'`, `'glow'`, `'marker'`, `'none'` | `'color'`  | How the current word is marked: ink colour, a glow, a marker behind it. |
| `color`           | colour                                   | `'#c8a45c'` | Colour of the mark.                                             |
| `dimOthers`       | 0–1                                      | `1`         | Opacity of the other words (1: none).                           |
| `dimUpcomingOnly` | boolean                                  | `false`     | Dim only the words still to come.                               |
| `occurrence`      | `'first'`, `'last'`                      | `'first'`   | For a repeated word: follow its first or its last recitation.   |

### `text`

| Field                  | Type                          | Default       | Description                                                  |
| ---------------------- | ----------------------------- | ------------- | ------------------------------------------------------------ |
| `translationFile`      | string                        | `''`          | Ayah translation file in `public/` (empty: none).            |
| `translationPosition`  | `'below'`, `'above'`, `'none'` | `'below'`    | Where the ayah translation goes.                             |
| `translationFont`      | CSS font family               | `'Georgia, "Noto Serif", serif'` | Font of the translation (`TRANSLATION_FONT_PRESETS` has more). |
| `translationSize`      | 12–120 px                     | `40`          | Translation size.                                            |
| `translationColor`     | colour                        | `'#4a4a4a'`   | Translation colour.                                          |
| `translationDirection` | `'ltr'`, `'rtl'`              | `'ltr'`       | Writing direction of the translation.                        |
| `glossFile`            | string                        | `''`          | Word-by-word translation file in `public/` (empty: none).    |
| `transliterationFile`  | string                        | `''`          | Word-by-word transliteration file in `public/` (empty: none). |
| `glossFont`            | CSS font family               | `'"Noto Sans", "Helvetica Neue", Arial, sans-serif'` | Font of the gloss strip.     |
| `glossSize`            | 12–120 px                     | `34`          | Gloss size.                                                  |
| `glossColor`           | colour                        | `'#6a6a6a'`   | Gloss colour.                                                |

### `review` (`MushafRecitation` only)

| Field                 | Type    | Default     | Description                                                        |
| --------------------- | ------- | ----------- | ------------------------------------------------------------------ |
| `showDoubtful`        | boolean | `true`      | Studio only: mark words whose alignment is doubtful. Never in a render. |
| `confidenceThreshold` | 0–1     | `0.8`       | Segments under this confidence are doubtful.                       |
| `doubtColor`          | colour  | `'#d94848'` | Colour of the doubt mark.                                          |

## Data contract

### The timings file

`timingsFile` names a JSON file in the main package's recitation timings format, version 1 (see
[Following a recording](../remotion-mushaf-line-renderer/README.md#following-a-recording)): the
recited ayahs and their words with times in seconds, word ids `"surah:ayah:position"`, every
occurrence of a repeated word in audio order, and the ayah-end marker timed as the word after the
ayah's last one. Any producer works; the package validates the file with `parseRecitationTimings()`.

The studio adds one top-level key, `alignment`, which the main package passes through untouched
(the type is `StudioTimings`):

```json
{
  "version": 1,
  "surah": 1,
  "audio": "https://.../1.mp3?start_ms=2909&end_ms=30695",
  "durationSeconds": 27.586,
  "source": "aligner.qud.dev",
  "ayat": [
    {"ayah": 2, "start": 0.331, "end": 3.533, "complete": true, "words": [
      {"id": "1:2:1", "start": 0.331, "end": 0.901}, ..., {"id": "1:2:5", "start": 3.391, "end": 3.533}
    ]}
  ],
  "alignment": {
    "version": 1,
    "source": "qud-catalogue",
    "recitation": {"slug": "abdul_hamid_ghraio_2025_yt", "chapter": 1, "verseFrom": 1, "verseTo": 7,
                   "clipStart": 2.909, "audioUrl": "https://.../1.mp3?start_ms=2909&end_ms=30695"},
    "segments": [
      {"segment": 1, "timeFrom": 0.201, "timeTo": 3.423, "refFrom": "1:2:1", "refTo": "1:2:4",
       "confidence": 1, "hasMissingWords": false, "hasRepeatedWords": false, "error": null,
       "matchedText": "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ", "kind": "quran"}
    ],
    "words": [{"id": "1:2:1", "text": "ٱلْحَمْدُ", "segment": 1, "start": 0.331, "end": 0.901}],
    "edits": []
  }
}
```

| `alignment` field | Meaning                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `version`         | `1`.                                                                                            |
| `source`          | `'qud'` (aligned), `'qud-catalogue'` (picked from the catalogue), `'file'`, `'manual'`.         |
| `audioId`, `model`, `device`, `riwayah` | The aligner session (so a split or a re-align reuses the upload), when aligned.  |
| `recitation`      | Where a catalogue pick came from: `slug`, `chapter`, `verseFrom`, `verseTo`, `clipStart` (seconds into the chapter audio), `audioUrl`. |
| `segments`        | The aligner's segments, recording-relative: `timeFrom`, `timeTo`, `refFrom`/`refTo` (`null` for an isti'adha, a basmala or no match), `confidence` (0–1, per segment: the aligner gives none per word), `hasMissingWords`, `hasRepeatedWords`, `error`, `matchedText`, `kind`. |
| `words`           | Every recited word with its Uthmani `text` and its `segment`, one entry per occurrence.         |
| `edits`           | What was changed by hand in the panel (`nudge`, `split-segment`, `realign`, `trim`), with a time and a note. |

A word is doubtful (`doubtfulWords()`, the Review tab, the marks in the preview) when its segment's
confidence is under `review.confidenceThreshold`, when its segment reports missing words or an
error, when its ayah is `complete: false`, or when it was recited more than once.

### Translation files

`text.translationFile`, `text.glossFile` and `text.transliterationFile` name JSON files in
`public/`. `parseTranslationFile()` recognises the file by its shape, not its name:

| Shape                 | Example                                       | Source                               |
| --------------------- | --------------------------------------------- | ------------------------------------ |
| Key/value             | `{"1:1": "In the Name of Allah ..."}`          | QUL's ayah translations              |
| Nested arrays         | `[["1:1 text", "1:2 text", ...], ["2:1 text", ...]]` (outer index the surah) | QUL                |
| Footnotes as tags     | `{"88:17": {"t": "... <sup foot_note=\"1\">1</sup>", "f": {"1": "..."}}}` | QUL       |
| Inline footnotes      | `{"1:1": "... [[a footnote]] ..."}`            | QUL                                  |
| Text chunks           | `{"114:6": ["...", {"type": "...", "text": "..."}]}` | QUL                            |
| Word by word          | `{"1:1:1": "In (the) name"}`                   | QUL's word-by-word translations and transliterations |
| The studio envelope   | `{"version": 1, "kind": "ayah", "meta": {...}, "text": {"1:1": "..."}}` | What the panel writes |

Footnote markup is stripped; the components render plain text only. Ayah keys (`"surah:ayah"`) make
an `AyahTranslation`, word keys (`"surah:ayah:word"`) a `WordGloss`. The envelope carries `meta`
(`id`, `name`, `language`, `source`, optional `license`) and the entries under `text` (`kind:
'ayah'`) or `words` (`kind: 'word'`); `serialiseTranslation()` writes it with a stable key order, so
the same translation always gives the same bytes. QUL's files need a QUL login to download; the
panel fetches from quran.com instead and saves the envelope.

## Modules without the compositions

Everything below is exported from the package root. The network functions are plain functions over
`fetch`, safe in the browser (the aligner takes a `Blob` or a `File`, never a path), and take an
options object whose `api` and `fetch` replace the endpoint and the transport, for tests and
proxies.

```ts
import {getChapterSegments, timingsFromCatalogue} from '@tlawat/mushaf-studio';

// A reviewed recitation of Al-Fatihah, as timings for the main package (the audio is the clip URL).
const chapter = await getChapterSegments({slug: 'abdul_hamid_ghraio_2025_yt', chapter: 1, verseFrom: 1, verseTo: 7});
const timings = timingsFromCatalogue(chapter);
```

### QUD client

| Export                                          | Does                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `listRecitations()`                             | `GET /recitations`: the reviewed, pre-aligned recitations.                                 |
| `listAudioRecitations()`                        | `GET /audio-recitations`: recitations with chapter audio but no reviewed segments.         |
| `getChapterSegments({slug, chapter, verseFrom?, verseTo?})` | Reviewed segments with word timestamps and the clip's `audio_url`.             |
| `getChapterAudioUrl({slug, chapter})`           | The whole chapter's audio URL.                                                             |
| `alignAudio(blob, fileName, options?)`          | Uploads a recording and aligns it (`onProgress` for the streaming stages). The audio leaves the machine. |
| `alignUrl(url, options?)`                       | The same for a URL the aligner downloads itself.                                           |
| `sessionTimestamps(audioId)`                    | Per-word times for a session's segments.                                                   |
| `splitSession(audioId, request)`                | Subdivides a session's segments (by verses, words, duration, or only at stop signs).      |
| `realignSession(audioId, {timestamps})`         | Re-runs recognition and matching over boundaries you give.                                 |
| `timingsFromQud({align, timestamps}, options?)` | An alignment as `StudioTimings` (validated through `parseRecitationTimings()`).            |
| `timingsFromCatalogue(chapter, options?)`       | A catalogue chapter as `StudioTimings`.                                                    |
| `DEFAULT_QUD_API`, `MARKER_HOLD_SECONDS`, `DEFAULT_CONFIDENCE_THRESHOLD` | `https://aligner.qud.dev/api/v1`; 0.8 s the ayah-end marker stays current; 0.8. |

A Hugging Face `token` (option) spends the caller's own GPU quota; the client never stores it.

### Translations

| Export                                       | Does                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `parseTranslationFile(value, meta?)`         | Any of the shapes above as an `AyahTranslation` or a `WordGloss`.                        |
| `serialiseTranslation(translation)`          | The studio envelope as stable JSON text, for `writeStaticFile()`.                        |
| `loadTranslation(url)`                       | Fetches and parses a file (a `staticFile()` URL or any URL), for `calculateMetadata()`.  |
| `stripFootnotes(text)`                       | Removes `<sup foot_note>` and `[[...]]` footnotes and any other tag.                     |
| `ayahKeyOf(wordId)`                          | `"9:1:3"` → `"9:1"`, to show the translation of the ayah being recited.                  |
| `listQuranComTranslations({language?})`      | quran.com's translation resources.                                                       |
| `fetchQuranComTranslation({resourceId, chapter, fromAyah?, toAyah?})` | An ayah translation, footnotes stripped, `meta.id` `quran.com:<id>`. |
| `fetchQuranComWordGloss({chapter, field, language?})` | The per-word `translation` or `transliteration`, keyed by word id.             |
| `DEFAULT_QURAN_COM_API`                      | `https://api.quran.com/api/v4`.                                                          |
| `<TranslationBlock>`, `<GlossStrip>`         | One ayah's translation as a block of text; the current word's gloss in a strip that keeps its height. |

### Lines

| Export                              | Does                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `splitLineAt(line, atWordId)`       | One line as two, each with a word-range slice (`{fromWordId, toWordId}`).                  |
| `applySplits(lines, splits)`        | A passage with its `splits` applied, order preserved.                                     |
| `doubtfulWords(timings, {threshold?})` | The doubtful words by id, with their reasons.                                          |
| `wordIdAt(line, surah, ayah, position)` | The `wordId` a split must name to cut a line before a word.                           |

### Fonts

| Export                                       | Does                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `registerMushafFonts({plain?, tajweed?})`, `getRegisteredMushafFonts()` | The fonts packages the compositions may use, registered by your Root. |
| `QUL_FONTS`                                  | QUL's Quran fonts as data: page fonts (V4 plain and tajweed, V1, V2), Unicode fonts (Uthmani Hafs, Nastaleeq, Indopak, Digital Khatt, Me Quran) and the shared fonts, with resource ids, CDN URLs where public, and whether the package renders them today. |
| `pageFontUrl(font, page, format?)`           | The CDN URL of one page of a page-fonts resource.                                        |
| `TRANSLATION_FONT_PRESETS`                   | CSS font stacks that render translations well without a web font.                        |

### Schema

The Zod fragments the compositions are built from, to build a composition of your own with the same
sidebar controls: `themeNameSchema`, `customThemeSchema`, `fontsSchema`, `dataSchema`,
`layoutSchema`, `animationSchema`, `highlightSchema`, `textSchema`, `reviewSchema`,
`lineSplitSchema`; their defaults (`defaultCustomTheme`, `defaultLayout`, `defaultAnimation`,
`defaultHighlight`, `defaultText`, `defaultReview`); the value lists (`THEME_NAMES`, `ASPECTS`,
`ENTRANCES`, `HIGHLIGHT_STYLES`, `MIRROR_FILES`).

And the converters from those values to the main package's props, so your own composition paints
the same way:

| Export                                         | Gives                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `themeSelectionFrom(theme, customTheme)`       | The `theme` of a line.                                                             |
| `fontPropsFrom(...)`                           | `fontSrc` / `fontFallback` for `fonts` and the line's font set, from the registered fonts packages. |
| `dataSourceFrom(data, staticFile)`             | The `data` option of `getMushafLines()`: the mirror's two files, or `undefined` for the CDN. |
| `animationFrom(...)`, `scrollTimingFrom(scroll)` | `enter` / `exit` of a line or a window; the window's `scrollTiming`.            |
| `activeWordStyleFrom(highlight)`, `wordStyleFrom(...)`, `withAlpha(color, alpha)` | The highlight as `activeWordStyle` and `wordStyle`; a colour at an opacity. |
| `sizeForAspect(aspect)`                        | `{width, height}` for `layout.aspect`.                                              |

`resolveRecitation(props)` is `calculateMetadata()` without the size and duration, to fill
`resolved` for a `<Player>` host (the `<Player>` never runs `calculateMetadata()`).

## Errors

Every failure of the studio package is a `MushafStudioError` (`isMushafStudioError()`) with a
`code`, a message that names the value and the fix, and `details`. What happens to a line itself
stays a `MushafError` of the main package.

| Code                       | When                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `QUD_HTTP`                 | The aligner or the catalogue answered with an error (`details.status`, `details.code`). |
| `QUD_RATE_LIMITED`         | The GPU quota and the CPU rate limit are both spent (`details.retryAfterSeconds`).     |
| `QUD_BAD_RESPONSE`         | The aligner's answer is not in the expected shape.                                     |
| `QUD_NO_MATCH`             | The aligner matched nothing, words of two surahs, or nothing in the range kept.        |
| `BAD_TRANSLATION_FILE`     | A translation file is in none of the shapes above.                                     |
| `TRANSLATION_FETCH_FAILED` | A translation source could not be fetched.                                             |
| `BAD_LINE_SPLIT`           | A split names a line not in the passage or a word not on that line.                    |
| `BAD_STUDIO_PROP`          | A prop is out of range or inconsistent beyond what the schema catches.                 |
| `NOT_IN_STUDIO`            | A Studio API was called outside the Studio.                                            |

## Roadmap

A text-only Unicode layout for reels, the QPC V1 and V2 page layouts, captions interop with the
Studio's caption editor, an optional server side for the aligner and project files: see
[docs/mushaf-studio/plan.md](../../docs/mushaf-studio/plan.md#7-roadmap-after-the-proof-of-concept).

## Licences

Package code: [MIT](./LICENSE). The package ships no data, no fonts and no audio. The fonts are the
King Fahd Complex fonts as published by [QUL](https://qul.tarteel.ai), not open source; the mushaf
data is QUL's open data. The QUD Universal Aligner's output is CC-BY-4.0, and the catalogue's audio
belongs to its reciters and publishers. quran.com's translations are each under their own
translator's or publisher's terms. Please respect them when you publish a video.

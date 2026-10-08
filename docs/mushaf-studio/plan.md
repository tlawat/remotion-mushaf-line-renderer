# Mushaf Studio: extending Remotion Studio with the package's features

Status: proof of concept, built on branch `claude/jolly-dijkstra-ov8av6`; the definition of done
below is met, and the roadmap (section 7) says what is done since and what is open. This page is the
plan that the work follows and the record of the decisions behind it. The companion page,
[agent-guidelines.md](agent-guidelines.md), is the quality framework every contributor (human or
agent) works under.

## 1. Goal

Turn the package from a developer library into something a person can use inside Remotion Studio
without writing code, while keeping every piece usable from code by developers:

- pick a recitation (a pre-aligned one from a catalogue, or an own recording) and get it aligned to
  the printed mushaf, word by word;
- see where the alignment is doubtful (low-confidence segments, missing words, partial ayahs) and fix
  it: split segments, re-align, nudge a word, split a printed line into two timed segments;
- choose how the video looks: the fonts and colour themes QUL publishes for the KFGQPC V4 mushaf,
  the line window, the entrances and exits, the word-by-word highlighting;
- add QUL-style metadata: an ayah translation under the lines, a word-by-word gloss;
- render from the Studio's own Render button, or from the CLI, deterministically.

Distribution: one npm package that developers drop into their own Remotion project
(`@tlawat/mushaf-studio`), one ready-made Remotion project (`apps/mushaf-studio`) that end users
start with `bun run studio`, and one static page (`apps/mushaf-web`) that does the catalogue path
and the render in the browser.

## 2. What Remotion Studio lets us extend (facts, verified against 4.0.521)

Remotion Studio has no API for custom sidebar panels. It has four extension surfaces, and the
design uses all four:

| Surface | What it gives | How Mushaf Studio uses it |
| --- | --- | --- |
| Zod schema on `<Composition>` | Typed controls in the Props sidebar (enums, numbers with min/max/step, `zColor()`, nested objects, arrays), JSON editing, save-to-code, Render dialog input props. | Every style option of the compositions (theme, fonts, layout, animation, highlighting, translation placement). |
| `Interactive.withSchema()` / `Interactive.Div` (since 4.0.475, in 4.0.521) | A custom component becomes selectable on the canvas and in the timeline, with its declared props editable and keyframable. | Not used. Tried on the line window and the translation block: a canvas edit through an `Interactive` element is written by the Studio into the file that holds the JSX, which here is the library's own source (`node_modules` for an npm install), never into the user's props; and the wrapper's `Sequence layout="none"` broke the blocks' absolute boxes (the lines ran past the right edge of the frame). The blocks are plain `<div data-mushaf-block>`s positioned by schema props instead: `layout.verticalAlign` and `layout.offsetY` for the lines, `text.translationPosition` and `text.translationOffsetY` for the translation, all edited in the Props sidebar and saved to the user's Root. |
| `@remotion/studio` client API | `writeStaticFile`, `getStaticFiles`, `watchPublicFolder`, `saveDefaultProps` (writes the Root file), `reevaluateComposition`, `seek`, `play`, `pause`, `goToComposition`, `focusDefaultPropsPath`. | The panel writes audio, timings and translations into `public/`, updates the composition's content props, re-runs `calculateMetadata()` and drives the playhead. |
| Studio-only React | `useRemotionEnvironment()` gives `isStudio` in the Studio only, with `isRendering` for the Render button and `isClientSideRendering` for the Studio's in-browser render (the latter only through the context the hook reads, not through `getRemotionEnvironment()`'s globals); a component can render a portal into `document.body` (the Studio renders compositions in the page, not in an iframe). | The Mushaf panel: a dock rendered by the composition tree, Studio preview only (`isStudio && !isRendering && !isClientSideRendering`), never in a render or a `<Player>`. |

`saveDefaultProps()` always writes to the file that declares the `<Composition>`. That is the
documented Remotion model ("visual edits are written back to your codebase"), so the compositions
must be declared, with inline `defaultProps`, in the user's own Root file: the app's Root does that,
and the README gives developers the snippet. The package therefore exports components, schemas and
defaults, not a pre-registered root.

## 3. Content sources (verified from this container, 2026-10-03)

- **QUD Universal Aligner** (`https://aligner.qud.dev/api/v1`, OpenAPI 3.1, CORS open for
  `localhost` origins, no key): `POST /align/audio/stream` (SSE progress: queued, segmenting,
  transcribing, matching, recovering, building), `POST /sessions/{id}/timestamps` (per-word times),
  `POST /sessions/{id}/split` (by verses, words, duration, or only at stop signs),
  `POST /sessions/{id}/realign` (own boundaries), `POST /segment/audio`. Every segment carries
  `confidence`, `has_missing_words`, `has_repeated_words`, `error`, `matched_text`, and its words
  carry the Uthmani `word` text next to `location`.
- **QUD catalogue**: `GET /recitations` lists 93 reviewed recitations (reciter, riwayah, style,
  chapters); `GET /recitations/{slug}/chapters/{n}/segments?verse_from&verse_to&include_timestamps=true`
  returns reviewed segments with word timestamps and a Range-capable, CORS-enabled `audio_url` of
  exactly that verse range (`clip_start` re-zeroed). An end user never has to upload audio.
- **QUL**: the page fonts and shared fonts the package already uses (CDN, open). QUL's translation
  and word-by-word exports are documented formats (key/value `{"1:1": "..."}`, nested arrays,
  footnotes as tags `{t, f}`, inline `[[...]]`, text chunks; word by word `{"1:1:1": "..."}`) but
  downloading them needs a QUL login. The Studio reads any of those files from `public/`.
- **quran.com API v4** (open, CORS `*`): ayah translations by resource id and per-word translation
  and transliteration (`verses/by_chapter?words=true`), used to fetch a translation into `public/`
  in QUL's key/value shape so renders are offline and reproducible.

## 4. Architecture

```
packages/remotion-mushaf-line-renderer    the renderer: word-range slices ({fromWordId, toWordId}), timings version 1 and 2
packages/fonts-qpc-v4, fonts-qpc-v4-tajweed   the page fonts as npm packages (the CDN fallback)
packages/mushaf-studio                    @tlawat/mushaf-studio, ESM only
  src/compositions/recitation             <MushafRecitation>, its Zod schema, defaults, calculateMetadata
  src/compositions/passage                <MushafPassage>: a text-only passage, no audio
  src/compositions/{shared,extras,parts,timings}   what the compositions share: file loading, the audio source and cleanup, the end card, timings of either version
  src/unicode                             <MushafAyahText>: one ayah at a time as Unicode text, its fonts and text files
  src/page                                <MushafPage>: the whole printed page, the recited line marked, the page turn
  src/schema                              shared Zod fragments (theme, fonts, data, layout, animation, highlight, text, memorize, review, overlay)
  src/background                          <MushafBackground>: colour, gradient, image, looping video, Ken Burns, the glow
  src/audio                               analyzeAudio(), loudness, the volume curve, the summary kept in the timings
  src/overlay                             the title card, the corner label, surah names, range texts
  src/memorize                            memorisation: repeated clips, word visibility, first letters, the counter
  src/interlinear                         glosses under each printed word: measure, lay out, follow memorisation
  src/content                             tafsir, surah introductions, the tajweed legend, the end card, script fonts
  src/captions                            Caption[] both ways, SRT, WebVTT
  src/export                              YouTube chapters and description, the <MushafThumbnail> still
  src/presets                             MUSHAF_LOOKS: one-click looks, applyLook()
  src/qud                                 browser client for the aligner and the catalogue; conversion to timings; the riwayah check
  src/translations                        QUL format parsers, quran.com fetchers, <TranslationBlock>, <TranslationStack>, <GlossStrip>
  src/lines                               splitLineAt(), applySplits(), doubtfulWords()
  src/fonts                               QUL font catalogue (resource ids, CDN URLs), the fonts registry
  src/studio                              the panel (dock, six tabs, project menu, waveform), its store, i18n (en, ar), the Studio API wrappers
  src/types.ts, src/errors.ts             StudioTimings and the resolved shapes; MushafStudioError and its codes
apps/mushaf-studio                        the end-user project: Root with the compositions inline, `bun run studio`, scripts/make.ts (`bun run make`), scripts/sample.ts (`bun run sample`)
apps/mushaf-web                           the static page: catalogue, look, translation, <Player> preview, in-browser render (`@remotion/web-renderer`)
docs/mushaf-studio                        this plan, the agent guidelines, licensing, the layouts research, a visual recap (day-one.html)
```

### 4.1 Data model: props are the single source of truth

A composition's props hold everything, in two groups:

- **Content** (set by the panel through `saveDefaultProps`): `audioFile` (a `public/` path or an
  https URL), `timingsFile` (a `public/` path to `RecitationTimings` JSON), `fromAyah` / `toAyah`,
  `splits` (`[{page, line, atWordId}]`), `translation.file`, `gloss.file`.
- **Style** (set in the Props sidebar): theme, fonts, layout, animation, highlight, text placement.

`calculateMetadata()` turns them into `resolved` (lines, schedule, timings, translation) and the
video's size and duration. Large data never sits in props: it sits in `public/mushaf-studio/<project>/`
and is fetched through `staticFile()`, so the Render dialog, the CLI and Lambda all see the same
inputs.

### 4.2 Timings and the alignment sidecar

`RecitationTimings` (the package's format) stays the only timing input: version 1 for one surah,
version 2 for a recording that crosses surahs (each ayah names its surah; the compositions use such
a file whole). The panel writes version 1 with one extra top-level key the package ignores,
`alignment`: the aligner's segments with their confidence and flags, each word's Uthmani text, the
session id, model and device, the recording's loudness (`audio`), and a log of manual edits. Low confidence is a segment property (QUD gives none per word); a word is doubtful
when its segment's confidence is under the threshold, when its segment reports missing words or an
error, or when its ayah is `complete: false`.

### 4.3 Splitting a printed line

The package gains a third slice form, `{fromWordId, toWordId?}` (a band of `MushafWord.wordId`),
next to `{ayah}` and `{fromAyah, toAyah}`. Splitting a line at word `w` is then pure data: the line
appears twice in `lines`, once with the band up to `w - 1` and once from `w`, each a timed slot
of its own in `scheduleLines()`, each centred in the measure as the package already does for a
slice. Nothing in the renderer changes.

### 4.4 The panel

`<MushafStudioPanel>` is rendered inside `MushafRecitation`, `MushafAyahText` and `MushafPage`.
Outside the Studio it renders nothing. In the Studio it portals a dock into `document.body` with six
tabs: **Source** (catalogue, own audio; a confirmation for a riwayah other than Hafs), **Look**
(one-click style presets, undo), **Align** (QUD, with streaming progress; the same confirmation),
**Review** (segments and words with confidence, a waveform, seek on click, nudge, split, re-align;
export captions, chapters, a description and a thumbnail; import captions), **Lines** (the resolved
lines and their slots, split a line; the pages on `MushafPage`), **Text** (translations, glosses,
the Quran text, the end card's tafsir or surah introduction). Its state lives in a module store
(`useSyncExternalStore`), not in React state tied to frames, so playback does not re-render it.
Every mutation goes through the same path: write file(s) to `public/`, then `saveDefaultProps`, then
`reevaluateComposition`.

### 4.5 Fonts

Today: the two QUL font sets of the V4 mushaf (plain, tajweed colour) with the ten presets and
custom palettes, exposed in the schema with colour pickers per part. The font catalogue module
records the other QUL fonts (QPC V1, V2 page fonts; Uthmani Hafs, Nastaleeq, Indopak, Digital
Khatt Unicode fonts; surah-name fonts v1, v2, v4; quran-common) with resource ids and public CDN
URLs where they exist. `MushafAyahText` uses the Uthmani Hafs font from it; the V1 and V2 page
layouts (see the roadmap) will find their fonts there.

## 5. Workstreams (done)

Done: 0 plan and scaffold, 1 word-range slices, 2 QUD client, 3 translations, 4 compositions, 5 the panel, 6 the app and CI, 7 QA.

## 6. Definition of done for the proof of concept (met)

Met: the checks pass, the Studio opens on the sample, the panel picks, reviews, splits and translates, and the smoke test mounts it.

## 7. Roadmap

### Done

- **Unicode text layout**: `MushafAyahText`, one ayah at a time in QUL's Uthmani Hafs font, for reels.
- **The page view**: `MushafPage`, the whole printed page with the recited line marked and the turn.
- **Captions interop**: SRT, WebVTT and `Caption[]` out; `Caption[]` back in from the Review tab.
- **Project files**: `project.json` export and import, with its files and `BAD_PROJECT_FILE`.
- **Looks**: `MUSHAF_LOOKS` and the Look tab, with undo.
- **Backgrounds and audio cleanup**: image, video, gradient, glow; loudness, fades, silence trim.
- **Memorisation and interlinear glosses**: repeats, blanks, first letters; glosses that follow them.
- **Title, legend, end card, thumbnail, chapters, description**: the publishing extras.
- **The web app**: `apps/mushaf-web`, the catalogue path and an in-browser render, with a render test.
- **The CLI**: `bun run make`, a catalogue recitation to a video without the Studio.
- **Recitations across surahs**: version 2 timings in the three recitation compositions.
- **The riwayah guard**: a confirmation before a non-Hafs recitation meets the Hafs page.
- **A local sample**: `bun run sample`, a fallback to the clip, loudness kept in the timings.
- **CI**: the web app build and the Studio smoke suite run on every push.

### Open

- **QPC V1, QPC V2 and Indopak layouts.** Facts and a design are in
  [layouts-research.md](layouts-research.md). Next step: the `qul data --dataset qpc-v1|qpc-v2`
  command that builds a `CompiledLayout` from quran.com v4 and QUL's previews, with the invariants as
  its gate; Indopak then needs a justified line mode.
- **Warsh and Qalun.** The catalogue and the aligner know these riwayahs; the page is Hafs only, so
  the panel asks before it times one against it. Next step: find a Warsh and a Qalun print with a
  word-level line layout and page fonts, and add them as datasets the way the research note does
  for V1 and V2.
- **A server-side proxy for the aligner.** An optional sidecar that forwards to QUD with the user's
  Hugging Face token (quota), caches sessions, and keeps large files out of the browser. Next step:
  a small Bun server in `apps/mushaf-studio` that the QUD client's `api` option points at, which
  also refuses the requests the service hangs on.

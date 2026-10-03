# Mushaf Studio: extending Remotion Studio with the package's features

Status: proof of concept, built on branch `claude/jolly-dijkstra-ov8av6`. This page is the plan that
the work follows and the record of the decisions behind it. The companion page,
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
(`@tlawat/mushaf-studio`), and one ready-made Remotion project (`apps/mushaf-studio`) that end users
start with `bun run studio`.

## 2. What Remotion Studio lets us extend (facts, verified against 4.0.521)

Remotion Studio has no API for custom sidebar panels. It has four extension surfaces, and the
design uses all four:

| Surface | What it gives | How Mushaf Studio uses it |
| --- | --- | --- |
| Zod schema on `<Composition>` | Typed controls in the Props sidebar (enums, numbers with min/max/step, `zColor()`, nested objects, arrays), JSON editing, save-to-code, Render dialog input props. | Every style option of the compositions (theme, fonts, layout, animation, highlighting, translation placement). |
| `Interactive.withSchema()` (since 4.0.475, in 4.0.521) | A custom component becomes selectable on the canvas and in the timeline, with its declared props editable and keyframable. | The line window and the translation block are wrapped so their position, scale, opacity are editable on the canvas. |
| `@remotion/studio` client API | `writeStaticFile`, `getStaticFiles`, `watchPublicFolder`, `saveDefaultProps` (writes the Root file), `reevaluateComposition`, `seek`, `play`, `pause`, `goToComposition`, `focusDefaultPropsPath`. | The panel writes audio, timings and translations into `public/`, updates the composition's content props, re-runs `calculateMetadata()` and drives the playhead. |
| Studio-only React | `getRemotionEnvironment().isStudio` is true in the Studio only; a component can render a portal into `document.body` (the Studio renders compositions in the page, not in an iframe). | The Mushaf panel: a dock rendered by the composition tree, Studio only, never in a render or a `<Player>`. |

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
packages/remotion-mushaf-line-renderer    the package: + word-range slices ({fromWordId, toWordId})
packages/mushaf-studio                    @tlawat/mushaf-studio
  src/compositions/recitation             <MushafRecitation>, its Zod schema, defaults, calculateMetadata
  src/compositions/passage                <MushafPassage>: a text-only passage, no audio
  src/schema                              shared Zod fragments (theme, fonts, layout, animation, highlight, text)
  src/qud                                 browser client for the aligner and the catalogue; conversion to RecitationTimings
  src/translations                        QUL format parsers, quran.com fetchers, <AyahTranslation>, <WordGloss>
  src/lines                               splitLineAt(), applySplits(), lowConfidenceWords()
  src/studio                              the panel (portal, tabs), its store, the Studio API wrappers
  src/fonts                               QUL font catalogue (resource ids, CDN URLs) and translation font presets
apps/mushaf-studio                        the end-user project: Root with the compositions inline, `bun run studio`
docs/mushaf-studio                        this plan, the agent guidelines, user docs
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

`RecitationTimings` (the package's version-1 format) stays the only timing input. The studio writes
it with one extra top-level key the package ignores, `alignment`: the aligner's segments with their
confidence and flags, each word's Uthmani text, the session id, model and device, and a log of
manual edits. Low confidence is a segment property (QUD gives none per word); a word is doubtful
when its segment's confidence is under the threshold, when its segment reports missing words or an
error, or when its ayah is `complete: false`.

### 4.3 Splitting a printed line

The package gains a third slice form, `{fromWordId, toWordId?}` (a band of `MushafWord.wordId`),
next to `{ayah}` and `{fromAyah, toAyah}`. Splitting a line at word `w` is then pure data: the line
appears twice in `lines`, once with the band up to `w - 1` and once from `w`, each a timed slot
of its own in `scheduleLines()`, each centred in the measure as the package already does for a
slice. Nothing in the renderer changes.

### 4.4 The panel

`<MushafStudioPanel>` is rendered inside the composition. Outside the Studio it renders nothing. In
the Studio it portals a dock into `document.body` with tabs: **Source** (catalogue, own audio),
**Align** (QUD, with streaming progress), **Review** (segments and words with confidence, seek on
click, nudge, split, re-align), **Lines** (the resolved lines and their slots, split a line), **Text**
(translations and glosses). Its state lives in a module store (`useSyncExternalStore`), not in
React state tied to frames, so playback does not re-render it. Every mutation goes through the same
path: write file(s) to `public/`, then `saveDefaultProps`, then `reevaluateComposition`.

### 4.5 Fonts

Today: the two QUL font sets of the V4 mushaf (plain, tajweed colour) with the ten presets and
custom palettes, exposed in the schema with colour pickers per part. The font catalogue module
records the other QUL fonts (QPC V1, V2 page fonts; Uthmani Hafs, Nastaleeq, Indopak, Digital
Khatt Unicode fonts; surah-name fonts v1, v2, v4; quran-common) with resource ids and public CDN
URLs where they exist, so the next step (a Unicode-text layout for non-mushaf framing, then the V1
and V2 page layouts) has its data in one place. See the roadmap.

## 5. Workstreams

| # | Workstream | Owner | Depends on |
| --- | --- | --- | --- |
| 0 | Plan, guidelines, package scaffold with the module contracts | lead | — |
| 1 | Package: word-range slices (`fromWordId`/`toWordId`), tests, docs | agent | 0 |
| 2 | QUD client (catalogue, align stream, timestamps, split, realign) + conversion + tests | agent | 0 |
| 3 | Translations: QUL parsers, quran.com fetchers, loaders, components + tests | agent | 0 |
| 4 | Compositions: `MushafRecitation`, `MushafPassage`, schemas, calculateMetadata + tests | agent | 0 (1, 3 by contract) |
| 5 | Studio panel: dock, tabs, store, Studio API wrappers | agent | 0 (2, 3, 4 by contract) |
| 6 | App template, READMEs, CLI script, workspace and CI wiring | agent | 0 |
| 7 | QA: reviews against the guidelines, Studio smoke test with Playwright, fix loops | agents + lead | 1–6 |

Contracts are the stub files the scaffold ships: an agent implements its module's exported
signatures as given; changing a signature is a change of contract and goes through the lead.

## 6. Definition of done for the proof of concept

- `bun run check && bun run test && bun run build && bun run test:types && bun run typecheck` pass.
- `apps/mushaf-studio`: `bun run studio` opens the Studio; `MushafRecitation` renders with the
  committed sample; the panel shows the catalogue; picking a catalogue chapter writes audio and
  timings into `public/` and updates the Root; the Review tab marks low-confidence segments;
  splitting a line adds a slot; fetching a translation shows it under the lines.
- A headless smoke test (Playwright against the Studio) proves the composition mounts without an
  error overlay and the panel is present.
- Docs: this plan, the guidelines, the package README (developer path), the app README (user path).

## 7. Roadmap after the proof of concept

1. **Unicode text layouts**: a `MushafAyahText` composition for reels framing (one ayah centred,
   Uthmani Hafs or Indopak font from QUL, text from quran.com by location), sharing the timings,
   highlighting and translation modules.
2. **QPC V1 and V2 page layouts**: QUL publishes both font sets on the CDN; their word scripts and
   line layouts are separate exports. The package's registry is already multi-mushaf by design; the
   data job is to pin and mirror those exports and extend the invariants.
3. **Captions interop**: export the word timings as Remotion `Caption[]` (which carries
   `confidence`) so the Studio's own caption editor can be used on them, and import edits back.
4. **A real server side for the aligner**: an optional sidecar that proxies QUD with the user's
   Hugging Face token (quota) and caches sessions, so large files do not go through the browser.
5. **Project files**: save and load a whole project (props + files) as one JSON, for sharing.

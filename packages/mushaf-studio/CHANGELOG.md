# Changelog

## Unreleased

First proof of concept of Mushaf Studio: Remotion Studio, extended with the package's features
as a user interface. See [docs/mushaf-studio/plan.md](../../docs/mushaf-studio/plan.md) for the
design and the roadmap.

- **Compositions with Zod schemas**, so the Studio's Props sidebar is the style editor:
  `<MushafRecitation>` (the printed lines of a recited passage follow the audio, one line at a time
  or through a line window, the current word or ayah highlighted in a chosen style, the other words
  dimmed or only the ones still to come, an ayah translation above or below the lines, a gloss strip
  for the active word; in the Studio the doubtful words are underlined), `<MushafAyahText>` (one
  ayah at a time as Unicode text in QUL's Uthmani Hafs font, the framing of reels, with the same
  audio, timings, highlighting and translation) and `<MushafPassage>` (printed lines without audio).
  Themes (the ten presets, `plain`, or a custom palette with a colour per part), font sources,
  frame shapes (16:9, 9:16, 1:1, 4:5), the line window, the entrances and exits, the highlight, the
  text blocks and their offsets are schema props with descriptions.
- **The Mushaf panel** (`<MushafStudioPanel>`), docked into the Studio and rendered nowhere else:
  the QUD aligner's catalogue of reviewed recitations (reciter, chapter, verse range) with the clip
  and its word timings written into `public/`; an own recording aligned through the QUD Universal
  Aligner with streaming progress; a review of the alignment (segments with confidence and flags,
  seek on click, per-word nudges, splitting a session's segments, re-aligning from edited
  boundaries); splitting a printed line at a word into two timed segments; ayah translations and
  word-by-word glosses or transliterations from quran.com, or any QUL translation file dropped into
  `public/`. Every change is written to `public/` and saved to the composition's props.
- **Data modules** usable without the compositions: the QUD client (`listRecitations`,
  `getChapterSegments`, `alignAudio`, `sessionTimestamps`, `splitSession`, `realignSession`,
  `timingsFromQud`, `timingsFromCatalogue`), the translation loaders (`parseTranslationFile` for
  every QUL export shape and the studio envelope, `fetchQuranComTranslation`,
  `fetchQuranComWordGloss`, `fetchQuranComText`), the line tools (`splitLineAt`, `applySplits`,
  `doubtfulWords`), captions interop (`toCaptions`, `fromCaptions`, `captionsToSrt`), the QUL font
  catalogue and the fonts registry (`registerMushafFonts`).
- **The timings file** is the package's `RecitationTimings` plus an `alignment` sidecar: the
  aligner's segments with their confidence, every recited word with its text, the session, and a
  log of edits.
- **The app** `apps/mushaf-studio` declares the compositions with their defaults inline, ships the
  data mirror and an Al-Fatihah sample, and starts with `bun run studio`.
- **Backgrounds in every composition**: a `background` group (`backgroundSchema`) in
  `MushafRecitation`, `MushafAyahText`, `MushafPage` and `MushafPassage`, painted by
  `<MushafBackground>`: the page colour, a gradient, an image or a looping muted video (its length
  probed in `calculateMetadata()`), with blur, dim, Ken Burns and a glow that follows the
  recitation's level. `layout.background` stays the page colour; `layout.backgroundImage` is kept
  for saved props (`backgroundFor()`).
- **Audio cleanup** in the three audio compositions: an `audio` group; `calculateMetadata()` runs
  `analyzeAudio()` when `normalize`, `trimSilence` or the glow needs it and keeps the gain, the
  silence skipped and the glow's levels in `resolved.audio`; a failed analysis plays the audio as it
  is, with the reason in `resolved.audioWarning` shown in the Studio only. `trimSilence` adds the
  skipped silence to `audioOffsetSeconds` and moves the timings by it (`skipRecitationStart()`,
  `skipAyahTextStart()`, `skipPageStart()`); every `<Audio>`, each memorisation clip included, gets
  `volume={(f) => volumeAt(f, curve)}`, faded only at the composition's start and end.
- **`@remotion/media`'s `<Audio>` under the in-browser renderer**: the compositions render it when
  `useRemotionEnvironment().isClientSideRendering` is set (`renderMediaOnWeb()`), `remotion`'s
  otherwise. `@remotion/media` is a new peer dependency.
- **Stacked translations with script fonts**: `text.translations` (up to three `{file, font,
  fontSize, color}`) in a `<TranslationStack>`; `font: 'auto'` loads the web font of the
  translation's language through one `useWebFonts()` call, the direction follows the language.
  `text.translationFile` stays the one translation while `translations` is empty. Translations are
  cut to the ayahs shown. `MushafPage` gets a `text` group, its translations beside or under the page.
- **Tajweed legend**: a `legend` group on `MushafRecitation` and `MushafPage`, the
  `<TajweedLegend>` in a corner, drawn only under a theme that colours the rules.
- **End card**: an `endCard` group on the three audio compositions: `seconds` added after the last
  ayah, the credits from `attributionLines()` (`<EndCard creditLines>`), with the tafsir of the last
  ayah recited or the surah's introduction read in `calculateMetadata()`.
- **The app registers `MushafPage` and the `MushafThumbnail` still**, every composition's inline
  defaults carrying the new groups; the Mushaf panel docks over `MushafPage` too.
- **Recitations that cross surahs.** `MushafRecitation`, `MushafAyahText` and `MushafPage` read
  version 2 timings (`StudioTimings` is `StudioTimingsV1 | StudioTimingsV2`). Such a file is used
  whole: `fromAyah` and `toAyah` do not cut it. Its lines come from `getMushafLinesForRanges()`, each
  later surah's printed header between the two surahs. The intro card, the chapters, the
  description and the captions name both surahs; `MushafPage` dims by every range. The panel
  writes version 1; it reviews a version 2 file, but a nudge is `BAD_TIMING_EDIT` and the Text tab
  fetches for one surah only. New helpers: `passageSpan()`, `crossesSurahs()`, `surahOfAyah()`,
  `ayahKeysOf()`, `surahSpanName()`, `ayahSpanText()`.
- **Captions import.** Review's export row has **Import captions…**: it reads a `Caption[]` JSON (the
  file **Captions JSON** writes, edited in a caption editor) back into the timings with
  `fromCaptions()`, logs a `realign` edit noted `captions import`, writes the file and re-evaluates
  the composition. A file that changes no time is not written. A file that is not an array of
  captions is `BAD_TIMING_EDIT`, named in the status line.
- **Riwayah guard.** The page is the Hafs print (KFGQPC V4). A catalogue recitation in another
  riwayah (`isHafsRecitation()` is false) and Align with another riwayah show a warning, in English
  and Arabic. **Use this recitation** and **Align** stay disabled until a checkbox confirms it. The
  web app asks the same before it loads the recitation.
- **Error codes.** `CONTENT_FETCH_FAILED` (a tafsir or a surah introduction could not be fetched),
  `BAD_CONTENT_FILE` (a tafsir or chapter-info file is not its envelope) and `BAD_PROJECT_FILE` (a
  `project.json` that cannot be imported). The tafsir and chapter-info loaders used
  `TRANSLATION_FETCH_FAILED` and `BAD_TRANSLATION_FILE`, the project import `BAD_STUDIO_PROP`.
- **QUD client checked against the live service.** The catalogue and an alignment of surah 112
  agree on the 4 ayahs and the word ids, within 0.3 s; the answers are replayed as fixtures
  (`test/fixtures/qud/live-*`). Fixes: `splitSession()` and `realignSession()` refuse bad values
  before sending (`QUD_HTTP`, `details.status` `null`), since a split with `max_verses: 0` held the
  service for minutes. Error messages name a gateway's error (Cloudflare's 524 page) and give
  `Retry-After`. The 404 hint matches the route: an expired session, or a wrong slug or chapter.
- **The sample's recording is local.** The defaults' `audioFile` is `mushaf-studio/fatiha/audio.mp3`.
  `bun run --cwd apps/mushaf-studio sample` downloads it once (two-minute timeout, one retry, a
  `.part` file until it is complete); the root `bun run studio` runs it first. The file is not
  committed.
- **A missing recording falls back to its clip.** When `audioFile` is a `public/` path the server
  answers 404 for, and the timings name their catalogue clip (`alignment.recitation.audioUrl`),
  `calculateMetadata()` sets `resolved.audioSrc` to the clip, the compositions play it, and the
  Studio shows a warning that names the missing file and the fix.
- **Loudness is kept in the timings.** Source and Align measure a new recording and write the result
  to `alignment.audio` (`{lufs, peak, firstSoundSeconds, durationSeconds}`, `audioSummaryOf()`).
  With the glow off, `normalize` and `trimSilence` use it, so the recording is not downloaded
  again. The sample's timings carry it.
- **The ayah-end marker never starts a line.** `<AyahText>` puts an ayah's last word and its marker
  in one `span.mushaf-ayah-tail` with `white-space: nowrap`.
- **First letters keep the layout.** In `'first-letters'` the cue is drawn over the word, which
  stays laid out but hidden, so the lines break where the full text's do.
- **Translation alignment.** `<TranslationBlock>` and `<TranslationStack>` take `align` (`'start'`,
  the default, `'center'` or `'end'`). `MushafAyahText` passes `'center'`.
- **Glosses follow memorisation.** Under the blank and first-letter modes, an interlinear gloss
  hides with its word (opacity 0, layout kept) or goes faint with it (0.12):
  `glossVisibilityFrom()`, `<InterlinearGlosses visibilityOf>`. The active word's gloss is
  highlighted as before.
- **CI.** After the render suite, CI builds `apps/mushaf-web`, downloads the sample's recording and
  runs the Studio smoke suite (`test:studio`, which now covers the Review tab). The root
  `bun run typecheck` checks `apps/mushaf-web` too.
- **In-browser render test.** `bun run --cwd apps/mushaf-web test:render-web` builds the web app,
  renders Al-Ikhlas in Chromium with `@remotion/web-renderer` and checks the file it offers: a video
  and an audio track, the length the page said, the recitation audible (in Chromium: a 13 s WebM,
  1920×1080, VP9 and Opus). QUD's answers and the clip are downloaded once into
  `test-results/web-render/`; the CDNs are live. Without the downloads the test skips.

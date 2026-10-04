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

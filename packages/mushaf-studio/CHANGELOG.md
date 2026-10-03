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

# Changelog

## 0.2.0 (unreleased)

The render design ([docs/mushaf-studio/render-design.md](../../docs/mushaf-studio/render-design.md)):
one quiet mark, motion that waits for the voice, five looks, and a frame dressed like a printed
mushaf leaf. Props saved by 0.1.0 still render: they are migrated as they are read.

### Breaking

- **One quiet mark, and types that change shape.** `Highlight` is `{mode, style: 'ink' | 'tint' |
  'wash', color, restOpacity, occurrence}`: `ink` (the default: the words still to come rest at
  `restOpacity` and fill in as heard), `tint` (the word's ink eases into the accent, read at 5:1 on
  the page) or `wash` (a faint, soft-ended band). Each eases in and out, and none dims a neighbour
  line twice. `Animation` is `{lines: 'fade' | 'rise' | 'cut', tempo: 'calm' | 'slow',
  leadInSeconds}` (`MushafAyahText`'s `animation` too). `Layout` gains `frame`, `Background` loses
  `glow` and gains `vignette`, `MushafLook` gains `nameAr` and `descriptionAr`. Code that builds
  these objects must use the new fields; code that reads saved props should pass them through
  `migrateMushafProps()` first.
- **Removed options**, each mapped by the migration to its nearest equivalent: the `glow` and
  `marker` marks and the free `none` style (to `tint`, `wash`, and `mode: 'none'`), `dimOthers` and
  `dimUpcomingOnly` (to `style: 'ink'` with `restOpacity` the old dimming, 0.5-0.85), `enter`, `exit`
  and `scroll` (`slide-fade` → `rise`, `fade` and `reveal-rtl` → `fade`, `none` → `cut`; the spring
  scroll is gone), `background.glow` (a vignette of 0.15 or more), the `pan-left` and `pan-right`
  Ken Burns (`slow-zoom`, at most 1.05), and `pageView`'s `underline`, `ornate` and `slide` (`band`,
  `simple`, `fade`). Ranges narrow: `layout.neighbourOpacity` 0.15-0.5, `animation.leadInSeconds`
  0-2, `overlay.introSeconds` 2-6, `background.kenBurnsScale` 1-1.05, `pageView.turnSeconds` 0.6-1.5,
  `pageView.dimOtherLines` 0.5-1; older values are clamped. The Karaoke yellow `#ffd166` becomes
  `#b8913a`; any other colour is kept. The old default font stacks (Georgia, Noto Sans) become
  `'auto'`. The full table is in the README's "Upgrading saved props" and in section 7 of the
  design.
- **Saved props are migrated as they are read.** `migrateMushafProps()` runs first in every
  `calculateMetadata()` and slot resolver, so props saved by 0.1.0 render the new design;
  `describeMushafMigration()` lists what changes and `mushafPropsNeedMigration()` says whether
  anything does. The colour, timing and motion tokens (`legibleAccent()`, `washColor()`,
  `wordSpans()`, `boundaryStart()`, `dissolve()`, `tempoFrames()`, ...) are exported.
- **Five looks and a Format control replace the nine old looks.** `MUSHAF_LOOKS` is Mushaf (the
  defaults), Haram night, Madinah green, Tajweed and Learning, each named and described in English
  and Arabic, each a ground, an ink, one metal and one mark; looks may now set `overlay` (colour,
  font), `legend` (show, place, names) and `background` (colour, vignette). Classic, Tajweed light,
  Night, Black & gold, Sepia, Reel, Square, Karaoke and Study are gone: `lookById()` maps their ids
  (`classic`, `sepia`, `karaoke` → `mushaf`; `tajweed-light` → `tajweed`; `night`, `black-gold` →
  `haram-night`; `study` → `learning`), with one warning, and gives `reel` and `square` their
  format. The frame shape is `MUSHAF_FORMATS` / `applyFormat()` (landscape, vertical, square,
  portrait): the aspect, and the margins and vertical place only while they hold the previous
  format's, so look and format commute. `layout.verticalAlign` now steps by 0.01 (the formats use
  0.45, 0.47, 0.48).
- **Helpers written before the design** keep working, deprecated: `activeWordStyleFrom()` migrates
  its argument and returns the mark at full emphasis (`undefined` for ink, the tint drawn on the
  ground, a lone wash); `scrollTimingFrom()` returns the window's scroll (24 frames on `INOUT`, 34
  slow; `windowScrollTiming()` also knows the cut). `animationFrom()` takes the new `Animation` and
  the lengths of the boundary it runs at (`{enterFrames, exitFrames}`).
- **Needs `@tlawat/remotion-mushaf-line` 0.6.0** (`CALM_EASINGS`, `fadeRise()`, `inkTint`,
  `WordContext.linePosition` and `inkPalette`); the peer range follows at release.

### Changed (what looks different)

- **Gold highlights read.** A saved gold `color` becomes a tint drawn at 5:1 on the page (a darker
  gold on cream: `#b8913a` is drawn `#806321`), and it now shows on the colour themes too. Glow,
  marker and Karaoke saves get a quieter mark. The Look tab shows the shade drawn; the saved colour
  is never rewritten.
- **Late, never early, and every save gains it.** One line at a time, consecutive lines overlap by
  the staggered dissolve after the outgoing line's last word (`oneLinePlan()`); the window fades in
  over 0.8 s with its first line in place, and after the last word it holds 1.5 s and fades over
  1 s before the end card, which then dissolves in on the same ground. The translation and the
  corner number change after the outgoing ayah's last word (`ayahChanges()`), by a dissolve.
  `tempo: 'slow'` lengthens every change 1.4×. With the intro delay (when the intro card is on) and
  the loaded fonts, most videos get longer; a host that syncs to the video reads
  `resolved.introDelaySeconds`.
- **A translation larger than half the Arabic is drawn at half**, which shows at 9:16 (36 px is drawn
  26 there).
- **New projects start from the Mushaf look**: ivory, warm ink, gold-line rosettes on vellum, the ink
  filling in behind the reciter, three lines, calm dissolves.
- **The line window scrolls after the last word of the outgoing line**, never while it is heard
  (`anchor: 'start'`, `windowScrollStarts()`), so the word being recited keeps the centre slot and
  its mark. A translation, gloss or label colour that reads under 4.5:1 on its ground is drawn as
  a muted ink (`readableInk()`); the ground counts a `layout.backgroundImage` as the image it is
  (`groundFor()`). A rosette the timings time as a word holds the ayah's last word's mark to the
  release (`markerIds()`), and the gloss strip keeps its pace at any frame rate.
- **The intro card adds its time.** With `overlay.title` `intro` or `both`, the recording starts
  `resolved.introDelaySeconds` later (`introSeconds` + the card's entrance + the lead-in, less what
  the recording already waits), the video grows by it, and the card has its whole `introSeconds`:
  the bare ground at frame 0, the framed surah name, a gold hairline, the range in Amiri and in
  small caps, the reciter, the translation's credit. A host that syncs to the video maps its time
  with `introDelaySeconds`. Not under `hostAudio`, where the template's track decides.
- **Fonts actually loaded**: `useStudioFonts()` loads EB Garamond 400, 400 italic and 500 and Amiri
  400 behind the render's font gate; `'auto'` is EB Garamond for Latin translations (500), the
  gloss (400 italic) and the labels. The translation is centred, at most half the Arabic, balanced
  on at most two lines (0.85 of its size when it needs more, never cut), 0.4 of a line box from the
  lines, its layers split by a short hairline. The corner label is "AL-FATIHAH · 3" in small caps
  (no reciter); the repeat counter is plain "2 / 3" text; the tajweed legend is one centred row in
  a band the lines are fitted around; memorisation reveals and hides words with a short fade, and
  the first-letters ghost is 0.14 (0.20 on a dark ground). Defaults: translation 36 px `#5a554c`,
  gloss 30 px `#6b6458`, overlay `#5a554c` with `cornerSize` 0 (follows the frame).
- **Nothing pops, and every part keeps its time.** `MushafPassage` appears over 0.8 s, fades over
  1 s after its last hold (the video grows by it), and dissolves its translation and corner number
  at each line's hold start (`passageAyahChanges()`); its window no longer shows under the intro
  card. With the intro card on, the surah's header lines before ayah 1 count in the intro delay
  and keep their spacing after the card. Under repeats, a new play eases the line's ink back to
  rest and lets the last mark go, and words a later play shows come in over 7 frames. The end hold
  counts from the last word, not from a timed ayah-end rosette. The legend measures its entries as
  drawn and draws its names smaller when one would leave the safe area (9:16 with both names). The
  card's Latin range is "Ayat 2–7" (the font sets a capital Ā's macron beside it). The thumbnail
  loads EB Garamond.
- **The Look tab** has the Format row (hidden in a slot, with a hint under Vertical), cards with
  both names and four chips (page, ink, metal, the mark as drawn), and the mark in one line with a
  note when a tint is drawn in another shade or shown as a wash. Every tab shows an **upgrade
  banner** while the Root holds props an earlier Mushaf Studio saved: *What changes* lists every
  change, *Upgrade* saves the migrated props (`replaceTargetProps()`), *Upgrade and apply the
  Mushaf look* adds the look and the format's positions. English and Arabic.
- **The background draws its vignette** (darker page at the edges; black on a dark ground),
  dithered by a fixed noise so it does not band; an image or a video keeps a dim floor (black at
  0.45 under light ink, a page veil at 0.55 under dark ink: `dimLayer()`); the slow zoom eases on
  `SINE`. `layout.frame: 'hairline'` draws the jadwal: two gold rules at the safe area (`<Jadwal>`).
- **MushafPage**: the page fills 92 % of a wide frame's height (84 % of a tall one's width) around
  the legend's band (`pageGeometry(size, reserve)`, no longer from `marginX`), turns by the
  staggered dissolve after its last word (`pageTurns()`), cross-fades the line band from line to
  line (`pageLineEmphasis()`), draws its double rule in the metal and its number at 60 %, and rests
  the words outside the ayahs followed at 0.5.
- **MushafAyahText**: each ayah comes in by the dissolve after the last word of the one before
  (`ayahTextPlan()`), the last holds 1.5 s and fades before the end card (the duration grows to
  it: `ayahTextContentFrames()`); the words are 0.1 em apart in a balanced block 78 % of the frame
  wide, each word a box as tall as its line for the wash.
- The example template's frosted card is gone (the recitation sits in a plain block inside the safe
  area) and its slot follows the default mark.

### Fixed

- **The mark on colour themes**: `highlight.color` did nothing on a colour theme; ink and wash now
  work everywhere, and a tint repaints only the ink (or shows as a wash on the tajweed colours).
- **Early changes**: lines, the window's scroll, the translation and the ayah text left up to 1.2 s
  before their last word ended; now nothing changes before the voice has finished it.
- **The intro card cut to one frame** when the first word came early: the card now adds its time.
- **The card's Arabic range read backwards**: it is drawn in a right-to-left isolate («الآيات ٢–٧»,
  the first ayah rightmost).
- **The legend covered the text**: it is a band the lines (and the page) are fitted around.
- **The end card showed the chapter-info title twice**: the title block appears once.
- **Fonts that were never loaded**: Georgia, Noto Sans and the label fonts fell back to whatever the
  machine had; EB Garamond and Amiri are now loaded behind the render's font gate.

## 0.1.0 (unreleased)

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
- **Drop-in slots.** A recitation, an ayah text or a page inside a template of your own, its props
  under one key of the template's (`mushafRecitationSlotSchema`, `null` until one is picked):
  `resolveMushafRecitationSlot()` (at the template's fps, no size, never throwing in the Studio's
  preview), `<MushafRecitationSlot>` (the box's `<Sequence>`, the panel docked beside it on every
  frame), and the same for `MushafAyahText` and `MushafPage`. The panel takes `propsKey`, `kind`
  and `frameOffset`; the compositions take `panel={false}`; the glow's levels record their fps
  (`levelsFps`). The app's `MushafInTemplate` is the example.
- **Explicit audio sources.** Source is one choice of four (the catalogue, an upload, a file of
  `public/`, a track of the template), each with one button and a line that says what it replaces,
  under a "Now:" line that says what plays and where it came from. The catalogue note names
  aligner.qud.dev and the clip host read from the answer; a clip that cannot be downloaded saves
  nothing (Retry, or Stream from its host on purpose) instead of saving its URL silently; a missing
  file the catalogue clip streams for can be downloaded from the Now line. Align works on the one
  staged recording and says where it came from; it does not re-align a catalogue recitation, aligns
  a URL (fetched by the browser, else by the aligner, `alignUrl()`), and sends a video's sound as
  WAV (`encodeWav()`, `audioToWav()`), a template's video track of any extension included.
- **`hostAudio`.** An optional group in `MushafRecitation`, `MushafAyahText` and `MushafPage`
  (`hostAudioSchema`, `defaultHostAudio`, read by `hostAudioOf()`): the template plays the audio,
  the composition plays none, its timings start at `offsetSeconds` of the track, the audio cleanup
  does nothing, and `memorize` repeats are refused (`assertNoHostRepeats()`). The compositions'
  own `<Audio>` is named `OWN_AUDIO_NAME`. The panel lists the template's tracks from the Studio's
  timeline, follows one (a `blob:` track is copied into `public/` once and mapped back to that copy),
  and offers Update timing when it moves. The glow's levels are silent before
  a track that starts after the composition (`levelsWindow()`).
- **Panel saves build on the Studio's live props.** In Remotion 4.0.539 the props
  `saveDefaultProps()` hands its callback stay the Root as the page loaded it, so every panel save
  wrote back the page-load value of every field it did not set (Props-sidebar edits, the Studio's
  undo, hand edits of the Root) and replayed every value it had ever written. Saves now start from
  the live props (`EditorPropsContext`, read in `remotion-internals.ts` only, its shapes pinned by
  a test), add only the panel's saves still on their way, and run one at a time. When the live
  props lose what the panel saved (the sidebar's JSON Reset, the Studio's undo, a racing sidebar
  save), the dock names the fields and offers **Restore** instead of writing them back.
- **Data that stays in step.** A timings file with manual edits or other timings is never
  replaced: new timings go to `<name>-2.timings.json`, `-3`, ... (`timingsPathFor()`). The range and
  the splits are reset only for another recording (`isOtherRecording()`), which also clears the
  translations, glosses, tafsir and surah introduction that do not fit the new passage
  (`stalePassageFiles()`). Uploads take a free name. Splits that no longer fit the range or `slice`
  are left out of the Studio's preview (`fitSplits()`, `resolved.droppedSplits`) and removed in one
  click in Lines; a render refuses them (`droppedSplitsError()`, `BAD_LINE_SPLIT`). Review keeps its
  nudges and re-align boundaries in recording time. Drafts, uploads and look undo are kept per
  composition (and slot) and survive a tab switch; frame looks no longer set positions, and Undo
  puts back only the fields that still hold a look's values. `MushafPage` projects import, and
  `background.src` is listed with a project's files.
- **Which option wins.** The schema descriptions of overlapping options say which one wins
  (`layout.background` and `background.color`, `layout.backgroundImage` and `background.src`,
  `header` and the intro card, `highlight` and `memorize`, `translations` and `translationFile`,
  `glossPosition` and the gloss files, `endCard.show` and its files, `hostAudio` and the audio
  cleanup, `fonts` and the registered packages, `customTheme` and `theme`, `legend.show` and the
  theme). Colour fields lost their descriptions: in Remotion 4.0.539 a `.describe()` replaces
  `zColor()`'s marker, and the Props sidebar showed a text box instead of the colour picker. The
  panel greys out what the props make do nothing, with the reason and in both languages: a
  translation or a gloss placed `none`, an end-card file the card does not show, a look's page
  colour under an image, a video or a gradient.
- **CI.** After the render suite, CI builds `apps/mushaf-web`, downloads the sample's recording and
  runs the Studio smoke suite (`test:studio`, which now covers the Review tab). The root
  `bun run typecheck` checks `apps/mushaf-web` too.
- **In-browser render test.** `bun run --cwd apps/mushaf-web test:render-web` builds the web app,
  renders Al-Ikhlas in Chromium with `@remotion/web-renderer` and checks the file it offers: a video
  and an audio track, the length the page said, the recitation audible (in Chromium: a 13 s WebM,
  1920×1080, VP9 and Opus). QUD's answers and the clip are downloaded once into
  `test-results/web-render/`; the CDNs are live. Without the downloads the test skips.

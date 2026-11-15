# Mushaf Studio: drop-in slots, panel reliability, audio sources

Status: implemented on branch `claude/inspiring-sagan-wkujy0`, in the commits after `edf2819`. It
followed a code investigation of `packages/mushaf-studio` against Remotion 4.0.539 (findings with
file:line references in the session record). This page was the contract the implementation
followed; where the implementation differs, section 3 says how and why. Where code and this page
disagree, the code's doc comments win and this page is updated. The user-facing account is in the
package's README ([The Mushaf panel](../../packages/mushaf-studio/README.md#the-mushaf-panel),
[Inside your own composition](../../packages/mushaf-studio/README.md#inside-your-own-composition)).

## 1. What was wrong

### 1.1 The panel saved over the user's edits (the root cause of "the Studio forgets the alignment")

`patchProps()` (src/studio/studio-api.ts) built every save as
`deepMerge(savedDefaultProps, carried unsavedPatches, patch)`. In Remotion 4.0.539
`savedDefaultProps` is `composition.defaultProps` from the bundle, and it never changes after the
page loads: the server writes the Root file with `suppressBundlerUpdateForFile()`, so webpack does
not re-evaluate the Root. The live Root content reaches the browser only through
`Internals.EditorPropsContext` (`props[compositionId]`, pushed by the
`default-props-updatable-changed` event), which is what the preview and the Props sidebar use.

Consequences, all confirmed in code:

- every panel save wrote back the page-load value of every field it did not set: Props-sidebar
  edits (layout, background, overlay, audio, ...), Studio undo (Ctrl/Cmd+Z) and hand edits of
  the Root were reverted;
- `unsavedPatches` was pruned against that frozen value, so it was never pruned: every value the
  panel ever wrote in the session (an old `audioFile`/`timingsFile`, an old range, old splits, a
  look's colours) was written again on every later panel save;
- `pendingPatch` was one global value, shown and acted on in whichever composition the panel was
  on;
- the panel's `memo` compared only some prop groups, so Export project, Copy description and Set
  thumbnail used an old snapshot.

### 1.2 Data that went stale when a setting changed

- line `splits` that no longer fit the range or `slice` made `calculateMetadata()` throw, and with
  it the panel (it is rendered inside the composition) disappeared;
- a new recording kept the previous passage's translation, gloss, tafsir and chapter-info files
  (a chapter-info end card then threw);
- aligning the same file again, or picking the same catalogue range again, overwrote the reviewed
  timings file (nudges, imported captions, the edit log) and reset range and splits;
- Review's Re-align and its pending nudges used composition time where the aligner and the file
  use recording time (wrong spans whenever `audioOffsetSeconds` is not 0);
- uploading a file with the same name replaced the recording the timings were made for, and the
  waveform cache kept the old one;
- "Use as audio" (a file in `public/`) swapped the audio but kept the old timings, range and splits;
- the uploaded recording, the look undo and the tabs' drafts were global or lost on a tab switch;
- frame looks (Reel, Square) overwrote hand-set positions; Undo wrote the whole snapshot back over
  later edits;
- `MushafPage` projects could not be imported; projects did not list `background.src`;
  Set thumbnail erased the thumbnail's own title.

### 1.3 The audio source was ambiguous

The Source tab stacked three sections that act differently under the same weight: the catalogue
pick downloads timings from aligner.qud.dev and an audio clip from a host named only in the
response (a Hugging Face Space), the upload only stages a file, and "Use as audio" swaps the audio
only. A failed clip download silently turned `audioFile` into a remote URL; a missing `audioFile`
silently streams the catalogue clip, in renders too. Align picked between the upload and
`audioFile` with a hidden priority.

### 1.4 The package could not be dropped into an existing template

The compositions and the panel assume they own the whole composition: saves go to the top level
of `defaultProps`, seeks use composition-absolute frames, the panel is rendered inside the
composition (so it unmounts outside a host `<Sequence>`), there is no state for "no recitation
yet", `calculateMetadata()` returns a size and a fixed 30 fps, and a template's own audio track
cannot be used.

## 2. Decisions

### 2.1 One module for Remotion internals

`src/studio/remotion-internals.ts` is the only file that touches `Internals`. Each accessor checks
that the symbol exists and falls back safely (empty object, `null`, `[]`):

- `useLiveEditorProps()`: `useContext(Internals.EditorPropsContext).props` (the live Root values
  by composition id);
- `useOwnSequenceStart()`: the absolute frame of the enclosing `<Sequence>`
  (`Internals.SequenceContext`: `absoluteFrom`, else `cumulatedFrom + relativeFrom`, else 0);
- `useTimelineSequences()`: `Internals.useSequenceManagerSequences()` (Studio-only).

A unit test pins the shapes these read, so a Remotion upgrade that changes them fails CI.

### 2.2 The save path

- The dock keeps a module-level "live props" record from `useLiveEditorProps()` on every render.
- `patchProps(target, patch)` builds the save from
  `live[compositionId] ?? savedDefaultProps`, never from `savedDefaultProps` alone, and only adds
  the **in-flight** parts of the panel's saves of that composition, every target's (every save
  writes the whole composition): what was sent and no live props have shown yet. No cumulative
  replay. Remotion 4.0.539 sends one echo per write of the Root, in write order, and a Props-sidebar
  edit first shows as a local object (`updateProps()`) built from what the sidebar showed, then as
  its echo. So a live object without a save's values is older than the save's echo until some live
  object has shown them: it is not judged, and later saves keep carrying them. Once shown, a
  live object without them is a newer write (see Restore below). What no live props have shown
  `RACE_WINDOW_MS` after the save resolved stops being carried and is offered back, judged by a
  timer when nothing new comes: no one can have chosen to drop a value never shown.
- Saves run one at a time (a promise queue), so two quick saves never start from one snapshot.
- `target` is `{compositionId, propsKey?}`. With `propsKey`, the patch is applied under
  `defaultProps[propsKey]`; when that value is `null` or missing, the base is
  `emptySlotPropsFor(kind)`: the slot defaults of the kind (2.4) with `audioFile`, `timingsFile`
  and `textFile` emptied, so the first save writes complete props and a first save that is not a
  source (a look, say) does not bring the defaults' sample recitation with it.
- Pending (optimistic) patches, uploads, look undo stacks and tab drafts are keyed by the panel's
  **target key**: `compositionId` or `compositionId/propsKey`.
- The panel compares all props (every top-level key by identity, `resolved` by signature), and
  click-time actions (export, description, thumbnail) read a "latest props" record written on
  every render outside the memo.
- `patchOtherComposition()` (thumbnail) uses the same live base and keeps the thumbnail's own
  title when the reciter is empty.
- The panel watches for its saved fields disappearing from the live props and offers **Restore**
  instead of writing silently: within `RACE_WINDOW_MS` of live props first showing a save, what
  that save wrote, when a writer that had not seen it wrote over it (a sidebar save built before
  the panel's echo: some of the fields are back at the save's old values and the object differs
  elsewhere too). The Studio's undo of the save (only its fields differ, back at their old values)
  and a value of the user's own in the field are the user's. At any time, when the live props are the page-load props again,
  what every panel save of the session wrote (the Props sidebar's JSON "Reset"; the Studio's undo
  all the way back and a checkout of the Root look the same, so the notice says what is gone, not
  why). A field the user changed since is theirs and is not offered; each value is offered once,
  and the offer stays until Restore succeeds or × is pressed.

### 2.3 Data reliability

- Splits are applied leniently while resolving: a split that does not fit the lines is dropped,
  listed in `resolved.droppedSplits`, warned about in the Studio and removable in one click in
  Lines. A render (`isRendering` or outside the Studio) still refuses them (`BAD_LINE_SPLIT`).
- `saveRecording()`:
  - never overwrites a timings file that has manual edits (`alignment.edits.length > 0`) or
    differs: it writes `<stem>-2.timings.json`, `-3`, ... and says so;
  - resets range and splits only when the recording really changed (another audio file, other
    bytes, or another recited range);
  - clears the passage files that no longer fit the new passage (translations, gloss,
    transliteration, tafsir, chapter info; `endCard.show` to `'none'` when its file goes) and
    names what it cleared.
- Review keeps pending nudges and Re-align boundaries in recording (file) time.
- Uploads never replace an existing file: a free name is chosen (`name-2.m4a`); the waveform and
  analysis caches of a rewritten path are forgotten.
- Tab drafts (Review nudges and boundaries, Align options and riwayah consent, Source and Text
  pickers) live in the store by target key and survive tab switches.
- Frame looks no longer set position fields (`verticalAlign`, `offsetY`, `marginX`,
  `translationOffsetY`); look undo is a stack per target and only reverts the fields that still
  hold the look's values.
- Projects: the page schema is used for `MushafPage` files; `background.src` is listed.

### 2.4 Drop-in slots

New exports (names follow the package's style):

```tsx
mushafRecitationSlotSchema          // mushafRecitationSchema.nullable()
defaultMushafRecitationSlotProps    // defaults with transparent backgrounds (a template paints its own)
resolveMushafRecitationSlot(props | null, {fps, abortSignal?, isRendering?})
  // → {props: MushafRecitationProps | null, durationInFrames, error: string | null}
<MushafRecitationSlot
  props={props.mushaf} propsKey="mushaf"
  from={45} left={60} top={640} width={960} height={640}
  // optional: durationInFrames, project, premountFor, name, style, panel
/>
```

and the same for `MushafAyahText` and `MushafPage` (`...AyahTextSlot`, `...PageSlot`).

- The resolver never throws in the Studio: `null` props, an empty `timingsFile`/`textFile` give
  `{props, durationInFrames: 0, error: null}`; a `MushafStudioError` gives `error` (shown in the
  panel). It rethrows when rendering. It computes durations at the host's `fps` and returns no
  size. `resolved.durationInFrames` carries the length so the slot can size its `<Sequence>`.
  The message of a failed resolution travels the same way (`resolved: {error}`, read by
  `slotErrorOf()`), so the panel shows it without the template passing anything on, and the slot
  throws it anywhere but the Studio's preview (the Studio's in-browser render included).
- The slot renders `<Sequence from durationInFrames width height style={{left, top}}>` with the
  composition inside (`panel={false}`), the doubt markers in their own `<Sequence from>` (the
  panel draws them there when it is given `frameOffset`), and the panel **beside** the Sequence,
  so the dock stays mounted on every frame of the host.
- The panel takes `propsKey`, `kind` (required when `props` is `null`), `frameOffset` (the
  absolute frame of the slot's frame 0: enclosing Sequence start + `from`) and `durationInFrames`
  (the box's length, the slot's override included; the doubt markers end there). Every seek adds
  `frameOffset`; the waveform playhead subtracts it; YouTube chapters add `frameOffset / fps`.
- With `props === null` the panel opens Source; the first source writes complete props.
- In a slot, the Look tab does not change `layout.aspect` (the box decides the size), and Set
  thumbnail does not navigate away without saying so.
- Several slots in one template show one dock with a slot picker; dock space is reference-counted.
  Two panels with one target key (two slots with one `propsKey`) list it once and dock once: the
  first mounted owns the dock, each still marks its doubts at its own start.
- The compositions take `panel?: boolean` (default `true`).
- The glow's level array records its fps (`levelsFps`) so a 60 fps host reads it correctly.

A host Root keeps the inline-literal rule: `defaultProps={{title: '...', mushaf: null}}`.

### 2.5 Audio sources

The Source tab becomes one explicit choice (a segmented control, `role="radiogroup"`), each with
one primary button whose label says what it does and one line that says what it replaces:

1. **Download from the catalogue**: "Downloads the word timings from aligner.qud.dev and the audio
   of ayahs {from}-{to} from {clipHost} into public/{dir}/. Nothing of yours is uploaded." The
   clip host is read from the response at runtime. A failed download no longer saves a remote URL
   silently: the user is told, and chooses Retry or "Stream from {clipHost}" (renders then need
   that host).
2. **Upload my recording**: copies the file into `public/` (local only); Align then uploads it to
   aligner.qud.dev, which the Align tab says before sending.
3. **A file already in public/**: "Align this file" (default; stages it for Align) or "Replace
   the audio only (keep the current timings)", with a warning that the highlight follows the old
   timings.
4. **A track in this video** (shown when the template has audio or video tracks): lists the
   host's tracks (`useTimelineSequences()`, own track excluded by its `name`); "Use this track"
   sets `audioFile` to the track's file and `hostAudio` (below), then Align or Review as usual.

A "Now:" line at the top says what the composition plays and where it came from (downloaded from
{host}, your recording, streaming {url}, the template's track), and the missing-file fallback is
shown there with a "Download into public/" button.

`hostAudio` (new optional prop group, default `{enabled: false, offsetSeconds: 0, track: ''}`,
read leniently so saved props without it keep working): when enabled the composition plays no
audio of its own (the template does), its timings are shifted by `offsetSeconds` (the second of
the file heard at the recitation's frame 0), the audio cleanup options do nothing (the template's
`<Audio>` owns volume and fades) and `memorize` repeats are refused with a clear error. The panel
recomputes the offset from the live track and offers "Update timing" when the track moved; it
never writes it on its own. Only playback rate 1 and non-looping tracks are offered. A video
track's audio is decoded in the browser and sent to the aligner as WAV.

### 2.6 Options that conflict

The schema descriptions say which option wins (they show in the Props sidebar), e.g.
`layout.background` vs `background.color`, `layout.backgroundImage` vs `background.src`,
`header` vs `overlay.title`, `highlight` vs `memorize`, `text.translations[]` vs
`translationFile`, `glossPosition` vs the gloss files, `endCard.show` vs its files, the audio
cleanup vs `hostAudio`, `fonts` vs the registered packages. The panel greys out what has no
effect in the current state (e.g. the audio cleanup under `hostAudio`).

## 3. What the implementation did differently

The decisions above hold; these are the places where the code went further than, or differs from,
the text, each for the reason given. A unit test covers each.

### 3.1 Save path and Remotion internals (2.1, 2.2)

- `StudioTarget` is `{compositionId, propsKey?, emptyProps?}`: the slot passes
  `emptySlotPropsFor(kind)` as `emptyProps`, so `studio-api.ts` needs no knowledge of the kinds.
- The race window is `RACE_WINDOW_MS` (5 s), from when live props first showed a save, or from when
  it resolved for a save no live props showed (a timer judges it then). The page-load comparison (a JSON Reset) works at any
  time, against what every panel save of the session wrote.

### 3.2 Data reliability (2.3)

- The Studio's in-browser render (the Render queue's client-side jobs) runs `calculateMetadata()`
  with `isStudio` and without `isRendering`, so it resolves leniently like the preview. The
  composition itself therefore throws `BAD_LINE_SPLIT` (`droppedSplitsError()`) whenever
  `resolved.droppedSplits` is not empty outside the Studio's preview (`useInStudio()` tells them
  apart through the context): a dropped split never leaves a finished video silently.
- The preview's dropped-splits warning is in English, like the composition's other preview
  warnings: `<StudioWarnings>` does not follow the panel's language. The Lines tab's offer to
  remove them is in both.
- `writeFile()` records every path it writes (`takenPublicPaths()`), and `freePublicPath()` and
  `timingsPathFor()` count those as taken: the Studio lists a new file only once its public-folder
  watcher has told the page, and two quick writes of one name would otherwise pick the same name.
- Saving another recording turns `hostAudio` off (it is the composition's own to play); aligning the
  followed track keeps it on.

### 3.3 Drop-in slots (2.4)

- More exports than the sketch: `emptySlotPropsFor()`, `MUSHAF_SLOT_DEFAULTS`, `slotDurationOf()`
  and `slotErrorOf()` (the slot and the panel read the length and the error the resolver left in
  `resolved`), the types `MushafSlotOptions`, `ResolvedSlot`, `ResolveSlotOptions`,
  `SlotResolutionError`, `MushafSlotKind`, and `MushafStudioPanelKind`. The slot also takes
  `initialTab`.
- The resolver catches only the package's own errors (`MushafStudioError`, `MushafError`) in the
  Studio's preview; an abort or a bug passes through.
- Two panels with one target key dock once (`dockOwnerOf()`): the first mounted owns the dock and
  the dock's notices; each marks its doubts at its own start, and ends them with its box
  (`durationInFrames`).
- Props with something to resolve (a `timingsFile`, an ayah text's `textFile`) whose `resolved`
  holds neither timings nor an error were never given to the resolver: the slot throws
  `BAD_STUDIO_PROP` naming the resolver outside the Studio's preview (`unresolvedSlotErrorOf()`),
  and the panel shows the same message, instead of an empty box in a finished video.

### 3.4 Audio sources (2.5)

- A followed `blob:` or `data:` track (a public/ file in the browser-hosted Studio has a `blob:`
  src) is matched against the Studio's static files first; one that is not a public/ file is
  copied into `public/` once and remembered for the session (`rememberTrackCopy()`), and a
  `blob:` track of the saved name maps back to that file after a reload.
- When Align works on the followed track, the live track's kind (an `<Audio>`, a `<Video>`)
  decides whether its sound is decoded to WAV, not the file's extension.
- "Play audioFile in the composition again" turns `hostAudio` off from Source.
- The app's `MushafInTemplate` mutes its own track while the slot plays its own recording, so two
  recitations never play at once; it keeps the track on the timeline, so Source still offers it.
- The compositions' own background video is named `OWN_BACKGROUND_NAME` and left out of the
  template's tracks, like their `<Audio>`.
- The track picker opens on the track followed now; an option with a negative offset says the track
  starts that many seconds after the recitation.
- When no track on the timeline plays the followed `audioFile` any more (after `TIMELINE_SETTLE_MS`
  for the timeline to register), the dock and the "Now:" line say so; the dock offers to follow the
  track of the saved name now playing another file, or to play `audioFile` again.
- Under `hostAudio`, every choice that brings another recording (Download, Align of another file,
  Replace the audio only) says before it is pressed, and again in a notice once saved, that the
  composition stops following the template's track and that the template must mute it.
- The "Now:" line names how the timings were made (catalogue, aligner) only when their `audio` is
  the file the composition plays (or the catalogue clip they name); after Replace the audio only it
  says the timings are of another recording, and Align works on the new file.
- "Align this file" in "A file already in public/" aligns the file the composition plays even when
  the catalogue timed it: staged by name, it is the user's request.
- The catalogue's clip host is asked of aligner.qud.dev (`getChapterAudioUrl()`, no audio) once a
  pick has settled, so the note names it before Download.
- Project files leave `hostAudio` out (it is the template's); an import that brings another
  `audioFile` into a composition that follows a track turns `hostAudio` off, as a new recording does.

### 3.5 Options that conflict (2.6)

- **Colour fields carry no description.** In Remotion 4.0.539 a `.describe()` on a `zColor()`
  replaces the marker the Props sidebar draws its colour picker for (`__remotion-color`), so every
  described colour field showed a text box instead. The colour fields now keep the marker (a test
  walks every composition's schema for it), what each colour does is in its doc comment, and the
  rules that concern a colour (`layout.background` is painted under `background.kind: 'color'`;
  `background.color` only fills behind an image, a video or a gradient) are in the group's and in
  `background.kind`'s descriptions.
- Descriptions start with the rule that decides (`Used only when ...`, `... wins over ...`,
  `ignored once ...`) and stay under 200 characters (the info bubble is 360 px wide); a test pins
  both. Besides the pairs above they cover `customTheme` (theme `custom` only), `legend.show` (a
  theme that colours the rules), `data` (`mirror` needs the files), `translationPosition` and
  `glossPosition` `'none'` (hidden, still read), `targetLufs` (with `normalize`), `trimSilence`
  (never into the lead-in before the first line), `fadeOutSeconds` (before the end card),
  `glow.enabled` (analyses the whole recording) and `pageView.dimOtherLines` (on top of
  `highlight.dimOthers`).
- The panel greys out what it shows of a losing option (`src/studio/inactive.ts`, `<Inactive>`):
  the Text tab's translations while `text.translationPosition` is `'none'`, its word-by-word files
  while `text.glossPosition` is `'none'`, an end-card file while `endCard.show` shows something
  else; the Look tab's page-colour chips and a note under an image, a video, a gradient or a legacy
  `layout.backgroundImage`. Greyed out, not disabled: a file can be fetched before it is shown. The
  panel shows no audio cleanup controls, so the example in 2.6 (the cleanup under `hostAudio`) is
  covered by the descriptions only (`audio` and `hostAudio` say which wins).
- Not done: the schema keys keep their order (a legacy field still comes before the option that
  replaced it), and the page and the ayah text still list the word-by-word and window fields they
  ignore (their descriptions say so). Reordering or `.omit()`ing changes the sidebar and the saved
  props' key order for every existing project; it is on the roadmap
  ([plan.md](plan.md#7-roadmap)).

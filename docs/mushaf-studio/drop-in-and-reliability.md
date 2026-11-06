# Mushaf Studio: drop-in slots, panel reliability, audio sources

Status: design for branch `claude/inspiring-sagan-wkujy0`. It follows a code investigation of
`packages/mushaf-studio` against Remotion 4.0.539 (findings with file:line references in the
session record). This page is the contract the implementation follows; where code and this page
disagree after the work lands, the code's doc comments win and this page is updated.

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
  the **in-flight** patches: the ones sent but not yet echoed back in the live props
  (`unappliedPart(live, inFlight)`), cleared by the first live props seen after the save (what
  they lack is offered back or is the user's, never kept for a later save). No cumulative replay.
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
  instead of writing silently: within `RACE_WINDOW_MS` of a save, what that save wrote (a sidebar
  save can race a panel save); at any time, when the live props are the page-load props again,
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

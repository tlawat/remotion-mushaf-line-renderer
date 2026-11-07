# @tlawat/mushaf-studio

Compositions, Zod schemas and a Studio panel for making word-synced recitation videos of the KFGQPC
V4 mushaf inside [Remotion Studio](https://www.remotion.dev/docs/studio), built on
[`@tlawat/remotion-mushaf-line`](../remotion-mushaf-line-renderer).

- **Five compositions.** `<MushafRecitation>`: the printed lines of a recited passage follow the
  audio, word by word, with ayah translations and a word gloss. `<MushafAyahText>`: the same
  recitation one ayah at a time as Unicode text, for reels. `<MushafPage>`: the whole printed page,
  the recited line marked. `<MushafPassage>`: a passage without audio, one line after the other.
  `<MushafThumbnail>`: a still for the video's thumbnail. A recitation may cross surahs.
- **Every option in the Props sidebar.** Theme, fonts, layout, animation, highlighting and text are
  Zod schemas, so the Studio shows them as typed controls, saves them to your Root file and passes
  them to the Render dialog and the CLI.
- **A Mushaf panel** docked over the preview, in the Studio only: pick a recitation from the QUD
  aligner's catalogue or align your own recording, pick a look, review the doubtful words, split
  long lines, fetch translations, export and import captions.
- **Usable without the compositions.** The QUD client, the translation loaders, the line splitting,
  the captions converters and the QUL font catalogue are plain functions.

For a ready-made project that needs no code, see [`apps/mushaf-studio`](../../apps/mushaf-studio). The
design and its roadmap are in [docs/mushaf-studio/plan.md](../../docs/mushaf-studio/plan.md).

## Contents

- [Install](#install)
- [Register the compositions](#register-the-compositions)
- [The Mushaf panel](#the-mushaf-panel)
- [Inside your own composition](#inside-your-own-composition)
- [Looks, marks and motion](#looks-marks-and-motion)
- [Props](#props)
- [Data contract](#data-contract)
- [Modules without the compositions](#modules-without-the-compositions)
- [Errors](#errors)
- [Roadmap](#roadmap)
- [Licences](#licences)

## Install

In an existing Remotion project:

```bash
npm i @tlawat/mushaf-studio @tlawat/remotion-mushaf-line @remotion/studio @remotion/zod-types @remotion/media zod
```

Remotion's packages are released together and must all be the version of `remotion` in your
project, 4.0.521 or newer: `@remotion/studio`, `@remotion/zod-types`, `@remotion/media` (the
`<Audio>` of the in-browser renderer) and `@remotion/transitions` (which the main package needs too).
If npm picks a newer one, pin it to yours:

```bash
npm i @remotion/studio@"$(npm pkg get dependencies.remotion | tr -d '"')" \
      @remotion/zod-types@"$(npm pkg get dependencies.remotion | tr -d '"')" \
      @remotion/media@"$(npm pkg get dependencies.remotion | tr -d '"')" \
      @remotion/transitions@"$(npm pkg get dependencies.remotion | tr -d '"')"
```

`zod` must be 4 or newer; React 18 or newer.

The package is ESM only (`dist/esm/index.mjs` and its `.d.mts` types): `@remotion/media` ships ESM
only, and every Remotion bundler (the Studio's webpack, Vite for a `<Player>`) reads ESM. A CommonJS
`require()` cannot load it; use `import`.

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
      audioFile: 'mushaf-studio/fatiha/audio.mp3',
      timingsFile: 'mushaf-studio/fatiha/timings.json',
      fromAyah: 0,
      toAyah: 0,
      slice: true,
      splits: [],
      header: 'none',
      theme: 'custom',
      customTheme: {
        base: 'normal',
        ink: '#1c1a16',
        silent: '#8a8478',
        rules: '#1b6f3f',
        frame: '#8c6c26',
        accent: '#efe3c4',
        detail: '#8c6c26',
        background: '#f8f3e6',
        override: {ink: false, silent: false, rules: false, frame: true, accent: true, detail: true, background: true},
      },
      fonts: 'fallback',
      data: 'mirror',
      layout: {
        aspect: '16:9',
        visibleLines: 3,
        neighbourOpacity: 0.3,
        marginX: 190,
        background: '#f8f3e6',
        color: '#1c1a16',
        backgroundImage: '',
        verticalAlign: 0.5,
        offsetY: 0,
        frame: 'none',
      },
      background: {
        kind: 'color',
        color: '#f8f3e6',
        src: '',
        fit: 'cover',
        videoSeconds: 0,
        blur: 0,
        dim: 0,
        vignette: 0,
        kenBurns: 'none',
        kenBurnsScale: 1.04,
        gradient: {from: '#14191d', to: '#0b0e10', angle: 180},
      },
      animation: {lines: 'fade', tempo: 'calm', leadInSeconds: 0.4},
      highlight: {mode: 'word', style: 'ink', color: '#b8913a', restOpacity: 0.6, occurrence: 'first'},
      memorize: {mode: 'off', repeat: 3, pauseSeconds: 0.5, revealAfterRepeats: 1},
      text: {
        translationFile: '',
        translationPosition: 'below',
        translationFont: 'auto',
        translationSize: 36,
        translationColor: '#5a554c',
        translationDirection: 'ltr',
        translationOffsetY: 0,
        glossFile: '',
        transliterationFile: '',
        glossFont: 'auto',
        glossSize: 30,
        glossColor: '#6b6458',
        translations: [],
        glossPosition: 'strip',
      },
      overlay: {
        title: 'none',
        introSeconds: 3,
        reciter: '',
        color: '#5a554c',
        font: 'auto',
        corner: 'top-right',
        cornerSize: 0,
      },
      legend: {show: false, position: 'bottom-left', orientation: 'row', names: 'both'},
      endCard: {show: 'none', seconds: 5, tafsirFile: '', chapterInfoFile: ''},
      audio: {normalize: true, targetLufs: -14, fadeInSeconds: 0.3, fadeOutSeconds: 1, trimSilence: false, volume: 1},
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
- The literal above is `defaultMushafRecitationProps` written out: the Mushaf look (ivory page,
  warm ink, gold-line rosettes, the ink filling in behind the reciter). A Root saved by an earlier
  version still renders (its props are migrated as they are read) and the panel offers to save it
  in the current shape: see [Upgrading saved props](#upgrading-saved-props). `MushafAyahText`, `MushafPage` and
  `MushafPassage` are declared the same way (`mushafAyahTextSchema`, `calculateMushafAyahTextMetadata`,
  `defaultMushafAyahTextProps`, and so on), and `MushafThumbnail` as a `<Still>`;
  [`apps/mushaf-studio/src/Root.tsx`](../../apps/mushaf-studio/src/Root.tsx) has all five.
- `width`, `height` and `durationInFrames` are placeholders: `calculateMetadata()` sets the size from
  `layout.aspect` and the duration from the timings.
- `registerMushafFonts()` runs once, at module level. Leave it out (and use `fonts: 'cdn'`) if you
  do not install the fonts packages.
- The defaults point at three things in the app's `public/` folder: the sample timings
  (`public/mushaf-studio/fatiha/timings.json`), the sample recording
  (`public/mushaf-studio/fatiha/audio.mp3`, not committed: `bun run --cwd apps/mushaf-studio sample`
  downloads it) and the mirror of QUL's data (`public/data/qpc-v4/words.json.zip` and
  `layout.db.zip`, for `data: 'mirror'`). Copy them from
  [`apps/mushaf-studio/public`](../../apps/mushaf-studio/public) into your project's `public/`, or
  pick a recitation in the panel (it writes its own audio and timings) and set `data` to `'cdn'`.
  While the recording is missing, the compositions play the clip the timings name (see
  [`audio`](#audio-mushafrecitation-mushafayahtext-mushafpage)).

## The Mushaf panel

`<MushafRecitation>`, `<MushafAyahText>` and `<MushafPage>` render `<MushafStudioPanel>` themselves
(`<MushafPassage>` has no audio, and no panel). Outside the Studio (a render, the Studio's in-browser
render, a `<Player>`, a server) the panel renders nothing and does nothing: it shows only when
`useRemotionEnvironment()` says `isStudio && !isRendering && !isClientSideRendering`. It never calls
`delayRender()` and never re-renders with the frame. In the Studio it docks beside the preview with
six tabs:

| Tab        | What it does                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **Source** | Where the audio comes from, as one choice: the QUD catalogue's reviewed recitations, a recording of your own, a file already in `public/`, or a track the template plays. A "Now:" line says what plays now. |
| **Look**   | The Format row (`MUSHAF_FORMATS`, `applyFormat()`: the frame, and the margins while they are the format's), then the five looks (`MUSHAF_LOOKS`, `applyLook()`, `lookById()`: Mushaf, Haram night, Madinah green, Tajweed, Learning), each a ground, an ink, one metal and one mark, never the content or the positions you set; the mark in one line; **Undo** goes back through the looks applied, putting back only the fields that still hold a look's values. Every tab shows the upgrade banner while the Root holds props an earlier version saved. |
| **Align**  | Uploads the recording to the [QUD Universal Aligner](https://aligner.qud.dev) with streaming progress, then fetches the word times. Says first that the audio leaves the machine. |
| **Review** | The segments and their words with confidence; click to seek; nudge a word, split a segment, re-align. Exports captions and imports them back. |
| **Lines**  | The resolved lines and their time slots; split a line at a word into two timed segments, and remove in one click the splits that no longer fit. On `<MushafPage>`, the pages. |
| **Text**   | Ayah translations and word-by-word glosses (`<MushafRecitation>` only) from quran.com, or a QUL file in `public/`; the end card's tafsir or surah introduction. What the props hide is greyed out, with the reason. |

**Where the audio comes from.** Source is one explicit choice of four, each with one button and a
line that says what it replaces:

| Choice | What its button does |
| --- | --- |
| **Download from the catalogue** | **Download into public/**: the word timings from aligner.qud.dev and the clip of the ayahs from the host the aligner's answer names (a Hugging Face Space), both into `public/mushaf-studio/<project>/`. Nothing of yours is uploaded. When the clip cannot be downloaded nothing is saved: **Retry the download**, or **Stream from {host}**, which saves the clip's URL as `audioFile` (renders then need that host). |
| **Upload my recording** | Copies the file into `public/` (it stays on this machine) and stages it for Align, which uploads it to aligner.qud.dev and says so first. The composition keeps playing what it plays until Align saves the timings. |
| **A file already in public/** | **Align this file** (the default) stages it for Align, the file the composition plays included (a catalogue clip can be aligned again this way); **Replace the audio only** sets `audioFile` and keeps the timings, with a warning that the highlight follows the old timings. |
| **A track in this video** | Shown when the template has audio or video tracks on the Studio's timeline (the composition's own `<Audio>`, named `OWN_AUDIO_NAME`, and its own background video are left out). The picker opens on the track followed now. **Use this track** sets `audioFile` to the track's file and turns `hostAudio` on with the second of it heard at the recitation's start. Only a track at speed 1 that does not loop can be followed. A `blob:` or `data:` track is written into `public/` once; using it again, or after a reload, maps it back to that file. |

Under `hostAudio`, a choice that brings another recording (a download, Align of another file,
Replace the audio only) says first that the composition stops following the template's track, and
says it again once saved: the template must then mute its track, or both play. When no track on the
timeline plays the followed file any more, the dock says so and offers **Follow the track playing
now** (a track of the saved name now playing another file) or **Play audioFile in the composition
again**.

The **Now:** line at the top says what the composition plays and where it came from (downloaded
from the clip host, timed by the aligner, streaming a URL, the template's track, checked against the
timeline), naming the origin only when the timings were made for that file: after **Replace the
audio only** it says the timings are of another recording. The catalogue's clip host is asked of
aligner.qud.dev (no audio) once a pick settles, so it is named before Download. A stream, and a
missing `audioFile` the catalogue clip stands in for, get a **Download it into public/** button.
Align works on the one recording Source staged for this composition, else on what it plays, and
says which: a catalogue recitation is not aligned again (Review adjusts it); a URL is fetched by the
browser and uploaded, or downloaded by the aligner itself (`alignUrl()`) when its host does not let
the browser read it; a video's sound is decoded in the browser and sent as WAV (`audioToWav()`): a
file of a video extension, or a template track the template plays with `<Video>` or
`<OffthreadVideo>`, a `.webm` included.
When the template's track has moved since its offset was saved, the dock offers **Update timing**;
it never writes the offset on its own.

**The riwayah guard.** The page is the Hafs print (KFGQPC V4); another riwayah can differ from it
in words and spelling. A catalogue recitation in another riwayah (`isHafsRecitation()` is false),
or Align with another riwayah picked, shows a warning, and **Download into public/** or **Align**
stays disabled until a checkbox confirms it.

The Text tab also fetches the passage's Quran text (`uthmani` or `indopak`, `fetchQuranComText()`)
into `text-<script>-<surah>-<from>-<to>.json`, and makes it the `textFile` of a `<MushafAyahText>`
whose font sets that script. On `<MushafAyahText>`, Source and Align fetch it themselves for the new
passage and save it with the timings in one `saveDefaultProps()`: the old text would lack the new
ayahs and `calculateMetadata()` would throw.

The Review tab exports the timings file's captions, timed to the audio file, as SRT
(`captionsToSrt()`), WebVTT (`captionsToVtt()`, by word or by ayah) or the `Caption[]` JSON of
`@remotion/captions` (`toCaptions()`), ayah markers optional. **Import captions…** reads that JSON
back after you edit it in a caption editor: `fromCaptions()` puts its times into the timings file,
the import is logged as a `realign` edit noted `captions import`, and the composition is
re-evaluated. A file that changes no time is not written; one with captions added or removed is
`BAD_TIMING_EDIT`.

Every change goes through the same path: write the file(s) into `public/mushaf-studio/<project>/`
(`project` defaults to the composition's id, slugified: `mushafrecitation`, `mushafayahtext`, `mushafpage`;
`writeStaticFile()`), save the composition's content props (`saveDefaultProps()`), then
`reevaluateComposition()` so `calculateMetadata()` runs again. Large data never sits in the props:
the props hold paths, and the files are fetched through `staticFile()`, so the Render dialog, the
CLI and Lambda see the same inputs.

**What a save keeps.** The panel never writes over what you did elsewhere:

- **Saves start from the Studio's live props.** In Remotion 4.0.539 the props `saveDefaultProps()`
  hands its callback are the Root as the page loaded it; the panel builds each save on the props the
  Studio shows now instead (its editor context, read in one module, `remotion-internals.ts`), adds
  only what its own saves of the composition sent and the Studio has not shown yet (quick saves all
  land, even when the Studio's echoes come late), and runs saves one at a time. A Props-sidebar
  edit, the Studio's undo or a hand edit of the Root is never put back to an old value.
- **Restore.** When the live props lose what the panel saved (a Props-sidebar edit made before the
  panel's save had come back, which writes the old values over it; the sidebar's JSON Reset or the
  Studio's undo going back to the props from when the page loaded; a save the Studio never showed
  within a few seconds), the dock names the fields and offers **Restore**; × keeps the props as they
  are. It never writes them back on its own, and a field you changed since is yours, as is the
  Studio's undo of a panel save: neither is offered.
- **Reviewed timings are never replaced.** A new alignment or catalogue download writes
  `<name>.timings.json`, or, when that file has manual edits (nudges, a captions import: its
  `alignment.edits`) or other timings, the next free `<name>-2.timings.json`, `-3`, ..., and says
  so. The range and the splits are reset only for another recording (another file, other bytes,
  another passage); then the translations, glosses, tafsir and surah introduction that do not fit
  the new passage are cleared, each named (the end card shows nothing once its file goes). An upload
  takes a free name too (`recitation-2.m4a`), so it never replaces the recording timings were made of.
- **Splits that no longer fit** the range or `slice` are left out of the preview instead of taking
  the composition (and the panel in it) down: they are listed in `resolved.droppedSplits`, the
  preview names them, and Lines removes them in one click. A render (the CLI, Lambda, the Studio's
  Render queue) still refuses them with `BAD_LINE_SPLIT`.
- **Per composition.** Each composition, and each slot of a template, has its own pending save,
  staged recording, look undo and tab drafts (Review's nudges, Align's options, the pickers); the
  drafts survive a tab switch.
- **What has no effect is greyed out.** A translation or a gloss whose position is `none`, an
  end-card file the card does not show, a look's page colour under an image, a video or a gradient:
  each is greyed out under the reason, and stays usable. The Props sidebar's descriptions say which
  of two overlapping options wins (`layout.background` and `background.color`, `translations` and
  `translationFile`, `header` and the intro card, `hostAudio` and the audio cleanup, ...).

To put the panel in a composition of your own, render it there with the composition's id and props:

```tsx
<MushafStudioPanel compositionId="MyRecitation" props={props} project="surah-yasin" />
```

The compositions render it themselves unless given `panel={false}`. To drop a composition into a
template instead, use a slot (below): it docks the panel for you.

## Inside your own composition

A template you already have (its title, its intro and outro, its own audio and schema) takes a
recitation as a **slot**: the recitation's props under one key of the template's props, a box of
the template's frame, and the Mushaf panel saving under that key only.

```tsx
import {MushafRecitationSlot, mushafRecitationSlotSchema, resolveMushafRecitationSlot} from '@tlawat/mushaf-studio';
import {AbsoluteFill, type CalculateMetadataFunction, Composition} from 'remotion';
import {z} from 'zod';

const FPS = 30;
const INTRO = 2 * FPS;
const OUTRO = 2 * FPS;

export const templateSchema = z.object({title: z.string(), mushaf: mushafRecitationSlotSchema});
type TemplateProps = z.infer<typeof templateSchema>;

export const calculateTemplateMetadata: CalculateMetadataFunction<TemplateProps> = async ({
  props,
  abortSignal,
  isRendering,
}) => {
  const mushaf = await resolveMushafRecitationSlot(props.mushaf, {fps: FPS, abortSignal, isRendering});
  return {props: {...props, mushaf: mushaf.props}, durationInFrames: INTRO + mushaf.durationInFrames + OUTRO};
};

export const Template: React.FC<TemplateProps> = ({title, mushaf}) => (
  <AbsoluteFill>
    {/* your background, your intro, your outro */}
    <MushafRecitationSlot props={mushaf} propsKey="mushaf" from={INTRO} left={60} top={640} width={960} height={640} />
  </AbsoluteFill>
);

// In the Root: defaultProps an inline literal, the slot null until a recitation is picked.
<Composition
  id="MyTemplate"
  component={Template}
  schema={templateSchema}
  calculateMetadata={calculateTemplateMetadata}
  width={1080}
  height={1920}
  fps={FPS}
  durationInFrames={1}
  defaultProps={{title: 'Al-Fatihah', mushaf: null}}
/>;
```

There is one slot per composition of the package that has a panel:

| Composition        | Schema                       | Resolver                         | Component                | Defaults                            |
| ------------------ | ---------------------------- | -------------------------------- | ------------------------ | ----------------------------------- |
| `MushafRecitation` | `mushafRecitationSlotSchema` | `resolveMushafRecitationSlot()`  | `<MushafRecitationSlot>` | `defaultMushafRecitationSlotProps`  |
| `MushafAyahText`   | `mushafAyahTextSlotSchema`   | `resolveMushafAyahTextSlot()`    | `<MushafAyahTextSlot>`   | `defaultMushafAyahTextSlotProps`    |
| `MushafPage`       | `mushafPageSlotSchema`       | `resolveMushafPageSlot()`        | `<MushafPageSlot>`       | `defaultMushafPageSlotProps`        |

**The schema and the Root.** A slot's schema is the composition's, nullable: `null` is a template
with no recitation yet. The slot then shows nothing and lasts 0 frames, the panel opens on Source,
and its first save writes complete props under the key (`emptySlotPropsFor(kind)`, the slot defaults
without the sample's files, with the change), so a look saved first does not bring the sample with
it. Or start from `defaultMushafRecitationSlotProps` (the defaults with transparent backgrounds: the
template paints its own) **written out** as a literal. Keep the template's `defaultProps` an inline
literal, as for the compositions themselves ([Register the compositions](#register-the-compositions)):
`mushaf: defaultMushafRecitationSlotProps`, an identifier or a spread renders, but the Studio cannot
save into it, and every panel save fails.

**The resolver**, in the template's `calculateMetadata()`:

- resolves at the template's `fps`: the durations, the memorisation's clips and the audio's trim
  are in the template's frames, at 30 or 60 alike;
- returns `{props, durationInFrames, error}` and no size (the box decides it); the length is also in
  `props.resolved.durationInFrames` (`slotDurationOf()`), which the slot sizes its `<Sequence>` by, so
  the end card and the fade-out end with the recitation, not with the template;
- gives 0 frames and no error for `null` props and an empty `timingsFile` (or an ayah text's empty
  `textFile`);
- never throws the package's own errors in the Studio's preview: a bad file or range gives `error`,
  also left in `resolved`
  (`slotErrorOf()`), so the panel shows it and stays on screen to fix it. When rendering
  (`isRendering`, the CLI, Lambda) it rethrows, and the slot throws the message anywhere but the
  Studio's preview, the Studio's in-browser render included.
- must run: props with a `timingsFile` that no resolver filled in (the resolver forgotten in
  `calculateMetadata()`, or its `props` not put back under the key) would leave an empty box, so the
  slot throws `BAD_STUDIO_PROP` naming the resolver anywhere but the Studio's preview, where the
  panel says the same.

**The slot component** takes the template's field as `props` and the key it lives under as
`propsKey`, and renders the composition (`panel={false}`) in a `<Sequence>` with the panel docked
**beside** it, so the dock stays on every frame of the template, the intro and the outro included:

| Option             | Default                         | What it does                                                                    |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------- |
| `props`            | (required)                      | The template's field: the composition's props, or `null`.                      |
| `propsKey`         | (required)                      | The key of the template's `defaultProps` the panel saves under.                |
| `from`             | `0`                             | The template frame the recitation starts at (the intro's length).              |
| `durationInFrames` | `resolved.durationInFrames`     | How long the box shows the recitation; the doubt markers end there too.        |
| `left`, `top`      | `0`                             | The box's corner, in template pixels.                                           |
| `width`, `height`  | the template's size             | The box's size: the composition lays itself out for it (the box decides, not `layout.aspect`). |
| `premountFor`      | none                            | Frames the box mounts early, so the fonts are in by its first frame.           |
| `name`             | `Mushaf recitation`, ...        | The box's name on the Studio's timeline.                                        |
| `style`            | none                            | More style for the box (a border radius, a clip).                               |
| `panel`            | `true`                          | Dock the Mushaf panel in the Studio.                                            |
| `project`          | `<template id>-<propsKey>`      | The panel's folder under `public/mushaf-studio/`.                               |
| `initialTab`       | Source (for `null` props)       | The tab the panel opens on.                                                     |

In a slot the panel places its seeks, waveform playhead and timeline markers at the slot's start
(inside a `<Sequence>` of the template's too), and the YouTube chapters at the video's times; Look
leaves `layout.aspect` alone; Set thumbnail saves `MushafThumbnail` without leaving the template.
Several slots in one template share one dock, with a slot picker; two slots with one `propsKey`
show one entry and dock once.

**The template's own audio.** A template that plays the recitation itself (music under it, a
voice-over, one `<Audio>` for the whole video) sets the slot's `hostAudio`: the slot plays no audio
of its own, its words follow the template's track from `hostAudio.offsetSeconds`, the `audio`
cleanup does nothing (the template's `<Audio>` owns its volume and fades), and `memorize` repeats
are refused. The panel does it for you: Source lists the template's audio and video tracks from the
Studio's timeline (**A track in this video**; the compositions' own `<Audio>` is `OWN_AUDIO_NAME`
and left out, with their own background video), **Use this track** sets `audioFile` and the offset, and **Update timing** is offered
when the track moves on the timeline. Give the template's `<Audio>` a `name`: the panel matches the
track by it (`hostAudio.track`). Only a track at speed 1 that does not loop can be followed, and a
video track's sound is sent to the aligner as WAV. Once the slot plays a recording of its own again
(a catalogue download, Align of an upload), `followsHostAudio(props)` is false: mute the template's
track then, or two recitations play at once:

```tsx
<Sequence from={INTRO} name="Template audio" layout="none">
  <Audio src={staticFile(soundtrack)} name="Template audio" muted={mushaf !== null && !followsHostAudio(mushaf)} />
</Sequence>
```

The app's `MushafInTemplate` composition ([`apps/mushaf-studio/src/MushafInTemplate.tsx`](../../apps/mushaf-studio/src/MushafInTemplate.tsx))
is a working example: a 1080×1920 reel with its own schema, title, intro, outro and track
(`soundtrack`), which the slot under `mushaf` follows.

## Looks, marks and motion

The render follows one rule: the frame is a printed mushaf leaf. The KFGQPC line is shown exactly
as printed; nothing scales, slides, bounces, wipes or blurs a glyph, and no partial word is ever on
screen. Only four things move: a line's opacity, a rise of a whole line of at most 0.12 em as it
comes in, the ink of a whole word, and a faint band behind a word. Every option below is a
finished design and every number is clamped to a dignified range, so no combination of them gives
a pale page, a neon word or a swimming background. The full design, with its values and the
reasons for them, is [docs/mushaf-studio/render-design.md](../../docs/mushaf-studio/render-design.md).

### Looks

A look is a ground, an ink, one metal and one mark (`MUSHAF_LOOKS`, `applyLook(props, look)`). It
sets style fields only: never the content (the recitation, the timings, the range, the splits, the
translation files), `layout.visibleLines`, `animation.leadInSeconds` or where you placed the lines
(`LOOK_POSITION_FIELDS`). Each look is named and described in English and in Arabic (`name`,
`nameAr`, `description`, `descriptionAr`).

| Look | Id | For | Ground, ink, metal | Mark |
| --- | --- | --- | --- | --- |
| **Mushaf** «مصحف» | `mushaf` | Recitation, ayah text, passage | Ivory `#f8f3e6`, warm ink `#1c1a16`, gold-line rosettes on vellum | Ink: the words still to come rest at 0.6 and fill in as they are heard |
| **Haram night** «ليل الحرم» | `haram-night` | Recitation, ayah text, passage | Warm ivory `#f1eadb` on charcoal `#121416`, gold `#d8b56a`, a vignette | Wash: the ayah held in a faint gold band; slow tempo |
| **Madinah green** «أخضر المدينة» | `madinah-green` | Recitation, ayah text, passage | Ivory on `#10241b`, gold `#cfae63`, the jadwal (a thin double rule) | Ink, by ayah |
| **Tajweed** «تجويد» | `tajweed` | Recitation, passage | The tajweed colours untouched on warm paper `#fbf7ee`, the legend in its band | Ink, the words to come at 0.7 |
| **Learning** «تعلّم» | `learning` | Recitation, passage | As Mushaf, the gloss under each word | Tint: each word turns antique gold (`#806321` on ivory) as it is recited |

Mushaf is the default: `defaultMushafRecitationProps` equals the Mushaf look at 16:9, and applying
it changes nothing. The frame's shape is a separate control, the **Format** (`MUSHAF_FORMATS`,
`applyFormat(props, id)`): `landscape` 16:9, `vertical` 9:16, `square` 1:1 and `portrait` 4:5. A
format sets `layout.aspect`, and `layout.marginX` and `layout.verticalAlign` only while they still
hold the previous format's recommended values, so a position you chose stays. Look and format
commute: `applyFormat(applyLook(p, look), f)` equals `applyLook(applyFormat(p, f), look)`.

```ts
import {applyFormat, applyLook, defaultMushafRecitationProps, lookById} from '@tlawat/mushaf-studio';

const reel = applyFormat(applyLook(defaultMushafRecitationProps, lookById('haram-night')!), 'vertical');
```

`lookById()` also takes the ids of the nine looks before this design and names their successor
once, with a warning: `classic`, `sepia` and `karaoke` → `mushaf`; `tajweed-light` → `tajweed`;
`night` and `black-gold` → `haram-night`; `study` → `learning`; `reel` and `square` give their
format.

### Highlight: one mark at a time

A video marks the recitation with exactly one device, `highlight.style`, and never a box, a halo,
a glow, an underline or two devices together. The mark starts at its word's time, never before it;
it eases in over 5 frames and out over 10 (the outgoing word lets go while the next comes in, so
the eye glides without the mark travelling), and after an ayah's last word it lets go 0.25 s later,
in the breath. A word shorter than 4 frames gets no mark of its own, so a fast recitation does not
flicker. Without per-word times, `mode: 'word'` follows the ayah.

| `style` | Arabic | What it does | Where |
| --- | --- | --- | --- |
| `ink` (default) | مداد | The words of the current line not yet heard rest at `restOpacity` and fill in to full ink as they are recited (over 6 frames); heard words stay full. In `mode: 'ayah'`, the ayah being recited is full and the others rest. | Every theme: it only changes opacity. |
| `tint` | تذهيب | The word's (or ayah's) ink turns the accent. The accent is corrected so it reads at 5:1 on the page (`legibleAccent()`: `#b8913a` is drawn `#806321` on ivory) and its chroma is capped, so a neon yellow becomes antique gold. The ayah-end rosette keeps its colours. | `plain` paints CSS colour; the other colour themes repaint only their ink (`inkTint`). On a tajweed theme it is **shown as a wash**: a tint would repaint the tajweed colours, which are a reading aid. |
| `wash` | ظلّ | A faint band with soft ends behind the word, or behind the ayah's run of words on each line (its rosette included): 0.10 of the accent on a light ground, 0.13 on a dark one, never user-set. | Every theme. |

`restOpacity` (0.5–0.85, default 0.6) is the ink mark's rest, and is raised to 0.65 on a tajweed
theme so the pastels never wash out. Dimming never compounds: the lines around the current one sit
at `layout.neighbourOpacity`, kept 0.2 under `restOpacity`, never at the product of the two. Lines
above and below the current one carry no tint or wash; the line being recited is the only one
marked. Memorisation decides first (hidden, ghost or shown), the ink applies to what is shown,
and a tint or a wash goes on top: `memorize`'s hiding wins over `restOpacity`. On `MushafPage`, the
page's line band (`pageView.lineHighlight: 'band'`) is the page's one mark and wins over
`highlight.style`. The Look tab says which mark is drawn, and in which shade.

### Motion

`animation` (shown as "Motion" in the panel) has three fields: `lines`, how a line or an ayah gives
way to the next (`fade`, a staggered dissolve: the outgoing line under 0.25 before the incoming one
starts, never both above 0.2, never an empty frame; `rise`, the same dissolve with the incoming line
rising at most 12 px into place, the outgoing one still; `cut`, no dissolve, the reduce-motion
path); `tempo`, `calm` or `slow` (every change 1.4× longer; the word mark keeps the voice's pace);
and `leadInSeconds` (0–2), the longest a new line waits, settled, before its first word.

| Change | Calm | Slow |
| --- | --- | --- |
| One line at a time (`visibleLines: 0`): the line dissolve | 0.67 s | 0.93 s |
| The window scrolls one line box (on an in-out curve, no lurch, no overshoot) | 0.8 s | 1.13 s |
| The window's (or the first line's) first appearance | 0.8 s | 1.13 s |
| `MushafAyahText`'s ayah dissolve | 0.9 s | 1.27 s |
| The translation's dissolve at an ayah boundary | 0.6 s | 0.83 s |
| After the last word: the lines hold, then fade | 1.5 s + 1 s | 1.5 s + 1.4 s |

Then the end card, if any, dissolves in on the same ground. The window's lines never fade on their
own: the whole window scrolls, and `lines` shapes only its entrance and exit (a jump under `cut`).
The page turn of `MushafPage` is the same dissolve over `pageView.turnSeconds` (or a cut).

### Timing: late, never early

No line, scroll, translation, page or ayah changes before the reciter has finished the last word
on it. For each boundary, with `E` the end of the outgoing unit's last word (an ayah's end when the
unit ends on one) and `F` the start of the incoming unit's first word, the change starts at
`max(E, F − leadInSeconds − D)`, `D` its duration, which a short pause shortens to `F − E` but never
under 0.33 s. With a pause, the new line is settled `leadInSeconds` before its first word. With
continuous recitation (hadr), the change takes 0.33 s and overlaps the new line's first word: the
incoming text is at half its ink by its sixth frame. A change may be late; it is never early
(`boundaryStart()`). A change that would start before the previous one is over waits for it.

### Intro delay and `resolved.introDelaySeconds`

With `overlay.title` `intro` or `both`, the intro card has its whole `introSeconds`: in
`MushafRecitation` (and its slot) the recording starts `resolved.introDelaySeconds` later, the
video grows by as much, and the lines come in after the card. The delay is `introSeconds` + the
card's entrance (0.8 s, 1.13 s slow) + the spacing of the surah's header lines before ayah 1 (when
`header` puts any) + `leadInSeconds`, less the time the recording already waits before its first
word, never negative (`introDelaySeconds()`; 3.869 s for the sample with a 3 s card). A host that
plays the video next to something synced to the recording (a transcript, a player of its own, the
Laravel side) maps a video second to the recording's with it:

```ts
const recordingSeconds = videoSeconds - (resolved.introDelaySeconds ?? 0) + resolved.audioOffsetSeconds;
```

Under `hostAudio` nothing is delayed: the template's track decides when the recording is heard,
and the card covers the start in the page colour. `MushafAyahText` and `MushafPage` keep their card
over the start, until 0.3 s before the first word; `MushafPassage` starts its lines after it.

### Backgrounds: what to use

The Quran is the only large, centred, full-ink element of the frame; the background must not
compete with it. Use abstract textures, sky, water or a landscape, quiet and out of focus. Avoid
people, faces or animals in focus, anything underfoot (floors, roads, carpets) and busy, bright or
flashing footage. Do not put music or sound effects under the recitation. The options keep it calm
by construction: an image or a video is always dimmed (black at 0.45 or more under light ink, a
veil of the page at 0.55 or more under dark ink), the slow zoom is at most 1.05 over the whole
video, nothing pans, and nothing follows the audio's loudness. See [`background`](#background).

### Upgrading saved props

Props saved by an earlier version (a Root, a project file, a JSON payload a host sends) keep
working: `migrateMushafProps()` runs first in every `calculateMetadata()` and slot resolver, so the
CLI, Lambda and a host's renders, which Remotion does not validate, render the current design. A
value that is still valid is never replaced by a new default; values change only when the option
was removed (mapped to its nearest equivalent), a number is outside its new range (clamped), a font
is the old default stack that was never loaded (`'auto'`), or a value never showed (the gradient
when the kind is not a gradient). The main mappings:

| Before | Now |
| --- | --- |
| `highlight.dimOthers` under 1 with `dimUpcomingOnly` (or with `style: 'none'`) | `style: 'ink'`, `restOpacity` the old dimming rounded to 0.05, within 0.5–0.85 |
| `highlight.style` `color` or `glow` | `tint` |
| `highlight.style` `marker` | `wash` (any dimming dropped: one device) |
| `highlight.style` `none` without dimming | `mode: 'none'` |
| `highlight.color` `#ffd166` (the Karaoke yellow) | `#b8913a`; any other colour is kept, and corrected when drawn |
| `animation.enter` (or `exit`) `slide-fade` / `fade` / `reveal-rtl` / `none` | `lines` `rise` / `fade` / `fade` / `cut`; `scroll` dropped, `tempo: 'calm'` |
| `background.kenBurns` `pan-left` / `pan-right` | `slow-zoom`, `kenBurnsScale` within 1–1.05 |
| `background.glow.enabled` | `vignette` 0.15 or more; `glow` dropped |
| `pageView` `underline` / `ornate` / `slide` | `band` / `simple` / `fade` |
| `text.translationFont`, `text.glossFont`, `overlay.font`: the old default stacks | `'auto'` (EB Garamond, loaded) |
| `layout.neighbourOpacity`, `animation.leadInSeconds`, `overlay.introSeconds` | clamped to 0.15–0.5, 0–2, 2–6 |

`describeMushafMigration(props)` lists every change (`{path, from, to, reason}`) and
`mushafPropsNeedMigration(props)` says whether there is any. In the Studio, the Props sidebar
validates the Root as it is, so an old Root shows errors on the changed fields until it is
upgraded; the preview renders the migrated props meanwhile. Every tab of the Mushaf panel then shows
a banner: **What changes** lists the changes, **Upgrade** saves the migrated props, and **Upgrade
and apply the Mushaf look** also applies the Mushaf look and the format's positions. The
[CHANGELOG](./CHANGELOG.md) lists what looks different afterwards (durations included: the intro
delay and the end hold make most videos longer).

## Props

The schemas' descriptions are what the Props sidebar shows, in the info bubble beside each field's
name; where two options overlap, the description says which one wins. A colour field has none: in
Remotion 4.0.539 a description replaces `zColor()`'s marker and the sidebar then shows a text box
instead of the colour picker, so colours are explained in their group's description. The defaults are
`defaultMushafRecitationProps`, `defaultMushafAyahTextProps`, `defaultMushafPageProps` and
`defaultMushafPassageProps` (and `defaultMushafThumbnailProps` for the `MushafThumbnail` still). The content props (the first table)
are what the panel sets; the groups below are style, set in the sidebar.

### `MushafRecitation`

| Prop          | Type                        | Default                       | Description                                                  |
| ------------- | --------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `audioFile`   | string                      | `'mushaf-studio/fatiha/audio.mp3'` | Audio: a path in `public/` or an https URL. A `public/` path the server answers 404 for plays the clip the timings name instead (`resolved.audioSrc`), with a warning in the Studio. |
| `timingsFile` | string                      | `'mushaf-studio/fatiha/timings.json'` | Timings JSON in `public/`, version 1 or 2 (see [Data contract](#data-contract)). |
| `fromAyah`    | 0–286                       | `0`                           | First ayah to show (0: as the timings say). Timings across surahs are used whole. |
| `toAyah`      | 0–286                       | `0`                           | Last ayah to show (0: as the timings say). Timings across surahs are used whole. |
| `slice`       | boolean                     | `true`                        | Hide the neighbours' words on the first and last lines.      |
| `splits`      | `{page, line, atWordId}[]`  | `[]`                          | Printed lines split into two timed segments; `atWordId` is the `MushafWord.wordId` that starts the second. |
| `header`      | `'none'`, `'name'`, `'name-basmalah'` | `'none'`            | When the recitation starts at ayah 1: the surah's header lines before it (see [`header`](#header-mushafrecitation-and-mushafpassage)). Across surahs, each later surah's header lines come between the two surahs as printed, whatever this says. |
| `theme`       | `'plain'`, `'light'`, `'dark'`, `'sepia'`, `'black'`, `'normal'`, `'p1'`–`'p5'`, `'custom'` | `'custom'` | Colour theme of the mushaf line; `'custom'` uses `customTheme` (by default the Mushaf look's gold-line rosettes on vellum). The panel groups them as Mushaf (`custom`), Tajweed (`light`, `dark`, `sepia`) and Advanced (the rest). |
| `customTheme` | object                      | see below                     | A preset and a colour per part.                              |
| `fonts`       | `'fallback'`, `'cdn'`, `'package'` | `'fallback'`           | Where the page fonts come from: QUL's CDN with the registered fonts packages as fallback, the CDN only, or the packages only (the surah and juz name fonts from `public/fonts/`). Without `registerMushafFonts()` every mode uses the CDN, with a Studio warning. |
| `data`        | `'mirror'`, `'cdn'`         | `'mirror'`                    | The mushaf data: the mirror in `public/data/qpc-v4/` through `staticFile()`, or QUL's exports on Tarteel's CDN. |
| `layout`, `background`, `animation`, `highlight`, `memorize`, `text`, `overlay`, `legend`, `endCard`, `audio`, `review` | objects | see below | The style groups (see also [Looks, marks and motion](#looks-marks-and-motion)). |
| `resolved`    | `ResolvedRecitation \| null` | `null`                       | Filled by `calculateMetadata()`: the timings, the lines (splits applied), the schedule, the translations, the gloss, the doubtful words, the audio's analysis (`audio`, `audioWarning`), the URL to play instead of a missing `audioFile` (`audioSrc`), the end card's content. Leave it `null`. |

### `MushafPassage`

| Prop          | Type      | Default    | Description                                    |
| ------------- | --------- | ---------- | ---------------------------------------------- |
| `surah`       | 1–114     | `9`        | Surah.                                         |
| `fromAyah`    | 1–286     | `1`        | First ayah.                                    |
| `toAyah`      | 0–286     | `5`        | Last ayah (0: to the end of the surah).        |
| `slice`       | boolean   | `true`     | Hide the neighbours' words on the first and last lines. |
| `holdSeconds` | 0.5–30    | `4`        | Seconds each line stays.                       |
| `header`      | `'none'`, `'name'`, `'name-basmalah'` | `'none'` | When `fromAyah` is 1: the surah's header lines first. |
| `theme`, `customTheme`, `fonts`, `data`, `layout`, `background`, `animation`, `text`, `overlay` | | as for `MushafRecitation` | As above. |
| `resolved`    |           | `null`     | Filled by `calculateMetadata()`.               |

Every change of a passage runs at the incoming line's hold start, as nothing is heard to wait for:
the lines (or the window) appear over 0.8 s, give way by the line dissolve, and fade over 1 s after
the last hold (1.4 s slow, none under `cut`; the video grows by it, `passageEndFade()`). The
translation and the corner number dissolve to the next ayah from the same frame
(`passageAyahChanges()`), and come and go with the lines.

### `MushafAyahText`

One ayah at a time as Unicode text in QUL's Uthmani Hafs font (the framing of reels and short
clips), with `MushafRecitation`'s audio, timings, range, highlighting and translation block. The
defaults are `defaultMushafAyahTextProps` (a 9:16 reel, light text on a dark page).

| Prop          | Type                | Default                              | Description                                                                 |
| ------------- | ------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `audioFile`, `timingsFile`, `fromAyah`, `toAyah` | | as for `MushafRecitation` | The recording, its timings and the ayah range.                              |
| `textFile`    | string              | `'mushaf-studio/fatiha/text-uthmani.json'` | The Quran text in `public/`: an `AyahWords` file (`serialiseAyahWords()`), fetched once from quran.com by `fetchQuranComText()` or the panel's Text tab, never during a render. |
| `font`        | `'uthmani-hafs'`    | `'uthmani-hafs'`                     | The Unicode Quran font, from QUL's CDN (`UNICODE_FONTS`).                   |
| `fontSize`    | 40–200              | `96`                                 | Size of the Arabic text in px.                                              |
| `lineHeight`  | 1–2.5               | `1.9`                                | Line height in multiples of the size.                                       |
| `layout`      | object              | `aspect: '9:16'`, `marginX: 90`, ink `#f1eadb` on charcoal `#121416` | As for `MushafRecitation`; `visibleLines` and `neighbourOpacity` do not apply. The ayah is a balanced block 78 % of the frame wide, its words 0.1 em apart. |
| `animation`   | `{lines, tempo, leadInSeconds}` | fade, calm, 0.4 s         | How each ayah gives way to the next, after its last word (a 0.9 s dissolve, 1.27 s slow). |
| `highlight`, `text` | objects       | as for `MushafRecitation`, `translationColor: '#b9b1a2'`, `translationSize: 40` | The word-by-word fields of `text` do not apply. A tint is always CSS colour and a wash is drawn on each word; `mode: 'ayah'` marks nothing (the ayah on screen is the ayah heard). The translation is centred under the ayah, at most half its size. |
| `memorize`    | object              | as for `MushafRecitation`            | See [`memorize`](#memorize-mushafrecitation-mushafayahtext); here `'first-letters'` shows each upcoming word's first letter. |
| `overlay`     | object              | as for `MushafRecitation`, `color: '#f4efe6'` | The title card and corner label, in the dark page's ink.              |
| `background`  | object              | as for `MushafRecitation`, `color: '#121416'` | Behind the ayah; see [`background`](#background).                     |
| `endCard`, `audio` | objects        | as for `MushafRecitation`            | See [`endCard`](#endcard) and [`audio`](#audio).                            |
| `resolved`    |                     | `null`                               | Filled by `calculateMetadata()`; `audioOffsetSeconds` is set when `audio.trimSilence` skipped a silence. |

### `MushafPage`

The whole printed page the recitation is on, followed line by line: every line in its place, the
line being recited marked, the page turning to the next one just before its first word. The same
recitation props as `MushafRecitation`; the defaults are `defaultMushafPageProps`.

| Prop          | Type      | Default                   | Description                                                            |
| ------------- | --------- | ------------------------- | ---------------------------------------------------------------------- |
| `audioFile`, `timingsFile`, `fromAyah`, `toAyah`, `theme`, `customTheme`, `fonts`, `data` | | as for `MushafRecitation` | The recording, its timings, the range and the page's look. |
| `layout`      | object    | as for `MushafRecitation` | The frame, the colours and the side margins; the page is centred, so the lines' window fields do not apply. |
| `background`  | object    | as for `MushafRecitation` | Around the page; see [`background`](#background).                      |
| `highlight`, `review` | objects | as for `MushafRecitation` | The word being heard, and the Studio's doubt marks.                 |
| `pageView`    | `{lineHighlight, lineHighlightColor, dimOtherLines, frame, pageNumber, turn, turnSeconds}` | a gold band, no dimming, a simple frame, the page number, a 0.9 s dissolve | The page: the current line's mark (`'band'`, a faint band that cross-fades from line to line and wins over `highlight.style` on the page, or `'none'`), the other lines' opacity (0.5–1), the border (`'simple'`: a double rule in the rosettes' gold, or `'none'`), the number (Amiri, 60 % ink), and the turn after the page's last word (`'fade'` over `turnSeconds`, 0.6–1.5, or `'cut'`). The page fills 92 % of a wide frame's height (84 % of a tall one's width). |
| `text`        | object    | `translationPosition: 'auto'` | `text`'s translation fields; `translationPosition` is `'auto'` (the room under the page when it holds three lines of translation, else the gutter beside it), `'beside'`, `'below'` or `'none'`. The word-by-word fields do not apply. |
| `legend`, `endCard`, `audio` | objects | as for `MushafRecitation` | See below.                                             |
| `resolved`    |           | `null`                    | Filled by `calculateMetadata()`.                                       |

### `customTheme`

| Field        | Type    | Default        | Description                                          |
| ------------ | ------- | -------------- | ---------------------------------------------------- |
| `base`       | a preset (`'light'` … `'p5'`) | `'normal'` | Preset to start from.                     |
| `ink`        | colour  | `'#1c1a16'`    | The letters.                                         |
| `silent`     | colour  | `'#8a8478'`    | Letters written but not pronounced.                  |
| `rules`      | colour  | `'#1b6f3f'`    | The seven tajweed rule colours (one colour for all). |
| `frame`      | colour  | `'#8c6c26'`    | The ayah-end rosette's outline and its number: gold line. |
| `accent`     | colour  | `'#efe3c4'`    | The rosette's petals: vellum, a shade off the page.  |
| `detail`     | colour  | `'#8c6c26'`    | The jewel at the top of the rosette.                 |
| `background` | colour  | `'#f8f3e6'`    | The disc behind the ayah number: the page.           |
| `override`   | `{ink, silent, rules, frame, accent, detail, background}` booleans | `frame`, `accent`, `detail` and `background` on | Which parts the colours above override; the others keep the preset's colours. So every rosette is a gold line drawing, never a solid coin or the preset's pink and mint. |

### `layout`

| Field              | Type                                 | Default     | Description                                                         |
| ------------------ | ------------------------------------ | ----------- | ------------------------------------------------------------------- |
| `aspect`           | `'16:9'`, `'9:16'`, `'1:1'`, `'4:5'` | `'16:9'`    | Frame shape: 1920×1080, 1080×1920 (reels), 1080×1080, 1080×1350.    |
| `visibleLines`     | 0–7                                  | `3`         | Lines on screen at once (0: one line, replaced in place by a dissolve). |
| `neighbourOpacity` | 0.15–0.5                             | `0.3`       | Opacity of the lines around the current one (under the ink mark, kept 0.2 under `highlight.restOpacity`). |
| `marginX`          | 0–400 px                             | `190`       | Side margins, at the composition's width (about 10 % of the width reads best at 16:9; 90 at the other formats). |
| `background`       | colour                               | `'#f8f3e6'` | Page colour: what `background.kind: 'color'` paints, and the colour of the title card, the counter and the end card. |
| `color`            | colour                               | `'#1c1a16'` | Ink colour (the plain theme, and every part a theme paints in `currentColor`). |
| `backgroundImage`  | string                               | `''`        | Kept for files saved before `background`: with `background.kind` `'color'` it is painted over the page colour as before, and an `'image'` with no `src` takes it. |
| `verticalAlign`    | 0–1, step 0.01                       | `0.5`       | Vertical position of the lines (0 top, 1 bottom).                   |
| `offsetY`          | −800–800 px                          | `0`         | Move the lines up (negative) or down from there.                    |
| `frame`            | `'none'`, `'hairline'`               | `'none'`    | `'hairline'`: the jadwal, a thin gold double rule at the safe area, as on a printed page. |

### `animation`

How lines give way, shown as "Motion" in the panel (see [Motion](#motion) and
[Timing: late, never early](#timing-late-never-early)).

| Field           | Type                          | Default  | Description                                     |
| --------------- | ----------------------------- | -------- | ----------------------------------------------- |
| `lines`         | `'fade'`, `'rise'`, `'cut'`   | `'fade'` | How a line or an ayah gives way to the next, always after its last word: a dissolve, a dissolve with a slight rise, or a cut. |
| `tempo`         | `'calm'`, `'slow'`            | `'calm'` | Pace of every change: calm, or slow (1.4× longer). The word mark keeps its pace. |
| `leadInSeconds` | 0–2, step 0.1                 | `0.4`    | Longest a new line waits, settled, before its first word (it never comes before the last line ends). |

### `highlight` (`MushafRecitation`, `MushafAyahText`, `MushafPage`)

One mark at a time (see [Highlight: one mark at a time](#highlight-one-mark-at-a-time)).

| Field         | Type                          | Default     | Description                                                     |
| ------------- | ----------------------------- | ----------- | --------------------------------------------------------------- |
| `mode`        | `'word'`, `'ayah'`, `'none'`  | `'word'`    | What follows the recitation: each word, the whole ayah, or nothing. Word falls back to ayah when the timings have no word times. |
| `style`       | `'ink'`, `'tint'`, `'wash'`   | `'ink'`     | The one mark: ink (the text still to come rests lighter), tint (the ink turns the accent; a wash on tajweed themes) or wash (a faint band behind). Ignored when `mode` is `'none'`. |
| `color`       | colour                        | `'#b8913a'` | The accent of tint and wash. A tint is darkened or lightened until it reads at 5:1 on the page, its chroma capped; a wash paints it at a fixed faint strength. Ignored by ink. |
| `restOpacity` | 0.5–0.85, step 0.05           | `0.6`       | Ink only: the opacity of the words not yet heard on the current line (at least 0.65 on tajweed themes). |
| `occurrence`  | `'first'`, `'last'`           | `'first'`   | For a repeated word: follow its first or its last recitation.   |

### `memorize` (`MushafRecitation`, `MushafAyahText`)

Memorisation (hifz). Every mode but `'off'` plays each ayah `repeat` times before the next,
`pauseSeconds` apart, with a "2/3" counter in a corner; the duration grows to match. The blank modes
hide words on the first `revealAfterRepeats` plays. The interlinear glosses follow their words: a
hidden word's gloss is hidden too (its place kept), a faint word's gloss is faint
(`glossVisibilityFrom()`).

| Field                | Type                                                                     | Default | Description                                                |
| -------------------- | ------------------------------------------------------------------------ | ------- | ---------------------------------------------------------- |
| `mode`               | `'off'`, `'first-letters'`, `'blank-upcoming'`, `'blank-all'`, `'repeat'` | `'off'` | `'blank-upcoming'` hides the words still to come; `'blank-all'` every word but the active one and those already recited in this play; `'first-letters'` shows an upcoming word's first letter and a tatweel over the word, which keeps its place (Unicode text only: on the printed lines it is `'blank-upcoming'` with a faint outline, opacity 0.12); `'repeat'` repeats without hiding. |
| `repeat`             | 1–10                                                                     | `3`     | Plays of each ayah before the next.                        |
| `pauseSeconds`       | 0–5                                                                      | `0.5`   | Seconds of silence between two plays of an ayah.           |
| `revealAfterRepeats` | 1–10                                                                     | `1`     | Plays that hide the text; the later ones show it.          |

### `text`

| Field                  | Type                          | Default       | Description                                                  |
| ---------------------- | ----------------------------- | ------------- | ------------------------------------------------------------ |
| `translationFile`      | string                        | `''`          | Ayah translation file in `public/` (empty: none). Kept for files saved before `translations`: the one translation, set with the `translation*` fields below, while `translations` is empty; ignored once it is not. |
| `translationPosition`  | `'below'`, `'above'`, `'none'` | `'below'`    | Where the ayah translation goes; `'none'` hides it (its files are still read, so a bad path still fails). |
| `translationFont`      | `'auto'` or a CSS font family | `'auto'`      | The single translation's font: `'auto'` is EB Garamond 500 for Latin scripts (loaded), the language's own font otherwise; ignored once `translations` has a layer. |
| `translationSize`      | 12–120 px                     | `36`          | The single translation's size, never drawn larger than half the Arabic (36 px stays 36 at 16:9 and is drawn 26 at 9:16); ignored once `translations` has a layer. |
| `translationColor`     | colour                        | `'#5a554c'`   | The single translation's colour (a muted ink under 4.5:1 on the page); ignored once `translations` has a layer. |
| `translationDirection` | `'ltr'`, `'rtl'`              | `'ltr'`       | The single translation's writing direction (layers follow their language). |
| `translationOffsetY`   | −800–800 px                   | `0`           | Move the translation up (negative) or down from its place.   |
| `glossFile`            | string                        | `''`          | `MushafRecitation` only: word-by-word translation file in `public/` (empty: none). Read whatever `glossPosition` says; `'none'` hides it. |
| `transliterationFile`  | string                        | `''`          | `MushafRecitation` only: word-by-word transliteration file in `public/` (empty: none), as `glossFile`. |
| `glossFont`            | `'auto'` or a CSS font family | `'auto'`      | Font of the gloss: `'auto'` is EB Garamond italic.           |
| `glossSize`            | 12–120 px                     | `30`          | Gloss size (interlinear: at most 0.3 of the Arabic).         |
| `glossColor`           | colour                        | `'#6b6458'`   | Gloss colour; the gloss of the word being recited turns the highlight's accent. |
| `glossPosition`        | `'strip'`, `'interlinear'`, `'none'` | `'strip'` | `MushafRecitation` only: the gloss in a strip at the bottom, under each printed word (`<InterlinearGlosses>`, capped to 0.3 of the line's type size, shrunk to fit its word), or nowhere. |
| `translations`         | up to 3 `{file, font, fontSize, color}` | `[]` | Once it has a layer (even one with an empty `file`), `translationFile` and the `translation*` type fields above are ignored. Translations stacked under each other, a thin rule between them (`<TranslationStack>`); layers with an empty `file` are skipped. `font: 'auto'` loads the web font of the file's language from Google Fonts (`fontFamilyForLanguage()`: EB Garamond for Latin scripts, Noto Naskh Arabic, Noto Nastaliq Urdu, Vazirmatn, the Noto Sans of each Indic script, Noto Sans SC/JP/KR with only the characters shown); any other value is a CSS font family (a family `SCRIPT_FONTS` lists is loaded the same way). The direction follows the language (`directionOfLanguage()`). Every translation is cut to the ayahs shown in `calculateMetadata()`. |

### `overlay`

A title over the video, in all three compositions (`overlaySchema`, `defaultOverlay`; the
components are `<MushafTitleOverlay>`, `<MushafTitleCard>` and `<MushafCornerLabel>`, pure in their
props and the frame). The intro card is drawn on the ground: frame 0 is the bare page, then the
surah's name in its printed frame (`<MushafSurahName surah framed>`, with the composition's
`fonts`), a gold hairline with a lozenge, the range in Amiri («الآيات ٢–٧», the first ayah
rightmost) and in small caps ("Ayat 2–7": EB Garamond sets the macron of a capital Ā beside its
letter, so the small caps go without, `smallCapsLabel()`), the reciter in italic and the translation's credit
("Translation of the meanings · Saheeh International") come in from 0.2 s and go by
`introSeconds`.

**The intro card adds its time.** In `MushafRecitation`'s `calculateMetadata()`, the recording
starts `resolved.introDelaySeconds` later: `introSeconds` + the card's entrance (0.8 s, 1.13 s
slow) + the header lines' spacing (when `header` puts any before ayah 1) + `leadInSeconds`, less
what the recording already has before its first word, never negative (`introDelaySeconds()`). The timings, the schedule and the clips move by it, the audio
starts there and the video grows by it; the lines come in after the card. A host that syncs to the
video maps its time to the recording's with it: recording = video − `introDelaySeconds` +
`audioOffsetSeconds`. Under `hostAudio` nothing is delayed (the template's track decides).
`MushafPassage`, with no audio, starts its lines after the card (`passageTimeline()`);
`MushafAyahText` and `MushafPage` keep the card over their start, covering the text in the page
colour, until it goes 0.3 s before the first word. The corner label reads "AL-FATIHAH · 3" in small
caps: the surah and the number of the ayah on screen, which changes by a short dissolve after the
ayah's last word. It comes in 0.4 s after the card (0.5 s into the video without one).

| Field          | Type                                                     | Default                         | Description                                               |
| -------------- | -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| `title`        | `'none'`, `'intro'`, `'corner'`, `'both'`                | `'none'`                        | No title, the intro card, the corner label, or both. The intro card names the surah: with `header` on too, the name shows twice at the start. |
| `introSeconds` | 2–6                                                      | `3`                             | Seconds the intro card stays; the recitation starts after it. |
| `reciter`      | string                                                   | `''`                            | The reciter's name, on the intro card (empty: none). The panel does not fill it: type it in the Props sidebar. |
| `color`        | colour                                                   | `'#5a554c'`                     | Colour of the title texts and the surah name.             |
| `font`         | `'auto'` or a CSS font family                            | `'auto'`                        | `'auto'`: EB Garamond small caps, Amiri for Arabic (loaded by `useStudioFonts()`). |
| `corner`       | `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'` | `'top-right'`             | Corner of the label, inside the safe area (at 9:16 clear of the platform's bands). |
| `cornerSize`   | 0–60 px                                                  | `0`                             | Size of the label; 0 follows the frame (2.4 % of its height). |

The transliterated names are `SURAH_NAMES` / `surahEnglishName()`.

### `background`

Behind everything, in all four compositions (`backgroundSchema`, `defaultBackground`, painted by
`<MushafBackground>`). `layout.background` stays the page colour: the `'color'` kind paints it, and
`background.color` only fills what an image, a video or a gradient leaves (`backgroundFor()`).
Nothing in it follows the audio.

| Field           | Type                                          | Default      | Description                                                       |
| --------------- | --------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| `kind`          | `'color'`, `'image'`, `'video'`, `'gradient'` | `'color'`    | What is painted.                                                  |
| `color`         | colour                                        | `'#f8f3e6'`  | Behind an image, a video (the bars of `contain`) or a gradient.   |
| `src`           | string                                        | `''`         | Image or video: a path in `public/` or a URL (an empty image falls back to `layout.backgroundImage`). |
| `fit`           | `'cover'`, `'contain'`                        | `'cover'`    | Fill the frame (cropped) or fit inside it.                        |
| `videoSeconds`  | 0–3600                                        | `0`          | The video's length, for a frame-exact loop; 0: `calculateMetadata()` probes it (`probeVideoSeconds()`), else the browser loops it. Always muted. |
| `blur`          | 0–40 px                                       | `0`          | Blur of the image or video.                                       |
| `dim`           | 0–1                                           | `0`          | A darkening layer. An image or a video keeps a floor (`dimLayer()`): black at 0.45 or more under light ink, a veil of the page colour at 0.55 or more under dark ink. |
| `vignette`      | 0–0.4                                         | `0`          | Darkening toward the edges, like the fall-off of a page: black on a dark ground, a deeper shade of the page on a light one, dithered by a fixed noise so it never bands. |
| `kenBurns`      | `'none'`, `'slow-zoom'`                       | `'none'`     | Image or video: a very slow zoom over the whole video, eased.     |
| `kenBurnsScale` | 1–1.05                                        | `1.04`       | The zoom at the end of `slow-zoom`.                               |
| `gradient`      | `{from, to, angle}`                           | `#14191d` → `#0b0e10`, 180° | The gradient's colours and direction.               |

`layout.frame: 'hairline'` draws the jadwal over the background: two thin rules in the rosettes'
gold at the safe area (`<Jadwal>`). The corner label, the repetition counter and the legend then
sit inside its inner rule (`frameGeometry(width, height, {jadwal: true})`). On `MushafPage` the
page's own border (`pageView.frame: 'simple'`) is its jadwal, so only one is drawn; with the page
border off the page is fitted inside the jadwal.

What to put behind the recitation, and what not to: [Backgrounds: what to use](#backgrounds-what-to-use).

### `audio` (`MushafRecitation`, `MushafAyahText`, `MushafPage`)

The recitation cleaned up on its way out. `calculateMetadata()` first checks that `audioFile` is
there: a `public/` path the server answers 404 for, with timings that name their catalogue clip
(`alignment.recitation.audioUrl`), plays that clip instead (`resolved.audioSrc`), and the Studio
shows a warning that names the missing file and the fix. It then analyses the recording (`analyzeAudio()`, browser Web Audio) only
when `normalize` or `trimSilence` is on (nothing on screen follows the level), and keeps the result
in `resolved.audio` (`{gain, trimSeconds, levels}`; `levels` is always `[]`, kept so `resolved`
objects saved earlier read the same). Whenever the timings carry their `alignment.audio` summary, it
stands in for the analysis and nothing is downloaded. When the analysis fails (`AUDIO_ANALYSIS_FAILED`:
no Web Audio, a file the browser cannot fetch or decode) the audio plays as it is, and the reason is
in `resolved.audioWarning`, shown as a one-line banner in the Studio only. The `<Audio>` gets
`volume={(f) => volumeAt(f, curve)}`; under memorisation every clip gets the same gain, and the
fades are the composition's (at its very start, and to the frame where the end card begins). Under
the in-browser web renderer (`renderMediaOnWeb()`) the compositions use `@remotion/media`'s
`<Audio>`, `remotion`'s otherwise.

| Field            | Type         | Default | Description                                                                 |
| ---------------- | ------------ | ------- | --------------------------------------------------------------------------- |
| `normalize`      | boolean      | `true`  | Bring the recitation to `targetLufs`, its true peak kept under −1 dBFS (`gainFor()`). |
| `targetLufs`     | −23 to −9    | `-14`   | Only with `normalize`: target loudness (−14: YouTube and social media, −23: broadcast). |
| `fadeInSeconds`  | 0–5          | `0.3`   | Fade in from the first frame.                                               |
| `fadeOutSeconds` | 0–5          | `1`     | Fade out to the end of the recitation (before any end card).                |
| `trimSilence`    | boolean      | `false` | Skip the silence before the first word (`silenceTrimSeconds()`), never past the first line's entrance: it is added to `audioOffsetSeconds` and the timings move with it. |
| `volume`         | 0–2          | `1`     | On top of the normalisation gain.                                           |

### `hostAudio` (`MushafRecitation`, `MushafAyahText`, `MushafPage`)

The template plays the audio, and the composition follows it: a template with its own `<Audio>`
track (in a slot, or around the composition). Optional, and read leniently (`hostAudioOf()`), so
props saved before it keep working; the defaults have it off. When `enabled`, the composition plays
no `<Audio>` of its own, its timings start at `offsetSeconds` of `audioFile` (the second of the
template's track heard at the composition's frame 0; negative when the track starts later), the `audio` cleanup does nothing (the template's `<Audio>`
owns its volume and fades; no catalogue clip stands in for a missing file), and a `memorize` repeat
is refused with `BAD_STUDIO_PROP` (the track plays straight through). The Mushaf panel sets it from
the template's track on the Studio's timeline (Source, **A track in this video**) and offers
**Update timing** when the track moves; a render reads only these saved values.

| Field           | Type    | Default | Description                                                                   |
| --------------- | ------- | ------- | ----------------------------------------------------------------------------- |
| `enabled`       | boolean | `false` | Follow the template's track instead of playing `audioFile`.                   |
| `offsetSeconds` | number  | `0`     | The second of the track heard at the composition's first frame.              |
| `track`         | string  | `''`    | The timeline name of the track it follows (what the panel matches it by).     |

### `legend` (`MushafRecitation`, `MushafPage`)

The tajweed colours' legend (`<TajweedLegend band>`) as one centred row in a band above or below
the lines, no card behind it, drawn only when the theme tells the rules apart
(`themeHasTajweedColors()`: not under `plain`, `normal` or `black`). The lines are fitted around
the band (`legendBand()`), so it never covers them. Each entry is one unit that never breaks: it is
measured as drawn (the English in small caps, letter-spaced, in `overlay.font`; the Arabic in
Amiri), the entries wrap into the width inside the safe area, and when the widest one is wider
than that (the long prolongation rule with both names at 9:16), the names are drawn smaller until
it fits.

| Field         | Type                                      | Default         | Description                               |
| ------------- | ----------------------------------------- | --------------- | ----------------------------------------- |
| `show`        | boolean                                   | `false`         | Show the legend.                          |
| `position`    | `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'` | `'bottom-left'` | Its band: `top-*` above the lines, `bottom-*` below them. |
| `orientation` | `'row'`, `'column'`                       | `'row'`         | Ignored: the legend is one centred row in its band (kept for saved props). |
| `names`       | `'en'`, `'ar'`, `'both'`                  | `'both'`        | The rules' names: English, Arabic or both. |

### `endCard` (`MushafRecitation`, `MushafAyahText`, `MushafPage`)

A closing card (`<EndCard>`) for `seconds` after the last ayah, added to the duration: the surah,
the range, the reciter (`overlay.reciter`) and the credits the sources ask for (`attributionLines()`:
the fonts, QUD's timings when the sidecar says so, every translation shown). Its files are read in
`calculateMetadata()` (written by `serialiseTafsir()` / `serialiseChapterInfo()`); an empty file for
the card picked, or another surah's introduction, is `BAD_STUDIO_PROP`.

| Field             | Type                                             | Default  | Description                                           |
| ----------------- | ------------------------------------------------ | -------- | ----------------------------------------------------- |
| `show`            | `'none'`, `'credits'`, `'tafsir'`, `'chapter-info'` | `'none'` | The credits alone, with the tafsir of the last ayah recited (`tafsirEntryFor()`, its group), or with the surah's introduction. |
| `seconds`         | 2–15                                             | `5`      | Seconds the card stays.                               |
| `tafsirFile`      | string                                           | `''`     | Tafsir file in `public/`, read only when `show` is `'tafsir'` (which needs it). |
| `chapterInfoFile` | string                                           | `''`     | Surah introduction file in `public/`, read only when `show` is `'chapter-info'` (which needs it). |

### `header` (`MushafRecitation` and `MushafPassage`)

`'name'` puts the surah's `surah_name` line (its name in the printed frame) before the first ayah
line when the passage starts at ayah 1; `'name-basmalah'` adds the `basmallah` line after it when
the page prints one. Both come from `getMushafLines({page})` of the page that carries the first
ayah (`surahHeaderLines()`), so Al-Fatihah (whose basmalah is ayah 1) and At-Tawbah (which has none)
get the name alone. The header lines carry no timed words: they are scheduled before the first ayah
line (`withHeaderSlots()`), `overlay.introSeconds` apart when the intro card is on and 1.5 s apart
otherwise, never before 0, so the window's steps never decrease; one line at a time, they come in
one after the other before the first ayah line, and a header line the recording leaves no room for
is left out. With the intro card on, the recording waits for them too (`introDelaySeconds()`), and
their slots are laid after the card, so each holds its spacing. In `MushafPassage` each holds that
long, after the intro card. Under
`fonts: 'package'` the surah-name and `quran-common` fonts are read from
`public/fonts/surah-names-v4/surah_names.woff2` and `public/fonts/quran-common/quran-common.woff2`
(`bun run qul fonts 1` downloads them; they are not committed). The intro card (`overlay.title`
`'intro'` or `'both'`) names the surah too: with both on, the name shows twice at the start, so use
one or the other.

### `review` (`MushafRecitation` only)

| Field                 | Type    | Default     | Description                                                        |
| --------------------- | ------- | ----------- | ------------------------------------------------------------------ |
| `showDoubtful`        | boolean | `true`      | Studio only: mark words whose alignment is doubtful. Never in a render. |
| `confidenceThreshold` | 0–1     | `0.8`       | Segments under this confidence are doubtful.                       |
| `doubtColor`          | colour  | `'#d94848'` | Colour of the doubt mark.                                          |

## Data contract

### The timings file

`timingsFile` names a JSON file in the main package's recitation timings format (see
[Following a recording](../remotion-mushaf-line-renderer/README.md#following-a-recording)): the
recited ayahs and their words with times in seconds, word ids `"surah:ayah:position"`, every
occurrence of a repeated word in audio order, and the ayah-end marker timed as the word after the
ayah's last one. Any producer works; the package validates the file with `parseRecitationTimings()`.

Both versions work. Version 1 (`{version: 1, surah, ayat}`) is one surah; it is what the panel
writes. Version 2 (`{version: 2, ayat: [{surah, ayah, start, end, words?}]}`, no top-level `surah`)
is a recording that crosses surahs, such as a juz. `MushafRecitation`, `MushafAyahText` and
`MushafPage` use a version 2 file whole: `fromAyah` and `toAyah` do not cut it. Its lines come from
`getMushafLinesForRanges()`, with each later surah's printed header between the surahs. The intro
card, the chapters, the description and the captions name both surahs. The type is `StudioTimings`
(`StudioTimingsV1 | StudioTimingsV2`): narrow on `version` before reading `surah`, or use
`passageSpan()` (the first and last ayah), `crossesSurahs()` and `surahOfAyah()`. In the panel, the
Review tab lists a version 2 file by surah and ayah, but a nudge is `BAD_TIMING_EDIT`, and the Text
tab fetches for one surah only: for `MushafAyahText`, the text file must hold every surah.

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
| `edits`           | What was changed by hand in the panel (`nudge`, `split-segment`, `realign`, `trim`), with a time and a note. A captions import is a `realign` noted `captions import`. |
| `audio`           | The recording measured when the panel saved the timings (`audioSummaryOf()`): `lufs`, `peak`, `firstSoundSeconds`, `durationSeconds`. `audio.normalize` and `audio.trimSilence` use it, so the recording is not downloaded again. Absent when the recording could not be measured. |

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
| `splitSession(audioId, request)`                | Subdivides a session's segments (by verses, words, duration, or only at stop signs). A limit under 1 or a duration not above 0 is refused before sending (the service does not refuse every bad value). |
| `realignSession(audioId, {timestamps})`         | Re-runs recognition and matching over boundaries you give. An empty list, or a boundary that is negative or ends before it starts, is refused before sending. |
| `timingsFromQud({align, timestamps}, options?)` | An alignment as `StudioTimings` (validated through `parseRecitationTimings()`).            |
| `timingsFromCatalogue(chapter, options?)`       | A catalogue chapter as `StudioTimings`.                                                    |
| `isHafsRecitation(recitation)`                  | Whether a catalogue recitation is in the Hafs riwayah, the mushaf's own (an empty label counts as Hafs). |
| `DEFAULT_QUD_API`, `MARKER_HOLD_SECONDS`, `DEFAULT_CONFIDENCE_THRESHOLD` | `https://aligner.qud.dev/api/v1`; 0.8 s the ayah-end marker stays current; 0.8. |

A Hugging Face `token` (option) spends the caller's own GPU quota; the client never stores it. The
client was checked against the live service (the catalogue and an alignment of surah 112 agree on
the word ids, within 0.3 s); its answers are replayed in the tests (`test/fixtures/qud/live-*`). An
error message names a gateway's error page (Cloudflare's 524 when the aligner takes over 120 s to
answer), gives `Retry-After`, and its hint follows the route: an expired session, or a wrong slug or
chapter.

### Captions

| Export                                       | Does                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `toCaptions(timings, options?)`              | One `Caption` (`@remotion/captions`) per word, timed to the audio file; ayah markers optional. |
| `fromCaptions(captions, base)`               | The timings with the captions' times: the round trip of an edit in a caption editor. The same count as `toCaptions()` made, or `BAD_TIMING_EDIT`. |
| `captionsToSrt(captions)`                    | The captions as SRT.                                                                     |
| `captionsToVtt(captions, options?)`          | The captions as WebVTT: a cue per word, or per ayah (`lines: 'ayah'`, from the cues of `toCaptionCues()`). |

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
| `fitSplits(lines, splits)`          | `applySplits()` that leaves out what does not fit instead of throwing: `{lines, dropped}`, what the Studio's preview resolves with. |
| `droppedSplitsWarning(dropped)`, `droppedSplitsError(dropped)` | The preview's warning naming the dropped splits, and the `BAD_LINE_SPLIT` a render throws for them (`null` for none). |

### Drop-in slots

See [Inside your own composition](#inside-your-own-composition).

| Export                                                         | Does                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `mushafRecitationSlotSchema`, `mushafAyahTextSlotSchema`, `mushafPageSlotSchema` | A composition's schema, nullable: the field of a template's schema. |
| `defaultMushafRecitationSlotProps`, `defaultMushafAyahTextSlotProps`, `defaultMushafPageSlotProps`, `MUSHAF_SLOT_DEFAULTS` | The defaults with transparent backgrounds. |
| `emptySlotPropsFor(kind)`                                      | The slot defaults without the sample's files: what a first save into a `null` slot starts from. |
| `resolveMushafRecitationSlot(props, {fps, abortSignal?, isRendering?})`, `resolveMushafAyahTextSlot()`, `resolveMushafPageSlot()` | `{props, durationInFrames, error}` at the template's fps, no size, never throwing the package's errors in the Studio's preview. |
| `slotDurationOf(props)`, `slotErrorOf(props)`                  | The length and the error a resolver left in `props.resolved`.               |
| `<MushafRecitationSlot>`, `<MushafAyahTextSlot>`, `<MushafPageSlot>` | The box's `<Sequence>` with the composition in it and the panel docked beside it (`MushafSlotOptions`). |

### Audio

| Export                                                   | Does                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `hostAudioSchema`, `defaultHostAudio`, `hostAudioOf(props)`, `followsHostAudio(props)` | The `hostAudio` group, read leniently (props without it read as off). |
| `assertNoHostRepeats(props, memorize)`                   | `BAD_STUDIO_PROP` for a `memorize` repeat under `hostAudio`.                     |
| `OWN_AUDIO_NAME`                                         | The `name` of the compositions' own `<Audio>`, which the panel leaves out of the template's tracks. |
| `encodeWav(samples, sampleRate)`, `audioToWav(blob, name, decode?)`, `WAV_SAMPLE_RATE` | A recording (a video's sound included) as a mono 16-bit WAV at 16 kHz, for the aligner. |
| `analyzeAudio()`, `gainFor()`, `volumeAt()`, `silenceTrimSeconds()` | The analysis, the normalisation gain, the volume curve and the silence trim of [`audio`](#audio-mushafrecitation-mushafayahtext-mushafpage). |

### Fonts

| Export                                       | Does                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `registerMushafFonts({plain?, tajweed?})`, `getRegisteredMushafFonts()` | The fonts packages the compositions may use, registered by your Root. |
| `QUL_FONTS`                                  | QUL's Quran fonts as data: page fonts (V4 plain and tajweed, V1, V2), Unicode fonts (Uthmani Hafs, Nastaleeq, Indopak, Digital Khatt, Me Quran) and the shared fonts, with resource ids, CDN URLs where public, and whether the package renders them today. |
| `pageFontUrl(font, page, format?)`           | The CDN URL of one page of a page-fonts resource.                                        |
| `TRANSLATION_FONT_PRESETS`                   | CSS font stacks that render translations well without a web font.                        |
| `useStudioFonts()`, `STUDIO_FONT_REQUESTS`   | The type around the lines, loaded from Google Fonts behind the render's font gate: EB Garamond 400, 400 italic and 500 (the translation, the gloss, the labels) and Amiri 400 (the Arabic labels). |

Every composition waits for those faces so that no frame is taken in a fallback, so a render needs
to reach Google Fonts (as it does for a translation in its language's own font): without a network
it stops with `FONT_NETWORK`. There is no offline source for them yet.

### Schema

The Zod fragments the compositions are built from, to build a composition of your own with the same
sidebar controls: `themeNameSchema`, `customThemeSchema`, `fontsSchema`, `dataSchema`,
`layoutSchema`, `animationSchema`, `highlightSchema`, `textSchema`, `reviewSchema`,
`lineSplitSchema`; their defaults (`defaultCustomTheme`, `defaultLayout`, `defaultAnimation`,
`defaultHighlight`, `defaultText`, `defaultReview`); the value lists (`THEME_NAMES`, `ASPECTS`,
`LINE_MOTIONS`, `TEMPOS`, `HIGHLIGHT_STYLES`, `LAYOUT_FRAMES`, `KEN_BURNS`, `MIRROR_FILES`; the
saved values they replaced, for migrations, `ENTRANCES`, `LEGACY_HIGHLIGHT_STYLES` and
`LEGACY_KEN_BURNS`); the tokens of the design (`GROUNDS`, `METAL`, `ACCENT_GOLD`, the curves `SOFT`,
`INOUT`, `SINE`, `ARRIVE`, `DURATIONS`, `tempoFrames()`, `dissolve()`, `frameGeometry()`); its colour
guards (`legibleAccent()`, `washColor()`, `readableInk()`, `contrast()`, `isLightGround()`); its timing
model (`wordSpans()`, `wordEmphasis()`, `ayahEmphasis()`, `inkFill()`, `boundaryStart()`); and the
migration (`migrateMushafProps()`, `describeMushafMigration()`, `mushafPropsNeedMigration()`). Their descriptions say which of two overlapping
options wins; their colour fields carry no description, so the Props sidebar shows a picker
(`.describe()` on a `zColor()` turns it into a text box in Remotion 4.0.539).

And the converters from those values to the main package's props, so your own composition paints
the same way:

| Export                                         | Gives                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `themeSelectionFrom(theme, customTheme)`       | The `theme` of a line.                                                             |
| `fontPropsFrom(...)`                           | `fontSrc` / `fontFallback` for `fonts` and the line's font set, from the registered fonts packages. |
| `dataSourceFrom(data, staticFile)`             | The `data` option of `getMushafLines()`: the mirror's two files, or `undefined` for the CDN. |
| `animationFrom(animation, {enterFrames, exitFrames, fontSize})`, `windowScrollTiming(animation)` | `enter` / `exit` of a line or a window at a boundary's lengths; the window's `scrollTiming` (`scrollTimingFrom()` is deprecated). |
| `wordStyleFrom(...)`, `inkTintFor(...)`, `washStyle(...)`, `withAlpha(color, alpha)` | The mark as `wordStyle` (ink, tint or wash, with the line's position and the tint palettes); the line's `inkTint`; a wash's CSS; a colour at an opacity. `activeWordStyleFrom()` is deprecated: it migrates its argument and returns the mark at full strength. |
| `sizeForAspect(aspect)`                        | `{width, height}` for `layout.aspect`.                                              |

`resolveRecitation(props)` is `calculateMetadata()` without the size and duration, to fill
`resolved` for a `<Player>` host (the `<Player>` never runs `calculateMetadata()`).

## Errors

Every failure of the studio package is a `MushafStudioError` (`isMushafStudioError()`) with a
`code`, a message that names the value and the fix, and `details`. What happens to a line itself
stays a `MushafError` of the main package.

| Code                       | When                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `QUD_HTTP`                 | The aligner or the catalogue answered with an error (`details.status`, `details.code`), or a request was refused before sending (`details.status` `null`, `details.field`). |
| `QUD_RATE_LIMITED`         | The GPU quota and the CPU rate limit are both spent (`details.retryAfterSeconds`).     |
| `QUD_BAD_RESPONSE`         | The aligner's answer is not in the expected shape.                                     |
| `QUD_NO_MATCH`             | The aligner matched nothing, words of two surahs, or nothing in the range kept.        |
| `BAD_TRANSLATION_FILE`     | A translation file is in none of the shapes above.                                     |
| `TRANSLATION_FETCH_FAILED` | A translation source could not be fetched.                                             |
| `CONTENT_FETCH_FAILED`     | A tafsir or a surah introduction could not be fetched, came in an unknown shape, or has nothing for the range. |
| `BAD_CONTENT_FILE`         | A tafsir or chapter-info file is not the envelope its loader reads.                     |
| `BAD_PROJECT_FILE`         | A `project.json` cannot be imported: not JSON, another version, props that fail the schema or are for another kind of composition, files `public/` lacks. |
| `BAD_LINE_SPLIT`           | A split names a line not in the passage or a word not on that line.                    |
| `BAD_STUDIO_PROP`          | A prop is out of range or inconsistent beyond what the schema catches.                 |
| `BAD_TIMING_EDIT`          | An edit of the timings is impossible: a start after its end, a word the file lacks, a nudge of a version 2 file, captions that do not fit the file. |
| `AUDIO_ANALYSIS_FAILED`    | The audio could not be fetched or decoded for the analysis; the audio then plays as it is (`resolved.audioWarning`). |
| `NOT_IN_STUDIO`            | A Studio API was called outside the Studio.                                            |

## Roadmap

Open: the QPC V1, QPC V2 and Indopak layouts, the Warsh and Qalun riwayahs, and a server-side proxy
for the aligner. See
[docs/mushaf-studio/plan.md](../../docs/mushaf-studio/plan.md#7-roadmap).

## Licences

Package code: [MIT](./LICENSE). The package ships no data, no fonts and no audio. The fonts are the
King Fahd Complex fonts as published by [QUL](https://qul.tarteel.ai), not open source; the mushaf
data is QUL's open data. The QUD Universal Aligner's output is CC-BY-4.0, and the catalogue's audio
belongs to its reciters and publishers. quran.com's translations are each under their own
translator's or publisher's terms. Please respect them when you publish a video.

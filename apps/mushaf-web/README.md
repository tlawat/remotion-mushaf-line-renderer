# Mushaf Studio Web

Mushaf Studio Web makes a word-synced recitation video of the KFGQPC V4 mushaf in the browser, with
nothing to install. It is one static page: you pick a reviewed recitation, a look and a translation;
a `<Player>` previews the video while you choose; then you render it to a file in the same tab.

It is the end-user path of [Mushaf Studio](../mushaf-studio). The compositions, looks, resolvers and
caption converters all come from [`@tlawat/mushaf-studio`](../../packages/mushaf-studio), so the page
renders exactly what the Studio and `bun run make` render. It does not have the Studio's Mushaf panel:
no own recordings, no alignment, no review, no line splits. For those, use the Studio app.

## The four steps

1. **Recitation.** The [QUD aligner](https://aligner.qud.dev)'s catalogue of reviewed, word-aligned
   recitations, grouped by reciter, then a surah and an ayah range. The page fetches the surah's
   segments with their word times (`getChapterSegments`) and converts them with
   `timingsFromCatalogue`. The audio streams from the catalogue's clip URL. Changing the range needs no
   new request: it is the composition's `fromAyah` / `toAyah`. A recitation in another riwayah than
   Hafs loads only after you tick a box under its warning: the page is the Hafs print, and its words
   can differ.
2. **Look.** The package's `MUSHAF_LOOKS` as cards. A card applies the look (`applyLook`) over the
   composition's defaults.
3. **Text.** An ayah translation from [quran.com](https://quran.com), chosen by language, shown under
   the lines. You can also add quran.com's word-by-word gloss along the bottom (mushaf lines only).
4. **Export.** Render the video in the browser, with a progress bar and then a download link. Or
   download a props file and a `bun run make` command to render it on your own machine. You can also
   download the captions: SRT word by word, WebVTT ayah by ayah, and Remotion's `Caption[]` as JSON.
   The step ends with the licensing notice below.

The switch above the preview chooses between `MushafRecitation` (the printed lines) and
`MushafAyahText` (one ayah at a time as Unicode text, a 9:16 reel). The page fetches the surah's
Uthmani text from quran.com when you switch to `MushafAyahText`.

## How it works without a public/ folder

In the Studio, the panel writes the timings, the translation and the Quran text into `public/`, and
the props point at those files. A static page has no `public/` folder, so the page keeps the files in
memory (`src/memory-files.ts`):

- `memoryFiles.put('timings/<slug>/<surah>.json', json)` stores a file and returns its URL,
  `mem://timings/<slug>/<surah>.json`. The props' file fields hold these URLs.
- `memoryFetch` answers `mem://` URLs from the store and passes every other request to the network.
  `memoryStaticFile` maps a public path to a `mem://` URL and leaves `mem:`, `blob:`, `data:` and
  http(s) URLs as they are.
- The page runs the package's resolvers itself, with that `fetch` and `staticFile`:
  `resolveRecitation(props, {fetch: memoryFetch, staticFile: memoryStaticFile})`, or
  `resolveAyahText`. It takes the size and length from the same helpers `calculateMetadata()` uses
  (`sizeForAspect`, `recitationDuration`). The `<Player>` and the render receive the props with
  `resolved` already filled in, so neither ever runs `calculateMetadata()`.
- The mushaf data comes from Tarteel's CDN (`data: 'cdn'`) and the page fonts from QUL's CDN
  (`fonts: 'cdn'`): the page has no mirror and no fonts packages.

Nothing is uploaded anywhere: the page only reads from QUD, quran.com, Tarteel's CDN and QUL's CDN.

## Develop, build, deploy

From the repository root, once:

```bash
bun install
bun run build          # the two packages the page imports, into packages/*/dist
```

Then:

```bash
bun run --cwd apps/mushaf-web dev        # http://localhost:5174, hot reload
bun run --cwd apps/mushaf-web build      # the static site, into apps/mushaf-web/dist
bun run --cwd apps/mushaf-web preview    # serve dist/ at http://localhost:4174
bun run --cwd apps/mushaf-web typecheck
```

`dist/` is plain static files (about 3.5 MB). The web renderer and its audio encoders are separate
chunks that load only when the Export step needs them. The build uses relative URLs, so `dist/` works
from any folder of any static host: GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket, or
`npx serve dist`. No server code and no environment variables are needed. QUD, quran.com and the two
CDNs all send CORS headers for any origin.

The tests run with the repository's unit suite (`bunx vitest run --project unit apps/mushaf-web`).
They cover the memory store and its `fetch`, the props each step builds, the riwayah confirmation,
and a jsdom render of the page with the network mocked. The root `bun run typecheck` checks the app
and its tests, and CI builds it.

The web render suite proves the Export step finishes a real render:

```bash
bun run --cwd apps/mushaf-web test:render-web
```

It builds the page, serves it on port 4179 and, in Chromium with WebCodecs, renders Al-Ikhlas (four
ayahs, about 13 s) with `@remotion/web-renderer`. It checks the file the page offers: a video and an
audio track, the length the page said, the recitation audible (in Chromium: a WebM, 1920×1080, 30
fps, VP9 and Opus). The render takes about half a minute. QUD's answers and the clip are downloaded
once into `test-results/web-render/` and served from there (QUD can be slow, and headless Chromium
cannot fetch the clip through a proxy); Tarteel's CDN and QUL's CDN are live. Without those
downloads the test skips and says why. It runs a full Chromium, not the headless shell, since the
render needs WebCodecs' `VideoEncoder`: `MUSHAF_WEB_CHROMIUM`, else `/opt/pw-browsers/chromium`,
else Playwright's own. It is not part of CI.

## Limits

- **Rendering speed.** The browser renders the video on your device, frame by frame, with WebCodecs
  (`@remotion/web-renderer`). Expect a few minutes per minute of video. Keep the tab in front while it
  runs. Long surahs are better rendered on a machine (the Export step gives the command).
- **Browsers.** Rendering needs WebCodecs: a recent Chrome, Edge or Safari. The page picks MP4 (H.264)
  when the browser can encode it, and WebM (VP9, then VP8) when it cannot, as in Chromium without
  proprietary codecs. When neither works, the Export step shows only the machine path. The tajweed
  colour themes need `font-palette` in the preview (Chrome 101, Safari 15.4, Firefox 107).
- **Audio in the render.** The compositions play their audio with Remotion's HTML5 `<Audio>`, which
  the web renderer refuses. For the render, the page turns the compositions' own audio off and adds
  `@remotion/media`'s `<Audio>` with the same trim (`src/render.tsx`).
- **Remotion's licence.** The in-browser render passes `licenseKey: 'free-license'` and sends
  Remotion's usage event. That is right for individuals and organisations that qualify for
  [Remotion's free licence](https://remotion.dev/license). A deployment by a company that needs a
  company licence sets its key at build time:
  `VITE_REMOTION_LICENSE_KEY=<key> bun run --cwd apps/mushaf-web build`.
- **The catalogue only.** Only the QUD catalogue's reviewed recitations are offered: no uploads,
  alignment or timing fixes. Riwayahs other than Hafs are listed, but the mushaf drawn is the Hafs
  KFGQPC V4 print, so the page asks you to confirm one before it loads it.

## What you may publish

The page's code is MIT, but the videos it makes are not free of terms. The KFGQPC page fonts that
draw the text are © King Fahd Glorious Qur'an Printing Complex, published by QUL. They carry a notice
reserving printing and publishing to the Complex's permission and to charitable (sadaqa) use. A free
video shared as sadaqa is the use the notice describes. A monetised channel, a paid course or a
client project needs the Complex's permission. The recitation belongs to its reciter or publisher.
QUD's timings are CC-BY-4.0, so credit "Timings: QUD Universal Aligner (aligner.qud.dev), CC-BY-4.0".
Translations carry their own terms, so name the one you show. The whole page:
[docs/mushaf-studio/licensing.md](../../docs/mushaf-studio/licensing.md).

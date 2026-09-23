# Font sources: implementation plan

Baseline is HEAD `5588bfa`. Path shorthand:

- `pkg/` means `packages/remotion-mushaf-line-renderer/`.
- `<remotion>` means `packages/` in [remotion-dev/remotion](https://github.com/remotion-dev/remotion) at commit `19fc4668` (4.0.527); docs are under `<remotion>/docs/docs/`.
- `<facts>` means the npm tarballs of remotion 4.0.374, 4.0.521 and 4.0.522–527 plus related packages (`npm pack <pkg>@<version>`), unpacked in a scratch directory while the plan was written.

The main package is unpublished (0.3.0 in its CHANGELOG), so breaking changes cost nothing outside this repository.

## Summary

- **Video authors get a local-first font source by default.** Every page font resolves through `fontSrc`, which defaults to `'auto'`. `'auto'` reads `public/mushaf-fonts/<fontSet>/manifest.json` once per tab and serves the pages it lists from there. Every other page comes from QUL's CDN.
  - Deleting all or part of the folder never breaks anything.
  - A cached file that is present but wrong is a loud error.
  - It works in Studio, local SSR, Lambda, Cloud Run and `<Player>` host apps.
- **Library users get one explicit-source API.** `fontSrc` is a prop on `<MushafLine>` and an option of `loadPageFont()`. It takes `'auto' | 'local' | 'cdn' | {cache, cdn?} | (file) => url | url[]`.
  - It replaces `line.fontUrl`, `getMushafLines({fontUrl})`, `loadPageFont({url})` and `MushafFontUrl`.
  - Each source gets its own `FontFace`, so `FONT_URL_CONFLICT` and the order dependence inside a tab disappear.
- **Renders stay deterministic.** While rendering, only definite answers steer the source choice: the manifest, a final HTTP status, or HTML where a font should be.
  - A transient failure never becomes a CDN load. It gets one real fresh-tab retry through Remotion's `delayRender` retry mechanism, then the render fails with a message that names the fix.
- **A command in the main package fills the cache:** `npx remotion-mushaf-line-renderer sync` (alias `preload`), plus `status`, `verify` and `clean`.
  - Its sources, in order: an installed fonts package, then QUL's CDN.
  - It writes a per-set manifest with size, sha256, md5/ETag, source and time for each file.
  - It is idempotent: a second run makes no requests and no writes.
- **The fonts live in two separate packages:** `remotion-mushaf-fonts-qpc-v4` (43.0 MB tarball) and `remotion-mushaf-fonts-qpc-v4-tajweed` (51.0 MB).
  - Both are optional peers of the main package, and nothing imports them at runtime.
  - CI builds them against a committed snapshot manifest.
  - The main package stays code only, and `check:package` keeps failing if a font gets into its tarball.
- **The data exports get the same treatment (M6).** `words.json.zip` and `layout.db.zip` (1.23 MB) become local-first behind `public/mushaf-data/manifest.json`, and `sync` writes them.
- **This lands before the `<MushafLine>` redesign.** The redesign adopts `fontSrc`, `useFontGate({mushaf, theme, page, fontSrc})` and the loader as they are, so it has no font work left.

## Decisions

| # | Decision | Choice | Why | Rejected alternatives |
|---|---|---|---|---|
| A | Font loader | **Keep our own `fetch` → magic bytes → `new FontFace(bytes)` loader.** No `@remotion/fonts`, and no `registerFontFace` for now (it becomes optional M8, feature-detected). | `loadFont()` calls `cancelRender` on its first failure (`<remotion>/fonts/src/load-font.ts:90-92`), so a local miss would kill the render before the CDN is tried. Up to 4.0.524 it builds the face from a `url()` string, so we would get no HTTP status and no magic-byte check. It has no retries and no timeout, returns `Promise<void>`, uses the global `delayRender`, and is not idempotent. It depends on an exact `remotion` version (a regular dependency, not a peer), so any version mismatch installs a duplicate `remotion`. The font registry is internal (`remotion/no-react`), exists only from 4.0.525, never evicts, and only embeds fonts into **SVG** `<text>` in `@remotion/web-renderer`. This package draws HTML. | Delegating to `loadFont()`. Calling `registerFontFace` now. |
| B | Command name | Binary **`remotion-mushaf-line-renderer`** (the only binary). Commands `sync` (alias **`preload`**), `status`, `verify`, `clean`. | In Remotion, `preload` (`@remotion/preload`) and `prefetch()` mean loading into memory in the browser for the Player. `sync` is idempotent, covers both copying from a package and downloading, and covers data from M6. The alias keeps the word the user asked for. A binary named after the package makes `npx remotion-mushaf-line-renderer …` work whether or not the package is installed. | `preload` as the primary name. `download` (wrong when copying from a package). A `fonts` noun (data comes in M6). A short `mushaf` binary (collides in `.bin`, and `npx mushaf` could run a stranger's package). `npx remotion add` (it only accepts an allowlist, `<remotion>/cli/src/add.ts:38-46`). |
| C | Detecting what is cached | **One manifest per font set, fetched once per tab.** Pages the manifest does not list go straight to the CDN. A listed file that is definitely missing falls back to the CDN for that page only. | With no cache (the most common state), this costs one request per set per tab and no per-page 404s. The command writes a manifest anyway. The manifest names each file, so tajweed p328 being `.woff` needs no runtime special case. It carries size and sha256 for integrity checks. Splitting it per set means a plain-only project never downloads tajweed entries. | Probing each page (a 404 per page in every console, nothing to check a hash against). One manifest for both sets. `getStaticFiles()` or `window.remotion_staticFiles` (`[]` in the Player, deprecated, internal). |
| D | Fonts packages | **Two packages, one per set:** `remotion-mushaf-fonts-qpc-v4` and `remotion-mushaf-fonts-qpc-v4-tajweed`. A committed snapshot manifest, with the bytes filled in CI. `prepack` only verifies. Versions `1.YYYYMMDD.patch`. Optional peers of the main package. | The `plain` theme uses only `qpc-v4`; every other theme uses only tajweed. The sets change at different rates: tajweed had 9 builds in 2025, while plain has not changed since 2025-04-09. The uploads are about 57 MB and 68 MB of base64 instead of about 125 MB. The `remotion-` prefix avoids looking like an official QUL or KFGQPC release. | One combined 94 MB package. Committing the fonts to git or LFS. Downloading in `prepack`. Calendar-only or plain-semver versions. `mushaf-fonts-*` names. |
| E | QUL's data exports | **Yes, milestone M6:** `public/mushaf-data/manifest.json` plus pinned basenames, `data: 'auto' \| 'local' \| 'cdn' \| {words, layout}`, and `sync` writes them. | A render in a VPC or offline also needs the data, otherwise local fonts gain nothing. The bytes are immutable and pinned by sha256, so falling back cannot change the output. | Deferring to the redesign. Putting the data in the fonts packages (different licence, tied to the main package's pinned URLs). |
| F | Existing explicit-source APIs | **Removed in 0.4, replaced by `fontSrc`.** `line.fontUrl` in data is rejected loudly with a migration message. `FONT_URL_CONFLICT` is removed. `BAD_FONT_URL` becomes `BAD_FONT_SRC`. `FONT_SUPERSEDED` becomes internal. | The package is unpublished. Keeping two paths would double the precedence rules and the tests. Per-source faces make the conflict impossible. | Deprecating while still honouring the old APIs. A claims model (it keeps the order dependence and the divergence between chunks). |
| G | Transient local failure while rendering | **In-tab retries, then one fresh-tab retry through a short `delayRender({timeoutInMilliseconds: 2_500, retries: 1})` "retry trigger", then fail.** Never fall back to the CDN. | `cancelRender` never retries (`<remotion>/docs/docs/cancel-render.mdx:11`). The renderer retries a frame only when the error carries `DELAY_RENDER_RETRY_TOKEN`, which only a `delayRender` timeout adds (`<remotion>/core/src/delay-render.ts:91-101`; `<remotion>/renderer/src/render-frame-and-retry-target-close.ts:157-169`). This mechanism exists in 4.0.374 (checked in `<facts>/remotion_4.0.374`). | Calling `cancelRender` at once, which makes a single S3 503 fatal. Falling back to the CDN, which lets tabs diverge. |
| H | Manifest revalidation | **Studio only**, at most every 5 s, on the next font load. In a render, or in the Player, a definite result is kept for the life of the tab. | Studio serves `public/` live, so a `sync` should take effect without a reload. In a Player host, revalidating an absent manifest would bring back a 404 per page turn. Studio sends no ETag, so every revalidation downloads the whole file. | Revalidating everywhere, as the synthesised plan did. |

## Verified Remotion facts this relies on

**`staticFile()` and where `public/` is**

- **`staticFile()` does not check that a file exists.** It prefixes `window.remotion_staticBase`, or `/` when that is unset. From 4.0.521 it first looks the path up in `window.remotion_staticFiles`. Sources: `<remotion>/core/src/static-file.ts:63-75,141-160`; `<facts>/remotion_4.0.521/package/dist/esm/index.mjs:395`.
- **What `staticFile()` returns in each environment:**

  | Environment | Returns | Source |
  |---|---|---|
  | Studio | `/static-<12 hex>/…`, changing on every restart | `<remotion>/studio-server/src/start-studio.ts:127-133` |
  | Local render | `/public/…` | `<remotion>/bundler/src/bundle.ts:68-83`; `<remotion>/studio-shared/src/studio-html.ts:74-77` |
  | Lambda | `/sites/<id>/public/…` | `<remotion>/lambda/src/api/deploy-site.ts:99` |
  | Cloud Run | `/<bucket>/sites/<id>/public/…` | `<remotion>/cloudrun/src/api/deploy-site.ts:97` |
  | Player | `/…`, since it never sets a static base and has no base-path support | `<remotion>/player/src/Player.tsx:199-201`; `<remotion>/docs/docs/staticfile.mdx:94` |

- **Where `public/` lives.** It sits next to the `package.json` that depends on `remotion` (`<remotion>/docs/docs/staticfile.mdx:38-40`). The CLI finds the root with `findRemotionRoot`, which walks up from the cwd to the nearest `package.json`, at most 5 levels (`<remotion>/renderer/src/find-closest-package-json.ts:4-29`). The folder can be overridden with `--public-dir` or `Config.setPublicDir` (`<remotion>/renderer/src/options/public-dir.tsx:3-45`).

**How missing files and symlinks are served**

- **Studio** answers a missing public file with **404 `text/plain`** and **follows symlinks** (`<remotion>/studio-server/src/preview-server/serve-static.ts:94-113`). It sets **no ETag, Last-Modified or Cache-Control** (checked by grep).
- **The render server (`serveHandler`)** answers a missing file with **404 JSON**, answers a **symlinked file with 404**, and sends `Cache-Control: no-cache, no-store` (`<remotion>/renderer/src/serve-handler/index.ts:216-228,269`). This was confirmed empirically on 4.0.521 (`<facts>/symtest/run.cjs`).
- **S3 (403) and GCS (404)** statuses are unverified.

**`bundle()`, `deploySite()` and the Studio watcher**

- **`bundle()` deep-copies `public/`** and re-creates any symlinks as symlinks (`<remotion>/bundler/src/bundle.ts:404-418`; `copy-dir.ts:35-38`).
  - Temporary bundles for CLI renders **symlink the whole `public/`** instead (`<remotion>/cli/src/setup-cache.ts:245-246`).
  - Lambda and Cloud Run `deploySite` always deep-copy, and redeploys upload only files whose ETag changed (`<remotion>/lambda/src/shared/get-s3-operations.ts:37-51`).
- **Every bundle's `index.html`, and the Studio page, inline the list of public files** as `window.remotion_staticFiles`, capped at 10,000 entries (`<remotion>/bundler/src/bundle.ts:431-441`; `<remotion>/studio-shared/src/studio-html.ts:174`). For 1,210 entries that is 196,811 bytes of JSON (reviewer's measurement).
- **Studio watches `public/` recursively with no debounce.** On every event it rescans the tree synchronously and pushes the whole file list to every tab (`<remotion>/studio-server/src/preview-server/public-folder.ts:70-73`; `start-studio.ts:135-152`).
  - My simulation of that watcher (Node 22.22.2, Linux), during a sync of both sets staged outside `public/` with one rename per file and a single manifest write: **1,213 events, 12.0 s of rescanning, 110 MB of file-list payload**.
  - The reviewer's simulation of the earlier design (`.partial` files inside `public/`, manifest flushed every 50 files): 5,951 events, 26 s, 553 MB.
  - Moving a whole directory in does not help on Linux: 604 files moved in with one directory rename still produced 606 events.
- **Studio exposes `GET /__remotion_config`**, which returns `{isRemotion: true, cwd}`. This is present in 4.0.521: `<facts>/_remotion_studio-server_4.0.521/package/dist/routes.js:414`, and `<remotion>/studio-server/src/detect-remotion-server.ts`.

**`delayRender`, retries and timeouts**

- **The timer** only runs while rendering and fires at `timeout − 2000`. The error carries `DELAY_RENDER_RETRY_TOKEN` only when `retries − (remotion_attempt − 1) > 0` (`<remotion>/core/src/delay-render.ts:84-114`). The same logic is in 4.0.374.
- **The renderer retries a frame in a fresh tab only in three cases:** the error carries that token, the target closed, or the message matches a Chromium network error (`<remotion>/renderer/src/render-frame-and-retry-target-close.ts:157-169`; `<remotion>/renderer/src/browser/flaky-errors.ts:8-18`).
- **`cancelRender`** stops the render with no retry (`<remotion>/docs/docs/cancel-render.mdx:11`).
- **The renderer's outer wait per frame** is `timeout + 3000` (`<remotion>/renderer/src/seek-to-frame.ts:71`).

**`@remotion/fonts` and the font registry**

- **`loadFont`** calls `cancelRender` on its first error (`<remotion>/fonts/src/load-font.ts:90-92`). It derives the format from the URL extension only when `format` is omitted (`:55`).
  - Up to 4.0.524 it builds the face from a `url()` string. From 4.0.525 it fetches with `fetchFontData` and calls `registerFontFace` (`<facts>/_remotion_fonts_4.0.521/package/dist/esm/index.mjs:45-64`, `<facts>/f4.0.525`).
  - It has `remotion` as an exact regular dependency (`<facts>/f4.0.524/package/package.json`).
- **The font registry** is reachable only through `remotion/no-react`. `@remotion/web-renderer` uses it only for SVG `<text>` (`<remotion>/web-renderer/src/drawing/embed-registered-fonts-in-svg.ts:163-285`).

**Other Remotion APIs and conventions**

- **`getStaticFiles()`** returns `[]` in the Player and is moving to `@remotion/studio` (`<remotion>/core/src/get-static-files.ts:34-52`).
- **Remotion's meanings of `preload` and `prefetch`:**
  - `@remotion/preload` adds `<link rel=preload>` and is "not necessary for rendering" (`<remotion>/docs/docs/preload/preload.mdx:12`).
  - `prefetch()` is for the Player, in memory (`<remotion>/docs/docs/prefetch.mdx:10-16`).
- **`@remotion/animated-emoji`** defaults to `staticFile()` and exposes a `calculateSrc` prop (`<remotion>/docs/docs/animated-emoji/animated-emoji.mdx`). This is the precedent for `fontSrc`.
- **Cloud Run** is "Alpha status and not actively being developed" (`<remotion>/docs/docs/cloudrun/api.mdx:9`).
- **Available in 4.0.374** (the peer floor): `getRemotionEnvironment().isStudio`, `useDelayRender`, and the `retries` and `timeoutInMilliseconds` options of `delayRender`.

**This repository's own Player harness (Vite)**

- **The root has no `index.html`.** Vite's root is `example/` (`example/vite.config.mts:6`), and `ls example` shows no `index.html`.
- **So missing public files return an empty 404, not HTML.** The reviewer confirmed this on Vite 8.2.2, where SPA HTML came back only once a root `index.html` existed. The existing `font-html` scenario therefore points explicitly at `/player/index.html` (`example/player/scenarios.ts:116`).

## Runtime design

### Modules (`pkg/src/`)

| File | Status | Imports `remotion`? | Role |
|---|---|---|---|
| `hash.ts` | new | no | `fnv1a32(text): number`, `hex8()`, `base36()`. `palette-store.ts` imports it, and its output is unchanged. |
| `fonts/font-file.ts` | new | no (shared with the CLI) | `fontFileFor(def, fontSet, page)`, public `getMushafFontFile()`, `FONT_CACHE_DIR = 'mushaf-fonts'`, and the test-only CDN-base hook. **The only place that knows about p328.** |
| `fonts/font-magic.ts` | moved from `load-page-font.ts:216-234` | no (shared) | `sniffFont`, `declaredFontLength` (the WOFF/WOFF2 header `length`), `previewBytes`, `assertFontMagic` |
| `fonts/cache-format.ts` | new | no (shared) | Manifest types, `parseFontCacheManifest()`, file-name validation |
| `fonts/font-packages.ts` | new | no (shared) | `FONT_PACKAGES: Record<MushafFontSet, string>` |
| `fonts/font-source.ts` | new | no | `normalizeFontSrc`, `specKey`, `familyFor`, `describeSpec` |
| `fonts/rendering.ts` | new | yes | `isRenderingNow() = getRemotionEnvironment().isRendering \|\| looksLikeRendering()`, `isStudioNow()` |
| `fonts/cache-index.ts` | new | yes (`staticFile`) | Per-tab manifest memo |
| `fonts/font-steps.ts` | new | yes | Cache, CDN and custom steps; outcome classification; retry trigger; internal `class FontSuperseded extends Error` |
| `fonts/load-page-font.ts` | rewritten | yes | Public `loadPageFont()`, state machine, delay handles |
| `fonts/font-store.ts` | changed | no | Entry shape `@2` |
| `fetch-budget.ts` | changed | **no** (stays pure, as its header says) | `planFontLoad(isRendering, timeout, now)` and `finalStepBudget(plan, now)`. Callers pass `isRendering` in. `getLoadBudget` stays for the data loader. |
| `mushaf/registry.ts` | changed | no | `fontUrl(page)` becomes `format(page)` + `cdnUrl(page)`. `CDN_FORMAT_EXCEPTIONS` is exported internally and typed `'woff'` only (today `'woff' \| 'ttf'`). |
| `component/hooks/use-font-gate.ts` | changed | yes | `useFontGate({mushaf, theme, page, fontSrc, label}) → {loaded, error, fontFamily, origin}`. It no longer takes `MushafLineData`. |
| `component/{LineRenderer,ResolveLine,MushafLine}.tsx` | changed | yes | Pass `fontSrc` through. Paint, fit and register palettes with `gate.fontFamily` (today `line.fontFamily`, `LineRenderer.tsx:66,69,134`). Set `data-font-origin`. `ResolveLine`'s early load uses the same `fontSrc`. |
| `resolve/{get-mushaf-lines,validate-line-data}.ts` | changed | no | The F removals |

### Font file identity

```ts
export type MushafFontFormat = 'woff2' | 'woff';
export type MushafFontFile = {
  /** Discriminant: header-line fonts (surah names, basmallah) can join later without a breaking change. */
  readonly kind: 'page';
  readonly mushaf: MushafId;
  readonly fontSet: MushafFontSet;
  readonly page: number;
  /** 'woff2', or 'woff' where QUL publishes no woff2 (qpc-v4-tajweed page 328). */
  readonly format: MushafFontFormat;
  /** Manifest key: 'p328'. */
  readonly id: string;
  /** 'p328.woff' */
  readonly fileName: string;
  /** Inside public/: 'mushaf-fonts/qpc-v4-tajweed/p328.woff'. Pass to staticFile(). */
  readonly path: string;
  /** QUL's CDN URL (`?v=3.1` on the colour set). */
  readonly cdnUrl: string;
};
```

- **Test-only CDN hook.** `cdnUrl` uses `globalThis[Symbol.for('remotion-mushaf-line-renderer/cdn-base@1')]` when it is set. The hook is undocumented: the render and Player harnesses set it from input props to point "the CDN" at a local server.
- **Keeping the two registries in step.** `scripts/lib/datasets.mjs` gets the p328 routing it lacks today. `registry.test.ts` checks that the two agree on all 1,208 files.

### Source specs, store keys and families

```ts
type FontSourceSpec =
  | {readonly kind: 'auto'}                                            // default cache, then CDN
  | {readonly kind: 'local'}                                           // default cache only
  | {readonly kind: 'cdn'}                                             // CDN only
  | {readonly kind: 'cache'; readonly base: string; readonly cdn: boolean} // cache at a given URL
  | {readonly kind: 'custom'; readonly urls: readonly string[]};       // a resolver's answer, in order
```

- **Normalisation.**
  - The resolver is called with the page's `MushafFontFile`. It must return a non-empty string or a non-empty array of non-empty strings.
  - Each URL, and `cache`, must be absolute (`http(s):`, `data:`, `blob:`) or root-relative (`/…`). `cache` loses any trailing `/`.
  - Anything else throws `BAD_FONT_SRC`, with the hint "wrap public/ paths in staticFile()".
  - Hooks and effects depend on `specKey`, never on the function's identity, so an inline arrow function does not cause a reload.
- **`'auto'` and `'local'`** are the `cache` form with the base taken from `staticFile()`. They call `staticFile(file.path)` and `staticFile('mushaf-fonts/<set>/manifest.json')` per URL, so the `remotion_staticFiles` lookup still applies.

| Spec | Store key | Family |
|---|---|---|
| `auto` | `qpc-v4-tajweed/10#auto` | `mushaf-qpc-v4-tajweed-p10` (unchanged, so `line.fontFamily` stays valid) |
| `local` | `…#local` | `…-p10-local` |
| `cdn` | `…#cdn` | `…-p10-cdn` |
| `cache` | `…#c:<base>\|<0/1>` | `…-p10-c<base36(fnv1a32(key))>` |
| `custom` | `…#u:<urls joined by \n>` | `…-p10-u<base36(fnv1a32(urls))>` |

- **Collision guard.** A family-to-key map throws `FONT_NOT_AVAILABLE` if two keys ever produce the same family.
- **Palettes** are keyed by family, so the palette store needs no change. For custom sources the palette ident contains `-u<hash>`.
- **A live `fontSrc` change on a mounted line** gives a new key and a new face, with no error. Today this Player case throws `FONT_URL_CONFLICT`.

**Store (`font-store.ts`)**
- The global becomes `Symbol.for('remotion-mushaf-line-renderer/font-store@2')`.
- Removed: `url` and `explicit`. Added: `spec`, `resolvedUrl`, `origin: 'local'|'cdn'|'custom'|null` and `tried: FontAttempt[]`.
- `generation`, `abort`, reuse of the deferred promise and the loader handle all stay.
- In `loadPageFont`, the replace/conflict branch (`load-page-font.ts:41-66`) is deleted. What remains: **adopt** when the entry is not in error, **restart the whole chain** when it is.

### Per-tab manifest memo (`cache-index.ts`)

```ts
export type FontCacheIndex =
  | {readonly kind: 'absent'; readonly manifestUrl: string; readonly reason: string; readonly at: number}
  | {readonly kind: 'manifest'; readonly manifestUrl: string; readonly entries: ReadonlyMap<string, FontCacheEntry>; readonly at: number};
export const getFontCacheIndex: (fontSet: MushafFontSet, manifestUrl: string,
  o: {budget: StepBudget; signal: AbortSignal; rendering: boolean; studio: boolean; reload?: boolean}) => Promise<FontCacheIndex>;
export const resetFontCacheIndex: () => void; // test hook
```

- **Storage.** `Symbol.for('remotion-mushaf-line-renderer/font-cache-index@1')`, keyed by the manifest URL (which already carries `/static-<hash>` or `/sites/<id>/`). The value is a promise, so ten pages loading at once make one fetch.
- **Request options.** `fetch(url, {cache: 'no-cache', credentials: 'same-origin'})`.
- **When the manifest counts as absent:**
  - a final status (below 500, except 408 and 429)
  - a 200 whose body is not JSON
  - JSON whose `kind` is not ours
  - an unknown `schema` major version (warned once)
- **When the manifest is ours but invalid** (wrong `fontSet`, a bad entry): the memo holds a rejection with `FONT_CACHE_INVALID`.
- **What is kept, per environment:**

  | Environment | Definite outcome | Transient failure (408/429/5xx/timeout/network after the budget) |
  |---|---|---|
  | Rendering | kept for the tab | rejects and is **not** kept, so the chain treats it as transient (§Transient failures) |
  | Studio (`isStudio`) | kept; revalidated on the next font load if older than 5 s. Studio sends no ETag, so each revalidation downloads the whole file (about 110 KB per full set). | `absent` for this load, with a warning logged once |
  | Player and everything else | kept for the tab | `absent`, kept for 30 s, then retried on the next load, with a warning logged once |

- **Entry validation.** `file` must match `^p([1-9]\d{0,2})\.(woff2|woff)$`, the captured page must equal the key, `bytes` must be a positive integer and `sha256` must be 64 hex characters. The runtime reads only `kind`, `schema`, `fontSet` and `files[*].{file, bytes, sha256}`, and ignores unknown keys.

### The source chain and how each outcome is handled

| Spec | Steps |
|---|---|
| `auto` / `{cache, cdn: true}` | cache step (only if the manifest lists the page), then the CDN step |
| `local` / `{cache, cdn: false}` | cache step only. With no manifest at all, it fetches `<base>/<set>/<fileName>` directly, so hand-copied files work in strict mode. |
| `cdn` | CDN step |
| `custom` | one step per URL, in order |

**Each step does the following:**
1. Fetch. Cache steps use `credentials: 'same-origin'`; CDN and custom steps use `mode: 'cors', credentials: 'omit'`.
2. Sniff the magic bytes, and check that `declaredFontLength` equals the byte length.
3. Cache steps only: the size equals `entry.bytes`, and the sha256 equals `entry.sha256` when `isSecureContext && crypto.subtle`.
4. `new FontFace(family, bytes, pinnedDescriptors)`, then `await face.load()`.

Only after the whole chain has succeeded does the loader check the generation, call `document.fonts.add`, and assert `has(face)`.

| Outcome | Cache step, may fall back | Cache step, strict | Final step (CDN, or last custom URL) | Earlier custom URL |
|---|---|---|---|---|
| Manifest absent, or page not listed | skipped: CDN, no font request | absent: fetch directly; not listed: `FONT_CACHE_MISS`, 0 requests | – | – |
| Final status (401/403/404/410…) | **miss**: CDN; warn once per set if the page was listed ("run `verify --fix`") | `FONT_CACHE_MISS` | `FONT_HTTP` | miss: next URL, warn once |
| 200 but not a font | **miss**: CDN; warn once per set | `FONT_CACHE_MISS` | `FONT_INVALID` (adds "an HTML page: your host answers missing files with index.html" when the body starts with `<`) | miss: next URL |
| Size or sha256 mismatch, still wrong after reloading **both** the manifest and the file with `cache: 'reload'` | `FONT_CACHE_INVALID` | `FONT_CACHE_INVALID` | – | – |
| Magic present, but the declared length is wrong or `face.load()` rejects | `FONT_CACHE_INVALID` | `FONT_CACHE_INVALID` | `FONT_PARSE` | `FONT_PARSE` (loud) |
| Transient, after the step's attempts | **rendering: retry trigger** (below). **Preview: CDN**, warn once. | rendering: retry trigger. Preview: `FONT_HTTP`/`FONT_TIMEOUT`/`FONT_NETWORK` | rendering: retry trigger. Preview: error | rendering: retry trigger. Preview: next URL, warn |
| Manifest ours but invalid | `FONT_CACHE_INVALID` | `FONT_CACHE_INVALID` | – | – |
| `FONT_NOT_AVAILABLE` (the browser refused the face) | fatal | fatal | fatal | fatal |

**Studio hint.** When `'auto'` goes to the CDN because the manifest is absent, and only when `isStudio`, this is logged once per tab:

> Mushaf fonts load from QUL's CDN. For faster, offline renders: `npx remotion-mushaf-line-renderer sync --set qpc-v4-tajweed`

It is never logged during renders or in Player host apps.

### Transient failures while rendering

1. **In-tab attempts.** The manifest and cache-file steps get 3 attempts, 3,000 ms each, with a backoff of 250 ms and then 750 ms (±20% jitter). Every attempt is clamped to the deadline. The final step's budget is below.
2. **Retry trigger.** When a step's attempts are used up by transient outcomes (or the deadline leaves under 4,000 ms for the final step), the loader:
   - does **not** call `cancelRender` and does **not** set the entry to `error`. The entry stays `loading`, rows stay hidden, and every existing handle stays blocked.
   - creates, at most once per tab: `delayRender('Mushaf font <family>: <reason, e.g. HTTP 503 for /public/mushaf-fonts/qpc-v4/p10.woff2, 3 attempts>. Retrying the frame in a fresh tab once; not falling back to QUL's CDN while rendering. Fix: check the server that serves public/, raise --timeout, or use fontSrc "cdn".', {timeoutInMilliseconds: 2_500, retries: 1})`.
   - Remotion times it out after 500 ms.
     - **First attempt:** the error carries `DELAY_RENDER_RETRY_TOKEN`, so the renderer replaces the tab and renders the frame again, with fresh memos.
     - **Second attempt** (`remotion_attempt = 2`, so no retries left): Remotion fails the render with `A delayRender() "<our label>" was called but not cleared after 500ms`.
3. **Why tabs still agree.** A tab that hits a transient failure never renders the frame, and every tab that does render took its source from definite answers only. This holds on Lambda too, because the frame retry happens inside the chunk's `renderMedia`.
4. **Definite failures** still call `cancelRender(error)` exactly once, with the loader handle left blocked so that our message wins, as today. Definite failures are: `FONT_CACHE_MISS`, `FONT_CACHE_INVALID`, a final `FONT_HTTP`, `FONT_INVALID`, `FONT_PARSE` and `FONT_NOT_AVAILABLE`.
5. **The cost of `'auto'` in a render.** It adds one same-origin request per set per tab (a 404 or 403 when there is no cache). The tab already loads `index.html` and the bundle from that same origin. `fontSrc: 'cdn'` skips the request.

### Time budget (`fetch-budget.ts`, pure)

```ts
export type StepBudget = {readonly attempts: number; readonly perAttemptMs: number; readonly backoffMs: readonly number[]};
export type FontLoadPlan = {readonly deadline: number | null; readonly manifest: StepBudget; readonly cacheFile: StepBudget};
export const planFontLoad: (isRendering: boolean, puppeteerTimeout: number | undefined, now: number) => FontLoadPlan;
/** null → the remaining time is under 4,000 ms: treat as transient (retry trigger). */
export const finalStepBudget: (plan: FontLoadPlan, now: number) => StepBudget | null;
```

**While rendering**
- `deadline = start + (timeout ?? 30_000) − 4_000`, which is the handle's timeout minus 2 s of slack.
- Manifest and cache-file steps: `{attempts: 3, perAttemptMs: 3_000, backoffMs: [250, 750]}`, clamped to the deadline.
- The final step is sized when it starts, from `remaining = deadline − now`:

  | Remaining | Final step |
  |---|---|
  | ≥ 8,500 ms | `{attempts: 2, perAttemptMs: floor((remaining − 500) / 2), backoffMs: [500]}` |
  | 4,000–8,499 ms | `{attempts: 1, perAttemptMs: remaining}` |
  | < 4,000 ms | `null` (treated as transient) |

- At the default 30 s, after an instant miss, each CDN attempt gets **12,750 ms, exactly as today**. No path ever runs past the deadline at any `--timeout`.

**Outside rendering:** manifest `{2, 5_000, [250]}`, cache file `{2, 8_000, [250]}`, final step `{3, 15_000, [500, 500]}` (today's values). There is no deadline.

`getFontLoadBudget` (used only in tests) is removed.

### Delay handles and labels

- **Loader handle:** `delayRender(…, {retries: 1})`, one per loading period.
  - Label: `Loading mushaf font mushaf-qpc-v4-tajweed-p10 (auto): /public/mushaf-fonts/qpc-v4-tajweed/p10.woff2 if cached, else https://static-cdn…/p10.woff2?v=3.1`.
  - The comment at `load-page-font.ts:111-113` is corrected: `retries: 1` only helps when a handle actually times out, which the deadline prevents. The retry trigger is the mechanism.
- **Component handle** (`useDelayRender`): `<MushafLine> page 10 line 3: waiting for font mushaf-qpc-v4-tajweed-p10 (<same description>)`.
- **Retry trigger:** described in §Transient failures.

### Behaviour in each environment

| Environment | Manifest URL | A missing file looks like | Notes |
|---|---|---|---|
| Studio | `/static-<hash>/mushaf-fonts/<set>/manifest.json` | 404 text | Revalidates every 5 s. A secure context, so hashes are checked. **Follows symlinks, unlike renders**, so a symlinked cache works in Studio but falls back to the CDN in renders. `status` and `verify` flag symlinks. |
| CLI render / `renderMedia` | `/public/mushaf-fonts/…` | 404 JSON; a symlinked file is also 404 | CLI renders symlink the live `public/`, so **do not run `sync --refresh`, `--prune` or `clean` during a render**. `bundle()` deep-copies, so run `sync` before `bundle()`. |
| Lambda | `/sites/<id>/public/mushaf-fonts/…` | S3 403 (to be verified) or 404; both are a miss | Run `sync` before `deploySite`; redeploys upload only changed files. Each full set adds about 100 KB to `index.html` (the inline file list) and costs one manifest GET per tab. In a VPC without outbound access, use `'local'`. |
| Cloud Run (alpha) | `/<bucket>/sites/<id>/public/…` | GCS 404 (to be verified) | Best effort; same as Lambda |
| Player on Vite / single-page-app hosts | `/mushaf-fonts/…` | 200 HTML (with a root `index.html`) or 404 | Run `sync --public-dir <host static folder>`. For a host under a sub-path (Next.js `basePath`): `fontSrc={{cache: '/docs/mushaf-fonts'}}`. Warm up with `loadPageFont({…, fontSrc})` using the same value. With a CSP, allow `connect-src static-cdn.tarteel.ai`, or use `'local'`. |
| Node | – | – | The `FontFace` guard stays: `{fontFamily: familyFor(spec), waitUntilDone: resolved, origin: () => null}` |
| `@remotion/web-renderer` | as in the Player | – | Untested, including COLR glyphs and the retry trigger (client-side rendering sets the cancel flag instead of retrying). Documented as untested. |

### Errors

- **Codes.**
  - New: `BAD_FONT_SRC`, `FONT_CACHE_MISS`, `FONT_CACHE_INVALID`, and `DATA_NOT_CACHED` in M6.
  - Removed: `BAD_FONT_URL`, `FONT_URL_CONFLICT`, `FONT_SUPERSEDED`. The last one becomes `class FontSuperseded extends Error` in `font-steps.ts`: it is not a `MushafError`, `isMushafError` returns false for it, and it never escapes, because the generation check drops it.
- **`details`** on every font error: `{fontSet, page, fontSrc: specKey, source: 'local'|'cdn'|'custom', url, status?, attempt?, tried: FontAttempt[]}`, where `FontAttempt = {source, url, outcome: 'hit'|'absent'|'not-listed'|'final-status'|'not-a-font'|'mismatch'|'parse'|'transient', status?, ms}`.
- **Every message ends with a `Fix:` line.** Examples:
  - `FONT_CACHE_MISS`: "qpc-v4-tajweed page 10 is not in the font cache (public/mushaf-fonts/qpc-v4-tajweed/manifest.json does not list it) and fontSrc is 'local'. Fix: `npx remotion-mushaf-line-renderer sync --set qpc-v4-tajweed --pages 10`, then re-bundle or redeploy; or use fontSrc 'auto'."
  - `FONT_CACHE_INVALID`: "…/p10.woff2 does not match its manifest (sha256 expected 3f2a…, found 91c0…, 88,123 bytes). Not falling back to QUL's CDN: a file that is present but wrong is an error. Fix: `npx remotion-mushaf-line-renderer verify --fix`."
  - Final CDN failure: "Tried /public/mushaf-fonts/qpc-v4/p10.woff2 (not cached) → https://…/p10.woff2 (timed out after 12,750 ms, attempt 2/2). Fix: `… sync --set qpc-v4 --pages 10`, or raise --timeout."
- **Texts that go away:** the "check the url override" and "mirror … via staticFile()" hints at `load-page-font.ts:231,257,272,278`.
- **DOM contract:** the line root gets `data-font-origin="local|cdn|custom"` once its font has loaded.

### Guarantees

- **G1:** No line is ever painted in a fallback font. The row stays hidden until its own face has loaded, the face is added only after it parses, and a loaded face is never replaced.
- **G2:** Every render tab that renders a frame took the page's source from definite answers only. A transient answer triggers a fresh-tab retry or fails the render; it never leads to a CDN load.
- **G3:** Cached bytes are the recorded bytes. The size is always checked; sha256 is checked in secure contexts. On a mismatch the manifest and file are reloaded once, then it is an error.
- **G4:** A line's font depends only on its own props and data. Families and keys are per source.
- **G5:** A missing cache falls back silently; a wrong cache is a loud error.

**Not guaranteed**, and documented as such:
- Cached bytes may differ from today's CDN bytes after QUL rebuilds a page in place. Mitigations: `verify --remote`, `sync --refresh`, and `'local'` for byte-reproducible renders.
- Studio and renders can differ for symlinked files.
- A `sync` that mutates the cache during a CLI render can change what later tabs see.

The README's "order-independent … every Lambda chunk behaves the same" claim is reworded to G2 and G4.

## Public API changes and migration

In `pkg/src/types.ts`:

```ts
export type MushafFontFormat = 'woff2' | 'woff';
export type MushafFontFile = { /* as in Runtime design */ };

/**
 * Your own URL(s) for a page font. One URL is used as it is (no fallback). An array is tried in order: a URL whose
 * file is missing (final HTTP status, or not a font) falls through to the next; while rendering, a transient error
 * does not. Called during render: must be pure. Build it from `file.path` / `file.fileName` (page 328 of the colour
 * set is `.woff`). Not serialisable: not for inputProps.
 */
export type MushafFontResolver = (file: MushafFontFile) => string | readonly string[];

/** A font cache served at another URL (a Player host under a sub-path, a private mirror). Serialisable. */
export type MushafFontCache = {
  /** URL of the folder that holds `<fontSet>/manifest.json`, e.g. '/docs/mushaf-fonts'. */
  readonly cache: string;
  /** Default true: pages the cache does not list come from QUL's CDN. false behaves like 'local'. */
  readonly cdn?: boolean | undefined;
};

/**
 * Where a page font comes from.
 * - 'auto' (default): public/mushaf-fonts when its manifest lists the page (filled by
 *   `npx remotion-mushaf-line-renderer sync`), else QUL's CDN. A missing or partial cache never breaks a render;
 *   a cache that is present but wrong throws FONT_CACHE_INVALID.
 * - 'local': the cache only (FONT_CACHE_MISS when the page is not there). For byte-reproducible or offline renders.
 * - 'cdn': QUL's CDN only.
 * - MushafFontCache / MushafFontResolver: see those types.
 * Each source loads its own FontFace, so lines with different sources never affect each other.
 */
export type MushafFontSrc = 'auto' | 'local' | 'cdn' | MushafFontCache | MushafFontResolver;
export type MushafFontOrigin = 'local' | 'cdn' | 'custom';
export type GetMushafFontFileOptions = MushafSelection & {readonly page: number};

export type LoadPageFontOptions = {
  readonly mushaf?: MushafId | undefined;
  readonly theme?: MushafThemeSelection | undefined;
  readonly page: number;
  /** Default 'auto'. Pass the same value as the <MushafLine fontSrc> you are warming up. */
  readonly fontSrc?: MushafFontSrc | undefined;
};
export type LoadedPageFont = {
  /** 'mushaf-<fontSet>-p<page>' for 'auto'; suffixed for other sources. */
  readonly fontFamily: string;
  readonly waitUntilDone: () => Promise<void>;
  /** Where the font was loaded from; null until loaded, and always null on the server. */
  readonly origin: () => MushafFontOrigin | null;
};

// MushafLineCommonProps (both forms): + `readonly fontSrc?: MushafFontSrc | undefined;`
// MushafLineData: delete `fontUrl`; `fontFamily` doc → "the family under fontSrc 'auto'". `version` stays 3.
// GetMushafLinesOptions: delete `fontUrl`. Delete `MushafFontUrl`.
// MushafFontSet doc (types.ts:73-77): 'fonts/<fontSet>/p<page>.woff2' → 'mushaf-fonts/<fontSet>/<fileName>'.
```

In `pkg/src/index.ts`:
- Add `export {getMushafFontFile} from './fonts/font-file'`. It is pure and Node-safe.
- Add the types `GetMushafFontFileOptions`, `MushafFontCache`, `MushafFontFile`, `MushafFontFormat`, `MushafFontOrigin`, `MushafFontResolver`, `MushafFontSrc`.
- Remove `MushafFontUrl`.
- `check-package.mjs` `expectedApi` gains `getMushafFontFile`.

Checks at runtime, for JavaScript callers:
- `line.fontUrl` makes `assertLineData` throw `BAD_LINE_DATA`: "fontUrl was removed in 0.4: pass fontSrc to `<MushafLine>` or loadPageFont(); resolve the line again."
- A `fontUrl` key passed to `getMushafLines`, or a `url` key passed to `loadPageFont`, throws `BAD_FONT_SRC`.

**Migration** (CHANGELOG 0.4.0):

```tsx
// 0.3: a hand-made mirror in public/fonts/
const lines = await getMushafLines({page: 10, theme, fontUrl: (p, s) => staticFile(`fonts/${s}/p${p}.woff2`)});
// 0.4: once, `npx remotion-mushaf-line-renderer sync --set qpc-v4-tajweed --from-dir public/fonts`, then delete public/fonts
const lines = await getMushafLines({page: 10, theme}); // <MushafLine line={…}/> finds public/mushaf-fonts ('auto')
```

```tsx
// 0.3
<MushafLine line={{...line, fontUrl: 'https://fonts.example.com/p10.woff2'}} />
// 0.4
<MushafLine line={line} fontSrc={() => 'https://fonts.example.com/p10.woff2'} />
<MushafLine line={line} fontSrc={(f) => [`https://fonts.example.com/${f.path}`, f.cdnUrl]} />
```

```ts
// 0.3
loadPageFont({page: 10, theme, url});
// 0.4 (no longer overrides other lines; use the same fontSrc as the lines it warms up)
loadPageFont({page: 10, theme, fontSrc: () => url});
```

```tsx
// Player host under a basePath (new)
<MushafLine line={line} fontSrc={{cache: '/docs/mushaf-fonts'}} />
```

| 0.3 | 0.4 |
|---|---|
| Catching `FONT_URL_CONFLICT` / `FONT_SUPERSEDED` | Delete the branch; neither can happen. |
| `BAD_FONT_URL` | `BAD_FONT_SRC` |
| Asserting the family `mushaf-<set>-p<page>` for a pinned line | Use `loadPageFont({…, fontSrc}).fontFamily`, or `data-font-origin`. |

## The CLI

### Synopsis (the help text is a string literal)

```
npx remotion-mushaf-line-renderer sync   [--set plain|tajweed|qpc-v4|qpc-v4-tajweed|all[,…]] [--pages 1-20,187|all]
       [--source auto|package|cdn] [--from-dir <dir>] [--refresh] [--verify] [--prune] [--no-gitignore]
       [--public-dir <dir>] [--cdn-base <url>] [--concurrency <n>] [--dry-run] [--json] [--quiet]    (alias: preload)
       M6 adds: [--no-data] [--data-from-dir <dir>]
npx remotion-mushaf-line-renderer status [--set …] [--pages …] [--check] [--public-dir …] [--json]
npx remotion-mushaf-line-renderer verify [--set …] [--remote] [--fix] [--public-dir …] [--json]
npx remotion-mushaf-line-renderer clean  (--set … [--pages …] | --all) [--yes] [--dry-run] [--public-dir …]
npx remotion-mushaf-line-renderer --help | --version
```

**Selection**
- `--set` defaults to the sets whose fonts package is installed, plus the sets already cached.
- If that is empty, the command exits 2 and prints:

  | Set | Used by | Size |
  |---|---|---|
  | `qpc-v4` | theme `plain` | 42.9 MB |
  | `qpc-v4-tajweed` | every other theme | 50.9 MB |
  | `all` | both | 93.8 MB |

  Every `bundle()` copies all of `public/`, so 94 MB must never arrive by accident.
- `plain` and `tajweed` are aliases for the set ids.
- `--pages` defaults to `all` and uses the syntax of the existing `parsePageList` (`scripts/lib/cli.mjs:23-34`).

**`sync` flags**

| Flag | Effect |
|---|---|
| `--source auto` (default) | Copy from the installed fonts package. Download from the CDN when the package is not installed, and for any file the package lacks (with a warning). |
| `--source package` / `--source cdn` | Strict: use only that source. |
| `--from-dir <dir>` | Adopt a folder laid out as `<fontSet>/p<page>.<ext>`. Records `source: dir` and warns that the files were not checked against a reference. |
| `--refresh` | Package source: compare each file's sha256 with the package manifest. CDN source: conditional GET with `If-None-Match: "<md5>"` (the ETag is the MD5 of the file). Files that changed are replaced. |
| `--verify` | Re-hash existing files before skipping them. The default skip test is cheap: an entry exists and the size matches. |
| `--prune` | Delete cached pages of the selected sets that fall outside `--pages`. |
| `--cdn-base` | For tests and private mirrors. |

**Other commands**

| Command | What it does |
|---|---|
| `status` | Per set: pages cached, bytes, sources, manifest health, drift against the installed package, the URL `staticFile()` will produce, and a symlink warning. `--check` exits 3 unless the selection is complete (the CI gate before a `'local'` deploy). |
| `verify` | Re-hashes everything offline, flags symlinks and reports orphans. `--remote` compares CDN HEAD ETags with the recorded md5s. `--fix` fetches bad or missing files again. |
| `clean` | Removes pages or whole sets, and folders that become empty. |

### Finding the project, `public/` and Studio

- **Project root:** `findRemotionRoot(cwd)`, Remotion's own rule (nearest `package.json`, at most 5 levels up).
- **Cache folder:** `--public-dir` (relative to the cwd), else `<root>/public`, created if missing. The first two output lines are always the absolute project path and cache path.
- **Warnings:**
  - The root's `package.json` lists none of `remotion`, `@remotion/player` or `remotion-mushaf-line-renderer`.
  - `remotion.config.*` contains the text `setPublicDir(` (found by reading the file, never by running it).
  - The CLI's version differs from the installed package's version.
- **Studio detection:** `GET http://127.0.0.1:<3000…3009>/__remotion_config` with a 300 ms timeout. If `isRemotion && cwd === root`, the command warns: "Remotion Studio is running on :3000. It rescans public/ once per written file (about 12 s and 110 MB of updates to each Studio tab for both sets on Linux). Stop Studio for large syncs, or let it catch up." The warning does not block.
- **`--refresh`, `--prune` and `clean`** also print: "Do not run this while a render of this project is running (CLI renders serve public/ live)." A running render server cannot be detected: it uses an ephemeral port and has no identifying route.

### Where files come from

- **Fonts package** (`cli/lib/fonts-package.ts`):
  - Resolution: `createRequire(<root>/package.json).resolve(`${name}/package.json`)` first, then `createRequire(import.meta.url)`. The second covers a pnpm or Bun workspace run from its root, and pnpm with the optional peer.
  - The package's `manifest.json` must have `schema === 1` and the right `fontSet`.
  - If the package names a different file than the registry (for example a change in p328's format), that page comes from the CDN, with a warning.
  - Copying is **file by file** (`fs.promises.copyFile` with `COPYFILE_FICLONE`, falling back to read and write), then sha256 is checked. Never `fs.cpSync` (it fails inside Yarn PnP zips) and **never a symlink** (the SSR server returns 404 for symlinks).
- **CDN** (`cli/lib/http.ts`):
  - Retries only 408, 429 (honouring `Retry-After` up to 30 s), 5xx, network errors and timeouts: 4 attempts, backoff 0.5, 1 and 2 s with jitter, **no sleep after the last attempt**, 30 s per attempt.
  - 401, 403, 404 and 410 are final.
  - `accept: */*`, and an honest user agent: `remotion-mushaf-line-renderer/<v> (+https://github.com/tlawat/remotion-mushaf-line-renderer)`.
  - Each response is checked: magic bytes match the expected format, the declared length equals the body, and a strong ETag equals `md5(body)` (one retry on mismatch, then the file fails).
  - p328 requests `woff/p328.woff?v=3.1` directly.
- **Concurrency:** 8 for the CDN, 16 for copies.

### Files written, and the cache manifest

```
<public>/mushaf-fonts/
  .gitignore            "*" (default; skipped with --no-gitignore)
  LICENSE.md            font notice + QUL approval (from the package, or a built-in copy)
  qpc-v4/manifest.json, qpc-v4/p1.woff2 … p604.woff2
  qpc-v4-tajweed/manifest.json, …/p327.woff2, p328.woff, p329.woff2 … p604.woff2
```

```ts
// src/fonts/cache-format.ts (JSON Schema in docs/schemas/font-cache-1.json, not shipped: the main tarball forbids .json)
type FontCacheManifest = {
  kind: 'remotion-mushaf-line-renderer/font-cache'; schema: 1; fontSet: MushafFontSet;
  generator: string;            // 'remotion-mushaf-line-renderer@0.4.0'
  updatedAt: string;            // changes only when an entry changes
  license?: string;             // '../LICENSE.md'
  sources: Record<string, {kind: 'package'; name: string; version: string} | {kind: 'cdn'; base: string} | {kind: 'dir'} | {kind: 'adopted'}>;
  files: Record<string /* 'p<page>' */, {file: string; bytes: number; sha256: string; md5: string; etag?: string; source: string; savedAt: string}>;
};
```

- No absolute paths are stored, because Player hosts serve this file publicly.
- Keys are sorted with one entry per line, so a second `sync` leaves the file byte-identical.

### Writing, idempotency and locking

- **Staging outside `public/`.** Files are written to `<root>/node_modules/.cache/remotion-mushaf-line-renderer/staging/<set>/`, or to `os.tmpdir()` when there is no `node_modules`. Each is verified, then moved into place with **one `rename` per file**.
  - If the rename fails with `EXDEV`, the fallback is a `.partial` file in the target folder, then a rename.
  - On Windows, a rename that fails with EPERM or EBUSY is retried 5 times over 1 s.
  - Studio's asset panel therefore never shows partial files.
- **The manifest is written once, at the end** (and on SIGINT/SIGTERM, with the completed entries). New files are invisible to the runtime until then.
- **When existing files are replaced** (`--refresh`, `--verify`, `verify --fix`), the order is:
  1. Write the manifest without those entries.
  2. Replace the files.
  3. Write the final manifest.

  An intermediate state therefore reads "not listed", which means a CDN load, never a `FONT_CACHE_INVALID`.
- **Lock:** `os.tmpdir()/remotion-mushaf-line-renderer-<sha1(publicDir)>.lock`, opened with `wx` and holding the pid. A lock whose pid is gone is taken over. It lives outside `public/`.
- **Start of each run:** leftover staging files are swept, then each entry is reconciled:
  - kept if its size matches (or its hash, with `--verify`)
  - a file with no entry is adopted if its magic bytes and declared length are valid (and its sha256 matches the package manifest when the package is installed)
  - an entry whose file is gone is fetched again
- **A run over a complete cache makes no network requests and no writes.**
- **FIPS mode:** if `createHash('md5')` throws, the command falls back to size, magic bytes and header length, and skips the ETag comparison with a warning.

### Output and exit codes

```
project  ~/video (package.json)
cache    ~/video/public/mushaf-fonts
source   remotion-mushaf-fonts-qpc-v4-tajweed@1.20260912.0 (QUL snapshot 2026-09-12); QUL's CDN for the rest
done  qpc-v4-tajweed  604 pages  50.9 MB  (598 copied, 6 up to date, 0 failed)
Studio and renders use the cache now. Lambda/Cloud Run: redeploy the site. Reload open Player tabs.
Every bundle() copies public/: this cache adds 50.9 MB, plus ~100 KB to each bundle's index.html (use --pages to cache less).
git ignores public/mushaf-fonts (its .gitignore): run sync in CI before bundling.
Fonts © King Fahd Glorious Qur'an Printing Complex, via QUL (qul.tarteel.ai). See public/mushaf-fonts/LICENSE.md.
```

- **Not a TTY:** progress lines at 25, 50, 75 and 100%, plus every failure with its URL and reason.
- **`--json`:** `{ok, project, cache, sets: [{fontSet, requested, upToDate, written, adopted, removed, failed: [{page, url, error}], bytes, sources}], data, warnings}`.
- **Proxy hint:** a network error while `HTTPS_PROXY` is set prints: "Node's fetch may ignore HTTPS_PROXY; install the fonts package through your package manager (`--source package`)".

| Exit code | Meaning |
|---|---|
| 0 | Success, including "nothing to do" |
| 1 | Some files failed (progress kept), a required source is missing, an I/O error, or the lock is held |
| 2 | Usage or environment error: bad flag, page list or set; no project found; `public/` not writable |
| 3 | A check failed: `status --check` or `verify` |
| 130 | Interrupted (the manifest is flushed first) |

### Build and shipping

- **Source:** `pkg/cli/{index.ts, commands/{sync,status,verify,clean}.ts, lib/{args,project,studio,pages,http,pool,hash,fsx,manifest-io,progress,fonts-package,pm,version}.ts}`.
  - It imports only `node:*` and the shared Remotion-free modules: `src/mushaf/registry.ts`, `src/fonts/{font-file,font-magic,cache-format,font-packages}.ts`, `src/errors.ts`, `src/hash.ts`. It never imports `src/index.ts`.
  - Module functions accept `cdnBase?`, `fetch?` and `now?` for tests.
- **`cli/lib/version.ts`:** `declare const __PKG_VERSION__: string | undefined; export const VERSION = typeof __PKG_VERSION__ === 'string' ? __PKG_VERSION__ : '0.0.0-dev';`. The vitest `cli` project also sets `define`.
- **`pkg/tsup.config.ts`, a third config:**

  ```ts
  {entry: {cli: 'cli/index.ts'}, format: ['esm'], platform: 'node', target: 'node20', outDir: 'dist/cli',
   outExtension: () => ({js: '.mjs'}), splitting: false, dts: false, clean: false, sourcemap: false,
   banner: {js: '#!/usr/bin/env node'}, define: {__PKG_VERSION__: JSON.stringify(pkg.version)}}
  ```

  The output must be `.mjs` because the package has no `"type"`. tsup 8.5.1 sets mode 0755 on files that start with a shebang.
- **`pkg/package.json`:** `"bin": {"remotion-mushaf-line-renderer": "./dist/cli/cli.mjs"}`. From M4, `peerDependencies` and `peerDependenciesMeta.optional` for both fonts packages. `engines` stays `>=20`.
- **Typecheck:** a new `pkg/tsconfig.cli.json` (`types: ["node"]`, covering `cli/` and the shared modules); `pkg/tsconfig.json` gets `types: []`. The root `typecheck` script runs both.
- **`check-package.mjs` additions:**
  - `dist/cli/cli.mjs` exists, has the shebang, and contains no `require(`, `from "remotion"` or `react`. It is at most 96 KB.
  - `--help` exits 0 offline, `--version` equals `package.json`, and `preload --help` works.
  - `sync --set qpc-v4 --pages 1 --source cdn --dry-run --public-dir <tmp>` exits 0 offline and writes nothing.
  - `dist/{esm,cjs}/index.*` contain no `node:` imports.
  - `mustShip` includes `package/dist/cli/cli.mjs`.
  - From M4: both peers are optional.
  - The leak rule stays: no fonts and no `.json` in the main tarball.
- **Docs** show `npx`, `pnpm exec`, `yarn remotion-mushaf-line-renderer` (PnP) and `bunx`. There is no `postinstall`.

## The fonts package

- **Names:** `remotion-mushaf-fonts-qpc-v4` and `remotion-mushaf-fonts-qpc-v4-tajweed`. Both were free on npm on 2026-09-23. They are defined once, in `src/fonts/font-packages.ts`.
- **Layout** (`packages/fonts-<set>/`): `package.json`, `index.cjs`, `index.d.ts`, `manifest.json` (committed), `LICENSE.md`, `NOTICE.md`, `README.md`, `CHANGELOG.md`, and `fonts/<set>/p1.woff2 … (p328.woff) … p604.woff2`. The `fonts/` folder is gitignored and filled by the tool. It uses the same layout as the cache, so copying needs no path mapping.

```json
{
  "name": "remotion-mushaf-fonts-qpc-v4-tajweed",
  "version": "1.20260912.0",
  "description": "QUL's KFGQPC V4 tajweed (COLR/CPAL) page fonts, 604 files, unmodified. Copied into public/ by `npx remotion-mushaf-line-renderer sync`; never imported at runtime.",
  "license": "SEE LICENSE IN LICENSE.md",
  "repository": {"type": "git", "url": "https://github.com/tlawat/remotion-mushaf-line-renderer.git", "directory": "packages/fonts-qpc-v4-tajweed"},
  "files": ["fonts", "manifest.json", "index.cjs", "index.d.ts", "LICENSE.md", "NOTICE.md", "CHANGELOG.md"],
  "main": "./index.cjs", "types": "./index.d.ts",
  "exports": {".": {"types": "./index.d.ts", "default": "./index.cjs"}, "./package.json": "./package.json",
              "./manifest.json": "./manifest.json", "./fonts/*": "./fonts/*"},
  "sideEffects": false, "preferUnplugged": true,
  "mushafFonts": {"fontSet": "qpc-v4-tajweed", "snapshot": "2026-09-12", "manifestSchema": 1},
  "scripts": {"prepack": "node ../../scripts/fonts-package.mjs verify qpc-v4-tajweed"},
  "publishConfig": {"access": "public", "provenance": true}
}
```

- **`index.cjs`** runs in Node only, and gives the package a functional entry (npm open-source terms, line 118): `module.exports = {fontSet, fontsDir: path.join(__dirname, 'fonts', fontSet), manifest: require('./manifest.json')}`.
- **Snapshot manifest** (exactly 604 entries):

  ```
  {kind: 'remotion-mushaf-fonts/snapshot', schema: 1, fontSet, snapshot: {date, cdnBase, query, checkedAgainst: {words, layout}}, license: {type: 'LicenseRef-KFGQPC', file: 'LICENSE.md', attribution}, totalBytes, files: {'p<page>': {file, bytes, md5, sha256}}}
  ```

  - **The first snapshot (2026-09-12)** takes `bytes` and `md5` from `scripts/cdn-etags.json`, where 1,207 of 1,207 woff2 ETags equal the file's MD5. `sha256` comes from the committed mirror. `p328.woff` comes from the mirror: 105,800 B, md5 `2af5d3636183097c610dfc2054c039a8`.
- **Versions: `<compat>.<YYYYMMDD>.<patch>`,** starting at `1.20260912.0`.
  - **compat** changes only when a snapshot needs a newer layout export than the main package pins.
  - **YYYYMMDD** is the QUL snapshot date.
  - **patch** is for packaging-only fixes.
  - The main package declares `"^1.20260912.0"` for each, as optional peers. npm, pnpm 10.34.5, Bun 1.3.11 and Yarn do not install optional peers.
- **`scripts/fonts-package.mjs`** (development tool, no dependencies):

  | Subcommand | What it does |
  |---|---|
  | `snapshot <set> [--check]` | HEAD survey of the CDN, downloads changed pages, runs the cmap coverage check, writes the manifest, bumps the minor to today's date, and prepends a CHANGELOG entry listing the changed pages. `--check` only reports. |
  | `fill <set> [--from <dir>]` | Fills `fonts/` from `--from` (the first publish uses `git archive 5588bfa example/public/fonts`), then from the previously published version (`npm pack <pkg>@<prev>`), then from the CDN. Every file must match the manifest's size, md5 and sha256. |
  | `verify <set>` | Used by `prepack` and CI: exactly 604 names (including `p328.woff`), sizes, md5, sha256, magic bytes, nothing extra. |
  | `check <set>` | `npm pack --dry-run --json`: only the declared files; tarball between 40 and 60 MB; every `exports` target exists. Has a metadata-only mode for when `fonts/` is empty. |

- **cmap coverage** (`scripts/lib/woff2-cmap.mjs`): brotli-decompress the WOFF2 file, read the table directory and the `cmap` table (WOFF2 never transforms it), and check every code point the pinned layout uses on that page. This replaces the ttf-only check at `scripts/lib/fonts.mjs:87-110`.
- **Licence:**
  - `LICENSE.md` has two parts, following `quran-qcf4`:
    - **(a) Font files:** © KFGQPC, all rights reserved; not under an open-source licence; distributed under QUL's approval (date, scope, reference to `docs/licensing/qul-approval.md`). It quotes the fonts' name-ID-10 notice word for word, in both variants: the Dar Almarifa Easy Quran credit and the tajweed contributors.
    - **(b) Code and manifest:** MIT.
  - `NOTICE.md`: the source (QUL, CDN pattern, snapshot date); the files are **unmodified** (p328 stays WOFF); the attributions.
  - The text is written by hand, because one page's name table has a corrupted string.
  - `sync` copies `LICENSE.md` into `public/mushaf-fonts/`.
- **Workflow `.github/workflows/fonts-packages.yml`:**
  - **Snapshot job:** manual dispatch plus a weekly `snapshot --check` for both sets, with drift reported in the job summary. A manual snapshot opens a PR (`contents: write`, `pull-requests: write`).
  - **Publish job:** manual dispatch with inputs `set`, `tag` (`next`|`latest`) and `dry_run` (default true); permissions `id-token: write` plus `NPM_TOKEN`. Steps: build the main package, `fill`, `verify`, `check`, `npm publish --provenance --tag <tag>`, then tag `fonts-<set>@<version>`.

## Data exports

Milestone M6. It can be dropped without affecting anything else.

- **Registry:** `DatasetDescriptor` gains `files: {words: {url, basename, bytes, sha256}, layout: {…}}`.
  - The basenames are `1748433334-i11ov-qpc-v4.json.zip` and `1748288079-a96tc-qpc-v4-tajweed-15-lines.db.zip`, from `registry.ts:50-51`.
  - `bytes` and `sha256` come from `cdn-etags.json#data`: 1,133,859 and 99,376 bytes.
- **Cache layout:** `public/mushaf-data/{.gitignore, manifest.json, qpc-v4/<pinned basename>}`. The manifest is `{kind: 'remotion-mushaf-line-renderer/data-cache', schema: 1, files: {'qpc-v4/words': {file, bytes, sha256, source, savedAt}, 'qpc-v4/layout': {…}}}`.
- **Types:** `MushafDataSrc = 'auto' | 'local' | 'cdn' | MushafDataSource`, and `MushafDataOptions.data?: MushafDataSrc` (default `'auto'`).
- **Runtime:** a new `src/data/data-src.ts` imports `staticFile` and is used only when `typeof window !== 'undefined'`. `fetch-budget.ts` and the rest of `load-layout.ts` stay pure.

  | Source | In a browser | In Node |
  |---|---|---|
  | `'auto'` | Reads `mushaf-data/manifest.json` once per tab (same memo and Studio-only revalidation as fonts). Only listed files are fetched locally; size and sha256 are checked (sha256 in secure contexts). **Any** local failure falls through to the pinned URL with a warning logged once: the bytes are pinned and verified, so the output cannot change. | Pinned URL only |
  | `'local'` | Unlisted or failing file → `DATA_NOT_CACHED` | Pinned URL only |
  | `'cdn'` | Pinned URL only | Pinned URL only |

  The layout store key uses the spec string, not the URLs it resolved to.
- **`resolveDataUrls`** (`load-layout.ts:58-65`) accepts the string forms and keeps rejecting other non-objects with `BAD_DATA_URL`.
- **`ResolveLine.tsx:31-33,48-52`:** keys on `dataKey(data)` (the string, or `words|layout`), and forwards `data` unchanged instead of rebuilding `{words, layout}`.
- **README:** "pure and Remotion-free" (`pkg/README.md:146`) becomes "pure: no `delayRender`, no React; in a browser they call remotion's `staticFile()` to find the local data cache".
- **CLI:** `sync` writes both exports unless `--no-data`.
  - The source is the pinned URL, or `--data-from-dir <dir>`, which accepts either `words.json.zip`/`layout.db.zip` or the pinned basenames. Everything is verified by sha256 against the registry.
  - `status` and `verify` cover the data too.
- **Example:** the committed mirror **stays at `example/public/data/qpc-v4/{words.json.zip,layout.db.zip}`**, so its consumers are unchanged:
  - `check-package.mjs:20,83-84,122`
  - `real-data.test.ts:22-24,53`
  - `player.spec.ts:10-17`
  - `render.test.ts:24-27`
  - `scripts/lib/data.mjs:15-16`
  - `qul-assets.yml:10,23,121,136`

  The gitignored `example/public/mushaf-data/` is generated by `bun run cache:fixtures` with `--data-from-dir example/public/data/qpc-v4`, which keeps it offline.

## Repository changes

| File | Change |
|---|---|
| `.gitignore` | **Commit 8:** add `**/public/mushaf-fonts/`. **Commit 17:** replace the "not redistributed / release checklist" block (`:12-35`) with a comment (the fixtures are committed under QUL's approval; the full sets ship only in the fonts packages, built in CI); remove the full-mirror negations; keep the negations for `pkg/test/fixtures/fonts/**`, add one for `example/public/test-fonts/**`, and keep `example/public/data/**` tracked. **Commit 20:** `packages/fonts-*/fonts/`. **M6:** `**/public/mushaf-data/`. |
| `example/public/fonts/` | Commit 17: `git rm` the 1,208 woff2/woff files; `git mv` the 8 ttf fixtures to `example/public/test-fonts/<set>/`. |
| `example/` | Remove `src/sources.ts#fontUrlFromPattern` and the `fontFilePattern` props (`ThreeLines.tsx:31,42,67-73`, `Recitation.tsx:19,42,61,110`); this also fixes the latent p328 bug. `src/harness/LineHarness.tsx`: `fontUrl` becomes a serialisable `fontSrc: 'auto'\|'local'\|'cdn'\|{urls: string[]}\|{cache: string; cdn?: boolean}\|null` plus `cdnBase: string\|null`; delete the render-time `loadPageFont({url})` at `:171`. `player/scenarios.ts:6,26,78,115-118` move to `/test-fonts/…` and `fontSrc`. `package.json`: `"sync": "remotion-mushaf-line-renderer sync"`, plus the fonts packages as `workspace:*` devDependencies (M4). Update `remotion.config.ts:5-8`, and `README.md:24,47,55,70-79`. |
| Root `package.json` | New scripts: `cache:fixtures` (built CLI: `sync --from-dir packages/remotion-mushaf-line-renderer/test/fixtures/fonts --set all --pages 1,10,187,604 --public-dir example/public --source cdn --cdn-base http://127.0.0.1:9` so it never goes online; `--data-from-dir example/public/data/qpc-v4` from M6), `sync:example`, `check:fonts-packages`, `test:cli-e2e`. `typecheck` also runs `tsconfig.cli.json`. `test` adds `--project cli`. Regenerate `bun.lock` for the two workspaces and fix its stale `0.1.0` (`bun.lock:44`). |
| `vitest.config.ts` | Project `cli`: `packages/*/test/cli/**/*.test.ts`, Node, no setup file, `define: {__PKG_VERSION__}`. Project `cli-e2e`: `packages/*/test/cli-e2e/**`, needs `dist`, not in `test`. The fonts-package tests go in the `scripts` project and import `src/fonts/font-file.ts`, not `dist`. |
| `biome.json` | Add `!packages/fonts-*/manifest.json` and `!packages/fonts-*/fonts`. `!**/public` is already excluded (`:16`). |
| `pkg/scripts/check-package.mjs` | The additions under §Build and shipping. Header: "ships code only; the fonts live in remotion-mushaf-fonts-*". The mirror `existsSync` gate (`:83-84,122`) fails when `CI` is set. |
| `scripts/lib/cli.mjs:36-68` | `fetchWithRetry`: no retry on 4xx, no sleep after the last attempt, `accept: */*`, honest user agent. |
| `scripts/lib/{verify,datasets}.mjs` | p328 routing; the stale `src/mushafs.ts` comment (`datasets.mjs:2,27`); `verify --all` through `runPool`. |
| `scripts/qul.mjs`, `scripts/lib/fonts.mjs` | Remove `mirror` and the example-wide `fonts` downloads (they write fixtures only). Remove the "development only" texts. |
| `scripts/cdn-etags.json`, `scripts/lib/etags.mjs`, `pkg/test/unit/cdn.test.ts` | Commit 19: `cdn.test.ts` checks `CDN_FORMAT_EXCEPTIONS` against both snapshot manifests; the fonts part of the survey, `qul etags` fonts mode and qul-assets' `--etags` are retired; the `data` part stays. |
| `.github/workflows/ci.yml` | Keep the order: `test` runs before `build`. After `build` and `check:package`: `bun run cache:fixtures` (replaces `:48-49`), `test:cli-e2e`, `check:fonts-packages` in metadata mode, then Playwright and render. Add a CLI job on Node 20, 22 and 24. Add a `network` job (nightly and on pushes to main): `sync --pages 1,10` from the real CDN, `verify --remote`, `@network` Playwright. Set `CI=1` so skip gates fail. |
| `.github/workflows/qul-assets.yml` | Remove `exit 0` (`:101-109`) and `git add example/public/fonts` (`:134-137`); point to `fonts-packages.yml`. `bun run test` there needs no `dist`. |
| New `.github/workflows/fonts-packages.yml` | As in §The fonts package |
| New `docs/licensing/qul-approval.md`, `docs/schemas/font-cache-1.json` | The approval record (who, when, scope, conditions) and the manifest schema |
| `pkg/README.md` | `:16-18` code only, with a pointer to the fonts packages. Remove the `fontUrl` examples (`:164-165,207`). **Rewrite Fonts (`:445-485`):** how a font is found, `sync`, the `fontSrc` table, each environment (Lambda, Cloud Run alpha, offline or VPC, Player on Vite or Next.js with `basePath` and CSP, Studio following symlinks), warm-up with the same `fontSrc`, bundle cost (bytes plus about 100 KB of `index.html` per set), "don't mutate the cache during a render", real sizes (median 71/85 KB, max 114 KB, not "about 300 KB"). Errors table (`:615-622`; delete the wrong `FONT_SUPERSEDED` row). DOM contract (`data-font-origin`). Data (M6), and the reworded `:146`. "Data and licences" (`:635-645`): serving `public/mushaf-fonts` publicly is redistribution under the same terms. |
| `README.md` (repo) `:58, 84-91` | Fonts come from QUL with approval, through a local cache or the CDN; the licence notice; the fonts packages. |
| `CONTRIBUTING.md` | `:3-4, 40, 81-83, 100-120, 172-180`: "Fonts: licence and packaging" (the main package is code only and `check:package` enforces it; fonts ship only in the two packages; snapshot, release and drift procedure; version rules; where the approval lives). Replace the `git rm` release checklist with the history decision (open question 3). Publishing covers three packages, fonts first. |
| `pkg/CHANGELOG.md` | 0.4.0: `fontSrc`, the cache, `sync`, per-source faces, the retry trigger, error codes, removals, the migration table, the fonts packages, data (M6). |
| `docs/architecture.md:7, 21-25, 58-65, 104-108` | The source chain, the outcome table, G1–G5 and their limits, the manifest, the retry trigger, the binary and the packages. |
| `docs/kfgqpc-v4-rendering-notes.md:159` | "20–30 MB" becomes "43 MB (plain) / 51 MB (tajweed)". |

## Test plan

### Unit tests (`pkg/test/unit`, jsdom)

**Helpers**
- Add `staticFile` (`p => (window.remotion_staticBase ?? '') + '/' + p`) to the full mock at `load-page-font.test.ts:19-27` and to `helpers/remotion-mock.tsx:73-96`. Also record the options passed to `delayRender`.
- `installFontFakes({routes: Record<pattern, Response | 'hang' | Error>, fallback})` routes by URL and returns real `Response` objects (headers, `json()`, `arrayBuffer()`).
- `crypto.subtle` can be stubbed or removed.

**`hash.test.ts`**
- Hex output equals today's palette idents.

**`font-file.test.ts`**
- All 1,208 files give the right `path`, `fileName`, `format` and `cdnUrl`.
- p328 is `.woff` in both the path and the URL.
- `?v=3.1` appears only on tajweed.
- It agrees with `datasets.mjs`.
- `getMushafFontFile` validation.
- The CDN-base hook.

**`font-magic.test.ts`**
- Takes over the `assertFontMagic` block from `load-page-font.test.ts:29,371-380`.
- Adds `declaredFontLength`.

**`font-source.test.ts`**
- Every form of `fontSrc`, including `{cache}` with a trailing `/`.
- A resolver returning `''`, `[]`, a non-string, a relative path, or throwing gives `BAD_FONT_SRC`.
- `specKey` is stable across new arrow functions.
- Families per source; a snapshot of hash values; the collision guard.

**`cache-format.test.ts`**
- The schema example is valid.
- An unknown schema counts as absent.
- A wrong `fontSet`, `../x.woff2`, `p10.ttf`, `p11.woff2` under the key `p10`, a bad hash, or a string for `bytes` are all rejected.
- Unknown keys are ignored.

**`cache-index.test.ts`**
- 404, 403, 410, 200 HTML and foreign JSON each give `absent`.
- A valid manifest gives `manifest`; one that is ours but invalid gives a memoised `FONT_CACHE_INVALID`.
- 503: rendering rejects without memoising; Studio gives `absent` with a warning; Player gives `absent` for 30 s.
- `no-cache` and `same-origin` are used.
- Ten pages loading at once make one fetch.
- **Studio** revalidates after 5 s. **Player: pages loaded 10 s apart make exactly one manifest request per set.**

**`fetch-budget.test.ts`**
- The CDN gets 12,750 ms at 30 s after an instant miss.
- Sizing after a 3 s miss.
- At `--timeout` 20, 30 and 60 s and for every mix of slow and transient attempts, no path passes `deadline`, and `finalStepBudget` returns `null` under 4,000 ms.
- Preview budgets are unchanged.

**`load-page-font.test.ts`** (rewritten): every row of the outcome table, both rendering and in preview, plus:

| # | Case | Expected |
|---|---|---|
| 1 | Local hit | 1 manifest request + 1 font request; `origin()` is `local`; 0 CDN requests; one `document.fonts.add` |
| 2 | Not listed | CDN, 0 local font requests |
| 3 | Manifest 404 or HTML | CDN, no per-page requests |
| 4 | Listed, but 404/403/410/HTML | CDN, plus one warning per set |
| 5 | Local 503 ×3 while rendering | **`cancelRender` not called; a retry-trigger `delayRender` with `{timeoutInMilliseconds: 2_500, retries: 1}`; entry stays `loading`; 0 CDN requests; one trigger per tab** |
| 6 | Local 503 then 200 while rendering | Loads locally in the same tab |
| 7 | The same as 5, in preview | CDN, plus a warning |
| 8 | sha256 mismatch, then a match after reload | Loads |
| 9 | sha256 mismatch after reload | `FONT_CACHE_INVALID`, `cancelRender` once, no CDN request |
| 10 | Truncated woff2 (declared length) | `FONT_CACHE_INVALID` |
| 11 | No `crypto.subtle` | Hash skipped; size still checked |
| 12 | `'local'`, no manifest | Fetches directly; a miss gives `FONT_CACHE_MISS` |
| 13 | `'local'`, page not listed | `FONT_CACHE_MISS` with 0 requests |
| 14 | `'cdn'` | Never requests the manifest |
| 15 | `{cache: '/docs/mushaf-fonts'}` | Reads `/docs/mushaf-fonts/<set>/manifest.json`; family suffixed `-c…`; `cdn: false` behaves like `'local'` |
| 16 | Custom single URL, 404 | `FONT_HTTP`, no fallback |
| 17 | Custom list | Falls through on a miss; `FONT_PARSE` is loud; transient while rendering gives the retry trigger |
| 18 | Two sources for one page | Two families and two faces, no error |
| 19 | Same source twice | Adopted, one fetch |
| 20 | Retry after an error | The whole chain runs again |
| 21 | p328 | Local path `.woff` |
| 22 | A local miss | Leaves no face behind |
| 23 | Labels | Name the chain |
| 24 | Server | No-op; `origin()` null |
| 25 | Runtime `url` key | `BAD_FONT_SRC` |
| 26 | Studio hint | Logged once, only when `isStudio` |
| 27 | Rejections | No unhandled rejection |
| 28 | Final CDN 5xx ×2 while rendering | Retry trigger (not `cancelRender`) |

**`mushaf-line.test.tsx`**
- `fontSrc` on both forms.
- `ResolveLine` warms up the same store key.
- `data-font-origin` is set.
- The row stays hidden until the font loads.
- **A live `fontSrc` change** switches family without throwing, and the palette rule follows.
- `line.fontUrl` gives `BAD_LINE_DATA` with the migration message.
- The fetch-count expectation at `:134` becomes manifest + font from commit 8.

**`get-mushaf-line(s).test.ts`**
- Delete the pinning tests (`:35-62`).
- A `fontUrl` option throws `BAD_FONT_SRC`.
- Update `:193,219`.

**`test/types/api.test-d.tsx`**
- `fontSrc` accepts the strings, `{cache}`, and resolvers returning a string or a readonly array.
- `file.kind` narrows.
- `LoadedPageFont.origin` exists.
- `@ts-expect-error` on `url`, `fontUrl` and `MushafFontUrl`.
- `MushafErrorCode` no longer contains `FONT_URL_CONFLICT`, `FONT_SUPERSEDED` or `BAD_FONT_URL`.
- M6: `<MushafLine page line data="local">`.

**M6 (`load-layout.test.ts`)**
- Browser `'auto'` reads the data manifest once, then fetches locally.
- An unlisted or mismatched file goes to the pinned URL.
- Node goes straight to the pinned URL.
- `'local'` gives `DATA_NOT_CACHED`.
- Store key by spec.
- `ResolveLine` key with string `data`.

### CLI tests (`pkg/test/cli`, Node, from source)

Temporary projects are created with `mkdtemp` plus a `package.json`; a `node:http` server on 127.0.0.1 stands in for the CDN through `--cdn-base`.

- **`args`, `pages`, `project`, `studio`:**
  - exit 2 for bad flags or page lists
  - `preload` is an alias; `plain`/`tajweed` are accepted
  - default sets come from what is installed and cached; with neither, exit 2 with the size table
  - the 5-level walk; `--public-dir`; every warning
  - a fake `/__remotion_config` server triggers the Studio warning only when `cwd` matches
- **`http`:**
  - a 404 is **requested once** and returns in under 100 ms
  - 503, 503, then 200 succeeds
  - `Retry-After` is honoured; a timeout; no sleep after the last attempt
  - 304 on `If-None-Match`
  - an ETag/MD5 mismatch is retried once, then fails
  - HTML is rejected
  - p328 requests `woff/p328.woff?v=3.1`
- **`sync`:**
  - From a fake fonts package (3 files), resolved from the root and from the CLI's own location.
  - From the fake CDN. From `--from-dir`.
  - **A second run makes 0 requests and leaves the manifest byte-identical.**
  - Adoption of unlisted files; a tampered file replaced with `--verify`; `--refresh` for both sources; `--prune`; `--dry-run` writes nothing.
  - **The manifest is written exactly once** in a clean run, and twice when files are replaced.
  - **No staging or `.partial` file ever appears under `public/`** (checked by an `fs.watch` observer).
  - **`fs.watch` events under `public/` ≤ files written + 5.**
  - An abort after N files leaves the manifest listing only complete files, and the rerun resumes.
  - A held lock gives exit 1; a stale lock is recovered.
  - `lstat` shows regular files only.
  - `.gitignore` and `LICENSE.md` are written.
  - A format mismatch between the package and the registry falls back to the CDN.
  - The written manifest passes `parseFontCacheManifest`.
- **`status`, `verify`, `clean`:** exit codes, `--check`, `--fix`, `--remote` drift, symlink detection in both `status` and `verify`, `--json` shape, removing folders that became empty.
- **M6:** data written and verified; `--data-from-dir` accepts both naming schemes; `--no-data`.

### CLI e2e (`pkg/test/cli-e2e`, needs `dist`; runs after `build` in CI)

- Spawns `dist/cli/cli.mjs` on Node 20, 22 and 24: `--help`, `--version`, `sync --from-dir` into a temporary project, `status --check`.
- `cli.network`, only when `MUSHAF_NETWORK=1`: pages 1 and 10 of both sets from the real CDN.

### Fonts packages (`scripts/test/fonts-packages.test.mjs`, `scripts` project, no `dist`)

- 604 entries; file names equal `fontFileFor()` from `src/fonts/font-file.ts`; hash formats; `totalBytes` equals the sum.
- `exports` resolves `./package.json`, `./manifest.json` and `./fonts/<set>/p1.woff2` through `createRequire`, on a temporary copy with stub files.
- `LICENSE.md` contains the KFGQPC notice and the approval reference.
- Full `verify` only when `fonts/` is filled.
- `snapshot` against a synthetic 3-page CDN; the WOFF2 cmap reader on a fixture woff2.

### Browser tests (Playwright on the example Player)

This harness has **no SPA fallback**: missing files return 404. `bun run cache:fixtures` runs first; before commit 17 a helper writes the fixture cache.

- **Cache hit:** page 10 under `'auto'` gives `data-font-origin="local"`. `page.route('https://static-cdn.tarteel.ai/**', abort)` proves there were zero CDN requests.
- **No manifest, 404 (left unrouted):** a CDN load (routed to fixture bytes with `access-control-allow-origin: *`), and one manifest request per set.
- **No manifest, HTML:** `page.route('**/mushaf-fonts/*/manifest.json', text/html 200)` gives a CDN load.
- **Listed file, 404 or HTML** (the second through `page.route`): a CDN load plus the warning.
- **Tampered file:** loads when a correct file is served on `cache: 'reload'`. If both copies are tampered: `[data-error="FONT_CACHE_INVALID"]`.
- **`'local'` miss:** `FONT_CACHE_MISS`. **`'cdn'`:** never requests `/mushaf-fonts`. **`{cache: '/sub/mushaf-fonts'}`:** a routed hit.
- **Player revalidation:** two page loads 10 s apart (fake clock) make one manifest request.
- **Changing `fontSrc` live:** no error, the new family, and the row hidden in between.
- **Existing assertions to update** (commit 5):
  - `fontsLoaded()` family equality at `player.spec.ts:97,180,185,325,507,515,521,670,700`: derive the expected family from the scenario's `fontSrc`, or assert `data-font-origin`.
  - Palette ident regexes at `:524,543,571`: allow the source suffix.
  - The `@network` family at `:875`: `-cdn`.
  - The route glob at `:172`: `**/test-fonts/qpc-v4-tajweed/p10.ttf` from commit 17.
  - `font-404`/`font-html` use `fontSrc: {urls: [...]}`.
  - The real-data tests use the interim `{urls: ['/fonts/qpc-v4-tajweed/p10.woff2']}` in commit 5, then `'auto'` plus `data-font-origin="local"` from commit 9.

### Render tests (`test/render/render.test.ts`)

The temporary `publicDir` is built by a helper in commit 10 and by the **built CLI** from commit 17.

1. **Local hit:** zero requests reach the local "CDN" server (set through `cdnBase`). The frames are **byte-identical** to a render with `fontSrc: () => staticFile('mushaf-fonts/qpc-v4-tajweed/p10.woff2')`.
2. **Chunk determinism:** frames 0–59 rendered in one call match, byte for byte, the same frames rendered by three `openBrowser()` instances with `frameRange` 0–19, 20–39 and 40–59.
3. **No cache:** the page is requested from the "CDN" server.
4. **`'local'` with the page missing:** `FONT_CACHE_MISS`.
5. **Tampered file:** `FONT_CACHE_INVALID`.
6. **S3-style server** (403 for missing files, extending the existing Lambda `publicPath` server): `'local'` gives `FONT_CACHE_MISS`; `'auto'` goes to the "CDN".
7. **Transient then healthy:** the local p10 returns 503 for its first 3 requests, then 200. **The render succeeds after a fresh-tab retry**; the server sees at least 4 requests; zero go to the "CDN"; the frames equal case 1.
8. **Transient forever:** local p10 always returns 503. The render fails, the message contains "Not falling back to QUL's CDN" and "Retrying the frame in a fresh tab once", and zero requests reach the "CDN".
9. **Stalled local server:** the render ends before `--timeout` through the retry trigger and then the failure; the message names the local URL.
10. **A symlinked file in `public/`:** a 404, which documents the "never symlink" rule.
11. **Lambda `publicPath` with a cache hit.**
12. **The existing explicit-source failure tests** move to `fontSrc`.

**Gates:** `hasFixtureFont` and `hasMirror` skip only when `CI` is unset. `FIXTURE_FONT` moves to `test-fonts/qpc-v4-tajweed/p10.ttf` in the same commit as the file.

### Manual checks before promoting the fonts packages to `latest`

- Install the main package alone with npm 10, pnpm 10 (a single project and a workspace root), Yarn 4 PnP and Bun 1.3: no fonts package gets installed.
- Install a fonts package and run `sync` with each package manager.
- Vite and Next.js (`basePath`) Player hosts.
- One real Lambda site, with and without a cache; record the S3 status for a missing file.
- Best effort, not blocking: one Cloud Run site (GCS status); `remotion@4.0.374` running the unit and Player suites.

## Milestones

Unless noted, every commit leaves these green: `check`, `test`, `test:types`, `typecheck`, `build`, `check:package`, the browser suite and the render suite.

**M-pre (no code; blocks only the M4 publish).** Record QUL's written approval in `docs/licensing/qul-approval.md` and confirm the package names.

**M0: groundwork, no behaviour change**

| # | Commit | Files |
|---|---|---|
| 1 | Stop retrying 4xx in the qul tools; `verify` and `datasets` know p328 | `scripts/lib/{cli,verify,datasets}.mjs`, `scripts/test/cli.test.mjs`, `qul-assets.yml:101-109` |
| 2 | One file identity per page font; move the magic check; shared FNV-1a | `src/hash.ts`, `src/fonts/{font-file,font-magic,palette-store}.ts`, `src/mushaf/registry.ts`, call sites in `load-page-font.ts`/`use-font-gate.ts`, `test/unit/{font-file,font-magic,registry,cdn,palette-store,load-page-font}.test.ts` (the magic block moves), `scripts/test/compile.test.mjs:190` |

**M1: sources and per-source faces (`'auto'` is the CDN step only for now)**

| # | Commit | Files |
|---|---|---|
| 3 | `fontSrc` types, normalisation, **additive** error codes (nothing removed yet) | `src/types.ts`, `src/errors.ts`, `src/fonts/font-source.ts`, test |
| 4 | Deadline budget, pure; `isRenderingNow()` in `fonts/rendering.ts` | `src/fetch-budget.ts`, `src/fonts/rendering.ts`, `fetch-budget.test.ts` (the old `getFontLoadBudget` stays until 5) |
| 5 | **Per-source faces and the `fontSrc` prop, in one commit** (store key, families, step runner, retry trigger, component wiring, removals). This avoids a red build between re-keying and consumers. | `src/fonts/{font-store,font-steps,load-page-font}.ts`, `hooks/use-font-gate.ts`, `component/{LineRenderer,ResolveLine,MushafLine}.tsx`, `types.ts`, `index.ts`, `errors.ts` (removals, `FontSuperseded`), `resolve/{get-mushaf-lines,validate-line-data}.ts`, `font-file.ts` (CDN hook), `check-package.mjs` (`expectedApi`), unit and type tests, `remotion-mock.tsx`, the example harness and sources, `scenarios.ts`, `player.spec.ts` (the assertion list above), `render.test.ts` (explicit cases, trigger case 28 at unit level) |

**M2: the local cache at runtime**

| # | Commit | Files |
|---|---|---|
| 6 | Cache manifest format and parser | `src/fonts/cache-format.ts`, `docs/schemas/font-cache-1.json`, test |
| 7 | Per-tab manifest memo, Studio-only revalidation | `src/fonts/cache-index.ts`, test |
| 8 | Cache step: `'auto'`/`'local'`/`{cache}`; integrity and reload; transient rule; Studio hint; `.gitignore` `**/public/mushaf-fonts/` | `font-steps.ts`, `load-page-font.ts`, `font-source.ts`, `errors.ts` messages, `.gitignore`, `load-page-font.test.ts`, `mushaf-line.test.tsx` (fetch counts) |
| 9 | Player cache scenarios (a helper writes the fixture cache from `pkg/test/fixtures/fonts`) | `test/browser/helpers/write-font-cache.ts`, Playwright global setup, `player.spec.ts`, `scenarios.ts` |
| 10 | Render tests 1–11 (the helper writes the cache into the temporary `publicDir`) | `render.test.ts` |
| 11 | Document font sources | `pkg/README.md`, `docs/architecture.md`, CHANGELOG draft |

After M2, the runtime is complete. A hand-written manifest works without the CLI.

**M3: the CLI**

| # | Commit | Files |
|---|---|---|
| 12 | Skeleton, build, binary, version | `pkg/cli/{index,lib/args,lib/version}.ts`, `tsup.config.ts`, `package.json` (`bin`), `tsconfig{,.cli}.json`, `check-package.mjs`, root `package.json`, `vitest.config.ts` (`cli`, `cli-e2e`), `ci.yml` (cli-e2e after build; the Node matrix) |
| 13 | Project and public-dir discovery; page lists; Studio detection | `cli/lib/{project,pages,studio}.ts`, tests |
| 14 | Cache writer (staging, atomic rename, single manifest write, lock) and `status` | `cli/lib/{manifest-io,fsx,hash}.ts`, `commands/status.ts`, tests |
| 15 | `sync` from the CDN and `--from-dir` | `cli/lib/{http,pool,progress}.ts`, `commands/sync.ts`, tests |
| 16 | `verify`, `clean`, `--refresh`, `--prune`, `--json`, exit codes | `commands/{verify,clean}.ts`, tests |
| 17 | Fixtures through the CLI; retire the mirror | Root `cache:fixtures`; `ci.yml:48-49`; `git rm` of the example mirror; `git mv` of the ttf fixtures to `example/public/test-fonts/`; `FIXTURE_FONT` and the route globs; CI hard-fail gates (`render.test.ts`, `player.spec.ts`, `real-data.test.ts`, `check-package.mjs`); render tests and Player setup use `cache:fixtures` output; `.gitignore`; `example/*`; `scripts/qul.mjs`, `scripts/lib/{fonts,cli}.mjs`; `qul-assets.yml:134-137`. **Browser and render now need `build` first, as they already do in CI.** |
| 18 | Document the command | `pkg/README.md`, `CONTRIBUTING.md` (scripts), `docs/architecture.md`, `example/README.md` |

**M4: the fonts packages**

| # | Commit | Files |
|---|---|---|
| 19 | Snapshot tooling, WOFF2 cmap reader, both manifests (`1.20260912.0`); retire the fonts survey | `scripts/fonts-package.mjs`, `scripts/lib/woff2-cmap.mjs`, `packages/fonts-*/manifest.json`, `scripts/test/fonts-packages.test.mjs`, `cdn.test.ts` rewrite, `scripts/lib/etags.mjs`, the fonts entries in `cdn-etags.json`, `qul-assets.yml` `--etags` |
| 20 | Package scaffolding, licence, notice | `packages/fonts-qpc-v4{,-tajweed}/**`, `.gitignore`, `biome.json`, `bun.lock` (and the `0.1.0` fix), root `check:fonts-packages`, `ci.yml` metadata mode |
| 21 | `sync` copies from an installed fonts package; optional peers | `cli/lib/{fonts-package,pm}.ts`, `src/fonts/font-packages.ts`, `pkg/package.json`, `example/package.json`, `check-package.mjs` (peer check), tests |
| 22 | Publish and drift workflows | `.github/workflows/fonts-packages.yml` |
| 23 | Licensing and contributor docs | `README.md`, `CONTRIBUTING.md`, `pkg/README.md` licences, `docs/licensing/qul-approval.md`, `docs/kfgqpc-v4-rendering-notes.md:159`, CHANGELOG 0.4.0 |

**M5: release.** Dry-run both fonts publishes, then publish to `next`. Run the manual matrix. Promote to `latest`. Publish the main package 0.4.0.

**M6: data exports (can be dropped)**

| # | Commit | Files |
|---|---|---|
| 24 | Local-first data exports | `registry.ts` (`files`), `src/data/{load-layout,data-src}.ts` (data manifest memo), `types.ts` (`MushafDataSrc`), `errors.ts` (`DATA_NOT_CACHED`), `ResolveLine.tsx` (data key), tests, README Data (`:146` reworded) |
| 25 | `sync` writes the data exports | `commands/sync.ts` (`--no-data`, `--data-from-dir`), CLI tests, `cache:fixtures` (`--data-from-dir example/public/data/qpc-v4`), `.gitignore` `**/public/mushaf-data/`, Player and render data-cache cases. `example/public/data/` stays in place. |

**Optional later:**
- **M7:** a Node API, `remotion-mushaf-line-renderer/node` exporting `syncMushafCache()` (on the model of `ensureBrowser()`), returning `{alreadyExisted}`.
- **M8:** a feature-detected `registerFontFace` call.
- `--surahs`.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| QUL's approval may not cover npm, users' public folders, or KFGQPC's own restriction; an npm version cannot be unpublished after 72 hours | M-pre blocks publishing. The approval is kept in writing and quoted in `LICENSE.md`. Publish to `next` first. The main package works without the fonts packages. |
| A transient local error (S3 503 SlowDown, a stall) fails renders that loaded from the CDN before | 3 in-tab attempts, then one real fresh-tab retry (the retry trigger), then a clear failure. `fontSrc: 'cdn'` skips the site request. Render tests 7–9. |
| A transient error splits render tabs | Transient answers never steer the source; only definite ones do. Render test 2 checks chunk determinism. |
| Running `sync` while Studio is open stalls Studio (full rescan per event) | Staging outside `public/`, one rename per file, one manifest write (measured on Linux: 1,213 events, 12 s, 110 MB, instead of 5,951, 26 s, 553 MB). Studio detection prints a warning. A test caps `fs.watch` events. |
| A cache mutation during a CLI render (public/ is symlinked) | Documented. Replacement order (drop entries, replace files, re-add) turns intermediate states into CDN loads, never a mismatch. A warning is printed on `--refresh`, `--prune` and `clean`. |
| Stale HTTP caches (Player hosts, warm Lambda browsers) | The manifest is fetched `no-cache`. Each file is checked by size and sha256, with one `cache: 'reload'` retry. |
| QUL rebuilds tajweed fonts in place | Snapshot manifests and dated versions; cmap coverage in CI; weekly `snapshot --check`; `verify --remote`; `sync --refresh`; `'local'` for reproducible renders. |
| A wrong or truncated file gets painted | Magic bytes, declared length, size, sha256 and parsing inside each step; "present but wrong" is `FONT_CACHE_INVALID`. |
| Bundle and Lambda cost (up to 94 MB, about 200 KB of `index.html`, S3 egress) | No default set without an installed package; `--pages`; `--prune`; the command prints the added cost; `deploySite` uploads only changed files. |
| Symlinks: Studio serves them, renders return 404 | The command only copies. `status` and `verify` flag symlinks. Render test 10. The README explains it. |
| The wrong `public/` (monorepos, `setPublicDir`, Player hosts, `basePath`) | Remotion's root rule; the absolute path is printed; warnings; at runtime a miss just uses the CDN; `{cache: '<base>/mushaf-fonts'}` for sub-paths. |
| Two Player host 404s per tab when nothing is synced (fonts manifest; data manifest from M6) | One request per set per tab, never per page, and no revalidation in the Player. `'cdn'` silences them. |
| Schema skew between the CLI and the runtime (`npx pkg@latest`) | An unknown schema counts as no cache (with a warning). The CLI warns about a version mismatch. |
| No `crypto.subtle` (insecure Player hosts) | Hash check skipped (documented); size, magic bytes and parsing still run. |
| Package managers: pnpm workspace root, Bun isolated installs, Yarn PnP | Resolve from the root, then from the CLI's own location; optional peers; `preferUnplugged`; copy file by file; the release matrix. |
| A proxy in front of Node's `fetch` | Printed hint; `--source package` goes through the package manager's proxy support. |
| Users re-publish the fonts by committing the cache to public repositories | A `*` `.gitignore` inside the cache by default; `LICENSE.md` copied alongside; attribution printed; README guidance. |
| A Player warm-up must use the same `fontSrc` as the lines | Documented; labels and `data-font-origin` reveal a mismatch; `ResolveLine` and the future `useMushafLine` warm up with the same spec. |
| Dist-dependent tests run before `build`, or skip silently | The `cli-e2e` project runs after `build`. The fonts-package tests import `src`. Skip gates fail when `CI` is set. |
| `retries`/`timeoutInMilliseconds` behave differently in client-side rendering | Documented as untested; the web renderer is not a target. |

## Relation to the <MushafLine> API redesign

- **`fontSrc` prop.** It ships now with its final type (`MushafFontSrc`) on both component forms, and `line.fontUrl`, `url` and `MushafFontUrl` are already gone. Data version 4 needs no font field, and the redesign has no font work left.
- **Theme as a prop.** The font code keys on `fontSet`, never on `theme`. `useFontGate({mushaf, theme, page, fontSrc, label})` no longer takes `MushafLineData`, and `getMushafFontFile` and `loadPageFont` take the selection the redesign will pass. When `theme` and `fontSet` leave the data, the renderer calls `resolveSelection({mushaf, theme: prop})`, and the loader and store stay unchanged.
- **`useMushafLine` hook.** It composes `useFontGate` and warms up with `loadPageFont({…, fontSrc})` using the same spec. A prop change is just a new key, with no conflict rules to wrap. Local-first data (M6) lives in the shared loader, and M6 already made `ResolveLine` key on a normalised data spec, which the hook reuses.
- **Rendering header lines instead of throwing.** Surah-name, basmallah or `quran-common` fonts become new `MushafFontSet` rows:
  - `MushafFontFile.kind` gains a member (the union was built for this).
  - Manifest `files` are keyed by id (`p10`, later for example `surah-names`).
  - Cache folders and fonts packages are per set, `--set` values come from the registry, and a third fonts package is optional.
  - A header font that is not per page simply has no `page` in its union member.
- **Renaming `fit` and dropping `activeWordStyle`/`springyTiming`** do not touch fonts.
- **Order.** Commits 1–11 land before the redesign; the redesign then touches only `MushafLine.tsx`, `ResolveLine.tsx` and the hook layer. Commits 12–25 are independent of it.

## Open questions for the user

1. **QUL's approval.** What exactly does it cover: npm redistribution, users' public folders and repositories, and unmodified files only? Which attribution line does QUL want? Did anyone confirm KFGQPC's position? The answer blocks the M4 publish and fills `LICENSE.md` part (a).
2. **Package names.** Unscoped `remotion-mushaf-fonts-qpc-v4` / `-qpc-v4-tajweed` (recommended, free today), or an org scope such as `@tlawat/…`, which needs the npm org created first? Switching is one constant before the first publish.
3. **Git history.** Should history be rewritten to drop the 94 MB mirror (`7a09402`) before the repository goes public? Commit 17 removes it from the tree but not from the pack.

## Review notes

**Accepted from the code review**
- **Commits 5 and 6 are merged into commit 5.** Re-keying the store without the consumers breaks `useFontGate`, `LineRenderer` (`line.fontFamily`) and `ResolveLine`'s adoption. Error-code removals move into that same commit, and commit 3 is additive only.
- **The Playwright assertions are listed.** The exact family and ident checks, the `@network` family and the route glob are now named in the test plan, with an interim custom source for the real-data tests until the cache exists.
- **The Vite harness has no SPA fallback.** Verified: `example/` has no `index.html`. The HTML cases now use `page.route`, and the 404 path stays unrouted.
- **The M6 data consumers.** Rather than moving the committed data mirror, it stays at `example/public/data/`, so its consumers are unchanged. The gitignored `mushaf-data/` is generated from it offline. Skip gates fail under `CI`.
- **`ResolveLine` reads `data?.words` and `data?.layout`.** Verified at `ResolveLine.tsx:31-33,48-52`. It is added to M6 with a data-key helper and a type test.
- **Tests that need `dist`** move to a `cli-e2e` project that runs after `build`. The fonts-package tests import `src`.
- **`fetch-budget.ts` stays pure.** Verified by its header comment. `isRenderingNow()` moves to `fonts/rendering.ts`.
- **The `assertFontMagic` import in tests** moves with it in commit 2.
- **`FONT_SUPERSEDED`** becomes an internal `FontSuperseded` class. Verified that `MushafError`'s constructor only accepts `MushafErrorCode`.
- **The budget overran at a 20 s timeout.** The final step is now clamped to the remaining deadline, or treated as transient under 4 s.
- **`__PKG_VERSION__`** is handled by a guarded `version.ts` plus a vitest `define`.
- **The render-suite gate path** moves with the fixture, and the gate fails under `CI`.
- **`cdn.test.ts` and the survey retirement** are assigned to commit 19.
- **`cache:fixtures`** stays offline (`--data-from-dir` from M6, a dead `--cdn-base`), and the `mushaf-fonts` ignore rule lands in commit 8.
- **Reference fixes:** `registry.ts:50-51`; 1,208 woff/woff2 plus 8 ttf files; `example/src/harness/LineHarness.tsx`; the palette hash was private and hex (now a shared `hash.ts`); `biome.json` already excludes `**/public`; only `load-page-font.ts:231,257,272,278` hold the old hints; `CDN_FORMAT_EXCEPTIONS` is retyped; `example/README.md:47,55` are included.

**Accepted from the Remotion review**
- **Retries.** `cancelRender` never retries, and only a `delayRender` timeout carries `DELAY_RENDER_RETRY_TOKEN`. Verified in `<remotion>/core/src/delay-render.ts:91-101` and `<remotion>/renderer/src/render-frame-and-retry-target-close.ts:157-169`, and present in 4.0.374. Redesigned as the retry trigger, with render tests 7–8.
- **Sync while Studio is open.** Verified that the watcher (`public-folder.ts:70-73`) rescans on every event with no debounce. Adopted staging outside `public/` and a single manifest write, plus Studio detection through `/__remotion_config` (present in 4.0.521).
- **Revalidation only in Studio.** Verified that Studio's static handler sends no ETag, so the "usually a 304" claim is dropped.
- **Bundle cost.** The inline `index.html` file list is added to the bundle-cost messages.
- **The `@remotion/fonts` rationale** is reworded: `format` can be passed, and `remotion` is an exact dependency, not a peer.
- **`{cache, cdn?}` form** added for sub-path Player hosts.
- **The M6 data manifest**, so data is not probed file by file.
- **Studio follows symlinks** and renders do not: documented, and `status` warns.
- **"Do not mutate the cache during a CLI render"**, plus the replacement ordering.
- **Cloud Run** checks made best-effort (alpha).

**Rejected, or changed from the reviewers' suggestions**
- **"Move a whole set in with one directory rename"** (Remotion review, Studio finding). Not adopted as the fix. On Linux (Node 22.22.2), moving a 604-file directory into a recursively watched tree still produced 606 events in my test, so a directory rename saves nothing there. Per-file renames from staging are simpler and measured about the same. The effect on macOS FSEvents or Windows is unverified.
- **"Refuse to run without `--force` while a render server is running"** (Remotion review, CLI render finding). Not adopted. The render server uses an ephemeral port and has no identifying route (unlike Studio's `/__remotion_config`), so it cannot be detected reliably. A printed warning and the write ordering are used instead.
- **"Retries: option (b), in-tab retries only and accept failure"** (Remotion review). Option (a) was chosen, with a short dedicated handle (`timeoutInMilliseconds: 2_500`) rather than waiting for the loader handle's full timeout. This gives the fresh tab without spending about 26 s, and the same path covers transient CDN failures.
- **"Turn every skip gate into a hard failure"** (code review, M6 finding) is applied only when `CI` is set. Local runs keep skipping with a message that points to `bun run cache:fixtures`, so contributors without the mirror can still run the suites.
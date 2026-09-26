# Font sources: implementation plan (v2)

> **Status: implemented** (commits `07e0ffb` and after). Differences from the plan below:
> - The fonts packages are named in their default export (`name`), so messages can say which package
>   failed; `MushafFontPackage` has that field.
> - The `fontSrc` + `fontFallback` pair is a source of its own, with its own family (a hash suffix),
>   rather than sharing the plain CDN family: a CDN-only line and a line with a fallback on the same
>   page could otherwise register two different faces under one family.
> - The example's mirror stays committed (open question 4): the fonts packages fill from it offline.
> - Verified hosts: Remotion `bundle()` and a Lambda-style `publicPath` (render suite), the Vite
>   Player harness (browser suite), and an installed package under Vite 8 and Next.js 16 (Turbopack
>   and webpack) in scratch projects. Open question 1 (the approval's scope) is recorded in
>   `docs/licensing/qul-approval.md` and blocks a real publish.

**Baseline:** HEAD `878a378`. **Supersedes:** the file-cache plan committed in `878a378`, which you can read with
`git show 878a378:docs/plans/font-sources.md`. That plan's verified Remotion facts and loader internals
still apply, and this plan points to them where it reuses them. Its public-folder cache, `sync` command and
cache manifest are dropped.

**Path shorthands:**

- `pkg/` means `packages/remotion-mushaf-line-renderer/`.
- `<remotion>` means `packages/` in [remotion-dev/remotion](https://github.com/remotion-dev/remotion) at
  commit `19fc4668` (4.0.527).

## Summary

- **Fonts load from QUL's CDN,** as they do today. No install and no setup step.
- **The fonts also ship on npm,** as two packages that contain the unmodified page fonts:
  - `remotion-mushaf-fonts-qpc-v4` (monochrome, 43.0 MB)
  - `remotion-mushaf-fonts-qpc-v4-tajweed` (colour, 51.0 MB)
- **Their job is to be the fallback when the CDN fails.** You install the package for the set you use and pass
  it to the component:

  ```tsx
  import tajweedFonts from 'remotion-mushaf-fonts-qpc-v4-tajweed';

  <MushafLine line={line} fontFallback={tajweedFonts} />
  ```

  - The CDN is tried first, with its usual retries.
  - If it still fails, whether from an outage, a firewall, a VPC with no outbound access or a timeout, the page
    font loads from the package instead.
  - With no fallback passed, behaviour is exactly today's.
- **How the package's files reach the browser: the bundler.** No script and no copy step is involved.
  - The fonts package exports one `new URL('./fonts/p10.woff2', import.meta.url)` per page.
  - Remotion's webpack and Rspack config emits `.woff2`/`.woff` files as assets
    (`<remotion>/bundler/src/shared-bundler-config.ts:170-173`, `type: 'asset/resource'`).
  - So the files travel inside the Studio bundle, the `bundle()` output and the Lambda site, and are fetched
    only when the fallback is used.
- **The same package can be the only source:** `fontSrc={tajweedFonts}`. That gives offline and
  byte-reproducible renders, still with no copy step.
- **The per-line `line.fontUrl` escape hatch goes away,** along with `getMushafLines({fontUrl})` and
  `loadPageFont({url})`. In their place, `fontSrc` takes `'cdn'`, a fonts package or a resolver function. A
  resolver still covers self-hosted mirrors, including `staticFile()` files you copy yourself.
- **The main package stays code only.** `check:package` keeps failing if a font file gets into its tarball.
- **The README documents the fallback,** in a section called "When the CDN fails".

## Decisions

| # | Decision | Choice | Why | Rejected |
|---|---|---|---|---|
| 1 | What the fonts package is for | **A CDN fallback that ships the files.** It can also be the only source (`fontSrc`). | Your direction. The package owns the bytes, so it needs no download script. | A script that downloads from the CDN into a cache (the v1 plan) |
| 2 | How the package's files get served | **Bundler assets: `new URL(<file>, import.meta.url)` in the package's ESM entry.** | This is the only way files inside `node_modules` become URLs in a Remotion bundle without a copy step. `staticFile()` serves only the user's `public/` (`<remotion>/docs/docs/staticfile.mdx`). Remotion's bundler already emits font files as assets (`<remotion>/bundler/src/shared-bundler-config.ts:170-173`). Vite and webpack 5 both handle `new URL(…, import.meta.url)` natively. | `staticFile()` plus a copy step (a public-folder cache: not needed, see §"The public-folder cache"). Inlining the fonts as base64 (every bundle would carry 43–51 MB of JavaScript). jsDelivr URLs (see open question 3). |
| 3 | When the fallback is used | **After the CDN step fails for any reason:** a final HTTP status, a response that is not a font, or a transient failure (timeout, network error, 5xx) once the CDN's attempts are used up. | That is the point of a fallback. It is safe while the package's bytes equal the CDN's; see decision 7. | Falling back only on definite failures, which would leave outages and firewalls, the cases that matter most, unhandled |
| 4 | How users pass the package | **A `fontFallback` prop on `<MushafLine>`, and a `fallback` option on `loadPageFont()`.** Each takes one package or an array (plain and tajweed); the one whose `fontSet` matches the line is used. | Explicit per line. It is code (a module import), not input props, so it never needs to be serialisable. It is in the spirit of Remotion's source props (`@remotion/animated-emoji`'s `calculateSrc`). A shared wrapper component or a constant sets it once for a whole composition. | A global `registerMushafFonts()` (hidden state, order-dependent across modules). Automatic detection of an installed package (the runtime cannot see `node_modules`). |
| 5 | Loader | **Keep the package's own `fetch` → magic bytes → `new FontFace(bytes)` loader,** extended with a second step. | `@remotion/fonts` `loadFont()` calls `cancelRender` on its first failure (`<remotion>/fonts/src/load-font.ts:90-92`), so the render would die before the fallback is tried. It also has no retries and no magic-byte check. | Delegating to `loadFont()` |
| 6 | Fonts packages | **Two packages, one per set,** versioned `1.YYYYMMDD.patch` after the QUL snapshot date. A committed manifest records size, md5 and sha256 per file; CI fills in the bytes when publishing. Optional peers of the main package. | Kept from v1. A theme uses one set only. The sets change at different rates (tajweed had 9 builds in 2025; plain has not changed since 2025-04-09). Each tarball stays around 50 MB. | One 94 MB package. Committing the fonts to git. |
| 7 | CDN and package bytes drifting apart | **Snapshot versions, a weekly drift check that opens a snapshot PR, and `fontSrc={pkg}` for byte-reproducible renders.** Documented. | QUL rebuilds tajweed pages in place. After such a rebuild, a render where some tabs fell back would mix two builds of the same page. | Hashing CDN responses at runtime (the CDN's bytes are what we want when it works) |
| 8 | Old explicit-source APIs | **Removed in 0.4:** `line.fontUrl`, `getMushafLines({fontUrl})`, `loadPageFont({url})`, `MushafFontUrl` and `FONT_URL_CONFLICT`. Old data containing `fontUrl` is rejected with a migration message. | The package is unpublished. Giving each source its own `FontFace` makes the conflict impossible. | Deprecating them while still honouring them |
| 9 | QUL's data exports (words and layout, 1.2 MB) | **Out of scope here; open question 2.** | The user's direction covers the fonts. | – |

## The public-folder cache: why it is not in this plan

You asked for this not to be excluded if it turned out to be the right approach. It isn't needed, for three
reasons:

- **Offline renders don't need it.** Once the fonts package is installed, the bundle already contains the files,
  so offline and firewalled renders work through the fallback, or through `fontSrc={pkg}` when you want the CDN
  skipped entirely.
- **It would bring back the v1 costs:** a manifest, a command, symlink traps (render servers answer symlinked
  public files with 404), and Studio rescanning the whole `public/` folder on every file change.
- **Anyone who still wants files in `public/` can do it with one line** through a resolver, with no support code
  in the library:

  ```tsx
  <MushafLine fontSrc={(f) => staticFile(`fonts/${f.fontSet}/${f.fileName}`)} />
  ```

## Runtime design

### Font file identity

This is kept from v1 (§"Font file identity" there): `MushafFontFile = {kind: 'page', mushaf, fontSet, page,
format, id, fileName, cdnUrl}`. It has one owner, `pkg/src/fonts/font-file.ts`, which is the only place that
knows page 328 of the tajweed set is `.woff`.

### What a fonts package exports

This is generated code, `index.js`, ESM only:

```js
// remotion-mushaf-fonts-qpc-v4-tajweed/index.js (generated; 604 entries)
const files = {
  1: {url: new URL('./fonts/p1.woff2', import.meta.url).href, bytes: 27432, sha256: '…'},
  // …
  328: {url: new URL('./fonts/p328.woff', import.meta.url).href, bytes: 105800, sha256: '…'},
  // …
};
export default {kind: 'remotion-mushaf-fonts', schema: 1, mushaf: 'qpc-v4', fontSet: 'qpc-v4-tajweed',
  version: '1.20260912.0', snapshot: '2026-09-12', files};
```

The type lives in the main package (`MushafFontPackage`). The fonts package's `index.d.ts` declares only a
structural copy of it, so the two packages never import each other.

### Sources

```ts
export type MushafFontResolver = (file: MushafFontFile) => string | readonly string[];
export type MushafFontSrc = 'cdn' | MushafFontPackage | MushafFontResolver;       // default 'cdn'
export type MushafFontFallback = MushafFontPackage | readonly MushafFontPackage[];
```

| `fontSrc` | `fontFallback` | Steps |
|---|---|---|
| `'cdn'` (default) | none | CDN (today) |
| `'cdn'` | package(s) | CDN, then the matching package |
| package | ignored (a warning is logged once) | package only |
| resolver | package(s) | the resolver's URLs in order, then the package |

- **A package whose `fontSet` doesn't match the line** is skipped. If a fallback was given but none matches,
  the loader throws `BAD_FONT_FALLBACK` at the first load ("this line uses qpc-v4-tajweed; install and pass
  remotion-mushaf-fonts-qpc-v4-tajweed"). A missed fallback therefore shows up in the Studio, not during an
  outage.
- **Store key and family** are per source (v1 §"Source specs, store keys and families"). The fallback does not
  change the key: `cdn+fallback` is a single spec, and its family is today's `mushaf-<set>-p<page>`. Lines
  with the same spec share one face, whichever step served it.
- **Each step** is: fetch, magic-byte and declared-length check, then `new FontFace(family, bytes,
  pinnedDescriptors)` and `load()`. Package steps also check that the size equals `files[page].bytes`, plus
  the sha256 in secure contexts. A mismatch is `FONT_FALLBACK_INVALID`: the bundle serves wrong bytes, and
  that is never masked.

### Outcomes

| CDN step outcome | No fallback | With a fallback |
|---|---|---|
| Loaded | done | done (the package is never fetched) |
| Final status, not a font, or parse error | `FONT_HTTP` / `FONT_INVALID` / `FONT_PARSE` (today) | package step, with a warning logged once per set naming the CDN failure |
| Transient failure after the CDN's attempts | error (today) | package step, with a warning logged once |
| The package step fails as well | – | `FONT_UNAVAILABLE`, listing every attempt: "CDN: timed out after 2 attempts; package remotion-mushaf-fonts-qpc-v4-tajweed@1.20260912.0: HTTP 404 for /…/p10.woff2 (is the package bundled? see README → When the CDN fails)" |

### Time budget while rendering

A fallback is only useful if there is time left to use it before the `delayRender` timeout fires.

- **Deadline.** It stays `start + (timeout ?? 30_000) − 4_000` (v1 §"Time budget").
- **With a fallback, the CDN gets a smaller share.** Two attempts cover `deadline − 6_000` between them, which is
  10 s each at the default 30 s timeout, instead of today's 12.75 s. At least 6 s stays reserved for the
  package step. That step is same-origin and usually takes milliseconds.
- **Without a fallback,** the budget is exactly today's.
- **Outside rendering,** there is no deadline: the CDN keeps today's 3 × 15 s, then the package is tried.

### Determinism across render tabs

- **Guaranteed:** every tab that renders a frame paints a verified font for that page. It comes either from
  the CDN or from package bytes whose size and sha256 match the snapshot.
- **Not guaranteed:** that the CDN's bytes equal the snapshot. They do when the package is current. When QUL
  has rebuilt a page since the snapshot, tabs that fell back paint the older build.
- **Mitigations:**
  - The weekly drift check makes new snapshots quick to publish.
  - `fontSrc={pkg}` makes every tab use the snapshot, which gives reproducible renders.
  - The README says all of this plainly.

### Environments

| Environment | Package files served from | Needs verifying (milestone M2) |
|---|---|---|
| Studio | the dev server (webpack assets) | emitted and served; 404 for a missing asset |
| `bundle()` / CLI render | the bundle's output folder | files emitted into the output; `renderMedia` with the CDN blocked |
| Lambda | the site bucket (`deploySite` uploads the bundle) | upload size, and only changed files re-uploaded on redeploy |
| Cloud Run (alpha) | the site bucket | best effort |
| Player on Vite | Vite assets (`new URL` is native) | dev and build |
| Player on Next.js (webpack or Turbopack) | Next assets | **unverified:** `new URL(…, import.meta.url)` inside `node_modules` |
| Node | – | not applicable (the `FontFace` guard stays) |

**Bundle cost.** Every bundle that imports a fonts package emits all of its files: 43 MB for plain, 51 MB for
tajweed. The JavaScript only grows by 604 URL strings. `deploySite` uploads the files once, and afterwards only
the ones that changed. The README states this cost.

## Public API changes (0.4)

```ts
// types.ts
export type MushafFontFile = {/* v1 §Font file identity */};
export type MushafFontPackage = {
  readonly kind: 'remotion-mushaf-fonts'; readonly schema: 1;
  readonly mushaf: MushafId; readonly fontSet: MushafFontSet;
  readonly version: string; readonly snapshot: string;
  readonly files: Readonly<Record<number, {readonly url: string; readonly bytes: number; readonly sha256: string}>>;
};
export type MushafFontResolver = (file: MushafFontFile) => string | readonly string[];
export type MushafFontSrc = 'cdn' | MushafFontPackage | MushafFontResolver;
export type MushafFontFallback = MushafFontPackage | readonly MushafFontPackage[];

// MushafLineCommonProps: + fontSrc?: MushafFontSrc; + fontFallback?: MushafFontFallback;
// LoadPageFontOptions:   - url;  + fontSrc?: MushafFontSrc; + fallback?: MushafFontFallback;
// LoadedPageFont:        + origin(): 'cdn' | 'package' | 'custom' | null
// MushafLineData:        - fontUrl.   GetMushafLinesOptions: - fontUrl.   Removed type: MushafFontUrl.
// Errors: + BAD_FONT_SRC, BAD_FONT_FALLBACK, FONT_FALLBACK_INVALID, FONT_UNAVAILABLE;
//         - BAD_FONT_URL, FONT_URL_CONFLICT, FONT_SUPERSEDED (becomes internal).
// index.ts: + getMushafFontFile() and the types above.
```

**Migration:**

```tsx
// 0.3
getMushafLines({page: 10, theme, fontUrl: (p, s) => staticFile(`fonts/${s}/p${p}.woff2`)});
// 0.4
<MushafLine line={line} fontSrc={(f) => staticFile(`fonts/${f.fontSet}/${f.fileName}`)} />
// or drop the mirror:
<MushafLine line={line} fontFallback={tajweedFonts} />
```

**DOM:** once a line's font has loaded, the line root gets `data-font-origin="cdn|package|custom"`.

## The fonts packages

Kept from v1 (§"The fonts package"), with these changes:

- **The entry is ESM `index.js`,** generated from the manifest as shown above, with `index.d.ts` beside it.
  `"type": "module"`, `"sideEffects": false`, and
  `exports: {".": {types, default: "./index.js"}, "./fonts/*": "./fonts/*", "./manifest.json": …}`.
- **The description** says: "Fallback (or offline) source for remotion-mushaf-line-renderer; bundled as assets
  when imported."
- **Tooling:** `scripts/fonts-package.mjs` keeps `snapshot`, `fill`, `verify` and `check`, and gains
  `generate`, which writes `index.js` and `index.d.ts` from `manifest.json`.
- **Licence:** `LICENSE.md` has (a) the font files: © KFGQPC, distributed under QUL's approval, unmodified; and
  (b) the code: MIT. There is also a `NOTICE.md` with the attributions.
- **Workflow `fonts-packages.yml`:** a weekly drift check that opens a snapshot PR, and a manual publish to
  `next`, then `latest`, with provenance.
- **Dropped from v1:** the `index.cjs` Node entry, `fontsDir`, and the copy-oriented `preferUnplugged`.

## Repository changes

| File | Change |
|---|---|
| `pkg/src/fonts/*`, `fetch-budget.ts`, `hooks/use-font-gate.ts`, `component/*` | The runtime above |
| `pkg/src/types.ts`, `errors.ts`, `index.ts`, `resolve/{get-mushaf-lines,validate-line-data}.ts` | The API changes and removals |
| `pkg/scripts/check-package.mjs` | New exports; the tarball must still contain no fonts |
| `packages/fonts-qpc-v4{,-tajweed}/` | New workspaces; `fonts/` is gitignored and filled in CI |
| `scripts/fonts-package.mjs`, `scripts/lib/woff2-cmap.mjs` | Snapshot, fill, generate, verify, check |
| `.github/workflows/{ci,fonts-packages}.yml` | Metadata-mode checks in CI; drift check and publish workflow |
| `.gitignore`, `CONTRIBUTING.md` | Replace the "fonts are not redistributed" rule with "fonts ship only in the two packages, under QUL's approval"; add the snapshot and release procedure |
| `example/` | Import the tajweed package as a `workspace:*` dependency and pass `fontFallback`. Keep the committed mirror for tests until the packages exist, then decide (open question 4). Remove `fontFilePattern` / `fontUrlFromPattern`. |
| `pkg/README.md` | New section, **"When the CDN fails"** (below). Update the Fonts section (sources, the `fontSrc` table, real sizes: median 71/85 KB, max 114 KB), the errors table and the DOM contract. |
| `README.md` (repo), `docs/architecture.md`, `pkg/CHANGELOG.md` | Fonts ship with QUL's approval; the source chain; 0.4.0 notes and migration |
| `docs/licensing/qul-approval.md` | A record of the approval: who, when, scope |

### README section: "When the CDN fails" (outline)

1. By default, page fonts load from QUL's CDN. If it is unreachable (an outage, a firewall, a cloud VPC with
   no outbound access), the render fails with `FONT_HTTP`/`FONT_TIMEOUT` after its retries.
2. Install the fonts for your theme: `npm i remotion-mushaf-fonts-qpc-v4-tajweed` for any colour theme, or
   `…-qpc-v4` for `'plain'`.
3. Pass it: `<MushafLine fontFallback={tajweedFonts} />`. The CDN is still tried first; the package is used
   only when the CDN fails. A warning is logged, and the line root shows `data-font-origin="package"`.
4. Offline or reproducible renders: `fontSrc={tajweedFonts}` never contacts the CDN.
5. Cost: the bundle (Studio, `bundle()`, the Lambda site) contains the package's files, 51 MB or 43 MB. They
   are downloaded only when used.
6. Snapshots: the package holds QUL's fonts as of its version date. If QUL has since updated a page, a
   fallback render uses the older build. Keep the package updated, or use `fontSrc={pkg}` for consistency.
7. Player hosts: Vite works; Next.js status is recorded here once M2 has verified it. Mention the CSP
   (`connect-src static-cdn.tarteel.ai`).
8. Licence: the fonts are © KFGQPC, distributed with QUL's approval. See the package's `LICENSE.md`.

## Test plan

- **Unit (jsdom):**
  - the step chain for every outcome in the table (CDN ok; final / not-a-font / transient then package ok;
    package mismatch; both fail);
  - budget splits at 30 s, 20 s and 120 s timeouts;
  - fallback set matching and `BAD_FONT_FALLBACK`;
  - removal errors for `fontUrl`, `url` and `fontUrl` in data;
  - family and key per source;
  - `origin()`.
- **Type tests:** `fontSrc`/`fontFallback` accept packages and resolvers and reject strings; a structural
  package literal type-checks.
- **A fixture fonts package** (`test/fixtures/fonts-package/`, pages 1, 10, 187 and 604, built by
  `generate`) is used by the following tests.
- **Browser (Playwright on the example Player):**
  - with the CDN route aborted, the line paints from the package, with `data-font-origin="package"` and a
    pixel match against the CDN baseline;
  - with the CDN returning HTML, the same;
  - with the package asset removed, `FONT_UNAVAILABLE`.
- **Render:**
  - `bundle()` emits the fixture files;
  - `renderMedia` with the CDN host blocked (request interception or an unroutable CDN base) succeeds, and its
    frames are byte-identical to a CDN render;
  - a transient CDN stall still finishes inside the timeout.
- **Packaging:**
  - `verify`/`check` on both packages (metadata mode in CI);
  - the main tarball has no fonts;
  - the fonts tarball has exactly 604 files plus its metadata.

## Milestones

| # | What | Leaves green |
|---|---|---|
| M0 | Groundwork: `font-file.ts` (page file identity, p328 in one place), move the magic-byte check, shared hash. No behaviour change. | everything |
| M1 | `fontSrc` (`'cdn'` or a resolver), one face per source, removal of `fontUrl`/`url`/`FONT_URL_CONFLICT`, migration errors, and the example migrated to resolvers | everything |
| **M2 (spike, a gate)** | Fixture fonts package with 4 pages. Prove bundler emission in Studio, `bundle()` and render, a Vite Player dev and build, and try Next.js. Record the results in the README draft. **If emission fails anywhere essential, stop and revisit decision 2.** | everything |
| M3 | `fontFallback` and package sources in the loader, the budget split, the outcomes, `data-font-origin`, and the unit, browser and render tests above | everything |
| M4 | The full fonts packages: snapshot tooling, `generate`, licence, the workflows, dry-run publishes to `next` | everything |
| M5 | Documentation: the README "When the CDN fails" section, the Fonts section, CONTRIBUTING, architecture, CHANGELOG. Then release: fonts packages first, then main 0.4.0. | everything |

M0 and M1 are useful on their own, and the `<MushafLine>` redesign can adopt `fontSrc`/`fontFallback` as they
are.

## Risks

| Risk | Mitigation |
|---|---|
| A bundler does not emit `new URL(…)` assets from `node_modules` (Next.js/Turbopack is untested) | The M2 gate; a resolver works as a workaround for any host; document the per-host status |
| Bundle size (43–51 MB) surprises users | Opt-in import; the README cost note; per-set packages |
| Drift between the CDN and the package | Snapshot versions, weekly drift PRs, `fontSrc={pkg}` for reproducibility, and the warning logged on fallback |
| Too little time left for the fallback within `delayRender` | The budget split reserves at least 6 s; tests at 20 s and 30 s timeouts |
| The approval's scope (npm redistribution; users' bundles served publicly) | `docs/licensing/qul-approval.md`; publishing blocked until it is confirmed (open question 1) |

## Open questions

1. **QUL's approval:** does it explicitly cover publishing the fonts on npm, and the fonts being served from
   users' deployed bundles? Which attribution line do they want?
2. **Data exports:** should the words and layout exports (1.2 MB, open data) get the same fallback? That could
   be a third small package, or the files inside the main package, which would break its "code only" rule.
3. **jsDelivr:** npm packages are mirrored on jsDelivr automatically. A no-install second fallback (CDN →
   jsDelivr copy of the fonts package) is possible, but is unverified here (the host was blocked from this
   environment) and adds a third party. Include it, or leave it out?
4. **The example's committed 94 MB mirror:** replace it with the workspace fonts package once M4 lands, and
   rewrite history before the repository goes public?

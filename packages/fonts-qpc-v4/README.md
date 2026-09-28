# @tlawat/mushaf-fonts-qpc-v4

QUL's KFGQPC V4 (1441H) the monochrome page fonts (glyph outlines that follow CSS `color`), all 604 pages, unmodified, for
[@tlawat/remotion-mushaf-line](https://github.com/tlawat/remotion-mushaf-line-renderer).

@tlawat/remotion-mushaf-line loads page fonts from QUL's CDN. This package is what it uses **when
the CDN fails** (an outage, a firewall, a cloud network with no outbound access, a timeout), or
instead of the CDN when you want renders that never leave your bundle. Use it for the `'plain'` theme (the default); the
other font set is `@tlawat/mushaf-fonts-qpc-v4-tajweed`.

```bash
npm i @tlawat/mushaf-fonts-qpc-v4
```

```tsx
import fonts from '@tlawat/mushaf-fonts-qpc-v4';
import {MushafLine} from '@tlawat/remotion-mushaf-line';

<MushafLine line={line} fontFallback={fonts} />  // the CDN first, this package if it fails
<MushafLine line={line} fontSrc={fonts} />       // this package only: offline, reproducible
```

## How it works

The default export lists every page as `new URL('./fonts/p<page>.woff2', import.meta.url)`, the
form bundlers understand: Remotion's webpack/Rspack (the Studio, `bundle()`, Lambda sites) and Vite
emit the files as assets and hand back their URLs. Nothing is downloaded until a line needs a page.
@tlawat/remotion-mushaf-line checks each file's size and SHA-256 against the package before using it.

**Size:** importing the package adds its 43 MB of font files to every bundle
(the JavaScript only grows by the list of URLs). They are uploaded with your Lambda site once, and
afterwards only when they change.

## Versions

`1.<YYYYMMDD>.<patch>`: the date is the day of QUL's fonts this version holds. QUL occasionally
rebuilds pages in place; a new version follows. If a render falls back to an older package than the
CDN serves, those pages are drawn from the older build; keep the package current, or use
`fontSrc={fonts}` when every frame must come from the same files.

## Licence

The font files are © King Fahd Glorious Qur'an Printing Complex, published by QUL, and are not
open source. See [LICENSE.md](./LICENSE.md) and [NOTICE.md](./NOTICE.md).

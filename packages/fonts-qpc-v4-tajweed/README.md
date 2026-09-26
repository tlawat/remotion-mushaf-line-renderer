# remotion-mushaf-fonts-qpc-v4-tajweed

QUL's KFGQPC V4 (1441H) the colour page fonts (COLR/CPAL, with the tajweed colours and the ayah rosettes), all 604 pages, unmodified, for
[remotion-mushaf-line-renderer](https://github.com/tlawat/remotion-mushaf-line-renderer).

remotion-mushaf-line-renderer loads page fonts from QUL's CDN. This package is what it uses **when
the CDN fails** (an outage, a firewall, a cloud network with no outbound access, a timeout), or
instead of the CDN when you want renders that never leave your bundle. Use it for every theme except `'plain'` (`'light'`, `'dark'`, `'sepia'`, `'black'`, `'normal'`, `'p1'`–`'p5'` and custom themes); the
other font set is `remotion-mushaf-fonts-qpc-v4`.

```bash
npm i remotion-mushaf-fonts-qpc-v4-tajweed
```

```tsx
import fonts from 'remotion-mushaf-fonts-qpc-v4-tajweed';
import {MushafLine} from 'remotion-mushaf-line-renderer';

<MushafLine line={line} fontFallback={fonts} />  // the CDN first, this package if it fails
<MushafLine line={line} fontSrc={fonts} />       // this package only: offline, reproducible
```

## How it works

The default export lists every page as `new URL('./fonts/p<page>.woff2', import.meta.url)`, the
form bundlers understand: Remotion's webpack/Rspack (the Studio, `bundle()`, Lambda sites) and Vite
emit the files as assets and hand back their URLs. Nothing is downloaded until a line needs a page.
remotion-mushaf-line-renderer checks each file's size and SHA-256 against the package before using it.

**Size:** importing the package adds its 51 MB of font files to every bundle
(the JavaScript only grows by the list of URLs). They are uploaded with your Lambda site once, and
afterwards only when they change.

## Versions

`1.<YYYYMMDD>.<patch>`: the date is the day of QUL's fonts this version holds. QUL occasionally
rebuilds pages in place; a new version follows. If a render falls back to an older package than the
CDN serves, those pages are drawn from the older build; keep the package current, or use
`fontSrc={fonts}` when every frame must come from the same files.

## Licence

The font files are © King Fahd Glorious Qur'an Printing Complex, redistributed with QUL's approval,
and are not open source. See [LICENSE.md](./LICENSE.md) and [NOTICE.md](./NOTICE.md).

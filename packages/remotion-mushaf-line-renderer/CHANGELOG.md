# Changelog

## 0.1.0

First release.

- `<MushafLine>` renders one `ayah` line of the KFGQPC V4 (1441H) mushaf with QUL's per-page glyph
  fonts, one DOM element per word, justified or centred exactly as printed.
- `enter` takes any DOM presentation from `@remotion/transitions` (`fade`, `slide`, `wipe`, `flip`,
  `clockWipe`, `iris`, `pushCut`, `none`) plus the bundled `revealRtl`; timing comes from the
  enclosing `<Sequence>`.
- `getMushafLine()` resolves plain JSON line data for `calculateMetadata()`.
- `loadPageFont()` loads a page font google-fonts style with `delayRender()` handled internally.
- Two mushaf ids: `qpc-v4` (plain glyphs, follow CSS `color`) and `qpc-v4-tajweed` (COLR/CPAL
  tajweed colours).
- Nothing is painted before the page font is loaded; renders never capture a fallback font.
- Every failure is a `MushafError` with a stable `code`.

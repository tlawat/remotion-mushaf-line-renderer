# Notice

- **What:** the KFGQPC V4 (1441H) page fonts, the colour page fonts (COLR/CPAL, with the tajweed colours and the ayah rosettes): one font per page, pages 1–604, named
  `fonts/p<page>.woff2` (`p328.woff` in the colour set, the one page QUL publishes without a woff2).
- **Source:** QUL's font CDN, `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed`, as of the
  snapshot date in `manifest.json` (and in the version: `1.<YYYYMMDD>.<patch>`).
- **Unmodified:** every file is byte for byte what the CDN served on that date. `manifest.json`
  records its size, MD5 (the CDN's ETag) and SHA-256; remotion-mushaf-line-renderer checks the size
  and SHA-256 again before it uses a file.
- **Attribution:** fonts © King Fahd Glorious Qur'an Printing Complex; tajweed colour features by
  Ayman, Rania, Syeds, Naveed, Zahid, Tooba and Anza (Sadaqa-e-Jaria); published by the Quranic
  Universal Library (QUL, <https://qul.tarteel.ai>).

# QUL's approval to package the fonts

The two fonts packages (`remotion-mushaf-fonts-qpc-v4`, `remotion-mushaf-fonts-qpc-v4-tajweed`)
redistribute the KFGQPC V4 page fonts as published by the Quranic Universal Library (QUL). This file
records the approval that allows it, so that anyone can check what it covers. The *Fonts packages*
workflow refuses a real npm publish until the repository variable `FONTS_PUBLISH_APPROVED` is set to
`true`; set it only once the record below is complete.

## What was approved

- **By:** QUL (Quranic Universal Library, <https://qul.tarteel.ai>). _To fill in: who, and how to
  reach them._
- **When:** _To fill in: the date of the approval._
- **Scope, as stated by the maintainers:** packaging the fonts within the app, or using QUL's CDN.
  _To fill in: the approval's own words, or a link to it._

## To confirm before the first publish

1. **npm.** Does the approval cover publishing the fonts in public npm packages (and so on the
   mirrors that copy npm, such as jsDelivr and unpkg)?
2. **Users' bundles.** Does it cover users serving the fonts from the bundles they build and deploy
   (a Remotion Lambda site, a website with a `<Player>`)?
3. **Attribution.** Which attribution line does QUL want in the packages and in renders?
4. **King Fahd Complex.** Every font file carries this notice (name ID 10), which the packages'
   `LICENSE.md` quotes verbatim:

   > Quran Tajweed Color Font features developed and added by Ayman, Rania, Syeds, Naveed, Zahid,
   > Tooba and Anza for Sadaqa-e-Jaria Only. NOT FOR SALE, ONLY CHARITIABLE (SADAQA) PURPOSE ONLY.
   > PRINTING AND PUBLISHING NOT PERMITTED WITHOUT PRIOR PERMISSION FROM KING FAHAD GLORIOUS QURAN
   > PRINTING COMPLEX.

   Does QUL's approval include the King Fahd Glorious Qur'an Printing Complex's permission, or is a
   separate one needed?

## What the packages do to honour it

- The files are unmodified: byte for byte what QUL's CDN served on the snapshot date, checked
  against the recorded MD5 (the CDN's ETag) and SHA-256.
- Each package carries the notice above, the copyright ("King Fahad Complex, All rights reserved"),
  the attributions and a pointer to this record (`LICENSE.md`, `NOTICE.md`).
- The main package never contains the fonts; users install a fonts package on purpose.

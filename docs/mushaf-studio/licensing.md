# Mushaf Studio: what you may publish

Mushaf Studio's code is MIT. The videos it makes are built from material that is not: the mushaf's
fonts, the recordings, the timings and the translations each come with their own terms. This page
lists them so that whoever distributes the app, or publishes a video made with it, knows what to
check. It records what the sources say; it is not legal advice.

## The fonts (the printed text itself)

The KFGQPC V4 page fonts, the surah-name font and `quran-common` are © King Fahd Glorious Qur'an
Printing Complex, all rights reserved, published by the Quranic Universal Library (QUL). They are
not open source. Every page font carries this notice in its name table, verbatim:

> Quran Tajweed Color Font features developed and added by Ayman, Rania, Syeds, Naveed, Zahid, Tooba
> and Anza for Sadaqa-e-Jaria Only. NOT FOR SALE, ONLY CHARITIABLE (SADAQA) PURPOSE ONLY. PRINTING AND
> PUBLISHING NOT PERMITTED WITHOUT PRIOR PERMISSION FROM KING FAHAD GLORIOUS QURAN PRINTING COMPLEX.

What this means in practice:

- A video is a rendering of the fonts, and publishing it is publishing. The notice reserves that to
  the Complex's permission and to charitable use. A free video shared as sadaqa is the use the
  notice describes; a monetised channel, a paid course, an app sold with videos inside, or a
  commercial client project is not, and needs the Complex's permission
  ([qurancomplex.gov.sa](https://qurancomplex.gov.sa)).
- Distributing the app or a render bundle that contains the fonts packages is redistributing the
  fonts. The packages ship them unmodified with the notice; keep it that way, and do not sell them.
- QUL's FAQ says its data may be used in commercial projects "after reviewing the licensing terms
  for each resource"; for the fonts, the terms are the notice above.
- `MushafAyahText` uses QUL's Uthmani Hafs font, also a King Fahd Complex font: the same applies.

## The recordings

The audio belongs to the reciter or the publisher who recorded it. The QUD catalogue serves clips
of recordings published on YouTube, mp3quran, the Quran.com CDN and other channels; that QUD can
serve a clip says nothing about your right to republish it. For your own recordings, you hold the
rights. Check the source's terms before publishing a video made with someone else's recitation.

## The timings

Timings from the QUD Universal Aligner (uploaded recordings and the catalogue) are CC-BY-4.0:
attribute "Timings: QUD Universal Aligner (aligner.qud.dev), CC-BY-4.0". The end card's
attribution line and `youtubeDescription()` include it when the timings came from QUD.

## The text data and translations

- The word and line layout comes from QUL's open data.
- Translations, glosses, transliterations and the Quran text fetched from quran.com each carry
  their own resource terms: the panel records the resource's name in the file (`meta.name`), and
  a published video should name the translation it shows. Some translators allow free
  non-commercial use only.
- Translations and tafsirs downloaded from QUL: see each resource's page.

## What the app does about it

- The panel says before every upload that the audio leaves the machine and goes to QUD.
- The fonts packages carry the notice; the main package ships no fonts.
- Attribution text is generated for the end card and the video description.
- Nothing in the app grants a right the sources above do not: the app README links here.

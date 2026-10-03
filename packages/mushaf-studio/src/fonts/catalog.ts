/**
 * The Quran fonts QUL publishes (https://qul.tarteel.ai/resources/font), as data: which script they
 * set, their resource page, and the public CDN URL where one is known. The package renders the V4
 * page fonts today; the others are here so the next layouts (a Unicode-text framing, the V1 and V2
 * page layouts) start from one list rather than from research notes.
 */
export type QulFontKind =
  /** One font file per page, glyph-coded text (private-use code points): the mushaf layouts. */
  | 'page-fonts'
  /** One font for Unicode Quran text. */
  | 'unicode'
  /** Surah names, juz names, the header frame: shared ornaments. */
  | 'shared';

export type QulFontResource = {
  readonly id: string;
  readonly name: string;
  readonly kind: QulFontKind;
  /** QUL's resource id, for `https://qul.tarteel.ai/resources/font/<id>`. */
  readonly qulResource: number;
  readonly script: string;
  /** Pages, for page fonts. */
  readonly pages?: number;
  /** A public CDN URL, or a template with `{page}` and `{format}` for page fonts; `null` when the download needs a QUL login. */
  readonly cdnUrl: string | null;
  readonly formats: readonly ('woff2' | 'woff' | 'ttf' | 'otf')[];
  /** Whether the package renders it today. */
  readonly supported: boolean;
  readonly notes?: string;
};

const CDN = 'https://static-cdn.tarteel.ai/qul/fonts';

export const QUL_FONTS: readonly QulFontResource[] = [
  {
    id: 'qpc-v4',
    name: 'QPC V4 page fonts (plain)',
    kind: 'page-fonts',
    qulResource: 457,
    script: 'KFGQPC V4 (1441H), glyph-coded',
    pages: 604,
    cdnUrl: `${CDN}/quran_fonts/v4/{format}/p{page}.{format}`,
    formats: ['woff2', 'ttf'],
    supported: true,
  },
  {
    id: 'qpc-v4-tajweed',
    name: 'QPC V4 page fonts (tajweed colour)',
    kind: 'page-fonts',
    qulResource: 240,
    script: 'KFGQPC V4 (1441H), glyph-coded, COLR/CPAL',
    pages: 604,
    cdnUrl: `${CDN}/quran_fonts/v4-tajweed/{format}/p{page}.{format}?v=3.1`,
    formats: ['woff2', 'woff', 'ttf'],
    supported: true,
    notes: 'Page 328 is published as woff, not woff2.',
  },
  {
    id: 'qpc-v1',
    name: 'QPC V1 page fonts',
    kind: 'page-fonts',
    qulResource: 238,
    script: 'KFGQPC V1 (1405H print), glyph-coded',
    pages: 604,
    cdnUrl: `${CDN}/quran_fonts/v1-optimized/{format}/p{page}.{format}?v=3.1`,
    formats: ['woff2', 'ttf'],
    supported: false,
    notes: 'Needs the V1 word script and the 15-line V1 layout export (QUL mushaf layout 2).',
  },
  {
    id: 'qpc-v2',
    name: 'QPC V2 page fonts',
    kind: 'page-fonts',
    qulResource: 249,
    script: 'KFGQPC V2 (1421H print), glyph-coded',
    pages: 604,
    cdnUrl: `${CDN}/quran_fonts/v2/{format}/p{page}.{format}?v=3.1`,
    formats: ['woff2', 'ttf'],
    supported: false,
    notes: 'Needs the V2 word script and the 15-line V2 layout export (QUL mushaf layout 10).',
  },
  {
    id: 'surah-names-v4',
    name: 'V4 surah-name colour font',
    kind: 'shared',
    qulResource: 237,
    script: 'The 114 surah names and the basmalah',
    cdnUrl: `${CDN}/surah_names_v4/surah_names.{format}`,
    formats: ['woff2', 'ttf'],
    supported: true,
  },
  {
    id: 'quran-common',
    name: 'Juz names and the header frame (quran-common)',
    kind: 'shared',
    qulResource: 459,
    script: 'Ligatures: the 30 juz names, the ornamental surah-header frame, icons',
    cdnUrl: `${CDN}/common/quran-common.{format}`,
    formats: ['woff2', 'woff', 'ttf'],
    supported: true,
  },
  {
    id: 'surah-names-v1',
    name: 'Surah name font v1',
    kind: 'shared',
    qulResource: 456,
    script: 'Surah names, ligature font',
    cdnUrl: null,
    formats: ['woff2', 'woff', 'ttf'],
    supported: false,
  },
  {
    id: 'surah-names-v2',
    name: 'Surah name font v2',
    kind: 'shared',
    qulResource: 455,
    script: 'Surah names, ligature font',
    cdnUrl: null,
    formats: ['woff2', 'woff', 'ttf'],
    supported: false,
  },
  {
    id: 'uthmanic-hafs',
    name: 'QPC Uthmani Hafs (Unicode)',
    kind: 'unicode',
    qulResource: 245,
    script: 'Uthmani Hafs Unicode text (needs the QPC Hafs script)',
    cdnUrl: `${CDN}/UthmanicHafs_V22.ttf`,
    formats: ['ttf', 'woff2'],
    supported: false,
    notes: 'The Unicode text comes from a word-by-word script export or quran.com’s text_uthmani by location.',
  },
  {
    id: 'kfgqpc-nastaleeq',
    name: 'KFGQPC Nastaleeq (Unicode)',
    kind: 'unicode',
    qulResource: 462,
    script: 'Nastaleeq, Indopak style',
    cdnUrl: null,
    formats: ['woff2', 'ttf'],
    supported: false,
  },
  {
    id: 'indopak-nastaleeq',
    name: 'Indopak Nastaleeq (Unicode)',
    kind: 'unicode',
    qulResource: 242,
    script: 'Indopak Nastaleeq',
    cdnUrl: null,
    formats: ['woff2', 'ttf'],
    supported: false,
  },
  {
    id: 'digital-khatt-v2',
    name: 'Digital Khatt V2 (Unicode, variable)',
    kind: 'unicode',
    qulResource: 247,
    script: 'Madani, parametric justification',
    cdnUrl: null,
    formats: ['woff2', 'ttf', 'otf'],
    supported: false,
  },
  {
    id: 'me-quran',
    name: 'Me Quran (Unicode)',
    kind: 'unicode',
    qulResource: 243,
    script: 'Uthmani, me_quran',
    cdnUrl: null,
    formats: ['woff2', 'ttf'],
    supported: false,
  },
];

/** CSS font families that render well for translations without a web font, by writing system. */
export const TRANSLATION_FONT_PRESETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly fontFamily: string;
}[] = [
  {id: 'serif', label: 'Serif', fontFamily: 'Georgia, "Noto Serif", "Times New Roman", serif'},
  {id: 'sans', label: 'Sans', fontFamily: '"Noto Sans", "Helvetica Neue", Arial, sans-serif'},
  {id: 'arabic-naskh', label: 'Arabic Naskh', fontFamily: '"Noto Naskh Arabic", "Amiri", "Scheherazade New", serif'},
  {id: 'urdu-nastaliq', label: 'Urdu Nastaliq', fontFamily: '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", serif'},
];

/** The CDN URL of a page of a page-fonts resource, or `null` when it has none. */
export const pageFontUrl = (
  font: QulFontResource,
  page: number,
  format: 'woff2' | 'ttf' | 'woff' = 'woff2',
): string | null => font.cdnUrl?.replace('{page}', String(page)).replaceAll('{format}', format) ?? null;

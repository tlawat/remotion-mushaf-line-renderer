// The cases of render-design.md 12.2 (stills V1-V20 and their strips): for each, the composition, the
// look and the format it is rendered in, what it changes on top, the frames it renders, and the
// pass criteria the design gives. `scripts/design-stills.ts` renders them and `scripts/design-check.ts`
// measures them. No file system, no network, no clock, so scripts/design-cases.test.ts pins them.
// Dev only: nothing here is part of the app or the package.
import {
  applyFormat,
  applyLook,
  defaultMushafAyahTextProps,
  defaultMushafPageProps,
  defaultMushafPassageProps,
  defaultMushafRecitationProps,
  lookById,
  type MushafFormatId,
} from '@tlawat/mushaf-studio';

/** The compositions the cases render. */
export type DesignComposition = 'MushafRecitation' | 'MushafPassage' | 'MushafPage' | 'MushafAyahText';

/** A shot of a case: still frames, or a strip (every frame of `from`-`to`, both included). */
export type DesignShot =
  | {readonly kind: 'still'; readonly frames: readonly DesignFrame[]}
  | {readonly kind: 'strip'; readonly from: number; readonly to: number};

/** A frame number, or `'last'`: the composition's last frame, read from its metadata at render time. */
export type DesignFrame = number | 'last';

/** A file the case reads from the round's `public/` (`design-stills.ts` provides it). */
export type DesignAsset = 'translation' | 'backdrop' | 'paused';

/** A plain JSON object: the props groups and the overrides. */
export type Plain = {readonly [key: string]: unknown};

/** One case of 12.2. */
export type DesignCase = {
  /** `V1` ... `V20`, with a suffix for a variant (`V10-vertical`, `V3-slow`) or a reference (`V7-ref`). */
  readonly id: string;
  readonly composition: DesignComposition;
  /** A look id of `MUSHAF_LOOKS`. */
  readonly look: string;
  readonly format: MushafFormatId;
  /** Deep-merged over the style groups after the look and the format. */
  readonly overrides: Plain;
  /**
   * Content props written as they are over the Root's (a surah, a header, a timings file): what the
   * frame shows rather than how. Most cases keep the Root's content.
   */
  readonly content?: Plain;
  readonly shots: readonly DesignShot[];
  /** `--scale` of the render: 0.5 unless the case is about fine detail. */
  readonly scale: number;
  /** What the design says the case must look like (12.2's last column). */
  readonly criteria: string;
  /** The case another one is compared with (the same frames with no mark): its own id. */
  readonly referenceOf?: string;
  readonly assets?: readonly DesignAsset[];
};

/** The props groups a case writes: style only, whole groups (the content props stay the Root's). */
export const STYLE_GROUPS = [
  'theme',
  'customTheme',
  'layout',
  'background',
  'animation',
  'highlight',
  'memorize',
  'text',
  'overlay',
  'legend',
  'endCard',
  'pageView',
] as const;

/** Where the round's own `public/` puts the files a case reads (`DesignAsset`). */
export const ASSET_PATHS: {readonly [A in DesignAsset]: string} = {
  translation: 'design/saheeh-international.json',
  backdrop: 'design/backdrop.png',
  paused: 'design/timings-paused.json',
};

/** The bundled sample's timings, which `'paused'` is made from (a path of the app's `public/`). */
export const SAMPLE_TIMINGS = 'mushaf-studio/fatiha/timings.json';

/** A word or an ayah of a timings file: its times in seconds, and anything else it holds. */
type TimedEntry = {readonly start: number; readonly end: number; readonly [key: string]: unknown};

/** The parts of a timings file `pausedTimings()` reads. */
export type TimingsJson = {
  readonly ayat: readonly (TimedEntry & {readonly ayah: number; readonly words?: readonly TimedEntry[]})[];
  readonly durationSeconds?: number;
  readonly [key: string]: unknown;
};

/**
 * The timings with `seconds` of silence after ayah `afterAyah`: every later ayah and its words move
 * that much later, and the file grows by it. The sample is recited without a pause between ayat, so
 * every line change takes the shortest dissolve (`Dmin`) whatever the tempo; this gives one change
 * room for its whole dissolve (V4-slow). The audio does not move, so the file is for stills only.
 */
export const pausedTimings = <T extends TimingsJson>(
  timings: T,
  {afterAyah, seconds}: {afterAyah: number; seconds: number},
): T => {
  const later = (entry: TimedEntry): TimedEntry => ({...entry, start: entry.start + seconds, end: entry.end + seconds});
  // Every field but the times is the file's own, so the result has its type.
  return {
    ...timings,
    ...(timings.durationSeconds === undefined ? {} : {durationSeconds: timings.durationSeconds + seconds}),
    ayat: timings.ayat.map((ayah) =>
      ayah.ayah <= afterAyah
        ? ayah
        : {...later(ayah), ayah: ayah.ayah, ...(ayah.words === undefined ? {} : {words: ayah.words.map(later)})},
    ),
  } as T;
};

/** The pause `'paused'` puts after ayah 2, the end of the first line: longer than the slow `lineDissolve` (28 f). */
export const SAMPLE_PAUSE = {afterAyah: 2, seconds: 1} as const;

/**
 * Frames of the bundled Al-Fatihah sample at 30 fps (12.2): ayah 2 is 0.33-3.53 s, its last word
 * 1:2:4 (الْعَالَمِينَ) is f58-f102, line 2's first word (1:3:1) is f106, the last word (1:7:9) ends
 * at f827. With the intro card (`introSeconds` 3, calm), the recording waits 3.869 s and its first
 * word is at f126.
 */
export const SAMPLE_FRAMES = {
  word124Start: 58,
  word124End: 102,
  line2FirstWord: 106,
  lastWordEnd: 827,
  introFirstWord: 126,
  /** 1:2:3 (رَبِّ, a kasra under its bāʾ) is at full wash, 1:2:2's mark gone: it ends at f58. */
  word123Washed: 57,
  /** Line 2 (ayat 3 and 4) settled in the centre slot during ayah 3, which ends at f184. */
  ayah3Settled: 160,
  /** Ayah 3's translation fully in (its dissolve ends by f116). */
  ayah3Translation: 140,
} as const;

const still = (...frames: DesignFrame[]): DesignShot => ({kind: 'still', frames});
const strip = (from: number, to: number): DesignShot => ({kind: 'strip', from, to});

const noMark = {highlight: {mode: 'none'}} as const;

/** The cases, in 12.2's order, each reference after the case it serves. */
export const DESIGN_CASES: readonly DesignCase[] = [
  {
    id: 'V1',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {},
    shots: [still(56, 60)],
    scale: 0.5,
    criteria:
      'Ivory #f8f3e6 page; three centred lines, margins 190 px (95 at half scale); a word at rest at 0.6 (ink ≈ #74716a ±6); 1:2:1-1:2:4 full ink; line 2 at 0.3; nothing coloured',
  },
  {
    id: 'V2',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {},
    shots: [strip(56, 66)],
    scale: 0.5,
    criteria: '1:2:4 goes from rest to full over f58-f64, monotonic, no other change on screen',
  },
  {
    id: 'V3',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {},
    shots: [strip(96, 140)],
    scale: 0.5,
    criteria:
      'The track does not move before 1:2:4 has ended (f102); the scroll lasts 24 f; no frame where a word above the centre slot is marked',
  },
  {
    id: 'V3-slow',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {animation: {tempo: 'slow'}},
    shots: [strip(96, 150)],
    scale: 0.5,
    criteria: 'As V3, the scroll lasting 34 f',
  },
  {
    id: 'V4',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {layout: {visibleLines: 0}},
    shots: [strip(96, 130)],
    scale: 0.5,
    criteria:
      'Line 1 still fully visible at f102; dissolve after it; no frame with both lines > 0.2; never blank (out + in ≥ 0.15, deviation 1)',
  },
  {
    id: 'V4-slow',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {layout: {visibleLines: 0}, animation: {tempo: 'slow'}},
    // A second of silence after ayah 2, so the change has room for its slow 28 frames (see `pausedTimings()`).
    content: {timingsFile: ASSET_PATHS.paused},
    // Line 2's first word starts at f136 after the pause: the strip ends before it fills in.
    shots: [strip(96, 135)],
    scale: 0.5,
    assets: ['paused'],
    criteria:
      'As V4 at the slow tempo, after a 1 s pause: line 1 full at f102, the dissolve starting after it and lasting the slow lineDissolve (28 f, the calm 20 × 1.4)',
  },
  {
    id: 'V5',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {layout: {visibleLines: 0}, animation: {lines: 'rise'}},
    shots: [strip(96, 130)],
    scale: 0.5,
    criteria: 'Incoming line rises ≤ 6 px at half scale (11 px full); outgoing line does not move',
  },
  ...(['mushaf', 'haram-night', 'madinah-green'] as const).map(
    (look): DesignCase => ({
      id: `V6-${look}`,
      composition: 'MushafRecitation',
      look,
      format: 'landscape',
      overrides: {},
      shots: [still(60)],
      scale: 1,
      criteria:
        'Rosette outline and numerals in gold line; petals vellum (or the ground on dark); no pink, no mint, no solid gold coin',
    }),
  ),
  // The surah header of each look: the sample starts at ayah 2, so the recitation shows none; the
  // passage shows Al-Fatihah's from its first ayah, the header line in the centre slot at f40.
  ...(['mushaf', 'haram-night', 'madinah-green'] as const).map(
    (look): DesignCase => ({
      id: `V6-header-${look}`,
      composition: 'MushafPassage',
      look,
      format: 'landscape',
      overrides: {},
      content: {surah: 1, fromAyah: 1, toAyah: 2, header: 'name'},
      shots: [still(40)],
      scale: 1,
      criteria: 'The framed surah name and the basmalah’s rosette: no pink, no mint, no solid gold coin',
    }),
  ),
  {
    id: 'V7',
    composition: 'MushafRecitation',
    look: 'learning',
    format: 'landscape',
    overrides: {},
    shots: [still(56, 60, 63)],
    scale: 0.5,
    criteria:
      '1:2:4 drawn #806321 (its inkiest pixel within ΔE2000 5); at f63 the previous word 1:2:3 still partly tinted',
  },
  {
    id: 'V7-ref',
    composition: 'MushafRecitation',
    look: 'learning',
    format: 'landscape',
    overrides: noMark,
    shots: [still(56, 60, 63)],
    scale: 0.5,
    referenceOf: 'V7',
    criteria: 'V7 without a mark: what V7 is compared with',
  },
  {
    id: 'V8',
    composition: 'MushafRecitation',
    look: 'tajweed',
    format: 'landscape',
    overrides: {highlight: {style: 'tint'}},
    shots: [still(60)],
    scale: 0.5,
    criteria: 'No word recoloured; a wash behind 1:2:4; tajweed colours intact',
  },
  {
    id: 'V8-ref',
    composition: 'MushafRecitation',
    look: 'tajweed',
    format: 'landscape',
    overrides: noMark,
    shots: [still(60)],
    scale: 0.5,
    referenceOf: 'V8',
    criteria: 'V8 without a mark',
  },
  // `black` paints its glyphs white, so it is a theme for a dark ground: Haram night's charcoal.
  {
    id: 'V9',
    composition: 'MushafRecitation',
    look: 'haram-night',
    format: 'landscape',
    // The default accent, `#b8913a`, whose tint on charcoal 3.1.2 gives (Haram night's own is `#d8b56a`).
    overrides: {theme: 'black', highlight: {mode: 'word', style: 'tint', color: '#b8913a'}},
    shots: [still(56, 60, 63)],
    scale: 0.5,
    criteria:
      '1:2:4 letters in #b19353-ish gold (the tint on charcoal); rosettes and other words untouched; the unmarked words legible on the ground',
  },
  {
    id: 'V9-ref',
    composition: 'MushafRecitation',
    look: 'haram-night',
    format: 'landscape',
    overrides: {theme: 'black', ...noMark},
    shots: [still(56, 60, 63)],
    scale: 0.5,
    referenceOf: 'V9',
    criteria: 'V9 without a mark',
  },
  ...(['landscape', 'vertical'] as const).flatMap((format): DesignCase[] => {
    const suffix = format === 'landscape' ? '' : '-vertical';
    return [
      {
        id: `V10${suffix}`,
        composition: 'MushafRecitation',
        look: 'haram-night',
        format,
        overrides: {},
        shots: [still(60)],
        scale: 0.5,
        criteria:
          'One continuous band over all of ayah 2 on its line, rosette included; soft rounded ends; no seam (band luminance along its centre row varies < 1 %); band clear of the lines above and below',
      },
      {
        id: `V10${suffix}-ref`,
        composition: 'MushafRecitation',
        look: 'haram-night',
        format,
        overrides: noMark,
        shots: [still(60)],
        scale: 0.5,
        referenceOf: `V10${suffix}`,
        criteria: `V10${suffix} without a mark`,
      },
      {
        id: `V11${suffix}`,
        composition: 'MushafRecitation',
        look: 'haram-night',
        format,
        overrides: {highlight: {mode: 'word'}},
        shots: [still(SAMPLE_FRAMES.word123Washed)],
        scale: 1,
        criteria:
          'A word wash on 1:2:3 (رَبِّ, its kasra the deepest mark of the line): the marks below the letters stay inside the band’s feather; the band never touches the next line',
      },
      {
        id: `V11${suffix}-ref`,
        composition: 'MushafRecitation',
        look: 'haram-night',
        format,
        overrides: noMark,
        shots: [still(SAMPLE_FRAMES.word123Washed)],
        scale: 1,
        referenceOf: `V11${suffix}`,
        criteria: `V11${suffix} without a mark`,
      },
    ];
  }),
  {
    id: 'V12',
    composition: 'MushafRecitation',
    look: 'madinah-green',
    format: 'landscape',
    overrides: {},
    shots: [still(60, SAMPLE_FRAMES.ayah3Settled)],
    scale: 0.5,
    criteria:
      'Jadwal double rule at the safe area in gold at 0.45; ayah 2 full, the line below at the neighbour opacity; at f160 ayah 3 full and ayah 4 beside it at rest (0.6)',
  },
  {
    id: 'V13',
    composition: 'MushafRecitation',
    look: 'tajweed',
    format: 'landscape',
    overrides: {},
    shots: [still(60)],
    scale: 0.5,
    criteria:
      'Legend as one centred row in a band under the lines; nothing overlapped; pastels not washed out (rest 0.7)',
  },
  {
    id: 'V13-page',
    composition: 'MushafPage',
    look: 'tajweed',
    format: 'landscape',
    overrides: {},
    shots: [still(60)],
    scale: 0.5,
    criteria: 'As V13 on the page: the legend under the page, nothing overlapped',
  },
  ...(['landscape', 'vertical'] as const).flatMap((format): DesignCase[] => {
    const id = format === 'landscape' ? 'V14' : 'V14-vertical';
    return [
      {
        id,
        composition: 'MushafRecitation',
        look: 'mushaf',
        format,
        overrides: {text: {translationFile: ASSET_PATHS.translation}},
        shots: [still(60, 110, SAMPLE_FRAMES.ayah3Translation)],
        scale: 0.5,
        assets: ['translation'],
        criteria:
          'Centred EB Garamond 500, 36 px at 16:9 and 26 px at 9:16; at most 2 lines; at f110 mid-dissolve from ayah 2’s translation to ayah 3’s (ayah 2 ends at f106)',
      },
      // The ruler of the size: the same translation set at 26 px where nothing caps it (16:9).
      {
        id: `${id}-ref`,
        composition: 'MushafRecitation',
        look: 'mushaf',
        format: 'landscape',
        overrides: {text: {translationFile: ASSET_PATHS.translation, translationSize: 26}},
        shots: [still(60)],
        scale: 0.5,
        assets: ['translation'],
        referenceOf: id,
        criteria: `${id}'s translation at 26 px on a 16:9 frame: what its drawn size is measured against`,
      },
    ];
  }),
  {
    id: 'V15',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {
      overlay: {title: 'both', reciter: 'Abdul Hamid Ghraio'},
      text: {translationFile: ASSET_PATHS.translation},
    },
    shots: [still(0, 30, 90, SAMPLE_FRAMES.introFirstWord)],
    scale: 0.5,
    assets: ['translation'],
    criteria:
      'f0 bare ground; f30 cartouche, hairline with lozenge, «الآيات ٢–٧» with ٢ on the right, "Ayat 2–7", reciter, attribution; at the first word the card is gone and the lines are settled; duration grew by introDelaySeconds',
  },
  {
    id: 'V16',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {overlay: {title: 'corner'}, memorize: {mode: 'repeat'}},
    shots: [still(150)],
    scale: 0.5,
    criteria: '"AL-FATIHAH · 2" small caps inside the safe area; "2 / 3" opposite, no pill',
  },
  {
    id: 'V17',
    composition: 'MushafRecitation',
    look: 'mushaf',
    format: 'landscape',
    overrides: {endCard: {show: 'credits'}},
    shots: [
      still(SAMPLE_FRAMES.lastWordEnd + 15, SAMPLE_FRAMES.lastWordEnd + 60, SAMPLE_FRAMES.lastWordEnd + 90, 'last'),
    ],
    scale: 0.5,
    criteria:
      'Lines held (last word + 0.5 s), then fading (+ 2 s), then the credits card on the same ground (+ 3 s); surah-name glyph title once',
  },
  {
    id: 'V18',
    composition: 'MushafPage',
    look: 'mushaf',
    format: 'landscape',
    overrides: {},
    shots: [still(60), strip(100, 114)],
    scale: 0.5,
    criteria:
      'Page 92 % of the height at most; band cross-fades between lines; turn a dissolve after the page’s last word (the sample is one page: no turn); double rule, no corner dots',
  },
  {
    id: 'V18-ref',
    composition: 'MushafPage',
    look: 'mushaf',
    format: 'landscape',
    overrides: {pageView: {lineHighlight: 'none'}, ...noMark},
    shots: [still(60), strip(100, 114)],
    scale: 0.5,
    referenceOf: 'V18',
    criteria: 'V18 without the band and without a word mark (the band replaces it on the page)',
  },
  {
    id: 'V19',
    composition: 'MushafRecitation',
    look: 'haram-night',
    format: 'landscape',
    overrides: {
      background: {kind: 'image', src: ASSET_PATHS.backdrop, vignette: 0.2, kenBurns: 'slow-zoom', kenBurnsScale: 1.04},
    },
    shots: [still(0, 'last')],
    scale: 0.5,
    assets: ['backdrop'],
    criteria: 'Image dimmed ≥ 0.45; vignette visible without banding; zoom ≤ 1.05 at the end',
  },
  {
    id: 'V20',
    composition: 'MushafAyahText',
    look: 'haram-night',
    format: 'vertical',
    overrides: {highlight: {mode: 'word'}},
    shots: [still(60, 700), strip(96, 130)],
    scale: 0.5,
    criteria: 'Wash per word, no lone word on the last line, word spacing 0.1 em; ayah dissolve without blank frame',
  },
  {
    id: 'V20-ref',
    composition: 'MushafAyahText',
    look: 'haram-night',
    format: 'vertical',
    overrides: noMark,
    shots: [still(60)],
    scale: 0.5,
    referenceOf: 'V20',
    criteria: 'V20 without a mark',
  },
];

const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `base` with `patch` merged in, objects key by key, anything else replaced. */
export const deepMerge = (base: Plain, patch: Plain): Plain => {
  const out: Record<string, unknown> = {...base};
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] = isPlain(current) && isPlain(value) ? deepMerge(current, value) : value;
  }
  return out;
};

/** The composition's defaults, as the Root writes them out. */
export const defaultsOf = (composition: DesignComposition): Plain =>
  composition === 'MushafPage'
    ? defaultMushafPageProps
    : composition === 'MushafAyahText'
      ? defaultMushafAyahTextProps
      : composition === 'MushafPassage'
        ? defaultMushafPassageProps
        : defaultMushafRecitationProps;

/**
 * The props a case renders with: `applyFormat(applyLook(defaults, look), format)` and the case's
 * overrides, cut to the style groups the composition has (whole groups), and the case's content
 * props, so `--props` replaces those and the Root keeps the rest. A look id that names no look throws.
 */
export const casePropsFor = (designCase: DesignCase): Plain => {
  const look = lookById(designCase.look);
  if (look === null) throw new Error(`${designCase.id}: there is no look ${JSON.stringify(designCase.look)}`);
  const base = defaultsOf(designCase.composition);
  const styled = deepMerge(applyFormat(applyLook(base, look), designCase.format), designCase.overrides);
  const out: Record<string, unknown> = {};
  for (const group of STYLE_GROUPS) if (group in base) out[group] = styled[group];
  return {...out, ...designCase.content};
};

/** The case of an id, or `null`. */
export const caseById = (id: string): DesignCase | null => DESIGN_CASES.find((c) => c.id === id) ?? null;

/** The reference case compared with `designCase`, or `null`. */
export const referenceFor = (designCase: DesignCase): DesignCase | null =>
  DESIGN_CASES.find((c) => c.referenceOf === designCase.id) ?? null;

/** `--only V1,V10`: the cases asked for, with the references they need; every case when empty. */
export const selectCases = (ids: readonly string[]): DesignCase[] => {
  if (ids.length === 0) return [...DESIGN_CASES];
  const unknown = ids.filter((id) => caseById(id) === null);
  if (unknown.length > 0) throw new Error(`no such case: ${unknown.join(', ')}`);
  return DESIGN_CASES.filter((c) => ids.includes(c.id) || (c.referenceOf !== undefined && ids.includes(c.referenceOf)));
};

/** The file of one still of a case, in the round's folder: `V1-f060.png`. */
export const stillFile = (id: string, frame: number): string => `${id}-f${String(frame).padStart(3, '0')}.png`;

/**
 * The folder of a case's strip: every frame rendered as a PNG (`remotion render --sequence`), so
 * the checker measures what was drawn, not a video codec's approximation of it.
 */
export const stripDir = (id: string): string => `${id}-strip`;

// ---------------------------------------------------------------------------------------------
// The command line and the commands it runs

/** What `design-stills.ts` was asked to do. */
export type DesignOptions = {
  /** The folder the rounds go under. */
  readonly out: string;
  /** The round's name: its stills go to `<out>/<round>/`. */
  readonly round: string;
  /** The cases to render (with their references); every case when empty. */
  readonly only: readonly string[];
  /** A translation envelope to show in V14 and V15, instead of fetching Saheeh International. */
  readonly translation: string | null;
  /** Reuse the round's bundle when there is one. */
  readonly reuseBundle: boolean;
  /** Run `design-check.ts` on the round afterwards. */
  readonly check: boolean;
  /** Renders run at once. */
  readonly jobs: number;
  /** Passed to every `remotion` command (`--browser-executable=...`). */
  readonly extra: readonly string[];
};

export const DESIGN_USAGE = `Render the stills and strips of render-design.md 12.2 and check them.

Usage (from apps/mushaf-studio):
  bun scripts/design-stills.ts [options] [-- <extra remotion args>]

Options:
  --out <dir>            the folder of the rounds (default out/design)
  --round <name>         the round, a folder under --out (default round-1)
  --only <ids>           the cases, comma-separated (V1,V10-vertical); their references come along
  --translation <file>   a translation envelope for V14 and V15 (default: Saheeh International,
                         fetched from quran.com once per round)
  --reuse-bundle         keep the round's bundle when it is there
  --no-check             render only; run scripts/design-check.ts <round folder> later
  --jobs <n>             renders at once (default 2)
  -h, --help             this text

Each case's props (style groups, and the content a case sets) go to <round>/<case>.json, its stills
to <round>/<case>-f<frame>.png and its strips to <round>/<case>-strip/. The round's public/ is a copy
of the app's with the backdrop, the paused timings and the translation added, so nothing is written
into the app.
Example:
  bun scripts/design-stills.ts --round r1 -- --browser-executable=/opt/pw-browsers/chromium`;

/** A mistake on the command line. */
export class DesignUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignUsageError';
  }
}

/** The command line of `design-stills.ts`, or `'help'`. */
export const parseDesignArgs = (argv: readonly string[]): DesignOptions | 'help' => {
  const dash = argv.indexOf('--');
  const own = dash < 0 ? argv : argv.slice(0, dash);
  const extra = dash < 0 ? [] : argv.slice(dash + 1);
  let out = 'out/design';
  let round = 'round-1';
  let only: string[] = [];
  let translation: string | null = null;
  let reuseBundle = false;
  let check = true;
  let jobs = 2;
  for (let i = 0; i < own.length; i++) {
    const arg = own[i] as string;
    const value = (): string => {
      const next = own[++i];
      if (next === undefined || next.startsWith('--')) throw new DesignUsageError(`${arg} needs a value`);
      return next;
    };
    if (arg === '-h' || arg === '--help') return 'help';
    else if (arg === '--out') out = value();
    else if (arg === '--round') round = value();
    else if (arg === '--only')
      only = value()
        .split(',')
        .filter((id) => id !== '');
    else if (arg === '--translation') translation = value();
    else if (arg === '--reuse-bundle') reuseBundle = true;
    else if (arg === '--no-check') check = false;
    else if (arg === '--jobs') {
      jobs = Number(value());
      if (!Number.isInteger(jobs) || jobs < 1) throw new DesignUsageError('--jobs takes a whole number of 1 or more');
    } else throw new DesignUsageError(`unknown option ${arg} (see --help)`);
  }
  if (!/^[\w.-]+$/.test(round)) throw new DesignUsageError(`--round ${round}: use letters, digits, ".", "-" and "_"`);
  selectCases(only);
  return {out, round, only, translation, reuseBundle, check, jobs, extra};
};

/** `remotion bundle` of the app into the round, with the round's own `public/`. */
export const bundleArgs = (entry: string, bundle: string, publicDir: string, extra: readonly string[]): string[] => [
  'remotion',
  'bundle',
  entry,
  `--out-dir=${bundle}`,
  `--public-dir=${publicDir}`,
  '--log=error',
  ...extra.filter((arg) => !arg.startsWith('--browser-executable')),
];

/** `remotion compositions` with a case's props: what prints the duration. */
export const compositionsArgs = (bundle: string, props: string, extra: readonly string[]): string[] => [
  'remotion',
  'compositions',
  bundle,
  `--props=${props}`,
  ...extra,
];

/** `remotion still` of one frame of a case. */
export const stillArgs = (
  bundle: string,
  designCase: DesignCase,
  file: string,
  frame: number,
  props: string,
  extra: readonly string[],
): string[] => [
  'remotion',
  'still',
  bundle,
  designCase.composition,
  file,
  `--frame=${frame}`,
  `--props=${props}`,
  `--scale=${designCase.scale}`,
  '--log=error',
  ...extra,
];

/** `remotion render` of a strip, every frame a PNG in `dir`. */
export const stripArgs = (
  bundle: string,
  designCase: DesignCase,
  dir: string,
  from: number,
  to: number,
  props: string,
  extra: readonly string[],
): string[] => [
  'remotion',
  'render',
  bundle,
  designCase.composition,
  dir,
  '--sequence',
  '--image-format=png',
  `--frames=${from}-${to}`,
  `--props=${props}`,
  `--scale=${designCase.scale}`,
  '--log=error',
  ...extra,
];

/** The `durationInFrames` `remotion compositions` printed for `composition`, or `null`. */
export const durationFrom = (output: string, composition: DesignComposition): number | null => {
  const line = output.split('\n').find((l) => l.trim().startsWith(`${composition} `));
  const match = line === undefined ? null : /\d+x\d+\s+(\d+)/.exec(line);
  return match === null ? null : Number(match[1]);
};

/** Whether a case needs its composition's length: a `'last'` frame, or V1 and V15 (the intro delay). */
export const needsDuration = (designCase: DesignCase): boolean =>
  designCase.id === 'V1' ||
  designCase.id === 'V15' ||
  designCase.shots.some((s) => s.kind === 'still' && s.frames.includes('last'));

// Scenarios for the <Player> harness page (?scenario=<name>), shared with the Playwright suite.
import {syntheticLine} from '../../packages/remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import {defaultLineHarnessProps, type LineHarnessProps} from '../src/harness/LineHarness';

/** The page-10 tajweed font, copied by `bun run qul fonts 10` into example/public. */
export const FIXTURE_FONT_URL = '/fonts/qpc-v4-tajweed/p10.ttf';
/** QUL's two exports, mirrored by `bun run qul data` into example/public. */
export const MIRROR_DATA = {words: '/data/qpc-v4/words.json.zip', layout: '/data/qpc-v4/layout.db.zip'};
/** The two shared fonts (surah names, quran-common), copied by `bun run qul fonts` into example/public/fonts/<id>/. */
export const SHARED_FONTS_URL = '/fonts';
/** Page 10 line 3 in the colour font: 2:62 ends and 2:63 begins on it (the fixture font's page). */
const P10_L3 = {theme: 'light', page: 10, line: 3} as const;

// Synthetic lines (three tiny pages that mimic the real data); the glyphs come from the p10 fixture font.
const justified = () => syntheticLine(2, 3);
const justifiedShort = () => syntheticLine(2, 4);
const centered = () => syntheticLine(1, 2);
const twoCodePoints = () => syntheticLine(3, 1);
// Page 3 line 2 carries the end of 2:3 and the whole of 2:4 — the case slicing is for.
const twoAyahs = () => syntheticLine(3, 2);
// Page 2 opens with the header of surah 2 and its basmalah; the synthetic page has two ayah lines after them.
const header = () => syntheticLine(2, 1);
const basmalah = () => syntheticLine(2, 2);

// Synthetic lines are not real mushaf lines, so fitting them to the box would say nothing: the
// scenarios pin the fixed type size and the real-data test covers fitting.
const base: LineHarnessProps = {
  ...defaultLineHarnessProps,
  lines: [justified(), centered(), twoCodePoints()],
  fit: 'mushaf',
  fontUrl: FIXTURE_FONT_URL,
};

export const scenarios: Record<string, LineHarnessProps> = {
  static: base,
  overflow: {...base, lines: [justified(), justifiedShort(), centered(), twoCodePoints()]},
  fade: {...base, enter: 'fade'},
  slide: {...base, enter: 'slide'},
  reveal: {...base, enter: 'reveal'},
  none: {...base, enter: 'none'},
  dissolve: {...base, enter: 'dissolve'},
  premount: {...base, enter: 'fade', from: 60, premountFor: 30},
  /** One line whose Sequence ends at frame 60; the exit runs over frames 40-59. */
  'exit-fade': {...base, lines: [justified()], exit: 'fade', exitFrames: 20, durationInFrames: 60},
  'exit-slide': {...base, lines: [justified()], exit: 'slide', exitFrames: 20, durationInFrames: 60},
  /** Two lines in one slot: the second starts (frame 40) as the first begins to leave; both fade. */
  replace: {
    ...base,
    lines: [justified(), centered()],
    slot: 'same',
    enter: 'fade',
    enterFrames: 20,
    exit: 'fade',
    exitFrames: 20,
    durationInFrames: 60,
    stagger: 40,
  },
  /** The package's slide+fade: opacity finishes before the movement, travel is 28 % of a line box. */
  'slide-fade': {
    ...base,
    lines: [justified()],
    enter: 'slide-fade',
    enterFrames: 20,
    exit: 'slide-fade',
    exitFrames: 20,
    durationInFrames: 60,
  },
  /** revealRtl with a soft mask edge instead of the hard clip-path one. */
  'soft-reveal': {...base, lines: [justified()], enter: 'soft-reveal', enterFrames: 20},
  /** Fade through: the first line's exit ends exactly where the second line's entrance starts. */
  'fade-through': {
    ...base,
    lines: [justified(), centered()],
    slot: 'same',
    enter: 'slide-fade',
    enterFrames: 20,
    exit: 'slide-fade',
    exitFrames: 20,
    durationInFrames: 40,
    stagger: 40,
  },
  /** Plain theme: the monochrome font, the words follow CSS `color` (the harness paints the page black on white). */
  plain: {...base, lines: [syntheticLine(2, 3, {theme: 'plain'})], fontUrl: '/fonts/qpc-v4/p10.ttf'},
  /** QUL's Light theme: the full tajweed colours on a light page. */
  tajweed: {...base, lines: [syntheticLine(2, 3, {theme: 'light'})]},
  /** QUL's Dark and Sepia themes: the tajweed colours for those backgrounds. */
  dark: {...base, lines: [syntheticLine(2, 3, {theme: 'dark'})], background: '#343a40'},
  sepia: {...base, lines: [syntheticLine(2, 3, {theme: 'sepia'})], background: '#fff7ea'},
  /** QUL's Black theme: everything white, the ayah number black on the marker. */
  black: {...base, lines: [syntheticLine(2, 3, {theme: 'black'})], background: '#343a40'},
  /** Normal (QUL's default look): the colour font at palette 3, everything written following the page's CSS `color`. */
  mandala: {...base, lines: [syntheticLine(2, 3, {theme: 'normal'})], color: 'rgb(27, 111, 63)'},
  /** Every part recoloured: ink, the rosette's petals and jewel, and the disc behind the number. */
  'mandala-gold': {
    ...base,
    lines: [
      syntheticLine(2, 3, {
        theme: {
          base: 'normal',
          colors: {ink: '#1b1b1b', frame: '#1b1b1b', accent: '#c8a45c', detail: '#1b6f3f', background: 'transparent'},
        },
      }),
    ],
  },
  /** One word marked as current, the rest dimmed — the karaoke-style follow. */
  highlight: {...base, lines: [justified()], activeWordId: '2:1:2', dimOthersTo: 0.35},
  /** The two-ayah line whole, as the reference for the slices below. */
  'two-ayahs': {...base, lines: [twoAyahs()]},
  /** Only 2:4: the words of 2:3 take no space and 2:4 sits centred, at the same size. */
  'slice-ayah': {...base, lines: [twoAyahs()], slice: {ayah: 4}},
  'slice-range': {...base, lines: [twoAyahs()], slice: {fromAyah: 3, toAyah: 3}},
  /** Keeps every word: nothing changes. */
  'slice-all': {...base, lines: [twoAyahs()], slice: {fromAyah: 3}},
  /** Keeps none: a blank line that still takes its slot. */
  'slice-empty': {...base, lines: [twoAyahs()], slice: {ayah: 9}},
  /** The same slice, carried by the line data instead of the prop. */
  'slice-data': {...base, lines: [twoAyahs()], slice: {ayah: 4}, sliceOnData: true},
  /** revealRtl sweeps the whole measure; the centred slice appears as the sweep reaches it. */
  'slice-reveal': {...base, lines: [twoAyahs()], slice: {ayah: 4}, enter: 'reveal', enterFrames: 20},
  /** A surah_name line: the name of surah 2 in its printed frame, both fonts from the public folder. */
  header: {...base, lines: [header()], sharedFontsUrl: SHARED_FONTS_URL},
  /** The same name alone, without the frame. */
  'header-plain': {...base, lines: [header()], sharedFontsUrl: SHARED_FONTS_URL, framed: false},
  /** A basmallah line: the four glyphs of the surah-name font on the page baseline. */
  basmalah: {...base, lines: [basmalah()], sharedFontsUrl: SHARED_FONTS_URL},
  /** The whole synthetic page 2, stacked: header, basmalah, two ayah lines. */
  'page-2': {...base, lines: [header(), basmalah(), justified(), justifiedShort()], sharedFontsUrl: SHARED_FONTS_URL},
  /** A standalone surah name (At-Tawbah), framed, and a juz name. */
  'surah-name': {...base, lines: [], surahName: 9, sharedFontsUrl: SHARED_FONTS_URL},
  juz: {...base, lines: [], juz: 1, sharedFontsUrl: SHARED_FONTS_URL},
  /** A header entering with the package's slide+fade, like a line. */
  'header-enter': {...base, lines: [header()], sharedFontsUrl: SHARED_FONTS_URL, enter: 'slide-fade', enterFrames: 20},
  /** The shared fonts from QUL's CDN (needs network). */
  'header-cdn': {...base, lines: [header()]},
  /** The shared fonts are missing from the public folder: FONT_HTTP names the surah-name font. */
  'header-404': {...base, lines: [header()], sharedFontsUrl: '/missing'},
  /**
   * A window of three lines over the five synthetic ayah lines (three pages): a linear 10-frame
   * scroll finishing at every step, so the position is 0 at frame 0, 0.5 at frame 15, 1 at frame 20.
   */
  window: {
    ...base,
    lines: [justified(), justifiedShort(), centered(), twoCodePoints(), twoAyahs()],
    durationInFrames: 200,
    window: {
      visibleLines: 3,
      steps: [0, 20, 40, 60, 80],
      position: null,
      scrollFrames: 10,
      neighbourOpacity: 1,
      preloadLines: 1,
    },
  },
  /** The same with the neighbours dimmed. */
  'window-dim': {
    ...base,
    lines: [justified(), justifiedShort(), centered(), twoCodePoints(), twoAyahs()],
    durationInFrames: 200,
    window: {
      visibleLines: 3,
      steps: [0, 20, 40, 60, 80],
      position: null,
      scrollFrames: 10,
      neighbourOpacity: 0.45,
      preloadLines: 1,
    },
  },
  /** Two steps closer than the scroll (35 after 30): one continuous movement over two lines. */
  'window-overlap': {
    ...base,
    lines: [justified(), justifiedShort(), centered(), twoCodePoints(), twoAyahs()],
    durationInFrames: 200,
    window: {
      visibleLines: 3,
      steps: [0, 30, 35, 70, 75],
      position: null,
      scrollFrames: 10,
      neighbourOpacity: 1,
      preloadLines: 1,
    },
  },
  /** The first step in the future: line 0 rises from the slot below into the centre by frame 20. */
  'window-first-scroll': {
    ...base,
    lines: [justified(), justifiedShort(), centered(), twoCodePoints(), twoAyahs()],
    durationInFrames: 200,
    window: {
      visibleLines: 3,
      steps: [20, 50, 80, 110, 140],
      position: null,
      scrollFrames: 10,
      neighbourOpacity: 1,
      preloadLines: 1,
    },
  },
  /** A position given directly: a quarter of the way from line 1 to line 2. */
  'window-position': {
    ...base,
    lines: [justified(), justifiedShort(), centered(), twoCodePoints(), twoAyahs()],
    window: {visibleLines: 3, steps: null, position: 1.25, scrollFrames: 10, neighbourOpacity: 1, preloadLines: 1},
  },
  /** The whole window fading in over 20 frames. */
  'window-enter': {
    ...base,
    lines: [justified(), justifiedShort(), centered(), twoCodePoints(), twoAyahs()],
    enter: 'fade',
    enterFrames: 20,
    durationInFrames: 200,
    window: {
      visibleLines: 3,
      steps: [0, 40, 80, 120, 160],
      position: null,
      scrollFrames: 10,
      neighbourOpacity: 1,
      preloadLines: 1,
    },
  },
  'font-404': {...base, fontUrl: '/fonts/qpc-v4-tajweed/missing.woff2'},
  'font-html': {...base, fontUrl: '/player/index.html'},
  /**
   * A real line (page 10 line 3, from the mirror of QUL's exports) from QUL's CDN, with the fonts
   * packages as the fallback. The suite takes the CDN down (or serves it) with page.route().
   */
  fallback: {
    ...base,
    lines: [],
    fit: 'line',
    resolve: P10_L3,
    data: MIRROR_DATA,
    fontUrl: null,
    fontPackages: 'fallback',
  },
  /** The same line from the fonts package only: the CDN is never contacted. */
  'package-only': {
    ...base,
    lines: [],
    fit: 'line',
    resolve: P10_L3,
    data: MIRROR_DATA,
    fontUrl: null,
    fontPackages: 'source',
  },
  /** No pin: the CDN URL of the registry (needs network). */
  cdn: {...base, lines: [syntheticLine(1, 2, {theme: 'light'})], fontUrl: null},
  /**
   * The convenience form, resolved in the tab from the example's mirror of QUL's exports
   * (`bun run qul data`): the zips are fetched, unzipped and read in the browser.
   */
  'resolve-data': {...base, lines: [], fit: 'line', resolve: P10_L3, data: MIRROR_DATA},
  /** The words export is missing: DATA_HTTP. */
  'data-404': {
    ...base,
    lines: [],
    resolve: P10_L3,
    data: {words: '/data/qpc-v4/missing.json.zip', layout: MIRROR_DATA.layout},
  },
  /** An HTML page instead of the export: DATA_INVALID. */
  'data-html': {...base, lines: [], resolve: P10_L3, data: {words: '/player/index.html', layout: MIRROR_DATA.layout}},
  /** A path relative to nothing in particular: BAD_DATA_URL. */
  'data-relative': {...base, lines: [], resolve: P10_L3, data: {words: 'data/qpc-v4/words.json.zip'}},
};

export const scenarioNames = Object.keys(scenarios);

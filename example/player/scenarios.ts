// Scenarios for the <Player> harness page (?scenario=<name>), shared with the Playwright suite.
import {syntheticLine} from '../../packages/remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import {defaultLineHarnessProps, type LineHarnessProps} from '../src/harness/LineHarness';

/** The page-10 tajweed font, copied by `node scripts/fetch-qul.mjs --fonts 10` into example/public. */
export const FIXTURE_FONT_URL = '/fonts/qpc-v4-tajweed/p10.ttf';

// Synthetic lines (the real data is compiled by the user); the glyphs come from the p10 fixture.
const justified = () => syntheticLine(2, 3);
const justifiedShort = () => syntheticLine(2, 4);
const centered = () => syntheticLine(1, 2);
const twoCodePoints = () => syntheticLine(3, 1);

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
  replace: {...base, lines: [justified(), centered()], slot: 'same', enter: 'fade', enterFrames: 20, exit: 'fade', exitFrames: 20, durationInFrames: 60, stagger: 40},
  /** The package's slide+fade: opacity finishes before the movement, travel is 28 % of a line box. */
  'slide-fade': {...base, lines: [justified()], enter: 'slide-fade', enterFrames: 20, exit: 'slide-fade', exitFrames: 20, durationInFrames: 60},
  /** revealRtl with a soft mask edge instead of the hard clip-path one. */
  'soft-reveal': {...base, lines: [justified()], enter: 'soft-reveal', enterFrames: 20},
  /** Fade through: the first line's exit ends exactly where the second line's entrance starts. */
  'fade-through': {...base, lines: [justified(), centered()], slot: 'same', enter: 'slide-fade', enterFrames: 20, exit: 'slide-fade', exitFrames: 20, durationInFrames: 40, stagger: 40},
  /** Plain glyph set: the words follow CSS `color` (the harness paints the page black on white). */
  plain: {...base, lines: [syntheticLine(2, 3, {}, 'qpc-v4')], fontUrl: '/fonts/qpc-v4/p10.ttf'},
  /** One word marked as current, the rest dimmed — the karaoke-style follow. */
  highlight: {...base, lines: [justified()], activeWordId: '2:1:2', dimOthersTo: 0.35},
  'font-404': {...base, fontUrl: '/fonts/qpc-v4-tajweed/missing.woff2'},
  'font-html': {...base, fontUrl: '/player/index.html'},
  /** No pin: the CDN URL of the registry (needs network). */
  cdn: {...base, lines: [syntheticLine(1, 2, {}, 'qpc-v4-tajweed')], fontUrl: null},
};

export const scenarioNames = Object.keys(scenarios);

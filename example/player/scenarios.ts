// Scenarios for the <Player> harness page (?scenario=<name>), shared with the Playwright suite.
import {syntheticLine} from '../../packages/remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import type {LineHarnessProps} from '../src/harness/LineHarness';

/** The page-10 tajweed font, copied by `node scripts/fetch-qul.mjs --fonts 10` into example/public. */
export const FIXTURE_FONT_URL = '/fonts/qpc-v4-tajweed/p10.ttf';

// Synthetic lines (the real data is compiled by the user); the glyphs come from the p10 fixture.
const justified = () => syntheticLine(2, 3);
const justifiedShort = () => syntheticLine(2, 4);
const centered = () => syntheticLine(1, 2);
const twoCodePoints = () => syntheticLine(3, 1);

const base: LineHarnessProps = {
  lines: [justified(), centered(), twoCodePoints()],
  enter: 'plain',
  enterFrames: 20,
  from: 0,
  premountFor: 0,
  fontFile: null,
  fontUrl: FIXTURE_FONT_URL,
  fontSize: null,
  lineHeight: null,
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
  'font-404': {...base, fontUrl: '/fonts/qpc-v4-tajweed/missing.woff2'},
  'font-html': {...base, fontUrl: '/player/index.html'},
  /** No pin: the CDN URL of the registry (needs network). */
  cdn: {...base, lines: [syntheticLine(1, 2, {}, 'qpc-v4-tajweed')], fontUrl: null},
};

export const scenarioNames = Object.keys(scenarios);

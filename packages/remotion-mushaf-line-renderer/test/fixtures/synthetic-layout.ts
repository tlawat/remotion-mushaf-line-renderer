// The synthetic three-page mushaf from the compiler tests, compiled into the package's format so
// getMushafLine() and the component can be exercised without the real (user-compiled) data.
// @ts-expect-error — plain JS modules from scripts/ have no type declarations
import {compileLayout, validateLayout} from '../../../../scripts/lib/compile.mjs';
// @ts-expect-error — plain JS modules from scripts/ have no type declarations
import {SYNTH, SYNTH_PAGES} from '../../../../scripts/test/synthetic.mjs';
import type {CompiledLayout} from '../../src/data/format';

export const syntheticLayout: CompiledLayout = compileLayout(SYNTH_PAGES, SYNTH, {
  source: 'synthetic',
  generatedAt: '2026-01-01T00:00:00.000Z',
});
validateLayout(syntheticLayout, SYNTH);

export const SYNTHETIC_DEF = SYNTH as {pages: number; linesOnPage: (p: number) => number};

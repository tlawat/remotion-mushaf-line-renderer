import {describe, expect, it} from 'vitest';
// @ts-expect-error — plain JS modules from scripts/
import {validateLayout} from '../../../../scripts/lib/compile.mjs';
// @ts-expect-error — plain JS modules from scripts/
import {QPC_V4} from '../../../../scripts/lib/datasets.mjs';
import {indexPage, runAt} from '../../src/data/format';
import {layout} from '../../src/data/qpc-v4.generated';
import {syntheticLayout} from '../fixtures/synthetic-layout';

describe('compiled layout', () => {
  it('indexes the synthetic layout with correct line ranges and runs', () => {
    const p3 = indexPage(syntheticLayout, 3);
    expect(p3.lines.map((l) => [l.type, l.first, l.last])).toEqual([
      ['ayah', 0, 3],
      ['ayah', 4, 7],
      ['surah_name', -1, -1],
      ['ayah', 8, 11],
    ]);
    expect(p3.lines[2]?.surahNumber).toBe(3);
    expect(runAt(p3, 0)).toMatchObject({surah: 2, ayah: 2, firstPosition: 4, start: 0, end: 1});
    expect(runAt(p3, 2)).toMatchObject({surah: 2, ayah: 3, firstPosition: 1});
    expect(runAt(p3, 11)).toMatchObject({surah: 3, ayah: 1});
    expect(indexPage(syntheticLayout, 3)).toBe(p3); // memoised
  });

  const real = layout as typeof syntheticLayout | null;
  it.skipIf(real === null)('the committed KFGQPC V4 data satisfies every invariant', () => {
    const report = validateLayout(real, QPC_V4);
    expect(report).toMatchObject({
      lines: QPC_V4.invariants.lines,
      ayahLines: QPC_V4.invariants.ayahLines,
      surahNameLines: QPC_V4.invariants.surahNameLines,
      basmallahLines: QPC_V4.invariants.basmallahLines,
      centeredAyahLines: QPC_V4.invariants.centeredAyahLines,
      words: QPC_V4.invariants.words,
      ayahs: QPC_V4.invariants.ayahs,
    });
    expect(report.twoCodePointWords).toBeGreaterThan(4000);
  });
});

import {describe, expect, it} from 'vitest';
import {indexAyahs, indexPage, runAt} from '../../src/data/format';
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

  it('indexes the first page of every ayah', () => {
    const index = indexAyahs(syntheticLayout);
    expect(index.get(1001)).toBe(1);
    expect(index.get(2002)).toBe(2); // 2:2 starts on page 2 and continues on page 3
    expect(index.get(2003)).toBe(3);
    expect(index.get(3001)).toBe(3);
    expect(index.has(2009)).toBe(false);
    expect(indexAyahs(syntheticLayout)).toBe(index);
  });
});

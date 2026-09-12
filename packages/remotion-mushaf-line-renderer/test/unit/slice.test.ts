import {describe, expect, it} from 'vitest';
import {assertSlice, isInSlice, resolveSlice, sliceWords} from '../../src/slice';
import {syntheticLine} from '../fixtures/synthetic-lines';

// Synthetic page 3: line 1 carries the end of 2:2 and the start of 2:3 — with the rub-el-hizb
// marker sharing its `id` (2:3:1) with the word it precedes; line 2 carries the end of 2:3 and
// the whole of 2:4. wordIds are the compiled reading-order indices.
const twoAyahs = syntheticLine(3, 2);
const withMarker = syntheticLine(3, 1);
const header = syntheticLine(2, 1);

describe('resolveSlice', () => {
  it('keeps the words of the chosen ayahs as a wordId band, rosette included', () => {
    expect(twoAyahs.words.map((w) => [w.wordId, w.ayah, w.kind])).toEqual([
      [17, 3, 'word'],
      [18, 3, 'end'],
      [19, 4, 'word'],
      [20, 4, 'end'],
    ]);
    expect(resolveSlice(twoAyahs, {ayah: 4})).toEqual({first: 19, last: 20});
    expect(resolveSlice(twoAyahs, {ayah: 3})).toEqual({first: 17, last: 18});
    expect(resolveSlice(twoAyahs, {fromAyah: 3, toAyah: 3})).toEqual({first: 17, last: 18});
    // Open-ended: everything from the ayah on.
    expect(resolveSlice(twoAyahs, {fromAyah: 4})).toEqual({first: 19, last: 20});
  });

  it('is a no-op when it keeps every word, and empty when it keeps none', () => {
    expect(resolveSlice(twoAyahs, {fromAyah: 3})).toBeNull();
    expect(resolveSlice(twoAyahs, {fromAyah: 2, toAyah: 4})).toBeNull();
    expect(resolveSlice(twoAyahs, {fromAyah: 1, toAyah: 9})).toBeNull();
    expect(resolveSlice(twoAyahs, {ayah: 9})).toBe('empty');
    expect(resolveSlice(twoAyahs, {fromAyah: 5})).toBe('empty');
    expect(resolveSlice(twoAyahs, null)).toBeNull();
    expect(resolveSlice(twoAyahs, undefined)).toBeNull();
    // A wordless line has nothing to slice.
    expect(resolveSlice(header, {ayah: 1})).toBeNull();
  });

  it('bounds the band by wordId, so a marker sharing a location goes with its ayah', () => {
    expect(withMarker.words.map((w) => [w.wordId, w.id, w.kind])).toEqual([
      [13, '2:2:4', 'word'],
      [14, '2:2:5', 'end'],
      [15, '2:3:1', 'rub-el-hizb'],
      [16, '2:3:1', 'word'],
    ]);
    expect(resolveSlice(withMarker, {ayah: 3})).toEqual({first: 15, last: 16});
    expect(resolveSlice(withMarker, {ayah: 2})).toEqual({first: 13, last: 14});
  });

  it('answers membership for every kind of resolved slice', () => {
    expect(isInSlice(null, 17)).toBe(true);
    expect(isInSlice('empty', 17)).toBe(false);
    expect(isInSlice({first: 19, last: 20}, 18)).toBe(false);
    expect(isInSlice({first: 19, last: 20}, 19)).toBe(true);
    expect(isInSlice({first: 19, last: 20}, 20)).toBe(true);
  });
});

describe('sliceWords', () => {
  it("returns the words a slice keeps, the line's own slice by default", () => {
    expect(sliceWords(twoAyahs).map((w) => w.wordId)).toEqual([17, 18, 19, 20]);
    expect(sliceWords({...twoAyahs, slice: {ayah: 4}}).map((w) => w.wordId)).toEqual([19, 20]);
    expect(sliceWords({...twoAyahs, slice: {ayah: 4}}, null).map((w) => w.wordId)).toEqual([17, 18, 19, 20]);
    expect(sliceWords(twoAyahs, {ayah: 3}).map((w) => w.wordId)).toEqual([17, 18]);
    expect(sliceWords(twoAyahs, {ayah: 9})).toEqual([]);
    expect(() => sliceWords(twoAyahs, {ayah: 0})).toThrow(/sliceWords\(\): slice\.ayah must be a positive integer/);
  });
});

describe('assertSlice', () => {
  it('accepts the two shapes and returns the value as given', () => {
    const one = {ayah: 5};
    const range = {fromAyah: 5, toAyah: 7};
    expect(assertSlice('slice', one)).toBe(one);
    expect(assertSlice('slice', range)).toBe(range);
    expect(assertSlice('slice', {fromAyah: 5})).toEqual({fromAyah: 5});
  });

  it('refuses anything else, naming the source', () => {
    const bad = (value: unknown) => () => assertSlice('<MushafLine slice>', value);
    expect(bad({})).toThrow(/<MushafLine slice> needs ayah or fromAyah/);
    expect(bad({ayah: 0})).toThrow(/slice>\.ayah must be a positive integer, got 0/);
    expect(bad({ayah: 1.5})).toThrow(/must be a positive integer, got 1\.5/);
    expect(bad({fromAyah: 7, toAyah: 3})).toThrow(/toAyah \(3\) is before fromAyah \(7\)/);
    expect(bad({ayah: 5, fromAyah: 2})).toThrow(/takes either ayah or fromAyah\/toAyah, not both/);
    expect(bad({ayah: 5, toAyah: 6})).toThrow(/not both/);
    expect(bad({aya: 5})).toThrow(/has the unknown key "aya"/);
    expect(bad({fromAyah: 1, toAyah: '3'})).toThrow(/toAyah must be a positive integer when given, got "3"/);
    for (const value of ['5', 5, null, [5], undefined]) expect(bad(value)).toThrow(/must be an object/);
    expect(bad({ayah: 0})).toThrow(/Pass \{ayah\} for one ayah, or \{fromAyah, toAyah\?\} for a range/);
  });
});

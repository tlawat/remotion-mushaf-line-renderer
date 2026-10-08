import {describe, expect, it} from 'vitest';
import {assertSlice, isInSlice, resolveSlice, sliceWords} from '../../src/resolve/slice';
import {syntheticLine} from '../fixtures/synthetic-lines';

// Synthetic page 3: line 1 carries the end of 2:2 and the start of 2:3 — with the rub-el-hizb
// marker sharing its `id` (2:3:1) with the word it precedes; line 2 carries the end of 2:3 and
// the whole of 2:4. wordIds are the compiled reading-order indices: 13-16 on line 1, 17-20 on line 2.
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

  it('keeps a band of wordIds as given: inside the line, the whole line, outside it, open-ended', () => {
    // Inside the line: exactly the words named, across an ayah boundary and without the rosette.
    expect(resolveSlice(twoAyahs, {fromWordId: 18, toWordId: 19})).toEqual({first: 18, last: 19});
    expect(resolveSlice(twoAyahs, {fromWordId: 17, toWordId: 17})).toEqual({first: 17, last: 17});
    // The whole line, exactly or with room to spare: no slice in effect.
    expect(resolveSlice(twoAyahs, {fromWordId: 17, toWordId: 20})).toBeNull();
    expect(resolveSlice(twoAyahs, {fromWordId: 1, toWordId: 99})).toBeNull();
    // Outside the line, either side: keeps nothing.
    expect(resolveSlice(twoAyahs, {fromWordId: 1, toWordId: 16})).toBe('empty');
    expect(resolveSlice(twoAyahs, {fromWordId: 21, toWordId: 30})).toBe('empty');
    // Open-ended: everything from the word on, on this line or from an earlier one.
    expect(resolveSlice(twoAyahs, {fromWordId: 19})).toEqual({first: 19, last: 20});
    expect(resolveSlice(twoAyahs, {fromWordId: 3})).toBeNull();
    expect(resolveSlice(twoAyahs, {fromWordId: 21})).toBe('empty');
    // A band overlapping one end is clipped to the line.
    expect(resolveSlice(twoAyahs, {fromWordId: 10, toWordId: 18})).toEqual({first: 17, last: 18});
    // A wordless line has nothing to slice.
    expect(resolveSlice(header, {fromWordId: 1})).toBeNull();
  });

  it('splits a line at a word into two bands that keep every word once', () => {
    const before = resolveSlice(withMarker, {fromWordId: withMarker.words[0]!.wordId, toWordId: 15 - 1});
    const after = resolveSlice(withMarker, {fromWordId: 15});
    expect(before).toEqual({first: 13, last: 14});
    expect(after).toEqual({first: 15, last: 16});
    // By wordId, a marker sharing its location with the next word can be cut from it.
    expect(resolveSlice(withMarker, {fromWordId: 16})).toEqual({first: 16, last: 16});
    expect(resolveSlice(withMarker, {fromWordId: 13, toWordId: 15})).toEqual({first: 13, last: 15});
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

  it('takes a band of words, on the call or on the line', () => {
    expect(sliceWords(twoAyahs, {fromWordId: 18, toWordId: 19}).map((w) => w.wordId)).toEqual([18, 19]);
    expect(sliceWords(twoAyahs, {fromWordId: 19}).map((w) => w.wordId)).toEqual([19, 20]);
    expect(sliceWords(twoAyahs, {fromWordId: 1, toWordId: 99})).toBe(twoAyahs.words);
    expect(sliceWords(twoAyahs, {fromWordId: 21})).toEqual([]);
    expect(sliceWords({...twoAyahs, slice: {fromWordId: 17, toWordId: 18}}).map((w) => w.wordId)).toEqual([17, 18]);
    expect(sliceWords({...twoAyahs, slice: {fromWordId: 17, toWordId: 18}}, null)).toBe(twoAyahs.words);
    expect(() => sliceWords(twoAyahs, {fromWordId: 0})).toThrow(
      /sliceWords\(\): slice\.fromWordId must be a positive integer, got 0/,
    );
  });
});

describe('assertSlice', () => {
  it('accepts the three shapes and returns the value as given', () => {
    const one = {ayah: 5};
    const range = {fromAyah: 5, toAyah: 7};
    const band = {fromWordId: 12, toWordId: 14};
    expect(assertSlice('slice', one)).toBe(one);
    expect(assertSlice('slice', range)).toBe(range);
    expect(assertSlice('slice', {fromAyah: 5})).toEqual({fromAyah: 5});
    expect(assertSlice('slice', band)).toBe(band);
    expect(assertSlice('slice', {fromWordId: 12})).toEqual({fromWordId: 12});
    // One word is a band of one.
    expect(assertSlice('slice', {fromWordId: 12, toWordId: 12})).toEqual({fromWordId: 12, toWordId: 12});
  });

  it('refuses anything else, naming the source', () => {
    const bad = (value: unknown) => () => assertSlice('<MushafLine slice>', value);
    expect(bad({})).toThrow(/<MushafLine slice> needs ayah, fromAyah or fromWordId/);
    expect(bad({ayah: 0})).toThrow(/slice>\.ayah must be a positive integer, got 0/);
    expect(bad({ayah: 1.5})).toThrow(/must be a positive integer, got 1\.5/);
    expect(bad({fromAyah: 7, toAyah: 3})).toThrow(/toAyah \(3\) is before fromAyah \(7\)/);
    expect(bad({ayah: 5, fromAyah: 2})).toThrow(/takes either ayah or fromAyah\/toAyah, not both/);
    expect(bad({ayah: 5, toAyah: 6})).toThrow(/not both/);
    expect(bad({aya: 5})).toThrow(/has the unknown key "aya"/);
    expect(bad({fromAyah: 1, toAyah: '3'})).toThrow(/toAyah must be a positive integer when given, got "3"/);
    for (const value of ['5', 5, null, [5], undefined]) expect(bad(value)).toThrow(/must be an object/);
    expect(bad({ayah: 0})).toThrow(
      /Pass \{ayah\} for one ayah, \{fromAyah, toAyah\?\} for a range of ayahs, or \{fromWordId, toWordId\?\} for a band of words\./,
    );
  });

  it('refuses a malformed band of words with the field and the value', () => {
    const bad = (value: unknown) => () => assertSlice('<MushafLine slice>', value);
    expect(bad({fromWordId: 0})).toThrow(/<MushafLine slice>\.fromWordId must be a positive integer, got 0/);
    expect(bad({fromWordId: -3})).toThrow(/\.fromWordId must be a positive integer, got -3/);
    expect(bad({fromWordId: 2.5})).toThrow(/\.fromWordId must be a positive integer, got 2\.5/);
    expect(bad({fromWordId: '12'})).toThrow(/\.fromWordId must be a positive integer, got "12"/);
    expect(bad({fromWordId: Number.NaN})).toThrow(/\.fromWordId must be a positive integer/);
    expect(bad({fromWordId: 3, toWordId: 0})).toThrow(/\.toWordId must be a positive integer when given, got 0/);
    expect(bad({fromWordId: 3, toWordId: -1})).toThrow(/\.toWordId must be a positive integer when given, got -1/);
    expect(bad({fromWordId: 3, toWordId: 4.5})).toThrow(/\.toWordId must be a positive integer when given, got 4\.5/);
    expect(bad({fromWordId: 7, toWordId: 3})).toThrow(/\.toWordId \(3\) is before fromWordId \(7\)/);
    // A band starts somewhere.
    expect(bad({toWordId: 7})).toThrow(/<MushafLine slice> has toWordId but no fromWordId/);
    // Ayahs or words, never both, whichever keys are mixed.
    for (const mixed of [
      {ayah: 1, fromWordId: 3},
      {fromAyah: 1, fromWordId: 3},
      {fromAyah: 1, toWordId: 3},
      {toAyah: 2, fromWordId: 3, toWordId: 4},
    ])
      expect(bad(mixed)).toThrow(
        /<MushafLine slice> takes either ayahs \(ayah, fromAyah\/toAyah\) or words \(fromWordId\/toWordId\), not both/,
      );
    expect(bad({fromWordID: 3})).toThrow(/has the unknown key "fromWordID"/);
    for (const value of [{fromWordId: 0}, {fromAyah: 1, toWordId: 3}])
      expect(bad(value)).toThrow(
        expect.objectContaining({code: 'BAD_SLICE', details: {source: '<MushafLine slice>', slice: value}}),
      );
  });
});

// splitLineAt / applySplits / wordIdAt on the synthetic mushaf. Surah 2, in reading order:
//   p2l3: 6 2:1:1, 7 2:1:2, 8 2:1:3, 9 2:1:4 (end)
//   p2l4: 10 2:2:1, 11 2:2:2, 12 2:2:3
//   p3l1: 13 2:2:4, 14 2:2:5 (end), 15 2:3:1 (rub-el-hizb), 16 2:3:1
//   p3l2: 17 2:3:2, 18 2:3:3 (end), 19 2:4:1, 20 2:4:2 (end)
import {sliceWords} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {syntheticLine} from '../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import {isMushafStudioError} from '../../../src/errors';
import {applySplits, splitLineAt, wordIdAt} from '../../../src/lines';

const p2l3 = syntheticLine(2, 3);
const p2l4 = syntheticLine(2, 4);
const p3l1 = syntheticLine(3, 1);
const p3l2 = syntheticLine(3, 2);
const header = syntheticLine(2, 1);
const passage = [p2l3, p2l4, p3l1, p3l2];
const ids = (line: Parameters<typeof sliceWords>[0]) => sliceWords(line).map((w) => w.wordId);

const failure = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as Error & {code: string};
  }
  throw new Error('expected a throw');
};

describe('splitLineAt', () => {
  it('cuts a line into two closed word bands that keep everything else', () => {
    const [first, second] = splitLineAt(p2l3, 8);
    expect(first.slice).toEqual({fromWordId: 6, toWordId: 7});
    expect(second.slice).toEqual({fromWordId: 8, toWordId: 9});
    expect(ids(first)).toEqual([6, 7]);
    expect(ids(second)).toEqual([8, 9]);
    // The printed line is still all there for the layout; only the slice differs.
    for (const half of [first, second]) {
      expect(half.words).toBe(p2l3.words);
      expect({...half, slice: undefined}).toEqual({...p2l3, slice: undefined});
    }
    expect(p2l3.slice).toBeUndefined();
  });

  it('intersects with the slice the line already carries', () => {
    const sliced = syntheticLine(3, 1, {slice: {ayah: 2}}); // keeps 13, 14
    const [first, second] = splitLineAt(sliced, 14);
    expect(first.slice).toEqual({fromWordId: 13, toWordId: 13});
    expect(second.slice).toEqual({fromWordId: 14, toWordId: 14});
    // A band on a band: the half inherits the cut at the end.
    const tail = syntheticLine(3, 2, {slice: {fromWordId: 18, toWordId: 19}});
    expect(splitLineAt(tail, 19).map((half) => half.slice)).toEqual([
      {fromWordId: 18, toWordId: 18},
      {fromWordId: 19, toWordId: 19},
    ]);
  });

  it('refuses a word the slice hides, the first word, a word off the line, a header', () => {
    const hidden = failure(() => splitLineAt(syntheticLine(3, 1, {slice: {ayah: 2}}), 15));
    expect(isMushafStudioError(hidden)).toBe(true);
    expect(hidden.code).toBe('BAD_LINE_SPLIT');
    expect(hidden.message).toContain('page 3 line 1');
    expect(hidden.message).toContain('slice');
    expect(hidden.message).toContain('words 13-14');

    const first = failure(() => splitLineAt(p2l3, 6));
    expect(first.code).toBe('BAD_LINE_SPLIT');
    expect(first.message).toContain('first word');
    expect(first.message).toContain('split at 7');

    const off = failure(() => splitLineAt(p2l3, 99));
    expect(off.code).toBe('BAD_LINE_SPLIT');
    expect(off.message).toContain('words 6-9');

    const none = failure(() => splitLineAt(header, 6));
    expect(none.code).toBe('BAD_LINE_SPLIT');
    expect(none.message).toContain('surah_name');
    expect(none.message).toContain('no words');
  });
});

describe('applySplits', () => {
  it('returns the passage itself without splits', () => {
    expect(applySplits(passage, [])).toBe(passage);
  });

  it('replaces a named line by its halves and leaves the others as they are', () => {
    const out = applySplits(passage, [{page: 2, line: 3, atWordId: 8}]);
    expect(out).toHaveLength(5);
    expect(out[0]!.slice).toEqual({fromWordId: 6, toWordId: 7});
    expect(out[1]!.slice).toEqual({fromWordId: 8, toWordId: 9});
    expect(out.slice(2)).toEqual([p2l4, p3l1, p3l2]);
    expect(out[2]).toBe(p2l4);
  });

  it('applies several splits on one line in word order, duplicates ignored', () => {
    const out = applySplits(passage, [
      {page: 3, line: 2, atWordId: 19},
      {page: 3, line: 2, atWordId: 18},
      {page: 3, line: 2, atWordId: 19},
    ]);
    expect(out.map((line) => `${line.page}/${line.line}`)).toEqual(['2/3', '2/4', '3/1', '3/2', '3/2', '3/2']);
    expect(out.slice(3).map((line) => line.slice)).toEqual([
      {fromWordId: 17, toWordId: 17},
      {fromWordId: 18, toWordId: 18},
      {fromWordId: 19, toWordId: 20},
    ]);
  });

  it('refuses a split that names a line outside the passage', () => {
    const error = failure(() => applySplits(passage, [{page: 1, line: 2, atWordId: 2}]));
    expect(error.code).toBe('BAD_LINE_SPLIT');
    expect(error.message).toContain('page 1 line 2');
    expect(error.message).toContain('page 2 line 3, page 2 line 4, page 3 line 1, page 3 line 2');
    expect(failure(() => applySplits([], [{page: 2, line: 3, atWordId: 8}])).message).toContain('none');
  });

  it('propagates a bad word on a named line', () => {
    expect(failure(() => applySplits(passage, [{page: 2, line: 3, atWordId: 6}])).code).toBe('BAD_LINE_SPLIT');
  });
});

describe('wordIdAt', () => {
  it('names the first word at a location in reading order, so a marker goes with its word', () => {
    expect(wordIdAt(p3l1, 2, 2, 4)).toBe(13);
    expect(wordIdAt(p3l1, 2, 3, 1)).toBe(15);
    expect(wordIdAt(p3l1, 2, 3, 2)).toBeNull();
    expect(wordIdAt(p3l1, 3, 3, 1)).toBeNull();
    expect(wordIdAt(header, 2, 1, 1)).toBeNull();
  });
});

// The arithmetic of the interlinear glosses: sizes, the room a line needs, where each label goes.
import {describe, expect, it} from 'vitest';
import {
  fitLabelSize,
  INTERLINEAR_MIN_FIT,
  interlinearExtraHeight,
  interlinearFontSize,
  interlinearLineShift,
  interlinearRowHeight,
  interlinearRows,
  interlinearTop,
  placeLabels,
  type WordBox,
} from '../../../src/interlinear';

const word = (id: string, left: number, width: number, changes: Partial<WordBox> = {}): WordBox => ({
  id,
  kind: 'word',
  hidden: false,
  left,
  width,
  ...changes,
});

describe('sizes and room', () => {
  it('caps the label size at 0.3 of the line type size, never under 8 px', () => {
    expect(interlinearFontSize(34, 98)).toBe(29);
    expect(interlinearFontSize(20, 98)).toBe(20);
    expect(interlinearFontSize(34, 10)).toBe(8);
  });

  it('grows a line by its label rows only, to an even number of px', () => {
    expect(interlinearRows(null, null)).toBe(0);
    expect(interlinearRows({}, null)).toBe(1);
    expect(interlinearRows({}, {})).toBe(2);
    expect(interlinearExtraHeight(0, 29)).toBe(0);
    const one = interlinearExtraHeight(1, 29);
    const two = interlinearExtraHeight(2, 29);
    expect(one % 2).toBe(0);
    expect(one).toBeGreaterThanOrEqual(interlinearRowHeight(29));
    expect(two - one).toBeGreaterThanOrEqual(interlinearRowHeight(29) - 1);
  });

  it('moves the line up by half the extra and puts the labels under the glyph box', () => {
    expect(interlinearLineShift(0)).toBeUndefined();
    expect(interlinearLineShift(80)).toEqual({transform: 'translateY(-40px)'});
    // A 216 px line grown by 80: glyphs centred in 296 sit at 40-256; the labels start at 256.
    expect(interlinearTop(296, 80)).toBe(256);
  });
});

describe('placeLabels', () => {
  it('centres each label under its word, as wide as the word and half the gap to each neighbour', () => {
    // Visual order left to right (reading order is right to left): marker, word 2, word 1.
    const boxes = [word('1:2:1', 400, 200), word('1:2:2', 220, 160), word('1:2:5', 120, 80, {kind: 'end'})];
    expect(placeLabels(boxes, 600)).toEqual([
      {id: '1:2:2', left: 210, width: 180},
      // No neighbour on the right: the row's edge bounds it, the nearer side sets the width.
      {id: '1:2:1', left: 400, width: 200},
    ]);
  });

  it('gives no label to a word a slice hides, a marker or an empty box, and skips them as neighbours', () => {
    const boxes = [
      word('1:2:1', 300, 100),
      word('1:2:2', 0, 0, {hidden: true}),
      word('1:2:3', 0, 0),
      word('1:2:4', 200, 80),
    ];
    const placed = placeLabels(boxes, 600);
    expect(placed.map((p) => p.id)).toEqual(['1:2:4', '1:2:1']);
    expect(placed[0]).toEqual({id: '1:2:4', left: 190, width: 100});
  });

  it('is empty for no words, and one word alone may use the row', () => {
    expect(placeLabels([], 600)).toEqual([]);
    expect(placeLabels([word('1:1:1', 250, 100)], 600)).toEqual([{id: '1:1:1', left: 0, width: 600}]);
  });
});

describe('fitLabelSize', () => {
  it('keeps the size when the text fits or was not measured', () => {
    expect(fitLabelSize(100, 120, 30)).toBe(30);
    expect(fitLabelSize(0, 120, 30)).toBe(30);
  });

  it('shrinks in proportion, never under the minimum share (the ellipsis cuts the rest)', () => {
    expect(fitLabelSize(150, 120, 30)).toBe(24);
    expect(fitLabelSize(1000, 120, 30)).toBe(30 * INTERLINEAR_MIN_FIT);
  });
});

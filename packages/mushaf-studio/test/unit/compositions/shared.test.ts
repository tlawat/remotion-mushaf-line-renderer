// The helpers both compositions share: URLs, the ayah keys, the slots' lead frames and the blocks' geometry.
import {scrollPosition} from '@tlawat/remotion-mushaf-line';
import {describe, expect, it} from 'vitest';
import {syntheticLine} from '../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';
import {
  ayahAt,
  blockGeometry,
  fileUrl,
  firstAyahKey,
  glossBlockStyle,
  leadFrames,
  linesBlockStyle,
  STUDIO_FPS,
  translationBlockStyle,
} from '../../../src/compositions/shared';
import {defaultLayout, defaultText} from '../../../src/schema';
import type {StudioTimings} from '../../../src/types';
import fatiha from '../../fixtures/timings/fatiha.json';

const timings = fatiha as unknown as StudioTimings;
const staticFile = (path: string) => `/static/${path}`;

describe('fileUrl / firstAyahKey', () => {
  it('serves a public path through staticFile() and a URL as it is', () => {
    expect(fileUrl('a/b.json', staticFile)).toBe('/static/a/b.json');
    expect(fileUrl('https://example.test/b.json', staticFile)).toBe('https://example.test/b.json');
    expect(fileUrl('HTTP://example.test/b.json', staticFile)).toBe('HTTP://example.test/b.json');
  });

  it('names the ayah a line starts with, after its slice', () => {
    // p1l3 of the synthetic mushaf: 1:2:1, 1:2:2 (end).
    expect(firstAyahKey(syntheticLine(1, 3))).toBe('1:2');
    expect(firstAyahKey({...syntheticLine(1, 2), slice: {ayah: 2}})).toBeNull();
    expect(firstAyahKey(undefined)).toBeNull();
  });
});

describe('ayahAt', () => {
  it('is the last ayah started, null before the first, and holds through a pause', () => {
    expect(ayahAt(timings, 0)).toBeNull();
    expect(ayahAt(timings, 0.331)).toBe('1:2');
    expect(ayahAt(timings, 3.4)).toBe('1:2'); // ayah 2 ended at 3.391, ayah 3 starts at 3.533
    expect(ayahAt(timings, 3.533)).toBe('1:3');
    expect(ayahAt(timings, 100)).toBe('1:7');
    expect(ayahAt({version: 1, surah: 1, ayat: [{ayah: 1, start: 2, end: 3}]}, 1)).toBeNull();
  });
});

describe('leadFrames', () => {
  const schedule = [
    {index: 0, start: 0.331, end: 3.533},
    {index: 1, start: 3.533, end: 6.145},
    {index: 2, start: 6.145, end: 8.729},
  ];

  it('puts each slot in place leadInSeconds before its first word, in frames', () => {
    expect(leadFrames(schedule, 0.4, 30)).toEqual([-2, 94, 172]);
    expect(leadFrames(schedule, 0, 30)).toEqual([10, 106, 184]);
    expect(leadFrames([], 0.4, 30)).toEqual([]);
  });

  it("never decreases: a slot starting after the next one takes the next one's frame", () => {
    const reordered = [
      {index: 0, start: 4.0, end: 4.0},
      {index: 1, start: 3.533, end: 6.145},
      {index: 2, start: 6.145, end: 8.729},
    ];
    const raw = reordered.map((slot) => Math.round((slot.start - 0.4) * 30));
    expect(() => scrollPosition({frame: 0, fps: 30, steps: raw})).toThrow(/never decrease/);
    const steps = leadFrames(reordered, 0.4, 30);
    expect(steps).toEqual([108, 108, 172]);
    expect(() => scrollPosition({frame: 0, fps: 30, steps})).not.toThrow();
  });
});

describe('blockGeometry and the block styles', () => {
  const size = {width: 1920, height: 1080};

  it('sets the lines between the margins, verticalAlign of the room left, visibleLines tall (one when replaced in place)', () => {
    const g = blockGeometry(defaultLayout, size);
    expect(g.measure).toBe(1680);
    expect(g.slots).toBe(3);
    expect(g.blockHeight).toBe(3 * g.lineHeight);
    expect(g.top).toBe(Math.round((1080 - g.blockHeight) / 2));
    expect(blockGeometry({...defaultLayout, visibleLines: 0}, size).slots).toBe(1);
    expect(blockGeometry({...defaultLayout, verticalAlign: 0}, size).top).toBe(0);
    expect(blockGeometry({...defaultLayout, verticalAlign: 1}, size).top).toBe(1080 - g.blockHeight);
    expect(blockGeometry({...defaultLayout, marginX: 0}, size).measure).toBe(1920);
    // A narrower measure sets a smaller type.
    expect(blockGeometry({...defaultLayout, marginX: 300}, size).fontSize).toBeLessThan(g.fontSize);
  });

  it('places the blocks as absolute boxes of the measure, moved by the offsets only when set', () => {
    const g = blockGeometry(defaultLayout, size);
    expect(linesBlockStyle(g, defaultLayout)).toEqual({
      position: 'absolute',
      top: g.top,
      left: 120,
      width: 1680,
      height: g.blockHeight,
    });
    expect(linesBlockStyle(g, {...defaultLayout, offsetY: -50}).transform).toBe('translateY(-50px)');
    const below = translationBlockStyle(g, defaultLayout, defaultText, 1080);
    expect(below).toEqual({position: 'absolute', left: 120, width: 1680, top: g.top + g.blockHeight + 24});
    const above = translationBlockStyle(g, defaultLayout, {...defaultText, translationPosition: 'above'}, 1080);
    expect(above).toEqual({position: 'absolute', left: 120, width: 1680, bottom: 1080 - g.top + 24});
    expect(translationBlockStyle(g, defaultLayout, {...defaultText, translationOffsetY: 30}, 1080).transform).toBe(
      'translateY(30px)',
    );
    expect(glossBlockStyle(g, defaultLayout, defaultText)).toEqual({
      position: 'absolute',
      left: 120,
      width: 1680,
      bottom: 34,
    });
  });

  it('counts frames at 30 fps', () => {
    expect(STUDIO_FPS).toBe(30);
  });
});

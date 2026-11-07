// The colour guards of the render design (render-design.md, 3.1): the tint read at 5:1 on its
// ground, the wash's faint strength, the light-or-dark test, the fallback ink, and the metal.
import {describe, expect, it} from 'vitest';
import {
  capChroma,
  contrast,
  defaultCustomTheme,
  GROUNDS,
  groundOf,
  isLightGround,
  legibleAccent,
  METAL,
  metalOf,
  mixColors,
  parseColor,
  readableInk,
  relativeLuminance,
  toOklch,
  washAlpha,
  washColor,
} from '../../../src/schema';

/** Each channel within `tolerance` of the expected hex. */
const near = (actual: string, expected: string, tolerance = 1): boolean => {
  const a = parseColor(actual)!;
  const b = parseColor(expected)!;
  return Math.abs(a.r - b.r) <= tolerance && Math.abs(a.g - b.g) <= tolerance && Math.abs(a.b - b.b) <= tolerance;
};

const IVORY = '#f8f3e6';
const PAPER = '#fbf7ee';
const CHARCOAL = '#121416';
const GREEN = '#10241b';

describe('legibleAccent', () => {
  // The table of render-design.md 3.1.2, ±1 per channel.
  it.each([
    ['#b8913a', IVORY, '#806321'],
    ['#b8913a', PAPER, '#836625'],
    ['#b8913a', CHARCOAL, '#b19353'],
    ['#b8913a', GREEN, '#b19353'],
    ['#c8a45c', IVORY, '#816321'],
    ['#ffd166', IVORY, '#7d621f'],
    ['#d8b56a', CHARCOAL, '#d4b675'],
    ['#cfae63', GREEN, '#ccaf6e'],
    ['#1f7a8c', IVORY, '#107183'],
  ])('draws %s on %s as %s', (color, ground, expected) => {
    const drawn = legibleAccent(color, ground);
    expect([drawn, near(drawn, expected)]).toEqual([drawn, true]);
    expect(contrast(drawn, ground)).toBeGreaterThanOrEqual(5);
  });

  it('reads the contrasts the design names', () => {
    expect(contrast(legibleAccent('#b8913a', IVORY), IVORY)).toBeCloseTo(5.1, 1);
    expect(contrast(legibleAccent('#b8913a', CHARCOAL), CHARCOAL)).toBeCloseTo(6.3, 1);
    expect(contrast(legibleAccent('#d8b56a', CHARCOAL), CHARCOAL)).toBeCloseTo(9.45, 1);
    expect(contrast(legibleAccent('#cfae63', GREEN), GREEN)).toBeCloseTo(7.7, 1);
  });

  it('caps the chroma, so a neon becomes antique gold, and keeps the hue', () => {
    const neon = toOklch(legibleAccent('#ffd166', IVORY))!;
    expect(neon.c).toBeLessThanOrEqual(0.0905);
    expect(neon.h).toBeCloseTo(toOklch('#ffd166')!.h, 0);
    // A colour already quiet and legible is only rounded through OKLCH.
    expect(near(legibleAccent('#5a4a20', IVORY), '#5a4a20')).toBe(true);
  });

  it('stops at black or white when no lightness reaches 5:1, and leaves an unreadable colour alone', () => {
    // On mid grey neither direction reaches 5:1 before L runs out.
    expect(legibleAccent('#b8913a', '#777777')).toMatch(/^#[0-9a-f]{6}$/);
    expect(legibleAccent('var(--accent)', IVORY)).toBe('var(--accent)');
    expect(legibleAccent('#b8913a', 'not a colour')).toBe('#b8913a');
  });
});

describe('relativeLuminance / contrast / isLightGround', () => {
  it('measures the grounds and inks of the design', () => {
    expect(relativeLuminance(IVORY)).toBeCloseTo(0.9, 2);
    expect(relativeLuminance(CHARCOAL)).toBeCloseTo(0.007, 3);
    expect(contrast('#1c1a16', IVORY)).toBeCloseTo(15.7, 1);
    expect(contrast('#5a554c', IVORY)).toBeCloseTo(6.7, 1);
    expect(contrast('#f1eadb', CHARCOAL)).toBeCloseTo(15.4, 1);
    expect(contrast('#6b6458', IVORY)).toBeCloseTo(5.3, 1);
    // Symmetric, and 1 for a colour against itself.
    expect(contrast(IVORY, '#1c1a16')).toBe(contrast('#1c1a16', IVORY));
    expect(contrast(IVORY, IVORY)).toBe(1);
  });

  it('tells a light ground from a dark one at luminance 0.35', () => {
    for (const ground of [IVORY, PAPER]) expect(isLightGround(ground)).toBe(true);
    for (const ground of [CHARCOAL, GREEN, '#000000']) expect(isLightGround(ground)).toBe(false);
    // The boundary: a grey of luminance 0.352 is light, one of 0.332 is dark.
    expect(isLightGround('#a0a0a0')).toBe(true);
    expect(isLightGround('#9c9c9c')).toBe(false);
  });

  it('reads every form zColor() gives, and nothing else', () => {
    expect(parseColor('#abc')).toEqual({r: 170, g: 187, b: 204, a: 1});
    expect(parseColor('#c8a45c80')).toEqual({r: 200, g: 164, b: 92, a: 128 / 255});
    expect(parseColor('rgba(200,164,92,0.18)')).toEqual({r: 200, g: 164, b: 92, a: 0.18});
    expect(parseColor('rgb(27 111 63 / 50%)')).toEqual({r: 27, g: 111, b: 63, a: 0.5});
    expect(parseColor('crimson')).toEqual({r: 220, g: 20, b: 60, a: 1});
    expect(parseColor('transparent')?.a).toBe(0);
    expect(parseColor('color-mix(in srgb, red, blue)')).toBeNull();
  });
});

describe('washAlpha / washColor', () => {
  it('is 0.10 on a light ground and 0.13 on a dark one, never set by the user', () => {
    expect(washAlpha(IVORY)).toBe(0.1);
    expect(washAlpha(PAPER)).toBe(0.1);
    expect(washAlpha(CHARCOAL)).toBe(0.13);
    expect(washAlpha(GREEN)).toBe(0.13);
  });

  it('caps the chroma only, ignores the colour’s own alpha, and never paints above 0.16', () => {
    expect(washColor('#b8913a', 0.1)).toBe('rgba(177, 147, 83, 0.1)');
    // The old page band: its 0.18 is ignored, the strength is the wash's.
    expect(washColor('rgba(200,164,92,0.18)', 0.1)).toBe(washColor('#c8a45c', 0.1));
    expect(washColor('#b8913a', 0.5)).toBe('rgba(177, 147, 83, 0.16)');
    expect(washColor('#b8913a', -1)).toBe('rgba(177, 147, 83, 0)');
    // Lightness kept: the capped colour is as light as the colour was.
    expect(toOklch(capChroma('#ffd166'))!.l).toBeCloseTo(toOklch('#ffd166')!.l, 2);
  });
});

describe('readableInk / mixColors', () => {
  it('keeps a colour that reads at 4.5:1 and otherwise mixes the ink a third into the ground', () => {
    expect(readableInk('#5a554c', '#1c1a16', IVORY)).toBe('#5a554c');
    const fallback = readableInk('#c9c1b2', '#1c1a16', IVORY);
    expect(fallback).toBe(mixColors('#1c1a16', IVORY, 0.32));
    expect(contrast(fallback, IVORY)).toBeGreaterThanOrEqual(4.5);
    expect(readableInk('#b9b1a2', '#f1eadb', CHARCOAL)).toBe('#b9b1a2');
  });

  it('mixes in sRGB, 0 the first colour and 1 the second', () => {
    expect(mixColors('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixColors('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('nope', '#ffffff', 0.5)).toBe('nope');
  });
});

describe('groundOf / metalOf / GROUNDS', () => {
  it('is the page colour, or a stand-in from the ink under an image, a video or a see-through page', () => {
    expect(groundOf({background: IVORY, color: '#1c1a16'})).toBe(IVORY);
    expect(groundOf({background: IVORY, color: '#1c1a16'}, 'gradient')).toBe(IVORY);
    expect(groundOf({background: IVORY, color: '#f1eadb'}, 'image')).toBe(CHARCOAL);
    expect(groundOf({background: IVORY, color: '#1c1a16'}, 'video')).toBe(IVORY);
    expect(groundOf({background: 'transparent', color: '#f4efe6'})).toBe(CHARCOAL);
    expect(groundOf({background: 'transparent', color: '#1c1a16'})).toBe(IVORY);
  });

  it('is gold by the ground, or a custom theme’s own frame colour', () => {
    expect(metalOf({theme: 'plain', ground: IVORY})).toBe(METAL.light);
    expect(metalOf({theme: 'light', ground: CHARCOAL})).toBe(METAL.dark);
    expect(metalOf({theme: 'custom', customTheme: defaultCustomTheme, ground: IVORY})).toBe('#8c6c26');
    const noFrame = {...defaultCustomTheme, override: {...defaultCustomTheme.override, frame: false}};
    expect(metalOf({theme: 'custom', customTheme: noFrame, ground: CHARCOAL})).toBe(METAL.dark);
  });

  it('pairs every ground with inks that read: 13:1 ink, 6.5:1 translation, 5:1 gloss', () => {
    for (const [name, tokens] of Object.entries(GROUNDS)) {
      expect([name, contrast(tokens.ink, tokens.ground) >= 13]).toEqual([name, true]);
      expect([name, contrast(tokens.secondary, tokens.ground) >= 6.5]).toEqual([name, true]);
      expect([name, contrast(tokens.gloss, tokens.ground) >= 5]).toEqual([name, true]);
      expect([name, tokens.ground]).not.toEqual([name, '#ffffff']);
    }
  });
});

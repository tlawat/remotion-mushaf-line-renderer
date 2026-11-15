// The `overlay` and `header` fragments: their defaults, their bounds, a description on every field
// (the Props sidebar shows it), and the three compositions carrying them.
import {describe, expect, it} from 'vitest';
import {defaultMushafPassageProps, mushafPassageSchema} from '../../../src/compositions/passage';
import {defaultMushafRecitationProps, mushafRecitationSchema} from '../../../src/compositions/recitation';
import {defaultOverlay, headerSchema, OVERLAY_CORNERS, OVERLAY_TITLES, overlaySchema} from '../../../src/schema';
import {defaultMushafAyahTextProps, mushafAyahTextSchema} from '../../../src/unicode';

describe('overlaySchema', () => {
  it('defaults to no title, a three-second card in the muted ink, the label top right at the frame’s size', () => {
    expect(defaultOverlay).toEqual({
      title: 'none',
      introSeconds: 3,
      reciter: '',
      color: '#5a554c',
      font: 'auto',
      corner: 'top-right',
      cornerSize: 0,
    });
    expect(overlaySchema.parse(defaultOverlay)).toEqual(defaultOverlay);
    expect(OVERLAY_TITLES).toEqual(['none', 'intro', 'corner', 'both']);
    expect(OVERLAY_CORNERS).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
  });

  it('describes every field', () => {
    for (const [key, field] of Object.entries(overlaySchema.shape)) {
      expect(field.description, key).toMatch(/\w/);
    }
    // The card adds its time; the corner label's size follows the frame at 0.
    expect(overlaySchema.shape.introSeconds.description).toMatch(/recitation starts after it/);
    expect(overlaySchema.shape.cornerSize.description).toMatch(/0: auto/);
    expect(headerSchema.description).toMatch(/ayah 1/);
  });

  it('bounds introSeconds to 2-6 and cornerSize to 0 (auto) to 60', () => {
    const at = (changes: object) => overlaySchema.safeParse({...defaultOverlay, ...changes}).success;
    expect(at({introSeconds: 2})).toBe(true);
    expect(at({introSeconds: 6})).toBe(true);
    expect(at({introSeconds: 1.5})).toBe(false);
    expect(at({introSeconds: 6.5})).toBe(false);
    expect(at({cornerSize: 0})).toBe(true);
    expect(at({cornerSize: 12})).toBe(true);
    expect(at({cornerSize: 60})).toBe(true);
    expect(at({cornerSize: -1})).toBe(false);
    expect(at({cornerSize: 12.5})).toBe(false);
    expect(at({cornerSize: 61})).toBe(false);
    expect(at({title: 'banner'})).toBe(false);
    expect(at({corner: 'middle'})).toBe(false);
  });
});

describe('the compositions', () => {
  it('carry header (recitation, passage) and overlay (all three), with valid defaults', () => {
    expect(defaultMushafRecitationProps.header).toBe('none');
    expect(defaultMushafPassageProps.header).toBe('none');
    expect(defaultMushafRecitationProps.overlay).toEqual(defaultOverlay);
    expect(defaultMushafPassageProps.overlay).toEqual(defaultOverlay);
    // The ayah text's page is dark: its title ink is the page's light ink.
    expect(defaultMushafAyahTextProps.overlay).toEqual({...defaultOverlay, color: '#f4efe6'});
    expect(mushafRecitationSchema.parse(defaultMushafRecitationProps)).toEqual(defaultMushafRecitationProps);
    expect(mushafPassageSchema.parse(defaultMushafPassageProps)).toEqual(defaultMushafPassageProps);
    expect(mushafAyahTextSchema.parse(defaultMushafAyahTextProps)).toEqual(defaultMushafAyahTextProps);
    expect('header' in mushafAyahTextSchema.shape).toBe(false);
    expect(headerSchema.options).toEqual(['none', 'name', 'name-basmalah']);
  });
});

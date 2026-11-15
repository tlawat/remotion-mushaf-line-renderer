// The five looks and the four formats against the compositions' own schemas: each look, applied to
// the defaults of every composition it is designed for, gives props that schema accepts unchanged
// (no field it does not have, no value out of range); the Mushaf look is the defaults; look and
// format commute; the old look ids map to what replaced them.
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {z} from 'zod';
import {defaultMushafPassageProps, mushafPassageSchema} from '../../../src/compositions/passage/schema';
import {defaultMushafRecitationProps, mushafRecitationSchema} from '../../../src/compositions/recitation/schema';
import {themeHasTajweedColors} from '../../../src/content/tajweed';
import {
  applyFormat,
  applyLook,
  formatPatchFor,
  LEGACY_LOOK_IDS,
  LOOK_GROUPS,
  LOOK_POSITION_FIELDS,
  lookById,
  lookInBox,
  lookMatches,
  lookPatchFor,
  lookRevertPatch,
  looksFor,
  lookUndoPatch,
  MUSHAF_FORMATS,
  MUSHAF_LOOKS,
  type MushafLook,
  type MushafLookKind,
} from '../../../src/presets';
import {themeSelectionFrom} from '../../../src/schema';
import {defaultMushafAyahTextProps, mushafAyahTextSchema} from '../../../src/unicode/schema';

const COMPOSITIONS: Readonly<
  Record<MushafLookKind, {readonly schema: z.ZodTypeAny; readonly defaults: Readonly<Record<string, unknown>>}>
> = {
  recitation: {schema: mushafRecitationSchema, defaults: defaultMushafRecitationProps},
  'ayah-text': {schema: mushafAyahTextSchema, defaults: defaultMushafAyahTextProps},
  passage: {schema: mushafPassageSchema, defaults: defaultMushafPassageProps},
};

const look = (id: string): MushafLook => {
  const found = MUSHAF_LOOKS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no look ${id}`);
  return found;
};

const custom = (patch: MushafLook['patch'], applies: MushafLook['applies'] = ['recitation']): MushafLook => ({
  id: 'x',
  name: 'X',
  nameAr: 'س',
  description: 'x',
  descriptionAr: 'س',
  applies,
  patch,
});

afterEach(() => vi.restoreAllMocks());

describe('MUSHAF_LOOKS', () => {
  it('is the five looks of the design, in order, each named and described in English and Arabic', () => {
    expect(MUSHAF_LOOKS.map((entry) => entry.id)).toEqual([
      'mushaf',
      'haram-night',
      'madinah-green',
      'tajweed',
      'learning',
    ]);
    expect(MUSHAF_LOOKS.map((entry) => entry.nameAr)).toEqual(['مصحف', 'ليل الحرم', 'أخضر المدينة', 'تجويد', 'تعلّم']);
    for (const entry of MUSHAF_LOOKS) {
      expect(entry.name).not.toBe('');
      expect(entry.description).not.toBe('');
      expect(entry.descriptionAr).toMatch(/[؀-ۿ]/);
      expect(entry.applies.length).toBeGreaterThan(0);
    }
  });

  it('gives each look one mark and the loaded fonts, never the frame shape, the lines on screen or the lead-in', () => {
    for (const entry of MUSHAF_LOOKS) {
      const {layout, animation, text, overlay, highlight} = entry.patch;
      expect(layout, entry.id).not.toHaveProperty('aspect');
      expect(layout, entry.id).not.toHaveProperty('visibleLines');
      expect(animation, entry.id).not.toHaveProperty('leadInSeconds');
      expect(animation?.lines, entry.id).toBe('fade');
      expect([text?.translationFont, text?.glossFont, overlay?.font], entry.id).toEqual(['auto', 'auto', 'auto']);
      expect(layout?.backgroundImage, entry.id).toBe('');
      expect(['ink', 'tint', 'wash'], entry.id).toContain(highlight?.style);
      if (entry.patch.theme === 'custom')
        expect(entry.patch.customTheme, entry.id).toMatchObject({
          // Tajweed keeps light's letters and rule colours under its gold-line rosettes.
          base: entry.id === 'tajweed' ? 'light' : 'normal',
          override: {
            ink: false,
            silent: false,
            rules: false,
            frame: true,
            accent: true,
            detail: true,
            background: true,
          },
        });
    }
    expect(look('madinah-green').patch.layout?.frame).toBe('hairline');
    expect(look('tajweed').patch.legend).toEqual({show: true, position: 'bottom-left', names: 'both'});
    expect(look('haram-night').patch.background).toEqual({color: '#121416', vignette: 0.22});
  });

  it('leaves Haram night’s rosette fills clear, so its ayah wash passes behind the rosette', () => {
    expect(look('haram-night').patch.highlight).toMatchObject({mode: 'ayah', style: 'wash'});
    expect(look('haram-night').patch.customTheme).toMatchObject({
      frame: '#d8b56a',
      detail: '#d8b56a',
      accent: 'transparent',
      background: 'transparent',
    });
    // The other dark look marks in ink: its disc is the ground, as the design gives it.
    expect(look('madinah-green').patch.customTheme).toMatchObject({accent: '#163225', background: '#10241b'});
  });

  it('draws the Tajweed look’s rosettes in gold line, keeping every tajweed colour of light', () => {
    const tajweed = look('tajweed');
    expect(tajweed.patch.theme).toBe('custom');
    expect(tajweed.patch.customTheme).toMatchObject({
      base: 'light',
      frame: '#8c6c26',
      detail: '#8c6c26',
      accent: '#efe3c4',
      background: '#fbf7ee',
    });
    const props = applyLook(defaultMushafRecitationProps, tajweed);
    const theme = themeSelectionFrom(props.theme, props.customTheme);
    // Still a tajweed theme: the legend shows and a tint is shown as a wash.
    expect(themeHasTajweedColors(theme)).toBe(true);
    expect(theme).toMatchObject({base: 'light', colors: {frame: '#8c6c26', accent: '#efe3c4'}});
    expect(Object.keys((theme as {colors: object}).colors)).not.toContain('rules');
  });

  it('is the defaults with the Mushaf look: applied to the recitation’s defaults it changes nothing', () => {
    const mushaf = look('mushaf');
    expect(applyLook(defaultMushafRecitationProps, mushaf)).toEqual(defaultMushafRecitationProps);
    expect(lookMatches(defaultMushafRecitationProps, mushaf)).toBe(true);
    expect(applyLook(defaultMushafPassageProps, mushaf)).toEqual(defaultMushafPassageProps);
    // The ayah text starts on its own dark page.
    expect(lookMatches(defaultMushafAyahTextProps, mushaf)).toBe(false);
  });

  it('never moves what the user positioned: no look sets a position field', () => {
    for (const entry of MUSHAF_LOOKS)
      for (const field of LOOK_POSITION_FIELDS) {
        const [group, key] = field.split('.') as [string, string];
        expect((entry.patch as Record<string, Record<string, unknown> | undefined>)[group] ?? {}).not.toHaveProperty(
          key,
        );
      }
    const placed = {
      ...defaultMushafRecitationProps,
      layout: {...defaultMushafRecitationProps.layout, verticalAlign: 0.3, offsetY: 40, marginX: 60},
      text: {...defaultMushafRecitationProps.text, translationOffsetY: 20},
    };
    for (const entry of MUSHAF_LOOKS) {
      const next = applyLook(placed, entry);
      expect([
        next.layout.verticalAlign,
        next.layout.offsetY,
        next.layout.marginX,
        next.text.translationOffsetY,
      ]).toEqual([0.3, 40, 60, 20]);
    }
  });

  it('sets the style groups only, never a content prop or a file', () => {
    for (const entry of MUSHAF_LOOKS) {
      for (const key of Object.keys(entry.patch)) expect(LOOK_GROUPS).toContain(key);
      const text = (entry.patch.text ?? {}) as Record<string, unknown>;
      for (const file of ['translationFile', 'glossFile', 'transliterationFile']) expect(text).not.toHaveProperty(file);
    }
  });

  for (const entry of MUSHAF_LOOKS)
    for (const kind of entry.applies)
      it(`${entry.id} on ${kind}: the schema accepts the result as it is`, () => {
        const {schema, defaults} = COMPOSITIONS[kind];
        const next = applyLook(defaults, entry);
        expect(schema.parse(next)).toEqual(next);
        expect(Object.keys(lookPatchFor(defaults, entry)).length).toBeGreaterThan(0);
        expect(lookMatches(next, entry)).toBe(true);
        expect(defaults).toEqual(schema.parse(defaults)); // the defaults are untouched
      });

  it('looksFor() keeps the order and only the looks for the composition', () => {
    expect(looksFor('recitation').map((entry) => entry.id)).toEqual(MUSHAF_LOOKS.map((entry) => entry.id));
    expect(looksFor('ayah-text').map((entry) => entry.id)).toEqual(['mushaf', 'haram-night', 'madinah-green']);
    expect(looksFor('passage').map((entry) => entry.id)).toEqual(MUSHAF_LOOKS.map((entry) => entry.id));
  });
});

describe('MUSHAF_FORMATS / applyFormat', () => {
  it('has the four frame shapes with their recommended margins and vertical place', () => {
    expect(MUSHAF_FORMATS.map((f) => [f.id, f.aspect, f.marginX, f.verticalAlign, f.nameAr])).toEqual([
      ['landscape', '16:9', 190, 0.5, 'أفقي'],
      ['vertical', '9:16', 90, 0.45, 'عمودي'],
      ['square', '1:1', 90, 0.48, 'مربّع'],
      ['portrait', '4:5', 90, 0.47, 'طولي'],
    ]);
  });

  it('sets the aspect, and the margins and vertical place only while they hold the previous format’s', () => {
    const vertical = applyFormat(defaultMushafRecitationProps, 'vertical');
    expect(vertical.layout).toMatchObject({aspect: '9:16', marginX: 90, verticalAlign: 0.45});
    expect(vertical.layout.visibleLines).toBe(defaultMushafRecitationProps.layout.visibleLines);
    // Back again: the recommended values follow.
    expect(applyFormat(vertical, 'landscape').layout).toEqual(defaultMushafRecitationProps.layout);
    // A position the user chose is kept.
    const placed = {
      ...defaultMushafRecitationProps,
      layout: {...defaultMushafRecitationProps.layout, marginX: 240, verticalAlign: 0.6},
    };
    expect(applyFormat(placed, 'square').layout).toMatchObject({aspect: '1:1', marginX: 240, verticalAlign: 0.6});
    // From vertical with its margins but a moved line: only the margins follow.
    const moved = {...vertical, layout: {...vertical.layout, verticalAlign: 0.4}};
    expect(formatPatchFor(moved, 'portrait')).toEqual({layout: {aspect: '4:5', marginX: 90}});
  });

  it('refuses a format that does not exist, and leaves props without a layout alone', () => {
    expect(() => applyFormat(defaultMushafRecitationProps, 'cinema')).toThrow(/no format "cinema"/);
    expect(formatPatchFor({}, 'vertical')).toEqual({});
  });

  it('commutes with every look on every composition: applyLook ∘ applyFormat equals applyFormat ∘ applyLook', () => {
    for (const entry of MUSHAF_LOOKS)
      for (const kind of entry.applies)
        for (const format of MUSHAF_FORMATS) {
          const {defaults} = COMPOSITIONS[kind];
          const lookFirst = applyFormat(applyLook(defaults, entry), format.id);
          const formatFirst = applyLook(applyFormat(defaults, format.id), entry);
          expect(lookFirst, `${entry.id} ${format.id} on ${kind}`).toEqual(formatFirst);
          expect(COMPOSITIONS[kind].schema.parse(lookFirst)).toEqual(lookFirst);
        }
  });
});

describe('lookById', () => {
  it('finds a look, and maps an old id to what replaced it with one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(lookById('haram-night')).toBe(look('haram-night'));
    expect(warn).not.toHaveBeenCalled();
    const expected: Record<string, string> = {
      classic: 'mushaf',
      'tajweed-light': 'tajweed',
      night: 'haram-night',
      'black-gold': 'haram-night',
      sepia: 'mushaf',
      study: 'learning',
      karaoke: 'mushaf',
    };
    for (const [old, now] of Object.entries(expected)) {
      warn.mockClear();
      expect(lookById(old)).toBe(look(now));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain(old);
    }
    expect(Object.keys(LEGACY_LOOK_IDS)).toHaveLength(9);
    expect(lookById('lapis')).toBeNull();
  });

  it('returns the format’s patch for the two old frame looks', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(lookById('reel')!.patch).toEqual({layout: {aspect: '9:16', marginX: 90, verticalAlign: 0.45}});
    expect(lookById('square')!.patch).toEqual({layout: {aspect: '1:1', marginX: 90, verticalAlign: 0.48}});
  });
});

describe('applyLook', () => {
  it('merges group by group and keeps the content', () => {
    const props = {
      ...defaultMushafRecitationProps,
      text: {...defaultMushafRecitationProps.text, translationFile: 't.json'},
    };
    const next = applyLook(props, look('haram-night'));
    expect(next.layout).toEqual({
      ...props.layout,
      background: '#121416',
      color: '#f1eadb',
      neighbourOpacity: 0.25,
      frame: 'none',
      backgroundImage: '',
    });
    expect(next.background).toEqual({...props.background, color: '#121416', vignette: 0.22});
    expect(next.overlay).toEqual({...props.overlay, color: '#b9b1a2', font: 'auto'});
    expect(next.text.translationFile).toBe('t.json');
    expect(next.audioFile).toBe(props.audioFile);
    expect(next.splits).toBe(props.splits);
    expect(props.layout.background).toBe('#f8f3e6'); // not changed in place
  });

  it('skips the fields the composition does not have', () => {
    const next = applyLook(defaultMushafAyahTextProps, look('haram-night'));
    expect(next).not.toHaveProperty('theme');
    expect(next.layout.background).toBe('#121416');
    expect(lookPatchFor(defaultMushafAyahTextProps, look('madinah-green'))).not.toHaveProperty('customTheme');
    expect(lookPatchFor(defaultMushafAyahTextProps, look('tajweed'))).not.toHaveProperty('legend');
    expect(applyLook(defaultMushafPassageProps, look('learning'))).not.toHaveProperty('highlight');
  });

  it('replaces an array rather than merging it', () => {
    const withArray = {...defaultMushafRecitationProps, layout: {list: [1, 2, 3]}} as unknown as Record<
      string,
      unknown
    >;
    const arrayLook = custom({layout: {list: [4]}} as unknown as MushafLook['patch']);
    expect(applyLook(withArray, arrayLook).layout).toEqual({list: [4]});
  });
});

describe('lookMatches', () => {
  it('is true when every field the look sets is equal, false when one differs', () => {
    const learning = look('learning');
    const learningProps = applyLook(defaultMushafRecitationProps, learning);
    expect(lookMatches(learningProps, learning)).toBe(true);
    expect(lookMatches(defaultMushafRecitationProps, learning)).toBe(false);
    expect(lookMatches(learningProps, look('haram-night'))).toBe(false);
    const nudged = {...learningProps, highlight: {...learningProps.highlight, color: '#000000'}};
    expect(lookMatches(nudged, learning)).toBe(false);
    // A field the look does not set does not matter.
    expect(lookMatches({...learningProps, fromAyah: 3}, learning)).toBe(true);
  });

  it('is false for a look of which nothing applies', () => {
    expect(lookMatches(defaultMushafAyahTextProps, custom({theme: 'dark'}, ['ayah-text']))).toBe(false);
  });
});

describe('lookUndoPatch', () => {
  it('holds the values before the look, and puts them back', () => {
    const entry = look('madinah-green');
    const before = defaultMushafRecitationProps;
    const undo = lookUndoPatch(before, entry);
    expect(undo.theme).toBe('custom');
    expect(undo.layout).toMatchObject({background: '#f8f3e6', color: '#1c1a16', frame: 'none', backgroundImage: ''});
    expect(undo.customTheme?.override).toEqual(before.customTheme.override);
    expect(undo.background).toEqual({color: '#f8f3e6', vignette: 0});
    const after = applyLook(before, entry);
    const back = applyLook(after, {...entry, patch: undo});
    expect(back).toEqual(before);
  });

  it('is empty for a look of which nothing applies', () => {
    expect(lookUndoPatch(defaultMushafAyahTextProps, custom({theme: 'dark'}, ['ayah-text']))).toEqual({});
  });
});

describe('lookRevertPatch', () => {
  const night = look('haram-night');
  const applied = lookPatchFor(defaultMushafRecitationProps, night);
  const before = lookUndoPatch(defaultMushafRecitationProps, night);
  const after = applyLook(defaultMushafRecitationProps, night);

  it('puts back every field while the props still hold the look', () => {
    expect(lookRevertPatch(after, applied, before)).toEqual(before);
    expect(applyLook(after, {...night, patch: lookRevertPatch(after, applied, before)!})).toEqual(
      defaultMushafRecitationProps,
    );
  });

  it('leaves a field changed since alone, and reverts the others', () => {
    const edited = {...after, layout: {...after.layout, background: '#222222'}, theme: 'sepia' as const};
    const revert = lookRevertPatch(edited, applied, before)!;
    expect(revert).not.toHaveProperty('theme');
    expect(revert.layout).not.toHaveProperty('background');
    expect(revert.layout).toMatchObject({color: defaultMushafRecitationProps.layout.color});
    expect(revert.highlight).toEqual(before.highlight);
    const back = applyLook(edited, {...night, patch: revert});
    expect(back.layout.background).toBe('#222222');
    expect(back.theme).toBe('sepia');
    expect(back.highlight).toEqual(defaultMushafRecitationProps.highlight);
  });

  it('is null when every field the look set has changed since', () => {
    const small = custom({layout: {neighbourOpacity: 0.4}, animation: {lines: 'cut'}});
    const smallApplied = lookPatchFor(defaultMushafRecitationProps, small);
    const smallBefore = lookUndoPatch(defaultMushafRecitationProps, small);
    const changed = applyLook(applyLook(defaultMushafRecitationProps, small), {
      ...small,
      patch: {layout: {neighbourOpacity: 0.2}, animation: {lines: 'rise'}},
    });
    expect(lookRevertPatch(changed, smallApplied, smallBefore)).toBeNull();
  });
});

describe('lookInBox', () => {
  it("drops layout.aspect (a slot's box decides the size) and keeps the rest of the look", () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reel = lookById('reel')!;
    const boxed = lookInBox(reel);
    expect(boxed.patch).toEqual({layout: {marginX: 90, verticalAlign: 0.45}});
    expect(applyLook(defaultMushafRecitationProps, boxed).layout.aspect).toBe(
      defaultMushafRecitationProps.layout.aspect,
    );
    // A look that only framed loses its layout group altogether.
    expect(lookInBox(custom({layout: {aspect: '1:1'}})).patch).toEqual({});
    // A look that sets no aspect (none of the five does) is returned as it is.
    for (const entry of MUSHAF_LOOKS) expect(lookInBox(entry)).toBe(entry);
  });
});

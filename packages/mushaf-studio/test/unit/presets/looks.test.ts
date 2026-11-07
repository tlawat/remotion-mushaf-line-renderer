// The looks against the compositions' own schemas: each one, applied to the defaults of every
// composition it is designed for, gives props that schema accepts unchanged (no field it does not
// have, no value out of range), and changes something.
import {describe, expect, it} from 'vitest';
import type {z} from 'zod';
import {defaultMushafPassageProps, mushafPassageSchema} from '../../../src/compositions/passage/schema';
import {defaultMushafRecitationProps, mushafRecitationSchema} from '../../../src/compositions/recitation/schema';
import {
  applyLook,
  LOOK_GROUPS,
  LOOK_POSITION_FIELDS,
  lookInBox,
  lookMatches,
  lookPatchFor,
  lookRevertPatch,
  looksFor,
  lookUndoPatch,
  MUSHAF_LOOKS,
  type MushafLook,
  type MushafLookKind,
} from '../../../src/presets';
import {defaultMushafAyahTextProps, mushafAyahTextSchema} from '../../../src/unicode/schema';

const COMPOSITIONS: Readonly<
  Record<MushafLookKind, {readonly schema: z.ZodTypeAny; readonly defaults: Readonly<Record<string, unknown>>}>
> = {
  recitation: {schema: mushafRecitationSchema, defaults: defaultMushafRecitationProps},
  'ayah-text': {schema: mushafAyahTextSchema, defaults: defaultMushafAyahTextProps},
  passage: {schema: mushafPassageSchema, defaults: defaultMushafPassageProps},
};

const lookById = (id: string): MushafLook => {
  const look = MUSHAF_LOOKS.find((entry) => entry.id === id);
  if (!look) throw new Error(`no look ${id}`);
  return look;
};

describe('MUSHAF_LOOKS', () => {
  it('has at least eight looks, each with a unique id, a name, a description and a composition', () => {
    expect(MUSHAF_LOOKS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(MUSHAF_LOOKS.map((look) => look.id)).size).toBe(MUSHAF_LOOKS.length);
    for (const look of MUSHAF_LOOKS) {
      expect(look.name).not.toBe('');
      expect(look.description).not.toBe('');
      expect(look.applies.length).toBeGreaterThan(0);
    }
  });

  it('never moves what the user positioned: no look sets a position field, the frame looks included', () => {
    for (const look of MUSHAF_LOOKS)
      for (const field of LOOK_POSITION_FIELDS) {
        const [group, key] = field.split('.') as [string, string];
        expect((look.patch as Record<string, Record<string, unknown> | undefined>)[group] ?? {}).not.toHaveProperty(
          key,
        );
      }
    const placed = {
      ...defaultMushafRecitationProps,
      layout: {...defaultMushafRecitationProps.layout, verticalAlign: 0.3, offsetY: 40, marginX: 60},
      text: {...defaultMushafRecitationProps.text, translationOffsetY: 20},
    };
    for (const id of ['reel', 'square']) {
      const next = applyLook(placed, lookById(id));
      expect([
        next.layout.verticalAlign,
        next.layout.offsetY,
        next.layout.marginX,
        next.text.translationOffsetY,
      ]).toEqual([0.3, 40, 60, 20]);
    }
  });

  it('sets the style groups only, never a content prop or a file', () => {
    for (const look of MUSHAF_LOOKS) {
      for (const key of Object.keys(look.patch)) expect(LOOK_GROUPS).toContain(key);
      const text = (look.patch.text ?? {}) as Record<string, unknown>;
      for (const file of ['translationFile', 'glossFile', 'transliterationFile']) expect(text).not.toHaveProperty(file);
    }
  });

  for (const look of MUSHAF_LOOKS)
    for (const kind of look.applies)
      it(`${look.id} on ${kind}: the schema accepts the result as it is, and it changes something`, () => {
        const {schema, defaults} = COMPOSITIONS[kind];
        const next = applyLook(defaults, look);
        expect(schema.parse(next)).toEqual(next);
        expect(Object.keys(lookPatchFor(defaults, look)).length).toBeGreaterThan(0);
        expect(lookMatches(next, look)).toBe(true);
        expect(defaults).toEqual(schema.parse(defaults)); // the defaults are untouched
      });

  it('looksFor() keeps the order and only the looks for the composition', () => {
    expect(looksFor('recitation').map((look) => look.id)).toEqual(
      MUSHAF_LOOKS.filter((look) => look.applies.includes('recitation')).map((look) => look.id),
    );
    expect(looksFor('ayah-text').map((look) => look.id)).not.toContain('tajweed-light');
    expect(looksFor('passage').map((look) => look.id)).not.toContain('karaoke');
  });
});

describe('applyLook', () => {
  it('merges group by group and keeps the content', () => {
    const props = {
      ...defaultMushafRecitationProps,
      text: {...defaultMushafRecitationProps.text, translationFile: 't.json'},
    };
    const next = applyLook(props, lookById('reel'));
    expect(next.layout).toEqual({...props.layout, aspect: '9:16', visibleLines: 0});
    expect(next.text.translationFile).toBe('t.json');
    expect(next.audioFile).toBe(props.audioFile);
    expect(next.splits).toBe(props.splits);
    expect(props.layout.aspect).toBe('16:9'); // not changed in place
  });

  it('skips the fields the composition does not have', () => {
    const next = applyLook(defaultMushafAyahTextProps, lookById('night'));
    expect(next).not.toHaveProperty('theme');
    expect(next.layout.background).toBe('#101418');
    expect(lookPatchFor(defaultMushafAyahTextProps, lookById('black-gold'))).not.toHaveProperty('customTheme');
    expect(applyLook(defaultMushafPassageProps, lookById('classic'))).not.toHaveProperty('highlight');
  });

  it('replaces an array rather than merging it', () => {
    const look: MushafLook = {id: 'x', name: 'X', description: 'x', applies: ['recitation'], patch: {}};
    const withArray = {...defaultMushafRecitationProps, layout: {list: [1, 2, 3]}} as unknown as Record<
      string,
      unknown
    >;
    const arrayLook = {...look, patch: {layout: {list: [4]}}} as unknown as MushafLook;
    expect(applyLook(withArray, arrayLook).layout).toEqual({list: [4]});
  });
});

describe('lookMatches', () => {
  it('is true when every field the look sets is equal, false when one differs', () => {
    const classic = lookById('classic');
    const classicProps = applyLook(defaultMushafRecitationProps, classic);
    expect(lookMatches(classicProps, classic)).toBe(true);
    // The defaults are the design's own look, not Classic's.
    expect(lookMatches(defaultMushafRecitationProps, classic)).toBe(false);
    expect(lookMatches(classicProps, lookById('night'))).toBe(false);
    const nudged = {...classicProps, highlight: {...classicProps.highlight, color: '#000000'}};
    expect(lookMatches(nudged, classic)).toBe(false);
    // A field the look does not set does not matter.
    expect(lookMatches({...classicProps, fromAyah: 3}, classic)).toBe(true);
  });

  it('is false for a look of which nothing applies', () => {
    const themeOnly: MushafLook = {
      id: 't',
      name: 'T',
      description: 't',
      applies: ['ayah-text'],
      patch: {theme: 'dark'},
    };
    expect(lookMatches(defaultMushafAyahTextProps, themeOnly)).toBe(false);
  });
});

describe('lookUndoPatch', () => {
  it('holds the values before the look, and puts them back', () => {
    const look = lookById('black-gold');
    const before = defaultMushafRecitationProps;
    const undo = lookUndoPatch(before, look);
    expect(undo.theme).toBe('custom');
    expect(undo.layout).toEqual({background: '#f8f3e6', color: '#1c1a16', backgroundImage: ''});
    expect(undo.customTheme?.override).toEqual(before.customTheme.override);
    const after = applyLook(before, look);
    const back = applyLook(after, {...look, patch: undo});
    expect(back).toEqual(before);
  });

  it('is empty for a look of which nothing applies', () => {
    const themeOnly: MushafLook = {
      id: 't',
      name: 'T',
      description: 't',
      applies: ['ayah-text'],
      patch: {theme: 'dark'},
    };
    expect(lookUndoPatch(defaultMushafAyahTextProps, themeOnly)).toEqual({});
  });
});

describe('lookRevertPatch', () => {
  const night = lookById('night');
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
    expect(revert.layout).toEqual({color: defaultMushafRecitationProps.layout.color, backgroundImage: ''});
    expect(revert.highlight).toEqual(before.highlight);
    const back = applyLook(edited, {...night, patch: revert});
    expect(back.layout.background).toBe('#222222');
    expect(back.theme).toBe('sepia');
    expect(back.highlight).toEqual(defaultMushafRecitationProps.highlight);
  });

  it('is null when every field the look set has changed since', () => {
    const reel = lookById('reel');
    const reelApplied = lookPatchFor(defaultMushafRecitationProps, reel);
    const reelBefore = lookUndoPatch(defaultMushafRecitationProps, reel);
    const changed = applyLook(applyLook(defaultMushafRecitationProps, reel), {
      ...reel,
      patch: {
        layout: {aspect: '1:1', visibleLines: 2},
        animation: {lines: 'cut'},
        text: {translationPosition: 'above', translationSize: 30},
      },
    });
    expect(lookRevertPatch(changed, reelApplied, reelBefore)).toBeNull();
  });
});

describe('lookInBox', () => {
  it("drops layout.aspect (a slot's box decides the size) and keeps the rest of the look", () => {
    const framing = MUSHAF_LOOKS.filter((look) => look.patch.layout?.aspect !== undefined);
    expect(framing.length).toBeGreaterThan(0);
    for (const look of framing) {
      const boxed = lookInBox(look);
      expect(boxed.patch.layout && 'aspect' in boxed.patch.layout).toBeFalsy();
      const {layout: _layout, ...others} = look.patch;
      const {layout: _boxed, ...kept} = boxed.patch;
      expect(kept).toEqual(others);
      // Applied to a recitation, it leaves the aspect where it was.
      expect(applyLook(defaultMushafRecitationProps, boxed).layout.aspect).toBe(
        defaultMushafRecitationProps.layout.aspect,
      );
    }
    // A look that only framed loses its layout group altogether.
    const onlyAspect: MushafLook = {
      id: 'x',
      name: 'X',
      description: '',
      applies: ['recitation'],
      patch: {layout: {aspect: '1:1'}},
    };
    expect(lookInBox(onlyAspect).patch).toEqual({});
    // A look that sets no aspect is returned as it is.
    const night = MUSHAF_LOOKS.find((look) => look.id === 'night')!;
    expect(lookInBox(night)).toBe(night);
  });
});

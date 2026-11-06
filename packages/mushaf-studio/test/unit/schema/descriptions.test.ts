// The schemas as the Props sidebar of Remotion 4.0.539 shows them: a colour field keeps zColor()'s
// marker (the sidebar draws a picker only then; a .describe() turns it into a text box), every
// description fits the info bubble, and where two options overlap the description says which wins.
import {ZodZypesInternals} from '@remotion/zod-types';
import {describe, expect, it} from 'vitest';
import type {z} from 'zod';
import {audioSchema} from '../../../src/audio/schema';
import {backgroundSchema} from '../../../src/background/schema';
import {mushafPassageSchema} from '../../../src/compositions/passage';
import {mushafRecitationSchema} from '../../../src/compositions/recitation';
import {mushafThumbnailSchema} from '../../../src/export';
import {mushafPageSchema, pageViewSchema} from '../../../src/page/schema';
import {
  customThemeSchema,
  endCardSchema,
  fontsSchema,
  headerSchema,
  highlightSchema,
  layoutSchema,
  legendSchema,
  memorizeSchema,
  overlaySchema,
  recitationTextSchema,
  textSchema,
} from '../../../src/schema';
import {mushafAyahTextSlotSchema, mushafPageSlotSchema, mushafRecitationSlotSchema} from '../../../src/slots';
import {mushafAyahTextSchema} from '../../../src/unicode';

type Leaf = {readonly path: string; readonly schema: z.ZodType};

/** Every field of `schema`, nested objects, arrays, optionals and nullables opened, with its dotted path. */
const leavesOf = (schema: z.ZodType, path = ''): Leaf[] => {
  const def = (schema as unknown as {readonly def: {readonly type: string}}).def;
  const own: Leaf[] = path === '' ? [] : [{path, schema}];
  if (def.type === 'object') {
    const shape = (schema as unknown as z.ZodObject).shape as Record<string, z.ZodType>;
    return [
      ...own,
      ...Object.entries(shape).flatMap(([key, field]) => leavesOf(field, path === '' ? key : `${path}.${key}`)),
    ];
  }
  if (def.type === 'optional' || def.type === 'nullable')
    return [...own, ...leavesOf((schema as unknown as z.ZodOptional<z.ZodType>).unwrap(), `${path}?`)];
  if (def.type === 'array')
    return [...own, ...leavesOf((schema as unknown as z.ZodArray<z.ZodType>).element, `${path}[]`)];
  return own;
};

/** A string field that refuses what is not a colour: a `zColor()`. */
const isColourField = (schema: z.ZodType): boolean =>
  (schema as unknown as {readonly def: {readonly type: string}}).def.type === 'string' &&
  schema.safeParse('#fbf7ee').success &&
  !schema.safeParse('no colour at all').success;

const SCHEMAS = {
  MushafRecitation: mushafRecitationSchema,
  MushafAyahText: mushafAyahTextSchema,
  MushafPage: mushafPageSchema,
  MushafPassage: mushafPassageSchema,
  MushafThumbnail: mushafThumbnailSchema,
  MushafRecitationSlot: mushafRecitationSlotSchema,
  MushafAyahTextSlot: mushafAyahTextSlotSchema,
  MushafPageSlot: mushafPageSlotSchema,
} as const;

describe('the Props sidebar', () => {
  it.each(Object.entries(SCHEMAS))('gets a colour picker for every colour field of %s', (_name, schema) => {
    const colours = leavesOf(schema).filter((leaf) => isColourField(leaf.schema));
    expect(colours.length).toBeGreaterThan(3);
    for (const leaf of colours)
      expect([leaf.path, leaf.schema.description]).toEqual([leaf.path, ZodZypesInternals.REMOTION_COLOR_BRAND]);
  });

  it.each(Object.entries(SCHEMAS))(
    'keeps every description of %s to a short paragraph of the info bubble',
    (_name, schema) => {
      for (const leaf of leavesOf(schema)) {
        const text = leaf.schema.description;
        if (text === undefined || text === ZodZypesInternals.REMOTION_COLOR_BRAND) continue;
        expect([leaf.path, text.length <= 200]).toEqual([leaf.path, true]);
      }
    },
  );
});

describe('the descriptions of overlapping options', () => {
  it('say which of the page colour, background.color and the two images wins', () => {
    expect(backgroundSchema.shape.kind.description).toMatch(/color paints layout\.background/);
    expect(backgroundSchema.shape.src.description).toMatch(/wins over layout\.backgroundImage/);
    expect(layoutSchema.shape.backgroundImage.description).toMatch(/^Legacy.*background\.src wins/);
    for (const schema of [mushafRecitationSchema, mushafAyahTextSchema, mushafPageSchema]) {
      expect(schema.shape.layout.description).toMatch(/painted when background\.kind is color/);
      expect(schema.shape.background.description).toMatch(/background\.color fills only behind/);
    }
    expect(mushafPassageSchema.shape.layout.description).toMatch(/background\.kind is color/);
  });

  it('say that header and the intro card both name the surah', () => {
    expect(headerSchema.description).toMatch(/overlay\.title.*use one/);
    expect(overlaySchema.shape.title.description).toMatch(/with header on, it is shown twice/);
  });

  it('say that memorisation wins over the dimming, and what mode none turns off', () => {
    expect(highlightSchema.shape.dimOthers.description).toMatch(/ignored when mode is none.*memorize hides/);
    expect(highlightSchema.shape.style.description).toMatch(/ignored when mode is none/);
    expect(memorizeSchema.shape.mode.description).toMatch(/wins over highlight\.dimOthers/);
    expect(memorizeSchema.shape.mode.description).toMatch(/faint outline on printed lines/);
    expect(pageViewSchema.shape.dimOtherLines.description).toMatch(/on top of highlight\.dimOthers/);
    expect(mushafRecitationSchema.shape.memorize.description).toMatch(/no repeats under hostAudio/);
  });

  it('say that translation layers win over the single translation', () => {
    expect(textSchema.shape.translations.description).toMatch(/translationFile and the translation .* are ignored/);
    for (const key of ['translationFile', 'translationFont', 'translationSize'] as const)
      expect([key, textSchema.shape[key].description]).toEqual([
        key,
        expect.stringMatching(/ignored once translations/),
      ]);
    expect(textSchema.shape.translationDirection.description).toMatch(/layers follow their language/);
    expect(textSchema.shape.translationPosition.description).toMatch(/none hides it; its files are still read/);
  });

  it('say that glossPosition none hides the gloss files, and where they apply', () => {
    expect(recitationTextSchema.shape.glossPosition.description).toMatch(/glossFile and transliterationFile.*none/);
    for (const key of ['glossFile', 'transliterationFile'] as const)
      expect(textSchema.shape[key].description).toMatch(/^MushafRecitation only.*glossPosition none hides it/);
  });

  it('say which file each end card needs, and when a file is read', () => {
    expect(endCardSchema.shape.show.description).toMatch(/needs tafsirFile.*needs chapterInfoFile/);
    expect(endCardSchema.shape.tafsirFile.description).toMatch(/read only when show is tafsir/);
    expect(endCardSchema.shape.chapterInfoFile.description).toMatch(/read only when show is chapter-info/);
  });

  it('say that hostAudio wins over the audio cleanup, and what each cleanup option waits for', () => {
    for (const schema of [mushafRecitationSchema, mushafAyahTextSchema, mushafPageSchema]) {
      expect(schema.shape.audio.description).toMatch(/does nothing under hostAudio/);
      expect(schema.shape.hostAudio.description).toMatch(/wins over the audio cleanup/);
    }
    expect(audioSchema.shape.targetLufs.description).toMatch(/^Only when normalize is on/);
    expect(audioSchema.shape.trimSilence.description).toMatch(/animation\.leadInSeconds/);
    expect(audioSchema.shape.fadeOutSeconds.description).toMatch(/before any end card/);
  });

  it('say what fonts, the custom palette and the legend depend on', () => {
    expect(fontsSchema.description).toMatch(/Without registerMushafFonts\(\) every mode uses the CDN/);
    expect(customThemeSchema.description).toMatch(/^Used only when theme is custom/);
    expect(legendSchema.shape.show.description).toMatch(/not plain, normal or black/);
  });
});

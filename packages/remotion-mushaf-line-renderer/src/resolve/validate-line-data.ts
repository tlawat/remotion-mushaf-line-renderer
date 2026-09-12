import {describeValue, MushafError} from '../errors';
import {assertMushafColors} from '../mushaf/colors';
import {assertLine, assertLook, assertPage, fontSetForLook, getMushafDefinition} from '../mushaf/registry';
import type {MushafLineData, MushafLineType, MushafWordKind} from '../types';
import {assertSlice} from './slice';

const LINE_TYPES: readonly MushafLineType[] = ['ayah', 'surah_name', 'basmallah'];
const WORD_KINDS: readonly MushafWordKind[] = ['word', 'end', 'pause', 'sajdah', 'rub-el-hizb'];

const fail = (field: string, problem: string, value?: unknown): never => {
  throw new MushafError(
    'BAD_LINE_DATA',
    `MushafLineData.${field} is invalid: ${problem}${value === undefined ? '' : ` (got ${describeValue(value)})`}. Pass the object returned by getMushafLine() unchanged.`,
    {field},
  );
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/**
 * Validates a `line` prop. Data may have been persisted (inputProps, a database) and outlive the
 * package version that produced it, so every field is checked and a version mismatch is explicit.
 */
export const assertLineData = (value: unknown): MushafLineData => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MushafError(
      'BAD_LINE_DATA',
      `MushafLineData must be the object returned by getMushafLine(), got ${describeValue(value)}.`,
    );
  }
  const data = value as Record<string, unknown>;
  if (data.version !== 2) {
    throw new MushafError(
      'BAD_LINE_DATA',
      `MushafLineData.version is ${describeValue(data.version)} but this version of remotion-mushaf-line-renderer understands version 2. Resolve the line again with getMushafLine() or upgrade the package.`,
      {field: 'version'},
    );
  }
  const def = getMushafDefinition(data.mushaf);
  const look = assertLook(data.look);
  const fontSet = fontSetForLook(def, look);
  const page = assertPage(def, data.page);
  assertLine(def, page, data.line);
  if (data.fontSet !== fontSet.id) fail('fontSet', `expected "${fontSet.id}" for the ${look} look`, data.fontSet);
  if (!LINE_TYPES.includes(data.type as MushafLineType))
    fail('type', `expected one of ${LINE_TYPES.join(', ')}`, data.type);
  if (typeof data.centered !== 'boolean') fail('centered', 'expected a boolean', data.centered);
  if (data.fontFamily !== fontSet.fontFamily(page))
    fail('fontFamily', `expected "${fontSet.fontFamily(page)}"`, data.fontFamily);
  if (data.fontUrl !== undefined && (typeof data.fontUrl !== 'string' || data.fontUrl === ''))
    fail('fontUrl', 'expected a non-empty string when present', data.fontUrl);
  // Colours are written into a stylesheet, so they are checked here rather than dropped later.
  if (data.colors !== undefined) {
    if (look !== 'mandala') fail('colors', `only the mandala look takes colours (this line is ${look})`, data.colors);
    assertMushafColors('MushafLineData.colors', data.colors);
  }
  // Only palettes the font actually has: an unknown one would silently paint the default palette.
  if (data.palette !== undefined) {
    if (fontSet.palettes.length === 0)
      fail('palette', `the ${look} look uses the monochrome font, which has no palettes`, data.palette);
    if (!fontSet.palettes.includes(data.palette as number))
      fail('palette', `expected one of ${fontSet.palettes.join(', ')} when present`, data.palette);
  }
  if (data.slice !== undefined) assertSlice('MushafLineData.slice', data.slice);
  if (data.surahNumber !== undefined && (!isPositiveInteger(data.surahNumber) || data.surahNumber > 114))
    fail('surahNumber', 'expected an integer from 1 to 114 when present', data.surahNumber);
  if (!Array.isArray(data.words)) fail('words', 'expected an array', data.words);
  const words = data.words as unknown[];
  words.forEach((w, i) => {
    if (typeof w !== 'object' || w === null) fail(`words[${i}]`, 'expected an object', w);
    const word = w as Record<string, unknown>;
    if (typeof word.id !== 'string' || !/^\d+:\d+:\d+$/.test(word.id))
      fail(`words[${i}].id`, 'expected "surah:ayah:position"', word.id);
    for (const key of ['wordId', 'surah', 'ayah', 'position'] as const) {
      if (!isPositiveInteger(word[key])) fail(`words[${i}].${key}`, 'expected a positive integer', word[key]);
    }
    if (!WORD_KINDS.includes(word.kind as MushafWordKind))
      fail(`words[${i}].kind`, `expected one of ${WORD_KINDS.join(', ')}`, word.kind);
    if (typeof word.text !== 'string') fail(`words[${i}].text`, 'expected a string', word.text);
    const length = Array.from(word.text as string).length;
    if (length < 1 || length > 4) fail(`words[${i}].text`, 'expected 1–4 code points', word.text);
    if (i > 0 && (word.wordId as number) <= ((words[i - 1] as Record<string, unknown>).wordId as number))
      fail(`words[${i}].wordId`, 'words must be ordered by wordId');
  });
  if (data.type !== 'ayah' && words.length > 0) fail('words', `${data.type} lines carry no words`);
  return value as MushafLineData;
};

import {describeValue, MushafError} from '../errors';
import {assertLine, assertPage, getMushafDefinition, resolveSelection} from '../mushaf/registry';
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
  if (data.version !== 3) {
    throw new MushafError(
      'BAD_LINE_DATA',
      `MushafLineData.version is ${describeValue(data.version)} but this version of @tlawat/remotion-mushaf-line understands version 3. Resolve the line again with getMushafLine() or upgrade the package.`,
      {field: 'version'},
    );
  }
  const def = getMushafDefinition(data.mushaf);
  if (data.theme === undefined) fail('theme', "expected 'plain', a preset name or a theme object");
  // The theme is checked the way a selection is (BAD_THEME / BAD_COLOR name the problem), and the
  // font set has to be the one that theme needs.
  const {fontSet} = resolveSelection({mushaf: def.id, theme: data.theme as MushafLineData['theme']});
  const page = assertPage(def, data.page);
  assertLine(def, page, data.line);
  if (data.fontSet !== fontSet.id) fail('fontSet', `expected "${fontSet.id}" for this theme`, data.fontSet);
  if (!LINE_TYPES.includes(data.type as MushafLineType))
    fail('type', `expected one of ${LINE_TYPES.join(', ')}`, data.type);
  if (typeof data.centered !== 'boolean') fail('centered', 'expected a boolean', data.centered);
  const expectedFamily = data.type === 'ayah' ? fontSet.fontFamily(page) : def.sharedFonts.surahNames.fontFamily;
  if (data.fontFamily !== expectedFamily) fail('fontFamily', `expected "${expectedFamily}"`, data.fontFamily);
  if (data.fontUrl !== undefined)
    fail(
      'fontUrl',
      'it was removed in 0.4: pass fontSrc (your own URLs) or fontFallback (a fonts package) to <MushafLine> instead, and resolve the line again',
      data.fontUrl,
    );
  if (data.slice !== undefined) assertSlice('MushafLineData.slice', data.slice);
  if (data.surahNumber !== undefined && (!isPositiveInteger(data.surahNumber) || data.surahNumber > 114))
    fail('surahNumber', 'expected an integer from 1 to 114 when present', data.surahNumber);
  if (data.type === 'surah_name' && data.surahNumber === undefined)
    fail('surahNumber', 'expected the surah number on a surah_name line');
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

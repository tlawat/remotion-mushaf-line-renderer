import {MushafError, describeValue} from './errors';
import {assertLine, assertPage, getMushafDefinition} from './mushafs';
import type {MushafLineData, MushafLineType, MushafWordKind} from './types';

const LINE_TYPES: readonly MushafLineType[] = ['ayah', 'surah_name', 'basmallah'];
const WORD_KINDS: readonly MushafWordKind[] = ['word', 'end', 'pause', 'sajdah', 'rub-el-hizb'];

const fail = (field: string, problem: string, value?: unknown): never => {
  throw new MushafError('BAD_LINE_DATA', `MushafLineData.${field} is invalid: ${problem}${value === undefined ? '' : ` (got ${describeValue(value)})`}. Pass the object returned by getMushafLine() unchanged.`, {field});
};

/**
 * Validates a `line` prop. Data may have been persisted (inputProps, a database) and outlive the
 * package version that produced it, so every field is checked and a version mismatch is explicit.
 */
export const assertLineData = (value: unknown): MushafLineData => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MushafError('BAD_LINE_DATA', `MushafLineData must be the object returned by getMushafLine(), got ${describeValue(value)}.`);
  }
  const data = value as Record<string, unknown>;
  if (data.version !== 1) {
    throw new MushafError(
      'BAD_LINE_DATA',
      `MushafLineData.version is ${describeValue(data.version)} but this version of remotion-mushaf-line-renderer understands version 1. Regenerate the data with getMushafLine() or upgrade the package.`,
      {field: 'version'},
    );
  }
  const def = getMushafDefinition(data.mushaf);
  const page = assertPage(def, data.page);
  const line = assertLine(def, page, data.line);
  if (!LINE_TYPES.includes(data.type as MushafLineType)) fail('type', `expected one of ${LINE_TYPES.join(', ')}`, data.type);
  if (typeof data.centered !== 'boolean') fail('centered', 'expected a boolean', data.centered);
  if (data.fontFamily !== def.fontFamily(page)) fail('fontFamily', `expected "${def.fontFamily(page)}"`, data.fontFamily);
  if (data.fontUrl !== undefined && (typeof data.fontUrl !== 'string' || data.fontUrl === '')) fail('fontUrl', 'expected a non-empty string when present', data.fontUrl);
  if (data.surahNumber !== undefined && (typeof data.surahNumber !== 'number' || !Number.isInteger(data.surahNumber) || data.surahNumber < 1 || data.surahNumber > 114)) {
    fail('surahNumber', 'expected an integer from 1 to 114 when present', data.surahNumber);
  }
  if (!Array.isArray(data.words)) fail('words', 'expected an array', data.words);
  const words = data.words as unknown[];
  words.forEach((w, i) => {
    if (typeof w !== 'object' || w === null) fail(`words[${i}]`, 'expected an object', w);
    const word = w as Record<string, unknown>;
    if (typeof word.id !== 'string' || !/^\d+:\d+:\d+$/.test(word.id)) fail(`words[${i}].id`, 'expected "surah:ayah:position"', word.id);
    if (typeof word.wordId !== 'number' || !Number.isInteger(word.wordId) || word.wordId < 1) fail(`words[${i}].wordId`, 'expected a positive integer', word.wordId);
    for (const key of ['surah', 'ayah', 'position'] as const) {
      if (typeof word[key] !== 'number' || !Number.isInteger(word[key]) || (word[key] as number) < 1) fail(`words[${i}].${key}`, 'expected a positive integer', word[key]);
    }
    if (!WORD_KINDS.includes(word.kind as MushafWordKind)) fail(`words[${i}].kind`, `expected one of ${WORD_KINDS.join(', ')}`, word.kind);
    if (typeof word.text !== 'string') fail(`words[${i}].text`, 'expected a string', word.text);
    const length = Array.from(word.text as string).length;
    if (length < 1 || length > 2) fail(`words[${i}].text`, 'expected 1–2 code points', word.text);
    if (i > 0 && (word.wordId as number) <= ((words[i - 1] as Record<string, unknown>).wordId as number)) fail(`words[${i}].wordId`, 'words must be ordered by wordId');
  });
  if (data.type !== 'ayah' && words.length > 0) fail('words', `${data.type} lines carry no words`);
  return value as MushafLineData;
};

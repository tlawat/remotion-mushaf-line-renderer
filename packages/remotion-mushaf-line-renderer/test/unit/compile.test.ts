import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
// @ts-expect-error — plain JS modules from scripts/
import {compileLayout as compileLayoutJs} from '../../../../scripts/lib/compile.mjs';
// @ts-expect-error — plain JS modules from scripts/
import {SYNTH, SYNTH_PAGES} from '../../../../scripts/test/synthetic.mjs';
import {type CompileDef, checkLayout, compileLayout, LayoutProblemsError} from '../../src/data/compile';
import {
  DataShapeError,
  joinExport,
  type ParsedPage,
  parseLayoutRows,
  parseWordsExport,
} from '../../src/data/qul-export';
import {readSqliteTable} from '../../src/data/sqlite';
import {syntheticLayout} from '../fixtures/synthetic-layout';

const def: CompileDef = {
  id: SYNTH.dataset,
  layoutId: SYNTH.layoutId,
  pages: SYNTH.pages,
  linesOnPage: SYNTH.linesOnPage,
};
const meta = {source: 'synthetic', generatedAt: '2026-01-01T00:00:00.000Z'};
const pages = SYNTH_PAGES as ParsedPage[];
const fixtures = path.resolve(__dirname, '../fixtures/data/synthetic');

/** The synthetic pages without the standalone marker glyph — what the exports can carry. */
const regularOnly = (): ParsedPage[] =>
  pages.map((p) => ({
    ...p,
    lines: p.lines.map((l) => ({...l, words: l.words.filter((w) => w.kind === 'word' || w.kind === 'end')})),
  }));

describe('compileLayout (TypeScript port)', () => {
  it('produces exactly what the scripts compiler produces, marker glyphs included', () => {
    const ts = compileLayout(pages, def, meta);
    const js = compileLayoutJs(SYNTH_PAGES, SYNTH, meta);
    expect(ts).toEqual(js);
    expect(ts).toEqual(syntheticLayout);
    expect(compileLayout(regularOnly(), def, meta)).toEqual(compileLayoutJs(regularOnly(), SYNTH, meta));
  });

  it('reports reading-order problems with the same words as the scripts compiler', () => {
    const broken = structuredClone(pages) as unknown as {
      page: number;
      lines: {words: {position: number; ayah: number}[]}[];
    }[];
    broken[1]!.lines[2]!.words[1]!.position = 7; // 2:1:2 becomes 2:1:7
    broken[2]!.lines[1]!.words[2]!.ayah = 9; // 2:4:1 becomes 2:9:1, and 2:4:2 then comes after it
    let tsError: LayoutProblemsError | null = null;
    try {
      compileLayout(broken as unknown as ParsedPage[], def, meta);
    } catch (e) {
      tsError = e as LayoutProblemsError;
    }
    let jsProblems: string[] = [];
    try {
      compileLayoutJs(broken, SYNTH, meta);
    } catch (e) {
      jsProblems = (e as {problems: string[]}).problems;
    }
    expect(tsError).toBeInstanceOf(LayoutProblemsError);
    expect(tsError!.problems).toEqual(jsProblems);
    expect(tsError!.problems).toContain('page 2 line 3: word 2:1:7 follows 2:1:1');
    expect(tsError!.problems.some((p) => /comes after 2:9:1/.test(p))).toBe(true);
    expect(() => compileLayout(pages.slice(1), def, meta)).toThrow(/page 1: missing/);
  });
});

describe('checkLayout', () => {
  it('finds nothing wrong with the synthetic layout', () => {
    expect(checkLayout(syntheticLayout, def)).toEqual([]);
  });

  it('names what is wrong, in reading order, without counting a publication', () => {
    const tamper = (
      patch: (layout: {
        pages: {w: number; t: string[]; k: string; a: number[]; l: number[]}[];
        wordCount: number;
        dataset: string;
      }) => void,
    ) => {
      const copy = structuredClone(syntheticLayout) as unknown as {
        pages: {w: number; t: string[]; k: string; a: number[]; l: number[]}[];
        wordCount: number;
        dataset: string;
      };
      patch(copy);
      return checkLayout(copy as never, def);
    };
    expect(tamper((l) => (l.pages[2]!.k = l.pages[2]!.k.replace('e', 'w')))).toEqual(['ayah 2:2: 0 ayah markers']);
    expect(tamper((l) => (l.pages[0]!.k = `wew${l.pages[0]!.k.slice(3)}`))).toEqual([
      'ayah 1:1: the ayah marker at position 2 is not the last word (3)',
    ]);
    expect(tamper((l) => (l.pages[0]!.t[0] = 'abc'))).toEqual([
      'page 1: word 1 has code point U+61 outside U+FC41–U+FCFC',
      'page 1: word 1 has code point U+62 outside U+FC41–U+FCFC',
      'page 1: word 1 has code point U+63 outside U+FC41–U+FCFC',
    ]);
    expect(tamper((l) => (l.pages[1]!.w = 7))).toEqual([
      'page 2: first word id 7, expected 6',
      'page 3: first word id 13, expected 14',
    ]);
    expect(tamper((l) => l.pages[0]!.l.push(0, 0, 0))).toEqual([
      'page 1 line 4: ayah line without words',
      'page 1: 4 lines, expected 3',
    ]);
    expect(tamper((l) => (l.pages[0]!.a[3] = 2))).toEqual(
      expect.arrayContaining([expect.stringMatching(/ayah runs account for 4 words but the page has 5/)]),
    );
    expect(tamper((l) => (l.wordCount = 9))).toEqual(['wordCount is 9 but the pages hold 24 glyphs']);
    expect(tamper((l) => (l.dataset = 'other'))).toEqual(['dataset is "other", expected "synth"']);
    expect(checkLayout(syntheticLayout, {...def, pages: 4})).toEqual(['3 pages, expected 4']);
    expect(checkLayout(syntheticLayout, {...def, linesOnPage: () => 4})).toEqual(['page 1: 3 lines, expected 4']);
  });
});

describe('the export readers', () => {
  it('accept the object-keyed and the array shape of the words export, and the alias field names', () => {
    const object = parseWordsExport({
      '1:1:1': {id: 1, surah: 1, ayah: 1, word: 1, location: '1:1:1', text: 'a'},
      '1:1:2': {id: 2, surah: 1, ayah: 1, word: 2, location: '1:1:2', text: ' b '},
    });
    expect([...object.values()]).toEqual([
      {wordId: 1, surah: 1, ayah: 1, position: 1, kind: 'word', text: 'a'},
      {wordId: 2, surah: 1, ayah: 1, position: 2, kind: 'end', text: 'b'},
    ]);
    const array = parseWordsExport([
      {word_index: '1', location: '1:1:1', code_v4: 'a', is_ayah_marker: 'false'},
      {word_index: 2, chapter_id: 1, verse_number: 1, word_position: 2, code_v4: 'b', is_ayah_marker: 'true'},
      {word_index: 3, location: '1:1:3', code_v4: 'c', is_ayah_marker: 0},
      {word_index: 4, location: '1:2:1', code_v4: 'd'},
    ]);
    // An explicit marker flag wins over the last-position rule; without one, the last word ends the ayah.
    expect([...array.values()].map((w) => w.kind)).toEqual(['word', 'end', 'word', 'end']);
    expect(() => parseWordsExport({})).toThrow(/empty object/);
    expect(() => parseWordsExport('nope')).toThrow(DataShapeError);
    expect(() => parseWordsExport([{id: 1, surah: 1}])).toThrow(/could not interpret entry 0/);
    expect(() =>
      parseWordsExport([
        {id: 1, location: '1:1:1', text: 'a'},
        {id: 1, location: '1:1:2', text: 'b'},
      ]),
    ).toThrow(/word id 1 appears twice/);
  });

  it('read the layout rows by column name and join them into the pages the compiler expects', () => {
    const rows = parseLayoutRows([
      {
        page_number: '1',
        line_number: 1,
        line_type: 'surah_name',
        is_centered: '',
        first_word_id: '',
        last_word_id: null,
        surah_number: 1,
        extra: 'ignored',
      },
      {
        page_number: 1,
        line_number: 2,
        line_type: 'ayah',
        is_centered: 'true',
        first_word_id: 1,
        last_word_id: 2,
        surah_number: '',
      },
    ]);
    expect(rows).toEqual([
      {page: 1, line: 1, type: 'surah_name', centered: true, first: null, last: null, surah: 1},
      {page: 1, line: 2, type: 'ayah', centered: true, first: 1, last: 2, surah: null},
    ]);
    expect(() => parseLayoutRows([])).toThrow(/no rows/);
    expect(() => parseLayoutRows([{page: 1}])).toThrow(/no "page_number" column \(columns: page\)/);
    expect(() => parseLayoutRows([{page_number: 1, line_number: '', line_type: 'ayah'}])).toThrow(
      /row 0 has no page, line or type/,
    );
    const words = parseWordsExport([
      {id: 1, location: '1:1:1', text: 'a'},
      {id: 2, location: '1:1:2', text: 'b'},
    ]);
    expect(joinExport(rows, words, {pages: 1})).toEqual([
      {
        page: 1,
        lines: [
          {line: 1, type: 'surah_name', centered: true, surah: 1, words: []},
          {line: 2, type: 'ayah', centered: true, words: [...words.values()]},
        ],
      },
    ]);
    expect(() => joinExport(rows, words, {pages: 2})).toThrow(/1 pages, expected 2/);
    // A page the print centres entirely is centred whatever the export flags (page 2 of the V4 export).
    const flaggedJustified = [rows[0]!, {...rows[1]!, centered: false}];
    expect(joinExport(flaggedJustified, words, null)[0]!.lines[1]!.centered).toBe(false);
    expect(joinExport(flaggedJustified, words, {pages: 1, centeredPages: [1]})[0]!.lines[1]!.centered).toBe(true);
    expect(joinExport(flaggedJustified, words, {pages: 1, centeredPages: [2]})[0]!.lines[1]!.centered).toBe(false);
    expect(() => joinExport([{...rows[1]!, last: 3}], words, null)).toThrow(
      /references word 3, missing from the words export/,
    );
    expect(() => joinExport([{...rows[1]!, type: 'footer'}], words, null)).toThrow(/unknown line_type "footer"/);
    expect(() => joinExport([{...rows[1]!, first: null}], words, null)).toThrow(/has no word range/);
    expect(() => joinExport([{...rows[0]!, surah: null}], words, null)).toThrow(/without a surah number/);
    expect(() => joinExport([{...rows[1]!, line: 3}], words, null)).toThrow(/line numbers are not 1\.\.n/);
  });

  it.skipIf(!existsSync(path.join(fixtures, 'layout.db')))(
    'rebuild the synthetic mushaf from its two export files, exactly as the compiler saw it',
    () => {
      const words = parseWordsExport(JSON.parse(readFileSync(path.join(fixtures, 'words.json'), 'utf8')));
      const rows = parseLayoutRows(
        readSqliteTable(new Uint8Array(readFileSync(path.join(fixtures, 'layout.db'))), 'pages')!,
      );
      const joined = joinExport(rows, words, def);
      expect(joined).toEqual(regularOnly());
      const layout = compileLayout(joined, def, meta);
      expect(layout).toEqual(compileLayoutJs(regularOnly(), SYNTH, meta));
      expect(checkLayout(layout, def)).toEqual([]);
    },
  );
});

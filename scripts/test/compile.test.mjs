import {describe, expect, it} from 'vitest';
import {parsePageHtml, QulParseError, decodeEntities} from '../lib/qul-html.mjs';
import {compileLayout, validateLayout, emitModule, expandPage, LayoutValidationError} from '../lib/compile.mjs';
import {QPC_V4} from '../lib/datasets.mjs';
import {SYNTH, SYNTH_PAGES, renderQulPageHtml} from './synthetic.mjs';

const compileSynthetic = () => compileLayout(SYNTH_PAGES, SYNTH, {source: 'test', generatedAt: '2026-01-01T00:00:00.000Z'});

describe('parsePageHtml', () => {
  it('round-trips the synthetic pages through QUL-shaped markup', () => {
    for (const page of SYNTH_PAGES) {
      const html = renderQulPageHtml(page);
      const parsed = parsePageHtml(html, page.page);
      expect(parsed).toEqual(page);
    }
  });

  it('decodes numeric entities and strips whitespace around glyphs', () => {
    expect(decodeEntities('&#xFC41;&#64578;&amp;')).toBe('ﱁﱂ&');
    const html = renderQulPageHtml(SYNTH_PAGES[0]).replace('ﱁ', '&#xFC41;');
    expect(parsePageHtml(html, 1).lines[1].words[0].text).toBe('ﱁ');
  });

  it('fails loudly on missing words, unknown char types and bad ordering', () => {
    const base = renderQulPageHtml(SYNTH_PAGES[0]);
    expect(() => parsePageHtml(base.replace('char-word', 'char-word word--missing'), 1)).toThrow(QulParseError);
    expect(() => parsePageHtml(base.replace('char-word', 'char-mystery'), 1)).toThrow(/unknown char type "mystery"/);
    // QUL ids are database row ids: an out-of-order id is data, not an error (the compiler reports it).
    expect(parsePageHtml(base.replace('data-word-id="2"', 'data-word-id="1"'), 1).lines[1].words.map((w) => w.wordId)).toEqual([1, 1, 3]);
    expect(() => parsePageHtml('<html><body>Login required</body></html>', 1)).toThrow(/does not look like a QUL page/);
    expect(() => parsePageHtml(base.replace('data-line="2"', 'data-line="9"'), 1)).toThrow(/line numbers are not 1\.\.n/);
  });

  it('accepts up to four code points per word and rejects more', () => {
    const four = renderQulPageHtml(SYNTH_PAGES[0]).replace(/>\s*ﱁ\s*</, '>ﱁﱂﱃﱄ<');
    expect(parsePageHtml(four, 1).lines[1].words[0].text).toBe('ﱁﱂﱃﱄ');
    const five = renderQulPageHtml(SYNTH_PAGES[0]).replace(/>\s*ﱁ\s*</, '>ﱁﱂﱃﱄﱅ<');
    expect(() => parsePageHtml(five, 1)).toThrow(/5 code points/);
  });

  it('drops trailing empty ayah lines (pages 1 and 2 render an empty ninth line) but no others', () => {
    const empty = (n) => `            <div class="line-container" data-line="${n}">\n              <div class="line" id="line-${n}">                </div>\n            </div>\n`;
    const base = renderQulPageHtml(SYNTH_PAGES[0]);
    const trailing = base.replace('          </div>\n    </div>', `${empty(4)}          </div>\n    </div>`);
    expect(trailing).not.toBe(base);
    expect(parsePageHtml(trailing, 1).lines).toHaveLength(3);
    const middle = base.replace('<div class="line-container" data-line="2">', `${empty(2)}<div class="line-container" data-line="4">`);
    expect(() => parsePageHtml(middle.replace('id="line-2"', 'id="line-4"'), 1)).toThrow(/line 2: ayah line without words/);
  });

  it('tolerates marker glyphs with arbitrary ids and missing locations', () => {
    const page = structuredClone(SYNTH_PAGES[2]);
    const html = renderQulPageHtml(page)
      .replace('data-word-id="9001"', 'data-word-id="83892"')
      .replace(/data-location="2:3:1"\s+data-ayah="2:3"\s+data-position="1"\s+data-id="909001"/, 'data-id="909001"');
    const parsed = parsePageHtml(html, 3);
    const marker = parsed.lines[0].words[2];
    expect(marker).toMatchObject({wordId: 83892, kind: 'rub-el-hizb', surah: 2, ayah: 2, position: 5}); // borrowed from the previous word
    expect(parsed.lines[0].words.map((w) => w.wordId)).toEqual([13, 14, 83892, 15]);
  });
});

describe('compileLayout + validateLayout', () => {
  it('compiles the synthetic mushaf into the packed format and validates', () => {
    const layout = compileSynthetic();
    expect(layout.format).toBe(1);
    expect(layout.wordCount).toBe(24);
    expect(layout.pages).toHaveLength(3);
    expect(layout.pages[0]).toEqual({w: 1, t: ['ﱁ', 'ﱂ', 'ﱃ', 'ﱄ', 'ﱅ'], k: 'wwewe', a: [1, 1, 1, 3, 1, 2, 1, 2], l: [1, 1, 1, 0, 1, 3, 0, 1, 2]});
    // Page 3 starts mid-ayah 2:2 at position 4 and carries the surah forward for its second header.
    expect(layout.pages[2].w).toBe(13);
    expect(layout.pages[2].a.slice(0, 4)).toEqual([2, 2, 4, 2]);
    expect(layout.pages[2].k).toBe('wehwwewewwwe');
    expect(layout.pages[1].l).toEqual([1, 1, 2, 2, 1, 2, 0, 0, 4, 0, 0, 3]);
    const report = validateLayout(layout, SYNTH);
    expect(report).toMatchObject({lines: 11, ayahLines: 7, surahNameLines: 3, basmallahLines: 1, centeredAyahLines: 3, words: 23, markerWords: 1, twoCodePointWords: 1, ayahs: 7, kinds: {word: 16, end: 7, 'rub-el-hizb': 1}});
    expect(report.codePointLengths).toEqual({1: 23, 2: 1});
  });

  it('numbers glyphs sequentially in reading order and reports QUL ids of markers', () => {
    const compileReport = {};
    const layout = compileLayout(SYNTH_PAGES, SYNTH, {source: 'test'}, compileReport);
    expect(compileReport).toMatchObject({regularWords: 23, markerWords: 1, codePointLengths: {1: 23, 2: 1}});
    expect(compileReport.markers).toEqual([{page: 3, line: 1, qulId: 9001, kind: 'rub-el-hizb', location: '2:3:1', text: 'ﱃ'}]);
    // The marker shares the location of the word it precedes; it gets a run of its own and the
    // regular words of 2:3 (positions 1..3 across two lines) form the next run.
    expect(layout.pages[2].a.slice(0, 12)).toEqual([2, 2, 4, 2, 2, 3, 1, 1, 2, 3, 1, 3]);
    expect(expandPage(layout, 3).lines[0].words.map((w) => w.wordId)).toEqual([13, 14, 15, 16]);
  });

  it('expands pages back into lines with locations and kinds', () => {
    const layout = compileSynthetic();
    const p3 = expandPage(layout, 3);
    expect(p3.lines[0].words.map((w) => w.location)).toEqual(['2:2:4', '2:2:5', '2:3:1', '2:3:1']);
    expect(p3.lines[0].words[2].kind).toBe('rub-el-hizb');
    expect(p3.lines[0].words[3].text).toBe('ﱄﱅ');
    expect(p3.lines[2]).toMatchObject({type: 'surah_name', surah: 3, centered: true});
  });

  it('detects broken reading order, wrong positions and structural mismatches', () => {
    const broken = structuredClone(SYNTH_PAGES);
    broken[1].lines[2].words[1].position = 7;
    expect(() => compileLayout(broken, SYNTH)).toThrow(/word 2:1:7 follows 2:1:1/);
    const backwards = structuredClone(SYNTH_PAGES);
    backwards[2].lines[3].words = backwards[2].lines[3].words.map((w) => ({...w, surah: 1, ayah: 3}));
    expect(() => compileLayout(backwards, SYNTH)).toThrow(/word 1:3:1 comes after 2:4:2/);
    const midAyah = structuredClone(SYNTH_PAGES);
    midAyah[2].lines[3].words = midAyah[2].lines[3].words.map((w) => ({...w, position: w.position + 1}));
    expect(() => compileLayout(midAyah, SYNTH)).toThrow(/ayah 3:1 starts at position 2/);

    // Out-of-order QUL ids are tolerated and reported.
    const oddIds = structuredClone(SYNTH_PAGES);
    oddIds[1].lines[2].words[1].wordId = 99;
    const idReport = {};
    compileLayout(oddIds, SYNTH, {}, idReport);
    expect(idReport.idOrderViolations).toEqual([{page: 2, line: 3, location: '2:1:3', qulId: 8, previousQulId: 99}]);

    const layout = compileSynthetic();
    const tampered = structuredClone(layout);
    tampered.pages[0].k = 'wwwwe'; // ayah 1:1 loses its end marker
    expect(() => validateLayout(tampered, SYNTH)).toThrow(/ayah 1:1: 0 end markers/);
    const split = structuredClone(layout);
    split.pages[0].a = [1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 3, 1, 1, 2, 2, 1]; // 1:1 resumes after 1:2 started
    expect(() => validateLayout(split, SYNTH)).toThrow(/ayah 1:1 is split by other ayahs/);
    const centred = structuredClone(layout);
    centred.pages[2].l[1] = 1; // page 3 line 1 (a full line followed by another ayah line) marked centred
    expect(() => validateLayout(centred, {...SYNTH, invariants: {...SYNTH.invariants, centeredAyahLines: 4}})).toThrow(/page 3 line 1: centred ayah line is not the last line of a surah \(next: page 3 line 2 ayah\)/);
    expect(validateLayout(layout, SYNTH).centeredAyahLineList).toEqual([
      {page: 1, line: 2, first: '1:1:1', words: 3},
      {page: 1, line: 3, first: '1:2:1', words: 2},
      {page: 3, line: 4, first: '3:1:1', words: 4},
    ]);

    const wrongCounts = {...SYNTH, invariants: {...SYNTH.invariants, words: 25}};
    expect(() => validateLayout(layout, wrongCounts)).toThrow(/words: 23, expected 25/);

    const wrongExpectation = {...SYNTH, expectations: [{page: 1, line: 2, lastLocation: '1:1:4'}]};
    expect(() => validateLayout(layout, wrongExpectation)).toThrow(/last word 1:1:3, expected 1:1:4/);

    const outOfRange = structuredClone(layout);
    outOfRange.pages[0].t[0] = 'A';
    expect(() => validateLayout(outOfRange, SYNTH)).toThrow(/code point U\+41 outside/);
  });

  it('emits an ASCII-only module whose string literal parses back to the layout', () => {
    const layout = compileSynthetic();
    const source = emitModule(layout);
    expect(/^[\x00-\x7f]*$/.test(source)).toBe(true);
    expect(source).toContain("import type {CompiledLayout} from './format';");
    const m = source.match(/JSON\.parse\('([\s\S]*)'\) as CompiledLayout/);
    expect(m).not.toBeNull();
    const literal = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    expect(JSON.parse(literal)).toEqual(layout);
  });

  it('describes the real V4 dataset with the numbers the plan relies on', () => {
    expect(QPC_V4.pages).toBe(604);
    expect(QPC_V4.linesOnPage(1)).toBe(8);
    expect(QPC_V4.linesOnPage(3)).toBe(15);
    expect(QPC_V4.invariants).toMatchObject({lines: 9046, ayahLines: 8820, surahNameLines: 114, basmallahLines: 112, centeredAyahLines: 30, words: 83668, ayahs: 6236});
    expect(QPC_V4.fontUrl('qpc-v4-tajweed', 10, 'ttf')).toBe('https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/ttf/p10.ttf?v=3.1');
    expect(QPC_V4.fontUrl('qpc-v4', 10, 'woff2')).toBe('https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2');
    expect(QPC_V4.previewUrl(19)).toBe('https://qul.tarteel.ai/mushaf_layouts/19?page_number=19');
  });
});

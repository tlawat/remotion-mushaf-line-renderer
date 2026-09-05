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
    expect(() => parsePageHtml(base.replace('data-word-id="2"', 'data-word-id="1"'), 1)).toThrow(/not in id order/);
    expect(() => parsePageHtml('<html><body>Login required</body></html>', 1)).toThrow(/does not look like a QUL page/);
    expect(() => parsePageHtml(base.replace('data-line="2"', 'data-line="9"'), 1)).toThrow(/line numbers are not 1\.\.n/);
  });

  it('rejects words with more than two code points', () => {
    const html = renderQulPageHtml(SYNTH_PAGES[0]).replace(/>\s*ﱁ\s*</, '>ﱁﱂﱃ<');
    expect(() => parsePageHtml(html, 1)).toThrow(/3 code points/);
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
    expect(report).toMatchObject({lines: 11, ayahLines: 7, surahNameLines: 3, basmallahLines: 1, centeredAyahLines: 3, words: 24, twoCodePointWords: 1, ayahs: 7, kinds: {word: 16, end: 7, 'rub-el-hizb': 1}});
  });

  it('expands pages back into lines with locations and kinds', () => {
    const layout = compileSynthetic();
    const p3 = expandPage(layout, 3);
    expect(p3.lines[0].words.map((w) => w.location)).toEqual(['2:2:4', '2:2:5', '2:3:1', '2:3:2']);
    expect(p3.lines[0].words[2].kind).toBe('rub-el-hizb');
    expect(p3.lines[0].words[3].text).toBe('ﱄﱅ');
    expect(p3.lines[2]).toMatchObject({type: 'surah_name', surah: 3, centered: true});
  });

  it('detects gaps in word ids, wrong positions and structural mismatches', () => {
    const broken = structuredClone(SYNTH_PAGES);
    broken[1].lines[2].words[1].wordId = 99;
    expect(() => compileLayout(broken, SYNTH)).toThrow(LayoutValidationError);

    const layout = compileSynthetic();
    const tampered = structuredClone(layout);
    tampered.pages[0].k = 'wwwwe'; // ayah 1:1 loses its end marker
    expect(() => validateLayout(tampered, SYNTH)).toThrow(/ayah 1:1: 0 end markers/);

    const wrongCounts = {...SYNTH, invariants: {...SYNTH.invariants, words: 25}};
    expect(() => validateLayout(layout, wrongCounts)).toThrow(/words: 24, expected 25/);

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
    expect(QPC_V4.invariants).toMatchObject({lines: 9046, ayahLines: 8820, surahNameLines: 114, basmallahLines: 112, centeredAyahLines: 29, words: 83668, ayahs: 6236});
    expect(QPC_V4.fontUrl('qpc-v4-tajweed', 10, 'ttf')).toBe('https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/ttf/p10.ttf?v=3.1');
    expect(QPC_V4.fontUrl('qpc-v4', 10, 'woff2')).toBe('https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4/woff2/p10.woff2');
    expect(QPC_V4.previewUrl(19)).toBe('https://qul.tarteel.ai/mushaf_layouts/19?page_number=19');
  });
});

// Compiles parsed QUL pages into the package's CompiledLayout format, validates every invariant
// the renderer relies on, and emits the ASCII-only TypeScript module.

import {KNOWN_KINDS} from './datasets.mjs';

export class LayoutValidationError extends Error {
  constructor(problems) {
    super(`Layout validation failed with ${problems.length} problem(s):\n - ${problems.join('\n - ')}`);
    this.problems = problems;
  }
}

/**
 * @param {Array<{page:number, lines:Array}>} parsedPages  one entry per page, any order
 * @param {{dataset:string, layoutId:number, pages:number, linesOnPage:(p:number)=>number}} def
 * @param {{source?:string, generatedAt?:string}} [meta]
 */
export const compileLayout = (parsedPages, def, meta = {}) => {
  const byPage = new Map(parsedPages.map((p) => [p.page, p]));
  const pages = [];
  let nextId = 1;
  let carriedSurah = 0;
  let wordCount = 0;
  const problems = [];

  for (let page = 1; page <= def.pages; page++) {
    const parsed = byPage.get(page);
    if (!parsed) {
      problems.push(`page ${page}: missing`);
      continue;
    }
    const t = [];
    const k = [];
    const a = [];
    const l = [];
    let run = null;
    for (const line of parsed.lines) {
      if (line.type === 'surah_name') {
        carriedSurah = line.surah;
        l.push(1, 1, line.surah);
        continue;
      }
      if (line.type === 'basmallah') {
        l.push(2, 1, carriedSurah);
        continue;
      }
      l.push(0, line.centered ? 1 : 0, line.words.length);
      for (const w of line.words) {
        if (w.wordId !== nextId) {
          problems.push(`page ${page} line ${line.line}: expected word id ${nextId}, got ${w.wordId} (${w.surah}:${w.ayah}:${w.position})`);
          nextId = w.wordId; // resynchronise so one gap does not cascade into thousands of messages
        }
        nextId++;
        t.push(w.text);
        k.push(KNOWN_KINDS[w.kind] ?? '?');
        if (run && run.surah === w.surah && run.ayah === w.ayah) {
          if (w.position !== run.firstPosition + run.count) {
            problems.push(`page ${page} line ${line.line}: word ${w.surah}:${w.ayah}:${w.position} breaks the position sequence`);
          }
          run.count++;
        } else {
          if (run) a.push(run.surah, run.ayah, run.firstPosition, run.count);
          run = {surah: w.surah, ayah: w.ayah, firstPosition: w.position, count: 1};
        }
      }
    }
    if (run) a.push(run.surah, run.ayah, run.firstPosition, run.count);
    wordCount += t.length;
    pages.push({w: t.length ? nextId - t.length : nextId, t, k: k.join(''), a, l});
  }
  if (problems.length) throw new LayoutValidationError(problems);

  return {
    format: 1,
    dataset: def.dataset,
    layoutId: def.layoutId,
    pages,
    wordCount,
    source: meta.source ?? 'qul',
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
  };
};

const LINE_TYPE = ['ayah', 'surah_name', 'basmallah'];

/** Expands a compiled page back into lines with words — used by validation and tests. */
export const expandPage = (layout, pageNumber) => {
  const page = layout.pages[pageNumber - 1];
  if (!page) throw new Error(`no page ${pageNumber}`);
  const runs = [];
  let cursor = 0;
  for (let i = 0; i < page.a.length; i += 4) {
    runs.push({surah: page.a[i], ayah: page.a[i + 1], firstPosition: page.a[i + 2], start: cursor, end: cursor + page.a[i + 3] - 1});
    cursor += page.a[i + 3];
  }
  const wordAt = (i) => {
    const run = runs.find((r) => i >= r.start && i <= r.end);
    if (!run) throw new Error(`page ${pageNumber}: word index ${i} outside every ayah run`);
    const position = run.firstPosition + (i - run.start);
    const kindChar = page.k[i];
    const kind = Object.keys(KNOWN_KINDS).find((name) => KNOWN_KINDS[name] === kindChar);
    return {wordId: page.w + i, surah: run.surah, ayah: run.ayah, position, kind, text: page.t[i], location: `${run.surah}:${run.ayah}:${position}`};
  };
  const lines = [];
  let wc = 0;
  for (let i = 0; i < page.l.length; i += 3) {
    const type = LINE_TYPE[page.l[i]];
    const centered = page.l[i + 1] === 1;
    const n = page.l[i + 2];
    if (type === 'ayah') {
      const words = [];
      for (let j = 0; j < n; j++) words.push(wordAt(wc + j));
      wc += n;
      lines.push({line: lines.length + 1, type, centered, words});
    } else {
      lines.push({line: lines.length + 1, type, centered, surah: n, words: []});
    }
  }
  return {page: pageNumber, lines, runs, wordCount: page.t.length};
};

/**
 * Validates a compiled layout against a dataset descriptor. Returns a report object; throws
 * LayoutValidationError when anything is off.
 */
export const validateLayout = (layout, def, {strictCounts = true} = {}) => {
  const problems = [];
  const report = {pages: layout.pages.length, lines: 0, ayahLines: 0, surahNameLines: 0, basmallahLines: 0, centeredAyahLines: 0, words: 0, twoCodePointWords: 0, kinds: {}, ayahs: 0};
  const inv = def.invariants ?? {};
  const cpMin = inv.codePointMin ?? 0xfc41;
  const cpMax = inv.codePointMax ?? 0xfcfc;

  if (layout.format !== 1) problems.push(`format is ${layout.format}, expected 1`);
  if (layout.dataset !== def.dataset) problems.push(`dataset is ${layout.dataset}, expected ${def.dataset}`);
  if (layout.pages.length !== def.pages) problems.push(`has ${layout.pages.length} pages, expected ${def.pages}`);

  const ayahState = new Map(); // "s:a" -> {count, ends, lastPositionSeen, endIsLast}
  let expectedNextId = 1;
  let lastSurahHeader = 0;

  for (let p = 1; p <= layout.pages.length; p++) {
    let expanded;
    try {
      expanded = expandPage(layout, p);
    } catch (e) {
      problems.push(String(e.message));
      continue;
    }
    const page = layout.pages[p - 1];
    if (page.w !== expectedNextId) problems.push(`page ${p}: first word id ${page.w}, expected ${expectedNextId}`);
    expectedNextId = page.w + page.t.length;
    if (page.k.length !== page.t.length) problems.push(`page ${p}: k has ${page.k.length} chars for ${page.t.length} words`);
    const expectedLines = def.linesOnPage(p);
    if (expanded.lines.length !== expectedLines) problems.push(`page ${p}: ${expanded.lines.length} lines, expected ${expectedLines}`);

    for (const line of expanded.lines) {
      report.lines++;
      if (line.type === 'ayah') {
        report.ayahLines++;
        if (line.centered) report.centeredAyahLines++;
        if (line.words.length === 0) problems.push(`page ${p} line ${line.line}: ayah line without words`);
      } else {
        if (!line.centered) problems.push(`page ${p} line ${line.line}: ${line.type} line must be centered`);
        if (line.type === 'surah_name') {
          report.surahNameLines++;
          if (line.surah !== lastSurahHeader + 1) problems.push(`page ${p} line ${line.line}: surah header ${line.surah} follows ${lastSurahHeader}`);
          lastSurahHeader = line.surah;
        } else {
          report.basmallahLines++;
          if (line.surah !== lastSurahHeader) problems.push(`page ${p} line ${line.line}: basmallah carries surah ${line.surah}, expected ${lastSurahHeader}`);
        }
      }
      for (const w of line.words) {
        report.words++;
        report.kinds[w.kind ?? '?'] = (report.kinds[w.kind ?? '?'] ?? 0) + 1;
        if (!w.kind) problems.push(`page ${p} line ${line.line}: word ${w.location} has unknown kind char`);
        const cps = Array.from(w.text).map((c) => c.codePointAt(0));
        if (cps.length < 1 || cps.length > 2) problems.push(`page ${p} line ${line.line}: word ${w.location} has ${cps.length} code points`);
        if (cps.length === 2) report.twoCodePointWords++;
        for (const cp of cps) {
          if (cp < cpMin || cp > cpMax) problems.push(`page ${p} line ${line.line}: word ${w.location} code point U+${cp.toString(16).toUpperCase()} outside U+${cpMin.toString(16).toUpperCase()}–U+${cpMax.toString(16).toUpperCase()}`);
        }
        const key = `${w.surah}:${w.ayah}`;
        let st = ayahState.get(key);
        if (!st) {
          st = {count: 0, ends: 0, lastPosition: 0, endPosition: 0};
          ayahState.set(key, st);
        }
        if (w.position !== st.lastPosition + 1) problems.push(`page ${p} line ${line.line}: word ${w.location} expected position ${st.lastPosition + 1}`);
        st.lastPosition = w.position;
        st.count++;
        if (w.kind === 'end') {
          st.ends++;
          st.endPosition = w.position;
        }
      }
    }
  }

  report.ayahs = ayahState.size;
  for (const [key, st] of ayahState) {
    if (st.ends !== 1) problems.push(`ayah ${key}: ${st.ends} end markers`);
    else if (st.endPosition !== st.lastPosition) problems.push(`ayah ${key}: end marker at position ${st.endPosition} is not the last word (${st.lastPosition})`);
  }
  if (layout.wordCount !== report.words) problems.push(`wordCount ${layout.wordCount} but ${report.words} words found`);

  if (strictCounts) {
    for (const key of ['lines', 'ayahLines', 'surahNameLines', 'basmallahLines', 'centeredAyahLines', 'words', 'ayahs']) {
      if (inv[key] !== undefined && report[key] !== inv[key]) problems.push(`${key}: ${report[key]}, expected ${inv[key]}`);
    }
  }

  for (const exp of def.expectations ?? []) {
    const page = layout.pages[exp.page - 1];
    if (!page) {
      problems.push(`expectation on page ${exp.page}: page missing`);
      continue;
    }
    let expanded;
    try {
      expanded = expandPage(layout, exp.page);
    } catch {
      continue;
    }
    const where = `page ${exp.page}${exp.line ? ` line ${exp.line}` : ''}`;
    if (exp.lines !== undefined && expanded.lines.length !== exp.lines) problems.push(`${where}: ${expanded.lines.length} lines, expected ${exp.lines}`);
    if (exp.allCentered && expanded.lines.some((l) => !l.centered)) problems.push(`${where}: not all lines centered`);
    if (exp.noBasmallah && expanded.lines.some((l) => l.type === 'basmallah')) problems.push(`${where}: unexpected basmallah line`);
    if (exp.surahNameLines !== undefined) {
      const n = expanded.lines.filter((l) => l.type === 'surah_name').length;
      if (n !== exp.surahNameLines) problems.push(`${where}: ${n} surah_name lines, expected ${exp.surahNameLines}`);
    }
    if (exp.line) {
      const line = expanded.lines[exp.line - 1];
      if (!line) {
        problems.push(`${where}: missing`);
        continue;
      }
      if (exp.type && line.type !== exp.type) problems.push(`${where}: type ${line.type}, expected ${exp.type}`);
      if (exp.surah !== undefined && line.surah !== exp.surah) problems.push(`${where}: surah ${line.surah}, expected ${exp.surah}`);
      if (exp.centered !== undefined && line.centered !== exp.centered) problems.push(`${where}: centered ${line.centered}, expected ${exp.centered}`);
      if (exp.firstLocation && line.words[0]?.location !== exp.firstLocation) problems.push(`${where}: first word ${line.words[0]?.location}, expected ${exp.firstLocation}`);
      if (exp.lastLocation && line.words.at(-1)?.location !== exp.lastLocation) problems.push(`${where}: last word ${line.words.at(-1)?.location}, expected ${exp.lastLocation}`);
      if (exp.lastKind && line.words.at(-1)?.kind !== exp.lastKind) problems.push(`${where}: last word kind ${line.words.at(-1)?.kind}, expected ${exp.lastKind}`);
    }
  }

  if (problems.length) throw new LayoutValidationError(problems);
  return report;
};

const escapeNonAscii = (s) => s.replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** Emits the generated TypeScript module: one ASCII string literal parsed with JSON.parse. */
export const emitModule = (layout) => {
  const json = JSON.stringify(layout);
  const ascii = escapeNonAscii(json);
  if (/[^\x00-\x7f]/.test(ascii)) throw new Error('emitModule: non-ASCII character survived escaping');
  const literal = ascii.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return [
    '// GENERATED by scripts/fetch-qul.mjs - do not edit by hand.',
    `// dataset ${layout.dataset} (QUL layout ${layout.layoutId}), ${layout.pages.length} pages, ${layout.wordCount} words, source ${layout.source}, generated ${layout.generatedAt}.`,
    '// Glyph texts are stored as \\uXXXX escapes so that no editor, formatter or Unicode normalisation can alter them.',
    "import type {CompiledLayout} from './format';",
    '',
    `export const layout = JSON.parse('${literal}') as CompiledLayout;`,
    '',
  ].join('\n');
};

// Compiles parsed QUL pages into the package's CompiledLayout format, validates every invariant
// the renderer relies on, and emits the ASCII-only TypeScript module.
//
// Word model: QUL's preview markup lists, in reading order, the regular words of the mushaf (kinds
// `word` and `end`, whose locations s:a:w run through every ayah in order, positions 1..n with the
// ayah marker last) plus standalone marker glyphs (kinds `pause`, `sajdah`, `rub-el-hizb`) whose
// positions follow no sequence. QUL's data-word-id is a database row id (usually increasing along
// the reading order, but re-created rows carry high ids), so it is only reported, never relied on.
// The compiled layout numbers every glyph sequentially in reading order (that number is the
// package's `wordId`).

import {KNOWN_KINDS} from './datasets.mjs';

export const REGULAR_KINDS = new Set(['word', 'end']);
export const MAX_CODE_POINTS = 4;
const MAX_PROBLEMS = 60;

export class LayoutValidationError extends Error {
  constructor(problems) {
    const shown = problems.slice(0, MAX_PROBLEMS);
    super(`Layout validation failed with ${problems.length} problem(s):\n - ${shown.join('\n - ')}${problems.length > shown.length ? `\n - … ${problems.length - shown.length} more` : ''}`);
    this.problems = problems;
  }
}

/**
 * @param {Array<{page:number, lines:Array}>} parsedPages  one entry per page, any order
 * @param {{dataset:string, layoutId:number, pages:number, linesOnPage:(p:number)=>number}} def
 * @param {{source?:string, generatedAt?:string}} [meta]
 * @param {object} [report]  filled with {markers, regularWords, markerWords, codePointLengths, idOrderViolations}
 */
export const compileLayout = (parsedPages, def, meta = {}, report = {}) => {
  const byPage = new Map(parsedPages.map((p) => [p.page, p]));
  const pages = [];
  let carriedSurah = 0;
  let wordCount = 0;
  const problems = [];
  const problem = (msg) => {
    if (problems.length < MAX_PROBLEMS) problems.push(msg);
  };
  const markers = [];
  const codePointLengths = {};
  const idOrderViolations = [];
  let regularWords = 0;
  let last = null; // last regular word {surah, ayah, position}
  let lastQulId = 0;

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
        const regular = REGULAR_KINDS.has(w.kind);
        const location = `${w.surah}:${w.ayah}:${w.position}`;
        if (regular) {
          regularWords++;
          // Reading order: within an ayah positions increase by one; a new ayah comes after the
          // previous one and starts at position 1.
          if (last && w.surah === last.surah && w.ayah === last.ayah) {
            if (w.position !== last.position + 1) problem(`page ${page} line ${line.line}: word ${location} follows ${last.surah}:${last.ayah}:${last.position}`);
          } else {
            if (last && (w.surah < last.surah || (w.surah === last.surah && w.ayah < last.ayah))) problem(`page ${page} line ${line.line}: word ${location} comes after ${last.surah}:${last.ayah}:${last.position}`);
            if (w.position !== 1) problem(`page ${page} line ${line.line}: ayah ${w.surah}:${w.ayah} starts at position ${w.position}`);
          }
          last = {surah: w.surah, ayah: w.ayah, position: w.position};
          if (w.wordId <= lastQulId) idOrderViolations.push({page, line: line.line, location, qulId: w.wordId, previousQulId: lastQulId});
          lastQulId = w.wordId;
        } else {
          markers.push({page, line: line.line, qulId: w.wordId, kind: w.kind, location: `${w.surah}:${w.ayah}:${w.position}`, text: w.text});
        }
        const cps = Array.from(w.text).length;
        codePointLengths[cps] = (codePointLengths[cps] ?? 0) + 1;
        t.push(w.text);
        k.push(KNOWN_KINDS[w.kind] ?? '?');
        // Ayah runs: consecutive regular words of one ayah with consecutive positions share a run;
        // a marker always gets a run of its own (its position follows no sequence).
        if (regular && run && !run.marker && run.surah === w.surah && run.ayah === w.ayah && w.position === run.firstPosition + run.count) {
          run.count++;
        } else {
          if (run) a.push(run.surah, run.ayah, run.firstPosition, run.count);
          run = {surah: w.surah, ayah: w.ayah, firstPosition: w.position, count: 1, marker: !regular};
        }
      }
    }
    if (run) a.push(run.surah, run.ayah, run.firstPosition, run.count);
    pages.push({w: wordCount + 1, t, k: k.join(''), a, l});
    wordCount += t.length;
  }
  report.markers = markers;
  report.regularWords = regularWords;
  report.markerWords = markers.length;
  report.codePointLengths = codePointLengths;
  report.idOrderViolations = idOrderViolations;
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
 * LayoutValidationError when anything is off. `words` in the report and in the descriptor's
 * invariants count regular words (kinds word/end); marker glyphs are reported as `markerWords`.
 */
export const validateLayout = (layout, def, {strictCounts = true} = {}) => {
  const problems = [];
  const report = {pages: layout.pages.length, lines: 0, ayahLines: 0, surahNameLines: 0, basmallahLines: 0, centeredAyahLines: 0, centeredAyahLineList: [], words: 0, markerWords: 0, twoCodePointWords: 0, codePointLengths: {}, kinds: {}, ayahs: 0};
  const allLines = []; // every line of the mushaf in order, for the centred-line rule
  const inv = def.invariants ?? {};
  const cpMin = inv.codePointMin ?? 0xfc41;
  const cpMax = inv.codePointMax ?? 0xfcfc;

  if (layout.format !== 1) problems.push(`format is ${layout.format}, expected 1`);
  if (layout.dataset !== def.dataset) problems.push(`dataset is ${layout.dataset}, expected ${def.dataset}`);
  if (layout.pages.length !== def.pages) problems.push(`has ${layout.pages.length} pages, expected ${def.pages}`);

  const ayahState = new Map(); // "s:a" -> {count, ends, lastPosition, endPosition}
  let expectedNextId = 1;
  let lastSurahHeader = 0;
  let totalWords = 0;
  let currentAyah = null; // {key, surah, ayah} of the regular word seen last

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
      allLines.push({page: p, ...line});
      if (line.type === 'ayah') {
        report.ayahLines++;
        if (line.centered) {
          report.centeredAyahLines++;
          report.centeredAyahLineList.push({page: p, line: line.line, first: line.words[0]?.location, words: line.words.length});
        }
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
        totalWords++;
        report.kinds[w.kind ?? '?'] = (report.kinds[w.kind ?? '?'] ?? 0) + 1;
        if (!w.kind) problems.push(`page ${p} line ${line.line}: word ${w.location} has unknown kind char`);
        const cps = Array.from(w.text).map((c) => c.codePointAt(0));
        if (cps.length < 1 || cps.length > MAX_CODE_POINTS) problems.push(`page ${p} line ${line.line}: word ${w.location} has ${cps.length} code points`);
        if (cps.length === 2) report.twoCodePointWords++;
        report.codePointLengths[cps.length] = (report.codePointLengths[cps.length] ?? 0) + 1;
        for (const cp of cps) {
          if (cp < cpMin || cp > cpMax) problems.push(`page ${p} line ${line.line}: word ${w.location} code point U+${cp.toString(16).toUpperCase()} outside U+${cpMin.toString(16).toUpperCase()}–U+${cpMax.toString(16).toUpperCase()}`);
        }
        if (!REGULAR_KINDS.has(w.kind)) {
          report.markerWords++;
          continue;
        }
        report.words++;
        const key = `${w.surah}:${w.ayah}`;
        let st = ayahState.get(key);
        if (!st) {
          st = {count: 0, ends: 0, lastPosition: 0, endPosition: 0};
          ayahState.set(key, st);
          if (currentAyah && (w.surah < currentAyah.surah || (w.surah === currentAyah.surah && w.ayah < currentAyah.ayah))) {
            problems.push(`page ${p} line ${line.line}: ayah ${key} comes after ${currentAyah.key}`);
          }
        } else if (currentAyah && currentAyah.key !== key) {
          problems.push(`page ${p} line ${line.line}: ayah ${key} is split by other ayahs`);
        }
        currentAyah = {key, surah: w.surah, ayah: w.ayah};
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

  // A centred ayah line is either on pages 1-2 or part of the short closing line(s) of a surah:
  // after the run of centred lines comes a surah header, or nothing (page 604 closes with two).
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    if (line.type !== 'ayah' || !line.centered || line.page <= 2) continue;
    let j = i + 1;
    while (j < allLines.length && allLines[j].type === 'ayah' && allLines[j].centered) j++;
    const next = allLines[j];
    if (next && next.type !== 'surah_name') problems.push(`page ${line.page} line ${line.line}: centred ayah line is not the last line of a surah (next: page ${next.page} line ${next.line} ${next.type})`);
  }

  report.ayahs = ayahState.size;
  for (const [key, st] of ayahState) {
    if (st.ends !== 1) problems.push(`ayah ${key}: ${st.ends} end markers`);
    else if (st.endPosition !== st.lastPosition) problems.push(`ayah ${key}: end marker at position ${st.endPosition} is not the last word (${st.lastPosition})`);
  }
  if (layout.wordCount !== totalWords) problems.push(`wordCount ${layout.wordCount} but ${totalWords} words found`);

  if (strictCounts) {
    for (const key of ['lines', 'ayahLines', 'surahNameLines', 'basmallahLines', 'centeredAyahLines', 'words', 'markerWords', 'ayahs']) {
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

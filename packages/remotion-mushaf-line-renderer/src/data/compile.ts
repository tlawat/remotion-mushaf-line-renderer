/**
 * Compiles parsed pages into the `CompiledLayout` the resolvers read — the same algorithm as
 * `scripts/lib/compile.mjs` (the dev tools keep the JavaScript one; a unit test holds the two to
 * identical output) — and checks a compiled layout structurally.
 *
 * Word model: the regular words of the mushaf (kinds `word` and `end`, whose locations s:a:w run
 * through every ayah in order, positions 1..n with the ayah marker last) plus, from page markup
 * only, standalone marker glyphs (kinds `pause`, `sajdah`, `rub-el-hizb`) whose positions follow
 * no sequence. Every glyph is numbered sequentially in reading order; that number is `wordId`.
 */

import type {MushafWordKind} from '../types';
import type {CompiledLayout, CompiledPage} from './format';
import type {ParsedPage} from './qul-export';

export type CompileDef = {
  readonly id: string;
  readonly layoutId: number;
  readonly pages: number;
  readonly linesOnPage: (page: number) => number;
};

export class LayoutProblemsError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    const shown = problems.slice(0, MAX_PROBLEMS);
    super(`${problems.length} problem(s) in the layout data:\n - ${shown.join('\n - ')}${problems.length > shown.length ? `\n - … ${problems.length - shown.length} more` : ''}`);
    this.name = 'LayoutProblemsError';
    this.problems = problems;
  }
}

const MAX_PROBLEMS = 60;
const MAX_CODE_POINTS = 4;
const CODE_POINT_MIN = 0xfc41;
const CODE_POINT_MAX = 0xfcfc;
const REGULAR: ReadonlySet<MushafWordKind> = new Set(['word', 'end']);
const KIND_CHAR: Readonly<Record<MushafWordKind, string>> = {word: 'w', end: 'e', pause: 'p', sajdah: 's', 'rub-el-hizb': 'h'};

type Run = {surah: number; ayah: number; firstPosition: number; count: number; marker: boolean};

export const compileLayout = (parsedPages: readonly ParsedPage[], def: CompileDef, meta: {readonly source: string; readonly generatedAt: string}): CompiledLayout => {
  const byPage = new Map(parsedPages.map((p) => [p.page, p]));
  const pages: CompiledPage[] = [];
  const problems: string[] = [];
  const problem = (message: string): void => {
    if (problems.length < MAX_PROBLEMS) problems.push(message);
  };
  let carriedSurah = 0;
  let wordCount = 0;
  let last: {surah: number; ayah: number; position: number} | null = null;

  for (let page = 1; page <= def.pages; page++) {
    const parsed = byPage.get(page);
    if (!parsed) {
      problems.push(`page ${page}: missing`);
      continue;
    }
    const t: string[] = [];
    const k: string[] = [];
    const a: number[] = [];
    const l: number[] = [];
    let run: Run | null = null;
    for (const line of parsed.lines) {
      if (line.type === 'surah_name') {
        carriedSurah = line.surah ?? 0;
        l.push(1, 1, carriedSurah);
        continue;
      }
      if (line.type === 'basmallah') {
        l.push(2, 1, carriedSurah);
        continue;
      }
      l.push(0, line.centered ? 1 : 0, line.words.length);
      for (const w of line.words) {
        const regular = REGULAR.has(w.kind);
        const location = `${w.surah}:${w.ayah}:${w.position}`;
        if (regular) {
          // Reading order: within an ayah positions increase by one; a new ayah comes after the
          // previous one and starts at position 1.
          if (last && w.surah === last.surah && w.ayah === last.ayah) {
            if (w.position !== last.position + 1) problem(`page ${page} line ${line.line}: word ${location} follows ${last.surah}:${last.ayah}:${last.position}`);
          } else {
            if (last && (w.surah < last.surah || (w.surah === last.surah && w.ayah < last.ayah))) problem(`page ${page} line ${line.line}: word ${location} comes after ${last.surah}:${last.ayah}:${last.position}`);
            if (w.position !== 1) problem(`page ${page} line ${line.line}: ayah ${w.surah}:${w.ayah} starts at position ${w.position}`);
          }
          last = {surah: w.surah, ayah: w.ayah, position: w.position};
        }
        t.push(w.text);
        k.push(KIND_CHAR[w.kind] ?? '?');
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
  if (problems.length) throw new LayoutProblemsError(problems);
  return {format: 1, dataset: def.id, layoutId: def.layoutId, pages, wordCount, source: meta.source, generatedAt: meta.generatedAt};
};

/**
 * The invariants the resolvers and the renderer rely on, checked on any compiled layout — from
 * the CDN, a mirror or a test. Structure only, never the exact counts of one publication, so a
 * corrected re-export keeps rendering: page count, lines per page, the sums the indexes need,
 * contiguous ids, reading order, one ayah marker per ayah at its last position, and glyph texts of
 * one to four code points in the fonts' private-use range. Returns the problems found, in reading
 * order, at most `MAX_PROBLEMS`.
 */
export const checkLayout = (layout: CompiledLayout, def: CompileDef): string[] => {
  const problems: string[] = [];
  const problem = (message: string): boolean => {
    if (problems.length < MAX_PROBLEMS) problems.push(message);
    return problems.length < MAX_PROBLEMS;
  };
  if (layout.format !== 1) problem(`format is ${String(layout.format)}, expected 1`);
  if (layout.dataset !== def.id) problem(`dataset is "${layout.dataset}", expected "${def.id}"`);
  if (layout.pages.length !== def.pages) problem(`${layout.pages.length} pages, expected ${def.pages}`);

  const ayahs = new Map<string, {lastPosition: number; ends: number; endPosition: number}>();
  let currentAyah: string | null = null;
  let previous: {surah: number; ayah: number} | null = null;
  let expectedFirstId = 1;
  let totalWords = 0;

  for (let p = 1; p <= layout.pages.length; p++) {
    const page = layout.pages[p - 1] as CompiledPage;
    const where = `page ${p}`;
    if (page.w !== expectedFirstId) problem(`${where}: first word id ${page.w}, expected ${expectedFirstId}`);
    expectedFirstId = page.w + page.t.length;
    if (page.k.length !== page.t.length) problem(`${where}: ${page.k.length} kind chars for ${page.t.length} words`);
    if (page.l.length % 3 !== 0 || page.a.length % 4 !== 0) {
      problem(`${where}: malformed line or run table`);
      continue;
    }
    // Lines: each accounts for its words; the page has the printed number of lines.
    let lineWords = 0;
    let lines = 0;
    for (let i = 0; i < page.l.length; i += 3) {
      const type = page.l[i];
      const n = page.l[i + 2] ?? 0;
      lines++;
      if (type === 0) {
        if (n === 0) problem(`${where} line ${lines}: ayah line without words`);
        lineWords += n;
      } else if (type !== 1 && type !== 2) {
        problem(`${where} line ${lines}: unknown line type ${String(type)}`);
      } else if (page.l[i + 1] !== 1) {
        problem(`${where} line ${lines}: ${type === 1 ? 'surah_name' : 'basmallah'} line must be centred`);
      }
    }
    if (lines !== def.linesOnPage(p)) problem(`${where}: ${lines} lines, expected ${def.linesOnPage(p)}`);
    if (lineWords !== page.t.length) problem(`${where}: lines account for ${lineWords} words but the page has ${page.t.length}`);
    // Runs: they cover the page's words, in reading order, one ayah at a time.
    let runWords = 0;
    for (let i = 0; i < page.a.length; i += 4) {
      const surah = page.a[i] ?? 0;
      const ayah = page.a[i + 1] ?? 0;
      const firstPosition = page.a[i + 2] ?? 0;
      const count = page.a[i + 3] ?? 0;
      if (count < 1 || surah < 1 || ayah < 1 || firstPosition < 1) problem(`${where}: malformed ayah run [${surah}, ${ayah}, ${firstPosition}, ${count}]`);
      for (let j = 0; j < count; j++) {
        const index = runWords + j;
        const kind = page.k[index];
        const text = page.t[index] ?? '';
        const codePoints = Array.from(text).map((c) => c.codePointAt(0) ?? 0);
        if (codePoints.length < 1 || codePoints.length > MAX_CODE_POINTS) problem(`${where}: word ${page.w + index} has ${codePoints.length} code points`);
        for (const cp of codePoints) {
          if (cp < CODE_POINT_MIN || cp > CODE_POINT_MAX) problem(`${where}: word ${page.w + index} has code point U+${cp.toString(16).toUpperCase()} outside U+FC41–U+FCFC`);
        }
        if (kind !== 'w' && kind !== 'e') {
          if (kind !== 'p' && kind !== 's' && kind !== 'h') problem(`${where}: word ${page.w + index} has unknown kind char "${String(kind)}"`);
          continue;
        }
        totalWords++;
        const position = firstPosition + j;
        const key = `${surah}:${ayah}`;
        let state = ayahs.get(key);
        if (!state) {
          if (previous && (surah < previous.surah || (surah === previous.surah && ayah < previous.ayah))) problem(`${where}: ayah ${key} comes after ${previous.surah}:${previous.ayah}`);
          state = {lastPosition: 0, ends: 0, endPosition: 0};
          ayahs.set(key, state);
        } else if (currentAyah !== key) {
          problem(`${where}: ayah ${key} is split by other ayahs`);
        }
        currentAyah = key;
        previous = {surah, ayah};
        if (position !== state.lastPosition + 1) problem(`${where}: word ${key}:${position} expected at position ${state.lastPosition + 1}`);
        state.lastPosition = position;
        if (kind === 'e') {
          state.ends++;
          state.endPosition = position;
        }
      }
      runWords += count;
    }
    if (runWords !== page.t.length) problem(`${where}: ayah runs account for ${runWords} words but the page has ${page.t.length}`);
  }
  for (const [key, state] of ayahs) {
    if (state.ends !== 1) {
      if (!problem(`ayah ${key}: ${state.ends} ayah markers`)) break;
    } else if (state.endPosition !== state.lastPosition) {
      if (!problem(`ayah ${key}: the ayah marker at position ${state.endPosition} is not the last word (${state.lastPosition})`)) break;
    }
  }
  const glyphs = layout.pages.reduce((n, page) => n + page.t.length, 0);
  if (layout.wordCount !== glyphs) problem(`wordCount is ${layout.wordCount} but the pages hold ${glyphs} glyphs`);
  if (totalWords === 0) problem('no words at all');
  return problems;
};

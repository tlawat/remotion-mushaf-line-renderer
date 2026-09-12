/**
 * Compiled layout format, built at runtime by `compile.ts` from QUL's exports (and by the same
 * algorithm in `scripts/lib/compile.mjs` for the dev tools) and consumed by `getMushafLine()`.
 *
 * The compiler numbers every glyph (regular words and standalone marker glyphs) sequentially in
 * reading order, so on a page the ids are contiguous and appear in line order (line 1 glyphs, then
 * line 2 glyphs, …) and ayah runs are consecutive id ranges in page order.
 *
 * Per page we therefore only store the first id, the glyph text per word, one kind character per
 * word, the ayah runs and the line descriptors; everything else is reconstructed.
 */

import type {MushafLineType, MushafWordKind} from '../types';

export type CompiledPage = {
  /** First word id on the page (sequential reading-order index, 1-based). */
  readonly w: number;
  /** Glyph text per word, index = wordId − w. Each entry is 1–4 code points in U+FC41–U+FCFC. */
  readonly t: readonly string[];
  /** One character per word: w = word, e = end (ayah marker), p = pause, s = sajdah, h = rub-el-hizb. */
  readonly k: string;
  /** Ayah runs in page order, flat quadruples: [surah, ayah, firstPositionInAyah, wordCount]. */
  readonly a: readonly number[];
  /**
   * Lines in page order, flat triples: [type, centered, n].
   * type 0 = ayah (n = word count), 1 = surah_name (n = surah number), 2 = basmallah (n = carried-forward surah).
   */
  readonly l: readonly number[];
};

export type CompiledLayout = {
  readonly format: 1;
  readonly dataset: string;
  readonly layoutId: number;
  /** pages[page − 1] */
  readonly pages: readonly CompiledPage[];
  readonly wordCount: number;
  readonly source: string;
  readonly generatedAt: string;
};

export type PageLineIndex = {
  readonly type: MushafLineType;
  readonly centered: boolean;
  /** Index into `t` of the first word, or −1 when the line has no words. */
  readonly first: number;
  /** Index into `t` of the last word (inclusive), or −1. */
  readonly last: number;
  readonly surahNumber?: number;
};

export type PageRun = {
  readonly surah: number;
  readonly ayah: number;
  readonly firstPosition: number;
  /** Index into `t` of the run's first word. */
  readonly start: number;
  /** Index into `t` of the run's last word (inclusive). */
  readonly end: number;
};

export type PageIndex = {
  readonly page: CompiledPage;
  readonly lines: readonly PageLineIndex[];
  readonly runs: readonly PageRun[];
};

const LINE_TYPES: readonly MushafLineType[] = ['ayah', 'surah_name', 'basmallah'];

export const KIND_BY_CHAR: Readonly<Record<string, MushafWordKind>> = {
  w: 'word',
  e: 'end',
  p: 'pause',
  s: 'sajdah',
  h: 'rub-el-hizb',
};

const indexCache = new WeakMap<CompiledLayout, Map<number, PageIndex>>();

/** Builds (and memoises per layout) the per-page index used by `getMushafLine()`. */
export const indexPage = (layout: CompiledLayout, page: number): PageIndex => {
  let perLayout = indexCache.get(layout);
  if (!perLayout) {
    perLayout = new Map();
    indexCache.set(layout, perLayout);
  }
  const cached = perLayout.get(page);
  if (cached) {
    return cached;
  }
  const compiled = layout.pages[page - 1];
  if (!compiled) {
    throw new Error(`Compiled layout "${layout.dataset}" has no page ${page}.`);
  }

  const lines: PageLineIndex[] = [];
  let cursor = 0;
  for (let i = 0; i < compiled.l.length; i += 3) {
    const type = LINE_TYPES[compiled.l[i] ?? -1];
    const centered = compiled.l[i + 1] === 1;
    const n = compiled.l[i + 2] ?? 0;
    if (!type) {
      throw new Error(`Compiled layout "${layout.dataset}" page ${page}: unknown line type ${compiled.l[i]}.`);
    }
    if (type === 'ayah') {
      lines.push({type, centered, first: n > 0 ? cursor : -1, last: n > 0 ? cursor + n - 1 : -1});
      cursor += n;
    } else {
      lines.push({type, centered, first: -1, last: -1, surahNumber: n});
    }
  }
  if (cursor !== compiled.t.length) {
    throw new Error(
      `Compiled layout "${layout.dataset}" page ${page}: lines account for ${cursor} words but the page has ${compiled.t.length}.`,
    );
  }

  const runs: PageRun[] = [];
  let runCursor = 0;
  for (let i = 0; i < compiled.a.length; i += 4) {
    const count = compiled.a[i + 3] ?? 0;
    runs.push({
      surah: compiled.a[i] ?? 0,
      ayah: compiled.a[i + 1] ?? 0,
      firstPosition: compiled.a[i + 2] ?? 1,
      start: runCursor,
      end: runCursor + count - 1,
    });
    runCursor += count;
  }
  if (runCursor !== compiled.t.length) {
    throw new Error(
      `Compiled layout "${layout.dataset}" page ${page}: ayah runs account for ${runCursor} words but the page has ${compiled.t.length}.`,
    );
  }

  const index: PageIndex = {page: compiled, lines, runs};
  perLayout.set(page, index);
  return index;
};

/** Sort key of an ayah, also its identity in the ayah index (ayahs never exceed 286 per surah). */
export const ayahKey = (surah: number, ayah: number): number => surah * 1000 + ayah;

const ayahIndexCache = new WeakMap<CompiledLayout, Map<number, number>>();

/**
 * `ayahKey(surah, ayah)` → the first page that carries a word of that ayah, built in one pass over
 * the compiled ayah runs (6,236 entries) and memoised per layout. Lets callers ask for a surah or an
 * ayah range without knowing which page it starts on.
 */
export const indexAyahs = (layout: CompiledLayout): ReadonlyMap<number, number> => {
  const cached = ayahIndexCache.get(layout);
  if (cached) return cached;
  const pageOf = new Map<number, number>();
  for (let page = 1; page <= layout.pages.length; page++) {
    const a = (layout.pages[page - 1] as CompiledPage).a;
    for (let i = 0; i < a.length; i += 4) {
      const key = ayahKey(a[i] as number, a[i + 1] as number);
      if (!pageOf.has(key)) pageOf.set(key, page);
    }
  }
  ayahIndexCache.set(layout, pageOf);
  return pageOf;
};

/** Binary search for the ayah run containing word index `i` (index into `t`). */
export const runAt = (index: PageIndex, i: number): PageRun => {
  const {runs} = index;
  let lo = 0;
  let hi = runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const run = runs[mid] as PageRun;
    if (i < run.start) {
      hi = mid - 1;
    } else if (i > run.end) {
      lo = mid + 1;
    } else {
      return run;
    }
  }
  throw new Error(`No ayah run contains word index ${i}.`);
};

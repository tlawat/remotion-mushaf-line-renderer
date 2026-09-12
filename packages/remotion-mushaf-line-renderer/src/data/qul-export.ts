/**
 * Reads QUL's two raw exports into parsed pages — the same structure `scripts/lib/qul-export.mjs`
 * produces for the dev tools, so the compiler has one input shape:
 *
 * - the words of the script as JSON: an object keyed `surah:ayah:word` (or an array) of
 *   `{id, surah, ayah, word, location, text}`, with the alias field names QUL has used over time;
 * - the line layout: rows of the `pages` table, `page_number, line_number, line_type, is_centered,
 *   first_word_id, last_word_id, surah_number`, inclusive word-id ranges, empty cells `''` or NULL.
 *
 * Kinds are not part of the exports: the ayah marker (`end`) is the last word of each ayah,
 * everything else is `word`. Standalone pause/sajdah/hizb marks would need QUL's page markup, which
 * the printed V4 layout does not use.
 */

import type {MushafWordKind} from '../types';
import type {SqliteValue} from './sqlite';

export type ParsedWord = {
  readonly wordId: number;
  readonly surah: number;
  readonly ayah: number;
  readonly position: number;
  readonly kind: MushafWordKind;
  readonly text: string;
};

export type ParsedLine = {
  readonly line: number;
  readonly type: 'ayah' | 'surah_name' | 'basmallah';
  readonly centered: boolean;
  /** `surah_name` lines only. */
  readonly surah?: number;
  readonly words: readonly ParsedWord[];
};

export type ParsedPage = {
  readonly page: number;
  readonly lines: readonly ParsedLine[];
};

export type LayoutRow = {
  readonly page: number;
  readonly line: number;
  readonly type: string;
  readonly centered: boolean;
  readonly first: number | null;
  readonly last: number | null;
  readonly surah: number | null;
};

export class DataShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataShapeError';
  }
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' || typeof value === 'boolean' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

const pick = (row: Record<string, unknown>, ...names: readonly string[]): unknown => {
  for (const name of names) if (row[name] !== undefined) return row[name];
  return undefined;
};

const truthy = (value: unknown): boolean => value === true || value === 1 || value === '1' || (typeof value === 'string' && value.toLowerCase() === 'true');

const preview = (value: unknown): string => {
  try {
    return JSON.stringify(value)?.slice(0, 160) ?? String(value);
  } catch {
    return String(value);
  }
};

/** Words by QUL id, kinds derived: `end` for the last position of each ayah (or an explicit marker flag). */
export const parseWordsExport = (json: unknown): Map<number, ParsedWord> => {
  const rows: unknown[] = Array.isArray(json) ? json : json !== null && typeof json === 'object' ? Object.values(json as Record<string, unknown>) : [];
  if (rows.length === 0) throw new DataShapeError(`the words export is ${Array.isArray(json) ? 'an empty array' : json !== null && typeof json === 'object' ? 'an empty object' : `not an object (${preview(json)})`}`);
  const words = new Map<number, {wordId: number; surah: number; ayah: number; position: number; text: string; explicitEnd: boolean | undefined}>();
  rows.forEach((row, index) => {
    if (row === null || typeof row !== 'object') throw new DataShapeError(`words export: entry ${index} is not an object (${preview(row)})`);
    const r = row as Record<string, unknown>;
    const id = num(pick(r, 'id', 'word_index', 'word_number_all', 'word_id'));
    let surah = num(pick(r, 'surah', 'surah_number', 'chapter_id'));
    let ayah = num(pick(r, 'ayah', 'ayah_number', 'verse_number'));
    let position = num(pick(r, 'word', 'position', 'word_number', 'word_position'));
    const location = r.location;
    if (typeof location === 'string' && /^\d+:\d+:\d+$/.test(location)) {
      const [s, a, w] = location.split(':').map(Number) as [number, number, number];
      surah ??= s;
      ayah ??= a;
      position ??= w;
    }
    const text = String(pick(r, 'text', 'code_v4', 'code_v2', 'qpc_v4') ?? '').replace(/\s+/gu, '');
    if (id === null || surah === null || ayah === null || position === null || text === '') {
      throw new DataShapeError(`words export: could not interpret entry ${index} (${preview(row)}); expected id, surah, ayah, word/position (or location) and text`);
    }
    if (words.has(id)) throw new DataShapeError(`words export: word id ${id} appears twice`);
    const marker = pick(r, 'is_ayah_marker');
    words.set(id, {wordId: id, surah, ayah, position, text, explicitEnd: marker === undefined ? undefined : truthy(marker)});
  });
  const lastPosition = new Map<string, number>();
  for (const w of words.values()) {
    const key = `${w.surah}:${w.ayah}`;
    lastPosition.set(key, Math.max(lastPosition.get(key) ?? 0, w.position));
  }
  const out = new Map<number, ParsedWord>();
  for (const w of words.values()) {
    const isEnd = w.explicitEnd ?? w.position === lastPosition.get(`${w.surah}:${w.ayah}`);
    out.set(w.wordId, {wordId: w.wordId, surah: w.surah, ayah: w.ayah, position: w.position, kind: isEnd ? 'end' : 'word', text: w.text});
  }
  return out;
};

const REQUIRED_COLUMNS = ['page_number', 'line_number', 'line_type'] as const;

/** The `pages` rows in the shape the join reads, `''` and NULL alike meaning "no value". */
export const parseLayoutRows = (rows: readonly Readonly<Record<string, SqliteValue | unknown>>[]): LayoutRow[] => {
  if (rows.length === 0) throw new DataShapeError('the layout export has no rows');
  const columns = Object.keys(rows[0] as object);
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.includes(column)) throw new DataShapeError(`the layout export has no "${column}" column (columns: ${columns.join(', ') || 'none'})`);
  }
  return rows.map((row, index) => {
    const r = row as Record<string, unknown>;
    const page = num(r.page_number);
    const line = num(r.line_number);
    const type = r.line_type;
    if (page === null || line === null || typeof type !== 'string' || type === '') throw new DataShapeError(`layout export: row ${index} has no page, line or type (${preview(row)})`);
    const centered = num(r.is_centered) === 1 || truthy(r.is_centered) || type !== 'ayah';
    return {page, line, type, centered, first: num(r.first_word_id), last: num(r.last_word_id), surah: num(r.surah_number)};
  });
};

export type JoinDef = {
  readonly pages: number;
};

/** Lines with their words, page by page — `readLayoutSqlite` of the dev tools, exactly. */
export const joinExport = (rows: readonly LayoutRow[], words: ReadonlyMap<number, ParsedWord>, def: JoinDef | null): ParsedPage[] => {
  const pages = new Map<number, {page: number; lines: ParsedLine[]}>();
  for (const r of rows) {
    let entry = pages.get(r.page);
    if (!entry) {
      entry = {page: r.page, lines: []};
      pages.set(r.page, entry);
    }
    if (r.type === 'surah_name') {
      if (r.surah === null) throw new DataShapeError(`layout export: page ${r.page} line ${r.line} is a surah_name line without a surah number`);
      entry.lines.push({line: r.line, type: 'surah_name', centered: true, surah: r.surah, words: []});
    } else if (r.type === 'basmallah') {
      entry.lines.push({line: r.line, type: 'basmallah', centered: true, words: []});
    } else if (r.type === 'ayah') {
      if (r.first === null || r.last === null) throw new DataShapeError(`layout export: page ${r.page} line ${r.line} has no word range`);
      if (r.last < r.first) throw new DataShapeError(`layout export: page ${r.page} line ${r.line} runs from word ${r.first} to ${r.last}`);
      const lineWords: ParsedWord[] = [];
      for (let id = r.first; id <= r.last; id++) {
        const w = words.get(id);
        if (!w) throw new DataShapeError(`layout export: page ${r.page} line ${r.line} references word ${id}, missing from the words export`);
        lineWords.push(w);
      }
      entry.lines.push({line: r.line, type: 'ayah', centered: r.centered, words: lineWords});
    } else {
      throw new DataShapeError(`layout export: unknown line_type "${r.type}" on page ${r.page}`);
    }
  }
  const out = [...pages.values()].sort((a, b) => a.page - b.page);
  for (const p of out) {
    p.lines.sort((a, b) => a.line - b.line);
    p.lines.forEach((l, i) => {
      if (l.line !== i + 1) throw new DataShapeError(`layout export: page ${p.page} line numbers are not 1..n (${p.lines.map((x) => x.line).join(', ')})`);
    });
  }
  if (def && out.length !== def.pages) throw new DataShapeError(`layout export: ${out.length} pages, expected ${def.pages}`);
  return out;
};

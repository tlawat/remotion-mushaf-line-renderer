// Reads an official QUL export (account-gated downloads) into the same parsed-page structure that
// the HTML parser produces, so the compiler has one input shape.
//
//   --layout-sqlite <file>   SQLite with table `pages(page_number, line_number, line_type, is_centered,
//                            first_word_id, last_word_id, surah_number)` (QUL's mushaf-layout export;
//                            empty cells are stored as '' rather than NULL).
//   --words <file>           word-by-word script export as .json (array of {id|word_index, surah, ayah,
//                            word|position, location?, text}), .csv with those headers, or a SQLite file
//                            with a `words` table.
//
// Char types are not part of the word exports: the ayah marker (`end`) is the last word of each ayah,
// everything else is `word`. Standalone pause/sajdah/hizb marks would need the HTML input mode.

import fs from 'node:fs';
import path from 'node:path';

const openDb = async (file) => {
  const {DatabaseSync} = await import('node:sqlite');
  return new DatabaseSync(file, {readOnly: true});
};

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
};

const normaliseWord = (row) => {
  const id = num(row.id ?? row.word_index ?? row.word_number_all ?? row.word_id);
  let surah = num(row.surah ?? row.surah_number ?? row.chapter_id);
  let ayah = num(row.ayah ?? row.ayah_number ?? row.verse_number);
  let position = num(row.word ?? row.position ?? row.word_number ?? row.word_position);
  if (typeof row.location === 'string' && /^\d+:\d+:\d+$/.test(row.location)) {
    const [s, a, w] = row.location.split(':').map(Number);
    surah ??= s;
    ayah ??= a;
    position ??= w;
  }
  const text = String(row.text ?? row.code_v4 ?? row.code_v2 ?? row.qpc_v4 ?? '');
  if (!id || !surah || !ayah || !position || !text) return null;
  const marker = row.is_ayah_marker;
  const isMarker = marker === true || marker === 1 || marker === '1' || marker === 'true' || marker === 'TRUE';
  return {wordId: id, surah, ayah, position, text: text.replace(/\s+/gu, ''), explicitEnd: isMarker ? true : undefined};
};

export const readWords = async (file) => {
  const ext = path.extname(file).toLowerCase();
  let rows;
  if (ext === '.json') {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    rows = Array.isArray(parsed) ? parsed : Object.values(parsed);
  } else if (ext === '.csv') {
    rows = parseCsv(fs.readFileSync(file, 'utf8'));
  } else {
    const db = await openDb(file);
    const cols = db
      .prepare('PRAGMA table_info(words)')
      .all()
      .map((c) => c.name);
    if (!cols.length) throw new Error(`${file}: no "words" table`);
    rows = db.prepare('SELECT * FROM words').all();
    db.close();
  }
  const words = new Map();
  for (const row of rows) {
    const w = normaliseWord(row);
    if (!w) throw new Error(`words: could not interpret row ${JSON.stringify(row).slice(0, 200)}`);
    words.set(w.wordId, w);
  }
  // Derive kinds: `end` = last position of each ayah (or explicit marker flag).
  const lastPosition = new Map();
  for (const w of words.values()) {
    const key = `${w.surah}:${w.ayah}`;
    lastPosition.set(key, Math.max(lastPosition.get(key) ?? 0, w.position));
  }
  for (const w of words.values()) {
    const isEnd = w.explicitEnd ?? w.position === lastPosition.get(`${w.surah}:${w.ayah}`);
    w.kind = isEnd ? 'end' : 'word';
    delete w.explicitEnd;
  }
  return words;
};

/**
 * @param def  the dataset descriptor: its `centeredPages` are centred whatever the export says;
 *             its page count is checked unless `expectPageCount` is false (a subset run). Null
 *             applies neither.
 */
export const readLayoutSqlite = async (file, words, def, {expectPageCount = true} = {}) => {
  const db = await openDb(file);
  const rows = db
    .prepare(
      'SELECT page_number, line_number, line_type, is_centered, first_word_id, last_word_id, surah_number FROM pages ORDER BY page_number, line_number',
    )
    .all();
  db.close();
  const pages = new Map();
  const centeredPages = def?.centeredPages ?? [];
  for (const r of rows) {
    const page = num(r.page_number);
    if (!pages.has(page)) pages.set(page, {page, lines: []});
    const lines = pages.get(page).lines;
    const type = String(r.line_type);
    const centered =
      num(r.is_centered) === 1 ||
      String(r.is_centered).toLowerCase() === 'true' ||
      type !== 'ayah' ||
      centeredPages.includes(page);
    if (type === 'surah_name') {
      lines.push({line: num(r.line_number), type, centered: true, surah: num(r.surah_number), words: []});
    } else if (type === 'basmallah') {
      lines.push({line: num(r.line_number), type, centered: true, words: []});
    } else if (type === 'ayah') {
      const first = num(r.first_word_id);
      const last = num(r.last_word_id);
      if (first === null || last === null)
        throw new Error(`pages.db: page ${page} line ${r.line_number} has no word range`);
      const lineWords = [];
      for (let id = first; id <= last; id++) {
        const w = words.get(id);
        if (!w)
          throw new Error(
            `pages.db: page ${page} line ${r.line_number} references word ${id}, missing from the words export`,
          );
        lineWords.push({wordId: id, surah: w.surah, ayah: w.ayah, position: w.position, kind: w.kind, text: w.text});
      }
      lines.push({line: num(r.line_number), type, centered, words: lineWords});
    } else {
      throw new Error(`pages.db: unknown line_type "${type}" on page ${page}`);
    }
  }
  const out = [...pages.values()].sort((a, b) => a.page - b.page);
  for (const p of out) {
    p.lines.sort((a, b) => a.line - b.line);
    p.lines.forEach((l, i) => {
      if (l.line !== i + 1) throw new Error(`pages.db: page ${p.page} line numbers are not 1..n`);
    });
  }
  if (def && expectPageCount && out.length !== def.pages)
    throw new Error(`pages.db: ${out.length} pages, expected ${def.pages}`);
  return out;
};

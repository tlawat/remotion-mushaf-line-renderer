#!/usr/bin/env node
// Writes the synthetic mushaf (scripts/test/synthetic.mjs) in the shapes of QUL's two exports —
// a words JSON keyed "surah:ayah:word" and a layout SQLite with the `pages` table — into
// packages/remotion-mushaf-line-renderer/test/fixtures/data/synthetic/, for the unit tests of the
// package's runtime readers. Committed; re-run this script when synthetic.mjs changes (Node >= 22.13).
//
// The exports carry regular words only, so the synthetic rub-el-hizb marker glyph is left out and
// its line's word range runs over the regular ids around it. Empty cells are written as '' (the way
// QUL's export stores them) except one NULL, so both spellings are exercised; the table has an
// `id INTEGER PRIMARY KEY` so the rowid alias is exercised too, and an `info` table like QUL's.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SYNTH, SYNTH_PAGES} from './synthetic.mjs';

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../packages/remotion-mushaf-line-renderer/test/fixtures/data/synthetic',
);
fs.mkdirSync(out, {recursive: true});

const words = {};
for (const page of SYNTH_PAGES) {
  for (const line of page.lines) {
    for (const w of line.words) {
      if (w.kind !== 'word' && w.kind !== 'end') continue;
      words[`${w.surah}:${w.ayah}:${w.position}`] = {
        id: w.wordId,
        surah: w.surah,
        ayah: w.ayah,
        word: w.position,
        location: `${w.surah}:${w.ayah}:${w.position}`,
        text: w.text,
      };
    }
  }
}
fs.writeFileSync(path.join(out, 'words.json'), JSON.stringify(words, null, 1) + '\n');

const {DatabaseSync} = await import('node:sqlite');
const dbFile = path.join(out, 'layout.db');
fs.rmSync(dbFile, {force: true});
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA page_size = 512');
db.exec('CREATE TABLE info (name TEXT, number_of_pages INTEGER, lines_per_page INTEGER, font_name TEXT)');
db.exec(
  'CREATE TABLE pages (id INTEGER PRIMARY KEY, page_number INTEGER, line_number INTEGER, line_type TEXT, is_centered INTEGER, first_word_id INTEGER, last_word_id INTEGER, surah_number INTEGER)',
);
db.prepare('INSERT INTO info VALUES (?, ?, ?, ?)').run('synthetic', SYNTH.pages, SYNTH.linesPerPage, 'synthetic');
const insert = db.prepare(
  'INSERT INTO pages (page_number, line_number, line_type, is_centered, first_word_id, last_word_id, surah_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
);
let wroteNull = false;
for (const page of SYNTH_PAGES) {
  for (const line of page.lines) {
    if (line.type === 'ayah') {
      const regular = line.words.filter((w) => w.kind === 'word' || w.kind === 'end');
      insert.run(page.page, line.line, 'ayah', line.centered ? 1 : 0, regular[0].wordId, regular.at(-1).wordId, '');
    } else {
      // One header row with NULL cells, the others with '' — QUL's export writes '' but the reader must take both.
      const empty = wroteNull ? '' : null;
      wroteNull = true;
      insert.run(page.page, line.line, line.type, 1, empty, empty, line.type === 'surah_name' ? line.surah : '');
    }
  }
}
db.close();
console.log(
  `wrote ${path.relative(process.cwd(), out)}/words.json (${Object.keys(words).length} words) and layout.db (${fs.statSync(dbFile).size} bytes)`,
);

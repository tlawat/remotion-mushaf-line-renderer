import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {isSqlite, parseCreateTable, readSqliteTable, SqliteError} from '../../src/data/sqlite';

type DatabaseSyncCtor = new (
  file: string,
) => {
  exec: (sql: string) => void;
  prepare: (sql: string) => {run: (...args: unknown[]) => unknown; all: () => unknown[]};
  close: () => void;
};
let DatabaseSync: DatabaseSyncCtor | null = null;
try {
  DatabaseSync = ((await import('node:sqlite')) as unknown as {DatabaseSync: DatabaseSyncCtor}).DatabaseSync;
} catch {
  DatabaseSync = null; // Node < 22.13: the fixture-based tests below still run
}

const fixture = path.resolve(__dirname, '../fixtures/data/synthetic/layout.db');

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mushaf-sqlite-'));
});
afterAll(() => {
  rmSync(dir, {recursive: true, force: true});
});

/** Builds a database with node:sqlite and returns its bytes plus what SQLite itself reads back. */
const build = (
  name: string,
  setup: (db: InstanceType<DatabaseSyncCtor>) => void,
  query: string,
): {bytes: Uint8Array; expected: unknown[]} => {
  const file = path.join(dir, `${name}.db`);
  const db = new (DatabaseSync as DatabaseSyncCtor)(file);
  setup(db);
  const expected = db.prepare(query).all();
  db.close();
  return {bytes: new Uint8Array(readFileSync(file)), expected};
};

describe('CREATE TABLE parsing', () => {
  it('names the columns, quoted or not, and finds the rowid alias', () => {
    expect(parseCreateTable('CREATE TABLE pages (page_number INTEGER, line_number INTEGER, line_type TEXT)')).toEqual({
      columns: ['page_number', 'line_number', 'line_type'],
      rowidAlias: -1,
      withoutRowid: false,
    });
    expect(
      parseCreateTable(
        'CREATE TABLE "pages" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, [page number] int, `line` varchar(255) NOT NULL DEFAULT \'a,b\', "quoted ""x""" text, CONSTRAINT c UNIQUE (page_number, line_number))',
      ),
    ).toEqual({
      columns: ['id', 'page number', 'line', 'quoted "x"'],
      rowidAlias: 0,
      withoutRowid: false,
    });
    expect(parseCreateTable('CREATE TABLE t (a INT PRIMARY KEY, b INTEGER, PRIMARY KEY (b))').rowidAlias).toBe(1);
    expect(parseCreateTable('CREATE TABLE t (a INT PRIMARY KEY, b TEXT)').rowidAlias).toBe(-1);
    expect(parseCreateTable('CREATE TABLE t (a INTEGER PRIMARY KEY DESC, b TEXT)').rowidAlias).toBe(-1);
    expect(parseCreateTable('CREATE TABLE t (a INTEGER PRIMARY KEY, b TEXT) WITHOUT ROWID')).toMatchObject({
      rowidAlias: -1,
      withoutRowid: true,
    });
    expect(() => parseCreateTable('CREATE TABLE t')).toThrow(SqliteError);
  });
});

describe('the committed synthetic export', () => {
  it.skipIf(!existsSync(fixture))(
    'reads the pages table with the rowid alias, empty strings and NULLs as stored',
    () => {
      const bytes = new Uint8Array(readFileSync(fixture));
      expect(isSqlite(bytes)).toBe(true);
      const rows = readSqliteTable(bytes, 'pages')!;
      expect(rows).toHaveLength(11);
      expect(rows[0]).toEqual({
        id: 1,
        page_number: 1,
        line_number: 1,
        line_type: 'surah_name',
        is_centered: 1,
        first_word_id: null,
        last_word_id: null,
        surah_number: 1,
      });
      expect(rows[1]).toEqual({
        id: 2,
        page_number: 1,
        line_number: 2,
        line_type: 'ayah',
        is_centered: 1,
        first_word_id: 1,
        last_word_id: 3,
        surah_number: '',
      });
      expect(rows[4]).toMatchObject({line_type: 'basmallah', first_word_id: '', last_word_id: '', surah_number: ''});
      expect(readSqliteTable(bytes, 'INFO')).toEqual([
        {name: 'synthetic', number_of_pages: 3, lines_per_page: 4, font_name: 'synthetic'},
      ]);
      expect(readSqliteTable(bytes, 'words')).toBeNull();
    },
  );
});

describe.skipIf(DatabaseSync === null)('the b-tree walk against node:sqlite', () => {
  it('reads every row of a multi-level table with overflowing records and every value type', () => {
    const long = 'ع'.repeat(3000); // ~6 KB of UTF-8: spills over several 512-byte pages
    const {bytes, expected} = build(
      'types',
      (db) => {
        db.exec('PRAGMA page_size = 512');
        db.exec('CREATE TABLE "t" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER, f REAL, s TEXT, b BLOB, e TEXT)');
        const insert = db.prepare('INSERT INTO t (n, f, s, b, e) VALUES (?, ?, ?, ?, ?)');
        db.exec('BEGIN'); // one transaction: 3,000 single-row commits take seconds on a CI disk
        for (let i = 0; i < 3000; i++)
          insert.run(
            i % 7 === 0 ? -i : i * 1_000_003,
            i / 3,
            i % 50 === 0 ? long : `row ${i}`,
            new Uint8Array([i & 0xff, 0, 255]),
            i % 2 ? '' : null,
          );
        insert.run(2 ** 40, -0.5, 'كلمة', new Uint8Array(0), 'x');
        insert.run(0, 1, '', null, 'true');
        db.exec('COMMIT');
        db.exec('ALTER TABLE t ADD COLUMN added TEXT DEFAULT NULL');
        insert.run(1, 1, 'after alter', null, null);
      },
      'SELECT id, n, f, s, b, e, added FROM t ORDER BY rowid',
    );
    const rows = readSqliteTable(bytes, 't')!;
    expect(rows).toHaveLength(expected.length);
    for (let i = 0; i < rows.length; i++) {
      const want = expected[i] as Record<string, unknown>;
      const got = rows[i] as Record<string, unknown>;
      for (const key of ['id', 'n', 'f', 's', 'e', 'added'])
        expect(got[key], `row ${i} ${key}`).toBe(want[key] ?? null);
      expect(got.b, `row ${i} b`).toEqual(want.b === null ? null : new Uint8Array(want.b as Uint8Array));
    }
    expect(rows.filter((r) => r.s === long)).toHaveLength(60);
    expect(bytes.length).toBeGreaterThan(512 * 100); // a real multi-level tree
  }, 30_000);

  it('reads the largest page size, a table with no rowid alias, and says what it refuses', () => {
    const {bytes, expected} = build(
      'big',
      (db) => {
        db.exec('PRAGMA page_size = 65536');
        db.exec('CREATE TABLE pages (page_number, line_number, line_type)');
        db.exec("INSERT INTO pages VALUES (1, 1, 'ayah'), (1, 2, 'basmallah')");
        db.exec('CREATE TABLE norow (k TEXT PRIMARY KEY, v) WITHOUT ROWID');
        db.exec("INSERT INTO norow VALUES ('a', 1)");
        db.exec('CREATE VIEW v AS SELECT * FROM pages');
        db.exec('CREATE INDEX i ON pages (page_number)');
      },
      'SELECT * FROM pages ORDER BY rowid',
    );
    expect(readSqliteTable(bytes, 'pages')).toEqual(expected);
    expect(() => readSqliteTable(bytes, 'norow')).toThrow(/WITHOUT ROWID/);
    expect(() => readSqliteTable(bytes, 'v')).toThrow(/is a view, not a table/);
    expect(readSqliteTable(bytes, 'missing')).toBeNull();
  });

  it('refuses UTF-16 databases and non-databases by name', () => {
    const {bytes} = build(
      'utf16',
      (db) => {
        db.exec("PRAGMA encoding = 'UTF-16le'");
        db.exec('CREATE TABLE t (a)');
        db.exec("INSERT INTO t VALUES ('x')");
      },
      'SELECT * FROM t',
    );
    expect(() => readSqliteTable(bytes, 't')).toThrow(/UTF-16/);
    expect(() => readSqliteTable(new TextEncoder().encode('<!DOCTYPE html>'), 't')).toThrow(/not a SQLite file/);
    expect(isSqlite(new TextEncoder().encode('SQLite format 3\0'))).toBe(true);
  });
});

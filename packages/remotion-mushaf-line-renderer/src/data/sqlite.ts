/**
 * A read-only reader for one table of a SQLite file — what QUL's layout export is: a `pages` table
 * of ~9,000 short rows. It walks the table b-tree (interior and leaf pages, overflow chains), decodes
 * the record format, and names columns from the `CREATE TABLE` statement in `sqlite_master`, so a
 * column added or reordered by QUL changes nothing here. Indexes, `WITHOUT ROWID` tables, views and
 * UTF-16 databases are refused by name. See https://sqlite.org/fileformat2.html.
 */

export type SqliteValue = null | number | string | Uint8Array;
export type SqliteRow = Readonly<Record<string, SqliteValue>>;

export class SqliteError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'SqliteError';
    this.reason = reason;
  }
}

const MAGIC = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00]; // "SQLite format 3\0"

export const isSqlite = (bytes: Uint8Array): boolean => bytes.length >= MAGIC.length && MAGIC.every((b, i) => bytes[i] === b);

type Db = {
  readonly bytes: Uint8Array;
  readonly pageSize: number;
  /** Page size minus the reserved bytes at the end of every page. */
  readonly usable: number;
  readonly pageCount: number;
};

const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const decoder = new TextDecoder('utf-8');

const openDb = (bytes: Uint8Array): Db => {
  if (!isSqlite(bytes)) throw new SqliteError('not-sqlite', 'not a SQLite file (no "SQLite format 3" header)');
  if (bytes.length < 100) throw new SqliteError('truncated', `${bytes.length} bytes is too short for a SQLite file`);
  const dv = view(bytes);
  let pageSize = dv.getUint16(16);
  if (pageSize === 1) pageSize = 65536;
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) throw new SqliteError('bad-page-size', `page size ${pageSize} is not a power of two between 512 and 65536`);
  const encoding = dv.getUint32(56);
  // 0 only occurs in a database that never had a schema; 2 and 3 are UTF-16.
  if (encoding !== 1 && encoding !== 0) throw new SqliteError('encoding', `text encoding ${encoding} (UTF-16) is not supported; only UTF-8 databases are read`);
  const usable = pageSize - (bytes[20] as number);
  return {bytes, pageSize, usable, pageCount: Math.floor(bytes.length / pageSize)};
};

const page = (db: Db, n: number): Uint8Array => {
  if (n < 1 || n > db.pageCount) throw new SqliteError('bad-page', `page ${n} is outside the file (${db.pageCount} pages)`);
  return db.bytes.subarray((n - 1) * db.pageSize, n * db.pageSize);
};

/** A big-endian varint: up to eight 7-bit bytes, then a full ninth byte. */
const readVarint = (bytes: Uint8Array, offset: number): readonly [value: number, length: number] => {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    const b = bytes[offset + i];
    if (b === undefined) throw new SqliteError('truncated', 'varint runs past the end of its page');
    value = value * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) return [value, i + 1];
  }
  const last = bytes[offset + 8];
  if (last === undefined) throw new SqliteError('truncated', 'varint runs past the end of its page');
  return [value * 256 + last, 9];
};

/** Decodes a record (the payload of a table cell) into its column values. */
const readRecord = (payload: Uint8Array): SqliteValue[] => {
  const dv = view(payload);
  const [headerSize, headerVarint] = readVarint(payload, 0);
  const types: number[] = [];
  for (let p = headerVarint; p < headerSize; ) {
    const [type, length] = readVarint(payload, p);
    types.push(type);
    p += length;
  }
  const values: SqliteValue[] = [];
  let p = headerSize;
  for (const type of types) {
    switch (type) {
      case 0:
        values.push(null);
        break;
      case 1:
        values.push(dv.getInt8(p));
        p += 1;
        break;
      case 2:
        values.push(dv.getInt16(p));
        p += 2;
        break;
      case 3:
        values.push((dv.getInt8(p) << 16) | dv.getUint16(p + 1));
        p += 3;
        break;
      case 4:
        values.push(dv.getInt32(p));
        p += 4;
        break;
      case 5:
        values.push(dv.getInt16(p) * 2 ** 32 + dv.getUint32(p + 2));
        p += 6;
        break;
      case 6:
        values.push(Number(dv.getBigInt64(p)));
        p += 8;
        break;
      case 7:
        values.push(dv.getFloat64(p));
        p += 8;
        break;
      case 8:
        values.push(0);
        break;
      case 9:
        values.push(1);
        break;
      case 10:
      case 11:
        throw new SqliteError('bad-record', `reserved serial type ${type}`);
      default: {
        const length = (type - (type % 2 === 0 ? 12 : 13)) / 2;
        if (p + length > payload.length) throw new SqliteError('bad-record', 'a value runs past the end of its record');
        const slice = payload.subarray(p, p + length);
        values.push(type % 2 === 0 ? slice.slice() : decoder.decode(slice));
        p += length;
      }
    }
  }
  return values;
};

/** The rowid and full payload of a table-leaf cell, following the overflow chain when the record spills. */
const readCell = (db: Db, pageBytes: Uint8Array, cellOffset: number): {readonly rowid: number; readonly payload: Uint8Array} => {
  const [size, sizeLength] = readVarint(pageBytes, cellOffset);
  const [rowid, rowidLength] = readVarint(pageBytes, cellOffset + sizeLength);
  const start = cellOffset + sizeLength + rowidLength;
  const usable = db.usable;
  const maxLocal = usable - 35;
  if (size <= maxLocal) {
    if (start + size > pageBytes.length) throw new SqliteError('truncated', 'a cell runs past the end of its page');
    return {rowid, payload: pageBytes.subarray(start, start + size)};
  }
  const minLocal = Math.floor(((usable - 12) * 32) / 255) - 23;
  const k = minLocal + ((size - minLocal) % (usable - 4));
  const local = k <= maxLocal ? k : minLocal;
  const payload = new Uint8Array(size);
  payload.set(pageBytes.subarray(start, start + local), 0);
  let filled = local;
  let next = view(pageBytes).getUint32(start + local);
  while (filled < size) {
    if (next === 0) throw new SqliteError('bad-overflow', 'an overflow chain ends before the record is complete');
    const overflow = page(db, next);
    next = view(overflow).getUint32(0);
    const take = Math.min(size - filled, usable - 4);
    payload.set(overflow.subarray(4, 4 + take), filled);
    filled += take;
  }
  return {rowid, payload};
};

/** Visits every row of a table b-tree in rowid order. */
const walkTable = (db: Db, rootPage: number, visit: (rowid: number, payload: Uint8Array) => void): void => {
  const stack = [rootPage];
  let visited = 0;
  while (stack.length) {
    if (++visited > db.pageCount) throw new SqliteError('bad-btree', 'the table b-tree loops');
    const n = stack.pop() as number;
    const p = page(db, n);
    const dv = view(p);
    const header = n === 1 ? 100 : 0; // page 1 starts with the 100-byte file header
    const type = p[header];
    const cellCount = dv.getUint16(header + 3);
    if (type === 0x0d) {
      for (let i = 0; i < cellCount; i++) {
        const {rowid, payload} = readCell(db, p, dv.getUint16(header + 8 + i * 2));
        visit(rowid, payload);
      }
    } else if (type === 0x05) {
      const children: number[] = [];
      for (let i = 0; i < cellCount; i++) children.push(dv.getUint32(dv.getUint16(header + 12 + i * 2)));
      children.push(dv.getUint32(header + 8)); // right-most pointer
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i] as number);
    } else if (type === 0x02 || type === 0x0a) {
      throw new SqliteError('index-page', `page ${n} is an index page; expected a table (rowid) b-tree`);
    } else {
      throw new SqliteError('bad-page-type', `page ${n} has b-tree page type ${type}`);
    }
  }
};

type SchemaEntry = {readonly type: string; readonly name: string; readonly rootPage: number; readonly sql: string};

const readSchema = (db: Db): SchemaEntry[] => {
  const entries: SchemaEntry[] = [];
  walkTable(db, 1, (_rowid, payload) => {
    const [type, name, , rootPage, sql] = readRecord(payload);
    if (typeof type === 'string' && typeof name === 'string') entries.push({type, name, rootPage: typeof rootPage === 'number' ? rootPage : 0, sql: typeof sql === 'string' ? sql : ''});
  });
  return entries;
};

export type TableShape = {
  readonly columns: readonly string[];
  /** Index of the `INTEGER PRIMARY KEY` column, whose value is the rowid; −1 when there is none. */
  readonly rowidAlias: number;
  readonly withoutRowid: boolean;
};

const unquote = (token: string): string => {
  const first = token[0];
  if ((first === '"' || first === "'" || first === '`') && token.endsWith(first) && token.length >= 2) return token.slice(1, -1).replaceAll(first + first, first);
  if (first === '[' && token.endsWith(']')) return token.slice(1, -1);
  return token;
};

/** Splits at commas outside parentheses and quotes. */
const splitTopLevel = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const c of body) {
    if (quote) {
      current += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`' || c === '[') {
      quote = c === '[' ? ']' : c;
      current += c;
    } else if (c === '(') {
      depth++;
      current += c;
    } else if (c === ')') {
      depth--;
      current += c;
    } else if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((s) => s.trim()).filter(Boolean);
};

const IDENT = /^("(?:[^"]|"")*"|'(?:[^']|'')*'|`(?:[^`]|``)*`|\[[^\]]*\]|[A-Za-z_][\w$]*)/;
const TABLE_CONSTRAINT = /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i;

/** Column names (and the rowid alias) of a `CREATE TABLE` statement. */
export const parseCreateTable = (sql: string): TableShape => {
  const open = sql.indexOf('(');
  if (open < 0) throw new SqliteError('bad-schema', `cannot read the columns of: ${sql.slice(0, 80)}`);
  let depth = 0;
  let quote: string | null = null;
  let close = -1;
  for (let i = open; i < sql.length; i++) {
    const c = sql[i] as string;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`' || c === '[') {
      quote = c === '[' ? ']' : c;
    } else if (c === '(') {
      depth++;
    } else if (c === ')' && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) throw new SqliteError('bad-schema', `unbalanced parentheses in: ${sql.slice(0, 80)}`);
  const withoutRowid = /\bWITHOUT\s+ROWID\b/i.test(sql.slice(close + 1));
  const columns: string[] = [];
  const types: string[] = [];
  let rowidAlias = -1;
  let tablePrimaryKey: string | null = null;
  for (const definition of splitTopLevel(sql.slice(open + 1, close))) {
    if (TABLE_CONSTRAINT.test(definition)) {
      const pk = /PRIMARY\s+KEY\s*\(\s*([^,)]+?)\s*\)/i.exec(definition);
      if (pk) tablePrimaryKey = unquote((pk[1] as string).trim());
      continue;
    }
    const match = IDENT.exec(definition);
    if (!match) throw new SqliteError('bad-schema', `cannot read the column name in: ${definition.slice(0, 80)}`);
    const rest = definition.slice(match[0].length).trim();
    columns.push(unquote(match[0]));
    types.push(rest);
    if (/^INTEGER\s+PRIMARY\s+KEY\b(?!\s+DESC)/i.test(rest)) rowidAlias = columns.length - 1;
  }
  if (rowidAlias < 0 && tablePrimaryKey !== null) {
    const i = columns.findIndex((c) => c.toLowerCase() === tablePrimaryKey?.toLowerCase());
    if (i >= 0 && /^INTEGER\b/i.test(types[i] as string)) rowidAlias = i;
  }
  return {columns, rowidAlias: withoutRowid ? -1 : rowidAlias, withoutRowid};
};

/**
 * Every row of `table` as `{column: value}` objects in rowid order, or `null` when the database has
 * no such table. `''` and NULL are returned as they are stored; callers decide what an empty cell
 * means.
 */
export const readSqliteTable = (bytes: Uint8Array, table: string): SqliteRow[] | null => {
  const db = openDb(bytes);
  const wanted = table.toLowerCase();
  const entry = readSchema(db).find((e) => e.name.toLowerCase() === wanted);
  if (!entry) return null;
  if (entry.type !== 'table') throw new SqliteError('not-a-table', `"${entry.name}" is a ${entry.type}, not a table`);
  const shape = parseCreateTable(entry.sql);
  if (shape.withoutRowid) throw new SqliteError('without-rowid', `"${entry.name}" is a WITHOUT ROWID table, which is not supported`);
  if (entry.rootPage < 1) throw new SqliteError('bad-schema', `"${entry.name}" has no root page`);
  const rows: SqliteRow[] = [];
  walkTable(db, entry.rootPage, (rowid, payload) => {
    const values = readRecord(payload);
    const row: Record<string, SqliteValue> = {};
    shape.columns.forEach((column, i) => {
      const value = values[i] ?? null;
      row[column] = i === shape.rowidAlias && value === null ? rowid : value;
    });
    rows.push(row);
  });
  return rows;
};

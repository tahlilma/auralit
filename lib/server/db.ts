import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { SCHEMA } from './schema';
import { seed } from './seed';

export type Row = Record<string, any>;
export type Params = unknown[] | Record<string, SQLInputValue>;

const g = globalThis as unknown as { __auralitDb?: DatabaseSync };

function open(): DatabaseSync {
  const dir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'auralit.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  const seeded = db.prepare(`SELECT value FROM meta WHERE key = 'seeded'`).get();
  if (!seeded) {
    db.exec('BEGIN');
    try {
      seed(db);
      db.prepare(`INSERT INTO meta (key, value) VALUES ('seeded', ?)`).run(new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

export function db(): DatabaseSync {
  if (!g.__auralitDb) g.__auralitDb = open();
  return g.__auralitDb;
}

const norm = (p?: Params): any[] => {
  if (!p) return [];
  if (Array.isArray(p)) return p.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  return [p];
};

export function all<T = any>(sql: string, params?: Params): T[] {
  return db().prepare(sql).all(...norm(params)) as T[];
}
export function get<T = any>(sql: string, params?: Params): T | undefined {
  return db().prepare(sql).get(...norm(params)) as T | undefined;
}
export function run(sql: string, params?: Params) {
  const r = db().prepare(sql).run(...norm(params));
  return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
}
export function val<T = any>(sql: string, params?: Params): T | undefined {
  const r = get(sql, params);
  return r ? (Object.values(r)[0] as T) : undefined;
}

let depth = 0;
/** Runs fn in a transaction; nested calls join the outer transaction. */
export function tx<T>(fn: () => T): T {
  const d = db();
  if (depth > 0) return fn();
  depth++;
  d.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

/** Insert a row object into table, ignoring undefined keys. */
export function insert(table: string, row: Row): number {
  const keys = Object.keys(row).filter(k => row[k] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  return run(sql, keys.map(k => row[k])).id;
}
export function update(table: string, id: number, row: Row) {
  const keys = Object.keys(row).filter(k => row[k] !== undefined && k !== 'id');
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => row[k]), id]);
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const nowStamp = () => {
  const d = new Date();
  return `${today()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

export function setting(key: string, fallback = ''): string {
  return (get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [key])?.value ?? fallback);
}

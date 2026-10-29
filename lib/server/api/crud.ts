import 'server-only';
import { all, get, insert, run, round2, today, tx, update, val, type Row } from '../db';
import { assertCan, HttpError, history, log, type SessionUser } from '../auth';
import { deleteJournalsFor, ensureLedger, nextCode, nextLedgerCode, postJournal, subgroupByName, sys } from '../core';
import { ENTITIES, entity, type Entity, type Field } from '../../entities';

// ───────────── Lookups (options for ref fields) ─────────────
const LOOKUPS: Record<string, { sql: string; parent?: string; search?: string[] }> = {
  brand: { sql: `SELECT id value, name label FROM brands ORDER BY name` },
  manufacturer: { sql: `SELECT id value, name label FROM manufacturers ORDER BY name` },
  unit: { sql: `SELECT id value, name label FROM units ORDER BY name` },
  currency: { sql: `SELECT id value, name || ' (' || COALESCE(symbol,'') || ')' label FROM currencies ORDER BY is_default DESC, name` },
  country: { sql: `SELECT id value, name label FROM countries ORDER BY name` },
  transporter: { sql: `SELECT id value, name label FROM transporters ORDER BY name` },
  color: { sql: `SELECT id value, name label, hex FROM colors ORDER BY name` },
  size: { sql: `SELECT id value, name label FROM sizes ORDER BY name` },
  district: { sql: `SELECT id value, name label FROM districts ORDER BY name` },
  zone: { sql: `SELECT id value, name label FROM zones WHERE (? IS NULL OR district_id = ?) ORDER BY name`, parent: 'district_id' },
  location: { sql: `SELECT name value, name label FROM locations ORDER BY name` },
  client_group: { sql: `SELECT id value, name label FROM client_groups ORDER BY name` },
  parent: { sql: `SELECT id value, name label FROM product_parents ORDER BY name` },
  category: { sql: `SELECT id value, name label FROM categories ORDER BY name` },
  subcategory: { sql: `SELECT id value, name label FROM subcategories WHERE (? IS NULL OR category_id = ?) ORDER BY name`, parent: 'category_id' },
  acc_class: { sql: `SELECT id value, name label FROM acc_classes ORDER BY id` },
  acc_group: { sql: `SELECT id value, name label FROM acc_groups ORDER BY class_id, id` },
  acc_subgroup: { sql: `SELECT s.id value, s.name label, g.name grp FROM acc_subgroups s JOIN acc_groups g ON g.id = s.group_id WHERE (? IS NULL OR s.group_id = ?) ORDER BY g.class_id, g.id, s.name`, parent: 'group_id' },
  expense_type: { sql: `SELECT id value, name label FROM acc_subgroups WHERE group_id IN (SELECT id FROM acc_groups WHERE class_id = 4) ORDER BY name` },
  expense_head: { sql: `SELECT id value, COALESCE(code || ' - ','') || name label FROM ledgers WHERE kind = 'expense' AND status = 'active' ORDER BY name` },
  ledger: { sql: `SELECT l.id value, COALESCE(l.code || ' - ','') || l.name label, s.name grp FROM ledgers l JOIN acc_subgroups s ON s.id = l.subgroup_id WHERE l.status = 'active' AND (? IS NULL OR l.subgroup_id = ?) ORDER BY s.name, l.name`, parent: 'subgroup_id' },
  money: { sql: `SELECT l.id value, l.name label, l.kind grp FROM ledgers l WHERE l.kind IN ('cash','bank','mobile') AND l.status = 'active' ORDER BY CASE l.kind WHEN 'cash' THEN 0 WHEN 'bank' THEN 1 ELSE 2 END, l.name` },
  cash_ledger: { sql: `SELECT id value, COALESCE(code || ' - ','') || name label FROM ledgers WHERE kind = 'cash' ORDER BY name` },
  bank_ledger: { sql: `SELECT id value, name label FROM ledgers WHERE kind = 'bank' ORDER BY name` },
  mobile_ledger: { sql: `SELECT id value, name label FROM ledgers WHERE kind = 'mobile' ORDER BY name` },
  money_loan: { sql: `SELECT l.id value, l.name label, l.kind grp FROM ledgers l WHERE l.kind IN ('cash','bank','mobile','loan') AND l.status = 'active' ORDER BY CASE l.kind WHEN 'cash' THEN 0 WHEN 'bank' THEN 1 WHEN 'mobile' THEN 2 ELSE 3 END, l.name` },
  customer_ledger: { sql: `SELECT ledger_id value, code || ' - ' || name || COALESCE(' - ' || mobile, '') label FROM customers WHERE status = 'active' ORDER BY is_walkin DESC, name` },
  supplier_ledger: { sql: `SELECT ledger_id value, code || ' - ' || name || COALESCE(' - ' || mobile, '') label FROM suppliers WHERE status = 'active' AND is_opening = 0 ORDER BY name` },
  party_ledger: { sql: `SELECT l.id value, COALESCE(l.code || ' - ','') || l.name label, l.kind grp FROM ledgers l WHERE l.kind IN ('customer','supplier','employee','loan','general','expense') AND l.status = 'active' ORDER BY l.kind, l.name` },
  customer: { sql: `SELECT id value, code || ' - ' || name || COALESCE(' - ' || mobile,'') label FROM customers WHERE status = 'active' ORDER BY is_walkin DESC, name` },
  supplier: { sql: `SELECT id value, code || ' - ' || name label FROM suppliers WHERE status = 'active' ORDER BY is_opening DESC, name` },
  supplier_real: { sql: `SELECT id value, code || ' - ' || name label FROM suppliers WHERE status = 'active' AND is_opening = 0 ORDER BY name` },
  product: { sql: `SELECT id value, code || ' - ' || name label FROM products ORDER BY name` },
  service: { sql: `SELECT id value, code || ' - ' || name label FROM services ORDER BY name` },
  employee: { sql: `SELECT id value, name || ' (' || COALESCE(code,'') || ')' label FROM employees WHERE status = 'active' ORDER BY name` },
  department: { sql: `SELECT id value, name label FROM departments ORDER BY name` },
  designation: { sql: `SELECT id value, name label FROM designations ORDER BY name` },
  leave_type: { sql: `SELECT id value, name label FROM leave_types WHERE status = 'active' ORDER BY name` },
  bank: { sql: `SELECT id value, name label FROM banks ORDER BY name` },
  branch: { sql: `SELECT id value, name label FROM branches WHERE status = 'active' ORDER BY id` },
  warehouse: { sql: `SELECT id value, name label FROM warehouses ORDER BY name` },
  location_bw: { sql: `SELECT 'B:' || id value, name || ' (Branch)' label FROM branches WHERE status = 'active' UNION ALL SELECT 'W:' || id, name || ' (Warehouse)' FROM warehouses` },
  service_center: { sql: `SELECT id value, name label FROM service_centers WHERE status = 'active' ORDER BY name` },
  enquiry_source: { sql: `SELECT id value, name label FROM enquiry_sources ORDER BY name` },
  enquiry_type: { sql: `SELECT id value, name label FROM enquiry_types ORDER BY name` },
  enquiry_action: { sql: `SELECT id value, name label FROM enquiry_actions ORDER BY name` },
  offer: { sql: `SELECT id value, name label FROM offers WHERE status = 'active' ORDER BY name` },
  user: { sql: `SELECT id value, name label FROM users ORDER BY name` },
  role: { sql: `SELECT id value, name label FROM roles ORDER BY id` },
  sales_person: { sql: `SELECT id value, name label FROM employees WHERE status = 'active' ORDER BY name` },
};

export function lookup(_u: SessionUser, key: string, parent?: string | number | null) {
  const l = LOOKUPS[key];
  if (!l) throw new HttpError(400, `Unknown lookup ${key}`);
  const p = parent === '' || parent === undefined ? null : parent;
  return all(l.sql, l.parent ? [p, p] : []);
}

export function lookups(u: SessionUser, keys: string[]) {
  const out: Record<string, Row[]> = {};
  for (const k of keys) out[k] = lookup(u, k);
  return out;
}

// ───────────── Hooks ─────────────
type Hook = {
  beforeCreate?: (row: Row, u: SessionUser) => void;
  afterCreate?: (id: number, row: Row, u: SessionUser) => void;
  beforeUpdate?: (id: number, row: Row, old: Row, u: SessionUser) => void;
  afterUpdate?: (id: number, row: Row, old: Row, u: SessionUser) => void;
  beforeDelete?: (id: number, old: Row, u: SessionUser) => void;
};

function openingJournal(refType: string, refId: number, ledgerId: number, amount: number, debitParty: boolean, u: SessionUser, name: string) {
  deleteJournalsFor(`opening:${refType}`, refId);
  if (!amount) return;
  const opening = sys('OPENING');
  postJournal({
    date: today(), type: 'opening', ref_type: `opening:${refType}`, ref_id: refId, narration: `Opening balance - ${name}`, created_by: u.id,
    lines: debitParty
      ? [{ ledger_id: ledgerId, debit: amount }, { ledger_id: opening, credit: amount }]
      : [{ ledger_id: opening, debit: amount }, { ledger_id: ledgerId, credit: amount }],
  });
}

function blockIfPosted(ledgerId: number | null | undefined, what: string) {
  if (!ledgerId) return;
  const n = val<number>(`SELECT COUNT(*) FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.ledger_id = ? AND j.type <> 'opening'`, [ledgerId]) ?? 0;
  if (n > 0) throw new HttpError(409, `This ${what} has ${n} transaction line(s) and cannot be deleted. Set it inactive instead.`);
}

function partyHooks(kind: 'customer' | 'supplier'): Hook {
  const sub = kind === 'customer' ? 'Account Receivables' : 'Account Payable';
  return {
    beforeCreate: row => { row.code = nextCode(kind); },
    afterCreate: (id, row, u) => {
      const lid = ensureLedger(kind, id, row.name, sub, row.code);
      run(`UPDATE ${kind}s SET ledger_id = ? WHERE id = ?`, [lid, id]);
      openingJournal(kind, id, lid, round2(row.opening_balance), kind === 'customer', u, row.name);
    },
    afterUpdate: (id, row, old) => { ensureLedger(kind, id, row.name ?? old.name, sub, old.code); },
    beforeDelete: (id, old) => {
      if (old.is_walkin || old.is_opening) throw new HttpError(409, 'System record cannot be deleted.');
      const used = val<number>(`SELECT COUNT(*) FROM docs WHERE ${kind}_id = ?`, [id]) ?? 0;
      if (used) throw new HttpError(409, `This ${kind} is used in ${used} document(s) and cannot be deleted. Set it inactive instead.`);
      blockIfPosted(old.ledger_id, kind);
      deleteJournalsFor(`opening:${kind}`, id);
      if (old.ledger_id) run(`DELETE FROM ledgers WHERE id = ?`, [old.ledger_id]);
    },
  };
}

function accountHooks(kind: 'bank' | 'mobile' | 'loan', table: string): Hook {
  const label = (r: Row) => {
    if (kind === 'bank') {
      const b = get(`SELECT name, sort FROM banks WHERE id = ?`, [r.bank_id]);
      return `${b?.sort || b?.name || 'Bank'} - ${r.acno}`;
    }
    if (kind === 'mobile') return `${r.name}${r.number ? ` - ${r.number}` : ''}`;
    return `${r.code} - ${r.name}`;
  };
  const sub = (r: Row) => (kind === 'bank' ? 'Cash At Bank' : kind === 'mobile' ? 'Cash At Mobile Account' : r.type === 'given' ? 'Loans Given' : 'Long Term Borrowings');
  return {
    beforeCreate: row => { if (kind === 'loan') row.code = `LON${String((val<number>(`SELECT COUNT(*) FROM loan_accounts`) ?? 0) + 1).padStart(3, '0')}`; },
    afterCreate: (id, row, u) => {
      const lid = ensureLedger(kind, id, label(row), sub(row));
      run(`UPDATE ${table} SET ledger_id = ? WHERE id = ?`, [lid, id]);
      run(`UPDATE ledgers SET kind = ? WHERE id = ?`, [kind, lid]);
      openingJournal(kind, id, lid, round2(row.opening_balance), kind !== 'loan' || row.type === 'given', u, label(row));
    },
    afterUpdate: (id, row, old) => {
      const merged = { ...old, ...row };
      const lid = ensureLedger(kind, id, label(merged), sub(merged));
      run(`UPDATE ledgers SET subgroup_id = ? WHERE id = ?`, [subgroupByName(sub(merged)), lid]);
    },
    beforeDelete: (id, old) => {
      blockIfPosted(old.ledger_id, 'account');
      deleteJournalsFor(`opening:${kind}`, id);
      if (old.ledger_id) run(`DELETE FROM ledgers WHERE id = ?`, [old.ledger_id]);
    },
  };
}

const HOOKS: Record<string, Hook> = {
  customer: partyHooks('customer'),
  supplier: partyHooks('supplier'),
  bank_account: accountHooks('bank', 'bank_accounts'),
  mobile_account: accountHooks('mobile', 'mobile_accounts'),
  loan_account: accountHooks('loan', 'loan_accounts'),
  product: {
    beforeCreate: row => { row.code = nextCode('product'); },
    afterUpdate: (id, row, old, u) => {
      if (row.price !== undefined && round2(row.price) !== round2(old.price)) {
        insert('price_history', { product_id: id, old_price: old.price, new_price: row.price, user_id: u.id });
        run(`UPDATE products SET old_price = ?, price_updated_at = datetime('now','localtime') WHERE id = ?`, [old.price, id]);
      }
    },
    beforeDelete: id => {
      const used = (val<number>(`SELECT COUNT(*) FROM doc_lines WHERE product_id = ?`, [id]) ?? 0) + (val<number>(`SELECT COUNT(*) FROM stock_moves WHERE product_id = ?`, [id]) ?? 0);
      if (used) throw new HttpError(409, 'This product has transactions and cannot be deleted. Set it inactive instead.');
    },
  },
  service: {
    beforeCreate: row => { row.code = nextCode('service'); },
    beforeDelete: id => { if (val<number>(`SELECT COUNT(*) FROM doc_lines WHERE service_id = ?`, [id])) throw new HttpError(409, 'This service is used in invoices and cannot be deleted.'); },
  },
  employee: {
    beforeCreate: row => { row.code = nextCode('employee'); },
    afterCreate: (id, row) => { const lid = ensureLedger('employee', id, row.name, 'Salaries,Wages & Allowance Payable'); run(`UPDATE employees SET ledger_id = ? WHERE id = ?`, [lid, id]); },
    afterUpdate: (id, row, old) => { ensureLedger('employee', id, row.name ?? old.name, 'Salaries,Wages & Allowance Payable'); },
    beforeDelete: (id, old) => { blockIfPosted(old.ledger_id, 'employee'); if (old.ledger_id) run(`DELETE FROM ledgers WHERE id = ?`, [old.ledger_id]); },
  },
  ledger: {
    beforeCreate: row => { row.code = nextLedgerCode(Number(row.subgroup_id)); row.kind = 'general'; delete row.group_id; },
    beforeUpdate: (_id, row) => { delete row.group_id; },
    beforeDelete: (id, old) => {
      if (old.system_key) throw new HttpError(409, 'System ledgers cannot be deleted.');
      if (old.kind !== 'general' && old.kind !== 'expense') throw new HttpError(409, `This ledger belongs to a ${old.kind}; delete that record instead.`);
      blockIfPosted(id, 'ledger');
    },
  },
  expense_head: {
    beforeCreate: row => { row.kind = 'expense'; row.code = nextLedgerCode(Number(row.subgroup_id)); },
    beforeDelete: (id, old) => { if (old.system_key) throw new HttpError(409, 'System ledgers cannot be deleted.'); blockIfPosted(id, 'expense head'); },
  },
  currency: {
    afterCreate: (id, row) => { if (Number(row.is_default)) run(`UPDATE currencies SET is_default = 0 WHERE id <> ?`, [id]); },
    afterUpdate: (id, row) => { if (Number(row.is_default)) run(`UPDATE currencies SET is_default = 0 WHERE id <> ?`, [id]); },
  },
  leave_app: {
    beforeCreate: row => { row.days = daysBetween(row.from_date, row.to_date); row.apply_date ||= today(); },
    beforeUpdate: (_id, row, old) => { row.days = daysBetween(row.from_date ?? old.from_date, row.to_date ?? old.to_date); },
  },
  branch: { beforeDelete: id => { if (id === 1) throw new HttpError(409, 'The main branch cannot be deleted.'); } },
  category: { beforeDelete: id => { if (val(`SELECT 1 FROM products WHERE category_id = ? LIMIT 1`, [id])) throw new HttpError(409, 'Category has products.'); } },
  brand: { beforeDelete: id => { if (val(`SELECT 1 FROM products WHERE brand_id = ? LIMIT 1`, [id])) throw new HttpError(409, 'Brand has products.'); } },
  acc_group: { beforeDelete: id => { if (val(`SELECT 1 FROM acc_subgroups WHERE group_id = ? LIMIT 1`, [id])) throw new HttpError(409, 'Group has sub-groups.'); } },
  acc_subgroup: { beforeDelete: id => { if (val(`SELECT 1 FROM ledgers WHERE subgroup_id = ? LIMIT 1`, [id])) throw new HttpError(409, 'Sub-group has ledgers.'); } },
  bank: { beforeDelete: id => { if (val(`SELECT 1 FROM bank_accounts WHERE bank_id = ? LIMIT 1`, [id])) throw new HttpError(409, 'Bank has accounts.'); } },
};

function daysBetween(a?: string, b?: string) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1);
}

// ───────────── Value coercion ─────────────
function coerce(f: Field, v: any): any {
  if (v === undefined) return undefined;
  if (v === '' || v === null) return f.type === 'number' || f.type === 'money' ? 0 : null;
  switch (f.type) {
    case 'number': case 'money': { const n = Number(String(v).replace(/,/g, '')); if (Number.isNaN(n)) throw new HttpError(400, `${f.label} must be a number.`); return f.type === 'money' ? round2(n) : n; }
    case 'ref': return Number.isNaN(Number(v)) ? v : Number(v);
    case 'checkbox': return v ? 1 : 0;
    case 'select': return f.options && typeof f.options[0]?.value === 'number' ? Number(v) : String(v);
    default: return String(v).trim();
  }
}

function cleanRow(e: Entity, input: Row, creating: boolean): Row {
  const out: Row = {};
  for (const f of e.fields) {
    if (f.auto) continue;
    if (f.createOnly && !creating) continue;
    if (!(f.name in input)) { if (creating && f.default !== undefined) out[f.name] = f.default; continue; }
    out[f.name] = coerce(f, input[f.name]);
    if (f.required && (out[f.name] === null || out[f.name] === '')) throw new HttpError(400, `${f.label} is required.`);
  }
  if (creating) for (const f of e.fields) if (f.required && !f.auto && (out[f.name] === undefined || out[f.name] === null || out[f.name] === '')) throw new HttpError(400, `${f.label} is required.`);
  return out;
}

const tableColumns = new Map<string, Set<string>>();
function columnsOf(table: string) {
  let c = tableColumns.get(table);
  if (!c) { c = new Set(all<{ name: string }>(`PRAGMA table_info(${table})`).map(r => r.name)); tableColumns.set(table, c); }
  return c;
}
const dbRow = (table: string, row: Row) => {
  const cols = columnsOf(table);
  return Object.fromEntries(Object.entries(row).filter(([k]) => cols.has(k)));
};

// ───────────── Public API ─────────────
export type ListArgs = { q?: string; filters?: Record<string, any>; sort?: string; dir?: 'asc' | 'desc'; page?: number; size?: number };

export function list(u: SessionUser, key: string, args: ListArgs = {}) {
  const e = entity(key);
  assertCan(u, e.module, 'read');
  const base = e.select ?? `SELECT t.* FROM ${e.table} t`;
  const where: string[] = [];
  const params: any[] = [];
  if (e.where) where.push(e.where);
  if (args.q?.trim()) {
    const terms = args.q.trim().split(/\s+/);
    for (const term of terms) {
      where.push(`(${e.search.map(s => `${s} LIKE ?`).join(' OR ')})`);
      params.push(...e.search.map(() => `%${term}%`));
    }
  }
  for (const [k, v] of Object.entries(args.filters ?? {})) {
    if (v === '' || v === null || v === undefined) continue;
    if (!/^[a-z_]+$/.test(k)) continue;
    where.push(`t.${k} = ?`);
    params.push(v);
  }
  const inner = `${base}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  const total = val<number>(`SELECT COUNT(*) FROM (${inner})`, params) ?? 0;
  const colKeys = new Set(e.columns.map(c => c.key));
  const sort = args.sort && (colKeys.has(args.sort) || args.sort === 'id') && /^[a-z_]+$/.test(args.sort) ? `"${args.sort}" ${args.dir === 'desc' ? 'DESC' : 'ASC'}` : null;
  const size = Math.min(Math.max(Number(args.size) || 25, 1), 5000);
  const page = Math.max(Number(args.page) || 1, 1);
  const lim = [...params, size, (page - 1) * size];
  const rows: Row[] = sort
    ? all(`SELECT * FROM (${inner}) ORDER BY ${sort} LIMIT ? OFFSET ?`, lim)
    : all(`${inner} ORDER BY ${e.orderBy ?? 't.id DESC'} LIMIT ? OFFSET ?`, lim);
  return { rows, total, page, size };
}

export function getOne(u: SessionUser, key: string, id: number) {
  const e = entity(key);
  assertCan(u, e.module, 'read');
  const base = e.select ?? `SELECT t.* FROM ${e.table} t`;
  const row = get(`${base} WHERE t.id = ?`, [id]);
  if (!row) throw new HttpError(404, `${e.label} not found.`);
  if (key === 'ledger') row.group_id = val(`SELECT group_id FROM acc_subgroups WHERE id = ?`, [row.subgroup_id]);
  return row;
}

export function create(u: SessionUser, key: string, input: Row) {
  const e = entity(key);
  if (e.readOnly) throw new HttpError(400, 'Read-only list.');
  assertCan(u, e.module, 'write');
  return tx(() => {
    const row = cleanRow(e, input, true);
    HOOKS[key]?.beforeCreate?.(row, u);
    const id = insert(e.table, dbRow(e.table, row));
    HOOKS[key]?.afterCreate?.(id, row, u);
    log(u, key, id, 'create', `New ${e.label.toLowerCase()} added: ${row.name ?? row.acno ?? row.code ?? id}`);
    return { id };
  });
}

export function updateOne(u: SessionUser, key: string, id: number, input: Row) {
  const e = entity(key);
  if (e.readOnly) throw new HttpError(400, 'Read-only list.');
  assertCan(u, e.module, 'edit');
  return tx(() => {
    const old = get(`SELECT * FROM ${e.table} WHERE id = ?`, [id]);
    if (!old) throw new HttpError(404, `${e.label} not found.`);
    const row = cleanRow(e, input, false);
    HOOKS[key]?.beforeUpdate?.(id, row, old, u);
    update(e.table, id, dbRow(e.table, row));
    HOOKS[key]?.afterUpdate?.(id, row, old, u);
    const changed = Object.keys(row).filter(k => String(row[k] ?? '') !== String(old[k] ?? '')).map(k => e.fields.find(f => f.name === k)?.label ?? k);
    log(u, key, id, 'update', `${e.label} updated: ${row.name ?? old.name ?? old.acno ?? id}${changed.length ? ` (${changed.join(', ')})` : ''}`);
    return { id };
  });
}

export function remove(u: SessionUser, key: string, id: number) {
  const e = entity(key);
  if (e.readOnly || e.noDelete) throw new HttpError(400, 'Delete is not allowed here.');
  assertCan(u, e.module, 'delete');
  return tx(() => {
    const old = get(`SELECT * FROM ${e.table} WHERE id = ?`, [id]);
    if (!old) throw new HttpError(404, `${e.label} not found.`);
    HOOKS[key]?.beforeDelete?.(id, old, u);
    try {
      run(`DELETE FROM ${e.table} WHERE id = ?`, [id]);
    } catch {
      throw new HttpError(409, `${e.label} is in use and cannot be deleted.`);
    }
    log(u, key, id, 'delete', `${e.label} deleted: ${old.name ?? old.acno ?? id}`);
    return { ok: true };
  });
}

export function importRows(u: SessionUser, key: string, rows: Row[]) {
  const e = entity(key);
  assertCan(u, e.module, 'write');
  let ok = 0;
  const errors: string[] = [];
  const byLabel = new Map(e.fields.map(f => [f.label.toLowerCase(), f]));
  for (const [i, r] of rows.entries()) {
    try {
      const input: Row = {};
      for (const [k, v] of Object.entries(r)) {
        const f = e.fields.find(x => x.name === k) ?? byLabel.get(k.toLowerCase());
        if (!f || f.auto) continue;
        if (f.type === 'ref' && v !== '' && Number.isNaN(Number(v)) && f.ref) {
          const match = lookup(u, f.ref).find(o => String(o.label).toLowerCase() === String(v).toLowerCase() || String(o.label).toLowerCase().endsWith(` - ${String(v).toLowerCase()}`));
          input[f.name] = match?.value ?? null;
        } else input[f.name] = v;
      }
      create(u, key, input);
      ok++;
    } catch (err: any) {
      errors.push(`Row ${i + 2}: ${err.message}`);
    }
  }
  return { ok, errors: errors.slice(0, 50) };
}

export function entityHistory(u: SessionUser, key: string | string[]) {
  return history(key);
}

export function entityKeys() {
  return Object.keys(ENTITIES);
}

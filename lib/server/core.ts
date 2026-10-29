import 'server-only';
import { all, get, insert, run, round2, setting, today, val } from './db';
import { HttpError } from './auth';

// ───────────── Numbering ─────────────
export const PREFIX: Record<string, string> = {
  sale: 'SEL', estimate: 'EST', sreturn: 'SRT', porder: 'POR', purchase: 'PUR', preturn: 'PRT', service: 'SER', sestimate: 'SES',
  payment: 'PAV', receipt: 'REV', journal: 'JOU', contra: 'TRN', expense: 'AXE', donation: 'DON', salary: 'SAL', opening: 'OPN',
  transfer_b: 'BTR', transfer_w: 'WTR', delivery: 'DEL', receive: 'RCV', disposal: 'DIS', bad_claim: 'BSC', self_bad: 'SBS',
  claim: 'WAR', rebate: 'REB', enquiry: 'ENQ', adjust: 'ADJ',
};

function nextCounter(key: string): number {
  const cur = val<number>(`SELECT value FROM counters WHERE key = ?`, [key]);
  if (cur === undefined) {
    run(`INSERT INTO counters (key, value) VALUES (?, 1)`, [key]);
    return 1;
  }
  run(`UPDATE counters SET value = value + 1 WHERE key = ?`, [key]);
  return cur + 1;
}

/** Document number following the "Local Setting" format, e.g. SEL-BGI-301026-001. */
export function nextNo(kind: string, date = today()): string {
  const pfx = PREFIX[kind] ?? kind.toUpperCase().slice(0, 3);
  const co = setting('company_short', 'BGI');
  const [y, m, d] = date.split('-');
  const ddmmyy = `${d}${m}${y.slice(2)}`;
  const fmt = setting('number_format', 'PFX-CO-DDMMYY-NNN');
  if (fmt === 'PFX-CO-YY-NNNNNN') {
    const n = nextCounter(`no:${kind}:${y}`);
    return `${pfx}-${co}-${y.slice(2)}-${String(n).padStart(6, '0')}`;
  }
  const n = nextCounter(`no:${kind}:${date}`);
  const nnn = String(n).padStart(3, '0');
  if (fmt === 'PFX-B0-DDMMYY-NNN') return `${pfx}-B1-${ddmmyy}-${nnn}`;
  if (fmt === 'PFX-DDMMYY-NNN-CO') return `${pfx}-${ddmmyy}-${nnn}-${co}`;
  return `${pfx}-${co}-${ddmmyy}-${nnn}`;
}

/** Master codes like ABA/CU/001, ABA/SU/001, ABA001P, EM-10001. */
export function nextCode(kind: 'customer' | 'supplier' | 'product' | 'employee' | 'service'): string {
  const p = setting('code_prefix', 'ABA');
  const n = nextCounter(kind);
  if (kind === 'customer') return `${p}/CU/${String(n).padStart(3, '0')}`;
  if (kind === 'supplier') return `${p}/SU/${String(n).padStart(3, '0')}`;
  if (kind === 'product') return `${p}${String(n).padStart(3, '0')}P`;
  if (kind === 'service') return `${p}${String(n).padStart(3, '0')}S`;
  return `EM-${10000 + n}`;
}

// ───────────── Ledgers ─────────────
const sysCache = new Map<string, number>();
export function sys(key: string): number {
  const c = sysCache.get(key);
  if (c && get(`SELECT 1 FROM ledgers WHERE id = ?`, [c])) return c;
  const id = val<number>(`SELECT id FROM ledgers WHERE system_key = ?`, [key]);
  if (!id) throw new Error(`Missing system ledger ${key}`);
  sysCache.set(key, id);
  return id;
}

export function subgroupByName(name: string): number {
  const id = val<number>(`SELECT id FROM acc_subgroups WHERE name = ?`, [name]);
  if (!id) throw new Error(`Missing sub-group ${name}`);
  return id;
}

export function nextLedgerCode(subgroupId: number): string {
  const n = (val<number>(`SELECT COUNT(*) FROM ledgers WHERE subgroup_id = ?`, [subgroupId]) ?? 0) + 1;
  return `${subgroupId}-${String(n).padStart(4, '0')}`;
}

/** Creates (or renames) the ledger that backs a party/account record. */
export function ensureLedger(kind: string, refId: number, name: string, subgroup: string, code?: string): number {
  const existing = get(`SELECT id FROM ledgers WHERE kind = ? AND ref_id = ?`, [kind, refId]);
  if (existing) {
    run(`UPDATE ledgers SET name = ?, code = COALESCE(?, code) WHERE id = ?`, [name, code ?? null, existing.id]);
    return existing.id;
  }
  const sid = subgroupByName(subgroup);
  return insert('ledgers', { code: code ?? nextLedgerCode(sid), name, subgroup_id: sid, kind, ref_id: refId });
}

export type JLine = {
  ledger_id: number; debit?: number; credit?: number; memo?: string | null; ref?: string | null;
  cheque_no?: string | null; cheque_date?: string | null; ref_doc_id?: number | null; xrate?: number | null; pair_ledger_id?: number | null;
};

/** Posts a balanced journal. Zero lines are dropped; debits must equal credits. */
export function postJournal(j: {
  id?: number; no?: string | null; date: string; type: string; ref_type?: string; ref_id?: number; narration?: string | null;
  branch_id?: number; created_by?: number; lines: JLine[];
}): number | null {
  const lines = j.lines
    .map(l => ({ ...l, debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0) }))
    .filter(l => l.debit !== 0 || l.credit !== 0)
    .map(l => (l.debit < 0 || l.credit < 0 ? { ...l, debit: round2(Math.max(l.debit, 0) - Math.min(l.credit, 0)), credit: round2(Math.max(l.credit, 0) - Math.min(l.debit, 0)) } : l));
  if (!lines.length) return null;
  const dr = round2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(dr - cr) > 0.009) throw new HttpError(400, `Journal not balanced (debit ${dr} vs credit ${cr}).`);
  if (j.id) {
    run(`DELETE FROM journal_lines WHERE journal_id = ?`, [j.id]);
    run(`UPDATE journals SET date = ?, narration = ?, total = ?, updated_at = datetime('now','localtime') WHERE id = ?`, [j.date, j.narration ?? null, dr, j.id]);
    for (const l of lines) insert('journal_lines', { journal_id: j.id, ...l });
    return j.id;
  }
  const id = insert('journals', {
    no: j.no ?? null, date: j.date, type: j.type, ref_type: j.ref_type ?? null, ref_id: j.ref_id ?? null,
    narration: j.narration ?? null, branch_id: j.branch_id ?? 1, total: dr, created_by: j.created_by ?? null,
  });
  for (const l of lines) insert('journal_lines', { journal_id: id, ...l });
  return id;
}

export function deleteJournalsFor(refType: string, refId: number) {
  const ids = all<{ id: number }>(`SELECT id FROM journals WHERE ref_type = ? AND ref_id = ?`, [refType, refId]).map(r => r.id);
  for (const id of ids) {
    run(`DELETE FROM cheques WHERE journal_id = ?`, [id]);
    run(`DELETE FROM journals WHERE id = ?`, [id]);
  }
}

export function ledgerBalance(ledgerId: number, upTo?: string): number {
  const r = get(
    `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) b FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
     WHERE jl.ledger_id = ? ${upTo ? 'AND j.date <= ?' : ''}`,
    upTo ? [ledgerId, upTo] : [ledgerId],
  );
  return round2(r?.b ?? 0);
}

/** Ledgers money can move through: cash, bank and mobile accounts (optionally loans). */
export function moneyLedgers(includeLoan = false) {
  return all(
    `SELECT l.id, l.name, l.kind, l.code,
       CASE l.kind WHEN 'bank' THEN (SELECT b.sort || ' - ' || a.acno FROM bank_accounts a LEFT JOIN banks b ON b.id = a.bank_id WHERE a.id = l.ref_id)
                   WHEN 'mobile' THEN (SELECT m.name || ' - ' || COALESCE(m.number,'') FROM mobile_accounts m WHERE m.id = l.ref_id)
                   WHEN 'loan' THEN (SELECT o.code || ' - ' || o.name FROM loan_accounts o WHERE o.id = l.ref_id)
                   ELSE l.name END label,
       (SELECT COALESCE(SUM(debit - credit), 0) FROM journal_lines WHERE ledger_id = l.id) balance
     FROM ledgers l WHERE l.kind IN ('cash','bank','mobile'${includeLoan ? `,'loan'` : ''}) AND l.status = 'active'
     ORDER BY CASE l.kind WHEN 'cash' THEN 0 WHEN 'bank' THEN 1 WHEN 'mobile' THEN 2 ELSE 3 END, l.name`,
  );
}

export function recordCheques(journalId: number, date: string, refNo: string, direction: 'in' | 'out', lines: JLine[], partyLedger?: number) {
  for (const l of lines) {
    if (!l.cheque_no) continue;
    insert('cheques', {
      journal_id: journalId, direction, cheque_no: l.cheque_no, cheque_date: l.cheque_date ?? null, amount: l.debit || l.credit,
      account_ledger_id: l.ledger_id, party_ledger_id: partyLedger ?? l.pair_ledger_id ?? null, status: 'pending', date, ref_no: refNo,
      bank_name: l.memo ?? null,
    });
  }
}

// ───────────── Stock ─────────────
export type Move = {
  date: string; product_id: number; color_id?: number | null; size_id?: number | null; loc_type?: string; loc_id?: number;
  qty: number; cost?: number; price?: number; kind: string; ref_type: string; ref_id: number; ref_no?: string | null; serial?: string | null;
};

export function addMove(m: Move) {
  insert('stock_moves', {
    date: m.date, product_id: m.product_id, color_id: m.color_id || null, size_id: m.size_id || null,
    loc_type: m.loc_type ?? 'B', loc_id: m.loc_id ?? 1, qty: m.qty, cost: round2(m.cost ?? 0), price: round2(m.price ?? 0),
    kind: m.kind, ref_type: m.ref_type, ref_id: m.ref_id, ref_no: m.ref_no ?? null, serial: m.serial ?? null,
  });
}

export function deleteMovesFor(refType: string, refId: number) {
  run(`DELETE FROM stock_moves WHERE ref_type = ? AND ref_id = ?`, [refType, refId]);
}

export function onHand(productId: number, opts: { color_id?: number | null; size_id?: number | null; loc_type?: string; loc_id?: number } = {}): number {
  const w: string[] = ['product_id = ?'];
  const p: any[] = [productId];
  if (opts.color_id) { w.push('color_id = ?'); p.push(opts.color_id); }
  if (opts.size_id) { w.push('size_id = ?'); p.push(opts.size_id); }
  if (opts.loc_type) { w.push('loc_type = ?'); p.push(opts.loc_type); }
  if (opts.loc_id) { w.push('loc_id = ?'); p.push(opts.loc_id); }
  return round2(val<number>(`SELECT COALESCE(SUM(qty), 0) FROM stock_moves WHERE ${w.join(' AND ')}`, p) ?? 0);
}

/** Moving average cost from all inbound moves. Falls back to product cost. */
export function avgCost(productId: number): number {
  const r = get(`SELECT SUM(qty * cost) v, SUM(qty) q FROM stock_moves WHERE product_id = ? AND qty > 0 AND kind IN ('purchase','opening','exchange','adjust_in')`, [productId]);
  if (r && r.q > 0 && r.v > 0) return round2(r.v / r.q);
  return round2(val<number>(`SELECT cost FROM products WHERE id = ?`, [productId]) ?? 0);
}

export function serialLog(serialId: number, action: string, refType: string, refId: number, refNo: string | null, note?: string) {
  insert('serial_history', { serial_id: serialId, action, ref_type: refType, ref_id: refId, ref_no: refNo, note: note ?? null });
}

export function partyLedger(type: 'customer' | 'supplier', id: number): number {
  const lid = val<number>(`SELECT ledger_id FROM ${type === 'customer' ? 'customers' : 'suppliers'} WHERE id = ?`, [id]);
  if (!lid) throw new HttpError(400, `The selected ${type} has no ledger.`);
  return lid;
}

export function walkinCustomerId(): number {
  return val<number>(`SELECT id FROM customers WHERE is_walkin = 1 ORDER BY id LIMIT 1`) ?? 1;
}

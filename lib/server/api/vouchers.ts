import 'server-only';
import { all, get, run, round2, today, tx, val, type Row } from '../db';
import { assertCan, HttpError, log, type SessionUser } from '../auth';
import { deleteJournalsFor, ledgerBalance, moneyLedgers, nextNo, postJournal, recordCheques, sys, type JLine } from '../core';
import { sendTemplateSms } from '../sms';

export type VoucherKind = 'payment' | 'receipt' | 'journal' | 'contra' | 'expense' | 'donation';
export const VOUCHER_LABEL: Record<VoucherKind, string> = {
  payment: 'Payment Voucher', receipt: 'Receive Voucher', journal: 'Journal Voucher', contra: 'Transaction', expense: 'Expenses Voucher', donation: 'Donation Voucher',
};
const MODULE: Record<VoucherKind, string> = { payment: 'acctra', receipt: 'acctra', journal: 'acctra', contra: 'acctra', expense: 'daily', donation: 'acctra' };

export type VLine = {
  dr?: number | null; cr?: number | null; amount: number; less?: number; less_ref?: string; charge?: number;
  cheque_no?: string; cheque_date?: string; ref?: string; memo?: string; ref_doc_no?: string; xrate?: number;
};
export type VoucherIn = { date?: string; note?: string; source?: number | null; lines: VLine[] };

export function voucherSetup(u: SessionUser, kind: VoucherKind) {
  assertCan(u, MODULE[kind], 'read');
  return { money: moneyLedgers(kind === 'expense' || kind === 'contra' || kind === 'payment' || kind === 'receipt') };
}

function buildLines(kind: VoucherKind, input: VoucherIn) {
  const out: JLine[] = [];
  const lines = input.lines.filter(l => Number(l.amount) > 0 || Number(l.less) > 0);
  if (!lines.length) throw new HttpError(400, 'Add at least one line.');
  for (const l of lines) {
    const a = round2(l.amount), less = round2(l.less ?? 0);
    const refDoc = l.ref_doc_no ? val<number>(`SELECT id FROM docs WHERE no = ?`, [l.ref_doc_no.trim()]) : null;
    if (l.ref_doc_no && !refDoc) throw new HttpError(400, `Invoice ${l.ref_doc_no} not found.`);
    const chq = { cheque_no: l.cheque_no || null, cheque_date: l.cheque_date || null, ref: l.ref || null };
    switch (kind) {
      case 'payment':
        if (!l.dr || !l.cr) throw new HttpError(400, 'Select both payment source and pay-to.');
        out.push({ ledger_id: l.dr, debit: a + less, ref: l.ref || null, ref_doc_id: refDoc, pair_ledger_id: l.cr });
        out.push({ ledger_id: l.cr, credit: a, ...chq, pair_ledger_id: l.dr });
        if (less) out.push({ ledger_id: sys('LESS_PAYMENT'), credit: less, memo: l.less_ref || null });
        break;
      case 'receipt':
        if (!l.dr || !l.cr) throw new HttpError(400, 'Select both received-to and received-from.');
        out.push({ ledger_id: l.dr, debit: a, ...chq, pair_ledger_id: l.cr, xrate: l.xrate || null });
        if (less) out.push({ ledger_id: sys('LESS_RECEIVE'), debit: less, memo: l.less_ref || null });
        out.push({ ledger_id: l.cr, credit: a + less, ref: l.ref || null, ref_doc_id: refDoc, pair_ledger_id: l.dr });
        break;
      case 'journal':
        if (!l.dr || !l.cr) throw new HttpError(400, 'Select both debit and credit ledgers.');
        if (l.dr === l.cr) throw new HttpError(400, 'Debit and credit ledgers must differ.');
        out.push({ ledger_id: l.dr, debit: a, ...chq, pair_ledger_id: l.cr });
        out.push({ ledger_id: l.cr, credit: a, ref: l.ref || null, pair_ledger_id: l.dr });
        break;
      case 'contra': {
        if (!l.dr || !l.cr) throw new HttpError(400, 'Select source and transfer-to accounts.');
        if (l.dr === l.cr) throw new HttpError(400, 'Source and destination must differ.');
        const ch = round2(l.charge ?? 0);
        out.push({ ledger_id: l.dr, debit: a, ...chq, pair_ledger_id: l.cr });
        if (ch) out.push({ ledger_id: sys('BANK_CHARGE'), debit: ch, memo: 'Transfer charge' });
        out.push({ ledger_id: l.cr, credit: a + ch, ref: l.ref || null, pair_ledger_id: l.dr });
        break;
      }
      case 'expense':
        if (!l.dr) throw new HttpError(400, 'Select an expense head.');
        if (!input.source) throw new HttpError(400, 'Select the paying account.');
        out.push({ ledger_id: l.dr, debit: a, ref: l.ref || null, memo: l.memo || null, pair_ledger_id: input.source });
        out.push({ ledger_id: input.source, credit: a, pair_ledger_id: l.dr });
        break;
      case 'donation':
        if (!l.cr) throw new HttpError(400, 'Select the payment source.');
        out.push({ ledger_id: l.dr || sys('DONATION'), debit: a, ref: l.ref || null, memo: l.memo || null, pair_ledger_id: l.cr });
        out.push({ ledger_id: l.cr, credit: a, ...chq, pair_ledger_id: l.dr || sys('DONATION') });
        break;
    }
  }
  return out;
}

export function saveVoucher(u: SessionUser, kind: VoucherKind, input: VoucherIn, id?: number) {
  assertCan(u, MODULE[kind], id ? 'edit' : 'write');
  return tx(() => {
    const date = input.date || today();
    let no: string;
    if (id) {
      const old = get(`SELECT * FROM journals WHERE id = ? AND type = ?`, [id, kind]);
      if (!old) throw new HttpError(404, 'Voucher not found.');
      no = old.no;
      run(`DELETE FROM cheques WHERE journal_id = ?`, [id]);
    } else no = nextNo(kind, date);
    const lines = buildLines(kind, input);
    const finalId = postJournal({ id, no, date, type: kind, narration: input.note || null, created_by: u.id, branch_id: u.branch_id, lines })!;
    if (kind === 'payment') recordCheques(finalId, date, no, 'out', lines.filter(l => l.cheque_no && l.credit));
    if (kind === 'receipt') recordCheques(finalId, date, no, 'in', lines.filter(l => l.cheque_no && l.debit));
    if (kind === 'contra' || kind === 'journal' || kind === 'donation') recordCheques(finalId, date, no, 'out', lines.filter(l => l.cheque_no));
    const total = round2(input.lines.reduce((s, l) => s + Number(l.amount || 0), 0));
    log(u, kind, finalId, id ? 'update' : 'create', `${VOUCHER_LABEL[kind]} ${no} ${id ? 'updated' : 'created'} — ${total.toFixed(2)}`);
    if (!id && (kind === 'receipt' || kind === 'payment')) notifyParties(kind, finalId, no);
    return { id: finalId, no, total };
  });
}

function notifyParties(kind: 'receipt' | 'payment', jid: number, no: string) {
  const partyLines = all(`SELECT jl.ledger_id, jl.credit, jl.debit, l.kind, l.ref_id FROM journal_lines jl JOIN ledgers l ON l.id = jl.ledger_id WHERE jl.journal_id = ? AND l.kind IN ('customer','supplier')`, [jid]);
  for (const p of partyLines) {
    const party = get(`SELECT name, mobile FROM ${p.kind === 'customer' ? 'customers' : 'suppliers'} WHERE id = ?`, [p.ref_id]);
    if (!party?.mobile) continue;
    const bal = ledgerBalance(p.ledger_id);
    if (kind === 'receipt') sendTemplateSms('receive', party.mobile, { RECEIVE_NO: no, RECEIVE_TOTAL: round2(p.credit).toFixed(2), TOT_DUE: bal.toFixed(2) });
    else sendTemplateSms('payment', party.mobile, { PAYMENT_NO: no, PAYMENT_TOTAL: round2(p.debit).toFixed(2), BALANCE_DUE: (-bal).toFixed(2) });
  }
}

export function getVoucher(u: SessionUser, id: number) {
  const j = get(`SELECT j.*, uc.name created_by_name FROM journals j LEFT JOIN users uc ON uc.id = j.created_by WHERE j.id = ?`, [id]);
  if (!j) throw new HttpError(404, 'Voucher not found.');
  const lines = all(
    `SELECT jl.*, l.name ledger_name, l.code ledger_code, l.kind ledger_kind, p.name pair_name, d.no ref_doc_no
     FROM journal_lines jl JOIN ledgers l ON l.id = jl.ledger_id LEFT JOIN ledgers p ON p.id = jl.pair_ledger_id LEFT JOIN docs d ON d.id = jl.ref_doc_id
     WHERE jl.journal_id = ? ORDER BY jl.id`,
    [id],
  );
  const company = get(`SELECT * FROM company WHERE id = 1`);
  return { journal: j, lines, company };
}

/** Rebuild editable voucher lines from the stored journal. */
export function voucherForEdit(u: SessionUser, id: number) {
  const { journal, lines } = getVoucher(u, id);
  const kind = journal.type as VoucherKind;
  assertCan(u, MODULE[kind], 'edit');
  const out: VLine[] = [];
  let source: number | null = null;
  const used = new Set<number>();
  const lessIds = new Set([sys('LESS_PAYMENT'), sys('LESS_RECEIVE'), sys('BANK_CHARGE')]);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (used.has(l.id) || lessIds.has(l.ledger_id) && kind !== 'journal' && kind !== 'expense') continue;
    if (kind === 'expense') {
      if (l.debit) out.push({ dr: l.ledger_id, amount: l.debit, ref: l.ref ?? '', memo: l.memo ?? '' });
      else source = l.ledger_id;
      continue;
    }
    if (l.debit && l.pair_ledger_id) {
      const pair = lines.find(x => !used.has(x.id) && x.id !== l.id && x.credit && x.ledger_id === l.pair_ledger_id);
      if (!pair) continue;
      used.add(l.id); used.add(pair.id);
      const extra = lines[lines.indexOf(pair) + 1] && lessIds.has(lines[lines.indexOf(pair) + 1]?.ledger_id) ? lines[lines.indexOf(pair) + 1] : lines[lines.indexOf(l) + 1] && lessIds.has(lines[lines.indexOf(l) + 1]?.ledger_id) ? lines[lines.indexOf(l) + 1] : null;
      const chqLine = l.cheque_no ? l : pair;
      const vl: VLine = { dr: l.ledger_id, cr: pair.ledger_id, amount: kind === 'payment' ? pair.credit : l.debit, cheque_no: chqLine.cheque_no ?? '', cheque_date: chqLine.cheque_date ?? '', ref: (l.ref || pair.ref) ?? '', ref_doc_no: (l.ref_doc_no || pair.ref_doc_no) ?? '', xrate: l.xrate ?? undefined };
      if (extra) { used.add(extra.id); if (kind === 'contra') vl.charge = extra.debit; else { vl.less = extra.debit || extra.credit; vl.less_ref = extra.memo ?? ''; } }
      if (kind === 'donation') { vl.memo = l.memo ?? ''; }
      out.push(vl);
    }
  }
  return { kind, date: journal.date, note: journal.narration ?? '', source, lines: out, no: journal.no };
}

export function listVouchers(u: SessionUser, kind: VoucherKind, args: { q?: string; from?: string; to?: string; page?: number; size?: number } = {}) {
  assertCan(u, MODULE[kind], 'read');
  const w = ['j.type = ?'];
  const p: any[] = [kind];
  if (args.from) { w.push('j.date >= ?'); p.push(args.from); }
  if (args.to) { w.push('j.date <= ?'); p.push(args.to); }
  if (args.q?.trim()) {
    const like = `%${args.q.trim()}%`;
    w.push(`(j.no LIKE ? OR j.narration LIKE ? OR EXISTS (SELECT 1 FROM journal_lines x JOIN ledgers lx ON lx.id = x.ledger_id WHERE x.journal_id = j.id AND (lx.name LIKE ? OR x.ref LIKE ? OR x.cheque_no LIKE ?)))`);
    p.push(like, like, like, like, like);
  }
  const where = w.join(' AND ');
  const size = Math.min(args.size ?? 25, 5000);
  const page = Math.max(args.page ?? 1, 1);
  const total = val<number>(`SELECT COUNT(*) FROM journals j WHERE ${where}`, p) ?? 0;
  const sum = val<number>(`SELECT COALESCE(SUM(j.total),0) FROM journals j WHERE ${where}`, p) ?? 0;
  const sideExpr: Record<VoucherKind, string> = {
    payment: `(SELECT GROUP_CONCAT(l.name, ', ') FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND x.debit > 0)`,
    receipt: `(SELECT GROUP_CONCAT(l.name, ', ') FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND x.credit > 0)`,
    journal: `(SELECT GROUP_CONCAT(l.name, ', ') FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND x.debit > 0)`,
    contra: `(SELECT GROUP_CONCAT(l.name, ', ') FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND x.debit > 0 AND l.kind IN ('cash','bank','mobile','loan'))`,
    expense: `(SELECT GROUP_CONCAT(l.name, ', ') FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND x.debit > 0)`,
    donation: `(SELECT GROUP_CONCAT(COALESCE(x.memo, l.name), ', ') FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND x.debit > 0)`,
  };
  // The money side: credited when paying out, debited when receiving.
  const srcExpr = `(SELECT GROUP_CONCAT(l.name, ', ') FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND x.${kind === 'receipt' ? 'debit' : 'credit'} > 0 AND l.kind IN ('cash','bank','mobile','loan'))`;
  const amountExpr: Record<VoucherKind, string> = {
    payment: `(SELECT COALESCE(SUM(x.credit),0) FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND l.kind IN ('cash','bank','mobile','loan'))`,
    receipt: `(SELECT COALESCE(SUM(x.debit),0) FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND l.kind IN ('cash','bank','mobile','loan'))`,
    journal: 'j.total', contra: 'j.total', expense: 'j.total', donation: 'j.total',
  };
  const rows = all(
    `SELECT j.id, j.no, j.date, j.narration note, j.total, j.created_at, u.name created_by_name, ${sideExpr[kind]} party, ${srcExpr} source, ${amountExpr[kind]} amount,
       (SELECT GROUP_CONCAT(x.ref, ', ') FROM journal_lines x WHERE x.journal_id = j.id AND x.ref IS NOT NULL AND x.ref <> '') refs
     FROM journals j LEFT JOIN users u ON u.id = j.created_by WHERE ${where} ORDER BY j.date DESC, j.id DESC LIMIT ? OFFSET ?`,
    [...p, size, (page - 1) * size],
  );
  return { rows, total, page, size, sums: { total: sum } };
}

export function deleteVoucher(u: SessionUser, id: number) {
  const j = get(`SELECT * FROM journals WHERE id = ?`, [id]);
  if (!j) throw new HttpError(404, 'Voucher not found.');
  const kind = j.type as VoucherKind;
  if (!MODULE[kind]) throw new HttpError(400, 'This journal belongs to a document; delete the document instead.');
  assertCan(u, MODULE[kind], 'delete');
  return tx(() => {
    run(`DELETE FROM cheques WHERE journal_id = ?`, [id]);
    run(`DELETE FROM journals WHERE id = ?`, [id]);
    log(u, kind, id, 'delete', `${VOUCHER_LABEL[kind]} ${j.no} deleted`);
    return { ok: true };
  });
}

/** Ledger balance shown next to selects in voucher editors. */
export function balanceOf(_u: SessionUser, ledgerId: number) {
  return ledgerBalance(ledgerId);
}

/** Due of an invoice (for "Type Invoice No" in receipts). */
export function invoiceDue(u: SessionUser, no: string) {
  const d = get(`SELECT d.id, d.no, d.kind, d.total, d.paid, d.customer_id, d.supplier_id, c.ledger_id cl, s.ledger_id sl, COALESCE(c.name, s.name) party FROM docs d LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN suppliers s ON s.id = d.supplier_id WHERE d.no = ?`, [no.trim()]);
  if (!d) return null;
  const later = val<number>(`SELECT COALESCE(SUM(CASE WHEN j.type = 'receipt' THEN jl.credit ELSE jl.debit END),0) FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.ref_doc_id = ? AND j.type IN ('receipt','payment')`, [d.id]) ?? 0;
  const returned = val<number>(`SELECT COALESCE(SUM(total),0) FROM docs WHERE ref_doc_id = ? AND kind IN ('sreturn','preturn')`, [d.id]) ?? 0;
  return { ...d, ledger_id: d.cl ?? d.sl, due: round2(d.total - d.paid - later - returned) };
}

// ───────────── Cheques ─────────────
export function listCheques(u: SessionUser, args: { direction?: 'in' | 'out'; status?: string; q?: string } = {}) {
  assertCan(u, 'acctra', 'read');
  const w: string[] = ['1 = 1'];
  const p: any[] = [];
  if (args.direction) { w.push('c.direction = ?'); p.push(args.direction); }
  if (args.status) { w.push('c.status = ?'); p.push(args.status); }
  if (args.q?.trim()) { const like = `%${args.q.trim()}%`; w.push('(c.cheque_no LIKE ? OR c.ref_no LIKE ? OR pl.name LIKE ?)'); p.push(like, like, like); }
  return all(
    `SELECT c.*, al.name account, pl.name party FROM cheques c LEFT JOIN ledgers al ON al.id = c.account_ledger_id LEFT JOIN ledgers pl ON pl.id = c.party_ledger_id
     WHERE ${w.join(' AND ')} ORDER BY c.cheque_date DESC, c.id DESC LIMIT 1000`,
    p,
  );
}

export function updateCheque(u: SessionUser, id: number, action: 'clear' | 'bounce' | 'pending', note?: string) {
  assertCan(u, 'acctra', 'edit');
  return tx(() => {
    const c = get(`SELECT * FROM cheques WHERE id = ?`, [id]);
    if (!c) throw new HttpError(404, 'Cheque not found.');
    deleteJournalsFor('cheque', id);
    if (action === 'bounce' && c.party_ledger_id) {
      // money never arrived / left: reverse the account side against the party
      const lines: JLine[] = c.direction === 'in'
        ? [{ ledger_id: c.party_ledger_id, debit: c.amount }, { ledger_id: c.account_ledger_id, credit: c.amount, cheque_no: c.cheque_no }]
        : [{ ledger_id: c.account_ledger_id, debit: c.amount, cheque_no: c.cheque_no }, { ledger_id: c.party_ledger_id, credit: c.amount }];
      postJournal({ no: c.ref_no, date: today(), type: 'cheque_bounce', ref_type: 'cheque', ref_id: id, narration: `Cheque ${c.cheque_no} bounced`, created_by: u.id, lines });
    }
    const status = action === 'clear' ? 'cleared' : action === 'bounce' ? 'bounced' : 'pending';
    run(`UPDATE cheques SET status = ?, cleared_at = ?, note = COALESCE(?, note), mode = ? WHERE id = ?`, [status, action === 'pending' ? null : today(), note ?? null, action === 'clear' ? 'Cleared' : action === 'bounce' ? 'Bounced' : null, id]);
    log(u, 'cheque', id, 'update', `Cheque ${c.cheque_no} marked ${status}`);
    return { ok: true };
  });
}

export function voucherPrintRows(_u: SessionUser, ids: number[]): Row[] {
  return ids.map(id => getVoucher(_u, id));
}

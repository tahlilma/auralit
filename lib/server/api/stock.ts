import 'server-only';
import { all, get, insert, run, round2, setting, today, tx, val, type Row } from '../db';
import { assertCan, HttpError, log, type SessionUser } from '../auth';
import { addMove, avgCost, deleteJournalsFor, deleteMovesFor, nextNo, onHand, partyLedger, postJournal, serialLog, sys } from '../core';

export type StockKind = 'transfer_b' | 'transfer_w' | 'delivery' | 'receive' | 'disposal' | 'bad_claim' | 'self_bad';
export const STOCK_LABEL: Record<StockKind, string> = {
  transfer_b: 'Transfer From Branch', transfer_w: 'Transfer From Warehouse', delivery: 'Product Delivery', receive: 'Product Received',
  disposal: 'Product Disposal', bad_claim: 'Claim To Supplier', self_bad: 'Self Stock Manage',
};
const MODULE: Record<StockKind, string> = { transfer_b: 'inventory', transfer_w: 'inventory', delivery: 'inventory', receive: 'inventory', disposal: 'inventory', bad_claim: 'warranty', self_bad: 'warranty' };

const parseLoc = (s?: string | null): [string, number] => {
  const [t, id] = String(s ?? 'B:1').split(':');
  return [t === 'W' ? 'W' : 'B', Number(id) || 1];
};
const locName = (t: string, id: number) => val<string>(t === 'W' ? `SELECT name FROM warehouses WHERE id = ?` : `SELECT name FROM branches WHERE id = ?`, [id]) ?? '-';

export type StockLineIn = { product_id?: number; color_id?: number | null; size_id?: number | null; qty: number; serial?: string; doc_line_id?: number; claim_id?: number; cost?: number; action?: string; note?: string };
export type StockDocIn = { date?: string; from?: string; to?: string; doc_id?: number; supplier_id?: number; recover?: number; recover_ledger?: number; amount?: number; note?: string; lines: StockLineIn[] };

export function stockSetup(u: SessionUser) {
  assertCan(u, 'inventory', 'read');
  return {
    branches: all(`SELECT 'B:' || id value, name label FROM branches WHERE status = 'active'`),
    warehouses: all(`SELECT 'W:' || id value, name label FROM warehouses`),
    money: all(`SELECT id value, name label FROM ledgers WHERE kind IN ('cash','bank','mobile') ORDER BY kind, name`),
    suppliers: all(`SELECT id value, code || ' - ' || name label FROM suppliers WHERE is_opening = 0 AND status = 'active' ORDER BY name`),
  };
}

/** Items available at a location (for transfer/disposal pickers). */
export function locationStock(u: SessionUser, loc: string, q?: string) {
  assertCan(u, 'inventory', 'read');
  const [t, id] = parseLoc(loc);
  const like = q?.trim() ? `%${q.trim()}%` : null;
  return all(
    `SELECT m.product_id, m.color_id, m.size_id, p.code, p.name, p.mode, p.image, c.name color, s.name size, SUM(m.qty) qty
     FROM stock_moves m JOIN products p ON p.id = m.product_id LEFT JOIN colors c ON c.id = m.color_id LEFT JOIN sizes s ON s.id = m.size_id
     WHERE m.loc_type = ? AND m.loc_id = ? ${like ? 'AND (p.name LIKE ? OR p.code LIKE ? OR p.model LIKE ?)' : ''}
     GROUP BY m.product_id, m.color_id, m.size_id HAVING SUM(m.qty) > 0 ORDER BY p.name LIMIT 200`,
    like ? [t, id, like, like, like] : [t, id],
  );
}

export function serialsAt(u: SessionUser, loc: string, productId: number) {
  const [t, id] = parseLoc(loc);
  return all(`SELECT serial FROM serials WHERE product_id = ? AND status = 'instock' AND loc_type = ? AND loc_id = ? ORDER BY id`, [productId, t, id]).map(r => r.serial as string);
}

/** Sales/purchase invoice lines with delivered/received quantities. */
export function pendingFor(u: SessionUser, kind: 'delivery' | 'receive', docId: number) {
  assertCan(u, 'inventory', 'read');
  const doc = get(`SELECT id, no, date, kind FROM docs WHERE id = ?`, [docId]);
  if (!doc) throw new HttpError(404, 'Invoice not found.');
  const lines = all(
    `SELECT l.id, l.product_id, l.color_id, l.size_id, l.name, l.qty, l.moved_qty returned, p.code, p.image,
       (SELECT COALESCE(SUM(sl.qty),0) FROM stock_doc_lines sl JOIN stock_docs sd ON sd.id = sl.stock_doc_id WHERE sl.doc_line_id = l.id AND sd.kind = ?) done
     FROM doc_lines l LEFT JOIN products p ON p.id = l.product_id WHERE l.doc_id = ? AND l.product_id IS NOT NULL`,
    [kind, docId],
  );
  for (const l of lines) l.rest = round2(l.qty - l.returned - l.done);
  return { doc, lines };
}

export function openInvoices(u: SessionUser, kind: 'delivery' | 'receive') {
  assertCan(u, 'inventory', 'read');
  const dk = kind === 'delivery' ? 'sale' : 'purchase';
  return all(
    `SELECT d.id value, d.no || ' — ' || COALESCE(c.name, s.name, '') || ' (' || d.date || ')' label FROM docs d
     LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN suppliers s ON s.id = d.supplier_id
     WHERE d.kind = ? AND EXISTS (SELECT 1 FROM doc_lines l WHERE l.doc_id = d.id AND l.product_id IS NOT NULL AND l.qty - l.moved_qty >
       (SELECT COALESCE(SUM(sl.qty),0) FROM stock_doc_lines sl JOIN stock_docs sd ON sd.id = sl.stock_doc_id WHERE sl.doc_line_id = l.id AND sd.kind = ?))
     ORDER BY d.id DESC LIMIT 500`,
    [dk, kind],
  );
}

function reverseStockDoc(sd: Row) {
  for (const l of all(`SELECT * FROM stock_doc_lines WHERE stock_doc_id = ?`, [sd.id])) {
    if (l.serial) {
      const s = get(`SELECT id FROM serials WHERE serial = ? AND product_id = ? ORDER BY id DESC LIMIT 1`, [l.serial, l.product_id]);
      if (s) {
        if (sd.kind === 'transfer_b' || sd.kind === 'transfer_w') run(`UPDATE serials SET loc_type = ?, loc_id = ? WHERE id = ?`, [sd.from_type, sd.from_id, s.id]);
        if (sd.kind === 'disposal' || sd.kind === 'bad_claim') run(`UPDATE serials SET status = 'instock' WHERE id = ?`, [s.id]);
      }
    }
    if (l.claim_id) run(`UPDATE warranty_claims SET status = 'checked' WHERE id = ? AND status IN ('sent_supplier','written_off','restocked')`, [l.claim_id]);
  }
  run(`DELETE FROM serial_history WHERE ref_type = 'stock' AND ref_id = ?`, [sd.id]);
  deleteMovesFor('stock', sd.id);
  deleteJournalsFor('stock', sd.id);
  run(`DELETE FROM stock_doc_lines WHERE stock_doc_id = ?`, [sd.id]);
}

export function saveStockDoc(u: SessionUser, kind: StockKind, input: StockDocIn, id?: number) {
  assertCan(u, MODULE[kind], id ? 'edit' : 'write');
  const lines = (input.lines ?? []).filter(l => Number(l.qty) > 0);
  if (!lines.length) throw new HttpError(400, 'Add at least one item.');
  return tx(() => {
    let old: Row | undefined;
    if (id) {
      old = get(`SELECT * FROM stock_docs WHERE id = ? AND kind = ?`, [id, kind]);
      if (!old) throw new HttpError(404, 'Record not found.');
      reverseStockDoc(old);
    }
    const date = input.date || today();
    const no = old?.no ?? nextNo(kind, date);
    let [ft, fid] = parseLoc(input.from ?? `B:${u.branch_id}`);
    let [tt, tid] = parseLoc(input.to);
    if (kind === 'transfer_b' && ft !== 'B') throw new HttpError(400, 'Source must be a branch.');
    if (kind === 'transfer_w' && ft !== 'W') throw new HttpError(400, 'Source must be a warehouse.');
    if ((kind === 'transfer_b' || kind === 'transfer_w') && ft === tt && fid === tid) throw new HttpError(400, 'Source and destination must differ.');
    if (kind === 'delivery' || kind === 'receive') { if (!input.doc_id) throw new HttpError(400, 'Select an invoice.'); }
    if (kind === 'bad_claim' && !input.supplier_id) throw new HttpError(400, 'Select a supplier.');
    if (kind !== 'transfer_b' && kind !== 'transfer_w') { tt = ''; tid = 0; }
    if (kind === 'delivery' || kind === 'receive' || kind === 'self_bad') { ft = 'B'; fid = u.branch_id; }

    const row: Row = {
      kind, no, date, from_type: ft, from_id: fid, to_type: tt || null, to_id: tid || null, doc_id: input.doc_id ?? null,
      supplier_id: input.supplier_id ?? null, recover: round2(input.recover ?? 0), note: input.note ?? null,
    };
    let sid: number;
    if (old) { sid = old.id; run(`UPDATE stock_docs SET date = ?, from_type = ?, from_id = ?, to_type = ?, to_id = ?, doc_id = ?, supplier_id = ?, recover = ?, note = ? WHERE id = ?`, [date, ft, fid, tt || null, tid || null, row.doc_id, row.supplier_id, row.recover, row.note, sid]); }
    else sid = insert('stock_docs', { ...row, created_by: u.id });

    let costTotal = 0, badTotal = 0, generalTotal = 0, restock = 0, writeoff = 0;
    for (const l of lines) {
      const qty = Number(l.qty);
      if (kind === 'delivery' || kind === 'receive') {
        const dl = get(`SELECT * FROM doc_lines WHERE id = ? AND doc_id = ?`, [l.doc_line_id, input.doc_id]);
        if (!dl) throw new HttpError(400, 'Invalid invoice line.');
        const done = val<number>(`SELECT COALESCE(SUM(sl.qty),0) FROM stock_doc_lines sl JOIN stock_docs sd ON sd.id = sl.stock_doc_id WHERE sl.doc_line_id = ? AND sd.kind = ?`, [dl.id, kind]) ?? 0;
        if (qty > dl.qty - dl.moved_qty - done + 1e-9) throw new HttpError(400, `${dl.name}: only ${round2(dl.qty - dl.moved_qty - done)} left.`);
        insert('stock_doc_lines', { stock_doc_id: sid, product_id: dl.product_id, color_id: dl.color_id, size_id: dl.size_id, qty, doc_line_id: dl.id, note: l.note ?? null });
        continue;
      }
      if (l.claim_id) {
        const c = get(`SELECT * FROM warranty_claims WHERE id = ?`, [l.claim_id]);
        if (!c) throw new HttpError(400, 'Invalid warranty item.');
        const cost = round2(l.cost ?? val<number>(`SELECT cost FROM serials WHERE serial = ? ORDER BY id DESC LIMIT 1`, [c.serial]) ?? avgCost(c.product_id));
        insert('stock_doc_lines', { stock_doc_id: sid, product_id: c.product_id, qty: 1, cost, serial: c.serial, claim_id: c.id, note: l.action ?? null });
        if (kind === 'bad_claim') { badTotal += cost; run(`UPDATE warranty_claims SET status = 'sent_supplier' WHERE id = ?`, [c.id]); }
        else if (l.action === 'restock') {
          restock += cost; run(`UPDATE warranty_claims SET status = 'restocked' WHERE id = ?`, [c.id]);
          addMove({ date, product_id: c.product_id, loc_type: 'B', loc_id: u.branch_id, qty: 1, cost, kind: 'adjust_in', ref_type: 'stock', ref_id: sid, ref_no: no, serial: c.serial });
        } else { writeoff += cost; run(`UPDATE warranty_claims SET status = 'written_off' WHERE id = ?`, [c.id]); }
        continue;
      }
      if (!l.product_id) continue;
      if (setting('allow_negative_stock') !== 'yes' || kind === 'transfer_b' || kind === 'transfer_w') {
        const have = onHand(l.product_id, { color_id: l.color_id, size_id: l.size_id, loc_type: ft, loc_id: fid });
        if (have < qty) throw new HttpError(400, `Not enough stock at ${locName(ft, fid)}: ${have} available.`);
      }
      const cost = round2(l.cost ?? avgCost(l.product_id));
      const serials = (l.serial ?? '').split(/[\s,]+/).filter(Boolean);
      if (serials.length && serials.length !== qty) throw new HttpError(400, 'Serial count must equal quantity.');
      insert('stock_doc_lines', { stock_doc_id: sid, product_id: l.product_id, color_id: l.color_id || null, size_id: l.size_id || null, qty, cost, serial: serials.join(',') || null, note: l.note ?? null });
      addMove({ date, product_id: l.product_id, color_id: l.color_id, size_id: l.size_id, loc_type: ft, loc_id: fid, qty: -qty, cost, kind: kind === 'disposal' ? 'disposal' : kind === 'bad_claim' ? 'bad_claim' : 'transfer_out', ref_type: 'stock', ref_id: sid, ref_no: no });
      if (kind === 'transfer_b' || kind === 'transfer_w') addMove({ date, product_id: l.product_id, color_id: l.color_id, size_id: l.size_id, loc_type: tt, loc_id: tid, qty, cost, kind: 'transfer_in', ref_type: 'stock', ref_id: sid, ref_no: no });
      for (const s of serials) {
        const sr = get(`SELECT * FROM serials WHERE serial = ? AND product_id = ? AND status = 'instock' ORDER BY id DESC LIMIT 1`, [s, l.product_id]);
        if (!sr) throw new HttpError(400, `Serial ${s} not in stock.`);
        if (kind === 'transfer_b' || kind === 'transfer_w') run(`UPDATE serials SET loc_type = ?, loc_id = ? WHERE id = ?`, [tt, tid, sr.id]);
        else run(`UPDATE serials SET status = ? WHERE id = ?`, [kind === 'disposal' ? 'disposed' : 'claimed', sr.id]);
        serialLog(sr.id, STOCK_LABEL[kind].toLowerCase(), 'stock', sid, no);
      }
      costTotal += cost * qty;
      if (kind === 'bad_claim') generalTotal += cost * qty;
    }
    costTotal = round2(costTotal);

    // accounting
    if (kind === 'disposal') {
      const recover = round2(input.recover ?? 0);
      const recLedger = input.recover_ledger || sys('CASH');
      postJournal({
        no, date, type: 'disposal', ref_type: 'stock', ref_id: sid, narration: `Disposal ${no}`, created_by: u.id, lines: [
          { ledger_id: recLedger, debit: recover }, { ledger_id: sys('PRODUCT_ADJUST'), debit: round2(costTotal - recover) }, { ledger_id: sys('INVENTORY'), credit: costTotal },
        ],
      });
      run(`UPDATE stock_docs SET amount = ? WHERE id = ?`, [costTotal, sid]);
    } else if (kind === 'bad_claim') {
      const amount = round2(input.amount ?? badTotal + generalTotal);
      const sup = partyLedger('supplier', input.supplier_id!);
      postJournal({
        no, date, type: 'bad_claim', ref_type: 'stock', ref_id: sid, narration: `Bad stock claim ${no}`, created_by: u.id, lines: [
          { ledger_id: sup, debit: amount }, { ledger_id: sys('WARRANTY_BAD'), credit: round2(badTotal) }, { ledger_id: sys('INVENTORY'), credit: round2(generalTotal) },
          { ledger_id: sys('PRODUCT_ADJUST'), credit: round2(amount - badTotal - generalTotal) },
        ],
      });
      run(`UPDATE stock_docs SET amount = ? WHERE id = ?`, [amount, sid]);
    } else if (kind === 'self_bad') {
      postJournal({
        no, date, type: 'self_bad', ref_type: 'stock', ref_id: sid, narration: `Bad stock manage ${no}`, created_by: u.id, lines: [
          { ledger_id: sys('INVENTORY'), debit: round2(restock) }, { ledger_id: sys('PRODUCT_ADJUST'), debit: round2(writeoff) }, { ledger_id: sys('WARRANTY_BAD'), credit: round2(restock + writeoff) },
        ],
      });
      run(`UPDATE stock_docs SET amount = ? WHERE id = ?`, [round2(restock + writeoff), sid]);
    } else run(`UPDATE stock_docs SET amount = ? WHERE id = ?`, [costTotal, sid]);

    log(u, kind, sid, old ? 'update' : 'create', `${STOCK_LABEL[kind]} ${no} ${old ? 'updated' : 'created'}`);
    return { id: sid, no };
  });
}

export function listStockDocs(u: SessionUser, kind: StockKind, args: { q?: string; from?: string; to?: string; page?: number; size?: number } = {}) {
  assertCan(u, MODULE[kind], 'read');
  const w = ['sd.kind = ?'];
  const p: any[] = [kind];
  if (args.from) { w.push('sd.date >= ?'); p.push(args.from); }
  if (args.to) { w.push('sd.date <= ?'); p.push(args.to); }
  if (args.q?.trim()) { const like = `%${args.q.trim()}%`; w.push('(sd.no LIKE ? OR sd.note LIKE ? OR d.no LIKE ?)'); p.push(like, like, like); }
  const where = w.join(' AND ');
  const size = Math.min(args.size ?? 25, 5000), page = Math.max(args.page ?? 1, 1);
  const total = val<number>(`SELECT COUNT(*) FROM stock_docs sd LEFT JOIN docs d ON d.id = sd.doc_id WHERE ${where}`, p) ?? 0;
  const rows = all(
    `SELECT sd.*, d.no doc_no, s.name supplier, u.name created_by_name,
       CASE sd.from_type WHEN 'W' THEN (SELECT name FROM warehouses WHERE id = sd.from_id) ELSE (SELECT name FROM branches WHERE id = sd.from_id) END from_name,
       CASE sd.to_type WHEN 'W' THEN (SELECT name FROM warehouses WHERE id = sd.to_id) WHEN 'B' THEN (SELECT name FROM branches WHERE id = sd.to_id) END to_name,
       (SELECT COALESCE(SUM(qty),0) FROM stock_doc_lines WHERE stock_doc_id = sd.id) qty
     FROM stock_docs sd LEFT JOIN docs d ON d.id = sd.doc_id LEFT JOIN suppliers s ON s.id = sd.supplier_id LEFT JOIN users u ON u.id = sd.created_by
     WHERE ${where} ORDER BY sd.date DESC, sd.id DESC LIMIT ? OFFSET ?`,
    [...p, size, (page - 1) * size],
  );
  return { rows, total, page, size };
}

export function getStockDoc(u: SessionUser, id: number) {
  const sd = get(
    `SELECT sd.*, d.no doc_no, s.name supplier, u.name created_by_name, COALESCE(c.name, d.walkin_name) customer,
       CASE sd.from_type WHEN 'W' THEN (SELECT name FROM warehouses WHERE id = sd.from_id) ELSE (SELECT name FROM branches WHERE id = sd.from_id) END from_name,
       CASE sd.to_type WHEN 'W' THEN (SELECT name FROM warehouses WHERE id = sd.to_id) WHEN 'B' THEN (SELECT name FROM branches WHERE id = sd.to_id) END to_name
     FROM stock_docs sd LEFT JOIN docs d ON d.id = sd.doc_id LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN suppliers s ON s.id = sd.supplier_id
     LEFT JOIN users u ON u.id = sd.created_by WHERE sd.id = ?`,
    [id],
  );
  if (!sd) throw new HttpError(404, 'Record not found.');
  assertCan(u, MODULE[sd.kind as StockKind], 'read');
  const lines = all(`SELECT l.*, p.name, p.code, c.name color, s.name size FROM stock_doc_lines l LEFT JOIN products p ON p.id = l.product_id LEFT JOIN colors c ON c.id = l.color_id LEFT JOIN sizes s ON s.id = l.size_id WHERE l.stock_doc_id = ?`, [id]);
  return { doc: sd, lines, company: get(`SELECT * FROM company WHERE id = 1`) };
}

export function deleteStockDoc(u: SessionUser, id: number) {
  const sd = get(`SELECT * FROM stock_docs WHERE id = ?`, [id]);
  if (!sd) throw new HttpError(404, 'Record not found.');
  assertCan(u, MODULE[sd.kind as StockKind], 'delete');
  return tx(() => {
    reverseStockDoc(sd);
    run(`DELETE FROM stock_docs WHERE id = ?`, [id]);
    log(u, sd.kind, id, 'delete', `${STOCK_LABEL[sd.kind as StockKind]} ${sd.no} deleted`);
    return { ok: true };
  });
}

// ───────────── Stock status views ─────────────
const kindSum = (k: string | string[]) => {
  const ks = (Array.isArray(k) ? k : [k]).map(x => `'${x}'`).join(',');
  return `COALESCE(SUM(CASE WHEN m.kind IN (${ks}) THEN m.qty END), 0)`;
};

export function stockStatus(u: SessionUser, args: { scope: 'branch' | 'warehouse' | 'combined'; loc_id?: number; q?: string; category_id?: number; brand_id?: number; only_stock?: boolean }) {
  assertCan(u, 'inventory', 'read');
  const w: string[] = ['1 = 1'];
  const p: any[] = [];
  if (args.scope === 'branch') { w.push(`m.loc_type = 'B'`); if (args.loc_id) { w.push('m.loc_id = ?'); p.push(args.loc_id); } }
  if (args.scope === 'warehouse') { w.push(`m.loc_type = 'W'`); if (args.loc_id) { w.push('m.loc_id = ?'); p.push(args.loc_id); } }
  if (args.q?.trim()) { const like = `%${args.q.trim()}%`; w.push('(pr.name LIKE ? OR pr.code LIKE ? OR pr.model LIKE ?)'); p.push(like, like, like); }
  if (args.category_id) { w.push('pr.category_id = ?'); p.push(args.category_id); }
  if (args.brand_id) { w.push('pr.brand_id = ?'); p.push(args.brand_id); }
  const rows = all(
    `SELECT pr.id product_id, pr.code, pr.name, pr.image, pr.warranty_days, m.color_id, m.size_id, c.name color, s.name size,
       ${args.scope === 'warehouse' ? `GROUP_CONCAT(DISTINCT (SELECT name FROM warehouses WHERE id = m.loc_id)) warehouse,` : ''}
       ${kindSum(['purchase', 'opening'])} purchase, -${kindSum('preturn')} preturn,
       ${kindSum('transfer_in')} t_in, -${kindSum('transfer_out')} t_out,
       -${kindSum('sale')} sold, ${kindSum('sreturn')} sreturn, -${kindSum('disposal')} disposed, ${kindSum('exchange')} exchange,
       -${kindSum('warranty_out')} replaced, ${kindSum(['adjust_in', 'warranty_in'])} adjust_in, -${kindSum('bad_claim')} bad_out,
       COALESCE(SUM(m.qty), 0) balance, COALESCE(SUM(CASE WHEN m.qty > 0 THEN m.qty * m.cost END),0) / NULLIF(SUM(CASE WHEN m.qty > 0 THEN m.qty END),0) avg_cost, pr.price
     FROM stock_moves m JOIN products pr ON pr.id = m.product_id LEFT JOIN colors c ON c.id = m.color_id LEFT JOIN sizes s ON s.id = m.size_id
     WHERE ${w.join(' AND ')} GROUP BY pr.id, m.color_id, m.size_id ${args.only_stock ? 'HAVING SUM(m.qty) <> 0' : ''} ORDER BY pr.name LIMIT 5000`,
    p,
  );
  // delivery / receive progress
  for (const r of rows) {
    r.delivered = round2(val<number>(`SELECT COALESCE(SUM(sl.qty),0) FROM stock_doc_lines sl JOIN stock_docs sd ON sd.id = sl.stock_doc_id WHERE sd.kind = 'delivery' AND sl.product_id = ? AND COALESCE(sl.color_id,0) = ? AND COALESCE(sl.size_id,0) = ?`, [r.product_id, r.color_id ?? 0, r.size_id ?? 0]) ?? 0);
    r.received = round2(val<number>(`SELECT COALESCE(SUM(sl.qty),0) FROM stock_doc_lines sl JOIN stock_docs sd ON sd.id = sl.stock_doc_id WHERE sd.kind = 'receive' AND sl.product_id = ? AND COALESCE(sl.color_id,0) = ? AND COALESCE(sl.size_id,0) = ?`, [r.product_id, r.color_id ?? 0, r.size_id ?? 0]) ?? 0);
    r.undelivered = round2(r.sold - r.sreturn - r.delivered);
    r.net_sales = round2(r.sold - r.sreturn);
    r.avg_cost = round2(r.avg_cost ?? 0);
    r.value = round2(r.balance * r.avg_cost);
    r.warranty_in = round2(val<number>(`SELECT COUNT(*) FROM warranty_claims WHERE product_id = ?`, [r.product_id]) ?? 0);
  }
  return rows;
}

export function productDetails(u: SessionUser, id: number) {
  assertCan(u, 'product', 'read');
  const product = get(`SELECT p.*, c.name category, s.name subcategory, b.name brand, un.name unit, m.name manufacturer, co.name country FROM products p
    LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN subcategories s ON s.id = p.subcategory_id LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN units un ON un.id = p.unit_id LEFT JOIN manufacturers m ON m.id = p.manufacturer_id LEFT JOIN countries co ON co.id = p.country_id WHERE p.id = ?`, [id]);
  if (!product) throw new HttpError(404, 'Product not found.');
  return {
    product,
    stock: all(`SELECT m.loc_type, m.loc_id, CASE m.loc_type WHEN 'W' THEN (SELECT name FROM warehouses WHERE id = m.loc_id) ELSE (SELECT name FROM branches WHERE id = m.loc_id) END location,
      c.name color, s.name size, SUM(m.qty) qty FROM stock_moves m LEFT JOIN colors c ON c.id = m.color_id LEFT JOIN sizes s ON s.id = m.size_id WHERE m.product_id = ?
      GROUP BY m.loc_type, m.loc_id, m.color_id, m.size_id HAVING SUM(m.qty) <> 0`, [id]),
    serials: all(`SELECT serial, status, loc_type, loc_id, created_at FROM serials WHERE product_id = ? ORDER BY id DESC LIMIT 300`, [id]),
    moves: all(`SELECT date, kind, qty, cost, price, ref_no, ref_type, ref_id FROM stock_moves WHERE product_id = ? ORDER BY date DESC, id DESC LIMIT 100`, [id]),
    prices: all(`SELECT h.*, u.name user_name FROM price_history h LEFT JOIN users u ON u.id = h.user_id WHERE product_id = ? ORDER BY h.id DESC LIMIT 50`, [id]),
    avg_cost: avgCost(id),
  };
}

// ───────────── Price list & update ─────────────
export function priceList(u: SessionUser, args: { q?: string; category_id?: number; brand_id?: number } = {}) {
  assertCan(u, 'daily', 'read');
  const w = ['1 = 1'];
  const p: any[] = [];
  if (args.q?.trim()) { const like = `%${args.q.trim()}%`; w.push('(p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ? OR p.model LIKE ?)'); p.push(like, like, like, like); }
  if (args.category_id) { w.push('p.category_id = ?'); p.push(args.category_id); }
  if (args.brand_id) { w.push('p.brand_id = ?'); p.push(args.brand_id); }
  return all(
    `SELECT p.id, p.code, p.name, p.barcode, p.cost, p.price, p.old_price, p.warranty_days, p.price_updated_at, p.currency_id, cu.symbol currency,
       (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = p.id) qty,
       (SELECT d.no FROM doc_lines l JOIN docs d ON d.id = l.doc_id WHERE l.product_id = p.id AND d.kind = 'purchase' ORDER BY d.id DESC LIMIT 1) last_purchase,
       (SELECT GROUP_CONCAT(DISTINCT c.name) FROM stock_moves m JOIN colors c ON c.id = m.color_id WHERE m.product_id = p.id) colors,
       (SELECT GROUP_CONCAT(DISTINCT s.name) FROM stock_moves m JOIN sizes s ON s.id = m.size_id WHERE m.product_id = p.id) sizes
     FROM products p LEFT JOIN currencies cu ON cu.id = p.currency_id WHERE ${w.join(' AND ')} ORDER BY p.name LIMIT 5000`,
    p,
  );
}

export function updatePrices(u: SessionUser, items: { id: number; price: number; currency_id?: number | null }[]) {
  assertCan(u, 'daily', 'edit');
  return tx(() => {
    let n = 0;
    for (const it of items) {
      const old = get(`SELECT price, name FROM products WHERE id = ?`, [it.id]);
      if (!old || it.price === undefined || it.price === null || Number.isNaN(Number(it.price))) continue;
      const np = round2(it.price);
      if (np === round2(old.price) && !it.currency_id) continue;
      insert('price_history', { product_id: it.id, old_price: old.price, new_price: np, currency_id: it.currency_id ?? null, user_id: u.id });
      run(`UPDATE products SET old_price = price, price = ?, currency_id = COALESCE(?, currency_id), price_updated_at = datetime('now','localtime') WHERE id = ?`, [np, it.currency_id ?? null, it.id]);
      n++;
    }
    log(u, 'price', null, 'update', `${n} product price(s) updated`);
    return { updated: n };
  });
}

/** Stock adjustment (opening / correction) — used by Data Management and the product screen. */
export function adjustStock(u: SessionUser, input: { product_id: number; loc?: string; qty: number; cost?: number; note?: string; color_id?: number | null; size_id?: number | null }) {
  assertCan(u, 'inventory', 'edit');
  return tx(() => {
    const [t, id] = parseLoc(input.loc ?? `B:${u.branch_id}`);
    const qty = Number(input.qty);
    if (!qty) throw new HttpError(400, 'Quantity is required.');
    const cost = round2(input.cost ?? avgCost(input.product_id));
    const no = nextNo('adjust');
    const sid = insert('stock_docs', { kind: 'adjust', no, date: today(), from_type: t, from_id: id, note: input.note ?? null, amount: round2(cost * qty), created_by: u.id });
    insert('stock_doc_lines', { stock_doc_id: sid, product_id: input.product_id, color_id: input.color_id ?? null, size_id: input.size_id ?? null, qty, cost });
    addMove({ date: today(), product_id: input.product_id, color_id: input.color_id, size_id: input.size_id, loc_type: t, loc_id: id, qty, cost, kind: qty > 0 ? 'adjust_in' : 'adjust_out', ref_type: 'stock', ref_id: sid, ref_no: no });
    postJournal({ no, date: today(), type: 'adjust', ref_type: 'stock', ref_id: sid, narration: input.note || 'Stock adjustment', created_by: u.id, lines: qty > 0
      ? [{ ledger_id: sys('INVENTORY'), debit: round2(cost * qty) }, { ledger_id: sys('PRODUCT_ADJUST'), credit: round2(cost * qty) }]
      : [{ ledger_id: sys('PRODUCT_ADJUST'), debit: round2(cost * -qty) }, { ledger_id: sys('INVENTORY'), credit: round2(cost * -qty) }] });
    log(u, 'adjust', sid, 'create', `Stock adjusted ${qty > 0 ? '+' : ''}${qty} (${no})`);
    return { id: sid, no };
  });
}

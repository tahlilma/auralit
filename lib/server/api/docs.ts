import 'server-only';
import { all, get, insert, run, round2, setting, today, tx, update, val, type Row } from '../db';
import { assertCan, HttpError, log, type SessionUser } from '../auth';
import {
  addMove, avgCost, deleteJournalsFor, deleteMovesFor, moneyLedgers, nextNo, onHand, partyLedger, postJournal, recordCheques,
  serialLog, sys, walkinCustomerId, type JLine,
} from '../core';
import { DOC_META, docCalc, lineCalc, r2, type DocKind } from '../../calc';
import { sendTemplateSms } from '../sms';

const meta = (kind: string) => {
  const m = DOC_META[kind as DocKind];
  if (!m) throw new HttpError(400, `Unknown document type ${kind}`);
  return m;
};

// ───────────── Editor support ─────────────
export function docSetup(u: SessionUser, kind: DocKind) {
  assertCan(u, meta(kind).module, 'read');
  return {
    money: moneyLedgers(),
    salesPersons: all(`SELECT id value, name label FROM employees WHERE status = 'active' ORDER BY name`),
    colors: all(`SELECT id value, name label, hex FROM colors ORDER BY name`),
    sizes: all(`SELECT id value, name label FROM sizes ORDER BY name`),
    categories: all(`SELECT id, name FROM categories ORDER BY name`),
    subcategories: all(`SELECT id, name, category_id FROM subcategories ORDER BY name`),
    brands: all(`SELECT id, name FROM brands ORDER BY name`),
    districts: all(`SELECT id value, name label FROM districts ORDER BY name`),
    suppliers: meta(kind).party === 'supplier' ? all(`SELECT id value, code || ' - ' || name label, is_opening FROM suppliers WHERE status = 'active' ORDER BY is_opening DESC, name`) : [],
    branches: all(`SELECT id value, name label FROM branches WHERE status = 'active'`),
    reward: { enabled: setting('reward_enabled') === 'yes', spend: Number(setting('reward_spend', '1000')), pointValue: Number(setting('reward_point_value', '1')) },
    allowNegative: setting('allow_negative_stock') === 'yes',
  };
}

function activeOfferSql() {
  return `SELECT o.id, o.name, o.percent, o.fixed, o.effect_on FROM offer_items oi JOIN offers o ON o.id = oi.offer_id
    WHERE o.status = 'active' AND (o.start_date IS NULL OR o.start_date = '' OR o.start_date <= date('now','localtime'))
      AND (o.end_date IS NULL OR o.end_date = '' OR o.end_date >= date('now','localtime'))
      AND ((oi.target_type = 'product' AND oi.target_id = ?) OR (oi.target_type = 'brand' AND oi.target_id = ?)
        OR (oi.target_type = 'category' AND oi.target_id = ?) OR (oi.target_type = 'subcategory' AND oi.target_id = ?))
    ORDER BY CASE oi.target_type WHEN 'product' THEN 0 WHEN 'subcategory' THEN 1 WHEN 'category' THEN 2 ELSE 3 END LIMIT 1`;
}

export function searchItems(u: SessionUser, kind: DocKind, args: { q?: string; category_id?: number; subcategory_id?: number; brand_id?: number; page?: number; size?: number }) {
  const m = meta(kind);
  assertCan(u, m.module, 'read');
  const size = Math.min(args.size ?? 24, 100);
  const off = ((args.page ?? 1) - 1) * size;
  const w: string[] = [`t.status = 'active'`];
  const p: any[] = [];
  if (args.q?.trim()) {
    for (const term of args.q.trim().split(/\s+/)) {
      w.push(m.items === 'product' ? `(t.name LIKE ? OR t.code LIKE ? OR t.model LIKE ? OR t.barcode = ?)` : `(t.name LIKE ? OR t.code LIKE ?)`);
      p.push(`%${term}%`, `%${term}%`, ...(m.items === 'product' ? [`%${term}%`, term] : []));
    }
  }
  if (args.category_id) { w.push('t.category_id = ?'); p.push(args.category_id); }
  if (args.subcategory_id) { w.push('t.subcategory_id = ?'); p.push(args.subcategory_id); }
  if (m.items === 'product' && args.brand_id) { w.push('t.brand_id = ?'); p.push(args.brand_id); }
  if (m.items === 'service') {
    return all(`SELECT t.id, t.code, t.name, t.cost, t.price, c.name category FROM services t LEFT JOIN categories c ON c.id = t.category_id WHERE ${w.join(' AND ')} ORDER BY t.name LIMIT ? OFFSET ?`, [...p, size, off]);
  }
  const rows = all(
    `SELECT t.id, t.code, t.name, t.model, t.mode, t.cost, t.price, t.vat, t.warranty_days, t.image, t.brand_id, t.category_id, t.subcategory_id,
       b.name brand, u.name unit, (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = t.id AND loc_type = 'B' AND loc_id = ?) stock
     FROM products t LEFT JOIN brands b ON b.id = t.brand_id LEFT JOIN units u ON u.id = t.unit_id
     WHERE ${w.join(' AND ')} ORDER BY t.name LIMIT ? OFFSET ?`,
    [u.branch_id, ...p, size, off],
  );
  if (m.party === 'customer') {
    for (const r of rows) r.offer = get(activeOfferSql(), [r.id, r.brand_id ?? 0, r.category_id ?? 0, r.subcategory_id ?? 0]) ?? null;
  }
  return rows;
}

/** Barcode / serial / code scan. Returns the product and, for serial scans, the serial. */
export function scan(u: SessionUser, kind: DocKind, code: string) {
  const m = meta(kind);
  assertCan(u, m.module, 'read');
  const c = code.trim();
  if (!c) return null;
  const serial = m.items === 'product' ? get(`SELECT * FROM serials WHERE serial = ? ORDER BY id DESC LIMIT 1`, [c]) : null;
  const pid = serial?.product_id ?? val<number>(m.items === 'product' ? `SELECT id FROM products WHERE barcode = ? OR code = ? LIMIT 1` : `SELECT id FROM services WHERE code = ? LIMIT 1`, [c, c]);
  if (!pid) return null;
  const item = searchItemsById(u, kind, pid);
  return { item, serial };
}

function searchItemsById(u: SessionUser, kind: DocKind, id: number) {
  const m = meta(kind);
  if (m.items === 'service') return get(`SELECT id, code, name, cost, price FROM services WHERE id = ?`, [id]);
  const r = get(
    `SELECT t.id, t.code, t.name, t.model, t.mode, t.cost, t.price, t.vat, t.warranty_days, t.image, t.brand_id, t.category_id, t.subcategory_id,
       (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = t.id AND loc_type = 'B' AND loc_id = ?) stock FROM products t WHERE t.id = ?`,
    [u.branch_id, id],
  );
  if (r && m.party === 'customer') r.offer = get(activeOfferSql(), [r.id, r.brand_id ?? 0, r.category_id ?? 0, r.subcategory_id ?? 0]) ?? null;
  return r;
}

export function availableSerials(u: SessionUser, productId: number, q?: string) {
  return all(
    `SELECT id, serial, color_id, size_id, expiry FROM serials WHERE product_id = ? AND status = 'instock' AND loc_type = 'B' AND loc_id = ? ${q ? 'AND serial LIKE ?' : ''} ORDER BY id LIMIT 200`,
    q ? [productId, u.branch_id, `%${q}%`] : [productId, u.branch_id],
  );
}

export function searchParties(u: SessionUser, type: 'customer' | 'supplier', q: string) {
  const t = type === 'customer' ? 'customers' : 'suppliers';
  const like = `%${q.trim()}%`;
  return all(
    `SELECT id, code, name, mobile, email, address, ledger_id, ${type === 'customer' ? 'points, get_reward, credit_limit,' : ''}
       (SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE ledger_id = ${t}.ledger_id) balance
     FROM ${t} WHERE status = 'active' AND (name LIKE ? OR code LIKE ? OR mobile LIKE ?) ${type === 'customer' ? 'AND is_walkin = 0' : 'AND is_opening = 0'}
     ORDER BY name LIMIT 20`,
    [like, like, like],
  );
}

export function partyInfo(u: SessionUser, type: 'customer' | 'supplier', id: number) {
  const t = type === 'customer' ? 'customers' : 'suppliers';
  return get(`SELECT *, (SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE ledger_id = ${t}.ledger_id) balance FROM ${t} WHERE id = ?`, [id]);
}

// ───────────── Save ─────────────
export type DocLineIn = {
  product_id?: number | null; service_id?: number | null; name?: string; color_id?: number | null; size_id?: number | null;
  qty: number; rate: number; cost?: number; disc_pct?: number; disc?: number; vat_pct?: number; warranty_days?: number; note?: string;
  serials?: string[]; sale_price?: number; ref_line_id?: number | null; expected_qty?: number;
};
export type DocIn = {
  date?: string; customer_id?: number | null; supplier_id?: number | null;
  walkin?: { name?: string; mobile?: string; email?: string; address?: string; district_id?: number | null; zone_id?: number | null };
  sales_person_id?: number | null; lines: DocLineIn[];
  discount_pct?: number; discount?: number; vat_pct?: number; ait_pct?: number; other_name?: string; other?: number; freight?: number;
  redeem_points?: number; less?: number; coupon?: string;
  exchange?: { product_id?: number | null; name?: string; serial?: string; qty: number; price: number }[];
  payments?: { ledger_id: number; amount: number; cheque_no?: string; cheque_date?: string; ref?: string }[];
  note?: string; ref_doc_id?: number | null; delivery_date?: string; status?: string;
};

function reverseDoc(doc: Row) {
  const id = doc.id;
  // serials created by this doc (purchase / exchange)
  const created = all(`SELECT id, serial, status, sale_doc_id FROM serials WHERE purchase_doc_id = ?`, [id]);
  const sold = created.filter(s => s.status !== 'instock' && s.sale_doc_id !== id);
  if (sold.length) throw new HttpError(409, `Serial ${sold[0].serial} from this document is already sold or moved; reverse that first.`);
  run(`DELETE FROM serial_history WHERE serial_id IN (SELECT id FROM serials WHERE purchase_doc_id = ?)`, [id]);
  run(`DELETE FROM serials WHERE purchase_doc_id = ?`, [id]);
  // serials sold / returned by this doc
  if (doc.kind === 'sale') run(`UPDATE serials SET status = 'instock', sale_doc_id = NULL, customer_id = NULL WHERE sale_doc_id = ? AND status = 'sold'`, [id]);
  if (doc.kind === 'sreturn') {
    for (const l of all(`SELECT serials FROM doc_lines WHERE doc_id = ?`, [id])) for (const s of JSON.parse(l.serials || '[]')) run(`UPDATE serials SET status = 'sold', sale_doc_id = (SELECT ref_doc_id FROM docs WHERE id = ?) WHERE serial = ? AND status = 'instock'`, [id, s]);
  }
  if (doc.kind === 'preturn') {
    for (const l of all(`SELECT serials FROM doc_lines WHERE doc_id = ?`, [id])) for (const s of JSON.parse(l.serials || '[]')) run(`UPDATE serials SET status = 'instock' WHERE serial = ? AND status = 'preturned'`, [s]);
  }
  run(`DELETE FROM serial_history WHERE ref_type = 'doc' AND ref_id = ?`, [id]);
  deleteMovesFor('doc', id);
  deleteJournalsFor('doc', id);
  // points
  if (doc.kind === 'sale' && doc.customer_id) {
    const earned = Number(doc.points_earned ?? 0);
    run(`UPDATE customers SET points = points + ? - ? WHERE id = ?`, [doc.redeem_points ?? 0, earned, doc.customer_id]);
  }
  // returned qty on source lines
  if (doc.kind === 'sreturn' || doc.kind === 'preturn') {
    for (const l of all(`SELECT ref_line_id, qty FROM doc_lines WHERE doc_id = ?`, [id])) if (l.ref_line_id) run(`UPDATE doc_lines SET moved_qty = moved_qty - ? WHERE id = ?`, [l.qty, l.ref_line_id]);
  }
  run(`DELETE FROM doc_lines WHERE doc_id = ?`, [id]);
  run(`DELETE FROM doc_payments WHERE doc_id = ?`, [id]);
  run(`DELETE FROM doc_exchange WHERE doc_id = ?`, [id]);
}

export function saveDoc(u: SessionUser, kind: DocKind, input: DocIn, id?: number) {
  const m = meta(kind);
  assertCan(u, m.module, id ? 'edit' : 'write');
  if (kind === 'sreturn' || kind === 'preturn') return saveReturn(u, kind, input, id);
  const lines = (input.lines ?? []).filter(l => (l.product_id || l.service_id || l.name) && Number(l.qty) > 0);
  if (!lines.length) throw new HttpError(400, 'Add at least one item.');
  const date = input.date || today();

  return tx(() => {
    let old: Row | undefined;
    if (id) {
      old = get(`SELECT * FROM docs WHERE id = ? AND kind = ?`, [id, kind]);
      if (!old) throw new HttpError(404, 'Document not found.');
      const lockH = Number(setting('edit_lock_hours', '0'));
      if (lockH > 0 && !u.is_admin && (Date.now() - new Date(old.created_at.replace(' ', 'T')).getTime()) / 3600000 > lockH) throw new HttpError(403, `Documents can only be edited within ${lockH} hours.`);
      if (val<number>(`SELECT COUNT(*) FROM docs WHERE ref_doc_id = ? AND kind IN ('sreturn','preturn')`, [id])) throw new HttpError(409, 'This invoice has returns. Delete the returns before editing it.');
      if (val<number>(`SELECT COUNT(*) FROM stock_docs WHERE doc_id = ?`, [id])) throw new HttpError(409, 'This invoice has deliveries/receives. Delete those before editing it.');
      reverseDoc(old);
    }

    // party
    let customerId: number | null = null, supplierId: number | null = null;
    if (m.party === 'customer') customerId = input.customer_id || walkinCustomerId();
    else {
      supplierId = input.supplier_id ?? null;
      if (!supplierId) throw new HttpError(400, 'Select a supplier.');
    }
    const isWalkin = m.party === 'customer' && customerId === walkinCustomerId();
    const customer = customerId ? get(`SELECT * FROM customers WHERE id = ?`, [customerId]) : null;
    const supplier = supplierId ? get(`SELECT * FROM suppliers WHERE id = ?`, [supplierId]) : null;

    // rewards
    let redeemPts = Math.max(0, Number(input.redeem_points) || 0);
    const pointValue = Number(setting('reward_point_value', '1'));
    if (kind !== 'sale') redeemPts = 0;
    if (redeemPts && (!customer || isWalkin)) throw new HttpError(400, 'Points can only be redeemed by a registered customer.');
    if (redeemPts > Number(customer?.points ?? 0) + (old?.customer_id === customerId ? Number(old?.redeem_points ?? 0) : 0)) throw new HttpError(400, 'Not enough reward points.');
    const redeem = r2(redeemPts * pointValue);

    const exchange = kind === 'sale' ? (input.exchange ?? []).filter(e => Number(e.qty) > 0 && Number(e.price) >= 0 && (e.product_id || e.name)) : [];
    const exchangeTotal = r2(exchange.reduce((s, e) => s + Number(e.qty) * Number(e.price), 0));

    // item costs (sale cost = moving average)
    const prepared = lines.map(l => {
      const qty = l.serials?.length && m.stock !== 0 ? l.serials.length : Number(l.qty);
      let cost = 0;
      if (m.items === 'product' && l.product_id) cost = m.rate === 'cost' ? Number(l.rate) : avgCost(l.product_id);
      else if (l.service_id) cost = Number(l.cost ?? val(`SELECT cost FROM services WHERE id = ?`, [l.service_id]) ?? 0);
      return { ...l, qty, cost, calc: lineCalc({ qty, rate: Number(l.rate), disc_pct: l.disc_pct, disc: l.disc, vat_pct: l.vat_pct }) };
    });
    const t = docCalc(prepared.map(p => ({ qty: p.qty, rate: Number(p.rate), disc_pct: p.disc_pct, disc: p.disc, vat_pct: p.vat_pct })), {
      discount_pct: input.discount_pct, discount: input.discount, vat_pct: input.vat_pct, ait_pct: input.ait_pct, other: input.other,
      freight: input.freight, redeem, less: input.less, exchange: exchangeTotal,
    });
    const payments = m.payments ? (input.payments ?? []).filter(p => Number(p.amount) > 0) : [];
    const paid = r2(payments.reduce((s, p) => s + Number(p.amount), 0));
    if (isWalkin && kind === 'sale' && paid < t.total - 0.009 && setting('walkin_due_allowed', 'no') !== 'yes') {
      throw new HttpError(400, `Walk-in customers must pay in full (due ${r2(t.total - paid)}). Select or create a customer to sell on credit.`);
    }
    const costTotal = r2(prepared.reduce((s, p) => s + p.cost * p.qty, 0));
    const pointsEarned = kind === 'sale' && customer && !isWalkin && customer.get_reward && setting('reward_enabled') === 'yes'
      ? Math.floor(t.total / Math.max(1, Number(setting('reward_spend', '1000')))) : 0;

    const row: Row = {
      kind, date, customer_id: customerId, supplier_id: supplierId,
      walkin_name: isWalkin ? input.walkin?.name || 'Walk-in Customer' : null, walkin_mobile: isWalkin ? input.walkin?.mobile || null : null,
      walkin_email: isWalkin ? input.walkin?.email || null : null, walkin_address: isWalkin ? input.walkin?.address || null : null,
      walkin_district_id: isWalkin ? input.walkin?.district_id || null : null, walkin_zone_id: isWalkin ? input.walkin?.zone_id || null : null,
      branch_id: u.branch_id, sales_person_id: input.sales_person_id || null,
      gross: t.gross, item_discount: t.itemDiscount, discount_pct: Number(input.discount_pct) || 0, discount: t.discount,
      vat_pct: Number(input.vat_pct) || 0, vat: t.vat, ait_pct: Number(input.ait_pct) || 0, ait: t.ait, other_name: input.other_name || null,
      other: t.other, freight: t.freight, redeem_points: redeemPts, redeem, less: t.less, exchange: exchangeTotal, total: t.total, paid,
      cost_total: costTotal, note: input.note || null, ref_doc_id: input.ref_doc_id || null, delivery_date: input.delivery_date || null,
      coupon: input.coupon || null, status: old?.status && old.status !== 'final' ? old.status : 'final',
    };
    let docId: number, no: string;
    if (old) {
      docId = old.id; no = old.no;
      update('docs', docId, { ...row, updated_by: u.id, updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    } else {
      no = nextNo(kind, date);
      docId = insert('docs', { ...row, no, created_by: u.id });
    }
    run(`UPDATE docs SET cost_total = ?, points_earned = ? WHERE id = ?`, [costTotal, pointsEarned, docId]);

    // lines, stock, serials
    for (const p of prepared) {
      const product = p.product_id ? get(`SELECT id, name, mode, price FROM products WHERE id = ?`, [p.product_id]) : null;
      const name = p.name || product?.name || (p.service_id ? val(`SELECT name FROM services WHERE id = ?`, [p.service_id]) : '') || 'Item';
      const serials = (p.serials ?? []).map(s => s.trim()).filter(Boolean);
      const lineId = insert('doc_lines', {
        doc_id: docId, product_id: p.product_id || null, service_id: p.service_id || null, color_id: p.color_id || null, size_id: p.size_id || null,
        name, qty: p.qty, cost: r2(m.rate === 'cost' ? p.calc.net / (p.qty || 1) : p.cost), price: Number(p.rate), disc_pct: Number(p.disc_pct) || 0,
        disc: Number(p.disc) || 0, vat_pct: Number(p.vat_pct) || 0, warranty_days: Number(p.warranty_days) || 0, note: p.note || null,
        serials: JSON.stringify(serials), subtotal: p.calc.subtotal, sale_price: Number(p.sale_price) || 0, expected_qty: Number(p.expected_qty) || 0,
      });
      if (!product || m.stock === 0) continue;
      if (kind === 'sale') {
        if (serials.length) {
          for (const s of serials) {
            const sr = get(`SELECT * FROM serials WHERE serial = ? AND product_id = ? ORDER BY id DESC LIMIT 1`, [s, product.id]);
            if (!sr) throw new HttpError(400, `Serial ${s} not found for ${name}.`);
            if (sr.status !== 'instock') throw new HttpError(400, `Serial ${s} is not in stock (${sr.status}).`);
            run(`UPDATE serials SET status = 'sold', sale_doc_id = ?, customer_id = ?, updated_at = datetime('now','localtime') WHERE id = ?`, [docId, customerId, sr.id]);
            serialLog(sr.id, 'sold', 'doc', docId, no);
          }
        } else if (product.mode === 'serial' || product.mode === 'imei') {
          throw new HttpError(400, `${name} needs ${product.mode === 'imei' ? 'IMEI' : 'serial'} numbers.`);
        }
        if (setting('allow_negative_stock') !== 'yes') {
          const have = onHand(product.id, { color_id: p.color_id, size_id: p.size_id, loc_type: 'B', loc_id: u.branch_id });
          if (have < p.qty) throw new HttpError(400, `Not enough stock for ${name}: ${have} available, ${p.qty} requested.`);
        }
        addMove({ date, product_id: product.id, color_id: p.color_id, size_id: p.size_id, loc_type: 'B', loc_id: u.branch_id, qty: -p.qty, cost: p.cost, price: p.calc.net / p.qty, kind: 'sale', ref_type: 'doc', ref_id: docId, ref_no: no });
      } else if (kind === 'purchase') {
        const unit = r2(p.calc.net / (p.qty || 1));
        if (serials.length) {
          if (new Set(serials).size !== serials.length) throw new HttpError(400, `Duplicate serials for ${name}.`);
          for (const s of serials) {
            const dup = get(`SELECT id FROM serials WHERE serial = ? AND product_id = ? AND status = 'instock'`, [s, product.id]);
            if (dup) throw new HttpError(400, `Serial ${s} is already in stock.`);
            const sid = insert('serials', { product_id: product.id, serial: s, color_id: p.color_id || null, size_id: p.size_id || null, status: 'instock', loc_type: 'B', loc_id: u.branch_id, cost: unit, purchase_doc_id: docId, supplier_id: supplierId });
            serialLog(sid, 'purchased', 'doc', docId, no);
          }
        } else if (product.mode === 'serial' || product.mode === 'imei') {
          throw new HttpError(400, `${name} needs ${product.mode === 'imei' ? 'IMEI' : 'serial'} numbers.`);
        }
        addMove({ date, product_id: product.id, color_id: p.color_id, size_id: p.size_id, loc_type: 'B', loc_id: u.branch_id, qty: p.qty, cost: unit, kind: supplier?.is_opening ? 'opening' : 'purchase', ref_type: 'doc', ref_id: docId, ref_no: no });
        run(`UPDATE products SET cost = ? WHERE id = ?`, [unit, product.id]);
        if (Number(p.sale_price) > 0 && r2(p.sale_price!) !== r2(product.price)) {
          insert('price_history', { product_id: product.id, old_price: product.price, new_price: p.sale_price, user_id: u.id });
          run(`UPDATE products SET old_price = price, price = ?, price_updated_at = datetime('now','localtime') WHERE id = ?`, [p.sale_price, product.id]);
        }
      }
      void lineId;
    }

    // exchange (trade-in) items come back into stock
    for (const e of exchange) {
      insert('doc_exchange', { doc_id: docId, product_id: e.product_id || null, name: e.name || null, serial: e.serial || null, qty: Number(e.qty), cost: Number(e.price), price: Number(e.price) });
      if (e.product_id) {
        addMove({ date, product_id: e.product_id, loc_type: 'B', loc_id: u.branch_id, qty: Number(e.qty), cost: Number(e.price), kind: 'exchange', ref_type: 'doc', ref_id: docId, ref_no: no, serial: e.serial || null });
        if (e.serial) {
          const sid = insert('serials', { product_id: e.product_id, serial: e.serial, status: 'instock', loc_type: 'B', loc_id: u.branch_id, cost: Number(e.price), purchase_doc_id: docId, customer_id: customerId });
          serialLog(sid, 'exchange in', 'doc', docId, no);
        }
      }
    }

    for (const p of payments) insert('doc_payments', { doc_id: docId, ledger_id: p.ledger_id, amount: r2(p.amount), cheque_no: p.cheque_no || null, cheque_date: p.cheque_date || null, ref: p.ref || null });

    // points
    if (kind === 'sale' && customer && !isWalkin) run(`UPDATE customers SET points = points - ? + ?, last_active = datetime('now','localtime') WHERE id = ?`, [redeemPts, pointsEarned, customerId]);
    if (supplier) run(`UPDATE suppliers SET last_active = datetime('now','localtime') WHERE id = ?`, [supplierId]);

    // accounting
    if (m.posts) {
      const jl: JLine[] = [];
      if (kind === 'sale' || kind === 'service') {
        const party = partyLedger('customer', customerId!);
        jl.push({ ledger_id: sys(kind === 'sale' ? 'SALES' : 'SERVICE_INCOME'), credit: t.gross });
        jl.push({ ledger_id: sys('DISC_ITEM'), debit: t.itemDiscount });
        jl.push({ ledger_id: sys('DISC_SALES'), debit: t.discount });
        jl.push({ ledger_id: sys('VAT_OUT'), credit: t.vat });
        jl.push({ ledger_id: sys('AIT_OUT'), credit: t.ait });
        jl.push({ ledger_id: sys('OTHER_SALES'), credit: t.other, memo: input.other_name || null });
        jl.push({ ledger_id: sys('FREIGHT_SALES'), credit: t.freight });
        jl.push({ ledger_id: sys('REWARD'), debit: redeem });
        jl.push({ ledger_id: sys('LESS_SALES'), debit: t.less });
        jl.push({ ledger_id: sys('INVENTORY'), debit: exchangeTotal, memo: 'Exchange items' });
        jl.push({ ledger_id: party, debit: t.total });
        if (kind === 'sale' && costTotal) { jl.push({ ledger_id: sys('COGS'), debit: costTotal }); jl.push({ ledger_id: sys('INVENTORY'), credit: costTotal }); }
        for (const p of payments) {
          jl.push({ ledger_id: p.ledger_id, debit: p.amount, cheque_no: p.cheque_no, cheque_date: p.cheque_date, ref: p.ref, pair_ledger_id: party });
          jl.push({ ledger_id: party, credit: p.amount });
        }
        const jid = postJournal({ no, date, type: kind, ref_type: 'doc', ref_id: docId, narration: `${m.label} ${no}`, created_by: u.id, branch_id: u.branch_id, lines: jl });
        if (jid) recordCheques(jid, date, no, 'in', jl.filter(l => l.cheque_no && l.debit), party);
      } else if (kind === 'purchase') {
        const party = supplier!.is_opening ? sys('OPENING') : partyLedger('supplier', supplierId!);
        jl.push({ ledger_id: sys('INVENTORY'), debit: t.base });
        jl.push({ ledger_id: sys('DISC_PURCHASE'), credit: t.discount });
        jl.push({ ledger_id: sys('VAT_IN'), debit: t.vat });
        jl.push({ ledger_id: sys('TAX_IN'), debit: t.ait });
        jl.push({ ledger_id: sys('OTHER_PURCHASE'), debit: t.other, memo: input.other_name || null });
        jl.push({ ledger_id: sys('FREIGHT_PURCHASE'), debit: t.freight });
        jl.push({ ledger_id: sys('LESS_PURCHASE'), credit: t.less });
        jl.push({ ledger_id: party, credit: t.total });
        for (const p of payments) {
          jl.push({ ledger_id: p.ledger_id, credit: p.amount, cheque_no: p.cheque_no, cheque_date: p.cheque_date, ref: p.ref, pair_ledger_id: party });
          jl.push({ ledger_id: party, debit: p.amount });
        }
        const jid = postJournal({ no, date, type: 'purchase', ref_type: 'doc', ref_id: docId, narration: `Purchase ${no}`, created_by: u.id, branch_id: u.branch_id, lines: jl });
        if (jid) recordCheques(jid, date, no, 'out', jl.filter(l => l.cheque_no && l.credit), party);
      }
    }

    // source document status (estimate → invoice, order → invoice)
    if (input.ref_doc_id && !old) {
      const src = get(`SELECT kind FROM docs WHERE id = ?`, [input.ref_doc_id]);
      if (src && ['estimate', 'porder', 'sestimate'].includes(src.kind)) run(`UPDATE docs SET status = 'invoiced' WHERE id = ?`, [input.ref_doc_id]);
    }

    log(u, kind, docId, old ? 'update' : 'create', `${m.label} ${no} ${old ? 'updated' : 'created'} — total ${t.total.toFixed(2)}`);
    if (!old && (kind === 'sale' || kind === 'service') && customer) {
      const mobile = isWalkin ? input.walkin?.mobile : customer.mobile;
      if (mobile) {
        const due = r2(val<number>(`SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE ledger_id = ?`, [customer.ledger_id]) ?? 0);
        sendTemplateSms('invoice', mobile, { INVOICE_NO: no, INVOICE_TOTAL: t.total.toFixed(2), CASH_AMOUNT: paid.toFixed(2), INVOICE_DUE: r2(t.total - paid).toFixed(2), TOT_DUE: isWalkin ? r2(t.total - paid).toFixed(2) : due.toFixed(2), INV_URL: '' });
      }
    }
    return { id: docId, no, total: t.total };
  });
}

// ───────────── Returns ─────────────
function saveReturn(u: SessionUser, kind: 'sreturn' | 'preturn', input: DocIn, id?: number) {
  const srcId = input.ref_doc_id;
  if (!srcId) throw new HttpError(400, 'Select the invoice to return against.');
  return tx(() => {
    let old: Row | undefined;
    if (id) {
      old = get(`SELECT * FROM docs WHERE id = ? AND kind = ?`, [id, kind]);
      if (!old) throw new HttpError(404, 'Return not found.');
      reverseDoc(old);
    }
    const src = get(`SELECT * FROM docs WHERE id = ?`, [srcId]);
    if (!src || src.kind !== (kind === 'sreturn' ? 'sale' : 'purchase')) throw new HttpError(400, 'Invalid source invoice.');
    const date = input.date || today();
    const no = old?.no ?? nextNo(kind, date);
    const lines = (input.lines ?? []).filter(l => Number(l.qty) > 0 && l.ref_line_id);
    if (!lines.length) throw new HttpError(400, 'Enter a return quantity for at least one item.');

    let total = 0, costTotal = 0;
    const prepared = lines.map(l => {
      const sl = get(`SELECT * FROM doc_lines WHERE id = ? AND doc_id = ?`, [l.ref_line_id, srcId]);
      if (!sl) throw new HttpError(400, 'Invalid invoice line.');
      const serials = (l.serials ?? []).filter(Boolean);
      const qty = serials.length || Number(l.qty);
      const left = r2(sl.qty - sl.moved_qty);
      if (qty > left + 1e-9) throw new HttpError(400, `${sl.name}: only ${left} can be returned.`);
      const unit = kind === 'sreturn' ? r2(sl.subtotal / sl.qty) : r2(lineCalc({ qty: sl.qty, rate: sl.price, disc_pct: sl.disc_pct, disc: sl.disc }).net / sl.qty);
      const amount = r2(unit * qty);
      total += amount;
      costTotal += r2(sl.cost * qty);
      return { sl, qty, unit, amount, serials };
    });
    total = r2(total); costTotal = r2(costTotal);
    const payments = (input.payments ?? []).filter(p => Number(p.amount) > 0);
    const paid = r2(payments.reduce((s, p) => s + Number(p.amount), 0));
    if (paid > total + 0.009) throw new HttpError(400, 'Refund cannot exceed the return total.');
    const row: Row = {
      kind, date, customer_id: src.customer_id, supplier_id: src.supplier_id, branch_id: u.branch_id, gross: total, total, paid,
      adjust: r2(total - paid), cost_total: costTotal, note: input.note || null, ref_doc_id: srcId, status: 'final',
      walkin_name: src.walkin_name, walkin_mobile: src.walkin_mobile,
    };
    let docId: number;
    if (old) { docId = old.id; update('docs', docId, { ...row, updated_by: u.id }); }
    else docId = insert('docs', { ...row, no, created_by: u.id });

    for (const p of prepared) {
      insert('doc_lines', {
        doc_id: docId, product_id: p.sl.product_id, color_id: p.sl.color_id, size_id: p.sl.size_id, name: p.sl.name, qty: p.qty,
        cost: p.sl.cost, price: p.unit, subtotal: p.amount, serials: JSON.stringify(p.serials), ref_line_id: p.sl.id,
      });
      run(`UPDATE doc_lines SET moved_qty = moved_qty + ? WHERE id = ?`, [p.qty, p.sl.id]);
      if (!p.sl.product_id) continue;
      for (const s of p.serials) {
        const sr = get(`SELECT * FROM serials WHERE serial = ? AND product_id = ? ORDER BY id DESC LIMIT 1`, [s, p.sl.product_id]);
        if (!sr) throw new HttpError(400, `Serial ${s} not found.`);
        if (kind === 'sreturn') {
          if (sr.sale_doc_id !== srcId) throw new HttpError(400, `Serial ${s} was not sold on this invoice.`);
          run(`UPDATE serials SET status = 'instock', sale_doc_id = NULL, customer_id = NULL, loc_type = 'B', loc_id = ? WHERE id = ?`, [u.branch_id, sr.id]);
          serialLog(sr.id, 'sales return', 'doc', docId, no);
        } else {
          if (sr.status !== 'instock') throw new HttpError(400, `Serial ${s} is not in stock.`);
          run(`UPDATE serials SET status = 'preturned' WHERE id = ?`, [sr.id]);
          serialLog(sr.id, 'purchase return', 'doc', docId, no);
        }
      }
      if (kind === 'preturn' && setting('allow_negative_stock') !== 'yes') {
        const have = onHand(p.sl.product_id, { color_id: p.sl.color_id, size_id: p.sl.size_id, loc_type: 'B', loc_id: u.branch_id });
        if (have < p.qty) throw new HttpError(400, `Not enough stock to return ${p.sl.name}: ${have} available.`);
      }
      addMove({
        date, product_id: p.sl.product_id, color_id: p.sl.color_id, size_id: p.sl.size_id, loc_type: 'B', loc_id: u.branch_id,
        qty: kind === 'sreturn' ? p.qty : -p.qty, cost: p.sl.cost, price: p.unit, kind, ref_type: 'doc', ref_id: docId, ref_no: no,
      });
    }
    for (const p of payments) insert('doc_payments', { doc_id: docId, ledger_id: p.ledger_id, amount: r2(p.amount), cheque_no: p.cheque_no || null, cheque_date: p.cheque_date || null, ref: p.ref || null });

    const jl: JLine[] = [];
    if (kind === 'sreturn') {
      const party = partyLedger('customer', src.customer_id);
      jl.push({ ledger_id: sys('SALES_RETURN'), debit: total }, { ledger_id: party, credit: total });
      jl.push({ ledger_id: sys('INVENTORY'), debit: costTotal }, { ledger_id: sys('COGS'), credit: costTotal });
      for (const p of payments) jl.push({ ledger_id: party, debit: p.amount }, { ledger_id: p.ledger_id, credit: p.amount, cheque_no: p.cheque_no, cheque_date: p.cheque_date });
    } else {
      const sup = get(`SELECT * FROM suppliers WHERE id = ?`, [src.supplier_id]);
      const party = sup?.is_opening ? sys('OPENING') : partyLedger('supplier', src.supplier_id);
      jl.push({ ledger_id: party, debit: total }, { ledger_id: sys('INVENTORY'), credit: total });
      for (const p of payments) jl.push({ ledger_id: p.ledger_id, debit: p.amount, cheque_no: p.cheque_no, cheque_date: p.cheque_date }, { ledger_id: party, credit: p.amount });
    }
    postJournal({ no, date, type: kind, ref_type: 'doc', ref_id: docId, narration: `${kind === 'sreturn' ? 'Sales' : 'Purchase'} return ${no} against ${src.no}`, created_by: u.id, branch_id: u.branch_id, lines: jl });
    log(u, kind, docId, old ? 'update' : 'create', `${kind === 'sreturn' ? 'Sales' : 'Purchase'} return ${no} against ${src.no} — ${total.toFixed(2)}`);
    return { id: docId, no, total };
  });
}

/** Lines of an invoice with returnable quantities (for the return editor). */
export function returnSource(u: SessionUser, kind: 'sreturn' | 'preturn', q: string) {
  assertCan(u, meta(kind).module, 'read');
  const srcKind = kind === 'sreturn' ? 'sale' : 'purchase';
  let doc = get(`SELECT * FROM docs WHERE kind = ? AND (no = ? OR id = ?)`, [srcKind, q.trim(), Number(q) || -1]);
  if (!doc) {
    const sr = get(`SELECT * FROM serials WHERE serial = ? ORDER BY id DESC LIMIT 1`, [q.trim()]);
    if (sr) doc = get(`SELECT * FROM docs WHERE id = ? AND kind = ?`, [srcKind === 'sale' ? sr.sale_doc_id : sr.purchase_doc_id, srcKind]);
  }
  if (!doc) return null;
  const lines = all(
    `SELECT l.*, p.code, p.mode, c.name color, s.name size FROM doc_lines l LEFT JOIN products p ON p.id = l.product_id
     LEFT JOIN colors c ON c.id = l.color_id LEFT JOIN sizes s ON s.id = l.size_id WHERE l.doc_id = ?`,
    [doc.id],
  );
  for (const l of lines) {
    const ser: string[] = JSON.parse(l.serials || '[]');
    l.serials = ser;
    l.returnable_serials = kind === 'sreturn'
      ? all(`SELECT serial FROM serials WHERE sale_doc_id = ? AND product_id = ? AND status = 'sold'`, [doc.id, l.product_id]).map(r => r.serial).filter(s => ser.includes(s))
      : all(`SELECT serial FROM serials WHERE purchase_doc_id = ? AND product_id = ? AND status = 'instock'`, [doc.id, l.product_id]).map(r => r.serial);
  }
  const party = doc.customer_id ? get(`SELECT name, code, mobile FROM customers WHERE id = ?`, [doc.customer_id]) : get(`SELECT name, code, mobile FROM suppliers WHERE id = ?`, [doc.supplier_id]);
  return { doc, lines, party };
}

// ───────────── Read / list / delete ─────────────
export function getDoc(u: SessionUser, id: number) {
  const doc = get(
    `SELECT d.*, uc.name created_by_name, uu.name updated_by_name, e.name sales_person, b.name branch_name, r.no ref_no, r.kind ref_kind,
       di.name walkin_district, z.name walkin_zone
     FROM docs d LEFT JOIN users uc ON uc.id = d.created_by LEFT JOIN users uu ON uu.id = d.updated_by LEFT JOIN employees e ON e.id = d.sales_person_id
     LEFT JOIN branches b ON b.id = d.branch_id LEFT JOIN docs r ON r.id = d.ref_doc_id LEFT JOIN districts di ON di.id = d.walkin_district_id
     LEFT JOIN zones z ON z.id = d.walkin_zone_id WHERE d.id = ?`,
    [id],
  );
  if (!doc) throw new HttpError(404, 'Document not found.');
  assertCan(u, meta(doc.kind).module, 'read');
  const lines = all(
    `SELECT l.*, p.code, p.mode, p.model, un.name unit, c.name color, s.name size, sv.code service_code
     FROM doc_lines l LEFT JOIN products p ON p.id = l.product_id LEFT JOIN units un ON un.id = p.unit_id LEFT JOIN colors c ON c.id = l.color_id
     LEFT JOIN sizes s ON s.id = l.size_id LEFT JOIN services sv ON sv.id = l.service_id WHERE l.doc_id = ? ORDER BY l.id`,
    [id],
  ).map(l => ({ ...l, serials: JSON.parse(l.serials || '[]') }));
  const payments = all(`SELECT p.*, l.name ledger_name, l.kind FROM doc_payments p JOIN ledgers l ON l.id = p.ledger_id WHERE p.doc_id = ?`, [id]);
  const exchange = all(`SELECT * FROM doc_exchange WHERE doc_id = ?`, [id]);
  const party = doc.customer_id
    ? get(`SELECT c.*, d.name district, z.name zone, (SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE ledger_id = c.ledger_id) balance FROM customers c LEFT JOIN districts d ON d.id = c.district_id LEFT JOIN zones z ON z.id = c.zone_id WHERE c.id = ?`, [doc.customer_id])
    : doc.supplier_id ? get(`SELECT s.*, (SELECT COALESCE(SUM(credit-debit),0) FROM journal_lines WHERE ledger_id = s.ledger_id) balance FROM suppliers s WHERE s.id = ?`, [doc.supplier_id]) : null;
  const related = all(`SELECT id, kind, no, date, total FROM docs WHERE ref_doc_id = ? ORDER BY id`, [id]);
  const company = get(`SELECT * FROM company WHERE id = 1`);
  const notes = { invoice_note: setting('invoice_note'), invoice_terms: setting('invoice_terms'), pos_receipt_note: setting('pos_receipt_note'), show_serial: setting('show_serial_on_invoice', 'yes') === 'yes', pos_name: setting('pos_name') };
  return { doc, lines, payments, exchange, party, related, company, notes };
}

export type DocListArgs = { q?: string; from?: string; to?: string; page?: number; size?: number; party_id?: number; status?: string };

export function listDocs(u: SessionUser, kind: DocKind, args: DocListArgs = {}) {
  const m = meta(kind);
  assertCan(u, m.module, 'read');
  const w = ['d.kind = ?'];
  const p: any[] = [kind];
  if (args.from) { w.push('d.date >= ?'); p.push(args.from); }
  if (args.to) { w.push('d.date <= ?'); p.push(args.to); }
  if (args.status) { w.push('d.status = ?'); p.push(args.status); }
  if (args.party_id) { w.push(m.party === 'customer' ? 'd.customer_id = ?' : 'd.supplier_id = ?'); p.push(args.party_id); }
  if (args.q?.trim()) {
    const like = `%${args.q.trim()}%`;
    w.push(`(d.no LIKE ? OR pt.name LIKE ? OR pt.mobile LIKE ? OR pt.code LIKE ? OR d.walkin_name LIKE ? OR d.walkin_mobile LIKE ? OR d.note LIKE ?
      OR EXISTS (SELECT 1 FROM doc_lines dl WHERE dl.doc_id = d.id AND (dl.name LIKE ? OR dl.serials LIKE ?)))`);
    p.push(like, like, like, like, like, like, like, like, like);
  }
  const join = m.party === 'customer' ? 'LEFT JOIN customers pt ON pt.id = d.customer_id' : 'LEFT JOIN suppliers pt ON pt.id = d.supplier_id';
  const where = w.join(' AND ');
  const size = Math.min(args.size ?? 25, 5000);
  const page = Math.max(args.page ?? 1, 1);
  const total = val<number>(`SELECT COUNT(*) FROM docs d ${join} WHERE ${where}`, p) ?? 0;
  const sums = get(`SELECT COALESCE(SUM(d.total),0) total, COALESCE(SUM(d.paid),0) paid FROM docs d ${join} WHERE ${where}`, p);
  const rows = all(
    `SELECT d.id, d.no, d.seq, d.date, d.total, d.paid, d.adjust, d.note, d.status, d.approved, d.delivery_date, d.created_at, d.updated_at,
       COALESCE(CASE WHEN pt.is_walkin = 1 THEN d.walkin_name END, pt.name) party, COALESCE(CASE WHEN pt.is_walkin = 1 THEN d.walkin_mobile END, pt.mobile) mobile, pt.code party_code,
       ${m.party === 'customer' ? 'd.customer_id' : 'd.supplier_id'} party_id, uc.name created_by_name, uu.name updated_by_name, r.no ref_no,
       (SELECT COUNT(*) FROM docs x WHERE x.ref_doc_id = d.id) related_count,
       (SELECT COALESCE(SUM(x.total),0) FROM docs x WHERE x.ref_doc_id = d.id AND x.kind IN ('sreturn','preturn')) returned
     FROM docs d ${join} LEFT JOIN users uc ON uc.id = d.created_by LEFT JOIN users uu ON uu.id = d.updated_by LEFT JOIN docs r ON r.id = d.ref_doc_id
     WHERE ${where} ORDER BY d.date DESC, d.id DESC LIMIT ? OFFSET ?`,
    [...p, size, (page - 1) * size],
  );
  for (const r of rows) r.due = r2(r.total - r.paid - (kind === 'sale' || kind === 'service' || kind === 'purchase' ? receivedAgainst(r.id) + r.returned : 0));
  return { rows, total, page, size, sums };
}

/** Amount collected later against an invoice through receipt/payment vouchers ("Type Invoice No"). */
function receivedAgainst(docId: number): number {
  return r2(val<number>(`SELECT COALESCE(SUM(CASE WHEN j.type = 'receipt' THEN jl.credit ELSE jl.debit END), 0) FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.ref_doc_id = ? AND j.type IN ('receipt','payment')`, [docId]) ?? 0);
}

export function deleteDoc(u: SessionUser, id: number) {
  const doc = get(`SELECT * FROM docs WHERE id = ?`, [id]);
  if (!doc) throw new HttpError(404, 'Document not found.');
  assertCan(u, meta(doc.kind).module, 'delete');
  return tx(() => {
    const deps = val<number>(`SELECT COUNT(*) FROM docs WHERE ref_doc_id = ? AND kind IN ('sreturn','preturn')`, [id]) ?? 0;
    if (deps) throw new HttpError(409, 'This invoice has returns. Delete the returns first.');
    const stockDeps = val<number>(`SELECT COUNT(*) FROM stock_docs WHERE doc_id = ?`, [id]) ?? 0;
    if (stockDeps) throw new HttpError(409, 'This invoice has deliveries/receives. Delete those first.');
    reverseDoc(doc);
    run(`UPDATE docs SET ref_doc_id = NULL WHERE ref_doc_id = ?`, [id]);
    if (doc.ref_doc_id) run(`UPDATE docs SET status = 'final' WHERE id = ? AND status = 'invoiced'`, [doc.ref_doc_id]);
    run(`DELETE FROM docs WHERE id = ?`, [id]);
    log(u, doc.kind, id, 'delete', `${meta(doc.kind).label} ${doc.no} deleted`);
    return { ok: true };
  });
}

export function setDocStatus(u: SessionUser, id: number, patch: { approved?: boolean; status?: string }) {
  const doc = get(`SELECT * FROM docs WHERE id = ?`, [id]);
  if (!doc) throw new HttpError(404, 'Document not found.');
  assertCan(u, meta(doc.kind).module, 'edit');
  if (patch.approved !== undefined) run(`UPDATE docs SET approved = ? WHERE id = ?`, [patch.approved ? 1 : 0, id]);
  if (patch.status) run(`UPDATE docs SET status = ? WHERE id = ?`, [patch.status, id]);
  log(u, doc.kind, id, 'update', `${meta(doc.kind).label} ${doc.no} ${patch.approved !== undefined ? (patch.approved ? 'approved' : 'unapproved') : `marked ${patch.status}`}`);
  return { ok: true };
}

// ───────────── Held carts ─────────────
export function holdCart(u: SessionUser, kind: string, name: string, data: unknown) {
  return { id: insert('held_carts', { user_id: u.id, kind, name: name || `Cart ${new Date().toLocaleTimeString()}`, data: JSON.stringify(data) }) };
}
export function heldCarts(u: SessionUser, kind: string) {
  return all(`SELECT id, name, created_at, data FROM held_carts WHERE kind = ? AND (user_id = ? OR ?) ORDER BY id DESC`, [kind, u.id, u.is_admin ? 1 : 0])
    .map(r => ({ ...r, data: JSON.parse(r.data) }));
}
export function dropHeldCart(u: SessionUser, id: number) {
  run(`DELETE FROM held_carts WHERE id = ? AND (user_id = ? OR ?)`, [id, u.id, u.is_admin ? 1 : 0]);
  return { ok: true };
}

export function docCsv(u: SessionUser, kind: DocKind, from: string, to: string) {
  const r = listDocs(u, kind, { from, to, size: 5000 });
  return r.rows;
}

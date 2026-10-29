import 'server-only';
import { all, get, insert, run, round2, today, tx, update, val, type Row } from '../db';
import { assertCan, HttpError, log, type SessionUser } from '../auth';
import { addMove, avgCost, deleteJournalsFor, deleteMovesFor, nextNo, partyLedger, postJournal, serialLog, sys } from '../core';

// ═════════════ Warranty ═════════════
export const CLAIM_STATUS: Record<string, string> = {
  received: 'Received', checked: 'Checked', in_service: 'At Service Center', ready: 'Ready To Deliver', delivered: 'Delivered',
  replaced: 'Replaced', rejected: 'Rejected', sent_supplier: 'Claimed To Supplier', written_off: 'Written Off', restocked: 'Restocked',
};

/** Look up a sold serial (or invoice + product) to start a warranty claim. */
export function warrantyLookup(u: SessionUser, q: string) {
  assertCan(u, 'warranty', 'read');
  const s = q.trim();
  const sr = get(`SELECT * FROM serials WHERE serial = ? ORDER BY id DESC LIMIT 1`, [s]);
  const docs = sr?.sale_doc_id
    ? all(`SELECT * FROM docs WHERE id = ?`, [sr.sale_doc_id])
    : all(`SELECT * FROM docs WHERE kind = 'sale' AND no = ?`, [s]);
  if (!docs.length) return null;
  const d = docs[0];
  const lines = all(`SELECT l.id, l.product_id, l.name, l.qty, l.warranty_days, l.serials, p.code, p.warranty_days pw FROM doc_lines l LEFT JOIN products p ON p.id = l.product_id WHERE l.doc_id = ? AND l.product_id IS NOT NULL`, [d.id]);
  const customer = get(`SELECT id, name, mobile, code FROM customers WHERE id = ?`, [d.customer_id]);
  return {
    doc: { id: d.id, no: d.no, date: d.date }, customer: customer?.id && d.walkin_name ? { ...customer, name: d.walkin_name, mobile: d.walkin_mobile } : customer,
    serial: sr?.serial ?? null, serial_product_id: sr?.product_id ?? null,
    lines: lines.map(l => {
      const days = Number(l.warranty_days || l.pw || 0);
      const exp = new Date(d.date); exp.setDate(exp.getDate() + days);
      return { ...l, serials: JSON.parse(l.serials || '[]'), days, expiry: days ? exp.toISOString().slice(0, 10) : null, expired: days ? exp < new Date() : true };
    }),
  };
}

export function saveClaim(u: SessionUser, input: Row, id?: number) {
  assertCan(u, 'warranty', id ? 'edit' : 'write');
  return tx(() => {
    if (!input.product_id) throw new HttpError(400, 'Select the product.');
    const row: Row = {
      date: input.date || today(), product_id: input.product_id, serial: input.serial || null, sale_doc_id: input.sale_doc_id || null,
      customer_id: input.customer_id || null, customer_name: input.customer_name || null, mobile: input.mobile || null,
      sale_date: input.sale_date || null, warranty_expiry: input.warranty_expiry || null, claim_note: input.claim_note || null,
    };
    if (id) { update('warranty_claims', id, row); log(u, 'claim', id, 'update', `Warranty claim updated`); return { id }; }
    const no = nextNo('claim', row.date);
    const cid = insert('warranty_claims', { ...row, no, status: 'received', created_by: u.id });
    if (row.serial) {
      const sr = get(`SELECT id FROM serials WHERE serial = ? ORDER BY id DESC LIMIT 1`, [row.serial]);
      if (sr) serialLog(sr.id, 'warranty claim', 'claim', cid, no, row.claim_note);
    }
    log(u, 'claim', cid, 'create', `Warranty claim ${no} received${row.serial ? ` for serial ${row.serial}` : ''}`);
    return { id: cid, no };
  });
}

export function listClaims(u: SessionUser, args: { stage?: 'all' | 'checking' | 'manage' | 'delivered'; q?: string; status?: string } = {}) {
  assertCan(u, 'warranty', 'read');
  const w = ['1 = 1'];
  const p: any[] = [];
  if (args.stage === 'checking') w.push(`c.status IN ('received','checked')`);
  if (args.stage === 'manage') w.push(`c.status IN ('checked','in_service','ready')`);
  if (args.stage === 'delivered') w.push(`c.status IN ('delivered','replaced')`);
  if (args.status) { w.push('c.status = ?'); p.push(args.status); }
  if (args.q?.trim()) { const like = `%${args.q.trim()}%`; w.push('(c.no LIKE ? OR c.serial LIKE ? OR p.name LIKE ? OR c.customer_name LIKE ? OR d.no LIKE ?)'); p.push(like, like, like, like, like); }
  return all(
    `SELECT c.*, p.name product, p.code, d.no invoice, COALESCE(c.customer_name, cu.name) customer, sc.name service_center
     FROM warranty_claims c LEFT JOIN products p ON p.id = c.product_id LEFT JOIN docs d ON d.id = c.sale_doc_id LEFT JOIN customers cu ON cu.id = c.customer_id
     LEFT JOIN service_centers sc ON sc.id = c.service_center_id WHERE ${w.join(' AND ')} ORDER BY c.id DESC LIMIT 2000`,
    p,
  );
}

export function getClaim(u: SessionUser, id: number) {
  assertCan(u, 'warranty', 'read');
  const c = get(`SELECT c.*, p.name product, p.code, d.no invoice, COALESCE(c.customer_name, cu.name) customer, sc.name service_center, rp.name replaced_product
    FROM warranty_claims c LEFT JOIN products p ON p.id = c.product_id LEFT JOIN docs d ON d.id = c.sale_doc_id LEFT JOIN customers cu ON cu.id = c.customer_id
    LEFT JOIN service_centers sc ON sc.id = c.service_center_id LEFT JOIN products rp ON rp.id = c.replaced_product_id WHERE c.id = ?`, [id]);
  if (!c) throw new HttpError(404, 'Claim not found.');
  return { claim: c, history: all(`SELECT a.*, u.name user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.entity = 'claim' AND a.entity_id = ? ORDER BY a.id DESC`, [id]), company: get(`SELECT * FROM company WHERE id = 1`) };
}

/** Checking step: technician note and verdict. */
export function checkClaim(u: SessionUser, id: number, input: { check_note?: string; check_status: 'ok' | 'faulty' | 'repairable' | 'rejected' }) {
  assertCan(u, 'warranty', 'edit');
  const status = input.check_status === 'rejected' ? 'rejected' : 'checked';
  run(`UPDATE warranty_claims SET check_note = ?, check_status = ?, checked_at = datetime('now','localtime'), status = ? WHERE id = ?`, [input.check_note ?? null, input.check_status, status, id]);
  log(u, 'claim', id, 'update', `Checked: ${input.check_status}${input.check_note ? ` — ${input.check_note}` : ''}`);
  return { ok: true };
}

/** Manage step: send to service center, mark ready, or replace from stock. */
export function manageClaim(u: SessionUser, id: number, input: { action: 'service' | 'ready' | 'replace' | 'reject'; service_center_id?: number; note?: string; replace_product_id?: number; replace_serial?: string }) {
  assertCan(u, 'warranty', 'edit');
  return tx(() => {
    const c = get(`SELECT * FROM warranty_claims WHERE id = ?`, [id]);
    if (!c) throw new HttpError(404, 'Claim not found.');
    if (input.action === 'service') {
      if (!input.service_center_id) throw new HttpError(400, 'Select a service center.');
      run(`UPDATE warranty_claims SET manage_action = 'service', service_center_id = ?, delivery_note = ?, status = 'in_service' WHERE id = ?`, [input.service_center_id, input.note ?? null, id]);
      log(u, 'claim', id, 'update', 'Sent to service center');
    } else if (input.action === 'ready') {
      run(`UPDATE warranty_claims SET manage_action = COALESCE(manage_action,'repair'), delivery_note = ?, status = 'ready' WHERE id = ?`, [input.note ?? null, id]);
      log(u, 'claim', id, 'update', 'Ready to deliver');
    } else if (input.action === 'reject') {
      run(`UPDATE warranty_claims SET manage_action = 'reject', delivery_note = ?, status = 'rejected' WHERE id = ?`, [input.note ?? null, id]);
      log(u, 'claim', id, 'update', 'Claim rejected');
    } else {
      const pid = input.replace_product_id || c.product_id;
      const cost = avgCost(pid);
      const faultyCost = round2(val<number>(`SELECT cost FROM serials WHERE serial = ? ORDER BY id DESC LIMIT 1`, [c.serial]) ?? avgCost(c.product_id));
      if (input.replace_serial) {
        const sr = get(`SELECT * FROM serials WHERE serial = ? AND product_id = ? AND status = 'instock'`, [input.replace_serial, pid]);
        if (!sr) throw new HttpError(400, 'Replacement serial not in stock.');
        run(`UPDATE serials SET status = 'sold', sale_doc_id = ?, customer_id = ? WHERE id = ?`, [c.sale_doc_id, c.customer_id, sr.id]);
        serialLog(sr.id, 'warranty replacement', 'claim', id, c.no);
      }
      if (c.serial) run(`UPDATE serials SET status = 'warranty' WHERE serial = ? AND product_id = ?`, [c.serial, c.product_id]);
      addMove({ date: today(), product_id: pid, loc_type: 'B', loc_id: u.branch_id, qty: -1, cost, kind: 'warranty_out', ref_type: 'claim', ref_id: id, ref_no: c.no, serial: input.replace_serial ?? null });
      postJournal({ no: c.no, date: today(), type: 'warranty', ref_type: 'claim', ref_id: id, narration: `Warranty replacement ${c.no}`, created_by: u.id, lines: [
        { ledger_id: sys('WARRANTY_BAD'), debit: faultyCost }, { ledger_id: sys('PRODUCT_ADJUST'), debit: round2(cost - faultyCost) }, { ledger_id: sys('INVENTORY'), credit: cost },
      ] });
      run(`UPDATE warranty_claims SET manage_action = 'replace', replaced_product_id = ?, replaced_serial = ?, delivery_note = ?, status = 'ready', check_status = COALESCE(check_status,'faulty') WHERE id = ?`, [pid, input.replace_serial ?? null, input.note ?? null, id]);
      log(u, 'claim', id, 'update', `Replaced with ${input.replace_serial ?? 'new unit'}`);
    }
    return { ok: true };
  });
}

export function deliverClaim(u: SessionUser, id: number, note?: string) {
  assertCan(u, 'warranty', 'edit');
  const c = get(`SELECT * FROM warranty_claims WHERE id = ?`, [id]);
  if (!c) throw new HttpError(404, 'Claim not found.');
  const status = c.manage_action === 'replace' ? 'replaced' : 'delivered';
  run(`UPDATE warranty_claims SET status = ?, delivered_at = datetime('now','localtime'), delivery_note = COALESCE(?, delivery_note) WHERE id = ?`, [status, note ?? null, id]);
  if (c.serial && c.manage_action !== 'replace') run(`UPDATE serials SET status = 'sold' WHERE serial = ? AND product_id = ? AND status = 'warranty'`, [c.serial, c.product_id]);
  log(u, 'claim', id, 'update', 'Delivered to customer');
  return { ok: true };
}

export function deleteClaim(u: SessionUser, id: number) {
  assertCan(u, 'warranty', 'delete');
  return tx(() => {
    const c = get(`SELECT * FROM warranty_claims WHERE id = ?`, [id]);
    if (!c) throw new HttpError(404, 'Claim not found.');
    if (['sent_supplier', 'written_off', 'restocked'].includes(c.status)) throw new HttpError(409, 'This claim is part of a bad-stock record; delete that first.');
    if (c.replaced_serial) run(`UPDATE serials SET status = 'instock', sale_doc_id = NULL, customer_id = NULL WHERE serial = ? AND product_id = ?`, [c.replaced_serial, c.replaced_product_id]);
    deleteMovesFor('claim', id);
    deleteJournalsFor('claim', id);
    run(`DELETE FROM warranty_claims WHERE id = ?`, [id]);
    log(u, 'claim', id, 'delete', `Warranty claim ${c.no} deleted`);
    return { ok: true };
  });
}

/** Claims with faulty units waiting in warranty bad stock (for supplier claim / self manage). */
export function badStockItems(u: SessionUser) {
  assertCan(u, 'warranty', 'read');
  return all(`SELECT c.id claim_id, c.no, c.serial, c.product_id, p.name, p.code, p.image, COALESCE((SELECT cost FROM serials WHERE serial = c.serial ORDER BY id DESC LIMIT 1), p.cost) cost
    FROM warranty_claims c JOIN products p ON p.id = c.product_id WHERE c.manage_action = 'replace' AND c.status IN ('ready','replaced') ORDER BY c.id`);
}

export function warrantyStock(u: SessionUser) {
  assertCan(u, 'warranty', 'read');
  return all(`SELECT p.id, p.code, p.name, p.image,
      COUNT(c.id) claims_in,
      SUM(CASE WHEN c.status IN ('delivered','replaced') THEN 1 ELSE 0 END) delivered,
      SUM(CASE WHEN c.status IN ('received','checked','in_service','ready') THEN 1 ELSE 0 END) available,
      SUM(CASE WHEN c.manage_action = 'replace' THEN 1 ELSE 0 END) bad_in,
      SUM(CASE WHEN c.status IN ('sent_supplier','written_off','restocked') THEN 1 ELSE 0 END) bad_out,
      SUM(CASE WHEN c.manage_action = 'replace' AND c.status IN ('ready','replaced') THEN 1 ELSE 0 END) bad_available
    FROM warranty_claims c JOIN products p ON p.id = c.product_id GROUP BY p.id ORDER BY p.name`);
}

// ═════════════ Offers ═════════════
export function offerItems(u: SessionUser, offerId?: number) {
  assertCan(u, 'offer', 'read');
  return all(
    `SELECT oi.*, o.name offer, CASE oi.target_type WHEN 'product' THEN (SELECT code || ' - ' || name FROM products WHERE id = oi.target_id)
       WHEN 'brand' THEN (SELECT name FROM brands WHERE id = oi.target_id) WHEN 'category' THEN (SELECT name FROM categories WHERE id = oi.target_id)
       ELSE (SELECT name FROM subcategories WHERE id = oi.target_id) END target
     FROM offer_items oi JOIN offers o ON o.id = oi.offer_id ${offerId ? 'WHERE oi.offer_id = ?' : ''} ORDER BY oi.id DESC`,
    offerId ? [offerId] : [],
  );
}

export function setOfferItems(u: SessionUser, offerId: number, targets: { target_type: string; target_id: number }[]) {
  assertCan(u, 'offer', 'write');
  return tx(() => {
    let n = 0;
    for (const t of targets) {
      if (!['product', 'brand', 'category', 'subcategory'].includes(t.target_type)) continue;
      // one offer per target
      run(`DELETE FROM offer_items WHERE target_type = ? AND target_id = ?`, [t.target_type, t.target_id]);
      insert('offer_items', { offer_id: offerId, target_type: t.target_type, target_id: t.target_id });
      n++;
    }
    log(u, 'offer', offerId, 'update', `${n} item(s) assigned to offer`);
    return { added: n };
  });
}

export function removeOfferItem(u: SessionUser, id: number) {
  assertCan(u, 'offer', 'delete');
  run(`DELETE FROM offer_items WHERE id = ?`, [id]);
  return { ok: true };
}

/** Items sold under supplier-funded offers within a period (rebate claim basis). */
export function rebateCandidates(u: SessionUser, supplierId: number, from: string, to: string) {
  assertCan(u, 'offer', 'read');
  return all(
    `SELECT l.id line_id, d.no invoice, d.date, COALESCE(d.walkin_name, c.name) customer, l.name item, l.qty, l.price, l.disc_pct, l.disc,
       ROUND(l.qty * l.price * l.disc_pct / 100.0 + l.disc, 2) rebate
     FROM doc_lines l JOIN docs d ON d.id = l.doc_id LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.kind = 'sale' AND d.date BETWEEN ? AND ? AND (l.disc_pct > 0 OR l.disc > 0)
       AND l.product_id IN (SELECT DISTINCT dl.product_id FROM doc_lines dl JOIN docs pd ON pd.id = dl.doc_id WHERE pd.kind = 'purchase' AND pd.supplier_id = ?)
       AND EXISTS (SELECT 1 FROM offer_items oi JOIN offers o ON o.id = oi.offer_id JOIN products p ON p.id = l.product_id WHERE o.effect_on = 'supplier'
         AND ((oi.target_type = 'product' AND oi.target_id = p.id) OR (oi.target_type = 'brand' AND oi.target_id = p.brand_id)
           OR (oi.target_type = 'category' AND oi.target_id = p.category_id) OR (oi.target_type = 'subcategory' AND oi.target_id = p.subcategory_id)))
       AND l.id NOT IN (SELECT value FROM rebates r, json_each(r.lines))
     ORDER BY d.date`,
    [from, to, supplierId],
  );
}

export function saveRebate(u: SessionUser, input: { supplier_id: number; from: string; to: string; line_ids: number[]; amount?: number; note?: string }) {
  assertCan(u, 'offer', 'write');
  return tx(() => {
    const cands = rebateCandidates(u, input.supplier_id, input.from, input.to).filter(c => input.line_ids.includes(c.line_id));
    if (!cands.length) throw new HttpError(400, 'Select at least one item.');
    const amount = round2(input.amount ?? cands.reduce((s, c) => s + c.rebate, 0));
    const no = nextNo('rebate');
    const id = insert('rebates', { no, date: today(), supplier_id: input.supplier_id, from_date: input.from, to_date: input.to, amount, lines: JSON.stringify(cands.map(c => c.line_id)), note: input.note ?? null, created_by: u.id });
    const jid = postJournal({ no, date: today(), type: 'rebate', ref_type: 'rebate', ref_id: id, narration: `Rebate claim ${no}`, created_by: u.id, lines: [
      { ledger_id: partyLedger('supplier', input.supplier_id), debit: amount }, { ledger_id: sys('REBATE'), credit: amount },
    ] });
    run(`UPDATE rebates SET journal_id = ? WHERE id = ?`, [jid, id]);
    log(u, 'rebate', id, 'create', `Rebate claim ${no} — ${amount.toFixed(2)}`);
    return { id, no };
  });
}

export function listRebates(u: SessionUser) {
  assertCan(u, 'offer', 'read');
  return all(`SELECT r.*, s.name supplier, json_array_length(r.lines) items FROM rebates r LEFT JOIN suppliers s ON s.id = r.supplier_id ORDER BY r.id DESC`);
}

export function getRebate(u: SessionUser, id: number) {
  assertCan(u, 'offer', 'read');
  const r = get(`SELECT r.*, s.name supplier FROM rebates r LEFT JOIN suppliers s ON s.id = r.supplier_id WHERE r.id = ?`, [id]);
  if (!r) throw new HttpError(404, 'Rebate not found.');
  const ids: number[] = JSON.parse(r.lines || '[]');
  const lines = ids.length ? all(`SELECT l.id, l.name item, l.qty, d.no invoice, d.date, COALESCE(d.walkin_name, c.name) customer, ROUND(l.qty * l.price * l.disc_pct / 100.0 + l.disc, 2) rebate FROM doc_lines l JOIN docs d ON d.id = l.doc_id LEFT JOIN customers c ON c.id = d.customer_id WHERE l.id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  return { rebate: r, lines, company: get(`SELECT * FROM company WHERE id = 1`) };
}

export function deleteRebate(u: SessionUser, id: number) {
  assertCan(u, 'offer', 'delete');
  return tx(() => {
    deleteJournalsFor('rebate', id);
    run(`DELETE FROM rebates WHERE id = ?`, [id]);
    log(u, 'rebate', id, 'delete', 'Rebate claim deleted');
    return { ok: true };
  });
}

// ═════════════ Enquiry ═════════════
export function listEnquiries(u: SessionUser, args: { q?: string; product?: string; location?: string; action_id?: number; type_id?: number; status?: string; from?: string; to?: string; due?: boolean } = {}) {
  assertCan(u, 'enquiry', 'read');
  const w = ['1 = 1'];
  const p: any[] = [];
  if (args.q?.trim()) { const like = `%${args.q.trim()}%`; w.push('(e.no LIKE ? OR e.customer_name LIKE ? OR e.mobile LIKE ?)'); p.push(like, like, like); }
  if (args.product?.trim()) { const like = `%${args.product.trim()}%`; w.push('e.product_name LIKE ?'); p.push(like); }
  if (args.location) { w.push('e.location = ?'); p.push(args.location); }
  if (args.action_id) { w.push('e.action_id = ?'); p.push(args.action_id); }
  if (args.type_id) { w.push('e.type_id = ?'); p.push(args.type_id); }
  if (args.status) { w.push('e.status = ?'); p.push(args.status); }
  if (args.from) { w.push('e.date >= ?'); p.push(args.from); }
  if (args.to) { w.push('e.date <= ?'); p.push(args.to); }
  if (args.due) w.push(`e.status = 'active' AND e.next_followup <= date('now','localtime')`);
  return all(
    `SELECT e.*, s.name source, t.name type, a.name action, (SELECT COUNT(*) FROM enquiry_followups f WHERE f.enquiry_id = e.id) followups
     FROM enquiries e LEFT JOIN enquiry_sources s ON s.id = e.source_id LEFT JOIN enquiry_types t ON t.id = e.type_id LEFT JOIN enquiry_actions a ON a.id = e.action_id
     WHERE ${w.join(' AND ')} ORDER BY CASE e.status WHEN 'active' THEN 0 ELSE 1 END, e.next_followup, e.id DESC LIMIT 2000`,
    p,
  );
}

export function saveEnquiry(u: SessionUser, input: Row, id?: number) {
  assertCan(u, 'enquiry', id ? 'edit' : 'write');
  if (!input.customer_name?.trim()) throw new HttpError(400, 'Customer name is required.');
  const row: Row = {
    date: input.date || today(), customer_name: input.customer_name.trim(), mobile: input.mobile || null, product_id: input.product_id || null,
    product_name: input.product_name || null, location: input.location || null, type_id: input.type_id || null, status: input.status || 'active',
    action_id: input.action_id || null, ppdate: input.ppdate || null, source_id: input.source_id || null, next_followup: input.next_followup || null, remarks: input.remarks || null,
  };
  if (id) { update('enquiries', id, row); log(u, 'enquiry', id, 'update', `Enquiry updated: ${row.customer_name}`); return { id }; }
  const no = nextNo('enquiry', row.date);
  const eid = insert('enquiries', { ...row, no, created_by: u.id });
  log(u, 'enquiry', eid, 'create', `Enquiry ${no} — ${row.customer_name}${row.product_name ? ` (${row.product_name})` : ''}`);
  return { id: eid, no };
}

export function addFollowup(u: SessionUser, enquiryId: number, input: { date?: string; details: string; status?: string; action_id?: number; next_followup?: string; ppdate?: string; type_id?: number; location?: string; product_name?: string; source_id?: number }) {
  assertCan(u, 'enquiry', 'write');
  return tx(() => {
    const e = get(`SELECT * FROM enquiries WHERE id = ?`, [enquiryId]);
    if (!e) throw new HttpError(404, 'Enquiry not found.');
    insert('enquiry_followups', { enquiry_id: enquiryId, date: input.date || today(), details: input.details, status: input.status || e.status, action_id: input.action_id || e.action_id, next_followup: input.next_followup || null, user_id: u.id });
    update('enquiries', enquiryId, {
      status: input.status || e.status, action_id: input.action_id || e.action_id, next_followup: input.next_followup ?? e.next_followup,
      ppdate: input.ppdate ?? e.ppdate, type_id: input.type_id ?? e.type_id, location: input.location ?? e.location, product_name: input.product_name ?? e.product_name, source_id: input.source_id ?? e.source_id,
    });
    log(u, 'enquiry', enquiryId, 'update', `Follow-up added: ${input.details.slice(0, 80)}`);
    return { ok: true };
  });
}

export function getEnquiry(u: SessionUser, id: number) {
  assertCan(u, 'enquiry', 'read');
  const e = get(`SELECT e.*, s.name source, t.name type, a.name action FROM enquiries e LEFT JOIN enquiry_sources s ON s.id = e.source_id LEFT JOIN enquiry_types t ON t.id = e.type_id LEFT JOIN enquiry_actions a ON a.id = e.action_id WHERE e.id = ?`, [id]);
  if (!e) throw new HttpError(404, 'Enquiry not found.');
  const followups = all(`SELECT f.*, a.name action, u.name user_name FROM enquiry_followups f LEFT JOIN enquiry_actions a ON a.id = f.action_id LEFT JOIN users u ON u.id = f.user_id WHERE f.enquiry_id = ? ORDER BY f.id DESC`, [id]);
  return { enquiry: e, followups };
}

export function deleteEnquiry(u: SessionUser, id: number) {
  assertCan(u, 'enquiry', 'delete');
  run(`DELETE FROM enquiries WHERE id = ?`, [id]);
  log(u, 'enquiry', id, 'delete', 'Enquiry deleted');
  return { ok: true };
}

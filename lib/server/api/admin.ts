import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, insert, run, round2, today, tx, update, val, type Row } from '../db';
import { assertCan, HttpError, history, log, verifyPassword, type SessionUser } from '../auth';
import { hashPassword } from '../seed';
import { sendSms } from '../sms';
import { ALL_MODULES } from '../../permissions';

// ═════════════ Company & settings ═════════════
export function getCompany(u: SessionUser) {
  void u;
  return get(`SELECT * FROM company WHERE id = 1`);
}
export function saveCompany(u: SessionUser, input: Row) {
  assertCan(u, 'setting', 'edit');
  const keys = ['name', 'bname', 'slogan', 'bslogan', 'mobile', 'phone', 'fax', 'web', 'email', 'tin', 'vat', 'address', 'baddress', 'saddress', 'logo'];
  update('company', 1, Object.fromEntries(keys.filter(k => k in input).map(k => [k, input[k] ?? null])));
  log(u, 'company', 1, 'update', 'Company profile updated');
  return { ok: true };
}

const SETTING_KEYS = [
  'language', 'timezone', 'date_format', 'show_serial_on_invoice', 'barcode_type', 'barcode_length', 'print_due_on_invoice', 'code_prefix', 'company_short',
  'number_format', 'invoice_note', 'invoice_terms', 'pos_receipt_note', 'challan_note', 'auto_sms', 'edit_lock_hours', 'allow_negative_stock', 'walkin_due_allowed',
  'reward_enabled', 'reward_spend', 'reward_point_value', 'pos_name', 'late_per_day', 'default_vat', 'currency_symbol', 'theme',
  'sms_status', 'sms_gateway_url', 'sms_api_key', 'sms_sender', 'sms_user', 'sms_password', 'sms_type', 'sms_api_var', 'sms_user_var', 'sms_pass_var',
  'sms_sender_var', 'sms_to_var', 'sms_msg_var', 'sms_from_var', 'sms_other_var', 'sms_other_val',
  'sms_tpl_invoice', 'sms_tpl_invoice_status', 'sms_tpl_receive', 'sms_tpl_receive_status', 'sms_tpl_payment', 'sms_tpl_payment_status', 'sms_tpl_greeting', 'sms_tpl_greeting_status',
];
export function getSettings(u: SessionUser) {
  void u;
  const rows = all<{ key: string; value: string }>(`SELECT key, value FROM settings`);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  if (!u.is_admin && !u.perms.setting?.read) for (const k of Object.keys(out)) if (k.startsWith('sms_')) delete out[k];
  return out;
}
export function saveSettings(u: SessionUser, input: Record<string, string>) {
  assertCan(u, 'setting', 'edit');
  tx(() => {
    for (const [k, v] of Object.entries(input)) {
      if (!SETTING_KEYS.includes(k)) continue;
      run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [k, String(v ?? '')]);
    }
  });
  log(u, 'setting', null, 'update', `Settings updated (${Object.keys(input).filter(k => SETTING_KEYS.includes(k)).length} keys)`);
  return { ok: true };
}

export async function testSms(u: SessionUser, mobile: string, body: string) {
  assertCan(u, 'setting', 'edit');
  return sendSms(mobile, body || 'Test message');
}
export async function sendBulkSms(u: SessionUser, input: { group?: 'customers' | 'suppliers' | 'employees'; mobiles?: string[]; body: string }) {
  assertCan(u, 'client', 'write');
  let list = input.mobiles ?? [];
  if (input.group) list = all(`SELECT mobile FROM ${input.group} WHERE mobile IS NOT NULL AND mobile <> '' AND status = 'active'`).map(r => r.mobile);
  let ok = 0;
  for (const m of list) if ((await sendSms(m, input.body)).ok) ok++;
  return { total: list.length, sent: ok };
}
export function smsLog(u: SessionUser) {
  assertCan(u, 'setting', 'read');
  return all(`SELECT * FROM sms_log ORDER BY id DESC LIMIT 300`);
}

// ═════════════ Data management ═════════════
const DATA_GROUPS: Record<string, string[]> = {
  sales: [`DELETE FROM journals WHERE ref_type = 'doc' AND ref_id IN (SELECT id FROM docs WHERE kind IN ('sale','estimate','sreturn','service','sestimate'))`, `DELETE FROM stock_moves WHERE ref_type = 'doc' AND ref_id IN (SELECT id FROM docs WHERE kind IN ('sale','sreturn'))`, `UPDATE serials SET status = 'instock', sale_doc_id = NULL, customer_id = NULL WHERE status = 'sold'`, `DELETE FROM docs WHERE kind IN ('sreturn')`, `DELETE FROM docs WHERE kind IN ('sale','estimate','service','sestimate')`],
  purchase: [`DELETE FROM journals WHERE ref_type = 'doc' AND ref_id IN (SELECT id FROM docs WHERE kind IN ('purchase','preturn','porder'))`, `DELETE FROM stock_moves WHERE ref_type = 'doc' AND ref_id IN (SELECT id FROM docs WHERE kind IN ('purchase','preturn'))`, `DELETE FROM serials WHERE purchase_doc_id IN (SELECT id FROM docs WHERE kind = 'purchase')`, `DELETE FROM docs WHERE kind = 'preturn'`, `DELETE FROM docs WHERE kind IN ('purchase','porder')`],
  vouchers: [`DELETE FROM cheques`, `DELETE FROM journals WHERE type IN ('payment','receipt','journal','contra','expense','donation','cheque_bounce')`],
  inventory: [`DELETE FROM journals WHERE ref_type = 'stock'`, `DELETE FROM stock_moves WHERE ref_type = 'stock'`, `DELETE FROM stock_docs`],
  warranty: [`DELETE FROM journals WHERE ref_type = 'claim'`, `DELETE FROM stock_moves WHERE ref_type = 'claim'`, `DELETE FROM warranty_claims`],
  payroll: [`DELETE FROM journals WHERE type = 'salary'`, `DELETE FROM attendance`, `DELETE FROM leave_apps`],
  enquiry: [`DELETE FROM enquiries`],
  activity: [`DELETE FROM activity`, `DELETE FROM sms_log`],
};
export function dataGroups() {
  return Object.keys(DATA_GROUPS);
}
export function emptyData(u: SessionUser, password: string, groups: string[]) {
  if (!u.is_admin) throw new HttpError(403, 'Only administrators can manage data.');
  const me = get(`SELECT password FROM users WHERE id = ?`, [u.id]);
  if (!me || !verifyPassword(password, me.password)) throw new HttpError(403, 'Password is incorrect.');
  tx(() => {
    for (const g of groups) for (const sql of DATA_GROUPS[g] ?? []) run(sql);
  });
  log(u, 'data', null, 'delete', `Data emptied: ${groups.join(', ')}`);
  return { ok: true };
}
export function backupInfo(u: SessionUser) {
  if (!u.is_admin) throw new HttpError(403, 'Only administrators can download backups.');
  const file = path.join(process.cwd(), 'data', 'auralit.db');
  return { size: fs.existsSync(file) ? fs.statSync(file).size : 0 };
}

// ═════════════ Profile ═════════════
export function me(u: SessionUser) {
  const row = get(`SELECT u.id, u.name, u.email, u.mobile, u.image, u.branch_id, u.last_active, u.created_at, r.name role, b.name branch FROM users u LEFT JOIN roles r ON r.id = u.role_id LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = ?`, [u.id]);
  return { ...row, is_admin: u.is_admin, perms: u.perms, report_perms: u.report_perms };
}
export function saveProfile(u: SessionUser, input: { name?: string; mobile?: string; image?: string | null }) {
  update('users', u.id, { name: input.name?.trim() || undefined, mobile: input.mobile, image: input.image });
  log(u, 'user', u.id, 'update', 'Profile updated');
  return { ok: true };
}
export function changePassword(u: SessionUser, oldPass: string, newPass: string) {
  const me = get(`SELECT password FROM users WHERE id = ?`, [u.id]);
  if (!me || !verifyPassword(oldPass, me.password)) throw new HttpError(400, 'Current password is incorrect.');
  if (!newPass || newPass.length < 6) throw new HttpError(400, 'New password must be at least 6 characters.');
  run(`UPDATE users SET password = ? WHERE id = ?`, [hashPassword(newPass), u.id]);
  log(u, 'user', u.id, 'update', 'Password changed');
  return { ok: true };
}

// ═════════════ Users & roles ═════════════
export function listUsers(u: SessionUser) {
  assertCan(u, 'user', 'read');
  return all(`SELECT u.id, u.name, u.email, u.mobile, u.image, u.status, u.role_id, u.branch_id, u.employee_id, u.last_active, r.name role, b.name branch
    FROM users u LEFT JOIN roles r ON r.id = u.role_id LEFT JOIN branches b ON b.id = u.branch_id ORDER BY u.id`);
}
export function saveUser(u: SessionUser, input: Row, id?: number) {
  assertCan(u, 'user', id ? 'edit' : 'write');
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!input.name?.trim() || !email) throw new HttpError(400, 'Name and email are required.');
  const dup = get(`SELECT id FROM users WHERE email = ? AND id <> ?`, [email, id ?? 0]);
  if (dup) throw new HttpError(400, 'Another user already uses this email.');
  const row: Row = { name: input.name.trim(), email, mobile: input.mobile || null, role_id: Number(input.role_id) || null, branch_id: Number(input.branch_id) || 1, employee_id: Number(input.employee_id) || null, status: input.status || 'active', image: input.image ?? undefined };
  if (id) {
    if (id === u.id && row.status !== 'active') throw new HttpError(400, 'You cannot deactivate yourself.');
    if (input.password) row.password = hashPassword(String(input.password));
    update('users', id, row);
    if (row.status !== 'active') run(`DELETE FROM sessions WHERE user_id = ?`, [id]);
    log(u, 'user', id, 'update', `User updated: ${row.name}`);
    return { id };
  }
  if (!input.password || String(input.password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  const nid = insert('users', { ...row, password: hashPassword(String(input.password)) });
  log(u, 'user', nid, 'create', `User created: ${row.name}`);
  return { id: nid };
}
export function setUsersStatus(u: SessionUser, ids: number[], status: 'active' | 'inactive') {
  assertCan(u, 'user', 'edit');
  for (const id of ids) {
    if (id === u.id) continue;
    run(`UPDATE users SET status = ? WHERE id = ?`, [status, id]);
    if (status !== 'active') run(`DELETE FROM sessions WHERE user_id = ?`, [id]);
  }
  return { ok: true };
}
export function deleteUser(u: SessionUser, id: number) {
  assertCan(u, 'user', 'delete');
  if (id === u.id) throw new HttpError(400, 'You cannot delete yourself.');
  run(`UPDATE users SET status = 'inactive' WHERE id = ?`, [id]);
  run(`DELETE FROM sessions WHERE user_id = ?`, [id]);
  log(u, 'user', id, 'delete', 'User removed (deactivated)');
  return { ok: true };
}

export function listRoles(u: SessionUser) {
  assertCan(u, 'user', 'read');
  return all(`SELECT r.*, (SELECT COUNT(*) FROM users WHERE role_id = r.id) users FROM roles r ORDER BY r.id`).map(r => ({ ...r, perms: JSON.parse(r.perms || '{}'), report_perms: JSON.parse(r.report_perms || '[]') }));
}
export function saveRole(u: SessionUser, input: { name: string; status?: string; description?: string; perms?: Row; report_perms?: string[] }, id?: number) {
  assertCan(u, 'user', id ? 'edit' : 'write');
  if (!input.name?.trim()) throw new HttpError(400, 'Role name is required.');
  const perms: Row = {};
  for (const m of ALL_MODULES) {
    const p = input.perms?.[m.key];
    if (p) perms[m.key] = { read: !!p.read, write: !!p.write, edit: !!p.edit, delete: !!p.delete, print: !!p.print };
  }
  const row: Row = { name: input.name.trim(), status: input.status || 'active', description: input.description || null };
  if (input.perms) row.perms = JSON.stringify(perms);
  if (input.report_perms) row.report_perms = JSON.stringify(input.report_perms);
  if (id) {
    const r = get(`SELECT is_admin FROM roles WHERE id = ?`, [id]);
    if (r?.is_admin) delete row.perms;
    update('roles', id, row);
    log(u, 'role', id, 'update', `Role updated: ${row.name}`);
    return { id };
  }
  const nid = insert('roles', { ...row, perms: row.perms ?? '{}', report_perms: row.report_perms ?? '[]' });
  log(u, 'role', nid, 'create', `Role created: ${row.name}`);
  return { id: nid };
}
export function deleteRole(u: SessionUser, id: number) {
  assertCan(u, 'user', 'delete');
  const r = get(`SELECT is_admin, (SELECT COUNT(*) FROM users WHERE role_id = roles.id) n FROM roles WHERE id = ?`, [id]);
  if (!r) throw new HttpError(404, 'Role not found.');
  if (r.is_admin) throw new HttpError(400, 'The administrator role cannot be deleted.');
  if (r.n) throw new HttpError(409, 'Role is assigned to users.');
  run(`DELETE FROM roles WHERE id = ?`, [id]);
  log(u, 'role', id, 'delete', 'Role deleted');
  return { ok: true };
}

// ═════════════ Personal ═════════════
export function notes(u: SessionUser) { return all(`SELECT * FROM notes WHERE user_id = ? ORDER BY favorite DESC, COALESCE(updated_at, created_at) DESC`, [u.id]); }
export function saveNote(u: SessionUser, input: Row, id?: number) {
  const row = { title: input.title ?? '', body: input.body ?? '', favorite: input.favorite ? 1 : 0, label: input.label || null, color: input.color || null };
  if (id) { run(`UPDATE notes SET title = ?, body = ?, favorite = ?, label = ?, color = ?, updated_at = datetime('now','localtime') WHERE id = ? AND user_id = ?`, [row.title, row.body, row.favorite, row.label, row.color, id, u.id]); return { id }; }
  return { id: insert('notes', { ...row, user_id: u.id }) };
}
export function deleteNote(u: SessionUser, id: number) { run(`DELETE FROM notes WHERE id = ? AND user_id = ?`, [id, u.id]); return { ok: true }; }

export function todos(u: SessionUser) { return all(`SELECT * FROM todos WHERE user_id = ? ORDER BY done, CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, COALESCE(due,'9999'), id DESC`, [u.id]); }
export function saveTodo(u: SessionUser, input: Row, id?: number) {
  if (id) { run(`UPDATE todos SET title = COALESCE(?, title), done = COALESCE(?, done), due = ?, priority = COALESCE(?, priority) WHERE id = ? AND user_id = ?`, [input.title ?? null, input.done === undefined ? null : input.done ? 1 : 0, input.due ?? null, input.priority ?? null, id, u.id]); return { id }; }
  if (!input.title?.trim()) throw new HttpError(400, 'Title is required.');
  return { id: insert('todos', { user_id: u.id, title: input.title.trim(), due: input.due || null, priority: input.priority || 'normal' }) };
}
export function deleteTodo(u: SessionUser, id: number) { run(`DELETE FROM todos WHERE id = ? AND user_id = ?`, [id, u.id]); return { ok: true }; }

export function events(u: SessionUser, from?: string, to?: string) {
  return all(`SELECT * FROM events WHERE user_id = ? ${from ? 'AND date >= ?' : ''} ${to ? 'AND date <= ?' : ''} ORDER BY date, start_time`, [u.id, ...(from ? [from] : []), ...(to ? [to] : [])]);
}
export function saveEvent(u: SessionUser, input: Row, id?: number) {
  if (!input.title?.trim() || !input.date) throw new HttpError(400, 'Title and date are required.');
  const row = { title: input.title.trim(), date: input.date, start_time: input.start_time || null, end_time: input.end_time || null, details: input.details || null, color: input.color || null };
  if (id) { run(`UPDATE events SET title = ?, date = ?, start_time = ?, end_time = ?, details = ?, color = ? WHERE id = ? AND user_id = ?`, [row.title, row.date, row.start_time, row.end_time, row.details, row.color, id, u.id]); return { id }; }
  return { id: insert('events', { ...row, user_id: u.id }) };
}
export function deleteEvent(u: SessionUser, id: number) { run(`DELETE FROM events WHERE id = ? AND user_id = ?`, [id, u.id]); return { ok: true }; }

// ═════════════ Chat ═════════════
export function chatUsers(u: SessionUser) {
  return all(`SELECT id, name, image, last_active, (SELECT COUNT(*) FROM messages WHERE from_user = users.id AND to_user = ? AND read = 0) unread FROM users WHERE status = 'active' AND id <> ? ORDER BY name`, [u.id, u.id]);
}
export function chatMessages(u: SessionUser, other: number) {
  run(`UPDATE messages SET read = 1 WHERE from_user = ? AND to_user = ?`, [other, u.id]);
  return all(`SELECT * FROM messages WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?) ORDER BY id DESC LIMIT 200`, [u.id, other, other, u.id]).reverse();
}
export function sendMessage(u: SessionUser, to: number, body: string) {
  if (!body?.trim()) throw new HttpError(400, 'Empty message.');
  return { id: insert('messages', { from_user: u.id, to_user: to, body: body.trim().slice(0, 2000) }) };
}
export function unreadCount(u: SessionUser) {
  return val<number>(`SELECT COUNT(*) FROM messages WHERE to_user = ? AND read = 0`, [u.id]) ?? 0;
}

// ═════════════ Global search ═════════════
export function globalSearch(u: SessionUser, q: string) {
  const s = q.trim();
  if (s.length < 2) return { docs: [], products: [], serials: [], parties: [], vouchers: [] };
  const like = `%${s}%`;
  return {
    docs: all(`SELECT d.id, d.kind, d.no, d.date, d.total, COALESCE(d.walkin_name, c.name, su.name) party FROM docs d LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN suppliers su ON su.id = d.supplier_id WHERE d.no LIKE ? ORDER BY d.id DESC LIMIT 8`, [like]),
    products: all(`SELECT p.id, p.code, p.name, p.price, p.image, (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = p.id) stock FROM products p WHERE p.name LIKE ? OR p.code LIKE ? OR p.barcode = ? OR p.model LIKE ? ORDER BY p.name LIMIT 8`, [like, like, s, like]),
    serials: all(`SELECT s.id, s.serial, s.status, s.product_id, p.name product, d.no sale_no, s.sale_doc_id, pd.no purchase_no, s.purchase_doc_id FROM serials s JOIN products p ON p.id = s.product_id LEFT JOIN docs d ON d.id = s.sale_doc_id LEFT JOIN docs pd ON pd.id = s.purchase_doc_id WHERE s.serial LIKE ? ORDER BY s.id DESC LIMIT 8`, [like]),
    parties: [
      ...all(`SELECT id, 'customer' type, code, name, mobile FROM customers WHERE is_walkin = 0 AND (name LIKE ? OR code LIKE ? OR mobile LIKE ?) LIMIT 6`, [like, like, like]),
      ...all(`SELECT id, 'supplier' type, code, name, mobile FROM suppliers WHERE is_opening = 0 AND (name LIKE ? OR code LIKE ? OR mobile LIKE ?) LIMIT 4`, [like, like, like]),
    ],
    vouchers: all(`SELECT id, type, no, date, total FROM journals WHERE no LIKE ? AND type IN ('payment','receipt','journal','contra','expense','donation') ORDER BY id DESC LIMIT 6`, [like]),
  };
}

export function serialHistory(u: SessionUser, serial: string) {
  const s = get(`SELECT s.*, p.name product, p.code FROM serials s JOIN products p ON p.id = s.product_id WHERE s.serial = ? ORDER BY s.id DESC LIMIT 1`, [serial.trim()]);
  if (!s) return null;
  return { serial: s, history: all(`SELECT * FROM serial_history WHERE serial_id IN (SELECT id FROM serials WHERE serial = ?) ORDER BY id`, [serial.trim()]) };
}

// ═════════════ Notifications & history ═════════════
export function notifications(u: SessionUser) {
  const t = today();
  return {
    cheques: all(`SELECT c.id, c.cheque_no, c.cheque_date, c.amount, c.direction, l.name party FROM cheques c LEFT JOIN ledgers l ON l.id = c.party_ledger_id WHERE c.status = 'pending' AND c.cheque_date <= date(?, '+3 day') ORDER BY c.cheque_date LIMIT 20`, [t]),
    lowStock: all(`SELECT p.id, p.code, p.name, p.min_stock, (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = p.id) stock FROM products p WHERE p.status = 'active' AND p.min_stock > 0 AND (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = p.id) <= p.min_stock ORDER BY p.name LIMIT 20`),
    followups: all(`SELECT id, no, customer_name, product_name, next_followup FROM enquiries WHERE status = 'active' AND next_followup <= ? ORDER BY next_followup LIMIT 20`, [t]),
    events: all(`SELECT id, title, date, start_time FROM events WHERE user_id = ? AND date BETWEEN ? AND date(?, '+7 day') ORDER BY date LIMIT 10`, [u.id, t, t]),
    todos: all(`SELECT id, title, due FROM todos WHERE user_id = ? AND done = 0 AND due IS NOT NULL AND due <= ? ORDER BY due LIMIT 10`, [u.id, t]),
    leaves: u.is_admin || u.perms.payroll?.edit ? all(`SELECT l.id, e.name, l.from_date, l.to_date FROM leave_apps l JOIN employees e ON e.id = l.employee_id WHERE l.status = 'pending' LIMIT 10`) : [],
    activity: all(`SELECT a.*, u.name user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 15`),
  };
}

export function activityFor(u: SessionUser, entities: string[], limit = 40) {
  void u;
  return history(entities, limit);
}

export function activityLog(u: SessionUser, args: { q?: string; user_id?: number; from?: string; to?: string; page?: number } = {}) {
  assertCan(u, 'user', 'read');
  const w = ['1 = 1'];
  const p: any[] = [];
  if (args.q) { w.push('(a.summary LIKE ? OR a.entity LIKE ?)'); p.push(`%${args.q}%`, `%${args.q}%`); }
  if (args.user_id) { w.push('a.user_id = ?'); p.push(args.user_id); }
  if (args.from) { w.push('date(a.at) >= ?'); p.push(args.from); }
  if (args.to) { w.push('date(a.at) <= ?'); p.push(args.to); }
  const page = Math.max(args.page ?? 1, 1);
  return all(`SELECT a.*, u.name user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id WHERE ${w.join(' AND ')} ORDER BY a.id DESC LIMIT 100 OFFSET ?`, [...p, (page - 1) * 100]);
}

// ═════════════ Dashboard ═════════════
export function dashboard(u: SessionUser, args: { branch_id?: number; from?: string; to?: string; graph?: 'sale' | 'service' } = {}) {
  const t = today();
  const from = args.from || t.slice(0, 8) + '01';
  const to = args.to || t;
  const br = args.branch_id ? 'AND d.branch_id = ?' : '';
  const bp = args.branch_id ? [args.branch_id] : [];
  const sumKind = (kinds: string, f: string, tt: string) => round2(val<number>(`SELECT COALESCE(SUM(d.total),0) FROM docs d WHERE d.kind IN (${kinds}) AND d.date BETWEEN ? AND ? ${br}`, [f, tt, ...bp]) ?? 0);
  const expense = (f: string, tt: string) => round2(val<number>(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id JOIN acc_subgroups s ON s.id = l.subgroup_id JOIN acc_groups g ON g.id = s.group_id WHERE g.class_id = 4 AND l.system_key IS NOT 'COGS' AND j.date BETWEEN ? AND ?`, [f, tt]) ?? 0);
  const cogs = (f: string, tt: string) => round2(val<number>(`SELECT COALESCE(SUM(d.cost_total),0) FROM docs d WHERE d.kind = 'sale' AND d.date BETWEEN ? AND ? ${br}`, [f, tt, ...bp]) ?? 0) - round2(val<number>(`SELECT COALESCE(SUM(d.cost_total),0) FROM docs d WHERE d.kind = 'sreturn' AND d.date BETWEEN ? AND ? ${br}`, [f, tt, ...bp]) ?? 0);

  const daily = all(`SELECT d.date, COALESCE(SUM(CASE WHEN d.kind IN ('sale','service') THEN d.total END),0) sales, COUNT(CASE WHEN d.kind IN ('sale','service') THEN 1 END) orders
    FROM docs d WHERE d.kind IN ('sale','service') AND d.date >= date(?, '-29 day') ${br} GROUP BY d.date ORDER BY d.date`, [t, ...bp]);
  const monthly = all(`SELECT strftime('%Y-%m', d.date) month, COALESCE(SUM(d.total),0) sales FROM docs d WHERE d.kind IN ('sale','service') AND d.date >= date(?, 'start of month', '-11 month') ${br} GROUP BY month ORDER BY month`, [t, ...bp]);
  const topProducts = all(`SELECT l.product_id, l.name, SUM(l.qty) qty, SUM(l.subtotal) amount FROM doc_lines l JOIN docs d ON d.id = l.doc_id WHERE d.kind = 'sale' AND d.date BETWEEN ? AND ? ${br} AND l.product_id IS NOT NULL GROUP BY l.product_id ORDER BY amount DESC LIMIT 10`, [from, to, ...bp]);
  const byEmployee = all(`SELECT COALESCE(e.name, u.name, 'Unassigned') name, SUM(d.total) amount, COUNT(*) orders FROM docs d LEFT JOIN employees e ON e.id = d.sales_person_id LEFT JOIN users u ON u.id = d.created_by WHERE d.kind = ? AND d.date BETWEEN ? AND ? ${br} GROUP BY 1 ORDER BY amount DESC LIMIT 10`, [args.graph === 'service' ? 'service' : 'sale', from, to, ...bp]);
  const dailyIE = all(`SELECT j.date,
      COALESCE(SUM(CASE WHEN g.class_id = 5 THEN jl.credit - jl.debit END),0) income,
      COALESCE(SUM(CASE WHEN g.class_id = 4 THEN jl.debit - jl.credit END),0) expense
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id JOIN acc_subgroups s ON s.id = l.subgroup_id JOIN acc_groups g ON g.id = s.group_id
    WHERE j.date BETWEEN ? AND ? AND g.class_id IN (4,5) GROUP BY j.date ORDER BY j.date`, [from, to]).map(r => ({ ...r, profit: round2(r.income - r.expense) }));
  const sales = sumKind(`'sale'`, from, to), service = sumKind(`'service'`, from, to), sreturn = sumKind(`'sreturn'`, from, to);
  const purchase = sumKind(`'purchase'`, from, to), preturn = sumKind(`'preturn'`, from, to);
  const exp = expense(from, to);
  const cash = all(`SELECT l.kind, COALESCE(SUM(jl.debit - jl.credit),0) balance FROM ledgers l LEFT JOIN journal_lines jl ON jl.ledger_id = l.id WHERE l.kind IN ('cash','bank','mobile') GROUP BY l.kind`);
  const receivable = round2(val<number>(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) FROM journal_lines jl JOIN ledgers l ON l.id = jl.ledger_id WHERE l.kind = 'customer'`) ?? 0);
  const payable = round2(val<number>(`SELECT COALESCE(SUM(jl.credit - jl.debit),0) FROM journal_lines jl JOIN ledgers l ON l.id = jl.ledger_id WHERE l.kind = 'supplier'`) ?? 0);
  const stockValue = round2(val<number>(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) FROM journal_lines jl WHERE jl.ledger_id = (SELECT id FROM ledgers WHERE system_key = 'INVENTORY')`) ?? 0);
  return {
    range: { from, to },
    today: { sales: sumKind(`'sale','service'`, t, t), orders: val<number>(`SELECT COUNT(*) FROM docs d WHERE d.kind IN ('sale','service') AND d.date = ? ${br}`, [t, ...bp]) ?? 0, expense: expense(t, t), purchase: sumKind(`'purchase'`, t, t), received: round2(val<number>(`SELECT COALESCE(SUM(jl.debit),0) FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id WHERE j.date = ? AND l.kind IN ('cash','bank','mobile')`, [t]) ?? 0) },
    overview: { sales, service, sreturn, netSales: round2(sales + service - sreturn), purchase, preturn, expense: exp, cogs: cogs(from, to), grossProfit: round2(sales - sreturn - cogs(from, to) + service), receivable, payable, stockValue },
    cash: Object.fromEntries(cash.map(c => [c.kind, round2(c.balance)])),
    daily, monthly, topProducts, byEmployee, dailyIE,
    branches: all(`SELECT id value, name label FROM branches WHERE status = 'active'`),
    recent: all(`SELECT d.id, d.kind, d.no, d.date, d.total, d.paid, COALESCE(d.walkin_name, c.name, s.name) party FROM docs d LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN suppliers s ON s.id = d.supplier_id WHERE d.kind IN ('sale','purchase','service') ORDER BY d.id DESC LIMIT 8`),
  };
}


import 'server-only';
import { all, get, round2, today, type Row } from '../db';
import { assertCan, HttpError, type SessionUser } from '../auth';
import { REPORT_MAP, REPORTS } from '../../reports-meta';
import { balanceSheet, incomeStatement, ledgerStatement, trialBalance } from './finance';
import { salarySheet, attendanceSheet } from './payroll';

type Col = { key: string; label: string; type?: 'money' | 'number' | 'date' | 'text' | 'pct'; total?: boolean };
type Section = { title?: string; columns: Col[]; rows: Row[]; totals?: Row };
export type ReportResult = { sections: Section[]; note?: string; meta?: Row };

const M = (key: string, label: string, total = true): Col => ({ key, label, type: 'money', total });
const N = (key: string, label: string, total = true): Col => ({ key, label, type: 'number', total });
const D = (key: string, label = 'Date'): Col => ({ key, label, type: 'date' });
const T = (key: string, label: string): Col => ({ key, label });

function totalsOf(cols: Col[], rows: Row[]): Row | undefined {
  const t: Row = {};
  let any = false;
  for (const c of cols) if (c.total && (c.type === 'money' || c.type === 'number')) { t[c.key] = round2(rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)); any = true; }
  return any ? t : undefined;
}
const table = (columns: Col[], rows: Row[], title?: string): Section => ({ title, columns, rows, totals: totalsOf(columns, rows) });
const one = (columns: Col[], rows: Row[], title?: string): ReportResult => ({ sections: [table(columns, rows, title)] });
const kv = (pairs: [string, number | string][], title?: string): Section => ({ title, columns: [T('k', 'Particular'), M('v', 'Amount', false)], rows: pairs.map(([k, v]) => ({ k, v })) });

type P = Record<string, any>;
const range = (p: P) => ({ from: p.from || today().slice(0, 8) + '01', to: p.to || today() });

/** WHERE fragments for docs alias d. */
function docW(p: P, kinds: string[], opts: { customerGroup?: boolean } = {}) {
  const { from, to } = range(p);
  const w = [`d.kind IN (${kinds.map(k => `'${k}'`).join(',')})`, 'd.date BETWEEN ? AND ?'];
  const a: any[] = [from, to];
  if (p.branch_id) { w.push('d.branch_id = ?'); a.push(p.branch_id); }
  if (p.user_id) { w.push('d.created_by = ?'); a.push(p.user_id); }
  if (p.sales_person_id) { w.push('d.sales_person_id = ?'); a.push(p.sales_person_id); }
  if (p.customer_id) { w.push('d.customer_id = ?'); a.push(p.customer_id); }
  if (p.supplier_id) { w.push('d.supplier_id = ?'); a.push(p.supplier_id); }
  if (p.group_id && opts.customerGroup !== false) { w.push('d.customer_id IN (SELECT id FROM customers WHERE group_id = ?)'); a.push(p.group_id); }
  return { w: w.join(' AND '), a };
}
function itemW(p: P, alias = 'pr') {
  const w: string[] = [];
  const a: any[] = [];
  if (p.category_id) { w.push(`${alias}.category_id = ?`); a.push(p.category_id); }
  if (p.subcategory_id) { w.push(`${alias}.subcategory_id = ?`); a.push(p.subcategory_id); }
  if (p.brand_id) { w.push(`${alias}.brand_id = ?`); a.push(p.brand_id); }
  if (p.product_id) { w.push(`${alias}.id = ?`); a.push(p.product_id); }
  return { w: w.length ? ' AND ' + w.join(' AND ') : '', a };
}
const partyName = `COALESCE(CASE WHEN c.is_walkin = 1 THEN d.walkin_name END, c.name, s.name)`;
const docJoin = `LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN suppliers s ON s.id = d.supplier_id LEFT JOIN users u ON u.id = d.created_by LEFT JOIN employees e ON e.id = d.sales_person_id`;
const lateCollect = `(SELECT COALESCE(SUM(CASE WHEN j.type = 'receipt' THEN jl.credit ELSE jl.debit END),0) FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.ref_doc_id = d.id AND j.type IN ('receipt','payment'))`;
const returned = `(SELECT COALESCE(SUM(x.total),0) FROM docs x WHERE x.ref_doc_id = d.id AND x.kind IN ('sreturn','preturn'))`;

function invoiceRows(p: P, kinds: string[], dueOnly = false) {
  const { w, a } = docW(p, kinds);
  return all(
    `SELECT d.id, d.no, d.date, ${partyName} party, COALESCE(c.mobile, s.mobile, d.walkin_mobile) mobile, d.gross, d.item_discount + d.discount discount, d.vat, d.ait, d.other, d.freight,
       d.less + d.redeem less, d.exchange, d.total, d.paid, ${lateCollect} later, ${returned} returned, d.cost_total, u.name user_name, e.name sales_person, d.note
     FROM docs d ${docJoin} WHERE ${w} ORDER BY d.date, d.id`,
    a,
  ).map(r => ({ ...r, collected: round2(r.paid + r.later), due: round2(r.total - r.paid - r.later - r.returned) })).filter(r => !dueOnly || r.due > 0.009);
}

function lineRows(p: P, kinds: string[], extra = '') {
  const { w, a } = docW(p, kinds);
  const iw = itemW(p);
  return all(
    `SELECT l.*, d.no, d.date, d.kind, ${partyName} party, pr.code, u.name user_name, e.name sales_person,
       ROUND(l.qty * l.price, 2) gross, ROUND(l.qty * l.price * l.disc_pct / 100.0 + l.disc, 2) ldisc,
       ROUND((l.qty * l.price - (l.qty * l.price * l.disc_pct / 100.0 + l.disc)) * l.vat_pct / 100.0, 2) lvat,
       CASE WHEN d.gross > 0 THEN ROUND(l.qty * l.price / d.gross * (d.discount), 2) ELSE 0 END fdisc,
       CASE WHEN d.gross > 0 THEN ROUND(l.qty * l.price / d.gross * (d.vat - 0), 2) ELSE 0 END fvat,
       CASE WHEN d.gross > 0 THEN ROUND(l.qty * l.price / d.gross * d.ait, 2) ELSE 0 END fait,
       CASE WHEN d.gross > 0 THEN ROUND(l.qty * l.price / d.gross * d.other, 2) ELSE 0 END foth,
       CASE WHEN d.gross > 0 THEN ROUND(l.qty * l.price / d.gross * d.freight, 2) ELSE 0 END ffre,
       CASE WHEN d.gross > 0 THEN ROUND(l.qty * l.price / d.gross * (d.less + d.redeem + d.exchange), 2) ELSE 0 END fless
     FROM doc_lines l JOIN docs d ON d.id = l.doc_id ${docJoin} LEFT JOIN products pr ON pr.id = l.product_id
     WHERE ${w}${iw.w}${extra} ORDER BY d.date, d.id, l.id`,
    [...a, ...iw.a],
  ).map(r => {
    const dis = round2(r.ldisc + r.fdisc), vat = round2(r.fvat), total = round2(r.gross - dis + vat + r.fait + r.foth + r.ffre - r.fless);
    const cost = round2(r.cost * r.qty);
    const woVa = round2(total - vat - r.fait);
    return { ...r, dis, vat, ait: r.fait, oth: r.foth, fre: r.ffre, less: r.fless, total, cost_total: cost, profit_wo: round2(woVa - cost), profit_inc: round2(total - cost) };
  });
}

function stmt(p: P, ledgerId: number | undefined, u: SessionUser): ReportResult {
  if (!ledgerId) throw new HttpError(400, 'Select a ledger.');
  const { from, to } = range(p);
  const s = ledgerStatement(u, ledgerId, from, to);
  const rows = [{ date: from, no: '', type: 'Opening balance', narration: '', against: '', debit: s.opening > 0 ? s.opening : 0, credit: s.opening < 0 ? -s.opening : 0, balance: s.opening }, ...s.lines];
  return { sections: [{ title: s.ledger.name, columns: [D('date'), T('no', 'Voucher / Invoice'), T('type', 'Type'), T('against', 'Particulars'), T('narration', 'Details'), M('debit', 'Debit'), M('credit', 'Credit'), M('balance', 'Balance', false)], rows, totals: { debit: s.totals.debit, credit: s.totals.credit, balance: s.totals.closing } }], meta: { opening: s.opening, closing: s.totals.closing } };
}

function stockAt(p: P, upTo?: string, from?: string) {
  const iw = itemW(p);
  const w: string[] = [];
  const a: any[] = [];
  if (p.loc) { const [t, id] = String(p.loc).split(':'); w.push('m.loc_type = ? AND m.loc_id = ?'); a.push(t, Number(id)); }
  const dateCond = (x: string) => (x ? x : '1 = 1');
  return all(
    `SELECT pr.id, pr.code, pr.name, c.name color, s.name size, m.color_id, m.size_id, pr.price, pr.min_stock,
       COALESCE(SUM(CASE WHEN ${dateCond(from ? 'm.date < ?' : '')} THEN m.qty END),0) op_qty,
       COALESCE(SUM(CASE WHEN m.qty > 0 AND ${from ? 'm.date >= ?' : '1=1'} AND ${upTo ? 'm.date <= ?' : '1=1'} THEN m.qty END),0) in_qty,
       COALESCE(-SUM(CASE WHEN m.qty < 0 AND ${from ? 'm.date >= ?' : '1=1'} AND ${upTo ? 'm.date <= ?' : '1=1'} THEN m.qty END),0) out_qty,
       COALESCE(SUM(CASE WHEN ${upTo ? 'm.date <= ?' : '1=1'} THEN m.qty END),0) cl_qty,
       COALESCE(SUM(CASE WHEN m.qty > 0 THEN m.qty * m.cost END),0) / NULLIF(SUM(CASE WHEN m.qty > 0 THEN m.qty END),0) avg_cost
     FROM stock_moves m JOIN products pr ON pr.id = m.product_id LEFT JOIN colors c ON c.id = m.color_id LEFT JOIN sizes s ON s.id = m.size_id
     WHERE 1 = 1 ${w.length ? 'AND ' + w.join(' AND ') : ''}${iw.w} GROUP BY pr.id, m.color_id, m.size_id ORDER BY pr.name`,
    [...(from ? [from] : []), ...(from ? [from] : []), ...(upTo ? [upTo] : []), ...(from ? [from] : []), ...(upTo ? [upTo] : []), ...(upTo ? [upTo] : []), ...a, ...iw.a],
  ).map(r => ({ ...r, avg_cost: round2(r.avg_cost ?? 0), op_qty: round2(r.op_qty), in_qty: round2(r.in_qty), out_qty: round2(r.out_qty), cl_qty: round2(r.cl_qty) }));
}

function partyBalances(kind: 'customer' | 'supplier', p: P) {
  const t = kind === 'customer' ? 'customers' : 'suppliers';
  const w = [kind === 'customer' ? 'x.is_walkin = 0' : 'x.is_opening = 0'];
  const a: any[] = [p.to || today()];
  if (p.district_id) { w.push('x.district_id = ?'); a.push(p.district_id); }
  if (p.zone_id) { w.push('x.zone_id = ?'); a.push(p.zone_id); }
  if (p.group_id) { w.push('x.group_id = ?'); a.push(p.group_id); }
  return all(
    `SELECT x.id, x.code, x.name, x.mobile, x.address, x.ledger_id, ${kind === 'customer' ? 'x.credit_limit, ' : ''}
       COALESCE(SUM(jl.debit),0) debit, COALESCE(SUM(jl.credit),0) credit
     FROM ${t} x LEFT JOIN (SELECT jl.* FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE j.date <= ?) jl ON jl.ledger_id = x.ledger_id
     WHERE ${w.join(' AND ')} GROUP BY x.id ORDER BY x.name`,
    a,
  ).map(r => ({ ...r, debit: round2(r.debit), credit: round2(r.credit), balance: round2(kind === 'customer' ? r.debit - r.credit : r.credit - r.debit) }));
}

const R: Record<string, (p: P, u: SessionUser) => ReportResult> = {
  // ─────────── Daily ───────────
  daily_purchase: p => {
    const rows = lineRows(p, ['purchase']).map(r => ({ ...r, rec: 0 }));
    for (const r of rows) r.instock = round2(get(`SELECT COALESCE(SUM(qty),0) q FROM stock_moves WHERE product_id = ?`, [r.product_id])?.q ?? 0);
    return one([D('date'), T('no', 'Invoice'), T('party', 'Supplier'), T('name', 'Item'), N('qty', 'PU.Qty'), M('price', 'Cost', false), M('gross', 'MRP'), M('dis', 'Dis'), M('vat', 'VAT'), M('ait', 'TAX'), M('oth', 'OTA'), M('fre', 'FRE'), M('less', 'LES'), M('total', 'Total'), N('instock', 'AV. Qty', false)], rows);
  },
  daily_item_value: p => {
    const rows = stockAt(p).filter(r => r.cl_qty !== 0);
    if (p.supplier_id) {
      const ids = new Set(all(`SELECT DISTINCT l.product_id FROM doc_lines l JOIN docs d ON d.id = l.doc_id WHERE d.kind = 'purchase' AND d.supplier_id = ?`, [p.supplier_id]).map(r => r.product_id));
      for (let i = rows.length - 1; i >= 0; i--) if (!ids.has(rows[i].id)) rows.splice(i, 1);
    }
    return one([T('code', 'Code'), T('name', 'Item'), T('color', 'Color'), T('size', 'Size'), N('cl_qty', 'Qty'), M('avg_cost', 'Avg Cost', false), M('cost_value', 'Cost Value'), M('price', 'Price', false), M('sale_value', 'Sale Value'), M('margin', 'Margin')],
      rows.map(r => ({ ...r, cost_value: round2(r.cl_qty * r.avg_cost), sale_value: round2(r.cl_qty * r.price), margin: round2(r.cl_qty * (r.price - r.avg_cost)) })));
  },
  daily_cash: p => {
    const { from, to } = range(p);
    const money = all(`SELECT id FROM ledgers WHERE kind IN ('cash','bank','mobile')`).map(r => r.id);
    const ids = money.join(',') || '0';
    const opening = round2(get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) b FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.ledger_id IN (${ids}) AND j.date < ?`, [from])?.b ?? 0);
    const flows = all(`SELECT j.type, COALESCE(SUM(jl.debit),0) inflow, COALESCE(SUM(jl.credit),0) outflow FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.ledger_id IN (${ids}) AND j.date BETWEEN ? AND ? ${p.branch_id ? 'AND j.branch_id = ?' : ''} GROUP BY j.type`, p.branch_id ? [from, to, p.branch_id] : [from, to]);
    const label: Record<string, string> = { sale: 'Sales collection', service: 'Service collection', receipt: 'Received vouchers', purchase: 'Purchase payment', payment: 'Payment vouchers', expense: 'Expenses', sreturn: 'Sales return refund', preturn: 'Purchase return refund', contra: 'Internal transfer', journal: 'Journal', donation: 'Donation', opening: 'Opening balance', disposal: 'Disposal recover', cheque_bounce: 'Cheque bounced', salary: 'Salary' };
    const rows: Row[] = [{ particular: 'Opening balance', type: '', amount: opening }];
    let bal = opening;
    for (const f of flows) {
      if (f.inflow) { rows.push({ particular: label[f.type] ?? f.type, type: 'In', amount: round2(f.inflow) }); bal += f.inflow; }
      if (f.outflow) { rows.push({ particular: label[f.type] ?? f.type, type: 'Out', amount: -round2(f.outflow) }); bal -= f.outflow; }
    }
    rows.push({ particular: 'Closing balance', type: '', amount: round2(bal) });
    const byAcc = all(`SELECT l.name, l.kind, COALESCE(SUM(jl.debit - jl.credit),0) balance FROM ledgers l LEFT JOIN journal_lines jl ON jl.ledger_id = l.id LEFT JOIN journals j ON j.id = jl.journal_id AND j.date <= ? WHERE l.kind IN ('cash','bank','mobile') GROUP BY l.id ORDER BY l.kind, l.name`, [to]);
    return { sections: [{ title: 'Daily cash statement', columns: [T('particular', 'Particular'), T('type', 'Type'), M('amount', 'Amount', false)], rows }, table([T('name', 'Account'), T('kind', 'Type'), M('balance', 'Balance')], byAcc.map(r => ({ ...r, balance: round2(r.balance) })), 'Closing balance by account')] };
  },
  daily_sales: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), T('code', 'Code'), T('name', 'Item'), N('qty', 'Qty'), M('price', 'Price', false), M('dis', 'Discount'), M('vat', 'VAT'), M('total', 'Total')], lineRows(p, ['sale'])),
  daily_sales_due: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), T('mobile', 'Mobile'), M('total', 'Total'), M('collected', 'Collected'), M('returned', 'Returned'), M('due', 'Due'), T('sales_person', 'Sales Person'), T('user_name', 'User')], invoiceRows(p, ['sale'], true)),
  daily_pl_invoice: p => {
    const rows = invoiceRows(p, ['sale']).map(r => ({ ...r, wo: round2(r.total - r.vat - r.ait - r.cost_total), inc: round2(r.total - r.cost_total) }));
    return one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), M('gross', 'Price'), M('discount', 'Dis'), M('vat', 'Vat'), M('ait', 'Ait'), M('other', 'Oth'), M('freight', 'Fre'), M('less', 'Les/C.B.'), M('total', 'Total'), M('cost_total', 'Cost'), M('wo', 'W/o.VA'), M('inc', 'Inc.VA')], rows);
  },
  daily_pl_item: p => one([D('date'), T('no', 'Invoice'), T('name', 'Item'), N('qty', 'Qty'), M('gross', 'MrpT'), M('dis', 'Dis'), M('vat', 'Vat'), M('ait', 'Ait'), M('oth', 'Oth'), M('fre', 'Fre'), M('less', 'Les/C.B.'), M('total', 'Total'), M('cost_total', 'Cost'), M('profit_wo', 'W/o.VA'), M('profit_inc', 'Inc.VA')], lineRows(p, ['sale'])),
  daily_service: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), M('gross', 'Price'), M('discount', 'Discount'), M('vat', 'VAT'), M('total', 'Total'), M('collected', 'Collected'), M('due', 'Due')], invoiceRows(p, ['service'])),
  daily_service_due: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), T('mobile', 'Mobile'), M('total', 'Total'), M('collected', 'Collected'), M('due', 'Due'), T('sales_person', 'Service Person')], invoiceRows(p, ['service'], true)),
  daily_pl_service_invoice: p => {
    const rows = invoiceRows(p, ['service']).map(r => ({ ...r, wo: round2(r.total - r.vat - r.ait - r.cost_total), inc: round2(r.total - r.cost_total) }));
    return one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), M('gross', 'Price'), M('discount', 'Dis'), M('vat', 'Vat'), M('ait', 'Ait'), M('other', 'Oth'), M('freight', 'Fre'), M('less', 'Les'), M('total', 'Total'), M('cost_total', 'Cost'), M('wo', 'W/o.VA'), M('inc', 'Inc.VA')], rows);
  },
  daily_pl_service_item: p => {
    const extra = p.service_id ? ` AND l.service_id = ${Number(p.service_id)}` : '';
    const rows = lineRows({ ...p, product_id: undefined }, ['service'], extra + (p.category_id ? ` AND l.service_id IN (SELECT id FROM services WHERE category_id = ${Number(p.category_id)})` : ''));
    return one([D('date'), T('no', 'Invoice'), T('name', 'Service'), N('qty', 'Qty'), M('gross', 'Price'), M('dis', 'Dis'), M('vat', 'Vat'), M('ait', 'Ait'), M('oth', 'Oth'), M('fre', 'Fre'), M('less', 'Les'), M('total', 'Total'), M('cost_total', 'Cost'), M('profit_wo', 'W/o.VA'), M('profit_inc', 'Inc.VA')], rows);
  },
  daily_expense: p => {
    const { from, to } = range(p);
    const rows = all(`SELECT j.date, j.no, l.name head, jl.debit amount, jl.ref, j.narration note, u.name user_name FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id LEFT JOIN users u ON u.id = j.created_by
      WHERE j.type = 'expense' AND jl.debit > 0 AND j.date BETWEEN ? AND ? ${p.expense_id ? 'AND jl.ledger_id = ?' : ''} ${p.branch_id ? 'AND j.branch_id = ?' : ''} ORDER BY j.date, j.id`, [from, to, ...(p.expense_id ? [p.expense_id] : []), ...(p.branch_id ? [p.branch_id] : [])]);
    return one([D('date'), T('no', 'Voucher'), T('head', 'Expenses Head'), M('amount', 'Amount'), T('ref', 'Ref'), T('note', 'Note'), T('user_name', 'By')], rows);
  },
  daily_expense_details: p => {
    const { from, to } = range(p);
    const base = `FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id JOIN acc_subgroups s ON s.id = l.subgroup_id JOIN acc_groups g ON g.id = s.group_id
      WHERE g.class_id = 4 AND l.system_key IS NOT 'COGS' AND j.date BETWEEN ? AND ? ${p.expense_id ? 'AND jl.ledger_id = ?' : ''}`;
    const args = [from, to, ...(p.expense_id ? [p.expense_id] : [])];
    if (p.type === 'head') return one([T('head', 'Expenses Head'), T('type', 'Type'), N('count', 'Entries'), M('amount', 'Amount')], all(`SELECT l.name head, s.name type, COUNT(*) count, ROUND(SUM(jl.debit - jl.credit),2) amount ${base} GROUP BY l.id ORDER BY amount DESC`, args));
    return one([D('date'), T('no', 'Voucher'), T('head', 'Expenses Head'), T('type', 'Type'), T('memo', 'Details'), M('amount', 'Amount')], all(`SELECT j.date, j.no, l.name head, s.name type, COALESCE(jl.memo, jl.ref, j.narration) memo, ROUND(jl.debit - jl.credit,2) amount ${base} ORDER BY j.date, j.id`, args));
  },
  daily_overview: (p, u) => {
    const sales = invoiceRows(p, ['sale']), service = invoiceRows(p, ['service']), pur = invoiceRows(p, ['purchase']);
    const { from, to } = range(p);
    const sr = round2(get(`SELECT COALESCE(SUM(total),0) t FROM docs WHERE kind = 'sreturn' AND date BETWEEN ? AND ?`, [from, to])?.t ?? 0);
    const is = incomeStatement(u, from, to);
    const sum = (rs: Row[], k: string) => round2(rs.reduce((s, r) => s + r[k], 0));
    return { sections: [kv([
      ['Sales invoices', sales.length], ['Sales total', sum(sales, 'total')], ['Sales collected', sum(sales, 'collected')], ['Sales due', sum(sales, 'due')], ['Sales return', sr],
      ['Service total', sum(service, 'total')], ['Purchase total', sum(pur, 'total')], ['Purchase paid', sum(pur, 'collected')],
      ['Cost of goods sold', sum(sales, 'cost_total')], ['Indirect expenses', is.totals.indirect], ['Gross profit', is.totals.grossProfit], ['Net profit', is.totals.netProfit],
    ], `Overview ${from} → ${to}`)] };
  },

  // ─────────── Sales ───────────
  sales_invoice: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), M('gross', 'Gross'), M('discount', 'Discount'), M('vat', 'VAT'), M('ait', 'AIT'), M('other', 'Other'), M('freight', 'Freight'), M('less', 'Less'), M('exchange', 'Exchange'), M('total', 'Total'), M('collected', 'Paid'), M('returned', 'Return'), M('due', 'Due'), T('sales_person', 'SR'), T('user_name', 'User')], invoiceRows(p, ['sale'])),
  sales_invoice_item: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), T('name', 'Item'), N('qty', 'Qty'), M('gross', 'MrpT'), M('dis', 'Dis'), M('vat', 'Vat'), M('ait', 'Ait'), M('oth', 'Oth'), M('fre', 'Fre'), M('less', 'Les/C.B.'), M('total', 'Total'), M('cost_total', 'Cost'), M('profit_wo', 'W/o.VA'), M('profit_inc', 'Inc.VA')], lineRows(p, ['sale'])),
  sales_due: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), T('mobile', 'Mobile'), M('total', 'Total'), M('collected', 'Collected'), M('returned', 'Returned'), M('due', 'Due'), T('sales_person', 'SR'), T('user_name', 'User')], invoiceRows(p, ['sale'], true)),
  sales_return_invoice: p => {
    const { w, a } = docW(p, ['sreturn']);
    return one([D('date'), T('no', 'Return No'), T('against', 'Against'), T('party', 'Customer'), M('total', 'Total'), M('adjust', 'Adjust'), M('paid', 'Refund'), T('note', 'Note')], all(`SELECT d.*, r.no against, ${partyName} party FROM docs d ${docJoin} LEFT JOIN docs r ON r.id = d.ref_doc_id WHERE ${w} ORDER BY d.date`, a));
  },
  sales_return_item: p => one([D('date'), T('no', 'Return'), T('party', 'Customer'), T('name', 'Item'), N('qty', 'Qty'), M('price', 'Rate', false), M('subtotal', 'Total'), M('cost_total', 'Cost')], lineRows(p, ['sreturn']).map(r => ({ ...r, cost_total: round2(r.cost * r.qty) }))),
  sales_customerwise: p => {
    const rows = invoiceRows(p, ['sale']);
    const g = new Map<string, Row>();
    for (const r of rows) { const k = r.party; const x = g.get(k) ?? { party: k, invoices: 0, total: 0, collected: 0, due: 0, list: [] as string[] }; x.invoices++; x.total += r.total; x.collected += r.collected; x.due += r.due; x.list.push(r.no); g.set(k, x); }
    return one([T('party', 'Customer'), N('invoices', 'Invoices'), T('inv', 'Invoice Details'), M('total', 'Total'), M('collected', 'Collected'), M('due', 'Due')], [...g.values()].map(x => ({ ...x, total: round2(x.total), collected: round2(x.collected), due: round2(x.due), inv: x.list.join(', ') })));
  },
  sales_customerwise_details: p => one([T('party', 'Customer'), D('date'), T('no', 'Invoice'), T('name', 'Item'), N('qty', 'Qty'), M('price', 'Rate', false), M('total', 'Total')], lineRows(p, ['sale']).sort((a, b) => String(a.party).localeCompare(String(b.party)))),
  sales_return_customerwise: p => {
    const { w, a } = docW(p, ['sreturn']);
    return one([T('party', 'Customer'), N('n', 'Returns'), T('inv', 'Invoice Details'), M('total', 'Total')], all(`SELECT ${partyName} party, COUNT(*) n, GROUP_CONCAT(d.no, ', ') inv, ROUND(SUM(d.total),2) total FROM docs d ${docJoin} WHERE ${w} GROUP BY party ORDER BY total DESC`, a));
  },
  sales_customer_net: p => {
    const { from, to } = range(p);
    const all_ = p.scope === 'all';
    const rows = all(`SELECT c.id, c.code, c.name party, c.address,
        COALESCE((SELECT SUM(gross) FROM docs WHERE customer_id = c.id AND kind = 'sale' ${all_ ? '' : 'AND date BETWEEN ? AND ?'}),0) sales,
        COALESCE((SELECT SUM(item_discount + discount + less + redeem) FROM docs WHERE customer_id = c.id AND kind = 'sale' ${all_ ? '' : 'AND date BETWEEN ? AND ?'}),0) discount,
        COALESCE((SELECT SUM(total) FROM docs WHERE customer_id = c.id AND kind = 'sreturn' ${all_ ? '' : 'AND date BETWEEN ? AND ?'}),0) ret,
        COALESCE((SELECT SUM(debit) FROM journal_lines WHERE ledger_id = c.ledger_id),0) debit, COALESCE((SELECT SUM(credit) FROM journal_lines WHERE ledger_id = c.ledger_id),0) credit
      FROM customers c WHERE c.is_walkin = 0 ${p.group_id ? 'AND c.group_id = ?' : ''} ORDER BY c.name`, [...(all_ ? [] : [from, to, from, to, from, to]), ...(p.group_id ? [p.group_id] : [])])
      .map(r => ({ ...r, net: round2(r.sales - r.discount - r.ret), balance: round2(r.debit - r.credit) })).filter(r => r.sales || r.ret || r.balance);
    return one([T('code', 'Code'), T('party', 'Customer'), T('address', 'Address'), M('sales', 'Sales'), M('discount', 'Discount'), M('ret', 'Return'), M('net', 'Net Sales'), M('debit', 'Debit'), M('credit', 'Credit'), M('balance', 'Balance')], rows);
  },
  sales_itemwise: p => {
    const { from, to } = range(p);
    const lines = lineRows(p, ['sale']);
    const g = new Map<number, Row>();
    for (const l of lines) { const x = g.get(l.product_id) ?? { product_id: l.product_id, code: l.code, name: l.name, qty: 0, gross: 0, dis: 0, vat: 0, ait: 0, oth: 0, fre: 0, less: 0, total: 0 }; for (const k of ['qty', 'gross', 'dis', 'vat', 'ait', 'oth', 'fre', 'less', 'total']) x[k] = round2(x[k] + l[k]); g.set(l.product_id, x); }
    const rows = [...g.values()].map(r => {
      const op = round2(get(`SELECT COALESCE(SUM(qty),0) q FROM stock_moves WHERE product_id = ? AND date < ?`, [r.product_id, from])?.q ?? 0);
      const du = round2(get(`SELECT COALESCE(SUM(qty),0) q FROM stock_moves WHERE product_id = ? AND date BETWEEN ? AND ?`, [r.product_id, from, to])?.q ?? 0);
      return { ...r, op, du, cl: round2(op + du) };
    });
    return one([T('code', 'Code'), T('name', 'Item'), N('qty', 'SO.Qty'), M('gross', 'MRP'), M('dis', 'Dis'), M('vat', 'VAT'), M('ait', 'AIT'), M('oth', 'OTA'), M('fre', 'FRE'), M('less', 'LES'), M('total', 'Total'), N('op', 'OP.Qty'), N('du', 'DU.Qty'), N('cl', 'CL.Qty')], rows);
  },
  sales_item_statement: p => {
    if (!p.product_id) throw new HttpError(400, 'Select an item.');
    return one([D('date'), T('no', 'Invoice'), T('kind', 'Type'), T('party', 'Customer'), N('qty', 'Qty'), M('price', 'Rate', false), M('total', 'Total')], lineRows(p, ['sale', 'sreturn']).map(r => ({ ...r, kind: r.kind === 'sale' ? 'Sale' : 'Return', qty: r.kind === 'sale' ? r.qty : -r.qty, total: r.kind === 'sale' ? r.total : -r.subtotal })));
  },
  sales_periodic: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), T('name', 'Item'), ...(p.serial === 'yes' ? [T('serial_list', 'Serials')] : []), N('qty', 'SO.Qty'), M('gross', 'MRP'), M('dis', 'Dis'), M('vat', 'VAT'), M('ait', 'AIT'), M('oth', 'OTA'), M('fre', 'FRE'), M('less', 'LES/C.B.'), M('total', 'Total')], lineRows(p, ['sale']).map(r => ({ ...r, serial_list: JSON.parse(r.serials || '[]').join(', ') }))),
  sales_monthly: p => {
    const { w, a } = docW(p, ['sale', 'service']);
    const fmt = p.period === 'day' ? '%Y-%m-%d' : p.period === 'week' ? '%Y-W%W' : '%Y-%m';
    const rows = all(`SELECT strftime('${fmt}', d.date) period, COUNT(*) orders, ROUND(SUM(d.total),2) revenue, ROUND(SUM(d.vat + d.ait),2) tax, ROUND(SUM(d.total - d.vat - d.ait),2) wo FROM docs d WHERE ${w} GROUP BY period ORDER BY period`, a);
    return one([T('period', p.period === 'day' ? 'Day' : p.period === 'week' ? 'Week' : 'Month'), N('orders', 'Total Order'), M('revenue', 'Revenue (Inc.VA)'), M('tax', 'VAT & AIT'), M('wo', 'W/O.VA')], rows);
  },
  sales_overview: p => {
    const rows = invoiceRows(p, ['sale']);
    const { from, to } = range(p);
    const sum = (k: string) => round2(rows.reduce((s, r) => s + r[k], 0));
    const sr = round2(get(`SELECT COALESCE(SUM(total),0) t FROM docs WHERE kind = 'sreturn' AND date BETWEEN ? AND ?`, [from, to])?.t ?? 0);
    const top = all(`SELECT l.name, ROUND(SUM(l.qty),2) qty, ROUND(SUM(l.subtotal),2) amount FROM doc_lines l JOIN docs d ON d.id = l.doc_id WHERE d.kind = 'sale' AND d.date BETWEEN ? AND ? GROUP BY l.product_id ORDER BY amount DESC LIMIT 10`, [from, to]);
    return { sections: [kv([['Invoices', rows.length], ['Gross sales', sum('gross')], ['Discounts', sum('discount')], ['VAT + AIT', round2(sum('vat') + sum('ait'))], ['Net invoiced', sum('total')], ['Returns', sr], ['Collected', sum('collected')], ['Outstanding due', sum('due')], ['Cost of goods', sum('cost_total')], ['Gross margin', round2(sum('total') - sum('vat') - sum('ait') - sum('cost_total') - sr)], ['Average invoice', rows.length ? round2(sum('total') / rows.length) : 0]], 'Sales overview'), table([T('name', 'Top items'), N('qty', 'Qty'), M('amount', 'Amount')], top, 'Top 10 items')] };
  },

  // ─────────── Service ───────────
  service_invoice: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), M('gross', 'Gross'), M('discount', 'Discount'), M('vat', 'VAT'), M('total', 'Total'), M('collected', 'Paid'), M('due', 'Due'), T('user_name', 'User')], invoiceRows(p, ['service'])),
  service_due: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), T('mobile', 'Mobile'), M('total', 'Total'), M('collected', 'Collected'), M('due', 'Due'), T('sales_person', 'Service Person')], invoiceRows(p, ['service'], true)),
  service_customerwise: p => {
    const { w, a } = docW(p, ['service']);
    return one([T('party', 'Customer'), N('n', 'Invoices'), T('inv', 'Invoice Details'), M('total', 'Total')], all(`SELECT ${partyName} party, COUNT(*) n, GROUP_CONCAT(d.no, ', ') inv, ROUND(SUM(d.total),2) total FROM docs d ${docJoin} WHERE ${w} GROUP BY party ORDER BY total DESC`, a));
  },
  service_itemwise: p => {
    const lines = lineRows({ ...p, product_id: undefined, category_id: undefined }, ['service'], `${p.service_id ? ` AND l.service_id = ${Number(p.service_id)}` : ''}${p.category_id ? ` AND l.service_id IN (SELECT id FROM services WHERE category_id = ${Number(p.category_id)})` : ''}`);
    const g = new Map<string, Row>();
    for (const l of lines) { const x = g.get(l.name) ?? { name: l.name, qty: 0, gross: 0, dis: 0, vat: 0, ait: 0, oth: 0, fre: 0, less: 0, total: 0 }; for (const k of ['qty', 'gross', 'dis', 'vat', 'ait', 'oth', 'fre', 'less', 'total']) x[k] = round2(x[k] + l[k]); g.set(l.name, x); }
    return one([T('name', 'Service'), N('qty', 'SO.Qty'), M('gross', 'MRP'), M('dis', 'Dis'), M('vat', 'VAT'), M('ait', 'AIT'), M('oth', 'OTA'), M('fre', 'FRE'), M('less', 'LES'), M('total', 'Total')], [...g.values()]);
  },
  service_item_statement: p => {
    if (!p.service_id) throw new HttpError(400, 'Select a service.');
    return one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), N('qty', 'Qty'), M('price', 'Rate', false), M('total', 'Total')], lineRows({ ...p, product_id: undefined }, ['service'], ` AND l.service_id = ${Number(p.service_id)}`));
  },
  service_periodic: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), T('name', 'Service'), N('qty', 'SO.Qty'), M('gross', 'MRP'), M('dis', 'Dis'), M('vat', 'VAT'), M('ait', 'AIT'), M('oth', 'OTA'), M('fre', 'FRE'), M('less', 'LES'), M('total', 'Total')],
    lineRows({ ...p, product_id: undefined, category_id: undefined }, ['service'], `${p.service_id ? ` AND l.service_id = ${Number(p.service_id)}` : ''}${p.category_id ? ` AND l.service_id IN (SELECT id FROM services WHERE category_id = ${Number(p.category_id)})` : ''}`)),
  service_overview: p => {
    const rows = invoiceRows(p, ['service']);
    const sum = (k: string) => round2(rows.reduce((s, r) => s + r[k], 0));
    return { sections: [kv([['Invoices', rows.length], ['Gross', sum('gross')], ['Discounts', sum('discount')], ['Net invoiced', sum('total')], ['Collected', sum('collected')], ['Outstanding due', sum('due')], ['Service cost', sum('cost_total')], ['Margin', round2(sum('total') - sum('cost_total'))]], 'Service overview')] };
  },

  // ─────────── Purchase ───────────
  purchase_invoice: p => one([D('date'), T('no', 'Invoice'), T('party', 'Supplier'), M('gross', 'Gross'), M('discount', 'Discount'), M('vat', 'VAT'), M('ait', 'Tax'), M('other', 'Other'), M('freight', 'Freight'), M('less', 'Less'), M('total', 'Total'), M('collected', 'Paid'), M('returned', 'Return'), M('due', 'Due'), T('user_name', 'User')], invoiceRows(p, ['purchase'])),
  purchase_return_invoice: p => {
    const { w, a } = docW(p, ['preturn']);
    return one([D('date'), T('no', 'Return No'), T('against', 'Against'), T('party', 'Supplier'), M('total', 'Total'), M('adjust', 'Adjust'), M('paid', 'Refund'), T('note', 'Note')], all(`SELECT d.*, r.no against, ${partyName} party FROM docs d ${docJoin} LEFT JOIN docs r ON r.id = d.ref_doc_id WHERE ${w} ORDER BY d.date`, a));
  },
  purchase_return_item: p => one([D('date'), T('no', 'Return'), T('party', 'Supplier'), T('name', 'Item'), N('qty', 'Qty'), M('price', 'Cost', false), M('subtotal', 'Total')], lineRows(p, ['preturn'])),
  purchase_supplierwise: p => {
    const { w, a } = docW(p, ['purchase']);
    return one([T('party', 'Supplier'), N('n', 'Invoices'), T('inv', 'Invoice Details'), M('total', 'Total'), M('paid', 'Paid')], all(`SELECT ${partyName} party, COUNT(*) n, GROUP_CONCAT(d.no, ', ') inv, ROUND(SUM(d.total),2) total, ROUND(SUM(d.paid),2) paid FROM docs d ${docJoin} WHERE ${w} GROUP BY party ORDER BY total DESC`, a));
  },
  purchase_supplierwise_details: p => one([T('party', 'Supplier'), D('date'), T('no', 'Invoice'), T('name', 'Item'), N('qty', 'Qty'), M('price', 'Cost', false), M('total', 'Total')], lineRows(p, ['purchase']).sort((a, b) => String(a.party).localeCompare(String(b.party)))),
  purchase_itemwise: p => {
    const lines = lineRows(p, ['purchase']);
    const g = new Map<number, Row>();
    for (const l of lines) { const x = g.get(l.product_id) ?? { product_id: l.product_id, code: l.code, name: l.name, qty: 0, gross: 0, dis: 0, vat: 0, ait: 0, oth: 0, fre: 0, less: 0, total: 0 }; for (const k of ['qty', 'gross', 'dis', 'vat', 'ait', 'oth', 'fre', 'less', 'total']) x[k] = round2(x[k] + l[k]); g.set(l.product_id, x); }
    const rows = [...g.values()].map(r => {
      const q = (kinds: string) => round2(get(`SELECT COALESCE(SUM(ABS(qty)),0) q FROM stock_moves WHERE product_id = ? AND kind IN (${kinds})`, [r.product_id])?.q ?? 0);
      const rc = round2(get(`SELECT COALESCE(SUM(sl.qty),0) q FROM stock_doc_lines sl JOIN stock_docs sd ON sd.id = sl.stock_doc_id WHERE sd.kind = 'receive' AND sl.product_id = ?`, [r.product_id])?.q ?? 0);
      return { ...r, rc, re: q(`'preturn'`), out: q(`'sale','disposal','bad_claim','warranty_out'`), cl: round2(get(`SELECT COALESCE(SUM(qty),0) q FROM stock_moves WHERE product_id = ?`, [r.product_id])?.q ?? 0) };
    });
    return one([T('code', 'Code'), T('name', 'Item'), N('qty', 'Qty'), M('gross', 'Cost'), M('dis', 'Dis'), M('vat', 'VAT'), M('ait', 'TAX'), M('oth', 'OTA'), M('fre', 'FRE'), M('less', 'LES'), M('total', 'Total'), N('rc', 'RC.Qty'), N('re', 'RE.Qty'), N('out', 'Out.Qty'), N('cl', 'CL.Qty')], rows);
  },
  purchase_item_statement: p => {
    if (!p.product_id) throw new HttpError(400, 'Select an item.');
    return one([D('date'), T('no', 'Invoice'), T('kind', 'Type'), T('party', 'Supplier'), N('qty', 'Qty'), M('price', 'Cost', false), M('total', 'Total')], lineRows(p, ['purchase', 'preturn']).map(r => ({ ...r, kind: r.kind === 'purchase' ? 'Purchase' : 'Return', qty: r.kind === 'purchase' ? r.qty : -r.qty, total: r.kind === 'purchase' ? r.total : -r.subtotal })));
  },
  purchase_periodic: p => one([D('date'), T('no', 'Invoice'), T('party', 'Supplier'), T('name', 'Item'), ...(p.serial === 'yes' ? [T('serial_list', 'Serials')] : []), N('qty', 'Qty'), M('gross', 'Cost'), M('dis', 'Dis'), M('vat', 'VAT'), M('ait', 'TAX'), M('oth', 'OTA'), M('fre', 'FRE'), M('less', 'LES'), M('total', 'Total')], lineRows(p, ['purchase']).map(r => ({ ...r, serial_list: JSON.parse(r.serials || '[]').join(', ') }))),
  purchase_overview: p => {
    const rows = invoiceRows(p, ['purchase']);
    const { from, to } = range(p);
    const sum = (k: string) => round2(rows.reduce((s, r) => s + r[k], 0));
    const pr = round2(get(`SELECT COALESCE(SUM(total),0) t FROM docs WHERE kind = 'preturn' AND date BETWEEN ? AND ?`, [from, to])?.t ?? 0);
    return { sections: [kv([['Invoices', rows.length], ['Gross', sum('gross')], ['Discounts', sum('discount')], ['VAT + Tax', round2(sum('vat') + sum('ait'))], ['Freight & other', round2(sum('freight') + sum('other'))], ['Net purchase', sum('total')], ['Returns', pr], ['Paid', sum('collected')], ['Payable', sum('due')]], 'Purchase overview')] };
  },

  // ─────────── Accounts ───────────
  acc_ledger: (p, u) => stmt(p, p.ledger_id, u),
  acc_cash: (p, u) => stmt(p, p.ledger_id || get(`SELECT id FROM ledgers WHERE system_key = 'CASH'`)?.id, u),
  acc_bank: (p, u) => stmt(p, p.ledger_id, u),
  acc_mobile: (p, u) => stmt(p, p.ledger_id, u),
  acc_journal: p => {
    const { from, to } = range(p);
    const rows = all(`SELECT j.date, j.no, j.type, j.narration, l.name ledger, jl.debit, jl.credit FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id WHERE j.date BETWEEN ? AND ? ${p.type ? 'AND j.type = ?' : ''} ORDER BY j.date, j.id, jl.id`, p.type ? [from, to, p.type] : [from, to]);
    return one([D('date'), T('no', 'No'), T('type', 'Type'), T('ledger', 'Ledger'), T('narration', 'Narration'), M('debit', 'Debit'), M('credit', 'Credit')], rows);
  },
  acc_trial: (p, u) => {
    const { from, to } = range(p);
    const tb = trialBalance(u, from, to, p.level || 'ledger');
    return { sections: [{ columns: [T('head', 'Head of Accounts'), M('op_dr', 'Beginning Dr'), M('op_cr', 'Beginning Cr'), M('debit', 'Debit'), M('credit', 'Credit'), M('net', 'Net Activity'), M('cl_dr', 'Ending Dr'), M('cl_cr', 'Ending Cr')], rows: tb.rows, totals: tb.totals }] };
  },
  acc_income: (p, u) => {
    const { from, to } = range(p);
    const is = incomeStatement(u, from, to, p.level || 'subgroup');
    const c = [T('head', 'Particular'), M('amount', 'Amount')];
    return { sections: [table(c, is.revenue, 'Revenue'), table(c, is.direct, 'Direct expense (cost of sales)'), kv([['Gross profit', is.totals.grossProfit]]), table(c, is.indirect, 'Indirect expenses'), kv([['Net profit / (loss)', is.totals.netProfit]])] };
  },
  acc_balance: (p, u) => {
    const bs = balanceSheet(u, p.to, p.level || 'subgroup');
    const c = [T('head', 'Particular'), T('group', 'Group'), M('amount', 'Amount')];
    return { sections: [table(c, bs.assets, 'Assets'), table(c, bs.liabilities, 'Liabilities'), table(c, bs.equity, "Owner's equity"), kv([['Total assets', bs.totals.assets], ['Total liabilities + equity', bs.totals.liabilitiesEquity]])] };
  },
  acc_overview: p => {
    const to = p.to || today();
    const cls = all(`SELECT c.name, c.nature, COALESCE(SUM(jl.debit),0) debit, COALESCE(SUM(jl.credit),0) credit FROM acc_classes c JOIN acc_groups g ON g.class_id = c.id JOIN acc_subgroups s ON s.group_id = g.id JOIN ledgers l ON l.subgroup_id = s.id
      LEFT JOIN (SELECT jl.* FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE j.date <= ?) jl ON jl.ledger_id = l.id GROUP BY c.id ORDER BY c.id`, [to])
      .map(r => ({ ...r, debit: round2(r.debit), credit: round2(r.credit), balance: round2(r.nature === 'debit' ? r.debit - r.credit : r.credit - r.debit) }));
    const money = all(`SELECT l.name, l.kind, COALESCE(SUM(jl.debit - jl.credit),0) balance FROM ledgers l LEFT JOIN (SELECT jl.* FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE j.date <= ?) jl ON jl.ledger_id = l.id WHERE l.kind IN ('cash','bank','mobile','loan') GROUP BY l.id ORDER BY l.kind, l.name`, [to]).map(r => ({ ...r, balance: round2(r.balance) }));
    return { sections: [table([T('name', 'Class'), M('debit', 'Debit'), M('credit', 'Credit'), M('balance', 'Balance', false)], cls, 'By account class'), table([T('name', 'Account'), T('kind', 'Type'), M('balance', 'Balance')], money, 'Money accounts')] };
  },

  // ─────────── Receivable ───────────
  rec_customers: p => {
    const w = ['c.is_walkin = 0'];
    const a: any[] = [];
    if (p.district_id) { w.push('c.district_id = ?'); a.push(p.district_id); }
    if (p.zone_id) { w.push('c.zone_id = ?'); a.push(p.zone_id); }
    if (p.group_id) { w.push('c.group_id = ?'); a.push(p.group_id); }
    return one([T('code', 'Code'), T('name', 'Name'), T('mobile', 'Mobile'), T('email', 'Email'), T('address', 'Address'), T('district', 'District'), T('zone', 'Zone'), T('grp', 'Group'), M('credit_limit', 'Credit Limit', false)],
      all(`SELECT c.*, d.name district, z.name zone, g.name grp FROM customers c LEFT JOIN districts d ON d.id = c.district_id LEFT JOIN zones z ON z.id = c.zone_id LEFT JOIN client_groups g ON g.id = c.group_id WHERE ${w.join(' AND ')} ORDER BY c.name`, a));
  },
  rec_balance: p => {
    const rows = partyBalances('customer', p).filter(r => p.btype !== 'balance' || Math.abs(r.balance) > 0.009);
    return one([T('code', 'Code'), T('name', 'Customer'), T('mobile', 'Mobile'), M('debit', 'Debit'), M('credit', 'Credit'), M('balance', 'Balance'), M('credit_limit', 'Credit Limit', false)], rows);
  },
  rec_statement: (p, u) => {
    if (!p.customer_id) throw new HttpError(400, 'Select a customer.');
    return stmt(p, get(`SELECT ledger_id FROM customers WHERE id = ?`, [p.customer_id])?.ledger_id, u);
  },
  rec_item_statement: p => {
    if (!p.customer_id) throw new HttpError(400, 'Select a customer.');
    return one([D('date'), T('no', 'Invoice'), T('kind', 'Type'), T('name', 'Item'), N('qty', 'Qty'), M('price', 'Rate', false), M('total', 'Total')], lineRows(p, ['sale', 'sreturn', 'service']).map(r => ({ ...r, kind: r.kind === 'sreturn' ? 'Return' : r.kind === 'service' ? 'Service' : 'Sale', qty: r.kind === 'sreturn' ? -r.qty : r.qty, total: r.kind === 'sreturn' ? -r.subtotal : r.total })));
  },
  rec_item_profit: p => one([D('date'), T('no', 'Invoice'), T('party', 'Customer'), T('name', 'Item'), N('qty', 'Qty'), M('gross', 'MrpT'), M('dis', 'Dis'), M('vat', 'Vat'), M('ait', 'Ait'), M('oth', 'Oth'), M('fre', 'Fre'), M('less', 'Les'), M('total', 'Total'), M('cost_total', 'Cost'), M('profit_wo', 'W/o.VA'), M('profit_inc', 'Inc.VA')], lineRows(p, ['sale'])),
  rec_due_collection: p => {
    const { from, to } = range(p);
    const w = [`l.kind = 'customer'`, 'j.date BETWEEN ? AND ?', 'jl.credit > 0', `j.type IN ('receipt','sale','service')`];
    const a: any[] = [from, to];
    if (p.district_id) { w.push('c.district_id = ?'); a.push(p.district_id); }
    if (p.zone_id) { w.push('c.zone_id = ?'); a.push(p.zone_id); }
    if (p.group_id) { w.push('c.group_id = ?'); a.push(p.group_id); }
    return one([D('date'), T('no', 'Voucher / Invoice'), T('type', 'Type'), T('code', 'Code'), T('name', 'Customer'), M('amount', 'Collected')],
      all(`SELECT j.date, j.no, j.type, c.code, c.name, jl.credit amount FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id JOIN customers c ON c.id = l.ref_id WHERE ${w.join(' AND ')} ORDER BY j.date`, a));
  },
  rec_due_aging: p => {
    const asof = p.to || today();
    const custs = partyBalances('customer', p).filter(r => r.balance > 0.009);
    const rows = custs.map(c => {
      // allocate outstanding balance to the most recent debits (FIFO on payments)
      let left = c.balance;
      const b = { d30: 0, d60: 0, d90: 0, d90p: 0 };
      for (const d of all(`SELECT j.date, jl.debit FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.ledger_id = ? AND jl.debit > 0 AND j.date <= ? ORDER BY j.date DESC`, [c.ledger_id, asof])) {
        if (left <= 0) break;
        const take = Math.min(left, d.debit); left -= take;
        const age = Math.floor((new Date(asof).getTime() - new Date(d.date).getTime()) / 86400000);
        if (age <= 30) b.d30 += take; else if (age <= 60) b.d60 += take; else if (age <= 90) b.d90 += take; else b.d90p += take;
      }
      return { ...c, d30: round2(b.d30), d60: round2(b.d60), d90: round2(b.d90), d90p: round2(b.d90p + left) };
    });
    return one([T('code', 'Code'), T('name', 'Customer'), T('mobile', 'Mobile'), M('d30', '0-30 Days'), M('d60', '31-60 Days'), M('d90', '61-90 Days'), M('d90p', '90+ Days'), M('balance', 'Total Due')], rows);
  },
  rec_customer_overview: (p, u) => {
    if (!p.customer_id) throw new HttpError(400, 'Select a customer.');
    const c = get(`SELECT * FROM customers WHERE id = ?`, [p.customer_id]);
    const s = (k: string, f = 'total') => round2(get(`SELECT COALESCE(SUM(${f}),0) v FROM docs WHERE customer_id = ? AND kind = ?`, [p.customer_id, k])?.v ?? 0);
    const st = ledgerStatement(u, c!.ledger_id, '0000-01-01', '9999-12-31');
    return { sections: [kv([['Customer', `${c!.code} — ${c!.name}`], ['Sales', s('sale')], ['Service', s('service')], ['Returns', s('sreturn')], ['Paid at invoice', s('sale', 'paid')], ['Reward points', c!.points], ['Current due', st.totals.closing]], 'Summary'), table([D('date'), T('no', 'Particulars'), T('type', 'Reference'), T('narration', 'Remarks'), M('debit', 'Debit'), M('credit', 'Credit'), M('balance', 'Balance', false)], st.lines, 'Transactions')] };
  },
  rec_overview: p => {
    const { from, to } = range(p);
    const total = round2(get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) v FROM journal_lines jl JOIN ledgers l ON l.id = jl.ledger_id WHERE l.kind = 'customer'`)?.v ?? 0);
    const collected = round2(get(`SELECT COALESCE(SUM(jl.credit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id WHERE l.kind = 'customer' AND j.date BETWEEN ? AND ?`, [from, to])?.v ?? 0);
    const billed = round2(get(`SELECT COALESCE(SUM(jl.debit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id WHERE l.kind = 'customer' AND j.date BETWEEN ? AND ?`, [from, to])?.v ?? 0);
    const top = all(`SELECT c.name, ROUND(SUM(jl.debit - jl.credit),2) due FROM journal_lines jl JOIN ledgers l ON l.id = jl.ledger_id JOIN customers c ON c.id = l.ref_id WHERE l.kind = 'customer' GROUP BY c.id HAVING due > 0 ORDER BY due DESC LIMIT 10`);
    return { sections: [kv([['Billed in period', billed], ['Collected in period', collected], ['Total receivable now', total], ['Customers with due', top.length]], 'Receivable overview'), table([T('name', 'Top debtors'), M('due', 'Due')], top)] };
  },

  // ─────────── Payable ───────────
  pay_suppliers: p => one([T('code', 'Code'), T('name', 'Name'), T('cperson', 'Contact'), T('mobile', 'Mobile'), T('email', 'Email'), T('address', 'Address')], all(`SELECT * FROM suppliers WHERE is_opening = 0 ${p.group_id ? 'AND group_id = ?' : ''} ORDER BY name`, p.group_id ? [p.group_id] : [])),
  pay_balance: p => {
    const rows = partyBalances('supplier', p).filter(r => p.btype === 'due' ? r.balance > 0.009 : p.btype === 'advance' ? r.balance < -0.009 : p.btype === 'balance' ? Math.abs(r.balance) > 0.009 : true);
    return one([T('code', 'Code'), T('name', 'Supplier'), T('mobile', 'Mobile'), M('debit', 'Debit'), M('credit', 'Credit'), M('balance', 'Payable')], rows);
  },
  pay_statement: (p, u) => {
    if (!p.supplier_id) throw new HttpError(400, 'Select a supplier.');
    return stmt(p, get(`SELECT ledger_id FROM suppliers WHERE id = ?`, [p.supplier_id])?.ledger_id, u);
  },
  pay_item_statement: p => {
    if (!p.supplier_id) throw new HttpError(400, 'Select a supplier.');
    return one([D('date'), T('no', 'Invoice'), T('kind', 'Type'), T('name', 'Item'), N('qty', 'Qty'), M('price', 'Cost', false), M('total', 'Total')], lineRows(p, ['purchase', 'preturn']).map(r => ({ ...r, kind: r.kind === 'preturn' ? 'Return' : 'Purchase', qty: r.kind === 'preturn' ? -r.qty : r.qty, total: r.kind === 'preturn' ? -r.subtotal : r.total })));
  },
  pay_purchase_sold: p => {
    const { from, to } = range(p);
    const iw = itemW(p);
    const rows = all(`SELECT pr.id, pr.code, pr.name, s.name supplier,
        COALESCE(SUM(l.qty),0) pqty, COALESCE(SUM(l.subtotal),0) pval,
        (SELECT COALESCE(-SUM(qty),0) FROM stock_moves WHERE product_id = pr.id AND kind = 'sale' AND date BETWEEN ? AND ?) sold,
        (SELECT COALESCE(SUM(qty * price) * -1,0) FROM stock_moves WHERE product_id = pr.id AND kind = 'sale' AND date BETWEEN ? AND ?) sval,
        (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = pr.id) stock
      FROM doc_lines l JOIN docs d ON d.id = l.doc_id JOIN products pr ON pr.id = l.product_id JOIN suppliers s ON s.id = d.supplier_id
      WHERE d.kind = 'purchase' AND d.date BETWEEN ? AND ? ${p.supplier_id ? 'AND d.supplier_id = ?' : ''}${iw.w} GROUP BY pr.id, s.id ORDER BY s.name, pr.name`,
      [from, to, from, to, from, to, ...(p.supplier_id ? [p.supplier_id] : []), ...iw.a]).map(r => ({ ...r, pval: round2(r.pval), sval: round2(r.sval) }));
    return one([T('supplier', 'Supplier'), T('code', 'Code'), T('name', 'Item'), N('pqty', 'Purchased'), M('pval', 'Purchase Value'), N('sold', 'Sold'), M('sval', 'Sold Value'), N('stock', 'In Stock', false)], rows);
  },
  pay_overview: p => {
    const { from, to } = range(p);
    const total = round2(get(`SELECT COALESCE(SUM(jl.credit - jl.debit),0) v FROM journal_lines jl JOIN ledgers l ON l.id = jl.ledger_id WHERE l.kind = 'supplier'`)?.v ?? 0);
    const paid = round2(get(`SELECT COALESCE(SUM(jl.debit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id WHERE l.kind = 'supplier' AND j.date BETWEEN ? AND ?`, [from, to])?.v ?? 0);
    const billed = round2(get(`SELECT COALESCE(SUM(jl.credit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id WHERE l.kind = 'supplier' AND j.date BETWEEN ? AND ?`, [from, to])?.v ?? 0);
    const top = all(`SELECT s.name, ROUND(SUM(jl.credit - jl.debit),2) due FROM journal_lines jl JOIN ledgers l ON l.id = jl.ledger_id JOIN suppliers s ON s.id = l.ref_id WHERE l.kind = 'supplier' GROUP BY s.id HAVING due > 0 ORDER BY due DESC LIMIT 10`);
    return { sections: [kv([['Billed in period', billed], ['Paid in period', paid], ['Total payable now', total]], 'Payable overview'), table([T('name', 'Top creditors'), M('due', 'Payable')], top)] };
  },

  // ─────────── Voucher ───────────
  v_payment: p => voucherLines(p, 'payment'),
  v_receipt: p => voucherLines(p, 'receipt'),
  v_journal: p => voucherLines(p, 'journal'),
  v_pay_rec: p => {
    const { from, to } = range(p);
    const q = (dir: 'debit' | 'credit') => all(`SELECT j.date, j.no, j.type, l.name account, (SELECT GROUP_CONCAT(l2.name, ', ') FROM journal_lines x JOIN ledgers l2 ON l2.id = x.ledger_id WHERE x.journal_id = j.id AND x.${dir === 'debit' ? 'credit' : 'debit'} > 0) particular, jl.${dir} amount
      FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id WHERE l.kind IN ('cash','bank','mobile') AND jl.${dir} > 0 AND j.date BETWEEN ? AND ? AND j.type <> 'contra' ORDER BY j.date`, [from, to]);
    const rec = q('debit'), pay = q('credit');
    if (p.type === 'summary') {
      const sum = (rs: Row[]) => { const m = new Map<string, number>(); for (const r of rs) m.set(r.type, round2((m.get(r.type) ?? 0) + r.amount)); return [...m].map(([type, amount]) => ({ type, amount })); };
      return { sections: [table([T('type', 'Receipts by type'), M('amount', 'Amount')], sum(rec), 'Receipts'), table([T('type', 'Payments by type'), M('amount', 'Amount')], sum(pay), 'Payments')] };
    }
    const c = [D('date'), T('no', 'No'), T('type', 'Type'), T('account', 'Account'), T('particular', 'Particular'), M('amount', 'Amount')];
    return { sections: [table(c, rec, 'Receipts'), table(c, pay, 'Payments')] };
  },
  v_cash_collection: p => {
    const { from, to } = range(p);
    const rows = all(`SELECT j.date, j.no, j.type, c.code, c.name customer, jl.credit amount, u.name user_name FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id JOIN customers c ON c.id = l.ref_id LEFT JOIN users u ON u.id = j.created_by
      WHERE l.kind = 'customer' AND jl.credit > 0 AND j.type IN ('sale','service','receipt') AND j.date BETWEEN ? AND ? ${p.customer_id ? 'AND c.id = ?' : ''} ${p.user_id ? 'AND j.created_by = ?' : ''} ORDER BY j.date`,
      [from, to, ...(p.customer_id ? [p.customer_id] : []), ...(p.user_id ? [p.user_id] : [])]);
    return one([D('date'), T('no', 'No'), T('type', 'Type'), T('code', 'Code'), T('customer', 'Customer'), M('amount', 'Collected'), T('user_name', 'User')], rows);
  },
  v_internal: p => {
    const { from, to } = range(p);
    return one([D('date'), T('no', 'No'), T('src', 'From'), T('dst', 'To'), M('amount', 'Amount'), T('narration', 'Note')], all(`SELECT j.date, j.no, j.narration,
      (SELECT GROUP_CONCAT(l.name) FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND x.credit > 0) src,
      (SELECT GROUP_CONCAT(l.name) FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND x.debit > 0 AND l.kind IN ('cash','bank','mobile','loan')) dst,
      (SELECT COALESCE(SUM(x.debit),0) FROM journal_lines x JOIN ledgers l ON l.id = x.ledger_id WHERE x.journal_id = j.id AND l.kind IN ('cash','bank','mobile','loan')) amount
      FROM journals j WHERE j.type = 'contra' AND j.date BETWEEN ? AND ? ORDER BY j.date`, [from, to]));
  },
  v_overview: p => {
    const { from, to } = range(p);
    return one([T('type', 'Voucher type'), N('n', 'Count'), M('total', 'Total')], all(`SELECT type, COUNT(*) n, ROUND(SUM(total),2) total FROM journals WHERE date BETWEEN ? AND ? GROUP BY type ORDER BY total DESC`, [from, to]));
  },

  // ─────────── Inventory ───────────
  inv_products: p => {
    const iw = itemW(p);
    return one([T('code', 'Code'), T('name', 'Name'), T('category', 'Category'), T('brand', 'Brand'), T('model', 'Model'), T('unit', 'Unit'), M('cost', 'Cost', false), M('price', 'Price', false), T('status', 'Status')],
      all(`SELECT pr.*, c.name category, b.name brand, un.name unit FROM products pr LEFT JOIN categories c ON c.id = pr.category_id LEFT JOIN brands b ON b.id = pr.brand_id LEFT JOIN units un ON un.id = pr.unit_id WHERE 1 = 1 ${p.status ? 'AND pr.status = ?' : ''}${iw.w} ORDER BY pr.name`, [...(p.status ? [p.status] : []), ...iw.a]));
  },
  inv_low_stock: p => {
    const iw = itemW(p);
    return one([T('code', 'Code'), T('name', 'Name'), T('details', 'Details'), N('min_stock', 'Req.QTY'), N('stock', 'In-Stock')],
      all(`SELECT pr.code, pr.name, COALESCE(b.name,'') || ' ' || COALESCE(pr.model,'') details, pr.min_stock, (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = pr.id) stock FROM products pr LEFT JOIN brands b ON b.id = pr.brand_id
        WHERE pr.status = 'active' AND pr.min_stock > 0${iw.w} AND (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = pr.id) <= pr.min_stock ORDER BY pr.name`, iw.a));
  },
  inv_price: p => {
    const iw = itemW(p);
    let rows = all(`SELECT pr.code, pr.name, pr.cost, pr.price, pr.warranty_days, (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = pr.id) qty FROM products pr WHERE pr.status = 'active'${iw.w} ORDER BY pr.name`, iw.a);
    if (p.stock === 'in') rows = rows.filter(r => r.qty > 0);
    if (p.stock === 'out') rows = rows.filter(r => r.qty <= 0);
    return one([T('code', 'Code'), T('name', 'Item'), N('qty', 'Qty'), ...(p.cost === 'without' ? [] : [M('cost', 'Cost', false)]), M('price', 'Price', false), N('warranty_days', 'Warranty (days)', false)], rows);
  },
  inv_serials: p => {
    const iw = itemW(p);
    const rows = all(`SELECT sr.serial, pr.name, pr.code, c.name color, s.name size, sr.status, d.no sale_no, pd.no purchase_no,
        CASE sr.loc_type WHEN 'W' THEN (SELECT name FROM warehouses WHERE id = sr.loc_id) ELSE (SELECT name FROM branches WHERE id = sr.loc_id) END location
      FROM serials sr JOIN products pr ON pr.id = sr.product_id LEFT JOIN colors c ON c.id = sr.color_id LEFT JOIN sizes s ON s.id = sr.size_id LEFT JOIN docs d ON d.id = sr.sale_doc_id LEFT JOIN docs pd ON pd.id = sr.purchase_doc_id
      WHERE 1 = 1 ${p.status ? 'AND sr.status = ?' : ''} ${p.supplier_id ? 'AND sr.supplier_id = ?' : ''}${iw.w} ORDER BY pr.name, sr.serial`, [...(p.status ? [p.status] : []), ...(p.supplier_id ? [p.supplier_id] : []), ...iw.a]);
    return one([T('serial', 'Serial'), T('name', 'Name'), T('code', 'SKU/Code'), T('color', 'Color'), T('size', 'Size'), T('purchase_no', 'Purchase'), T('sale_no', 'Invoice'), T('location', 'Location'), T('status', 'Status')], rows);
  },
  inv_summary: p => one([T('code', 'SKU'), T('name', 'Item Name'), T('color', 'Color'), T('size', 'Size'), N('in_qty', 'In'), N('out_qty', 'Out'), N('cl_qty', 'Available')], stockAt(p).filter(r => r.in_qty || r.cl_qty)),
  inv_periodic: p => {
    const { from, to } = range(p);
    const rows = stockAt(p, to, from).filter(r => p.show !== 'moved' || r.in_qty || r.out_qty);
    return one([T('code', 'Code'), T('name', 'Name'), T('color', 'Color'), T('size', 'Size'), N('op_qty', 'OP.Qty'), N('in_qty', 'In'), N('out_qty', 'Out'), N('cl_qty', 'Cl.Qty')], rows);
  },
  inv_valuation: p => one([T('code', 'SKU'), T('name', 'Item Name'), T('color', 'Color'), T('size', 'Size'), N('in_qty', 'In'), N('out_qty', 'Out'), N('cl_qty', 'Available'), M('avg_cost', 'Avg.Cost', false), M('value', 'Asset Value'), ...(p.price === 'with' ? [M('price', 'Price', false), M('sale_value', 'Sale Value')] : [])],
    stockAt(p).filter(r => r.cl_qty).map(r => ({ ...r, value: round2(r.cl_qty * r.avg_cost), sale_value: round2(r.cl_qty * r.price) }))),
  inv_supplier_value: p => {
    const iw = itemW(p);
    const rows = all(`SELECT pr.id, pr.code, pr.name, s.name supplier FROM products pr JOIN (SELECT DISTINCT l.product_id, d.supplier_id FROM doc_lines l JOIN docs d ON d.id = l.doc_id WHERE d.kind = 'purchase') x ON x.product_id = pr.id JOIN suppliers s ON s.id = x.supplier_id
      WHERE 1 = 1 ${p.supplier_id ? 'AND s.id = ?' : ''}${iw.w} ORDER BY s.name, pr.name`, [...(p.supplier_id ? [p.supplier_id] : []), ...iw.a]).map(r => {
      const k = (kinds: string) => round2(Math.abs(get(`SELECT COALESCE(SUM(qty),0) q FROM stock_moves WHERE product_id = ? AND kind IN (${kinds})`, [r.id])?.q ?? 0));
      const avq = round2(get(`SELECT COALESCE(SUM(qty),0) q FROM stock_moves WHERE product_id = ?`, [r.id])?.q ?? 0);
      const avc = round2(get(`SELECT COALESCE(SUM(qty*cost),0) / NULLIF(SUM(qty),0) c FROM stock_moves WHERE product_id = ? AND qty > 0`, [r.id])?.c ?? 0);
      return { ...r, pqr: k(`'purchase','opening'`), srq: k(`'sreturn'`), exq: k(`'exchange'`), sdq: k(`'sale'`), prq: k(`'preturn'`), wrq: k(`'warranty_out'`), diq: k(`'disposal'`), tin: k(`'transfer_in'`), avq, avc, val: round2(avq * avc) };
    });
    return one([T('supplier', 'Supplier'), T('code', 'Code'), T('name', 'Name'), N('pqr', 'Purchase'), N('srq', 'S.Return'), N('exq', 'Exchange'), N('sdq', 'Sold'), N('prq', 'P.Return'), N('wrq', 'Warranty'), N('diq', 'Disposed'), N('avq', 'Available'), M('avc', 'Avg Cost', false), M('val', 'Value')], rows);
  },
  inv_periodic_value: p => {
    const { from, to } = range(p);
    const rows = stockAt(p, to, from).filter(r => r.op_qty || r.in_qty || r.out_qty).map(r => ({ ...r, op_val: round2(r.op_qty * r.avg_cost), in_val: round2(r.in_qty * r.avg_cost), out_val: round2(r.out_qty * r.avg_cost), cl_val: round2(r.cl_qty * r.avg_cost) }));
    return one([T('code', 'Code'), T('name', 'Name'), T('color', 'Color'), T('size', 'Size'), N('op_qty', 'Op.Qty'), M('op_val', 'Op.Value'), N('in_qty', 'In'), M('in_val', 'In Value'), N('out_qty', 'Out'), M('out_val', 'Out Value'), N('cl_qty', 'Cl.Qty'), M('avg_cost', 'Av.Cost', false), M('cl_val', 'Cl.Value')], rows);
  },
  inv_disposal: p => {
    const { from, to } = range(p);
    const iw = itemW(p);
    return one([D('date'), T('no', 'Disposal'), T('code', 'Code'), T('name', 'Name'), T('color', 'Color'), T('size', 'Size'), N('qty', 'Qty'), M('cost', 'Cost', false), M('value', 'Valuation'), M('price', 'Price', false)],
      all(`SELECT sd.date, sd.no, pr.code, pr.name, c.name color, s.name size, l.qty, l.cost, ROUND(l.qty * l.cost, 2) value, pr.price FROM stock_doc_lines l JOIN stock_docs sd ON sd.id = l.stock_doc_id JOIN products pr ON pr.id = l.product_id LEFT JOIN colors c ON c.id = l.color_id LEFT JOIN sizes s ON s.id = l.size_id
        WHERE sd.kind = 'disposal' AND sd.date BETWEEN ? AND ?${iw.w} ORDER BY sd.date`, [from, to, ...iw.a]));
  },
  inv_aging: p => {
    const iw = itemW(p);
    const now = Date.now();
    const rows = stockAt({ ...p }).filter(r => r.cl_qty > 0).map(r => {
      let left = r.cl_qty;
      const b = [0, 0, 0, 0];
      for (const m of all(`SELECT date, qty FROM stock_moves WHERE product_id = ? AND qty > 0 AND COALESCE(color_id,0) = ? AND COALESCE(size_id,0) = ? ORDER BY date DESC`, [r.id, r.color_id ?? 0, r.size_id ?? 0])) {
        if (left <= 0) break;
        const take = Math.min(left, m.qty); left -= take;
        const age = Math.floor((now - new Date(m.date).getTime()) / 86400000);
        b[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] += take;
      }
      b[3] += Math.max(0, left);
      const v = (q: number) => round2(q * r.avg_cost);
      return { ...r, a1: b[0], a2: b[1], a3: b[2], a4: b[3], v1: v(b[0]), v2: v(b[1]), v3: v(b[2]), v4: v(b[3]), value: v(r.cl_qty) };
    });
    void iw;
    const withV = p.type === 'value';
    return one([T('code', 'SKU-Code'), T('name', 'Item Name'), N('a1', '0-30 Qty'), ...(withV ? [M('v1', '0-30 Value')] : []), N('a2', '31-60 Qty'), ...(withV ? [M('v2', '31-60 Value')] : []), N('a3', '61-90 Qty'), ...(withV ? [M('v3', '61-90 Value')] : []), N('a4', '90+ Qty'), ...(withV ? [M('v4', '90+ Value')] : []), N('cl_qty', 'In-Stock'), ...(withV ? [M('value', 'Value')] : [])], rows);
  },
  inv_overview: () => one([T('location', 'Branch / Warehouse'), T('name', 'Item Name'), T('variant', 'Color/Size'), T('code', 'Code'), N('qty', 'Qty')],
    all(`SELECT CASE m.loc_type WHEN 'W' THEN (SELECT name FROM warehouses WHERE id = m.loc_id) || ' (W)' ELSE (SELECT name FROM branches WHERE id = m.loc_id) || ' (B)' END location, pr.name, pr.code, TRIM(COALESCE(c.name,'') || ' ' || COALESCE(s.name,'')) variant, ROUND(SUM(m.qty),2) qty
      FROM stock_moves m JOIN products pr ON pr.id = m.product_id LEFT JOIN colors c ON c.id = m.color_id LEFT JOIN sizes s ON s.id = m.size_id GROUP BY m.loc_type, m.loc_id, m.product_id, m.color_id, m.size_id HAVING SUM(m.qty) <> 0 ORDER BY location, pr.name`)),

  // ─────────── Employee ───────────
  emp_list: () => one([T('code', 'ID'), T('name', 'Name'), T('designation', 'Designation'), T('department', 'Department'), T('mobile', 'Mobile'), T('email', 'Email'), D('joining', 'Joining'), M('salary', 'Salary'), T('status', 'Status')],
    all(`SELECT e.*, g.name designation, d.name department FROM employees e LEFT JOIN designations g ON g.id = e.designation_id LEFT JOIN departments d ON d.id = e.department_id ORDER BY e.name`)),
  emp_attendance: (p, u) => {
    const s = attendanceSheet(u, Number(p.year) || new Date().getFullYear(), Number(p.month) || new Date().getMonth() + 1);
    return one([T('code', 'ID'), T('name', 'Name'), T('designation', 'Designation'), N('absent', 'Absent'), N('late', 'Late'), N('leave', 'Leave'), N('present_days', 'Present')], s.rows.filter(r => !p.employee_id || r.employee_id === Number(p.employee_id)));
  },
  emp_leave: p => {
    const { from, to } = range(p);
    return one([D('apply_date', 'Applied'), T('name', 'Employee'), T('leave', 'Leave'), D('from_date', 'From'), D('to_date', 'To'), N('days', 'Days'), T('status', 'Status'), T('reason', 'Reason')],
      all(`SELECT l.*, e.name, t.name leave FROM leave_apps l JOIN employees e ON e.id = l.employee_id LEFT JOIN leave_types t ON t.id = l.leave_type_id WHERE l.from_date <= ? AND l.to_date >= ? ${p.employee_id ? 'AND l.employee_id = ?' : ''} ORDER BY l.from_date`, [to, from, ...(p.employee_id ? [p.employee_id] : [])]));
  },
  emp_salary: (p, u) => {
    const s = salarySheet(u, Number(p.year) || new Date().getFullYear(), Number(p.month) || new Date().getMonth() + 1, p.branch_id ? Number(p.branch_id) : undefined);
    return one([T('code', 'ID'), T('name', 'Name'), T('designation', 'Designation'), M('salary', 'G.Salary'), M('d_absent', 'D.Absent'), M('d_late', 'D.Late'), N('leave', 'A.Leave'), N('present_days', 'P.Day'), M('payable', 'P.Amo'), N('bonus_pct', 'B(%)', false), M('bonus', 'B.Amo'), M('net', 'Net.Pay')], s.rows);
  },
  emp_commission: p => {
    const { from, to } = range(p);
    return one([T('name', 'Sales Person'), N('invoices', 'Invoices'), M('sales', 'Sales'), M('returns', 'Returns'), M('net', 'Net'), N('pct', 'Commission %', false), M('commission', 'Commission')],
      all(`SELECT e.name, e.commission_pct pct, COUNT(d.id) invoices, COALESCE(SUM(d.total),0) sales,
          COALESCE((SELECT SUM(r.total) FROM docs r JOIN docs o ON o.id = r.ref_doc_id WHERE r.kind = 'sreturn' AND o.sales_person_id = e.id AND r.date BETWEEN ? AND ?),0) returns
        FROM employees e LEFT JOIN docs d ON d.sales_person_id = e.id AND d.kind IN ('sale','service') AND d.date BETWEEN ? AND ? WHERE 1 = 1 ${p.sales_person_id ? 'AND e.id = ?' : ''} GROUP BY e.id ORDER BY sales DESC`, [from, to, from, to, ...(p.sales_person_id ? [p.sales_person_id] : [])])
        .map(r => ({ ...r, sales: round2(r.sales), returns: round2(r.returns), net: round2(r.sales - r.returns), commission: round2(((r.sales - r.returns) * (r.pct || 0)) / 100) })));
  },
  emp_overview: () => {
    const head = all(`SELECT COALESCE(d.name,'—') department, COUNT(*) n, ROUND(SUM(e.salary),2) salary FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.status = 'active' GROUP BY d.id ORDER BY n DESC`);
    const pending = get(`SELECT COUNT(*) n FROM leave_apps WHERE status = 'pending'`)?.n ?? 0;
    return { sections: [table([T('department', 'Department'), N('n', 'Employees'), M('salary', 'Monthly Salary')], head, 'Headcount'), kv([['Pending leave applications', pending]])] };
  },
};

function voucherLines(p: P, type: string): ReportResult {
  const { from, to } = range(p);
  const rows = all(`SELECT j.date, j.no, l.name ledger, jl.debit, jl.credit, COALESCE(jl.ref, '') ref, COALESCE(jl.cheque_no,'') cheque_no, j.narration FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id WHERE j.type = ? AND j.date BETWEEN ? AND ? ORDER BY j.date, j.id, jl.id`, [type, from, to]);
  return one([D('date'), T('no', 'Voucher'), T('ledger', 'Ledger'), M('debit', 'Debit'), M('credit', 'Credit'), T('cheque_no', 'Cheque'), T('ref', 'Ref'), T('narration', 'Note')], rows);
}

function allowed(u: SessionUser, key: string) {
  if (u.is_admin || u.report_perms.includes('*')) return true;
  return u.report_perms.includes(key);
}

export function reportCatalog(u: SessionUser) {
  assertCan(u, 'report', 'read');
  return REPORTS.filter(r => allowed(u, r.key));
}

export function runReport(u: SessionUser, key: string, params: P = {}): ReportResult {
  assertCan(u, 'report', 'read');
  const meta = REPORT_MAP[key];
  const fn = R[key];
  if (!meta || !fn) throw new HttpError(404, 'Unknown report.');
  if (!allowed(u, key)) throw new HttpError(403, 'You do not have access to this report.');
  const clean: P = {};
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== null && v !== undefined) clean[k] = /_id$/.test(k) ? Number(v) : v;
  const res = fn(clean, u);
  return { ...res, meta: { ...(res.meta ?? {}), ...range(clean), generated: new Date().toISOString() } };
}

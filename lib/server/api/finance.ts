import 'server-only';
import { all, get, round2, today } from '../db';
import { assertCan, HttpError, type SessionUser } from '../auth';

type Level = 'ledger' | 'subgroup' | 'group';

function balances(from?: string, to?: string) {
  // per ledger: opening (before from), period debit/credit (from..to)
  return all(
    `SELECT l.id, l.code, l.name, l.kind, s.id subgroup_id, s.name subgroup, g.id group_id, g.name group_name, c.id class_id, c.name class_name, c.nature,
       COALESCE(SUM(CASE WHEN ? IS NOT NULL AND j.date < ? THEN jl.debit - jl.credit END), 0) opening,
       COALESCE(SUM(CASE WHEN (? IS NULL OR j.date >= ?) AND (? IS NULL OR j.date <= ?) THEN jl.debit END), 0) debit,
       COALESCE(SUM(CASE WHEN (? IS NULL OR j.date >= ?) AND (? IS NULL OR j.date <= ?) THEN jl.credit END), 0) credit
     FROM ledgers l JOIN acc_subgroups s ON s.id = l.subgroup_id JOIN acc_groups g ON g.id = s.group_id JOIN acc_classes c ON c.id = g.class_id
     LEFT JOIN journal_lines jl ON jl.ledger_id = l.id LEFT JOIN journals j ON j.id = jl.journal_id
     GROUP BY l.id ORDER BY c.id, g.id, s.id, l.name`,
    [from ?? null, from ?? null, from ?? null, from ?? null, to ?? null, to ?? null, from ?? null, from ?? null, to ?? null, to ?? null],
  ).map(r => ({ ...r, opening: round2(r.opening), debit: round2(r.debit), credit: round2(r.credit), closing: round2(r.opening + r.debit - r.credit) }));
}

function rollup<T extends Record<string, any>>(rows: T[], level: Level) {
  if (level === 'ledger') return rows.map(r => ({ ...r, head: `${r.code ? r.code + ' - ' : ''}${r.name}` }));
  const key = level === 'group' ? 'group_id' : 'subgroup_id';
  const label = level === 'group' ? 'group_name' : 'subgroup';
  const map = new Map<number, any>();
  for (const r of rows) {
    const m = map.get(r[key]) ?? { ...r, id: r[key], head: r[label], opening: 0, debit: 0, credit: 0, closing: 0 };
    m.opening = round2(m.opening + r.opening); m.debit = round2(m.debit + r.debit); m.credit = round2(m.credit + r.credit); m.closing = round2(m.closing + r.closing);
    map.set(r[key], m);
  }
  return [...map.values()];
}

export function chartOfAccounts(u: SessionUser) {
  assertCan(u, 'financial', 'read');
  const rows = balances();
  const classes = all(`SELECT * FROM acc_classes ORDER BY id`);
  return classes.map(c => {
    const groups = all(`SELECT * FROM acc_groups WHERE class_id = ? ORDER BY id`, [c.id]).map(g => {
      const subs = all(`SELECT * FROM acc_subgroups WHERE group_id = ? ORDER BY name`, [g.id]).map(s => {
        const ledgers = rows.filter(r => r.subgroup_id === s.id);
        return { ...s, ledgers, debit: round2(ledgers.reduce((a, l) => a + l.debit, 0)), credit: round2(ledgers.reduce((a, l) => a + l.credit, 0)), balance: round2(ledgers.reduce((a, l) => a + l.closing, 0)) };
      });
      return { ...g, subgroups: subs, debit: round2(subs.reduce((a, s) => a + s.debit, 0)), credit: round2(subs.reduce((a, s) => a + s.credit, 0)), balance: round2(subs.reduce((a, s) => a + s.balance, 0)) };
    });
    return { ...c, groups, debit: round2(groups.reduce((a, g) => a + g.debit, 0)), credit: round2(groups.reduce((a, g) => a + g.credit, 0)), balance: round2(groups.reduce((a, g) => a + g.balance, 0)) };
  });
}

export function trialBalance(u: SessionUser, from?: string, to?: string, level: Level = 'ledger') {
  assertCan(u, 'financial', 'read');
  const rows = rollup(balances(from, to), level).filter(r => r.opening || r.debit || r.credit);
  const out = rows.map(r => ({
    head: r.head, class_name: r.class_name, group_name: r.group_name,
    op_dr: r.opening > 0 ? r.opening : 0, op_cr: r.opening < 0 ? -r.opening : 0,
    debit: r.debit, credit: r.credit, net: round2(r.debit - r.credit),
    cl_dr: r.closing > 0 ? r.closing : 0, cl_cr: r.closing < 0 ? -r.closing : 0,
  }));
  const tot = (k: string) => round2(out.reduce((s, r: any) => s + r[k], 0));
  return { rows: out, totals: { op_dr: tot('op_dr'), op_cr: tot('op_cr'), debit: tot('debit'), credit: tot('credit'), net: tot('net'), cl_dr: tot('cl_dr'), cl_cr: tot('cl_cr') } };
}

export function incomeStatement(u: SessionUser, from?: string, to?: string, level: Level = 'subgroup') {
  assertCan(u, 'financial', 'read');
  const f = from ?? today().slice(0, 8) + '01', t = to ?? today();
  const rows = rollup(balances(f, t), level);
  const period = (r: any) => round2(r.debit - r.credit);
  const revenue = rows.filter(r => r.class_id === 5).map(r => ({ head: r.head, group: r.group_name, amount: -period(r) })).filter(r => r.amount);
  const direct = rows.filter(r => r.class_id === 4 && r.group_name === 'Direct Expense').map(r => ({ head: r.head, group: r.group_name, amount: period(r) })).filter(r => r.amount);
  const indirect = rows.filter(r => r.class_id === 4 && r.group_name !== 'Direct Expense').map(r => ({ head: r.head, group: r.group_name, amount: period(r) })).filter(r => r.amount);
  const sum = (a: { amount: number }[]) => round2(a.reduce((s, r) => s + r.amount, 0));
  const totalRevenue = sum(revenue), totalDirect = sum(direct), totalIndirect = sum(indirect);
  const operating = revenue.filter(r => r.group === 'Operating Revenue');
  return {
    from: f, to: t, revenue, direct, indirect,
    totals: { revenue: totalRevenue, operatingRevenue: sum(operating), direct: totalDirect, grossProfit: round2(totalRevenue - totalDirect), indirect: totalIndirect, netProfit: round2(totalRevenue - totalDirect - totalIndirect) },
  };
}

export function balanceSheet(u: SessionUser, to?: string, level: Level = 'subgroup') {
  assertCan(u, 'financial', 'read');
  const t = to ?? today();
  const all_ = balances(undefined, t);
  const rows = rollup(all_, level);
  const net = all_.filter(r => r.class_id === 4 || r.class_id === 5).reduce((s, r) => s + r.closing, 0); // dr-cr: positive = loss
  const assets = rows.filter(r => r.class_id === 1).map(r => ({ head: r.head, group: r.group_name, amount: r.closing })).filter(r => r.amount);
  const liabilities = rows.filter(r => r.class_id === 2).map(r => ({ head: r.head, group: r.group_name, amount: -r.closing })).filter(r => r.amount);
  const equity = rows.filter(r => r.class_id === 3).map(r => ({ head: r.head, group: r.group_name, amount: -r.closing })).filter(r => r.amount);
  equity.push({ head: 'Current Period Profit / (Loss)', group: "Owner's Equity", amount: round2(-net) });
  const sum = (a: { amount: number }[]) => round2(a.reduce((s, r) => s + r.amount, 0));
  return { to: t, assets, liabilities, equity, totals: { assets: sum(assets), liabilities: sum(liabilities), equity: sum(equity), liabilitiesEquity: round2(sum(liabilities) + sum(equity)) } };
}

export function ledgerStatement(u: SessionUser, ledgerId: number, from?: string, to?: string) {
  if (!u.is_admin && !['financial', 'report', 'client', 'acctra', 'bank', 'loan', 'payroll', 'account'].some(m => u.perms[m]?.read)) assertCan(u, 'financial', 'read');
  const ledger = get(`SELECT l.*, s.name subgroup, g.name group_name, c.nature FROM ledgers l JOIN acc_subgroups s ON s.id = l.subgroup_id JOIN acc_groups g ON g.id = s.group_id JOIN acc_classes c ON c.id = g.class_id WHERE l.id = ?`, [ledgerId]);
  if (!ledger) throw new HttpError(404, 'Ledger not found.');
  const f = from ?? '0000-01-01', t = to ?? '9999-12-31';
  const opening = round2(get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) b FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.ledger_id = ? AND j.date < ?`, [ledgerId, f])?.b ?? 0);
  let bal = opening;
  const lines = all(
    `SELECT j.id journal_id, j.date, j.no, j.type, j.ref_type, j.ref_id, j.narration, jl.debit, jl.credit, jl.memo, jl.ref, jl.cheque_no,
       (SELECT GROUP_CONCAT(DISTINCT l2.name) FROM journal_lines x JOIN ledgers l2 ON l2.id = x.ledger_id WHERE x.journal_id = j.id AND x.ledger_id <> jl.ledger_id AND ((jl.debit > 0 AND x.credit > 0) OR (jl.credit > 0 AND x.debit > 0))) against
     FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE jl.ledger_id = ? AND j.date BETWEEN ? AND ? ORDER BY j.date, j.id, jl.id`,
    [ledgerId, f, t],
  ).map(r => { bal = round2(bal + r.debit - r.credit); return { ...r, balance: bal }; });
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0)), credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { ledger, opening, lines, totals: { debit, credit, closing: round2(opening + debit - credit) } };
}

export function financeAnalysis(u: SessionUser, from?: string, to?: string) {
  assertCan(u, 'financial', 'read');
  const is = incomeStatement(u, from, to);
  const bs = balanceSheet(u, to);
  const sumWhere = (pred: (r: any) => boolean) => round2(balances(undefined, to).filter(pred).reduce((s, r) => s + r.closing, 0));
  const currentAssets = sumWhere(r => r.group_name === 'Current Assets');
  const inventory = sumWhere(r => r.subgroup === 'Inventory');
  const receivable = sumWhere(r => r.subgroup === 'Account Receivables');
  const cash = sumWhere(r => ['Cash At Hand', 'Cash At Bank', 'Cash At Mobile Account'].includes(r.subgroup));
  const currentLiab = -sumWhere(r => r.group_name === 'Current Liabilities');
  const days = Math.max(1, Math.round((new Date(is.to).getTime() - new Date(is.from).getTime()) / 86400000) + 1);
  const cogs = round2(is.direct.filter(d => /Cost Of Goods/i.test(d.head)).reduce((s, d) => s + d.amount, 0));
  const rev = is.totals.revenue || 0;
  const pct = (a: number, b: number) => (b ? round2((a / b) * 100) : 0);
  const trend = all(`SELECT strftime('%Y-%m', j.date) month,
      COALESCE(SUM(CASE WHEN g.class_id = 5 THEN jl.credit - jl.debit END),0) revenue,
      COALESCE(SUM(CASE WHEN g.class_id = 4 THEN jl.debit - jl.credit END),0) expense
    FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN ledgers l ON l.id = jl.ledger_id JOIN acc_subgroups s ON s.id = l.subgroup_id JOIN acc_groups g ON g.id = s.group_id
    WHERE g.class_id IN (4,5) AND j.date >= date(?, 'start of month', '-11 month') GROUP BY month ORDER BY month`, [to ?? today()]).map(r => ({ ...r, revenue: round2(r.revenue), expense: round2(r.expense), profit: round2(r.revenue - r.expense) }));
  return {
    income: is.totals, balance: bs.totals,
    ratios: [
      { key: 'Gross margin', value: pct(is.totals.grossProfit, rev), unit: '%', hint: 'Gross profit ÷ revenue' },
      { key: 'Net margin', value: pct(is.totals.netProfit, rev), unit: '%', hint: 'Net profit ÷ revenue' },
      { key: 'Expense ratio', value: pct(is.totals.indirect, rev), unit: '%', hint: 'Indirect expenses ÷ revenue' },
      { key: 'Current ratio', value: currentLiab ? round2(currentAssets / currentLiab) : 0, unit: '×', hint: 'Current assets ÷ current liabilities' },
      { key: 'Quick ratio', value: currentLiab ? round2((currentAssets - inventory) / currentLiab) : 0, unit: '×', hint: '(Current assets − inventory) ÷ current liabilities' },
      { key: 'Cash ratio', value: currentLiab ? round2(cash / currentLiab) : 0, unit: '×', hint: 'Cash & bank ÷ current liabilities' },
      { key: 'Receivable days', value: rev ? round2((receivable / rev) * days) : 0, unit: 'days', hint: 'Average days to collect' },
      { key: 'Inventory days', value: cogs ? round2((inventory / cogs) * days) : 0, unit: 'days', hint: 'Days of stock on hand' },
      { key: 'Debt to equity', value: bs.totals.equity ? round2(bs.totals.liabilities / bs.totals.equity) : 0, unit: '×', hint: 'Liabilities ÷ equity' },
    ],
    position: { currentAssets, inventory, receivable, cash, currentLiab },
    trend,
  };
}

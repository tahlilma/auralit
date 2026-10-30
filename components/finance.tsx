'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Printer } from 'lucide-react';
import { useRpc } from '@/lib/client/rpc';
import { money, monthStart, todayISO } from '@/lib/format';
import { Badge, Button, Card, cx, ErrorBox, Field, Input, KpiStrip, Loading, PageHeader, Select } from '@/components/ui/primitives';
import { RefSelect } from '@/components/ui/combobox';
import { DataTable, DateRange } from '@/components/ui/table';
import { AreaChart } from '@/components/ui/charts';
import { LedgerStatement } from '@/components/statement';
import { Guard, useSession } from '@/components/shell/session';

const LevelSelect = ({ v, set }: { v: string; set: (v: any) => void }) => (
  <Select className="w-36" value={v} onChange={e => set(e.target.value)}><option value="ledger">Ledger</option><option value="subgroup">Sub group</option><option value="group">Group</option></Select>
);
const PrintBtn = () => <Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>;
function PrintHead({ title, sub }: { title: string; sub: string }) {
  const { company } = useSession();
  return <div className="mb-4 hidden text-center print:block"><p className="text-lg font-bold">{company?.name}</p><p className="font-semibold">{title}</p><p className="text-xs">{sub}</p></div>;
}

export function ChartOfAccounts() {
  const { data, error } = useRpc('finance.chartOfAccounts', [], []);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [stmt, setStmt] = useState<{ id: number; name: string } | null>(null);
  if (error) return <ErrorBox error={error} />;
  const tog = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const row = (k: string, label: React.ReactNode, depth: number, d: number, c: number, b: number, expandable: boolean, onClick?: () => void) => (
    <tr key={k} className={cx('border-b border-line', depth === 0 && 'bg-surface-2 font-semibold', expandable || onClick ? 'cursor-pointer hover:bg-surface-2' : '')} onClick={expandable ? () => tog(k) : onClick}>
      <td className="py-2 pr-3" style={{ paddingLeft: 12 + depth * 20 }}><span className="inline-flex items-center gap-1.5">{expandable && <ChevronRight className={cx('size-3.5 text-muted transition', open[k] && 'rotate-90')} />}{label}</span></td>
      <td className="num px-3 py-2 text-right">{money(d, false)}</td><td className="num px-3 py-2 text-right">{money(c, false)}</td><td className={cx('num px-3 py-2 text-right font-medium', b < 0 && 'text-bad')}>{money(b, false)}</td>
    </tr>
  );
  return (
    <Guard module="financial">
      <PageHeader title="Chart of accounts" subtitle="Class → group → sub-group → ledger, with lifetime debit, credit and balance (Dr − Cr). Click a ledger for its statement." actions={<><Button variant="ghost" onClick={() => setOpen(Object.fromEntries((data ?? []).flatMap((c: any) => [[`c${c.id}`, true], ...c.groups.flatMap((g: any) => [[`g${g.id}`, true], ...g.subgroups.map((s: any) => [`s${s.id}`, true])])])))}>Expand all</Button><PrintBtn /></>} />
      <PrintHead title="Chart of account" sub={todayISO()} />
      {!data ? <Loading /> : (
        <Card pad={false} className="print-area overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr className="text-[12.5px] text-muted"><th className="px-3 py-2.5 text-left font-normal first:pl-5">Account head</th><th className="px-3 py-2.5 text-right font-normal">Debit</th><th className="px-3 py-2.5 text-right font-normal">Credit</th><th className="px-3 py-2.5 text-right font-normal last:pr-5">Balance</th></tr></thead>
            <tbody>
              {data.map((c: any) => (
                <Fragment key={c.id}>
                  {row(`c${c.id}`, <>{c.name} <Badge tone={c.nature === 'debit' ? 'green' : 'blue'}>{c.nature}</Badge></>, 0, c.debit, c.credit, c.balance, true)}
                  {open[`c${c.id}`] && c.groups.map((g: any) => (
                    <Fragment key={g.id}>
                      {row(`g${g.id}`, g.name, 1, g.debit, g.credit, g.balance, true)}
                      {open[`g${g.id}`] && g.subgroups.map((s: any) => (
                        <Fragment key={s.id}>
                          {row(`s${s.id}`, <>{s.name} <span className="text-xs text-muted">({s.ledgers.length})</span></>, 2, s.debit, s.credit, s.balance, s.ledgers.length > 0)}
                          {open[`s${s.id}`] && s.ledgers.map((l: any) => row(`l${l.id}`, <span className="text-ink-2">{l.code} · {l.name}</span>, 3, l.debit, l.credit, l.closing, false, () => setStmt({ id: l.id, name: l.name })))}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {stmt && <Card className="mt-4" title={`Statement — ${stmt.name}`} actions={<Button size="sm" onClick={() => setStmt(null)}>Close</Button>}><LedgerStatement ledgerId={stmt.id} compact /></Card>}
    </Guard>
  );
}

export function TrialBalance() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [level, setLevel] = useState<'ledger' | 'subgroup' | 'group'>('ledger');
  const { data, loading } = useRpc('finance.trialBalance', [from || undefined, to || undefined, level], [from, to, level]);
  const balanced = data && Math.abs(data.totals.cl_dr - data.totals.cl_cr) < 0.01;
  return (
    <Guard module="financial">
      <PageHeader title="Trial balance" subtitle={data ? (balanced ? '✓ Debits equal credits' : '⚠ Not balanced') : ' '} actions={<><LevelSelect v={level} set={setLevel} /><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /><PrintBtn /></>} />
      <PrintHead title="Trial balance" sub={`${from || 'Beginning'} → ${to}`} />
      <Card pad={false} className="print-area">
        <DataTable dense loading={loading} rows={data?.rows ?? []} rowKey="head" totals={data?.totals} columns={[
          { key: 'head', label: 'Head of accounts', render: r => <div><p>{r.head}</p>{level !== 'group' && <p className="text-[11px] text-muted">{r.group_name}</p>}</div> },
          { key: 'op_dr', label: 'Beginning Dr', type: 'money' }, { key: 'op_cr', label: 'Beginning Cr', type: 'money' },
          { key: 'debit', label: 'Debit', type: 'money' }, { key: 'credit', label: 'Credit', type: 'money' }, { key: 'net', label: 'Net activity', type: 'money' },
          { key: 'cl_dr', label: 'Ending Dr', type: 'money' }, { key: 'cl_cr', label: 'Ending Cr', type: 'money' },
        ]} />
      </Card>
    </Guard>
  );
}

function Section({ title, rows, total, neg }: { title: string; rows: { head: string; group?: string; amount: number }[]; total: number; neg?: boolean }) {
  return (
    <div className="mb-5">
      <p className="mb-1.5 text-[13px] font-medium text-muted">{title}</p>
      <table className="w-full text-sm"><tbody>
        {rows.map(r => <tr key={r.head} className="border-b border-line"><td className="py-1.5">{r.head}</td><td className="num py-1.5 text-right">{money(neg ? -r.amount : r.amount, false)}</td></tr>)}
        {!rows.length && <tr><td className="py-1.5 text-muted">—</td></tr>}
        <tr className="font-semibold"><td className="py-2">Total {title.toLowerCase()}</td><td className="num py-2 text-right">{money(neg ? -total : total, false)}</td></tr>
      </tbody></table>
    </div>
  );
}

export function IncomeStatement() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [level, setLevel] = useState<'ledger' | 'subgroup' | 'group'>('subgroup');
  const { data } = useRpc('finance.incomeStatement', [from || undefined, to || undefined, level], [from, to, level]);
  return (
    <Guard module="financial">
      <PageHeader title="Income statement" subtitle="Profit & loss for the period" actions={<><LevelSelect v={level} set={setLevel} /><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /><PrintBtn /></>} />
      {!data ? <Loading /> : (
        <>
          <KpiStrip className="mb-6 no-print" items={[
            { label: 'Revenue', value: money(data.totals.revenue) },
            { label: 'Cost of sales', value: money(data.totals.direct) },
            { label: 'Gross profit', value: money(data.totals.grossProfit) },
            { label: data.totals.netProfit >= 0 ? 'Net profit' : 'Net loss', value: money(data.totals.netProfit), tone: data.totals.netProfit < 0 ? 'bad' : undefined },
          ]} />
          <Card className="print-area mx-auto max-w-3xl">
            <PrintHead title="Income statement" sub={`${data.from} → ${data.to}`} />
            <Section title="Revenue" rows={data.revenue} total={data.totals.revenue} />
            <Section title="Direct expenses" rows={data.direct} total={data.totals.direct} />
            <div className="mb-5 flex justify-between rounded-lg bg-surface-2 px-3 py-2 font-semibold"><span>Gross profit</span><span className="num">{money(data.totals.grossProfit)}</span></div>
            <Section title="Indirect expenses" rows={data.indirect} total={data.totals.indirect} />
            <div className={cx('flex justify-between rounded-lg px-3 py-3 text-lg font-bold', data.totals.netProfit >= 0 ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad')}><span>Net {data.totals.netProfit >= 0 ? 'profit' : 'loss'}</span><span className="num">{money(data.totals.netProfit)}</span></div>
          </Card>
        </>
      )}
    </Guard>
  );
}

export function BalanceSheet() {
  const [to, setTo] = useState(todayISO());
  const [level, setLevel] = useState<'ledger' | 'subgroup' | 'group'>('subgroup');
  const { data } = useRpc('finance.balanceSheet', [to, level], [to, level]);
  return (
    <Guard module="financial">
      <PageHeader title="Balance sheet" subtitle={data ? (Math.abs(data.totals.assets - data.totals.liabilitiesEquity) < 0.01 ? '✓ Assets equal liabilities + equity' : '⚠ Out of balance') : ' '}
        actions={<><LevelSelect v={level} set={setLevel} /><Field label=""><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field><PrintBtn /></>} />
      {!data ? <Loading /> : (
        <div className="print-area">
          <PrintHead title="Balance sheet" sub={`As of ${data.to}`} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Assets"><Section title="Assets" rows={data.assets} total={data.totals.assets} /></Card>
            <Card title="Liabilities & equity"><Section title="Liabilities" rows={data.liabilities} total={data.totals.liabilities} /><Section title="Owner's equity" rows={data.equity} total={data.totals.equity} />
              <div className="flex justify-between rounded-lg bg-surface-2 px-3 py-2 font-semibold"><span>Liabilities + equity</span><span className="num">{money(data.totals.liabilitiesEquity)}</span></div></Card>
          </div>
        </div>
      )}
    </Guard>
  );
}

export function FinanceAnalysis() {
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(todayISO());
  const { data } = useRpc('finance.financeAnalysis', [from || undefined, to || undefined], [from, to]);
  return (
    <Guard module="financial">
      <PageHeader title="Finance analysis" subtitle="Key ratios from the ledger" actions={<DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />} />
      {!data ? <Loading /> : (
        <div className="space-y-4">
          <KpiStrip items={[
            { label: 'Revenue', value: money(data.income.revenue) },
            { label: data.income.netProfit >= 0 ? 'Net profit' : 'Net loss', value: money(data.income.netProfit), tone: data.income.netProfit < 0 ? 'bad' : undefined },
            { label: 'Total assets', value: money(data.balance.assets) },
            { label: 'Liabilities', value: money(data.balance.liabilities) },
            { label: 'Equity', value: money(data.balance.equity) },
          ]} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card title="Revenue, expenses and profit" subtitle="Last 12 months, from the ledger">
              <AreaChart data={data.trend} xKey="month" series={[{ key: 'revenue', label: 'Revenue', color: 'var(--chart-1)' }, { key: 'expense', label: 'Expenses', color: 'var(--chart-2)' }, { key: 'profit', label: 'Profit', color: 'var(--chart-3)' }]} />
            </Card>
            <Card title="Ratios" subtitle="For the selected period" pad={false}>
              <table className="mt-1 w-full text-[14px]">
                <tbody>
                  {data.ratios.map((r: any) => (
                    <tr key={r.key} className="border-t border-rule first:border-t-0">
                      <td className="py-2.5 pl-5 pr-3"><p className="text-ink">{r.key}</p><p className="text-[12.5px] text-muted">{r.hint}</p></td>
                      <td className="num py-2.5 pr-5 text-right text-ink">{r.value}{r.unit === '%' ? '%' : r.unit === '×' ? '×' : ` ${r.unit}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          <Card title="Working capital" pad={false}>
            <DataTable dense rowKey="k" rows={[['Current assets', data.position.currentAssets], ['  of which inventory', data.position.inventory], ['  of which receivable', data.position.receivable], ['  of which cash & bank', data.position.cash], ['Current liabilities', data.position.currentLiab], ['Working capital', data.position.currentAssets - data.position.currentLiab]].map(([k, v]) => ({ k, v }))} columns={[{ key: 'k', label: 'Item' }, { key: 'v', label: 'Amount', type: 'money' }]} />
          </Card>
        </div>
      )}
    </Guard>
  );
}

export function LedgerStatementPage() {
  const [id, setId] = useState<number | null>(null);
  return (
    <Guard module="financial">
      <PageHeader title="Ledger statement" subtitle="Running balance of any ledger — customers, suppliers, cash, bank, expense heads, anything." />
      <Card><Field label="Ledger"><RefSelect refKey="ledger" value={id} onChange={setId} placeholder="Search ledger by code or name…" /></Field></Card>
      {id && <Card className="mt-4"><LedgerStatement key={id} ledgerId={id} /></Card>}
      {!id && <p className="mt-6 text-center text-sm text-muted">Pick a ledger to see its statement. You can also open statements from <Link className="text-brand" href="/data/customer">customers</Link>, <Link className="text-brand" href="/data/supplier">suppliers</Link> and <Link className="text-brand" href="/data/bank_account">bank accounts</Link>.</p>}
    </Guard>
  );
}

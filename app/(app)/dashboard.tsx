'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { useRpc, type RpcResult } from '@/lib/client/rpc';
import { date, money, monthStart, num, todayISO } from '@/lib/format';
import { Badge, Button, Card, cx, ErrorBox, Fit, Id, KpiStrip, Loading, PageHeader, Select, Tabs } from '@/components/ui/primitives';
import { DateRange } from '@/components/ui/table';
import { LineChart, RankBars } from '@/components/ui/charts';
import { useSession } from '@/components/shell/session';

type Dash = RpcResult<'admin.dashboard'>;
type Metric = 'sales' | 'collected' | 'purchases' | 'expenses' | 'profit';
const METRICS: { key: Metric; label: string; field: keyof Dash['current']; good: 'up' | 'down' | 'none' }[] = [
  { key: 'sales', label: 'Sales', field: 'netSales', good: 'up' },
  { key: 'collected', label: 'Money received', field: 'collected', good: 'up' },
  { key: 'profit', label: 'Gross profit', field: 'grossProfit', good: 'up' },
  { key: 'purchases', label: 'Purchases', field: 'purchases', good: 'none' },
  { key: 'expenses', label: 'Running costs', field: 'expenses', good: 'down' },
];

function rangeLabel(from: string, to: string) {
  const f = new Date(from + 'T00:00:00'), t = new Date(to + 'T00:00:00');
  const m = (d: Date) => d.toLocaleString('en', { month: 'short' });
  return f.getMonth() === t.getMonth() && f.getFullYear() === t.getFullYear() ? `${f.getDate()}–${t.getDate()} ${m(t)}` : `${f.getDate()} ${m(f)} – ${t.getDate()} ${m(t)}`;
}

function Delta({ now, before, good, window }: { now: number; before: number; good: 'up' | 'down' | 'none'; window: string }) {
  if (!before && !now) return <span className="text-[12.5px] text-muted">No change {window}</span>;
  if (!before) return <span className="text-[12.5px] text-muted">New {window}</span>;
  const pct = ((now - before) / Math.abs(before)) * 100;
  const up = pct > 0;
  const tone = good === 'none' || Math.abs(pct) < 0.05 ? 'text-muted' : (up === (good === 'up')) ? 'text-ok' : 'text-bad';
  return <span className="text-[12.5px] text-muted"><span className={cx('num font-medium', tone)}>{up ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span> {window}</span>;
}

/** The one fact in today's data that most needs attention, as a plain sentence. */
function finding(d: Dash) {
  const sold = d.today.invoices ? `${money(d.today.sales)} sold today on ${d.today.invoices} invoice${d.today.invoices === 1 ? '' : 's'}.` : 'No sales recorded today yet.';
  const over = d.debtors.filter(x => x.over_limit);
  const cheques = Number(d.attention.cheques?.n ?? 0);
  if (cheques) return `${sold} ${cheques} cheque${cheques === 1 ? '' : 's'} worth ${money(d.attention.cheques.amount)} ${cheques === 1 ? 'is' : 'are'} due within 3 days.`;
  if (over.length) return `${sold} ${over[0].name} is ${money(over[0].due - over[0].credit_limit)} over their credit limit.`;
  if (d.attention.lowStock.length) return `${sold} ${d.attention.lowStock.length} product${d.attention.lowStock.length === 1 ? ' is' : 's are'} at or below minimum stock.`;
  return sold;
}

export function Dashboard() {
  const { can } = useSession();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [branch, setBranch] = useState('');
  const [graph, setGraph] = useState<'sale' | 'service'>('sale');
  const [metric, setMetric] = useState<Metric>('sales');
  const { data, error, loading, reload } = useRpc('admin.dashboard', [{ from, to, branch_id: branch ? Number(branch) : undefined, graph }], [from, to, branch, graph]);

  return (
    <div>
      <PageHeader title="Overview" subtitle={data ? finding(data) : ' '}
        actions={<>
          {data && data.branches.length > 1 && (
            <Select className="w-44" value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch">
              <option value="">All branches</option>{data.branches.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </Select>
          )}
          <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a || '2000-01-01'); setTo(b || todayISO()); }} />
          {can('sales', 'write') && <Button variant="primary" icon={<Plus className="size-4" />} href="/doc/sale/new">New sale</Button>}
        </>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data ? <Loading /> : (
        <div className={cx('space-y-6 transition-opacity', loading && 'opacity-70')}>
          <MoneyPosition d={data} />
          <MainCard d={data} metric={metric} setMetric={setMetric} />
          <div className="grid gap-6 xl:grid-cols-2">
            <Debtors d={data} />
            <Attention d={data} />
          </div>
          {/* The invoice list on the left runs about as long as the two ranking cards stacked on the right. */}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Card title="Latest invoices" pad={false} actions={<Link href="/doc/sale" className="text-[13px] text-brand hover:underline">View all</Link>}>
              <ul className="mt-1">
                {data.recent.map(r => (
                  <li key={r.id} className="border-t border-rule first:border-t-0">
                    <Link href={`/doc/${r.kind}/${r.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                      <div className="min-w-0 flex-1"><p className="truncate text-[14px] text-ink">{r.party ?? 'Walk-in customer'}</p><p className="text-[12.5px] text-muted"><Id>{r.no}</Id> · {date(r.date)}</p></div>
                      <div className="text-right"><p className="num text-[14px] text-ink">{money(r.total)}</p>{r.due > 0.009 ? <p className="num text-[12.5px] text-bad">{money(r.due)} due</p> : <p className="text-[12.5px] text-muted">Paid</p>}</div>
                    </Link>
                  </li>
                ))}
                {!data.recent.length && <li className="px-5 py-8 text-[14px] text-muted">No invoices yet. <Link href="/doc/sale/new" className="text-brand hover:underline">Make the first sale</Link>.</li>}
              </ul>
            </Card>
            <div className="space-y-6">
              <Card title="Top products" subtitle={rangeLabel(data.range.from, data.range.to)} actions={<Link href="/reports/sales_itemwise" className="text-[13px] text-brand hover:underline">Report</Link>}>
                <RankBars limit={6} items={data.topProducts.map(p => ({ label: p.name, value: p.amount, sub: `${num(p.qty)} sold` }))} />
              </Card>
              <Card title="Sales by person" subtitle={rangeLabel(data.range.from, data.range.to)} actions={<Tabs variant="segmented" value={graph} onChange={setGraph} tabs={[{ value: 'sale', label: 'Sales' }, { value: 'service', label: 'Service' }]} />}>
                <RankBars limit={6} items={data.byEmployee.map(e => ({ label: e.name, value: e.amount, sub: `${e.orders} invoice${e.orders === 1 ? '' : 's'}` }))} />
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MoneyPosition({ d }: { d: Dash }) {
  const kind = (k: string) => d.position.find(p => p.kind === k) ?? { balance: 0, inflow: 0, outflow: 0, accounts: 0 };
  const moved = (k: string) => {
    const p = kind(k);
    const parts = [p.inflow ? `in ${money(p.inflow, false)}` : '', p.outflow ? `out ${money(p.outflow, false)}` : ''].filter(Boolean);
    if (!parts.length) return 'No movement today';
    parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
    parts[parts.length - 1] += ' today';
    // Each part stays whole, so a narrow cell breaks between "in" and "out", never inside a figure.
    return <>{parts.map((t, i) => <Fragment key={i}>{i ? ' · ' : ''}<span className="whitespace-nowrap">{t}</span></Fragment>)}</>;
  };
  const cash = kind('cash'), bank = kind('bank'), mobile = kind('mobile');
  return (
    <KpiStrip items={[
      { label: 'Cash in hand', value: money(cash.balance), sub: moved('cash'), href: '/reports/daily_cash' },
      { label: `Bank${bank.accounts > 1 ? ` · ${bank.accounts} accounts` : ''}`, value: money(bank.balance), sub: bank.accounts ? moved('bank') : 'Add a bank account', href: '/data/bank_account', tone: bank.balance ? undefined : 'muted' },
      { label: 'bKash and Nagad', value: money(mobile.balance), sub: mobile.accounts ? moved('mobile') : 'Add a mobile wallet', href: '/data/mobile_account', tone: mobile.balance ? undefined : 'muted' },
      { label: 'Customers owe you', value: money(d.receivable), sub: `${d.customersOwing} customer${d.customersOwing === 1 ? '' : 's'} with a due`, href: '/reports/rec_balance' },
      { label: 'You owe suppliers', value: money(d.payable), sub: 'Payable balance', href: '/reports/pay_balance' },
      { label: 'Stock at cost', value: money(d.stockValue), sub: 'Inventory value', href: '/inventory/combined' },
    ]} />
  );
}

function MainCard({ d, metric, setMetric }: { d: Dash; metric: Metric; setMetric: (m: Metric) => void }) {
  const m = METRICS.find(x => x.key === metric)!;
  const window = `vs ${rangeLabel(d.prevRange.from, d.prevRange.to)}`;
  const c = d.current, p = d.previous;
  const rows: [string, number, number, boolean?][] = [
    ['Goods sold', c.goods, p.goods], ['Service', c.service, p.service], ['Returns', -c.sreturn, -p.sreturn],
    ['Net sales', c.netSales, p.netSales, true], ['Cost of goods sold', -c.cogs, -p.cogs], ['Gross profit', c.grossProfit, p.grossProfit, true],
    ['Running costs', -c.expenses, -p.expenses], ['Net profit', c.netProfit, p.netProfit, true],
  ];
  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3 lg:grid-cols-5" role="tablist" aria-label="Choose what the chart shows">
        {METRICS.map(x => {
          const on = x.key === metric;
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => setMetric(x.key)}
              className={cx('relative bg-surface px-5 pb-4 pt-4 text-left transition-colors last:col-span-2 hover:bg-surface-2 lg:last:col-span-1', on && 'max-lg:bg-surface-2')}>
              <span className={cx('block text-[13px]', on ? 'font-semibold text-ink' : 'font-medium text-muted')}>{x.label}</span>
              <Fit className={cx('num mt-1 text-[20px] leading-tight text-ink sm:text-[24px]', on ? 'font-medium' : 'font-normal')}>{money(c[x.field] as number)}</Fit>
              <span className="mt-1 block"><Delta now={c[x.field] as number} before={p[x.field] as number} good={x.good} window={window} /></span>
              {on && <span className="absolute inset-x-0 bottom-0 hidden h-0.5 bg-ink lg:block" />}
            </button>
          );
        })}
      </div>
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="min-w-0">
          <p className="mb-3 text-[13px] text-muted">{m.label} {d.range.monthly ? 'by month' : 'by day'}, {rangeLabel(d.range.from, d.range.to)}</p>
          <LineChart data={d.series} xKey="k" series={[{ key: metric, label: m.label, color: 'var(--chart-1)' }]} height={240} />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[13px] text-muted">Profit and loss</p>
          <table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted"><th className="pb-1.5 text-left font-normal"><span className="sr-only">Line</span></th><th className="pb-1.5 text-right font-normal">{rangeLabel(d.range.from, d.range.to)}</th><th className="pb-1.5 pl-4 text-right font-normal">{rangeLabel(d.prevRange.from, d.prevRange.to)}</th></tr></thead>
            <tbody>
              {rows.map(([k, now, before, strong]) => (
                <tr key={k} className={cx(strong && 'font-medium')}>
                  <td className={cx('py-1.5 pr-3', strong ? 'border-t border-line text-ink' : 'text-ink-2')}>{k}</td>
                  <td className={cx('num py-1.5 text-right', strong && 'border-t border-line', now < 0 && k === 'Net profit' ? 'text-bad' : 'text-ink')}>{money(now, false)}</td>
                  <td className={cx('num py-1.5 pl-4 text-right text-muted', strong && 'border-t border-line')}>{money(before, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/finance/income" className="mt-3 inline-flex items-center gap-1 text-[13px] text-brand hover:underline">Full income statement <ArrowRight className="size-3.5" /></Link>
        </div>
      </div>
    </section>
  );
}

function Debtors({ d }: { d: Dash }) {
  const { can } = useSession();
  return (
    <Card title="Customers who owe the most" subtitle={`${money(d.receivable)} due from ${d.customersOwing} customer${d.customersOwing === 1 ? '' : 's'}`} pad={false}
      actions={<Link href="/reports/rec_due_aging" className="text-[13px] text-brand hover:underline">Due by age</Link>}>
      <table className="mt-1 w-full text-[14px]">
        <thead><tr className="text-[12.5px] text-muted"><th className="py-2 pl-5 text-left font-normal">Customer</th><th className="py-2 text-left font-normal">Last invoice</th><th className="py-2 text-right font-normal">Due</th><th className="w-24 py-2 pr-5" /></tr></thead>
        <tbody>
          {d.debtors.map(c => (
            <tr key={c.id} className="border-t border-rule">
              <td className="py-2.5 pl-5"><Link href={`/data/customer?view=${c.id}`} className="text-ink hover:underline">{c.name}</Link>{c.over_limit && <Badge tone="red" className="ml-2">Over limit</Badge>}<p className="text-[12.5px] text-muted">{c.mobile}</p></td>
              <td className="py-2.5 text-[13px] text-muted">{c.last_invoice ? date(c.last_invoice) : '—'}</td>
              <td className="num py-2.5 text-right text-ink">{money(c.due)}</td>
              <td className="py-2.5 pr-5 text-right">{can('acctra', 'write') && <Button size="xs" href={`/vouchers/receipt/new?ledger=${c.ledger_id}`}>Collect</Button>}</td>
            </tr>
          ))}
          {!d.debtors.length && <tr><td colSpan={4} className="px-5 py-6 text-[14px] text-muted">Nobody owes you anything right now.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function Attention({ d }: { d: Dash }) {
  const a = d.attention;
  const low = a.lowStock;
  const items: { label: string; detail: string; count: number; href: string }[] = [
    { label: 'Cheques due within 3 days', detail: Number(a.cheques?.n) ? money(a.cheques.amount) : 'None', count: Number(a.cheques?.n ?? 0), href: '/accounts/cheques' },
    { label: 'Follow-ups due today', detail: a.followups ? 'Customer enquiries to call back' : 'None', count: a.followups, href: '/enquiry' },
    { label: 'Products at minimum stock', detail: low.length ? low.slice(0, 2).map((p: any) => p.name).join(', ') + (low.length > 2 ? ` and ${low.length - 2} more` : '') : 'None', count: low.length, href: '/reports/inv_low_stock' },
    { label: 'Open estimates', detail: Number(a.estimates?.n) ? `${money(a.estimates.amount)} quoted, not yet invoiced` : 'None', count: Number(a.estimates?.n ?? 0), href: '/doc/estimate' },
    { label: 'Purchase orders to approve', detail: a.orders ? 'Waiting for approval' : 'None', count: a.orders, href: '/doc/porder' },
    ...(a.leaves ? [{ label: 'Leave requests', detail: 'Waiting for a decision', count: a.leaves, href: '/data/leave_app' }] : []),
  ];
  const waiting = items.reduce((s, i) => s + i.count, 0);
  return (
    <Card title="Needs attention" subtitle={waiting ? `${num(waiting)} item${waiting === 1 ? '' : 's'} waiting on you` : 'Nothing is waiting on you'} pad={false}>
      <ul className="mt-1">
        {items.map(i => (
          <li key={i.label} className="border-t border-rule first:border-t-0">
            <Link href={i.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
              <div className="min-w-0 flex-1"><p className={cx('text-[14px]', i.count ? 'text-ink' : 'text-muted')}>{i.label}</p><p className="truncate text-[12.5px] text-muted">{i.detail}</p></div>
              <span className={cx('num min-w-8 text-right text-[16px]', i.count ? 'font-medium text-ink' : 'text-muted')}>{i.count}</span>
              <ArrowRight className="size-4 text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

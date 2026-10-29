'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Banknote, Boxes, HandCoins, Landmark, ReceiptText, ShoppingCart, Smartphone, TrendingUp, Wallet } from 'lucide-react';
import { useRpc } from '@/lib/client/rpc';
import { date, KIND_LABEL, money, monthStart, todayISO } from '@/lib/format';
import { Badge, Card, ErrorBox, Loading, PageHeader, Select, Stat, Tabs } from '@/components/ui/primitives';
import { DateRange } from '@/components/ui/table';
import { AreaChart, BarChart, RankBars } from '@/components/ui/charts';
import { useSession } from '@/components/shell/session';

export function Dashboard() {
  const { me, company } = useSession();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [branch, setBranch] = useState('');
  const [graph, setGraph] = useState<'sale' | 'service'>('sale');
  const { data, error, loading, reload } = useRpc('admin.dashboard', [{ from, to, branch_id: branch ? Number(branch) : undefined, graph }], [from, to, branch, graph]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader title={`${greet}, ${me.name?.split(' ')[0] ?? ''}`} subtitle={`Here is how ${company?.name ?? 'the business'} is doing.`}
        actions={<>
          {data && data.branches.length > 1 && (
            <Select className="w-44" value={branch} onChange={e => setBranch(e.target.value)}>
              <option value="">All branches</option>{data.branches.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </Select>
          )}
          <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        </>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!data ? <Loading /> : (
        <div className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Today's sales" value={money(data.today.sales)} sub={`${data.today.orders} invoice(s)`} icon={<ShoppingCart className="size-4" />} href="/doc/sale" />
            <Stat label="Received today" value={money(data.today.received)} sub="Into cash, bank & mobile" icon={<HandCoins className="size-4" />} tone="ok" href="/reports/daily_cash" />
            <Stat label="Today's expenses" value={money(data.today.expense)} sub={`Purchases ${money(data.today.purchase)}`} icon={<ReceiptText className="size-4" />} tone="warn" href="/vouchers/expense" />
            <Stat label="Gross profit (period)" value={money(data.overview.grossProfit)} sub={`Net sales ${money(data.overview.netSales)}`} icon={<TrendingUp className="size-4" />} tone="ok" href="/finance/income" />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <MiniStat icon={<Banknote className="size-4" />} label="Cash in hand" value={data.cash.cash ?? 0} href="/reports/acc_cash" />
            <MiniStat icon={<Landmark className="size-4" />} label="Bank balance" value={data.cash.bank ?? 0} href="/data/bank_account" />
            <MiniStat icon={<Smartphone className="size-4" />} label="Mobile wallets" value={data.cash.mobile ?? 0} href="/data/mobile_account" />
            <MiniStat icon={<Wallet className="size-4" />} label="Receivable" value={data.overview.receivable} href="/reports/rec_balance" />
            <MiniStat icon={<Wallet className="size-4" />} label="Payable" value={data.overview.payable} href="/reports/pay_balance" />
            <MiniStat icon={<Boxes className="size-4" />} label="Stock value" value={data.overview.stockValue} href="/inventory/branch" />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2" title="Daily sales" subtitle="Last 30 days, sales + service">
              <AreaChart data={data.daily} xKey="date" series={[{ key: 'sales', label: 'Sales', color: 'var(--brand)' }]} />
            </Card>
            <Card title="Top products" subtitle={`${date(data.range.from)} – ${date(data.range.to)}`}>
              <RankBars items={data.topProducts.map(p => ({ label: p.name, value: p.amount, sub: `× ${p.qty}` }))} />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card title="Monthly sales" subtitle="Last 12 months">
              <BarChart data={data.monthly} xKey="month" series={[{ key: 'sales', label: 'Sales', color: '#c27a43' }]} />
            </Card>
            <Card className="xl:col-span-2" title="Daily income, expense & profit" subtitle="From the general ledger">
              <BarChart data={data.dailyIE} xKey="date" series={[{ key: 'income', label: 'Income', color: '#16a34a' }, { key: 'expense', label: 'Expense', color: '#dc2626' }, { key: 'profit', label: 'Profit', color: '#c27a43' }]} />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card title="Business overview" subtitle="Selected period">
              <dl className="divide-y divide-line text-sm">
                {([['Sales', data.overview.sales], ['Service', data.overview.service], ['Sales return', -data.overview.sreturn], ['Net sales', data.overview.netSales], ['Cost of goods sold', -data.overview.cogs], ['Purchases', data.overview.purchase], ['Purchase return', data.overview.preturn], ['Expenses (incl. COGS-free)', data.overview.expense]] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2"><dt className="text-muted">{k}</dt><dd className="num font-medium">{money(v)}</dd></div>
                ))}
              </dl>
            </Card>
            <Card title="Sales by employee" actions={<Tabs value={graph} onChange={setGraph} tabs={[{ value: 'sale', label: 'Sale' }, { value: 'service', label: 'Service' }]} />}>
              <RankBars items={data.byEmployee.map(e => ({ label: e.name, value: e.amount, sub: `${e.orders} inv.` }))} color="#2563eb" />
            </Card>
            <Card title="Recent documents" pad={false} actions={<Link href="/doc/sale" className="text-xs font-medium text-brand hover:underline">View all</Link>}>
              <ul className="divide-y divide-line">
                {data.recent.map(r => (
                  <li key={r.id}><Link href={`/doc/${r.kind}/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.party ?? '—'}</p><p className="text-xs text-muted">{r.no} · {date(r.date)}</p></div>
                    <div className="text-right"><p className="num text-sm font-medium">{money(r.total)}</p><Badge tone={r.kind === 'purchase' ? 'blue' : 'brand'}>{KIND_LABEL[r.kind]}</Badge></div>
                  </Link></li>
                ))}
                {!data.recent.length && <li className="px-4 py-10 text-center text-sm text-muted">No documents yet. <Link href="/doc/sale/new" className="text-brand">Make your first sale</Link>.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card transition hover:border-brand/40">
      <span className="rounded-lg bg-surface-3 p-2 text-ink-2">{icon}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-xs text-muted">{label}</p><p className="num text-[15px] font-semibold">{money(value)}</p></div>
      <ArrowUpRight className="size-4 text-muted opacity-0 transition group-hover:opacity-100" />
    </Link>
  );
}

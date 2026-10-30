import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Wordmark } from '@/components/shell/brand';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

// A static fragment of the product itself, shown beside the form instead of a stock illustration.
const kpis = [['Sales today', '৳ 56,194', '4 invoices'], ['Money received', '৳ 41,300', 'Cash, bank and bKash'], ['Customers owe you', '৳ 10,89,826', '11 customers']];
const points = [12, 18, 15, 22, 19, 27, 24, 31, 28, 36, 33, 41];
const invoices = [['SEL-BGI-301026-004', 'Gulshan Roast Lab', '৳ 1,26,000'], ['SEL-BGI-301026-003', 'Banani Brew House', '৳ 9,350'], ['SEL-BGI-301026-002', 'Walk-in customer', '৳ 3,700']];

function Fragment() {
  const W = 520, H = 140, max = 48;
  const x = (i: number) => 8 + (i * (W - 16)) / (points.length - 1);
  const y = (v: number) => H - 12 - ((H - 24) * v) / max;
  return (
    <div data-ui className="w-full max-w-[560px] rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between px-6 pt-5">
        <p className="text-[15px] font-semibold text-ink">Overview</p>
        <p className="text-[12.5px] text-muted">1–30 Oct</p>
      </div>
      <div className="mt-4 grid grid-cols-3 border-y border-line">
        {kpis.map(([l, v, s], i) => (
          <div key={l} className={i ? 'border-l border-line px-5 py-3.5' : 'px-5 py-3.5'}>
            <p className="text-[12.5px] text-muted">{l}</p>
            <p className="mt-0.5 text-[18px] text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</p>
            <p className="text-[12px] text-muted">{s}</p>
          </div>
        ))}
      </div>
      <div className="px-6 pt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
          {[0, 1, 2, 3].map(i => <line key={i} x1="8" x2={W - 8} y1={12 + i * ((H - 24) / 3)} y2={12 + i * ((H - 24) / 3)} stroke="var(--grid)" />)}
          <polyline points={points.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
      <ul className="px-6 pb-4 pt-2">
        {invoices.map(([no, who, amt]) => (
          <li key={no} className="flex items-center justify-between border-t border-rule py-2.5 text-[13.5px] first:border-t-0">
            <span className="min-w-0"><span className="block truncate text-ink">{who}</span><span className="id block text-[12px] text-muted">{no}</span></span>
            <span className="text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{amt}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Wordmark />
        <div className="flex flex-1 items-center justify-center py-10">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="text-[12.5px] text-muted">Your data stays on your own server.</p>
      </div>
      <div className="hidden items-center justify-center bg-frame px-12 py-12 lg:flex">
        <div className="flex w-full max-w-[560px] flex-col gap-8">
          <Fragment />
          <div>
            <p className="text-[20px] font-semibold leading-snug text-ink">Sales, stock and accounts on one screen.</p>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">Point of sale with barcode and serial scanning, purchasing, stock across branches and warehouses, warranty, payroll and double-entry books that always balance.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

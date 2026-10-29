import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-side lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#7a4119_0,transparent_45%),radial-gradient(circle_at_80%_70%,#3b2412_0,transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-side-ink">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#c27a43] to-[#6b3814] text-lg font-bold text-white">A</div>
            <span className="text-lg font-semibold">Auralit ERP</span>
          </div>
          <div className="max-w-md">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">Run sales, stock and accounts from one calm screen.</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-side-muted">Point of sale, purchases, warranty, inventory across branches and warehouses, double-entry accounting, payroll and ninety-plus reports.</p>
            <ul className="mt-8 grid grid-cols-2 gap-3 text-sm text-side-ink/90">
              {['Fast POS with barcode & serials', 'Live stock by location', 'Cash, bank & bKash ledgers', 'Trial balance & balance sheet'].map(t => (
                <li key={t} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">{t}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-side-muted">Your data stays on your own server.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

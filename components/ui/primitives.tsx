'use client';
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { money } from '@/lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
/** Full width unless the caller sets its own width. */
const wFull = (cls?: string) => (/(^|\s)(w-|flex-1)/.test(cls ?? '') ? '' : 'w-full');

// ───────── Button ─────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'success';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-2 shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2 shadow-sm',
  ghost: 'text-ink-2 hover:bg-surface-3',
  danger: 'bg-bad text-white hover:opacity-90 shadow-sm',
  soft: 'bg-brand-soft text-brand hover:brightness-95',
  success: 'bg-ok text-white hover:opacity-90 shadow-sm',
};
const SIZE = { xs: 'h-7 px-2 text-xs gap-1', sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-9 px-3.5 text-sm gap-2', lg: 'h-11 px-5 text-[15px] gap-2' };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE; loading?: boolean; icon?: ReactNode; href?: string };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, href, ...rest }, ref) {
  const cls = cx('inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:opacity-50 disabled:pointer-events-none select-none', VARIANT[variant], SIZE[size], className);
  const inner = <>{loading ? <Loader2 className="size-4 animate-spin" /> : icon}{children}</>;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>{inner}</button>;
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx('inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-ink transition-colors outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:opacity-40', className)} {...rest}>
      {children}
    </button>
  );
}

// ───────── Inputs ─────────
const inputBase = 'rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-brand focus:ring-4 focus:ring-[var(--ring)] disabled:bg-surface-3 disabled:text-muted read-only:bg-surface-2';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { inputSize?: 'sm' | 'md' | 'lg' }>(function Input({ className, inputSize = 'md', ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, wFull(className), inputSize === 'sm' ? 'h-8 text-[13px]' : inputSize === 'lg' ? 'h-11 text-base' : 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx(inputBase, wFull(className), 'py-2 leading-relaxed resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { inputSize?: 'sm' | 'md' }>(function Select({ className, inputSize = 'md', children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(inputBase, wFull(className), 'appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8', inputSize === 'sm' ? 'h-8 text-[13px]' : 'h-9', className)}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2378716c' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ label, checked, onChange, className, disabled }: { label?: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-sm cursor-pointer select-none', disabled && 'opacity-50 pointer-events-none', className)}>
      <input type="checkbox" className="size-4 rounded accent-[var(--brand)]" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} />
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2.5 text-sm cursor-pointer select-none">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-line-strong')}>
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  );
}

export function Field({ label, hint, error, children, className, required, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; required?: boolean; htmlFor?: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1.5 min-w-0', className)}>
      {label && <label htmlFor={htmlFor ?? id} className="text-[12.5px] font-medium text-ink-2">{label}{required && <span className="text-bad"> *</span>}</label>}
      {children}
      {error ? <p className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ───────── Layout ─────────
export function Card({ children, className, title, actions, pad = true, subtitle }: { children?: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean; subtitle?: ReactNode }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface shadow-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="truncate text-[14px] font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 no-print">
      <div className="min-w-0">
        {back && <Link href={back} className="mb-1 inline-block text-xs font-medium text-muted hover:text-brand">← Back</Link>}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: 'bg-ok-soft text-ok', red: 'bg-bad-soft text-bad', amber: 'bg-warn-soft text-warn', blue: 'bg-info-soft text-info', gray: 'bg-surface-3 text-ink-2', brand: 'bg-brand-soft text-brand',
};
const AUTO: Record<string, keyof typeof BADGE> = {
  active: 'green', inactive: 'gray', yes: 'green', no: 'gray', approved: 'green', pending: 'amber', rejected: 'red', cleared: 'green', bounced: 'red',
  final: 'green', invoiced: 'blue', draft: 'gray', sold: 'blue', instock: 'green', received: 'amber', checked: 'blue', in_service: 'amber', ready: 'green',
  delivered: 'green', replaced: 'blue', suspended: 'gray', finished: 'blue', paid: 'green', due: 'red', partial: 'amber', supplier: 'blue', self: 'brand',
  taken: 'amber', given: 'blue', cash: 'green', bank: 'blue', mobile: 'brand', customer: 'amber', expense: 'red', general: 'gray', credit: 'blue', debit: 'green',
};
export function Badge({ children, tone, className }: { children: ReactNode; tone?: keyof typeof BADGE; className?: string }) {
  const t = tone ?? AUTO[String(children).toLowerCase()] ?? 'gray';
  return <span className={cx('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium capitalize whitespace-nowrap', BADGE[t], className)}>{String(children).replace(/_/g, ' ')}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted"><Spinner /> {label}</div>;
}

export function Empty({ title = 'Nothing here yet', hint, action, icon }: { title?: string; hint?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 rounded-full bg-surface-3 p-3 text-muted">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad flex items-center justify-between gap-3">
      <span>{error}</span>
      {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'bad' | 'warn' | 'brand'; icon?: ReactNode; href?: string }) {
  const body = (
    <div className={cx('rounded-xl border border-line bg-surface p-4 shadow-card transition', href && 'hover:border-brand/50 hover:shadow-pop')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        {icon && <span className={cx('rounded-lg p-1.5', tone === 'ok' ? 'bg-ok-soft text-ok' : tone === 'bad' ? 'bg-bad-soft text-bad' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand')}>{icon}</span>}
      </div>
      <p className="num mt-1.5 text-[22px] font-semibold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Money({ value, className, symbol = true, colored }: { value: unknown; className?: string; symbol?: boolean; colored?: boolean }) {
  const v = Number(value) || 0;
  return <span className={cx('num whitespace-nowrap', colored && (v < 0 ? 'text-bad' : v > 0 ? 'text-ok' : 'text-muted'), className)}>{money(v, symbol)}</span>;
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cx('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {tabs.map(t => (
        <button key={t.value} type="button" onClick={() => onChange(t.value)}
          className={cx('rounded-md px-3 py-1.5 text-[13px] font-medium transition', value === t.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded bg-surface-3 px-1 text-[11px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{children}</kbd>;
}

export function KeyVal({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: number }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-2.5 text-sm', cols === 3 ? 'sm:grid-cols-3' : cols === 1 ? '' : 'sm:grid-cols-2')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="truncate font-medium text-ink">{v || <span className="text-muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

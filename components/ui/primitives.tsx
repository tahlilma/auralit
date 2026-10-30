'use client';
import { forwardRef, useId, useLayoutEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2 } from 'lucide-react';
import { money } from '@/lib/format';
import { NAV } from '@/lib/nav';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
/** Full width unless the caller sets its own width. */
const wFull = (cls?: string) => (/(^|\s)(w-|flex-1)/.test(cls ?? '') ? '' : 'w-full');

// ───────── Button ─────────
// One filled action per screen (near-black). Everything else is outlined, grey or plain text.
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline' | 'soft' | 'success';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
  danger: 'bg-bad text-white hover:opacity-90',
  dangerOutline: 'bg-surface text-bad border border-line-strong hover:bg-bad-soft',
  soft: 'bg-surface-3 text-ink hover:bg-line',
  success: 'bg-surface text-ok border border-line-strong hover:bg-ok-soft',
};
const SIZE = { xs: 'h-7 px-2 text-[12.5px] gap-1', sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-9 px-3.5 text-[14px] gap-2', lg: 'h-11 px-5 text-[15px] gap-2' };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE; loading?: boolean; icon?: ReactNode; href?: string };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, href, ...rest }, ref) {
  const cls = cx('inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none select-none', VARIANT[variant], SIZE[size], className);
  const inner = <>{loading ? <Loader2 className="size-4 animate-spin" /> : icon}{children}</>;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>{inner}</button>;
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx('inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-40', className)} {...rest}>
      {children}
    </button>
  );
}

// ───────── Inputs ─────────
const inputBase = 'rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink outline-none transition focus:border-brand focus:ring-3 focus:ring-[var(--ring)] disabled:bg-surface-2 disabled:text-muted';
// Selects always match :read-only, so only typed fields take the read-only fill.
const readOnlyFill = 'read-only:bg-surface-2';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { inputSize?: 'sm' | 'md' | 'lg' }>(function Input({ className, inputSize = 'md', ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, readOnlyFill, wFull(className), inputSize === 'sm' ? 'h-8 text-[13px]' : inputSize === 'lg' ? 'h-11 text-[15px]' : 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx(inputBase, readOnlyFill, wFull(className), 'py-2 leading-relaxed resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { inputSize?: 'sm' | 'md' }>(function Select({ className, inputSize = 'md', children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(inputBase, wFull(className), 'appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8', inputSize === 'sm' ? 'h-8 text-[13px]' : 'h-9', className)}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235b5e62' stroke-width='1.6'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ label, checked, onChange, className, disabled }: { label?: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 text-[14px] select-none', disabled && 'pointer-events-none opacity-50', className)}>
      <input type="checkbox" className="size-4 rounded accent-[var(--accent)]" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} />
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-[14px] select-none">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx('relative h-[18px] w-8 rounded-full transition-colors', checked ? 'bg-ok' : 'bg-line-strong')}>
        <span className={cx('absolute top-0.5 size-3.5 rounded-full bg-white transition-all', checked ? 'left-[16px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  );
}

export function Field({ label, hint, error, children, className, required, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; required?: boolean; htmlFor?: string }) {
  const id = useId();
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {label && <label htmlFor={htmlFor ?? id} className="text-[13px] font-medium text-ink-2">{label}{required && <span className="text-bad"> *</span>}</label>}
      {children}
      {error ? <p className="text-[12px] text-bad">{error}</p> : hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

// ───────── Layout ─────────
export function Card({ children, className, title, actions, pad = true, subtitle }: { children?: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean; subtitle?: ReactNode }) {
  return (
    <section className={cx('rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className={cx('flex items-start justify-between gap-3 px-5 pt-4', pad ? 'pb-0' : 'pb-3')}>
          <div className="min-w-0">
            {title && <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? (title || actions ? 'px-5 pb-5 pt-3' : 'p-5') : ''}>{children}</div>
    </section>
  );
}

/** Breadcrumb trail for a "back" link, named from the navigation. */
function crumbsFor(href: string): { label: string; href?: string }[] {
  for (const g of NAV) {
    const item = g.items.find(i => i.href === href);
    if (item) return [{ label: g.label }, { label: item.label, href }];
  }
  return [{ label: 'Back', href }];
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-[13px] text-muted no-print">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 text-faint" />}
          {c.href ? <Link href={c.href} className="hover:text-ink hover:underline">{c.label}</Link> : <span>{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({ title, subtitle, actions, back, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string; crumbs?: { label: string; href?: string }[] }) {
  const trail = crumbs ?? (back ? crumbsFor(back) : null);
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 no-print">
      <div className="min-w-0">
        {trail && <Breadcrumbs items={trail} />}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: 'bg-ok-soft text-ok-ink', red: 'bg-bad-soft text-bad-ink', amber: 'bg-warn-soft text-warn-ink', blue: 'bg-info-soft text-info-ink',
  gray: 'bg-neutral-soft text-neutral-ink', brand: 'bg-brand-soft text-brand',
};
const AUTO: Record<string, keyof typeof BADGE> = {
  active: 'green', inactive: 'gray', yes: 'green', no: 'gray', approved: 'green', pending: 'amber', rejected: 'red', cleared: 'green', bounced: 'red',
  final: 'green', invoiced: 'blue', draft: 'gray', sold: 'blue', instock: 'green', received: 'amber', checked: 'blue', in_service: 'amber', ready: 'green',
  delivered: 'green', replaced: 'blue', suspended: 'gray', finished: 'blue', paid: 'green', due: 'red', partial: 'amber', supplier: 'blue', self: 'gray',
  taken: 'amber', given: 'blue', cash: 'gray', bank: 'gray', mobile: 'gray', customer: 'gray', expense: 'gray', general: 'gray', credit: 'gray', debit: 'gray',
  open: 'gray', overdue: 'red',
};
export function Badge({ children, tone, className }: { children: ReactNode; tone?: keyof typeof BADGE; className?: string }) {
  const t = tone ?? AUTO[String(children).toLowerCase()] ?? 'gray';
  const text = String(children).replace(/_/g, ' ');
  return <span className={cx('inline-flex h-5 flex-none items-center whitespace-nowrap rounded px-1.5 text-[12px] font-medium', BADGE[t], className)}>{text.charAt(0).toUpperCase() + text.slice(1)}</span>;
}

/** One line that steps its own font size down until it fits, so a large figure is never cut off. */
export function Fit({ children, className, min = 13 }: { children: ReactNode; className?: string; min?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = -1;
    const fit = () => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > min) el.style.fontSize = `${--size}px`;
    };
    // Only a change of width can change the fit; ignoring height changes avoids a resize loop.
    const ro = new ResizeObserver(([e]) => { if (e.contentRect.width !== width) { width = e.contentRect.width; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, min]);
  return <span ref={ref} className={cx('block overflow-hidden whitespace-nowrap', className)}>{children}</span>;
}

/** An ID people read out or scan: invoice and voucher numbers, product codes, serials. */
export function Id({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('id whitespace-nowrap', className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-[14px] text-muted"><Spinner /> {label}</div>;
}

export function Empty({ title = 'Nothing here yet', hint, action, icon }: { title?: string; hint?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[13px] text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-[14px]">
      <span className="flex items-center gap-2 text-ink"><span className="size-2 rounded-full bg-bad" />{error}</span>
      {onRetry && <Button size="sm" variant="ghost" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

/** A single figure with its label. Group several in a KpiStrip rather than giving each a tile. */
export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'bad' | 'warn' | 'brand'; icon?: ReactNode; href?: string }) {
  const body = (
    <div className={cx('h-full rounded-lg border border-line bg-surface px-5 py-4 transition-colors', href && 'hover:border-line-strong')}>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className={cx('num mt-1 text-[24px] font-normal leading-tight', tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-ink')}>{value}</p>
      {sub && <p className="mt-1 text-[12px] text-muted">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export type Kpi = { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: 'ok' | 'bad' | 'muted' };
/** One container split by 1px dividers into equal columns: label, figure, one quiet caption. */
export function KpiStrip({ items, className }: { items: Kpi[]; className?: string }) {
  const cols = items.length;
  return (
    <div className={cx('grid overflow-hidden rounded-lg border border-line bg-surface', cols >= 6 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : cols === 5 ? 'grid-cols-2 md:grid-cols-5' : cols === 4 ? 'grid-cols-2 lg:grid-cols-4' : cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2', className)}>
      {items.map((k, i) => {
        const inner = (
          <>
            <p className="truncate text-[13px] font-medium text-muted">{k.label}</p>
            <Fit className={cx('num mt-1 text-[20px] leading-tight', k.tone === 'bad' ? 'text-bad' : k.tone === 'ok' ? 'text-ok' : k.tone === 'muted' ? 'text-muted' : 'text-ink')}>{k.value}</Fit>
            {k.sub && <p className="mt-1 text-[12px] text-muted">{k.sub}</p>}
          </>
        );
        // An odd last cell on the two-column phone grid spans the row instead of leaving a hole.
        const cls = cx('block min-w-0 px-5 py-4 -mb-px -mr-px border-b border-r border-line', i === cols - 1 && (cols === 5 || (cols > 6 && cols % 2 === 1)) && 'max-md:col-span-2');
        return k.href ? <Link key={i} href={k.href} className={cx(cls, 'transition-colors hover:bg-surface-2')}>{inner}</Link> : <div key={i} className={cls}>{inner}</div>;
      })}
    </div>
  );
}

export function Money({ value, className, symbol = true, colored }: { value: unknown; className?: string; symbol?: boolean; colored?: boolean }) {
  const v = Number(value) || 0;
  return <span className={cx('num whitespace-nowrap', colored && (v < 0 ? 'text-bad' : v > 0 ? 'text-ok' : 'text-muted'), className)}>{money(v, symbol)}</span>;
}

/** Underline tabs (default) or a compact segmented control. */
export function Tabs<T extends string>({ value, onChange, tabs, className, variant = 'underline' }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; className?: string; variant?: 'underline' | 'segmented' }) {
  if (variant === 'segmented') {
    return (
      <div className={cx('inline-flex rounded-md bg-surface-3 p-0.5', className)} role="tablist">
        {tabs.map(t => (
          <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
            className={cx('h-7 rounded-[5px] px-3 text-[13px] font-medium transition', value === t.value ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-muted hover:text-ink')}>
            {t.label}{t.count !== undefined && <span className="ml-1.5 text-[12px] text-muted">{t.count}</span>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={cx('thin-scroll flex max-w-full gap-5 overflow-x-auto border-b border-line', className)} role="tablist">
      {tabs.map(t => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('-mb-px whitespace-nowrap border-b-2 pb-2 pt-1 text-[14px] transition-colors', value === t.value ? 'border-brand font-semibold text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded bg-surface-3 px-1.5 text-[12px] font-medium text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface px-1.5 py-px font-mono text-[11px] text-muted">{children}</kbd>;
}

export function KeyVal({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: number }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3 text-[14px]', cols === 3 ? 'sm:grid-cols-3' : cols === 1 ? '' : 'sm:grid-cols-2')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[12px] text-muted">{k}</dt>
          <dd className="mt-0.5 truncate text-ink">{v || <span className="text-faint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

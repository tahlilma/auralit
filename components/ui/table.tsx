'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CalendarRange, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Badge, cx, Input, Select } from './primitives';
import { date as fmtDate, dateTime, isoOf, money, num, todayISO } from '@/lib/format';

export type Col<T = any> = {
  key: string;
  label: ReactNode;
  type?: 'money' | 'number' | 'date' | 'datetime' | 'badge' | 'color' | 'image' | 'bool' | 'multiline' | 'text' | 'pct';
  render?: (row: T, i: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
  sortable?: boolean;
  total?: boolean;
  className?: string;
};

export function cell(type: Col['type'], v: any): ReactNode {
  if (v === null || v === undefined || v === '') return type === 'money' || type === 'number' ? <span className="text-muted">—</span> : '';
  switch (type) {
    case 'money': return <span className={cx('num', Number(v) < 0 && 'text-bad')}>{money(v, false)}</span>;
    case 'number': return <span className="num">{num(v)}</span>;
    case 'pct': return <span className="num">{num(v)}%</span>;
    case 'date': return <span className="whitespace-nowrap">{fmtDate(v)}</span>;
    case 'datetime': return <span className="whitespace-nowrap text-muted">{dateTime(v)}</span>;
    case 'badge': return <Badge>{String(v)}</Badge>;
    case 'bool': return Number(v) ? <Badge tone="green">Yes</Badge> : <Badge tone="gray">No</Badge>;
    case 'color': return <span className="inline-flex items-center gap-2"><span className="size-4 rounded border border-line" style={{ background: v }} /> <span className="font-mono text-xs">{v}</span></span>;
    case 'image': return v ? <img src={v} alt="" className="size-9 rounded-md border border-line object-cover" /> : <span className="inline-block size-9 rounded-md bg-surface-3" />;
    case 'multiline': return <span className="whitespace-pre-line text-[13px]">{v}</span>;
    default: return String(v);
  }
}

export function DataTable<T extends Record<string, any>>({
  columns, rows, loading, sort, onSort, totals, onRowClick, rowKey = 'id', empty, selectable, selected, onSelect, dense, stickyHead = true, footer, rowClass,
}: {
  columns: Col<T>[]; rows: T[]; loading?: boolean; sort?: { key: string; dir: 'asc' | 'desc' }; onSort?: (s: { key: string; dir: 'asc' | 'desc' }) => void;
  totals?: Record<string, any> | boolean; onRowClick?: (r: T) => void; rowKey?: string; empty?: ReactNode; selectable?: boolean; selected?: Set<any>;
  onSelect?: (s: Set<any>) => void; dense?: boolean; stickyHead?: boolean; footer?: ReactNode; rowClass?: (r: T) => string | undefined;
}) {
  const right = (c: Col) => c.align ? c.align === 'right' : c.type === 'money' || c.type === 'number' || c.type === 'pct';
  const computedTotals: Record<string, number> | null = totals === true
    ? Object.fromEntries(columns.filter(c => c.total ?? (c.type === 'money')).map(c => [c.key, rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)]))
    : (totals as Record<string, number>) || null;
  const allSel = selectable && rows.length > 0 && rows.every(r => selected?.has(r[rowKey]));
  const py = dense ? 'py-1.5' : 'py-2.5';
  return (
    <div className="thin-scroll relative overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[13.5px]">
        <thead className={cx(stickyHead && 'sticky top-0 z-10')}>
          <tr>
            {selectable && (
              <th className="w-9 border-b border-line bg-surface-2 px-3 py-2"><input type="checkbox" className="accent-[var(--brand)]" checked={!!allSel} onChange={() => onSelect?.(allSel ? new Set() : new Set(rows.map(r => r[rowKey])))} /></th>
            )}
            {columns.map(c => {
              const active = sort?.key === c.key;
              const canSort = onSort && c.sortable !== false && !c.render;
              return (
                <th key={c.key} style={{ width: c.width }} className={cx('whitespace-nowrap border-b border-line bg-surface-2 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted', right(c) ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}>
                  {canSort ? (
                    <button type="button" className={cx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')} onClick={() => onSort!({ key: c.key, dir: active && sort!.dir === 'asc' ? 'desc' : 'asc' })}>
                      {c.label}{active && (sort!.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && !rows.length ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>{selectable && <td className="border-b border-line px-3 py-3" />}{columns.map(c => <td key={c.key} className="border-b border-line px-3 py-3"><div className="h-3.5 animate-pulse rounded bg-surface-3" style={{ width: `${40 + ((i * 17 + c.key.length * 7) % 50)}%` }} /></td>)}</tr>
            ))
          ) : !rows.length ? (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)}>{empty ?? <div className="py-12 text-center text-sm text-muted">No records found</div>}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cx('group transition-colors', onRowClick && 'cursor-pointer', selected?.has(r[rowKey]) ? 'bg-brand-soft/60' : 'hover:bg-surface-2', loading && 'opacity-60', rowClass?.(r))}>
              {selectable && (
                <td className={cx('border-b border-line px-3', py)} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" className="accent-[var(--brand)]" checked={!!selected?.has(r[rowKey])} onChange={() => { const s = new Set(selected); if (s.has(r[rowKey])) s.delete(r[rowKey]); else s.add(r[rowKey]); onSelect?.(s); }} />
                </td>
              )}
              {columns.map(c => (
                <td key={c.key} className={cx('border-b border-line px-3 align-middle text-ink', py, right(c) ? 'text-right' : c.align === 'center' ? 'text-center' : '', c.className)}>
                  {c.render ? c.render(r, i) : cell(c.type, r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {computedTotals && rows.length > 0 && (
          <tfoot>
            <tr className="bg-surface-2 font-semibold">
              {selectable && <td className="border-t border-line-strong px-3 py-2.5" />}
              {columns.map((c, i) => (
                <td key={c.key} className={cx('border-t border-line-strong px-3 py-2.5', right(c) && 'text-right')}>
                  {c.key in computedTotals ? cell(c.type === 'number' ? 'number' : 'money', computedTotals[c.key]) : i === 0 ? <span className="text-xs uppercase tracking-wide text-muted">Total</span> : null}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {footer}
    </div>
  );
}

export function Pager({ page, size, total, onPage, onSize }: { page: number; size: number; total: number; onPage: (p: number) => void; onSize?: (s: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (page - 1) * size + 1 : 0, to = Math.min(total, page * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-muted no-print">
      <span>{from}–{to} of {num(total)}</span>
      <div className="flex items-center gap-2">
        {onSize && (
          <Select inputSize="sm" className="w-auto" value={size} onChange={e => onSize(Number(e.target.value))}>
            {[10, 25, 50, 100, 250].map(s => <option key={s} value={s}>{s} / page</option>)}
          </Select>
        )}
        <button type="button" className="rounded-lg border border-line p-1.5 hover:bg-surface-3 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
        <span className="num min-w-16 text-center text-ink">{page} / {pages}</span>
        <button type="button" className="rounded-lg border border-line p-1.5 hover:bg-surface-3 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></button>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => { if (v !== value) onChange(v); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input autoFocus={autoFocus} value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} className="pl-8 pr-7" />
      {v && <button type="button" onClick={() => { setV(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label="Clear search"><X className="size-3.5" /></button>}
    </div>
  );
}

const PRESETS: [string, () => [string, string]][] = [
  ['Today', () => [todayISO(), todayISO()]],
  ['Yesterday', () => { const d = new Date(); d.setDate(d.getDate() - 1); return [isoOf(d), isoOf(d)]; }],
  ['Last 7 days', () => { const d = new Date(); d.setDate(d.getDate() - 6); return [isoOf(d), todayISO()]; }],
  ['This month', () => [todayISO().slice(0, 8) + '01', todayISO()]],
  ['Last month', () => { const d = new Date(); const a = new Date(d.getFullYear(), d.getMonth() - 1, 1), b = new Date(d.getFullYear(), d.getMonth(), 0); return [isoOf(a), isoOf(b)]; }],
  ['Last 30 days', () => { const d = new Date(); d.setDate(d.getDate() - 29); return [isoOf(d), todayISO()]; }],
  ['This year', () => [`${new Date().getFullYear()}-01-01`, todayISO()]],
  ['All time', () => ['', '']],
];

export function DateRange({ from, to, onChange, className }: { from: string; to: string; onChange: (from: string, to: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const label = PRESETS.find(([, f]) => { const [a, b] = f(); return a === from && b === to; })?.[0] ?? (from || to ? `${fmtDate(from) || '…'} – ${fmtDate(to) || '…'}` : 'All time');
  return (
    <div className={cx('relative', className)}>
      <button type="button" onClick={() => setOpen(o => !o)} className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm hover:bg-surface-2">
        <CalendarRange className="size-4 text-muted" /><span className="whitespace-nowrap">{label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-line bg-surface p-3 shadow-pop anim-pop">
            <div className="grid grid-cols-2 gap-1">
              {PRESETS.map(([l, f]) => (
                <button key={l} type="button" onClick={() => { const [a, b] = f(); onChange(a, b); setOpen(false); }} className={cx('rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-3', label === l && 'bg-brand-soft text-brand')}>{l}</button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
              <label className="text-xs text-muted">From<Input type="date" inputSize="sm" value={from} onChange={e => onChange(e.target.value, to)} className="mt-1" /></label>
              <label className="text-xs text-muted">To<Input type="date" inputSize="sm" value={to} onChange={e => onChange(from, e.target.value)} className="mt-1" /></label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

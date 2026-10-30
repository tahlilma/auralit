'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Search, X } from 'lucide-react';
import { Badge, cx, Input, Select } from './primitives';
import { date as fmtDate, dateTime, isoOf, money, num, todayISO } from '@/lib/format';

export type Col<T = any> = {
  key: string;
  label: ReactNode;
  type?: 'money' | 'number' | 'date' | 'datetime' | 'badge' | 'color' | 'image' | 'bool' | 'multiline' | 'text' | 'pct' | 'id';
  render?: (row: T, i: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
  sortable?: boolean;
  total?: boolean;
  className?: string;
};

export function cell(type: Col['type'], v: any): ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-faint">—</span>;
  switch (type) {
    case 'money': return <span className={cx('num', Number(v) < 0 && 'text-bad')}>{money(v, false)}</span>;
    case 'number': return <span className="num">{num(v)}</span>;
    case 'pct': return <span className="num">{num(v)}%</span>;
    case 'date': return <span className="whitespace-nowrap">{fmtDate(v)}</span>;
    case 'datetime': return <span className="whitespace-nowrap text-muted">{dateTime(v)}</span>;
    case 'badge': return <Badge>{String(v)}</Badge>;
    case 'bool': return Number(v) ? <Badge tone="green">Yes</Badge> : <Badge tone="gray">No</Badge>;
    case 'color': return <span className="inline-flex items-center gap-2"><span className="size-3.5 rounded-sm border border-line" style={{ background: v }} /> <span className="id text-[12px] text-muted">{v}</span></span>;
    case 'image': return v ? <img src={v} alt="" className="size-9 rounded-md border border-line object-cover" /> : <span className="inline-block size-9 rounded-md bg-surface-2" />;
    case 'multiline': return <span className="whitespace-pre-line text-[13px] text-muted">{v}</span>;
    case 'id': return <span className="id">{String(v)}</span>;
    default: return String(v);
  }
}

export function DataTable<T extends Record<string, any>>({
  columns, rows, loading, sort, onSort, totals, onRowClick, rowKey = 'id', empty, selectable, selected, onSelect, dense, stickyHead = true, footer, rowClass, bleed,
}: {
  columns: Col<T>[]; rows: T[]; loading?: boolean; sort?: { key: string; dir: 'asc' | 'desc' }; onSort?: (s: { key: string; dir: 'asc' | 'desc' }) => void;
  totals?: Record<string, any> | boolean; onRowClick?: (r: T) => void; rowKey?: string; empty?: ReactNode; selectable?: boolean; selected?: Set<any>;
  onSelect?: (s: Set<any>) => void; dense?: boolean; stickyHead?: boolean; footer?: ReactNode; rowClass?: (r: T) => string | undefined;
  /** The table sits straight on the sheet: text on the page edge, rules bleeding 12px past it. */
  bleed?: boolean;
}) {
  const right = (c: Col) => c.align ? c.align === 'right' : c.type === 'money' || c.type === 'number' || c.type === 'pct';
  const computedTotals: Record<string, number> | null = totals === true
    ? Object.fromEntries(columns.filter(c => c.total ?? (c.type === 'money')).map(c => [c.key, rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0)]))
    : (totals as Record<string, number>) || null;
  const allSel = selectable && rows.length > 0 && rows.every(r => selected?.has(r[rowKey]));
  const py = dense ? 'py-2' : 'py-3';
  const edge = bleed ? 'first:pl-3 last:pr-3' : 'first:pl-5 last:pr-5';
  const lead = bleed ? 'pl-3' : 'pl-5';
  return (
    <div className={cx('thin-scroll relative overflow-x-auto', bleed && '-mx-3')}>
      <table className="w-full border-separate border-spacing-0 text-[14px]">
        <thead className={cx(stickyHead && 'sticky top-0 z-10')}>
          <tr>
            {selectable && (
              <th className={cx('w-10 border-b border-line bg-surface py-2.5 pr-2', lead)}><input type="checkbox" aria-label="Select all" className="accent-[var(--accent)]" checked={!!allSel} onChange={() => onSelect?.(allSel ? new Set() : new Set(rows.map(r => r[rowKey])))} /></th>
            )}
            {columns.map(c => {
              const active = sort?.key === c.key;
              const canSort = onSort && c.sortable !== false && !c.render;
              return (
                <th key={c.key} style={{ width: c.width }} className={cx('whitespace-nowrap border-b border-line bg-surface px-3 py-2.5 text-[12.5px] font-normal text-muted', edge, right(c) ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}>
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
              <tr key={i}>{selectable && <td className={cx('border-b border-rule py-3.5', lead)} />}{columns.map(c => <td key={c.key} className={cx('border-b border-rule px-3 py-3.5', edge)}><div className="h-3 rounded bg-surface-3" style={{ width: `${35 + ((i * 17 + c.key.length * 7) % 45)}%` }} /></td>)}</tr>
            ))
          ) : !rows.length ? (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)}>{empty ?? <div className="py-12 text-center text-[14px] text-muted">No records found</div>}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cx('group transition-colors', onRowClick && 'cursor-pointer', selected?.has(r[rowKey]) ? 'bg-surface-3' : onRowClick ? 'hover:bg-surface-2' : '', loading && 'opacity-60', rowClass?.(r))}>
              {selectable && (
                <td className={cx('border-b border-rule pr-2', lead, py)} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" aria-label="Select row" className="accent-[var(--accent)]" checked={!!selected?.has(r[rowKey])} onChange={() => { const s = new Set(selected); if (s.has(r[rowKey])) s.delete(r[rowKey]); else s.add(r[rowKey]); onSelect?.(s); }} />
                </td>
              )}
              {columns.map(c => (
                <td key={c.key} className={cx('border-b border-rule px-3 align-middle text-ink', edge, py, right(c) ? 'text-right' : c.align === 'center' ? 'text-center' : '', c.className)}>
                  {c.render ? c.render(r, i) : cell(c.type, r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {computedTotals && rows.length > 0 && (
          <tfoot>
            <tr className="font-semibold">
              {selectable && <td className={cx('border-t border-line py-3', lead)} />}
              {columns.map((c, i) => (
                <td key={c.key} className={cx('border-t border-line px-3 py-3', edge, right(c) && 'text-right')}>
                  {c.key in computedTotals ? cell(c.type === 'number' ? 'number' : 'money', computedTotals[c.key]) : i === 0 ? <span className="text-[13px] font-medium text-muted">Total</span> : null}
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

export type RowAction = { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; hidden?: boolean };
/** One kebab per row: labelled actions in a small menu, so nobody has to guess what an icon means. */
export function RowMenu({ actions, label = 'Actions', button }: { actions: RowAction[]; label?: string; /** show a labelled "More" button instead of the kebab */ button?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const items = actions.filter(a => !a.hidden);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', key); };
  }, [open]);
  if (!items.length) return null;
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = btn.current!.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < items.length * 38 + 24;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, right: window.innerWidth - r.right, up });
    setOpen(o => !o);
  };
  return (
    <div className="inline-flex" onClick={e => e.stopPropagation()}>
      {button ? (
        <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink transition-colors hover:bg-surface-2">
          {button}<ChevronDown className="size-4 text-muted" />
        </button>
      ) : (
        <button ref={btn} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-ink">
          <MoreHorizontal className="size-4" />
        </button>
      )}
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div role="menu" className="fixed z-[61] min-w-44 rounded-lg border border-line bg-surface p-1 shadow-pop anim-pop"
            style={{ right: pos.right, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
            {items.map(a => (
              <button key={a.label} role="menuitem" type="button" onClick={() => { setOpen(false); a.onClick(); }}
                className={cx('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] transition-colors hover:bg-surface-2', a.danger ? 'text-bad' : 'text-ink')}>
                <span className={cx('flex size-4 items-center justify-center', a.danger ? 'text-bad' : 'text-muted')}>{a.icon}</span>{a.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

export function Pager({ page, size, total, onPage, onSize, flush }: { page: number; size: number; total: number; onPage: (p: number) => void; onSize?: (s: number) => void; flush?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (page - 1) * size + 1 : 0, to = Math.min(total, page * size);
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 py-3 text-[13px] text-muted no-print', flush ? 'px-0' : 'px-5')}>
      <span className="num">{num(from)}–{num(to)} of {num(total)}</span>
      <div className="flex items-center gap-2">
        {onSize && (
          <Select inputSize="sm" className="w-auto" value={size} onChange={e => onSize(Number(e.target.value))} aria-label="Rows per page">
            {[10, 25, 50, 100, 250].map(s => <option key={s} value={s}>{s} per page</option>)}
          </Select>
        )}
        <button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-line-strong bg-surface hover:bg-surface-2 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
        <span className="num min-w-14 text-center text-ink">{page} / {pages}</span>
        <button type="button" className="inline-flex size-8 items-center justify-center rounded-md border border-line-strong bg-surface hover:bg-surface-2 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></button>
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
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <Input autoFocus={autoFocus} value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-9 pr-8" />
      {v && <button type="button" onClick={() => { setV(''); onChange(''); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label="Clear search"><X className="size-3.5" /></button>}
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
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open} className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14px] hover:bg-surface-2">
        <CalendarRange className="size-4 text-muted" /><span className="whitespace-nowrap">{label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-72 rounded-lg border border-line bg-surface p-2 shadow-pop anim-pop">
            <div className="grid grid-cols-2 gap-0.5">
              {PRESETS.map(([l, f]) => (
                <button key={l} type="button" onClick={() => { const [a, b] = f(); onChange(a, b); setOpen(false); }} className={cx('rounded-md px-2.5 py-1.5 text-left text-[13.5px] hover:bg-surface-2', label === l && 'bg-surface-3 font-medium')}>{l}</button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line px-1 pt-3 pb-1">
              <label className="text-[12px] text-muted">From<Input type="date" inputSize="sm" value={from} onChange={e => onChange(e.target.value, to)} className="mt-1" /></label>
              <label className="text-[12px] text-muted">To<Input type="date" inputSize="sm" value={to} onChange={e => onChange(from, e.target.value)} className="mt-1" /></label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

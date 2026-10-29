'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cx } from './primitives';
import { rpc } from '@/lib/client/rpc';

export type Opt = { value: string | number; label: string; hint?: string; grp?: string; [k: string]: any };

type Props = {
  value: string | number | null | undefined;
  onChange: (v: any, opt?: Opt | null) => void;
  options?: Opt[];
  /** async search; called with the typed text */
  load?: (q: string) => Promise<Opt[]>;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** label for the current value when using async load */
  valueLabel?: string;
  autoFocus?: boolean;
  renderOption?: (o: Opt) => ReactNode;
  emptyText?: string;
  footer?: ReactNode;
};

export function Combobox({ value, onChange, options, load, placeholder = 'Select…', disabled, clearable = true, size = 'md', className, valueLabel, autoFocus, renderOption, emptyText = 'No matches', footer }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [async, setAsync] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = useMemo(() => (options ?? async).find(o => String(o.value) === String(value ?? '')) ?? null, [options, async, value]);
  const filtered = useMemo(() => {
    if (load) return async;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = (options ?? []).filter(o => terms.every(t => `${o.label} ${o.hint ?? ''} ${o.grp ?? ''}`.toLowerCase().includes(t)));
    return list.slice(0, 300);
  }, [options, q, load, async]);

  useEffect(() => {
    if (!load || !open) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      load(q).then(r => { if (alive) { setAsync(r); setActive(0); } }).finally(() => alive && setLoading(false));
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, load]);

  useEffect(() => { if (autoFocus) { setTimeout(() => btn.current?.focus(), 30); } }, [autoFocus]);

  const show = () => {
    if (disabled) return;
    setRect(btn.current?.getBoundingClientRect() ?? null);
    setOpen(true);
    setQ('');
    setActive(Math.max(0, filtered.findIndex(o => String(o.value) === String(value ?? ''))));
    setTimeout(() => input.current?.focus(), 10);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!listRef.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const reflow = () => setRect(btn.current?.getBoundingClientRect() ?? null);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', reflow, true);
    window.addEventListener('resize', reflow);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', reflow, true); window.removeEventListener('resize', reflow); };
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (o: Opt | null) => {
    onChange(o ? o.value : null, o);
    setOpen(false);
    btn.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
    else if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const label = selected?.label ?? valueLabel ?? '';
  const h = size === 'sm' ? 'h-8 text-[13px]' : size === 'lg' ? 'h-11 text-base' : 'h-9 text-sm';
  const below = rect ? window.innerHeight - rect.bottom > 300 || rect.top < 300 : true;

  let lastGrp: string | undefined;
  return (
    <>
      <button ref={btn} type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey))) { e.preventDefault(); show(); if (e.key.length === 1) setTimeout(() => setQ(e.key), 15); } }}
        className={cx('group flex w-full min-w-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left outline-none transition focus:border-brand focus:ring-4 focus:ring-[var(--ring)] disabled:bg-surface-3 disabled:text-muted', h, className)}>
        <span className={cx('flex-1 truncate', !label && 'text-muted/70')}>{label || placeholder}</span>
        {clearable && value !== null && value !== undefined && value !== '' && !disabled && (
          <span role="button" tabIndex={-1} aria-label="Clear" onClick={e => { e.stopPropagation(); pick(null); }} className="rounded p-0.5 text-muted opacity-0 hover:bg-surface-3 hover:text-ink group-hover:opacity-100"><X className="size-3.5" /></span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>
      {open && rect && createPortal(
        <div ref={listRef} className="fixed z-[80] overflow-hidden rounded-xl border border-line bg-surface shadow-pop anim-pop"
          style={{ left: rect.left, width: Math.max(rect.width, 260), ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }) }}>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 text-muted" />
            <input ref={input} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder="Type to search…" className="h-10 w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="thin-scroll max-h-72 overflow-y-auto p-1">
            {loading && !filtered.length ? <div className="px-3 py-6 text-center text-xs text-muted">Searching…</div>
              : !filtered.length ? <div className="px-3 py-6 text-center text-xs text-muted">{emptyText}</div>
              : filtered.map((o, i) => {
                const grpHead = o.grp && o.grp !== lastGrp ? (lastGrp = o.grp) : null;
                return (
                  <div key={`${o.value}-${i}`}>
                    {grpHead && <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{grpHead}</div>}
                    <button type="button" data-i={i} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                      className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', i === active ? 'bg-brand-soft text-ink' : 'text-ink-2')}>
                      <span className="min-w-0 flex-1">{renderOption ? renderOption(o) : <><span className="block truncate">{o.label}</span>{o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}</>}</span>
                      {String(o.value) === String(value ?? '') && <Check className="size-4 text-brand" />}
                    </button>
                  </div>
                );
              })}
          </div>
          {footer && <div className="border-t border-line p-1">{footer}</div>}
        </div>,
        document.body,
      )}
    </>
  );
}

// ───────── Lookup cache ─────────
const cache = new Map<string, Promise<Opt[]>>();
export function invalidateLookups(key?: string) {
  if (!key) cache.clear();
  else for (const k of [...cache.keys()]) if (k.startsWith(`${key}|`)) cache.delete(k);
}
export function loadLookup(key: string, parent?: string | number | null): Promise<Opt[]> {
  const k = `${key}|${parent ?? ''}`;
  if (!cache.has(k)) {
    const p = rpc('crud.lookup', key, parent ?? null).then(r => r as Opt[]).catch(e => { cache.delete(k); throw e; });
    cache.set(k, p);
  }
  return cache.get(k)!;
}

export function useLookup(key: string | undefined, parent?: string | number | null, skip = false) {
  const [opts, setOpts] = useState<Opt[]>([]);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!key || skip) return;
    let alive = true;
    loadLookup(key, parent).then(o => alive && setOpts(o)).catch(() => alive && setOpts([]));
    return () => { alive = false; };
  }, [key, parent, skip, n]);
  return { options: opts, refresh: () => { if (key) invalidateLookups(key); setN(x => x + 1); } };
}

export function RefSelect({ refKey, parent, value, onChange, placeholder, disabled, size, className, footer }: { refKey: string; parent?: string | number | null; value: any; onChange: (v: any, o?: Opt | null) => void; placeholder?: string; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string; footer?: ReactNode }) {
  const { options } = useLookup(refKey, parent);
  return <Combobox value={value} onChange={onChange} options={options} placeholder={placeholder} disabled={disabled} size={size} className={className} footer={footer} />;
}

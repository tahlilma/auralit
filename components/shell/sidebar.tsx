'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Search, Star, X } from 'lucide-react';
import { NAV } from '@/lib/nav';
import { cx } from '@/components/ui/primitives';
import { NavIcon } from './icons';
import { useSession } from './session';

const PIN_KEY = 'auralit.pins';
const COLLAPSE_KEY = 'auralit.sidebar';

function readJSON<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const path = usePathname();
  const { can, company } = useSession();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pins, setPins] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setPins(readJSON(PIN_KEY, [])); setCollapsed(readJSON(COLLAPSE_KEY, false)); }, []);
  const groups = useMemo(() => NAV.filter(g => can(g.module)).map(g => ({ ...g, items: g.items.filter(i => can(i.module ?? g.module, i.action ?? 'read')) })).filter(g => g.items.length), [can]);
  const isActive = (href: string) => path === href || (href !== '/' && path.startsWith(href + '/') && !groups.some(g => g.items.some(i => i.href !== href && i.href.startsWith(href) && path.startsWith(i.href))));
  useEffect(() => {
    const g = groups.find(g => g.items.some(i => isActive(i.href)));
    if (g) setOpen(o => ({ ...o, [g.label]: true }));
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const togglePin = (href: string) => {
    const next = pins.includes(href) ? pins.filter(p => p !== href) : [...pins, href];
    setPins(next);
    try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const setCol = (v: boolean) => { setCollapsed(v); try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(v)); } catch { /* ignore */ } };

  const term = q.trim().toLowerCase();
  const filtered = term ? groups.map(g => ({ ...g, items: g.items.filter(i => `${i.label} ${i.keywords ?? ''} ${g.label}`.toLowerCase().includes(term)) })).filter(g => g.items.length) : groups;
  const allItems = groups.flatMap(g => g.items.map(i => ({ ...i, group: g.label })));
  const pinned = pins.map(p => allItems.find(i => i.href === p)).filter(Boolean) as typeof allItems;

  const link = (href: string, label: string, opts: { icon?: React.ReactNode; pinnable?: boolean; indent?: boolean } = {}) => (
    <div key={href} className="group/item relative">
      <Link href={href} className={cx('flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors', opts.indent && 'pl-9', isActive(href) ? 'bg-brand text-brand-ink font-medium' : 'text-side-ink/85 hover:bg-side-hover hover:text-side-ink')}>
        {opts.icon}<span className="truncate">{label}</span>
      </Link>
      {opts.pinnable && (
        <button type="button" onClick={() => togglePin(href)} aria-label={pins.includes(href) ? 'Unpin' : 'Pin to top'} title={pins.includes(href) ? 'Unpin' : 'Pin to top'}
          className={cx('absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 transition', pins.includes(href) ? 'text-amber-400' : 'text-side-muted opacity-0 group-hover/item:opacity-100 hover:text-side-ink')}>
          <Star className="size-3" fill={pins.includes(href) ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );

  if (collapsed) {
    return (
      <aside className="no-print sticky top-0 hidden h-screen w-[60px] shrink-0 flex-col items-center gap-1 bg-side py-3 lg:flex">
        <button onClick={() => setCol(false)} className="mb-2 rounded-lg p-2 text-side-muted hover:bg-side-hover hover:text-side-ink" aria-label="Expand sidebar"><PanelLeftOpen className="size-5" /></button>
        <Link href="/" title="Dashboard" className={cx('rounded-lg p-2', path === '/' ? 'bg-brand text-brand-ink' : 'text-side-ink/80 hover:bg-side-hover')}><LayoutDashboard className="size-5" /></Link>
        {groups.map(g => (
          <Link key={g.label} href={g.items[0].href} title={g.label} className={cx('rounded-lg p-2', g.items.some(i => isActive(i.href)) ? 'bg-brand text-brand-ink' : 'text-side-ink/80 hover:bg-side-hover')}>
            <NavIcon name={g.icon} className="size-5" />
          </Link>
        ))}
      </aside>
    );
  }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside className={cx('no-print fixed inset-y-0 left-0 z-50 flex w-[264px] shrink-0 flex-col bg-side text-side-ink transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#c27a43] to-[#6b3814] text-[15px] font-bold text-white shadow-inner">
            {company?.logo ? <img src={company.logo} alt="" className="size-full object-cover" /> : (company?.name ?? 'A').slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold leading-tight">{company?.name ?? 'Auralit'}</p>
            <p className="truncate text-[11px] text-side-muted">Business workspace</p>
          </div>
          <button onClick={() => setCol(true)} className="hidden rounded-lg p-1.5 text-side-muted hover:bg-side-hover hover:text-side-ink lg:block" aria-label="Collapse sidebar"><PanelLeftClose className="size-4" /></button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-side-muted hover:bg-side-hover lg:hidden" aria-label="Close menu"><X className="size-4" /></button>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-side-muted" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a page…" className="h-8 w-full rounded-lg border border-white/5 bg-white/5 pl-8 pr-2 text-[13px] text-side-ink outline-none placeholder:text-side-muted focus:border-white/15 focus:bg-white/10" />
          </div>
        </div>
        <nav className="side-scroll flex-1 overflow-y-auto px-2 pb-6">
          {!term && link('/', 'Dashboard', { icon: <LayoutDashboard className="size-4 opacity-80" /> })}
          {!term && pinned.length > 0 && (
            <div className="mt-3">
              <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-side-muted">Pinned</p>
              {pinned.map(i => link(i.href, i.label, { icon: <Star className="size-3.5 text-amber-400" fill="currentColor" />, pinnable: true }))}
            </div>
          )}
          <div className="mt-3 space-y-0.5">
            {filtered.map(g => {
              const isOpen = term ? true : open[g.label];
              const hasActive = g.items.some(i => isActive(i.href));
              return (
                <div key={g.label}>
                  <button type="button" onClick={() => setOpen(o => ({ ...o, [g.label]: !o[g.label] }))}
                    className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors hover:bg-side-hover', hasActive ? 'text-side-ink' : 'text-side-ink/80')}>
                    <NavIcon name={g.icon} className={cx('size-4', hasActive ? 'text-[#e3a06c]' : 'opacity-75')} />
                    <span className="flex-1 truncate text-left font-medium">{g.label}</span>
                    <ChevronRight className={cx('size-3.5 text-side-muted transition-transform', isOpen && 'rotate-90')} />
                  </button>
                  {isOpen && <div className="mb-1 mt-0.5 space-y-px">{g.items.map(i => link(i.href, i.label, { indent: true, pinnable: true }))}</div>}
                </div>
              );
            })}
            {!filtered.length && <p className="px-3 py-6 text-center text-xs text-side-muted">No page matches “{q}”</p>}
          </div>
        </nav>
      </aside>
    </>
  );
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronDown, ChevronRight, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Search, Star, X } from 'lucide-react';
import { NAV } from '@/lib/nav';
import { cx } from '@/components/ui/primitives';
import { NavIcon } from './icons';
import { Mark, Wordmark } from './brand';
import { useSession } from './session';

const PIN_KEY = 'auralit.pins';
const COLLAPSE_KEY = 'auralit.sidebar';

function readJSON<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const path = usePathname();
  const { can, company, me } = useSession();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pins, setPins] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);

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

  const row = 'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors';
  const link = (href: string, label: string, opts: { icon?: React.ReactNode; pinnable?: boolean; indent?: boolean } = {}) => (
    <div key={href} className="group/item relative">
      <Link href={href} aria-current={isActive(href) ? 'page' : undefined}
        className={cx(row, opts.indent && 'pl-[34px]', isActive(href) ? 'bg-surface-3 font-medium text-ink' : 'text-ink-2 hover:bg-surface-3/70 hover:text-ink')}>
        {opts.icon}<span className="truncate">{label}</span>
      </Link>
      {opts.pinnable && (
        <button type="button" onClick={() => togglePin(href)} aria-label={pins.includes(href) ? `Unpin ${label}` : `Pin ${label} to the top`} title={pins.includes(href) ? 'Unpin' : 'Pin to the top'}
          className={cx('absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 transition', pins.includes(href) ? 'text-ink-2' : 'text-faint opacity-0 hover:text-ink group-hover/item:opacity-100 focus:opacity-100')}>
          <Star className="size-3.5" fill={pins.includes(href) ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );

  if (collapsed) {
    return (
      <aside className="no-print hidden h-dvh w-14 shrink-0 flex-col items-center gap-1 py-3 lg:flex">
        <Link href="/" aria-label="Auralit overview" className="mb-3 flex size-9 items-center justify-center"><Mark /></Link>
        <Link href="/" title="Overview" aria-label="Overview" className={cx('rounded-md p-2', path === '/' ? 'bg-surface-3 text-ink' : 'text-muted hover:bg-surface-3 hover:text-ink')}><LayoutDashboard className="size-[18px]" /></Link>
        <div className="side-scroll flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {groups.map(g => (
            <Link key={g.label} href={g.items[0].href} title={g.label} aria-label={g.label} className={cx('rounded-md p-2', g.items.some(i => isActive(i.href)) ? 'bg-surface-3 text-ink' : 'text-muted hover:bg-surface-3 hover:text-ink')}>
              <NavIcon name={g.icon} className="size-[18px]" />
            </Link>
          ))}
        </div>
        <button onClick={() => setCol(false)} className="mt-2 rounded-md p-2 text-muted hover:bg-surface-3 hover:text-ink" aria-label="Expand sidebar" title="Expand sidebar"><PanelLeftOpen className="size-[18px]" /></button>
      </aside>
    );
  }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={onClose} />}
      <aside className={cx('no-print fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col bg-frame transition-transform lg:static lg:z-auto lg:h-dvh lg:w-[228px] lg:translate-x-0', mobileOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full')}>
        <div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-2">
          <Link href="/" aria-label="Auralit overview"><Wordmark /></Link>
          <button onClick={() => setCol(true)} className="hidden rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-ink lg:block" aria-label="Collapse sidebar" title="Collapse sidebar"><PanelLeftClose className="size-4" /></button>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-3 lg:hidden" aria-label="Close menu"><X className="size-4" /></button>
        </div>

        {/* scope: the business and branch this session works in */}
        <div className="relative px-2">
          <button type="button" onClick={() => setScopeOpen(o => !o)} aria-expanded={scopeOpen}
            className="flex w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2 text-left hover:border-line-strong">
            <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-3 text-[12px] font-semibold text-ink-2">
              {company?.logo ? <img src={company.logo} alt="" className="size-full object-cover" /> : (company?.name ?? 'B').split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium leading-tight text-ink">{company?.name ?? 'Your business'}</span>
              <span className="block truncate text-[12px] leading-tight text-muted">{me.branch ?? 'Main Branch'}</span>
            </span>
            <ChevronDown className="size-4 text-muted" />
          </button>
          {scopeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setScopeOpen(false)} />
              <div className="absolute inset-x-2 top-full z-50 mt-1 rounded-lg border border-line bg-surface p-1 shadow-pop anim-pop">
                {[['Company setup', '/settings/company'], ['Branches', '/data/branch'], ['Local settings', '/settings/local']].filter(([, h]) => can('setting')).map(([l, h]) => (
                  <Link key={h} href={h} onClick={() => setScopeOpen(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] text-ink hover:bg-surface-2"><Building2 className="size-4 text-muted" />{l}</Link>
                ))}
                {!can('setting') && <p className="px-2.5 py-2 text-[13px] text-muted">Signed in to {me.branch}</p>}
              </div>
            </>
          )}
        </div>

        <div className="px-2 pb-1 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a page" aria-label="Find a page"
              className="h-8 w-full rounded-md border border-transparent bg-surface-3/60 pl-8 pr-2 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong focus:bg-surface" />
          </div>
        </div>

        <nav className="side-scroll flex-1 overflow-y-auto px-2 pb-6 pt-2" aria-label="Main">
          {!term && link('/', 'Overview', { icon: <LayoutDashboard className={cx('size-4', path === '/' ? 'text-ink' : 'text-muted')} /> })}
          {!term && pinned.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 px-2.5 text-[12px] text-muted">Pinned</p>
              {pinned.map(i => link(i.href, i.label, { icon: <Star className="size-3.5 text-muted" fill="currentColor" />, pinnable: true }))}
            </div>
          )}
          <div className="mt-4 space-y-px">
            {!term && <p className="mb-1 px-2.5 text-[12px] text-muted">Workspace</p>}
            {filtered.map(g => {
              const isOpen = term ? true : open[g.label];
              const hasActive = g.items.some(i => isActive(i.href));
              return (
                <div key={g.label}>
                  <button type="button" onClick={() => setOpen(o => ({ ...o, [g.label]: !o[g.label] }))} aria-expanded={!!isOpen}
                    className={cx(row, 'w-full', hasActive ? 'text-ink' : 'text-ink-2 hover:bg-surface-3/70 hover:text-ink')}>
                    <NavIcon name={g.icon} className={cx('size-4', hasActive ? 'text-ink' : 'text-muted')} />
                    <span className={cx('flex-1 truncate text-left', hasActive && 'font-medium')}>{g.label}</span>
                    <ChevronRight className={cx('size-3.5 text-faint transition-transform', isOpen && 'rotate-90')} />
                  </button>
                  {isOpen && <div className="mb-1.5 mt-px space-y-px">{g.items.map(i => link(i.href, i.label, { indent: true, pinnable: true }))}</div>}
                </div>
              );
            })}
            {!filtered.length && <p className="px-3 py-6 text-center text-[13px] text-muted">No page matches “{q}”</p>}
          </div>
        </nav>
      </aside>
    </>
  );
}

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CornerDownLeft, FileText, Hash, LogOut, Menu, MessageCircle, Moon, Package, Plus, Receipt, Search, Send, Sun, User, Users } from 'lucide-react';
import { NAV, QUICK_ACTIONS } from '@/lib/nav';
import { rpc, useRpc } from '@/lib/client/rpc';
import { date, dateTime, KIND_LABEL, money, relative } from '@/lib/format';
import { cx, Kbd } from '@/components/ui/primitives';
import { Drawer, Modal } from '@/components/ui/overlay';
import { NavIcon } from './icons';
import { Mark } from './brand';
import { useSession } from './session';

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const toggle = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
    try { localStorage.setItem('auralit.theme', d ? 'dark' : 'light'); } catch { /* ignore */ }
  };
  return { dark, toggle };
}

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className={cx('absolute right-0 top-full z-50 mt-1.5 rounded-lg border border-line bg-surface shadow-pop anim-pop', className)}>{children}</div>
    </>
  );
}

const iconBtn = 'relative inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-ink';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { me, can } = useSession();
  const { dark, toggle } = useTheme();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [quick, setQuick] = useState(false);
  const [notif, setNotif] = useState(false);
  const [chat, setChat] = useState(false);
  const [menu, setMenu] = useState(false);
  const [unread, setUnread] = useState(0);
  const [attention, setAttention] = useState(0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
      if (e.key === 'F2' && can('sales', 'write')) { e.preventDefault(); router.push('/doc/sale/new'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [router, can]);
  useEffect(() => {
    const poll = () => {
      rpc('admin.unreadCount').then(setUnread).catch(() => {});
      rpc('admin.attentionCount').then(c => setAttention(c.cheques + c.followups + c.lowStock + c.leaves)).catch(() => {});
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, []);

  const logout = async () => { await fetch('/api/auth', { method: 'DELETE' }); window.location.href = '/login'; };
  const initials = (me.name ?? '?').split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="no-print grid h-12 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 px-3 lg:grid-cols-[1fr_minmax(0,548px)_1fr] lg:pl-0 lg:pr-3">
      <div className="flex items-center gap-2">
        <button onClick={onMenu} className={cx(iconBtn, 'lg:hidden')} aria-label="Open menu"><Menu className="size-5" /></button>
        <Link href="/" className="lg:hidden" aria-label="Auralit overview"><Mark /></Link>
      </div>
      <button onClick={() => setPalette(true)} className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-line bg-surface px-3 text-[13.5px] text-faint transition-colors hover:border-line-strong">
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left"><span className="sm:hidden">Search</span><span className="hidden sm:inline">Search invoices, products, serial numbers, customers</span></span>
        <span className="hidden gap-1 sm:flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="flex items-center justify-end gap-0.5">
        <div className="relative">
          <button onClick={() => setQuick(o => !o)} aria-haspopup="menu" aria-expanded={quick}
            className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[13.5px] font-medium text-ink hover:bg-surface-2">
            <Plus className="size-4" /><span className="hidden sm:inline">New</span>
          </button>
          <Popover open={quick} onClose={() => setQuick(false)} className="w-[320px] p-1.5">
            <div className="grid grid-cols-2 gap-px">
              {QUICK_ACTIONS.filter(a => can(a.module, 'read')).map(a => (
                <Link key={a.href} href={a.href} onClick={() => setQuick(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] text-ink hover:bg-surface-2">
                  <NavIcon name={a.icon} className="size-4 text-muted" />{a.label}
                </Link>
              ))}
            </div>
            <p className="mt-1 border-t border-line px-2.5 pb-1 pt-2 text-[12px] text-muted">Press <Kbd>F2</Kbd> anywhere to start a new sale.</p>
          </Popover>
        </div>
        <button onClick={() => setNotif(true)} className={iconBtn} aria-label={attention ? `Notifications, ${attention} need attention` : 'Notifications'}>
          <Bell className="size-[18px]" />{attention > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[11px] font-semibold leading-none text-white">{attention > 99 ? '99+' : attention}</span>}
        </button>
        <button onClick={() => setChat(true)} className={iconBtn} aria-label={unread ? `Team chat, ${unread} unread` : 'Team chat'}>
          <MessageCircle className="size-[18px]" />{unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[11px] font-semibold leading-none text-white">{unread}</span>}
        </button>
        <div className="relative ml-1">
          <button onClick={() => setMenu(o => !o)} aria-haspopup="menu" aria-expanded={menu} aria-label="Account" className="flex items-center rounded-full p-0.5 hover:bg-surface-3">
            {me.image ? <img src={me.image} alt="" className="size-7 rounded-full object-cover" /> : <span className="flex size-7 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink-2">{initials}</span>}
          </button>
          <Popover open={menu} onClose={() => setMenu(false)} className="w-60 p-1">
            <div className="px-2.5 pb-2 pt-1.5">
              <p className="truncate text-[14px] font-medium text-ink">{me.name}</p>
              <p className="truncate text-[12.5px] text-muted">{me.email}</p>
              <p className="truncate text-[12.5px] text-muted">{me.role} · {me.branch}</p>
            </div>
            <div className="border-t border-line pt-1">
              <Link href="/profile" onClick={() => setMenu(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] hover:bg-surface-2"><User className="size-4 text-muted" /> Profile and password</Link>
              <button onClick={toggle} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] hover:bg-surface-2">{dark ? <Sun className="size-4 text-muted" /> : <Moon className="size-4 text-muted" />} {dark ? 'Light theme' : 'Dark theme'}</button>
              <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] text-bad hover:bg-bad-soft"><LogOut className="size-4" /> Sign out</button>
            </div>
          </Popover>
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Notifications open={notif} onClose={() => setNotif(false)} />
      <Chat open={chat} onClose={() => { setChat(false); rpc('admin.unreadCount').then(setUnread).catch(() => {}); }} />
    </header>
  );
}

type Hit = { key: string; label: string; hint?: string; href: string; icon: React.ReactNode; section: string; mono?: boolean };

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Awaited<ReturnType<typeof rpcSearch>> | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setRes(null); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(() => rpcSearch(q).then(setRes).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    const pages: Hit[] = NAV.filter(g => can(g.module)).flatMap(g => g.items.filter(i => can(i.module ?? g.module, i.action ?? 'read')).map(i => ({ key: i.href, label: i.label, hint: g.label, href: i.href, icon: <NavIcon name={g.icon} className="size-4" />, section: 'Pages', kw: `${i.label} ${g.label} ${i.keywords ?? ''}`.toLowerCase() })))
      .filter(p => !term || term.split(/\s+/).every(t => p.kw.includes(t))).slice(0, term ? 8 : 6);
    const out: Hit[] = [...pages];
    if (res) {
      out.push(...res.docs.map(d => ({ key: `d${d.id}`, label: d.no, mono: true, hint: `${KIND_LABEL[d.kind] ?? d.kind} · ${date(d.date)} · ${d.party ?? ''} · ${money(d.total)}`, href: `/doc/${d.kind}/${d.id}`, icon: <FileText className="size-4" />, section: 'Documents' })));
      out.push(...res.vouchers.map(v => ({ key: `v${v.id}`, label: v.no, mono: true, hint: `${KIND_LABEL[v.type] ?? v.type} · ${date(v.date)} · ${money(v.total)}`, href: `/vouchers/${v.type}/${v.id}`, icon: <Receipt className="size-4" />, section: 'Vouchers' })));
      out.push(...res.products.map(p => ({ key: `p${p.id}`, label: p.name, hint: `${p.code} · ${money(p.price)} · ${p.stock} in stock`, href: `/data/product?view=${p.id}`, icon: <Package className="size-4" />, section: 'Products' })));
      out.push(...res.serials.map(s => ({ key: `s${s.id}`, label: s.serial, mono: true, hint: `${s.product} · ${s.status}${s.sale_no ? ` · sold on ${s.sale_no}` : ''}`, href: s.sale_doc_id ? `/doc/sale/${s.sale_doc_id}` : s.purchase_doc_id ? `/doc/purchase/${s.purchase_doc_id}` : `/data/product?view=${s.product_id}`, icon: <Hash className="size-4" />, section: 'Serial numbers' })));
      out.push(...res.parties.map(p => ({ key: `${p.type}${p.id}`, label: p.name, hint: `${p.code} · ${p.mobile ?? ''}`, href: `/data/${p.type}?view=${p.id}`, icon: <Users className="size-4" />, section: p.type === 'customer' ? 'Customers' : 'Suppliers' })));
    }
    return out;
  }, [q, res, can]);

  const go = (h: Hit) => { router.push(h.href); onClose(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && hits[active]) go(hits[active]);
  };
  let last = '';
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="-mx-5 -my-4">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 text-muted" />
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder="Invoice number, product code, serial or IMEI, customer, page" aria-label="Search" className="h-14 w-full bg-transparent text-[15px] outline-none" />
          <Kbd>Esc</Kbd>
        </div>
        <div className="thin-scroll max-h-[60vh] overflow-y-auto p-2">
          {hits.map((h, i) => {
            const head = h.section !== last ? (last = h.section) : null;
            return (
              <div key={h.key}>
                {head && <p className="px-3 pb-1 pt-3 text-[12px] text-muted">{head}</p>}
                <button onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={cx('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left', i === active ? 'bg-surface-2' : '')}>
                  <span className="text-muted">{h.icon}</span>
                  <span className="min-w-0 flex-1"><span className={cx('block truncate text-[14px] text-ink', h.mono && 'id')}>{h.label}</span>{h.hint && <span className="block truncate text-[12.5px] text-muted">{h.hint}</span>}</span>
                  {i === active && <CornerDownLeft className="size-4 text-muted" />}
                </button>
              </div>
            );
          })}
          {q.trim().length >= 2 && res && hits.length === 0 && <p className="py-10 text-center text-[14px] text-muted">No results for “{q}”</p>}
        </div>
      </div>
    </Modal>
  );
}
const rpcSearch = (q: string) => rpc('admin.globalSearch', q);

function Notifications({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useRpc(open ? 'admin.notifications' : null, [], [open]);
  const Section = ({ title, children, count }: { title: string; children: React.ReactNode; count: number }) => count ? (
    <div className="mb-6"><p className="mb-2 text-[13px] font-medium text-ink">{title} <span className="ml-1 text-muted">{count}</span></p><div className="divide-y divide-rule rounded-lg border border-line">{children}</div></div>
  ) : null;
  const Row = ({ href, title, sub }: { href: string; title: React.ReactNode; sub?: React.ReactNode }) => (
    <Link href={href} onClick={onClose} className="block px-3 py-2.5 text-[14px] hover:bg-surface-2"><span className="text-ink">{title}</span>{sub && <span className="block text-[12.5px] text-muted">{sub}</span>}</Link>
  );
  const empty = data && !data.cheques.length && !data.followups.length && !data.lowStock.length && !data.leaves.length && !data.todos.length && !data.events.length;
  return (
    <Drawer open={open} onClose={onClose} title="Notifications" subtitle="What needs someone to act" width="max-w-md">
      {!data ? <p className="text-[14px] text-muted">Loading…</p> : (
        <>
          {empty && <p className="mb-6 rounded-lg border border-dashed border-line-strong px-3 py-3 text-[14px] text-muted">Nothing needs attention right now.</p>}
          <Section title="Cheques due" count={data.cheques.length}>{data.cheques.map(c => <Row key={c.id} href="/accounts/cheques" title={`${c.direction === 'in' ? 'Deposit' : 'Pay'} cheque ${c.cheque_no} · ${money(c.amount)}`} sub={`${date(c.cheque_date)} · ${c.party ?? ''}`} />)}</Section>
          <Section title="Follow-ups due" count={data.followups.length}>{data.followups.map(f => <Row key={f.id} href={`/enquiry?open=${f.id}`} title={`${f.customer_name} — ${f.product_name ?? ''}`} sub={`Due ${date(f.next_followup)} · ${f.no}`} />)}</Section>
          <Section title="Below minimum stock" count={data.lowStock.length}>{data.lowStock.map(p => <Row key={p.id} href={`/data/product?view=${p.id}`} title={p.name} sub={`${p.code} · ${p.stock} in stock, minimum ${p.min_stock}`} />)}</Section>
          <Section title="Leave waiting for approval" count={data.leaves.length}>{data.leaves.map(l => <Row key={l.id} href="/data/leave_app" title={l.name} sub={`${date(l.from_date)} to ${date(l.to_date)}`} />)}</Section>
          <Section title="Your to-dos" count={data.todos.length}>{data.todos.map(t => <Row key={t.id} href="/personal/todo" title={t.title} sub={`Due ${date(t.due)}`} />)}</Section>
          <Section title="Upcoming events" count={data.events.length}>{data.events.map(e => <Row key={e.id} href="/personal/events" title={e.title} sub={`${date(e.date)} ${e.start_time ?? ''}`} />)}</Section>
          <div><p className="mb-2 text-[13px] font-medium text-ink">Recent activity</p>
            <ol className="space-y-3">
              {data.activity.map(a => <li key={a.id} className="text-[14px]"><p className="text-ink">{a.summary}</p><p className="text-[12.5px] text-muted">{a.user_name ?? 'System'} · {relative(a.at)}</p></li>)}
            </ol>
          </div>
        </>
      )}
    </Drawer>
  );
}

function Chat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useSession();
  const [peer, setPeer] = useState<number | null>(null);
  const [text, setText] = useState('');
  const users = useRpc(open ? 'admin.chatUsers' : null, [], [open]);
  const msgs = useRpc(open && peer ? 'admin.chatMessages' : null, [peer ?? 0], [open, peer]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open || !peer) return; const t = setInterval(() => msgs.reload(), 5000); return () => clearInterval(t); }, [open, peer, msgs]);
  useEffect(() => { end.current?.scrollIntoView(); }, [msgs.data]);
  const send = async () => { if (!text.trim() || !peer) return; await rpc('admin.sendMessage', peer, text); setText(''); msgs.reload(); };
  const peerUser = users.data?.find(u => u.id === peer);
  return (
    <Drawer open={open} onClose={onClose} title={peerUser ? peerUser.name : 'Team chat'} subtitle={peerUser ? <button className="text-brand hover:underline" onClick={() => setPeer(null)}>All people</button> : 'Message your colleagues'} width="max-w-md">
      {!peer ? (
        <div className="divide-y divide-rule">
          {users.data?.map(u => (
            <button key={u.id} onClick={() => setPeer(u.id)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-ink-2">{u.name.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('')}</span>
              <span className="flex-1"><span className="block text-[14px] text-ink">{u.name}</span><span className="block text-[12.5px] text-muted">{u.last_active ? `Active ${relative(u.last_active)}` : 'Has not signed in yet'}</span></span>
              {u.unread > 0 && <span className="rounded-full bg-bad px-1.5 text-[11px] font-semibold text-white">{u.unread}</span>}
            </button>
          ))}
          {users.data?.length === 0 && <p className="py-10 text-center text-[14px] text-muted">No other users yet. Add people under Users &amp; roles.</p>}
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-2 pb-3">
            {msgs.data?.map(m => (
              <div key={m.id} className={cx('flex', m.from_user === me.id ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[80%] rounded-lg px-3 py-2 text-[14px]', m.from_user === me.id ? 'bg-primary text-on-primary' : 'bg-surface-3 text-ink')}>
                  <p className="whitespace-pre-wrap">{m.body}</p><p className="mt-0.5 text-[11px] opacity-70">{dateTime(m.at)}</p>
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t border-line bg-surface pt-3">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void send(); }} placeholder="Write a message" aria-label="Message" className="h-9 flex-1 rounded-md border border-line-strong bg-surface px-3 text-[14px] outline-none focus:border-brand" />
            <button onClick={send} className="inline-flex size-9 items-center justify-center rounded-md bg-primary text-on-primary" aria-label="Send"><Send className="size-4" /></button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

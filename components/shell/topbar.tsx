'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CornerDownLeft, FileText, LayoutGrid, LogOut, Menu, MessageCircle, Moon, Package, Search, Send, Sun, User, Users, Hash, Receipt } from 'lucide-react';
import { NAV, QUICK_ACTIONS } from '@/lib/nav';
import { rpc, useRpc } from '@/lib/client/rpc';
import { date, dateTime, KIND_LABEL, money, relative } from '@/lib/format';
import { cx, Kbd } from '@/components/ui/primitives';
import { Drawer, Modal } from '@/components/ui/overlay';
import { NavIcon } from './icons';
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
      <div className={cx('absolute right-0 top-full z-50 mt-2 rounded-xl border border-line bg-surface shadow-pop anim-pop', className)}>{children}</div>
    </>
  );
}

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

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
      if (e.key === 'F2' && can('sales', 'write')) { e.preventDefault(); router.push('/doc/sale/new'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [router, can]);
  useEffect(() => {
    const poll = () => rpc('admin.unreadCount').then(setUnread).catch(() => {});
    poll();
    const t = setInterval(poll, 20000);
    return () => clearInterval(t);
  }, []);

  const logout = async () => { await fetch('/api/auth', { method: 'DELETE' }); window.location.href = '/login'; };

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur sm:px-5">
      <button onClick={onMenu} className="rounded-lg p-2 text-muted hover:bg-surface-3 lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
      <button onClick={() => setPalette(true)} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted transition hover:border-line-strong sm:max-w-md">
        <Search className="size-4 shrink-0" /><span className="flex-1 truncate text-left"><span className="sm:hidden">Search…</span><span className="hidden sm:inline">Search invoices, products, serials, customers…</span></span><span className="hidden sm:flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <div className="relative">
          <button onClick={() => setQuick(o => !o)} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-brand-ink hover:bg-brand-2" aria-label="Quick actions">
            <LayoutGrid className="size-4" /><span className="hidden sm:inline">Quick</span>
          </button>
          <Popover open={quick} onClose={() => setQuick(false)} className="w-[340px] p-2">
            <div className="grid grid-cols-3 gap-1">
              {QUICK_ACTIONS.filter(a => can(a.module, 'read')).map(a => (
                <Link key={a.href} href={a.href} onClick={() => setQuick(false)} className="flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-center text-xs font-medium text-ink-2 hover:bg-surface-3">
                  <span className="rounded-lg bg-brand-soft p-2 text-brand"><NavIcon name={a.icon} className="size-4" /></span>{a.label}
                </Link>
              ))}
            </div>
            <p className="mt-1 border-t border-line px-2 pt-2 text-[11px] text-muted">Tip: press <Kbd>F2</Kbd> anywhere to start a new sale.</p>
          </Popover>
        </div>
        <button onClick={() => setNotif(true)} className="rounded-lg p-2 text-muted hover:bg-surface-3 hover:text-ink" aria-label="Notifications"><Bell className="size-5" /></button>
        <button onClick={() => setChat(true)} className="relative rounded-lg p-2 text-muted hover:bg-surface-3 hover:text-ink" aria-label="Team chat">
          <MessageCircle className="size-5" />{unread > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-bad text-[10px] font-bold text-white">{unread}</span>}
        </button>
        <button onClick={toggle} className="hidden rounded-lg p-2 sm:block text-muted hover:bg-surface-3 hover:text-ink" aria-label="Toggle theme">{dark ? <Sun className="size-5" /> : <Moon className="size-5" />}</button>
        <div className="relative">
          <button onClick={() => setMenu(o => !o)} className="ml-1 flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-3">
            {me.image ? <img src={me.image} alt="" className="size-8 rounded-full object-cover" /> : <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{me.name?.slice(0, 1)}</span>}
            <span className="hidden text-left md:block"><span className="block text-[13px] font-medium leading-tight">{me.name}</span><span className="block text-[11px] leading-tight text-muted">{me.role}</span></span>
          </button>
          <Popover open={menu} onClose={() => setMenu(false)} className="w-56 p-1.5">
            <div className="border-b border-line px-2.5 py-2 text-xs text-muted">{me.email}<br />{me.branch}</div>
            <Link href="/profile" onClick={() => setMenu(false)} className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-3"><User className="size-4" /> Profile & password</Link>
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-bad hover:bg-bad-soft"><LogOut className="size-4" /> Sign out</button>
          </Popover>
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Notifications open={notif} onClose={() => setNotif(false)} />
      <Chat open={chat} onClose={() => { setChat(false); rpc('admin.unreadCount').then(setUnread).catch(() => {}); }} />
    </header>
  );
}

type Hit = { key: string; label: string; hint?: string; href: string; icon: React.ReactNode; section: string };

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
      out.push(...res.docs.map(d => ({ key: `d${d.id}`, label: d.no, hint: `${KIND_LABEL[d.kind] ?? d.kind} · ${date(d.date)} · ${d.party ?? ''} · ${money(d.total)}`, href: `/doc/${d.kind}/${d.id}`, icon: <FileText className="size-4" />, section: 'Documents' })));
      out.push(...res.vouchers.map(v => ({ key: `v${v.id}`, label: v.no, hint: `${KIND_LABEL[v.type] ?? v.type} · ${date(v.date)} · ${money(v.total)}`, href: `/vouchers/${v.type}/${v.id}`, icon: <Receipt className="size-4" />, section: 'Vouchers' })));
      out.push(...res.products.map(p => ({ key: `p${p.id}`, label: p.name, hint: `${p.code} · ${money(p.price)} · stock ${p.stock}`, href: `/data/product?view=${p.id}`, icon: <Package className="size-4" />, section: 'Products' })));
      out.push(...res.serials.map(s => ({ key: `s${s.id}`, label: s.serial, hint: `${s.product} · ${s.status}${s.sale_no ? ` · sold on ${s.sale_no}` : ''}`, href: s.sale_doc_id ? `/doc/sale/${s.sale_doc_id}` : s.purchase_doc_id ? `/doc/purchase/${s.purchase_doc_id}` : `/data/product?view=${s.product_id}`, icon: <Hash className="size-4" />, section: 'Serials' })));
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
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder="Invoice no, product code, serial / IMEI, customer, page…" className="h-14 w-full bg-transparent text-[15px] outline-none" />
          <Kbd>Esc</Kbd>
        </div>
        <div className="thin-scroll max-h-[60vh] overflow-y-auto p-2">
          {hits.map((h, i) => {
            const head = h.section !== last ? (last = h.section) : null;
            return (
              <div key={h.key}>
                {head && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{head}</p>}
                <button onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left', i === active ? 'bg-brand-soft' : '')}>
                  <span className="text-muted">{h.icon}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{h.label}</span>{h.hint && <span className="block truncate text-xs text-muted">{h.hint}</span>}</span>
                  {i === active && <CornerDownLeft className="size-4 text-muted" />}
                </button>
              </div>
            );
          })}
          {q.trim().length >= 2 && res && hits.length === 0 && <p className="py-10 text-center text-sm text-muted">No results for “{q}”</p>}
        </div>
      </div>
    </Modal>
  );
}
const rpcSearch = (q: string) => rpc('admin.globalSearch', q);

function Notifications({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useRpc(open ? 'admin.notifications' : null, [], [open]);
  const Section = ({ title, children, count }: { title: string; children: React.ReactNode; count: number }) => count ? (
    <div className="mb-5"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title} <span className="ml-1 rounded bg-surface-3 px-1">{count}</span></p><div className="space-y-1.5">{children}</div></div>
  ) : null;
  const Row = ({ href, title, sub }: { href: string; title: React.ReactNode; sub?: React.ReactNode }) => (
    <Link href={href} onClick={onClose} className="block rounded-lg border border-line px-3 py-2 text-sm hover:border-brand/40 hover:bg-surface-2"><span className="font-medium">{title}</span>{sub && <span className="block text-xs text-muted">{sub}</span>}</Link>
  );
  return (
    <Drawer open={open} onClose={onClose} title="Notifications" width="max-w-md">
      {!data ? <p className="text-sm text-muted">Loading…</p> : (
        <>
          <Section title="Cheques due" count={data.cheques.length}>{data.cheques.map(c => <Row key={c.id} href="/accounts/cheques" title={`${c.direction === 'in' ? 'Receive' : 'Pay'} cheque ${c.cheque_no} · ${money(c.amount)}`} sub={`${date(c.cheque_date)} · ${c.party ?? ''}`} />)}</Section>
          <Section title="Follow-ups due" count={data.followups.length}>{data.followups.map(f => <Row key={f.id} href={`/enquiry?open=${f.id}`} title={`${f.customer_name} — ${f.product_name ?? ''}`} sub={`Follow up ${date(f.next_followup)} · ${f.no}`} />)}</Section>
          <Section title="Low stock" count={data.lowStock.length}>{data.lowStock.map(p => <Row key={p.id} href={`/data/product?view=${p.id}`} title={p.name} sub={`${p.code} · stock ${p.stock} / min ${p.min_stock}`} />)}</Section>
          <Section title="Pending leave" count={data.leaves.length}>{data.leaves.map(l => <Row key={l.id} href="/data/leave_app" title={l.name} sub={`${date(l.from_date)} → ${date(l.to_date)}`} />)}</Section>
          <Section title="Your todos" count={data.todos.length}>{data.todos.map(t => <Row key={t.id} href="/personal/todo" title={t.title} sub={`Due ${date(t.due)}`} />)}</Section>
          <Section title="Upcoming events" count={data.events.length}>{data.events.map(e => <Row key={e.id} href="/personal/events" title={e.title} sub={`${date(e.date)} ${e.start_time ?? ''}`} />)}</Section>
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Recent activity</p>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {data.activity.map(a => <li key={a.id} className="text-sm"><span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-surface bg-brand" /><p className="text-ink">{a.summary}</p><p className="text-xs text-muted">{a.user_name ?? 'System'} · {relative(a.at)}</p></li>)}
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
    <Drawer open={open} onClose={onClose} title={peerUser ? peerUser.name : 'Team chat'} subtitle={peerUser ? <button className="text-brand" onClick={() => setPeer(null)}>← All people</button> : 'Message your colleagues'} width="max-w-md">
      {!peer ? (
        <div className="space-y-1">
          {users.data?.map(u => (
            <button key={u.id} onClick={() => setPeer(u.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand">{u.name.slice(0, 1)}</span>
              <span className="flex-1"><span className="block text-sm font-medium">{u.name}</span><span className="block text-xs text-muted">{u.last_active ? `Active ${relative(u.last_active)}` : 'Never signed in'}</span></span>
              {u.unread > 0 && <span className="rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">{u.unread}</span>}
            </button>
          ))}
          {users.data?.length === 0 && <p className="py-10 text-center text-sm text-muted">No other users yet. Add users under Users & Roles.</p>}
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-2 pb-3">
            {msgs.data?.map(m => (
              <div key={m.id} className={cx('flex', m.from_user === me.id ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[80%] rounded-2xl px-3 py-2 text-sm', m.from_user === me.id ? 'bg-brand text-brand-ink' : 'bg-surface-3')}>
                  <p className="whitespace-pre-wrap">{m.body}</p><p className="mt-0.5 text-[10px] opacity-70">{dateTime(m.at)}</p>
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t border-line bg-surface pt-3">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void send(); }} placeholder="Type a message" className="h-10 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-brand" />
            <button onClick={send} className="rounded-lg bg-brand px-3 text-brand-ink" aria-label="Send"><Send className="size-4" /></button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
